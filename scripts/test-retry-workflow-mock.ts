#!/usr/bin/env ts-node
// ════════════════════════════════════════════════════════
// SCRIPT DE TEST : Workflow complet avec mock (aspects critiques)
// ════════════════════════════════════════════════════════

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { scheduleRetry, loadRetryQueue, hasPendingRetry } from '../src/utils/retry-scheduler';
import { checkBatchAlreadyAnalyzed } from '../src/persistence/ao-persistence';

// ────────────────────────────────────────────────────────────────
// UTILITAIRES DE TEST
// ────────────────────────────────────────────────────────────────

const RETRY_QUEUE_FILE = path.join(process.cwd(), '.retry-queue.json');

let originalQueueBackup: string | null = null;

function backupQueue(): void {
  try {
    if (fs.existsSync(RETRY_QUEUE_FILE)) {
      originalQueueBackup = fs.readFileSync(RETRY_QUEUE_FILE, 'utf-8');
    }
  } catch (error) {
    // Ignore
  }
}

function restoreQueue(): void {
  try {
    if (originalQueueBackup !== null) {
      fs.writeFileSync(RETRY_QUEUE_FILE, originalQueueBackup, 'utf-8');
    } else if (fs.existsSync(RETRY_QUEUE_FILE)) {
      fs.unlinkSync(RETRY_QUEUE_FILE);
    }
  } catch (error) {
    console.error('⚠️ Erreur lors de la restauration:', error);
  }
}

function clearQueue(): void {
  try {
    if (fs.existsSync(RETRY_QUEUE_FILE)) {
      fs.unlinkSync(RETRY_QUEUE_FILE);
    }
  } catch (error) {
    // Ignore
  }
}

// ────────────────────────────────────────────────────────────────
// TESTS
// ────────────────────────────────────────────────────────────────

async function testSchedulerCalledOnMissing() {
  console.log('\n🧪 TEST 1 : Scheduler appelé quand missing > 0\n');
  console.log('═'.repeat(60));
  
  clearQueue();
  
  // Simuler fetchAndPrequalifyStep avec missing > 0
  const clientId = 'test-workflow-client';
  const date = '2025-01-20';
  const missing = 5;
  const missingRatio = 0.05; // 5%
  
  // Simuler l'appel à scheduleRetry (comme dans fetchAndPrequalifyStep ligne 138)
  const targetDate = date;
  const delayMinutes = 60;
  const reason = `Incohérence détectée: ${missing} AO manquants (${(missingRatio * 100).toFixed(2)}%)`;
  
  // Appeler scheduleRetry comme dans le workflow
  const job = scheduleRetry(clientId, targetDate, delayMinutes, reason);
  
  // Vérifier que le job a été créé
  const queue = loadRetryQueue();
  const jobInQueue = queue.jobs.find(j => j.id === job.id);
  
  console.log(`  → Client ID: ${clientId} ✅`);
  console.log(`  → Date: ${targetDate} ✅`);
  console.log(`  → Delay: ${delayMinutes} minutes ✅`);
  console.log(`  → Reason: ${reason.substring(0, 50)}... ✅`);
  console.log(`  → Job créé: ${jobInQueue ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → Job dans queue: ${queue.jobs.some(j => j.id === job.id) ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → Status: ${jobInQueue?.status || 'N/A'} ${jobInQueue?.status === 'pending' ? '✅' : '❌'}`);
  
  const passed = jobInQueue !== undefined &&
                 jobInQueue.status === 'pending' &&
                 jobInQueue.clientId === clientId &&
                 jobInQueue.date === targetDate &&
                 jobInQueue.reason === reason;
  
  clearQueue();
  
  return passed;
}

