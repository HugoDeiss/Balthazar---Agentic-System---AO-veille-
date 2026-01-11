#!/usr/bin/env ts-node
// ════════════════════════════════════════════════════════════════
// SCRIPT DE TEST : Test performance batch avec grand volume
// ════════════════════════════════════════════════════════════════

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

// ────────────────────────────────────────────────────────────────
// FONCTIONS DE TEST
// ────────────────────────────────────────────────────────────────

async function generateTestAOs(count: number, prefix: string, analyzed: boolean = true): Promise<Array<{ source: string; source_id: string }>> {
  const aos: Array<{ source: string; source_id: string }> = [];
  
  for (let i = 1; i <= count; i++) {
    const sourceId = `${prefix}-${String(i).padStart(3, '0')}`;
    aos.push({ source: 'BOAMP', source_id: sourceId });
    
    if (analyzed) {
      // Insérer en DB
      await supabase
        .from('appels_offres')
        .upsert({
          source: 'BOAMP',
          source_id: sourceId,
          title: `AO test ${i}`,
          description: `Test ${i}`,
          keywords: ['test'],
          publication_date: '2025-01-20',
          type_marche: 'SERVICES',
          region: 'Île-de-France',
          client_id: 'balthazar',
          status: 'analyzed',
          analyzed_at: new Date().toISOString(),
          semantic_score: 7,
          final_score: 75,
          priority: 'MEDIUM'
        }, { onConflict: 'source_id' });
    }
  }
  
  return aos;
}

async function cleanupTestAOs(sourceIds: string[]): Promise<void> {
  if (sourceIds.length === 0) return;
  
  // Nettoyer par batches de 100 (limite Supabase)
  const batchSize = 100;
  for (let i = 0; i < sourceIds.length; i += batchSize) {
    const batch = sourceIds.slice(i, i + batchSize);
    await supabase
      .from('appels_offres')
      .delete()
      .in('source_id', batch);
  }
}

async function testPerformance(count: number, description: string): Promise<{ passed: boolean; duration: number }> {
  console.log(`\n🧪 TEST : ${description} (${count} AO)\n`);
  console.log('═'.repeat(60));
  
  const testPrefix = `TEST-PERF-${count}`;
  
  try {
    // Générer les AO analysés
    console.log(`📥 Insertion de ${count} AO analysés en DB...`);
    const startInsert = Date.now();
    const analyzedAOs = await generateTestAOs(count, testPrefix, true);
    const insertDuration = Date.now() - startInsert;
    console.log(`  → Insertion terminée en ${insertDuration}ms`);
    
    // Tester la vérification batch
    console.log(`\n🔍 Vérification batch de ${count} AO...`);
    const startCheck = Date.now();
    const result = await checkBatchAlreadyAnalyzed(analyzedAOs);
    const checkDuration = Date.now() - startCheck;
    
    // Vérifier que tous sont identifiés comme analysés
    const allAnalyzed = analyzedAOs.every(ao => result.get(ao.source_id) === true);
    const analyzedCount = analyzedAOs.filter(ao => result.get(ao.source_id)).length;
    
    console.log(`  → Temps d'exécution: ${checkDuration}ms`);
    console.log(`  → AO identifiés comme analysés: ${analyzedCount}/${count}`);
    console.log(`  → Tous analysés: ${allAnalyzed ? '✅ OUI' : '❌ NON'}`);
    console.log(`  → Performance: ${checkDuration < 1000 ? '✅ OK (< 1s)' : checkDuration < 5000 ? '⚠️ Acceptable (< 5s)' : '❌ LENT (> 5s)'}`);
    
    // Nettoyage
    console.log(`\n🧹 Nettoyage...`);
    await cleanupTestAOs(analyzedAOs.map(ao => ao.source_id));
    
    const passed = allAnalyzed && checkDuration < 10000; // Acceptable si < 10s pour grand volume
    
    return { passed, duration: checkDuration };
    
  } catch (error) {
    console.error(`  → ❌ Erreur: ${(error as Error).message}`);
    
    // Nettoyage en cas d'erreur
    try {
      const sourceIds = Array.from({ length: count }, (_, i) => `${testPrefix}-${String(i + 1).padStart(3, '0')}`);
      await cleanupTestAOs(sourceIds);
    } catch (cleanupError) {
      console.error(`  → ⚠️ Erreur nettoyage: ${(cleanupError as Error).message}`);
    }
    
    return { passed: false, duration: 0 };
  }
}

