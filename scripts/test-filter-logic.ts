#!/usr/bin/env ts-node
// ════════════════════════════════════════════════════════════════
// SCRIPT DE TEST : Test logique de filtrage (isolé, avec mock)
// ════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────
// DONNÉES DE TEST
// ────────────────────────────────────────────────────────────────

// Mock de la fonction checkBatchAlreadyAnalyzed
// Simule les résultats pour différents scénarios
async function mockCheckBatchAlreadyAnalyzed(
  aos: Array<{ source: string; source_id: string }>,
  analyzedIds: Set<string>
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  
  aos.forEach(ao => {
    result.set(ao.source_id, analyzedIds.has(ao.source_id));
  });
  
  return result;
}

// Simule la logique de filtrage de filterAlreadyAnalyzedStep
async function filterLogic(
  toAnalyze: any[],
  alreadyAnalyzedMap: Map<string, boolean>
): Promise<{ filtered: any[]; skipped: number }> {
  const filteredAOs: typeof toAnalyze = [];
  let skipped = 0;
  
  for (const ao of toAnalyze) {
    const isAlreadyAnalyzed = alreadyAnalyzedMap.get(ao.source_id) || false;
    
    // 1. Rectificatif substantiel → TOUJOURS re-analysé (exception)
    if (ao._isRectification && ao._changes?.isSubstantial === true) {
      filteredAOs.push(ao);
      continue;
    }
    
    // 2. AO annulé déjà analysé → skip
    if (ao.etat === 'AVIS_ANNULE' && isAlreadyAnalyzed) {
      skipped++;
      continue;
    }
    
    // 3. AO déjà analysé standard → skip
    if (isAlreadyAnalyzed) {
      skipped++;
      continue;
    }
    
    // 4. Nouveau AO → à analyser
    filteredAOs.push(ao);
  }
  
  return { filtered: filteredAOs, skipped };
}

// ────────────────────────────────────────────────────────────────
// DONNÉES DE TEST
// ────────────────────────────────────────────────────────────────

// AO déjà analysés
const AO_ALREADY_ANALYZED = [
  { source: 'BOAMP', source_id: 'TEST-LOGIC-001', title: 'AO 1 (analysé)' },
  { source: 'BOAMP', source_id: 'TEST-LOGIC-002', title: 'AO 2 (analysé)' }
];

// AO nouveaux
const AO_NEW = [
  { source: 'BOAMP', source_id: 'TEST-LOGIC-003', title: 'AO 3 (nouveau)' },
  { source: 'BOAMP', source_id: 'TEST-LOGIC-004', title: 'AO 4 (nouveau)' }
];

// Rectificatif substantiel déjà analysé (doit passer quand même)
const AO_RECTIFICATIF_SUBSTANTIEL = {
  source: 'BOAMP',
  source_id: 'TEST-LOGIC-001-RECT',
  title: 'AO 1 Rectificatif Substantiel',
  _isRectification: true,
  _changes: {
    isSubstantial: true,
    changes: [{ field: 'budget', old: 100000, new: 300000 }]
  }
};

// AO annulé déjà analysé (doit être skippé)
const AO_CANCELLED_ANALYZED = {
  source: 'BOAMP',
  source_id: 'TEST-LOGIC-002',
  title: 'AO 2 Annulé (déjà analysé)',
  etat: 'AVIS_ANNULE'
};

// ────────────────────────────────────────────────────────────────
// FONCTIONS DE TEST
// ────────────────────────────────────────────────────────────────

async function testAlreadyAnalyzedStandard() {
  console.log('🧪 TEST 1 : AO déjà analysé standard → skip\n');
  console.log('═'.repeat(60));
  
  const toAnalyze = [AO_ALREADY_ANALYZED[0]];
  const analyzedIds = new Set([AO_ALREADY_ANALYZED[0].source_id]);
  const alreadyAnalyzedMap = await mockCheckBatchAlreadyAnalyzed(toAnalyze, analyzedIds);
  
  const { filtered, skipped } = await filterLogic(toAnalyze, alreadyAnalyzedMap);
  
  const isCorrect = filtered.length === 0 && skipped === 1;
  
  console.log(`  → Input: 1 AO déjà analysé`);
  console.log(`  → Output: ${filtered.length} filtrés, ${skipped} skippés`);
  console.log(`  → Attendu: 0 filtrés, 1 skippé`);
  console.log(`  → ${isCorrect ? '✅ OK' : '❌ ERREUR'}`);
  
  return isCorrect;
}

async function testNewAO() {
  console.log('\n🧪 TEST 2 : AO nouveau → passe\n');
  console.log('═'.repeat(60));
  
  const toAnalyze = [AO_NEW[0]];
  const analyzedIds = new Set<string>(); // Aucun analysé
  const alreadyAnalyzedMap = await mockCheckBatchAlreadyAnalyzed(toAnalyze, analyzedIds);
  
  const { filtered, skipped } = await filterLogic(toAnalyze, alreadyAnalyzedMap);
  
  const isCorrect = filtered.length === 1 && skipped === 0;
  
  console.log(`  → Input: 1 AO nouveau`);
  console.log(`  → Output: ${filtered.length} filtrés, ${skipped} skippés`);
  console.log(`  → Attendu: 1 filtré, 0 skippé`);
  console.log(`  → ${isCorrect ? '✅ OK' : '❌ ERREUR'}`);
  
  return isCorrect;
}

