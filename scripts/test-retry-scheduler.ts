#!/usr/bin/env ts-node
// ════════════════════════════════════════════════════════════════
// SCRIPT DE TEST : Intégration scheduler et queue
// ════════════════════════════════════════════════════════════════

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  scheduleRetry,
  loadRetryQueue,
  saveRetryQueue,
  getReadyJobs,
  markJobCompleted,
  markJobFailed,
  cleanupOldRetries,
  type RetryJob
} from '../src/utils/retry-scheduler';
import * as path from 'path';

// Utiliser le même chemin que dans retry-scheduler.ts
const RETRY_QUEUE_FILE = path.join(process.cwd(), '.retry-queue.json');

// ────────────────────────────────────────────────────────────────
// UTILITAIRES DE TEST
// ────────────────────────────────────────────────────────────────

// Sauvegarder la queue originale pour restauration
let originalQueueBackup: string | null = null;

function backupQueue(): void {
  try {
    if (fs.existsSync(RETRY_QUEUE_FILE)) {
      originalQueueBackup = fs.readFileSync(RETRY_QUEUE_FILE, 'utf-8');
    }
  } catch (error) {
    // Ignore si le fichier n'existe pas
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

async function testGetReadyJobs() {
  console.log('\n🧪 TEST 1 : getReadyJobs() récupère jobs prêts\n');
  console.log('═'.repeat(60));
  
  clearQueue();
  
  const now = new Date();
  const pastDate = new Date(now.getTime() - 1000 * 60); // Il y a 1 minute
  const futureDate = new Date(now.getTime() + 1000 * 60 * 60); // Dans 1 heure
  
  // Créer 3 jobs : 1 passé, 1 futur, 1 passé mais complété
  // Note: delayMinutes doit être > 0, mais on modifiera executeAt manuellement ensuite
  const pastJob = scheduleRetry('test-client', '2025-01-20', 1, 'Test passé');
  const futureJob = scheduleRetry('test-client', '2025-01-21', 120, 'Test futur');
  const pastCompletedJob = scheduleRetry('test-client', '2025-01-22', 1, 'Test complété');
  
  // Forcer les dates executeAt
  const queue = loadRetryQueue();
  const pastJobInQueue = queue.jobs.find(j => j.id === pastJob.id);
  const futureJobInQueue = queue.jobs.find(j => j.id === futureJob.id);
  const completedJobInQueue = queue.jobs.find(j => j.id === pastCompletedJob.id);
  
  if (pastJobInQueue) pastJobInQueue.executeAt = pastDate.toISOString();
  if (futureJobInQueue) futureJobInQueue.executeAt = futureDate.toISOString();
  if (completedJobInQueue) {
    completedJobInQueue.executeAt = pastDate.toISOString();
    completedJobInQueue.status = 'completed';
  }
  
  saveRetryQueue(queue);
  
  // Vérifier getReadyJobs
  const readyJobs = getReadyJobs();
  
  console.log(`  → Jobs dans queue: ${queue.jobs.length} (1 passé, 1 futur, 1 complété)`);
  console.log(`  → Jobs prêts: ${readyJobs.length}`);
  console.log(`  → Past job inclus: ${readyJobs.some(j => j.id === pastJob.id) ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → Future job exclu: ${!readyJobs.some(j => j.id === futureJob.id) ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → Completed job exclu: ${!readyJobs.some(j => j.id === pastCompletedJob.id) ? '✅ OUI' : '❌ NON'}`);
  
  const passed = readyJobs.length === 1 && 
                 readyJobs[0].id === pastJob.id &&
                 !readyJobs.some(j => j.id === futureJob.id) &&
                 !readyJobs.some(j => j.id === pastCompletedJob.id);
  
  clearQueue();
  
  return passed;
}

async function testProcessRetryQueueLogic() {
  console.log('\n🧪 TEST 2 : Logique process-retry-queue (sans exécution)\n');
  console.log('═'.repeat(60));
  
  clearQueue();
  
  const now = new Date();
  const pastDate = new Date(now.getTime() - 1000 * 60); // Il y a 1 minute
  
  // Créer 2 jobs prêts
  // Note: delayMinutes doit être > 0, mais on modifiera executeAt manuellement ensuite
  const job1 = scheduleRetry('test-client-1', '2025-01-20', 1, 'Test job 1');
  const job2 = scheduleRetry('test-client-2', '2025-01-21', 1, 'Test job 2');
  
  // Forcer executeAt dans le passé
  const queue = loadRetryQueue();
  queue.jobs.forEach(job => {
    if (job.status === 'pending') {
      job.executeAt = pastDate.toISOString();
    }
  });
  saveRetryQueue(queue);
  
  // Simuler process-retry-queue (sans exécuter réellement)
  const readyJobs = getReadyJobs();
  console.log(`  → Jobs prêts à exécuter: ${readyJobs.length}`);
  console.log(`  → Job 1 inclus: ${readyJobs.some(j => j.id === job1.id) ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → Job 2 inclus: ${readyJobs.some(j => j.id === job2.id) ? '✅ OUI' : '❌ NON'}`);
  
  // Simuler marquage comme complété
  if (readyJobs.length > 0) {
    markJobCompleted(readyJobs[0].id);
    const updatedQueue = loadRetryQueue();
    const completedJob = updatedQueue.jobs.find(j => j.id === readyJobs[0].id);
    console.log(`  → Job marqué complété: ${completedJob?.status === 'completed' ? '✅ OUI' : '❌ NON'}`);
    console.log(`  → completedAt défini: ${completedJob?.completedAt ? '✅ OUI' : '❌ NON'}`);
  }
  
  const passed = readyJobs.length === 2 &&
                 readyJobs.some(j => j.id === job1.id) &&
                 readyJobs.some(j => j.id === job2.id);
  
  clearQueue();
  
  return passed;
}

async function testProcessRetryQueueErrorHandling() {
  console.log('\n🧪 TEST 3 : Gestion d\'erreur process-retry-queue\n');
  console.log('═'.repeat(60));
  
  clearQueue();
  
  const now = new Date();
  const pastDate = new Date(now.getTime() - 1000 * 60);
  
  // Créer un job avec un clientId invalide (simulera une erreur)
  // Note: delayMinutes doit être > 0, mais on modifiera executeAt manuellement ensuite
  const job = scheduleRetry('invalid-client', '2025-01-20', 1, 'Test erreur');
  
  // Forcer executeAt dans le passé
  const queue = loadRetryQueue();
  const jobInQueue = queue.jobs.find(j => j.id === job.id);
  if (jobInQueue) {
    jobInQueue.executeAt = pastDate.toISOString();
  }
  saveRetryQueue(queue);
  
  // Simuler erreur (sans exécuter réellement)
  const readyJobs = getReadyJobs();
  
  if (readyJobs.length > 0) {
    // Simuler marquage comme échoué
    markJobFailed(readyJobs[0].id, 'Test error: client introuvable');
    const updatedQueue = loadRetryQueue();
    const failedJob = updatedQueue.jobs.find(j => j.id === readyJobs[0].id);
    
    console.log(`  → Job marqué échoué: ${failedJob?.status === 'failed' ? '✅ OUI' : '❌ NON'}`);
    console.log(`  → Error message: ${failedJob?.error || '❌ MANQUANT'}`);
    console.log(`  → completedAt défini: ${failedJob?.completedAt ? '✅ OUI' : '❌ NON'}`);
    
    const passed = failedJob?.status === 'failed' &&
                   failedJob?.error === 'Test error: client introuvable' &&
                   failedJob?.completedAt !== undefined;
    
    clearQueue();
    return passed;
  }
  
  clearQueue();
  return false;
}

async function testProcessRetryQueueCleanup() {
  console.log('\n🧪 TEST 4 : Nettoyage automatique dans process-retry-queue\n');
  console.log('═'.repeat(60));
  
  clearQueue();
  
  const now = new Date();
  const oldDate = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000); // Il y a 8 jours
  const recentDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // Il y a 1 jour
  
  // Créer des jobs anciens et récents
  // Note: delayMinutes doit être > 0, mais on modifiera createdAt manuellement ensuite
  const oldCompletedJob = scheduleRetry('test-client', '2025-01-15', 1, 'Ancien complété');
  const oldFailedJob = scheduleRetry('test-client', '2025-01-16', 1, 'Ancien échoué');
  const recentCompletedJob = scheduleRetry('test-client', '2025-01-17', 1, 'Récent complété');
  const oldPendingJob = scheduleRetry('test-client', '2025-01-18', 1, 'Ancien pending');
  
  // Forcer les dates
  const queue = loadRetryQueue();
  const oldCompleted = queue.jobs.find(j => j.id === oldCompletedJob.id);
  const oldFailed = queue.jobs.find(j => j.id === oldFailedJob.id);
  const recentCompleted = queue.jobs.find(j => j.id === recentCompletedJob.id);
  const oldPending = queue.jobs.find(j => j.id === oldPendingJob.id);
  
  if (oldCompleted) {
    oldCompleted.createdAt = oldDate.toISOString();
    oldCompleted.status = 'completed';
    oldCompleted.completedAt = oldDate.toISOString();
  }
  if (oldFailed) {
    oldFailed.createdAt = oldDate.toISOString();
    oldFailed.status = 'failed';
    oldFailed.completedAt = oldDate.toISOString();
  }
  if (recentCompleted) {
    recentCompleted.createdAt = recentDate.toISOString();
    recentCompleted.status = 'completed';
    recentCompleted.completedAt = recentDate.toISOString();
  }
  if (oldPending) {
    oldPending.createdAt = oldDate.toISOString();
    oldPending.status = 'pending';
  }
  
  saveRetryQueue(queue);
  
  console.log(`  → Jobs initiaux: ${queue.jobs.length}`);
  
  // Simuler nettoyage (comme dans process-retry-queue)
  const removedCount = cleanupOldRetries(7);
  
  const updatedQueue = loadRetryQueue();
  console.log(`  → Jobs supprimés: ${removedCount}`);
  console.log(`  → Jobs restants: ${updatedQueue.jobs.length}`);
  console.log(`  → Old completed supprimé: ${!updatedQueue.jobs.some(j => j.id === oldCompletedJob.id) ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → Old failed supprimé: ${!updatedQueue.jobs.some(j => j.id === oldFailedJob.id) ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → Recent completed gardé: ${updatedQueue.jobs.some(j => j.id === recentCompletedJob.id) ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → Old pending gardé: ${updatedQueue.jobs.some(j => j.id === oldPendingJob.id) ? '✅ OUI' : '❌ NON'}`);
  
  const passed = removedCount === 2 && // 2 anciens jobs complétés/échoués
                 updatedQueue.jobs.length === 2 && // 2 jobs restants (récent + old pending)
                 !updatedQueue.jobs.some(j => j.id === oldCompletedJob.id) &&
                 !updatedQueue.jobs.some(j => j.id === oldFailedJob.id) &&
                 updatedQueue.jobs.some(j => j.id === recentCompletedJob.id) &&
                 updatedQueue.jobs.some(j => j.id === oldPendingJob.id);
  
  clearQueue();
  
  return passed;
}

async function testProcessRetryQueueEmptyQueue() {
  console.log('\n🧪 TEST 5 : Queue vide → pas d\'exécution\n');
  console.log('═'.repeat(60));
  
  clearQueue();
  
  const queue = loadRetryQueue();
  const readyJobs = getReadyJobs();
  
  console.log(`  → Queue vide: ${queue.jobs.length === 0 ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → Jobs prêts: ${readyJobs.length} (attendu: 0)`);
  console.log(`  → Pas d'exécution nécessaire: ${readyJobs.length === 0 ? '✅ OUI' : '❌ NON'}`);
  
  const passed = queue.jobs.length === 0 && readyJobs.length === 0;
  
  return passed;
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  TESTS : Intégration scheduler et queue                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  // Sauvegarder la queue originale
  backupQueue();
  
  try {
    const test1 = await testGetReadyJobs();
    const test2 = await testProcessRetryQueueLogic();
    const test3 = await testProcessRetryQueueErrorHandling();
    const test4 = await testProcessRetryQueueCleanup();
    const test5 = await testProcessRetryQueueEmptyQueue();
    
    // Résumé
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  RÉSUMÉ DES TESTS                                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    console.log(`\n✅ TEST 1 (getReadyJobs): ${test1 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 2 (Logique process-retry-queue): ${test2 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 3 (Gestion d'erreur): ${test3 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 4 (Nettoyage automatique): ${test4 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 5 (Queue vide): ${test5 ? 'PASS' : 'FAIL'}`);
    
    const allPassed = test1 && test2 && test3 && test4 && test5;
    
    console.log(`\n${allPassed ? '✅' : '❌'} RÉSULTAT GLOBAL: ${allPassed ? 'TOUS LES TESTS PASSENT' : 'QUELQUES TESTS ÉCHOUENT'}`);
    
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