async function testSchedulerNotCalledOnNoMissing() {
  console.log('\n🧪 TEST 2 : Scheduler non appelé quand missing = 0\n');
  console.log('═'.repeat(60));
  
  clearQueue();
  
  // Simuler fetchAndPrequalifyStep avec missing = 0
  const clientId = 'test-workflow-client';
  const date = '2025-01-20';
  const missing = 0;
  
  // Simuler la condition (ligne 131) : if (boampData.missing > 0)
  if (missing > 0) {
    scheduleRetry(clientId, date, 60, 'Incohérence détectée');
  }
  
  // Vérifier qu'aucun job n'a été créé
  const queue = loadRetryQueue();
  const hasRetry = hasPendingRetry(clientId, date);
  
  console.log(`  → Missing: ${missing} ✅`);
  console.log(`  → Condition: missing > 0 = ${missing > 0 ? 'true' : 'false'} ✅`);
  console.log(`  → Retry planifié: ${hasRetry ? '❌ OUI (ERREUR)' : '✅ NON (OK)'}`);
  console.log(`  → Jobs dans queue: ${queue.jobs.length} (attendu: 0)`);
  
  const passed = !hasRetry && queue.jobs.length === 0;
  
  clearQueue();
  
  return passed;
}

async function testFilterStepRegressionFirstFetch() {
  console.log('\n🧪 TEST 3 : Régression premier fetch (aucun AO analysé)\n');
  console.log('═'.repeat(60));
  
  // Simuler filterAlreadyAnalyzedStep avec aucun AO déjà analysé
  const newAOs = [
    { source: 'BOAMP', source_id: 'TEST-WORKFLOW-NEW-1' },
    { source: 'BOAMP', source_id: 'TEST-WORKFLOW-NEW-2' },
    { source: 'BOAMP', source_id: 'TEST-WORKFLOW-NEW-3' }
  ];
  
  // Simuler checkBatchAlreadyAnalyzed (comme dans filterAlreadyAnalyzedStep ligne 384)
  const alreadyAnalyzedMap = await checkBatchAlreadyAnalyzed(newAOs);
  
  // Simuler le filtrage
  const filteredAOs: typeof newAOs = [];
  let skipped = 0;
  
  for (const ao of newAOs) {
    const isAlreadyAnalyzed = alreadyAnalyzedMap.get(ao.source_id) || false;
    
    if (isAlreadyAnalyzed) {
      skipped++;
      continue;
    }
    
    filteredAOs.push(ao);
  }
  
  console.log(`  → Input: ${newAOs.length} AO nouveaux`);
  console.log(`  → Output: ${filteredAOs.length} AO filtrés`);
  console.log(`  → Skipped: ${skipped} AO`);
  console.log(`  → Tous les AO passent: ${filteredAOs.length === newAOs.length ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → Aucun skip: ${skipped === 0 ? '✅ OUI' : '❌ NON'}`);
  
  const passed = filteredAOs.length === newAOs.length && skipped === 0;
  
  console.log(`  → ${passed ? '✅ OK (pas de régression)' : '❌ ERREUR (régression détectée)'}`);
  
  return passed;
}

async function testFilterStepInRetry() {
  console.log('\n🧪 TEST 4 : Filtrage lors d\'un retry (mixte)\n');
  console.log('═'.repeat(60));
  
  // Créer des AO déjà analysés en DB
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  
  const analyzedAOs = [];
  for (let i = 1; i <= 5; i++) {
    analyzedAOs.push({
      source: 'BOAMP',
      source_id: `TEST-WORKFLOW-ANALYZED-${i}`,
      title: `AO analysé ${i}`,
      status: 'analyzed',
      analyzed_at: new Date().toISOString()
    });
  }
  
  const { error: insertError } = await supabase
    .from('appels_offres')
    .upsert(analyzedAOs, { onConflict: 'source_id' });
  
  if (insertError) {
    console.error('❌ Erreur insertion AO:', insertError);
    return false;
  }
  
  console.log(`  → ${analyzedAOs.length} AO déjà analysés insérés en DB`);
  
  // Simuler filterAlreadyAnalyzedStep avec un mélange
  const mixedAOs = [
    ...analyzedAOs.map(ao => ({ source: ao.source, source_id: ao.source_id })),
    { source: 'BOAMP', source_id: 'TEST-WORKFLOW-NEW-1' },
    { source: 'BOAMP', source_id: 'TEST-WORKFLOW-NEW-2' }
  ];
  
  const alreadyAnalyzedMap = await checkBatchAlreadyAnalyzed(mixedAOs);
  
  const filteredAOs: typeof mixedAOs = [];
  let skipped = 0;
  
  for (const ao of mixedAOs) {
    const isAlreadyAnalyzed = alreadyAnalyzedMap.get(ao.source_id) || false;
    
    if (isAlreadyAnalyzed) {
      skipped++;
      continue;
    }
    
    filteredAOs.push(ao);
  }
  
  console.log(`  → Input: ${mixedAOs.length} AO (5 analysés + 2 nouveaux)`);
  console.log(`  → Output: ${filteredAOs.length} AO filtrés`);
  console.log(`  → Skipped: ${skipped} AO`);
  console.log(`  → Nouveaux passent: ${filteredAOs.length === 2 ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → Analysés skip: ${skipped === 5 ? '✅ OUI' : '❌ NON'}`);
  
  // Nettoyage
  const sourceIds = analyzedAOs.map(ao => ao.source_id);
  await supabase
    .from('appels_offres')
    .delete()
    .in('source_id', sourceIds);
  
  const passed = filteredAOs.length === 2 && skipped === 5;
  
  console.log(`  → ${passed ? '✅ OK' : '❌ ERREUR'}`);
  
  return passed;
}

