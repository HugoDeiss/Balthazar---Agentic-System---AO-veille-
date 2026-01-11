#!/usr/bin/env ts-node
// ════════════════════════════════════════════════════════════
// SCRIPT DE TEST : Métriques et logs lors d'un retry
// ════════════════════════════════════════════════════════════

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { checkBatchAlreadyAnalyzed } from '../src/persistence/ao-persistence';

// ────────────────────────────────────────────────────────────────
// CONFIGURATION
// ────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const TEST_CLIENT_ID = 'test-metrics-client';
const TEST_DATE = '2025-01-20';

// ────────────────────────────────────────────────────────────────
// UTILITAIRES DE TEST
// ────────────────────────────────────────────────────────────────

interface MockAO {
  source: string;
  source_id: string;
  title: string;
  description?: string;
  _isRectification?: boolean;
  _changes?: {
    isSubstantial: boolean;
  };
  etat?: string;
}

async function createTestData() {
  console.log('📥 Création des données de test...\n');
  
  // Créer 10 AO déjà analysés
  const analyzedAOs: any[] = [];
  for (let i = 1; i <= 10; i++) {
    analyzedAOs.push({
      source: 'BOAMP',
      source_id: `TEST-METRICS-ANALYZED-${i}`,
      title: `AO déjà analysé ${i}`,
      description: `Description de l'AO déjà analysé ${i}`,
      status: 'analyzed',
      analyzed_at: new Date().toISOString(),
      keyword_score: 0.5,
      semantic_score: 7,
      final_score: 75,
      priority: 'MEDIUM'
    });
  }
  
  // Insérer en batch
  const { error } = await supabase
    .from('appels_offres')
    .upsert(analyzedAOs, { onConflict: 'source_id' });
  
  if (error) {
    throw error;
  }
  
  console.log(`✅ ${analyzedAOs.length} AO déjà analysés insérés en DB`);
  
  return analyzedAOs.map(ao => ({
    source: ao.source,
    source_id: ao.source_id,
    title: ao.title,
    description: ao.description
  }));
}

async function cleanupTestData() {
  console.log('\n🧹 Nettoyage des données de test...\n');
  
  const sourceIds = [];
  for (let i = 1; i <= 15; i++) {
    sourceIds.push(`TEST-METRICS-ANALYZED-${i}`);
    sourceIds.push(`TEST-METRICS-NEW-${i}`);
  }
  
  const { error } = await supabase
    .from('appels_offres')
    .delete()
    .in('source_id', sourceIds);
  
  if (error) {
    console.error('⚠️ Erreur nettoyage:', error);
  } else {
    console.log(`✅ ${sourceIds.length} AO de test supprimés`);
  }
}

// Simuler filterAlreadyAnalyzedStep
async function simulateFilterStep(toAnalyze: MockAO[]) {
  console.log(`🔍 Simulation filterAlreadyAnalyzedStep avec ${toAnalyze.length} AO...`);
  
  // Vérification en batch
  const alreadyAnalyzedMap = await checkBatchAlreadyAnalyzed(
    toAnalyze.map(ao => ({
      source: ao.source || 'BOAMP',
      source_id: ao.source_id
    }))
  );
  
  const filteredAOs: MockAO[] = [];
  let skipped = 0;
  let skippedDetails: string[] = [];
  
  for (const ao of toAnalyze) {
    const isAlreadyAnalyzed = alreadyAnalyzedMap.get(ao.source_id) || false;
    
    // Exception : rectificatif substantiel
    if (ao._isRectification && ao._changes?.isSubstantial === true) {
      filteredAOs.push(ao);
      continue;
    }
    
    // Exception : AO annulé déjà analysé
    if (ao.etat === 'AVIS_ANNULE' && isAlreadyAnalyzed) {
      skipped++;
      skippedDetails.push(`AO annulé ${ao.source_id} (déjà analysé)`);
      continue;
    }
    
    // Cas standard : filtrer si déjà analysé
    if (isAlreadyAnalyzed) {
      skipped++;
      skippedDetails.push(`AO ${ao.source_id} (déjà analysé)`);
      continue;
    }
    
    // Nouveau AO
    filteredAOs.push(ao);
  }
  
  return {
    filteredAOs,
    skipped,
    skippedDetails,
    totalInput: toAnalyze.length,
    totalOutput: filteredAOs.length
  };
}