async function testSubstantialRectification() {
  console.log('\n🧪 TEST 3 : Rectificatif substantiel déjà analysé → passe quand même (exception)\n');
  console.log('═'.repeat(60));
  
  const toAnalyze = [AO_RECTIFICATIF_SUBSTANTIEL];
  // Même si l'original est analysé, le rectificatif doit passer
  const analyzedIds = new Set([AO_RECTIFICATIF_SUBSTANTIEL.source_id]); // Simule que l'original est analysé
  const alreadyAnalyzedMap = await mockCheckBatchAlreadyAnalyzed(toAnalyze, analyzedIds);
  
  const { filtered, skipped } = await filterLogic(toAnalyze, alreadyAnalyzedMap);
  
  const isCorrect = filtered.length === 1 && skipped === 0; // Exception : doit passer même si analysé
  
  console.log(`  → Input: 1 rectificatif substantiel (original analysé)`);
  console.log(`  → Output: ${filtered.length} filtrés, ${skipped} skippés`);
  console.log(`  → Attendu: 1 filtré (exception), 0 skippé`);
  console.log(`  → ${isCorrect ? '✅ OK' : '❌ ERREUR'}`);
  
  return isCorrect;
}

async function testCancelledAlreadyAnalyzed() {
  console.log('\n🧪 TEST 4 : AO annulé déjà analysé → skip\n');
  console.log('═'.repeat(60));
  
  const toAnalyze = [AO_CANCELLED_ANALYZED];
  const analyzedIds = new Set([AO_CANCELLED_ANALYZED.source_id]);
  const alreadyAnalyzedMap = await mockCheckBatchAlreadyAnalyzed(toAnalyze, analyzedIds);
  
  const { filtered, skipped } = await filterLogic(toAnalyze, alreadyAnalyzedMap);
  
  const isCorrect = filtered.length === 0 && skipped === 1;
  
  console.log(`  → Input: 1 AO annulé (déjà analysé)`);
  console.log(`  → Output: ${filtered.length} filtrés, ${skipped} skippés`);
  console.log(`  → Attendu: 0 filtrés, 1 skippé`);
  console.log(`  → ${isCorrect ? '✅ OK' : '❌ ERREUR'}`);
  
  return isCorrect;
}

async function testMixedList() {
  console.log('\n🧪 TEST 5 : Liste mixte → filtrage correct\n');
  console.log('═'.repeat(60));
  
  const toAnalyze = [
    AO_ALREADY_ANALYZED[0], // Analysé → skip
    AO_ALREADY_ANALYZED[1], // Analysé → skip
    AO_NEW[0], // Nouveau → passe
    AO_NEW[1], // Nouveau → passe
    AO_RECTIFICATIF_SUBSTANTIEL // Rectificatif substantiel → passe (exception)
  ];
  
  const analyzedIds = new Set([
    AO_ALREADY_ANALYZED[0].source_id,
    AO_ALREADY_ANALYZED[1].source_id,
    AO_RECTIFICATIF_SUBSTANTIEL.source_id // Original analysé
  ]);
  
  const alreadyAnalyzedMap = await mockCheckBatchAlreadyAnalyzed(toAnalyze, analyzedIds);
  
  const { filtered, skipped } = await filterLogic(toAnalyze, alreadyAnalyzedMap);
  
  // Attendu : 3 filtrés (2 nouveaux + 1 rectificatif substantiel), 2 skippés (2 analysés)
  const isCorrect = filtered.length === 3 && skipped === 2;
  
  console.log(`  → Input: 5 AO (2 analysés, 2 nouveaux, 1 rectificatif substantiel)`);
  console.log(`  → Output: ${filtered.length} filtrés, ${skipped} skippés`);
  console.log(`  → Attendu: 3 filtrés (2 nouveaux + 1 rectificatif), 2 skippés`);
  console.log(`  → ${isCorrect ? '✅ OK' : '❌ ERREUR'}`);
  
  // Vérifier que les bons AO sont filtrés
  const filteredIds = new Set(filtered.map(ao => ao.source_id));
  const expectedFilteredIds = new Set([
    AO_NEW[0].source_id,
    AO_NEW[1].source_id,
    AO_RECTIFICATIF_SUBSTANTIEL.source_id
  ]);
  
  const idsMatch = 
    filteredIds.size === expectedFilteredIds.size &&
    [...filteredIds].every(id => expectedFilteredIds.has(id));
  
  if (!idsMatch) {
    console.log(`  → ❌ IDs filtrés incorrects`);
    console.log(`     Attendu: ${[...expectedFilteredIds].join(', ')}`);
    console.log(`     Obtenu: ${[...filteredIds].join(', ')}`);
    return false;
  }
  
  return isCorrect && idsMatch;
}

// ────────────────────────────────────────────────────────────────
// EXÉCUTION
// ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  TESTS : Logique de filtrage (isolé, avec mock)          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  try {
    // Tests (pas besoin de DB, logique isolée)
    const test1 = await testAlreadyAnalyzedStandard();
    const test2 = await testNewAO();
    const test3 = await testSubstantialRectification();
    const test4 = await testCancelledAlreadyAnalyzed();
    const test5 = await testMixedList();
    
    // Résumé
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  RÉSUMÉ DES TESTS                                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n✅ TEST 1 (AO analysé → skip): ${test1 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 2 (AO nouveau → passe): ${test2 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 3 (Rectificatif substantiel → exception): ${test3 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 4 (AO annulé analysé → skip): ${test4 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 5 (Liste mixte): ${test5 ? 'PASS' : 'FAIL'}`);
    
    const allPassed = test1 && test2 && test3 && test4 && test5;
    console.log(`\n${allPassed ? '✅' : '❌'} RÉSULTAT GLOBAL: ${allPassed ? 'TOUS LES TESTS PASSENT' : 'QUELQUES TESTS ÉCHOUENT'}`);
    
    console.log('\n✅ Tests terminés (logique isolée, pas de nettoyage nécessaire) !');
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Erreur lors des tests:', error);
    process.exit(1);
  }
}

// Exécuter si appelé directement
main().catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