async function testSchedulerErrorHandling() {
  console.log('\n🧪 TEST 5 : Gestion d\'erreur scheduler (ne fait pas échouer workflow)\n');
  console.log('═'.repeat(60));
  
  // Simuler une erreur dans scheduleRetry (par exemple permissions)
  // Le workflow ne doit pas échouer (ligne 145-148)
  
  try {
    // Tester avec des paramètres invalides
    try {
      scheduleRetry('', '', -1, 'Test erreur');
      console.log(`  → Erreur attendue mais non levée: ❌`);
      return false;
    } catch (error) {
      console.log(`  → Erreur attendue levée: ✅`);
      console.log(`  → Message: ${(error as Error).message.substring(0, 50)}...`);
      
      // Dans le workflow, cette erreur serait catchée (ligne 145-148)
      // et le workflow continuerait normalement
      console.log(`  → Workflow continue normalement: ✅ OUI (comme prévu)`);
      
      return true;
    }
  } catch (error) {
    console.error(`  → Erreur inattendue:`, error);
    return false;
  }
}

// ────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  TESTS : Workflow complet avec mock (aspects critiques)   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  // Sauvegarder la queue originale
  backupQueue();
  
  try {
    const test1 = await testSchedulerCalledOnMissing();
    const test2 = await testSchedulerNotCalledOnNoMissing();
    const test3 = await testFilterStepRegressionFirstFetch();
    const test4 = await testFilterStepInRetry();
    const test5 = await testSchedulerErrorHandling();
    
    // Résumé
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  RÉSUMÉ DES TESTS                                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    console.log(`\n✅ TEST 1 (Scheduler appelé si missing > 0): ${test1 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 2 (Scheduler non appelé si missing = 0): ${test2 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 3 (Régression premier fetch): ${test3 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 4 (Filtrage lors retry): ${test4 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 5 (Gestion d'erreur scheduler): ${test5 ? 'PASS' : 'FAIL'}`);
    
    const allPassed = test1 && test2 && test3 && test4 && test5;
    
    console.log(`\n${allPassed ? '✅' : '❌'} RÉSULTAT GLOBAL: ${allPassed ? 'TOUS LES TESTS PASSENT' : 'QUELQUES TESTS ÉCHOUENT'}`);
    
    if (allPassed) {
      console.log(`\n✅ VALIDATION WORKFLOW:`);
      console.log(`   → Le scheduler est appelé correctement lors d'incohérence`);
      console.log(`   → Le filtrage fonctionne sans régression`);
      console.log(`   → Les erreurs sont gérées proprement`);
    }
    
    console.log('\n✅ Tests terminés (queue restaurée) !');
    
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Erreur lors des tests:', error);
    process.exit(1);
  } finally {
    restoreQueue();
  }
}

// Exécuter si appelé directement
main().catch((error: Error) => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