async function testMixedPerformance(count: number): Promise<{ passed: boolean; duration: number }> {
  console.log(`\n🧪 TEST : Performance mixte (${count} AO analysés + ${count} nouveaux)\n`);
  console.log('═'.repeat(60));
  
  const testPrefix = `TEST-PERF-MIX-${count}`;
  
  try {
    // Générer les AO analysés
    console.log(`📥 Insertion de ${count} AO analysés en DB...`);
    const analyzedAOs = await generateTestAOs(count, `${testPrefix}-A`, true);
    
    // Générer les AO nouveaux (non insérés)
    console.log(`📥 Création de ${count} AO nouveaux (non insérés)...`);
    const newAOs = await generateTestAOs(count, `${testPrefix}-N`, false);
    
    // Tester la vérification batch mixte
    const mixedAOs = [...analyzedAOs, ...newAOs];
    console.log(`\n🔍 Vérification batch de ${mixedAOs.length} AO (${count} analysés + ${count} nouveaux)...`);
    const startCheck = Date.now();
    const result = await checkBatchAlreadyAnalyzed(mixedAOs);
    const checkDuration = Date.now() - startCheck;
    
    // Vérifier les résultats
    const analyzedCount = analyzedAOs.filter(ao => result.get(ao.source_id) === true).length;
    const newCount = newAOs.filter(ao => result.get(ao.source_id) === false).length;
    
    const allCorrect = analyzedCount === count && newCount === count;
    
    console.log(`  → Temps d'exécution: ${checkDuration}ms`);
    console.log(`  → AO analysés identifiés: ${analyzedCount}/${count}`);
    console.log(`  → AO nouveaux identifiés: ${newCount}/${count}`);
    console.log(`  → Tous corrects: ${allCorrect ? '✅ OUI' : '❌ NON'}`);
    console.log(`  → Performance: ${checkDuration < 2000 ? '✅ OK (< 2s)' : checkDuration < 10000 ? '⚠️ Acceptable (< 10s)' : '❌ LENT (> 10s)'}`);
    
    // Nettoyage
    console.log(`\n🧹 Nettoyage...`);
    await cleanupTestAOs(analyzedAOs.map(ao => ao.source_id));
    
    const passed = allCorrect && checkDuration < 15000; // Acceptable si < 15s pour grand volume
    
    return { passed, duration: checkDuration };
    
  } catch (error) {
    console.error(`  → ❌ Erreur: ${(error as Error).message}`);
    
    // Nettoyage en cas d'erreur
    try {
      const sourceIds = [
        ...Array.from({ length: count }, (_, i) => `${testPrefix}-A-${String(i + 1).padStart(3, '0')}`),
        ...Array.from({ length: count }, (_, i) => `${testPrefix}-N-${String(i + 1).padStart(3, '0')}`)
      ];
      await cleanupTestAOs(sourceIds);
    } catch (cleanupError) {
      console.error(`  → ⚠️ Erreur nettoyage: ${(cleanupError as Error).message}`);
    }
    
    return { passed: false, duration: 0 };
  }
}

// ────────────────────────────────────────────────────────────────
// EXÉCUTION
// ────────────────────────────────────────────────────────────────