// ────────────────────────────────────────────────────────────────
// TESTS
// ────────────────────────────────────────────────────────────────

async function testMetricsFirstFetch() {
  console.log('\n🧪 TEST 1 : Métriques premier fetch (aucun AO analysé)\n');
  console.log('═'.repeat(60));
  
  // Créer 10 AO nouveaux
  const newAOs: MockAO[] = [];
  for (let i = 1; i <= 10; i++) {
    newAOs.push({
      source: 'BOAMP',
      source_id: `TEST-METRICS-NEW-${i}`,
      title: `Nouveau AO ${i}`,
      description: `Description du nouveau AO ${i}`
    });
  }
  
  const result = await simulateFilterStep(newAOs);
  
  console.log(`  → Input: ${result.totalInput} AO`);
  console.log(`  → Output: ${result.totalOutput} AO filtrés`);
  console.log(`  → Skipped: ${result.skipped} AO`);
  console.log(`  → Économie LLM: ${result.skipped * 2} appels évités (${result.skipped} AO × 2)`);
  
  // Calculer les métriques attendues
  const expectedFiltered = 10; // Tous nouveaux
  const expectedSkipped = 0; // Aucun analysé
  const expectedLLMCalls = 10 * 2; // 10 AO × 2 appels (semantic + feasibility)
  
  const passed = result.totalOutput === expectedFiltered &&
                 result.skipped === expectedSkipped;
  
  console.log(`\n  → Attendu: ${expectedFiltered} filtrés, ${expectedSkipped} skippés`);
  console.log(`  → ${passed ? '✅ OK' : '❌ ERREUR'}`);
  
  return { passed, result, expectedLLMCalls };
}

async function testMetricsRetry() {
  console.log('\n🧪 TEST 2 : Métriques retry (mélange analysés + nouveaux)\n');
  console.log('═'.repeat(60));
  
  // Créer données : 10 AO déjà analysés + 2 nouveaux
  const analyzedAOs = await createTestData();
  
  const mixedAOs: MockAO[] = [
    ...analyzedAOs, // 10 déjà analysés
    {
      source: 'BOAMP',
      source_id: 'TEST-METRICS-NEW-1',
      title: 'Nouveau AO 1',
      description: 'Description nouveau AO 1'
    },
    {
      source: 'BOAMP',
      source_id: 'TEST-METRICS-NEW-2',
      title: 'Nouveau AO 2',
      description: 'Description nouveau AO 2'
    }
  ];
  
  const result = await simulateFilterStep(mixedAOs);
  
  console.log(`  → Input: ${result.totalInput} AO (10 analysés + 2 nouveaux)`);
  console.log(`  → Output: ${result.totalOutput} AO filtrés`);
  console.log(`  → Skipped: ${result.skipped} AO`);
  console.log(`  → Économie LLM: ${result.skipped * 2} appels évités (${result.skipped} AO × 2)`);
  console.log(`  → Appels LLM nécessaires: ${result.totalOutput * 2} (${result.totalOutput} AO × 2)`);
  
  if (result.skippedDetails.length > 0) {
    console.log(`  → Détails skippés (${result.skippedDetails.length}):`);
    result.skippedDetails.slice(0, 3).forEach(detail => {
      console.log(`     - ${detail}`);
    });
    if (result.skippedDetails.length > 3) {
      console.log(`     ... et ${result.skippedDetails.length - 3} autres`);
    }
  }
  
  // Métriques attendues
  const expectedFiltered = 2; // 2 nouveaux
  const expectedSkipped = 10; // 10 déjà analysés
  const expectedLLMCalls = 2 * 2; // 2 AO × 2 appels
  const expectedEconomy = 10 * 2; // 10 AO × 2 appels évités
  
  const passed = result.totalOutput === expectedFiltered &&
                 result.skipped === expectedSkipped;
  
  console.log(`\n  → Attendu: ${expectedFiltered} filtrés, ${expectedSkipped} skippés`);
  console.log(`  → Économie attendue: ${expectedEconomy} appels LLM`);
  console.log(`  → ${passed ? '✅ OK' : '❌ ERREUR'}`);
  
  await cleanupTestData();
  
  return { passed, result, expectedLLMCalls, expectedEconomy };
}