async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('appels_offres')
      .select('id')
      .limit(1);
    
    if (error && (error.message.includes('ENOTFOUND') || error.message.includes('fetch failed'))) {
      console.error(`\n❌ Erreur de connexion à Supabase:`);
      console.error(`   ${error.message}`);
      console.error(`\n💡 Solutions possibles:`);
      console.error(`   1. Vérifier que le projet Supabase existe dans votre dashboard`);
      console.error(`   2. Vérifier que l'URL dans .env est correcte`);
      console.error(`   3. Vérifier votre connexion internet`);
      console.error(`   4. Le projet Supabase pourrait être suspendu ou supprimé\n`);
      return false;
    }
    
    return true;
  } catch (error: any) {
    if (error.message?.includes('ENOTFOUND') || error.message?.includes('fetch failed')) {
      console.error(`\n❌ Impossible de se connecter à Supabase`);
      console.error(`   Erreur DNS: ${error.message}`);
      console.error(`\n💡 Vérifiez que le projet Supabase existe et que l'URL dans .env est correcte.\n`);
      return false;
    }
    throw error;
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  TESTS : Performance batch avec grand volume             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  try {
    // Vérifier les variables d'environnement
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      console.error('\n❌ Variables d\'environnement manquantes:');
      console.error('  - SUPABASE_URL');
      console.error('  - SUPABASE_SERVICE_KEY');
      process.exit(1);
    }
    
    // Vérifier la connexion Supabase
    console.log('🔍 Vérification de la connexion Supabase...');
    const isConnected = await checkSupabaseConnection();
    if (!isConnected) {
      process.exit(1);
    }
    console.log('✅ Connexion Supabase OK\n');
    
    console.log('⚠️  ATTENTION: Ces tests créent beaucoup d\'AO en DB');
    console.log('⚠️  Le nettoyage est automatique mais peut prendre du temps\n');
    
    // Tests de performance avec différents volumes
    const test10 = await testPerformance(10, 'Petit volume');
    const test50 = await testPerformance(50, 'Volume moyen');
    const test100 = await testPerformance(100, 'Volume grand');
    
    // Test mixte
    const testMixed50 = await testMixedPerformance(50);
    
    // Tests optionnels pour volumes très grands (peuvent être activés via env var)
    const testLargeVolumes = process.env.TEST_LARGE_VOLUMES === 'true';
    let test500 = { passed: true, duration: 0 };
    let test1000 = { passed: true, duration: 0 };
    
    if (testLargeVolumes) {
      console.log('\n⚠️  Tests volumes très grands activés (peuvent prendre plusieurs minutes)...\n');
      test500 = await testPerformance(500, 'Très grand volume');
      test1000 = await testPerformance(1000, 'Volume maximal');
    }
    
    // Résumé
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  RÉSUMÉ DES TESTS                                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n✅ TEST 1 (10 AO): ${test10.passed ? 'PASS' : 'FAIL'} - ${test10.duration}ms`);
    console.log(`✅ TEST 2 (50 AO): ${test50.passed ? 'PASS' : 'FAIL'} - ${test50.duration}ms`);
    console.log(`✅ TEST 3 (100 AO): ${test100.passed ? 'PASS' : 'FAIL'} - ${test100.duration}ms`);
    console.log(`✅ TEST 4 (50+50 mixte): ${testMixed50.passed ? 'PASS' : 'FAIL'} - ${testMixed50.duration}ms`);
    if (testLargeVolumes) {
      console.log(`✅ TEST 5 (500 AO): ${test500.passed ? 'PASS' : 'FAIL'} - ${test500.duration}ms`);
      console.log(`✅ TEST 6 (1000 AO): ${test1000.passed ? 'PASS' : 'FAIL'} - ${test1000.duration}ms`);
    } else {
      console.log(`ℹ️  TEST 5-6 (500, 1000 AO): SKIPPED (définir TEST_LARGE_VOLUMES=true pour activer)`);
    }
    
    const allPassed = test10.passed && test50.passed && test100.passed && testMixed50.passed && 
                      (!testLargeVolumes || (test500.passed && test1000.passed));
    
    console.log(`\n${allPassed ? '✅' : '❌'} RÉSULTAT GLOBAL: ${allPassed ? 'TOUS LES TESTS PASSENT' : 'QUELQUES TESTS ÉCHOUENT'}`);
    
    // Vérification performance
    const avgTime = (test10.duration + test50.duration + test100.duration) / 3;
    console.log(`\n📊 Performance moyenne (10-100 AO): ${avgTime.toFixed(0)}ms`);
    console.log(`   → ${avgTime < 1000 ? '✅ Excellente (< 1s)' : avgTime < 2000 ? '✅ Bonne (< 2s)' : '⚠️ Acceptable'}`);
    
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