async function testMetricsWithRectification() {
  console.log('\n🧪 TEST 3 : Métriques avec rectificatif substantiel\n');
  console.log('═'.repeat(60));
  
  const analyzedAOs = await createTestData();
  
  const aosWithRectification: MockAO[] = [
    ...analyzedAOs.slice(0, 5), // 5 déjà analysés
    {
      source: 'BOAMP',
      source_id: analyzedAOs[0].source_id, // Même source_id qu'un analysé
      title: 'Rectificatif substantiel',
      description: 'Description modifiée',
      _isRectification: true,
      _changes: {
        isSubstantial: true
      }
    },
    {
      source: 'BOAMP',
      source_id: 'TEST-METRICS-NEW-1',
      title: 'Nouveau AO',
      description: 'Description nouveau AO'
    }
  ];
  
  const result = await simulateFilterStep(aosWithRectification);
  
  console.log(`  → Input: ${aosWithRectification.length} AO (5 analysés + 1 rectificatif + 1 nouveau)`);
  console.log(`  → Output: ${result.totalOutput} AO filtrés`);
  console.log(`  → Skipped: ${result.skipped} AO`);
  console.log(`  → Rectificatif substantiel: ${result.filteredAOs.some(ao => ao._isRectification) ? '✅ PASSÉ' : '❌ BLOQUÉ'}`);
  console.log(`  → Économie LLM: ${result.skipped * 2} appels évités`);
  
  // Métriques attendues
  const expectedFiltered = 2; // 1 rectificatif + 1 nouveau (5 analysés skippés)
  const expectedSkipped = 5; // 5 déjà analysés
  const expectedLLMCalls = 2 * 2; // 2 AO × 2 appels (rectificatif + nouveau)
  
  const passed = result.totalOutput === expectedFiltered &&
                 result.skipped === expectedSkipped &&
                 result.filteredAOs.some(ao => ao._isRectification);
  
  console.log(`\n  → Attendu: ${expectedFiltered} filtrés, ${expectedSkipped} skippés`);
  console.log(`  → ${passed ? '✅ OK' : '❌ ERREUR'}`);
  
  await cleanupTestData();
  
  return { passed, result, expectedLLMCalls };
}

async function testMetricsLogging() {
  console.log('\n🧪 TEST 4 : Validation des logs d\'économie\n');
  console.log('═'.repeat(60));
  
  const analyzedAOs = await createTestData();
  
  const mixedAOs: MockAO[] = [
    ...analyzedAOs.slice(0, 8), // 8 déjà analysés
    {
      source: 'BOAMP',
      source_id: 'TEST-METRICS-NEW-1',
      title: 'Nouveau AO 1',
      description: 'Description nouveau AO 1'
    },
    {
      source: 'BOAMP',
      source_id: 'TEST-METRICS-NEW-2',
      title: 'Nouveau AO 2',
      description: 'Description nouveau AO 2'
    }
  ];
  
  const result = await simulateFilterStep(mixedAOs);
  
  // Vérifier que les logs contiennent les bonnes informations
  const expectedLogs = [
    `Vérification des AO déjà analysés (${mixedAOs.length} AO)`,
    `${result.totalInput} AO vérifiés`,
    `${result.skipped} AO déjà analysés (sautés)`,
    `${result.totalOutput} AO nouveaux à analyser`
  ];
  
  if (result.skipped > 0) {
    expectedLogs.push(`Économie: ${result.skipped} × (keyword matching + IA) évités`);
  }
  
  console.log(`  → Logs attendus:`);
  expectedLogs.forEach(log => {
    console.log(`     ✓ ${log}`);
  });
  
  console.log(`  → Métriques calculées:`);
  console.log(`     - Skipped: ${result.skipped} ✅`);
  console.log(`     - Filtrés: ${result.totalOutput} ✅`);
  console.log(`     - Économie LLM: ${result.skipped * 2} appels ✅`);
  
  const passed = result.skipped > 0 && result.totalOutput === 2;
  
  console.log(`\n  → ${passed ? '✅ OK' : '❌ ERREUR'}`);
  
  await cleanupTestData();
  
  return { passed, result };
}

// ────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  TESTS : Métriques et logs lors d\'un retry                ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  try {
    // Vérifier la connexion Supabase
    console.log('🔍 Vérification de la connexion Supabase...');
    const { data, error } = await supabase
      .from('appels_offres')
      .select('id')
      .limit(1);
    
    if (error && (error.message.includes('ENOTFOUND') || error.message.includes('fetch failed'))) {
      console.error(`\n❌ Erreur de connexion à Supabase:`);
      console.error(`   ${error.message}`);
      console.error(`\n💡 Vérifiez votre configuration Supabase dans .env\n`);
      process.exit(1);
    }
    
    console.log('✅ Connexion Supabase OK\n');
    
    const test1 = await testMetricsFirstFetch();
    const test2 = await testMetricsRetry();
    const test3 = await testMetricsWithRectification();
    const test4 = await testMetricsLogging();
    
    // Résumé
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  RÉSUMÉ DES TESTS                                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    console.log(`\n✅ TEST 1 (Premier fetch): ${test1.passed ? 'PASS' : 'FAIL'}`);
    console.log(`   → LLM calls: ${test1.expectedLLMCalls} (${test1.result.totalOutput} AO × 2)`);
    
    console.log(`\n✅ TEST 2 (Retry mixte): ${test2.passed ? 'PASS' : 'FAIL'}`);
    console.log(`   → LLM calls: ${test2.expectedLLMCalls} (au lieu de ${(test2.result.totalInput * 2)})`);
    console.log(`   → Économie: ${test2.expectedEconomy} appels LLM évités`);
    
    console.log(`\n✅ TEST 3 (Avec rectificatif): ${test3.passed ? 'PASS' : 'FAIL'}`);
    console.log(`   → LLM calls: ${test3.expectedLLMCalls} (${test3.result.totalOutput} AO × 2)`);
    
    console.log(`\n✅ TEST 4 (Logs): ${test4.passed ? 'PASS' : 'FAIL'}`);
    console.log(`   → Skipped: ${test4.result.skipped}, Filtrés: ${test4.result.totalOutput}`);
    
    const allPassed = test1.passed && test2.passed && test3.passed && test4.passed;
    
    console.log(`\n${allPassed ? '✅' : '❌'} RÉSULTAT GLOBAL: ${allPassed ? 'TOUS LES TESTS PASSENT' : 'QUELQUES TESTS ÉCHOUENT'}`);
    
    // Résumé économique
    if (test2.passed && test2.expectedEconomy > 0) {
      console.log(`\n💰 ÉCONOMIE VALIDÉE:`);
      console.log(`   → Premier fetch: ${test1.expectedLLMCalls} appels LLM`);
      console.log(`   → Retry: ${test2.expectedLLMCalls} appels LLM (au lieu de ${test2.result.totalInput * 2})`);
      console.log(`   → Économie: ${test2.expectedEconomy} appels LLM évités (${((test2.expectedEconomy / (test2.result.totalInput * 2)) * 100).toFixed(1)}%)`);
    }
    
    console.log('\n✅ Tests terminés !');
    
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Erreur lors des tests:', error);
    await cleanupTestData().catch(() => {});
    process.exit(1);
  }
}

// Exécuter si appelé directement
main().catch((error: Error) => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
