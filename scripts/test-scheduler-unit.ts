#!/usr/bin/env ts-node
// ════════════════════════════════════════════════════════════════
// SCRIPT DE TEST : Test unitaire du module scheduler
// ════════════════════════════════════════════════════════════════

import * as fs from 'fs';
import * as path from 'path';
import {
  scheduleRetry,
  hasPendingRetry,
  loadRetryQueue,
  saveRetryQueue,
  cleanupOldRetries,
  markJobCompleted,
  markJobFailed,
  getReadyJobs,
  type RetryJob,
  type RetryQueue
} from '../src/utils/retry-scheduler';

// ────────────────────────────────────────────────────────────────
// CONFIGURATION
// ────────────────────────────────────────────────────────────────

const RETRY_QUEUE_FILE = path.join(process.cwd(), '.retry-queue.json');

// Sauvegarder le fichier original si existe
let originalQueueExists = false;
let originalQueueContent: string | null = null;

function backupOriginalQueue(): void {
  if (fs.existsSync(RETRY_QUEUE_FILE)) {
    originalQueueExists = true;
    originalQueueContent = fs.readFileSync(RETRY_QUEUE_FILE, 'utf-8');
    // Copier le fichier original ailleurs temporairement
    fs.copyFileSync(RETRY_QUEUE_FILE, RETRY_QUEUE_FILE + '.backup');
  }
}

function restoreOriginalQueue(): void {
  if (originalQueueExists && originalQueueContent) {
    fs.writeFileSync(RETRY_QUEUE_FILE, originalQueueContent, 'utf-8');
    // Supprimer le backup
    if (fs.existsSync(RETRY_QUEUE_FILE + '.backup')) {
      fs.unlinkSync(RETRY_QUEUE_FILE + '.backup');
    }
  } else if (!originalQueueExists && fs.existsSync(RETRY_QUEUE_FILE)) {
    // Si le fichier n'existait pas avant, on le supprime
    fs.unlinkSync(RETRY_QUEUE_FILE);
  }
}

function cleanupTestQueue(): void {
  // Nettoyer le fichier de queue pour les tests
  if (fs.existsSync(RETRY_QUEUE_FILE)) {
    fs.unlinkSync(RETRY_QUEUE_FILE);
  }
}

function useTestQueue(): void {
  // Nettoyer pour commencer avec une queue vide
  cleanupTestQueue();
}

// ────────────────────────────────────────────────────────────────
// FONCTIONS DE TEST
// ────────────────────────────────────────────────────────────────

async function testScheduleRetry() {
  console.log('🧪 TEST 1 : scheduleRetry() crée un job correct\n');
  console.log('═'.repeat(60));
  
  useTestQueue();
  
  const clientId = 'test-client';
  const date = '2025-01-20';
  const delayMinutes = 60;
  const reason = 'Test raison';
  
  const job = scheduleRetry(clientId, date, delayMinutes, reason);
  
  // Vérifier les champs
  const hasId = typeof job.id === 'string' && job.id.length > 0;
  const hasCorrectClientId = job.clientId === clientId;
  const hasCorrectDate = job.date === date;
  const hasCorrectDelay = job.delayMinutes === delayMinutes;
  const hasCorrectReason = job.reason === reason;
  const hasCorrectStatus = job.status === 'pending';
  const hasCreatedAt = typeof job.createdAt === 'string';
  const hasExecuteAt = typeof job.executeAt === 'string';
  
  // Vérifier que executeAt est correct (maintenant + delayMinutes)
  const executeAtDate = new Date(job.executeAt);
  const expectedDate = new Date(Date.now() + delayMinutes * 60 * 1000);
  const timeDiff = Math.abs(executeAtDate.getTime() - expectedDate.getTime());
  const hasCorrectExecuteAt = timeDiff < 60000; // Tolérance 1 minute
  
  const isCorrect = hasId && hasCorrectClientId && hasCorrectDate && hasCorrectDelay &&
                    hasCorrectReason && hasCorrectStatus && hasCreatedAt && hasExecuteAt &&
                    hasCorrectExecuteAt;
  
  console.log(`  → Job créé avec id: ${job.id}`);
  console.log(`  → clientId: ${job.clientId} ${hasCorrectClientId ? '✅' : '❌'}`);
  console.log(`  → date: ${job.date} ${hasCorrectDate ? '✅' : '❌'}`);
  console.log(`  → delayMinutes: ${job.delayMinutes} ${hasCorrectDelay ? '✅' : '❌'}`);
  console.log(`  → reason: ${job.reason} ${hasCorrectReason ? '✅' : '❌'}`);
  console.log(`  → status: ${job.status} ${hasCorrectStatus ? '✅' : '❌'}`);
  console.log(`  → executeAt: ${job.executeAt} ${hasCorrectExecuteAt ? '✅' : '❌'}`);
  console.log(`  → ${isCorrect ? '✅ OK' : '❌ ERREUR'}`);
  
  // Vérifier que le job est dans la queue
  const queue = loadRetryQueue();
  const jobInQueue = queue.jobs.find(j => j.id === job.id);
  const isInQueue = jobInQueue !== undefined;
  
  console.log(`  → Job dans queue: ${isInQueue ? '✅ OUI' : '❌ NON'}`);
  
  cleanupTestQueue();
  
  return isCorrect && isInQueue;
}

async function testHasPendingRetry() {
  console.log('\n🧪 TEST 2 : hasPendingRetry() détecte retries existants\n');
  console.log('═'.repeat(60));
  
  useTestQueue();
  
  const clientId = 'test-client';
  const date = '2025-01-21';
  
  // Test 1 : Pas de retry → false
  const hasPending1 = hasPendingRetry(clientId, date);
  const test1 = hasPending1 === false;
  console.log(`  → Test 1 (pas de retry): ${hasPending1} ${test1 ? '✅ OK' : '❌ ERREUR'}`);
  
  // Test 2 : Planifier un retry → true
  scheduleRetry(clientId, date, 60, 'Test');
  const hasPending2 = hasPendingRetry(clientId, date);
  const test2 = hasPending2 === true;
  console.log(`  → Test 2 (retry planifié): ${hasPending2} ${test2 ? '✅ OK' : '❌ ERREUR'}`);
  
  // Test 3 : Retry complété → false
  const queue = loadRetryQueue();
  const job = queue.jobs.find(j => j.clientId === clientId && j.date === date);
  if (job) {
    job.status = 'completed';
    saveRetryQueue(queue);
    const hasPending3 = hasPendingRetry(clientId, date);
    const test3 = hasPending3 === false;
    console.log(`  → Test 3 (retry complété): ${hasPending3} ${test3 ? '✅ OK' : '❌ ERREUR'}`);
    
    cleanupTestQueue();
    return test1 && test2 && test3;
  }
  
  cleanupTestQueue();
  return test1 && test2;
}

async function testLoadRetryQueue() {
  console.log('\n🧪 TEST 3 : loadRetryQueue() gère fichier inexistant/corrompu\n');
  console.log('═'.repeat(60));
  
  useTestQueue();
  
  // Test 1 : Fichier inexistant → queue vide
  const queue1 = loadRetryQueue();
  const test1 = queue1.jobs.length === 0;
  console.log(`  → Test 1 (fichier inexistant): ${queue1.jobs.length} jobs ${test1 ? '✅ OK (vide)' : '❌ ERREUR'}`);
  
  // Test 2 : Fichier corrompu (JSON invalide)
  fs.writeFileSync(RETRY_QUEUE_FILE, 'invalid json {', 'utf-8');
  const queue2 = loadRetryQueue();
  const test2 = queue2.jobs.length === 0; // Devrait retourner queue vide
  console.log(`  → Test 2 (fichier corrompu): ${queue2.jobs.length} jobs ${test2 ? '✅ OK (vide)' : '❌ ERREUR'}`);
  
  // Test 3 : Fichier vide
  fs.writeFileSync(RETRY_QUEUE_FILE, '', 'utf-8');
  const queue3 = loadRetryQueue();
  const test3 = queue3.jobs.length === 0;
  console.log(`  → Test 3 (fichier vide): ${queue3.jobs.length} jobs ${test3 ? '✅ OK (vide)' : '❌ ERREUR'}`);
  
  // Test 4 : Fichier valide
  const validQueue: RetryQueue = {
    jobs: [
      {
        id: 'test-id',
        clientId: 'test-client',
        date: '2025-01-20',
        executeAt: new Date().toISOString(),
        delayMinutes: 60,
        reason: 'Test',
        status: 'pending',
        createdAt: new Date().toISOString()
      }
    ]
  };
  fs.writeFileSync(RETRY_QUEUE_FILE, JSON.stringify(validQueue, null, 2), 'utf-8');
  const queue4 = loadRetryQueue();
  const test4 = queue4.jobs.length === 1 && queue4.jobs[0].id === 'test-id';
  console.log(`  → Test 4 (fichier valide): ${queue4.jobs.length} jobs ${test4 ? '✅ OK' : '❌ ERREUR'}`);
  
  cleanupTestQueue();
  
  return test1 && test2 && test3 && test4;
}

async function testSaveRetryQueue() {
  console.log('\n🧪 TEST 4 : saveRetryQueue() sauvegarde correctement\n');
  console.log('═'.repeat(60));
  
  useTestQueue();
  
  const testQueue: RetryQueue = {
    jobs: [
      {
        id: 'test-save-1',
        clientId: 'test-client',
        date: '2025-01-20',
        executeAt: new Date().toISOString(),
        delayMinutes: 60,
        reason: 'Test save',
        status: 'pending',
        createdAt: new Date().toISOString()
      }
    ]
  };
  
  try {
    saveRetryQueue(testQueue);
    const exists = fs.existsSync(RETRY_QUEUE_FILE);
    const test1 = exists === true;
    console.log(`  → Test 1 (fichier créé): ${exists ? '✅ OUI' : '❌ NON'} ${test1 ? 'OK' : 'ERREUR'}`);
    
    const loaded = loadRetryQueue();
    const test2 = loaded.jobs.length === 1 && loaded.jobs[0].id === 'test-save-1';
    console.log(`  → Test 2 (contenu correct): ${test2 ? '✅ OK' : '❌ ERREUR'}`);
    
    cleanupTestQueue();
    
    return test1 && test2;
    
  } catch (error) {
    console.error(`  → ❌ Erreur: ${(error as Error).message}`);
    cleanupTestQueue();
    return false;
  }
}

async function testDeduplication() {
  console.log('\n🧪 TEST 5 : Déduplication (pas de double retry)\n');
  console.log('═'.repeat(60));
  
  useTestQueue();
  
  const clientId = 'test-client';
  const date = '2025-01-22';
  
  // Planifier un retry
  const job1 = scheduleRetry(clientId, date, 60, 'Premier retry');
  const queue1 = loadRetryQueue();
  const count1 = queue1.jobs.filter(j => j.clientId === clientId && j.date === date && j.status === 'pending').length;
  
  // Re-planifier pour même client+date (déduplication)
  const job2 = scheduleRetry(clientId, date, 90, 'Deuxième retry');
  const queue2 = loadRetryQueue();
  const count2 = queue2.jobs.filter(j => j.clientId === clientId && j.date === date && j.status === 'pending').length;
  
  const isDeduplicated = count2 === 1; // Devrait toujours être 1
  
  console.log(`  → Premier retry planifié: ${count1} job(s)`);
  console.log(`  → Deuxième retry planifié: ${count2} job(s)`);
  console.log(`  → Déduplication: ${isDeduplicated ? '✅ OK (1 seul job)' : '❌ ERREUR (doublons)'}`);
  
  // Planifier pour client+date différent → 2 jobs
  scheduleRetry(clientId, '2025-01-23', 60, 'Retry date différente');
  const queue3 = loadRetryQueue();
  const count3 = queue3.jobs.length;
  const testDifferent = count3 === 2; // 1 pour date1 + 1 pour date2
  
  console.log(`  → Retry date différente: ${count3} jobs au total`);
  console.log(`  → Test date différente: ${testDifferent ? '✅ OK (2 jobs)' : '❌ ERREUR'}`);
  
  cleanupTestQueue();
  
  return isDeduplicated && testDifferent;
}

async function testCleanupOldRetries() {
  console.log('\n🧪 TEST 6 : cleanupOldRetries() nettoie les anciens jobs\n');
  console.log('═'.repeat(60));
  
  useTestQueue();
  
  const now = new Date();
  const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  
  // Créer des jobs anciens (complétés)
  const oldCompletedJob: RetryJob = {
    id: 'old-completed',
    clientId: 'test-client',
    date: '2025-01-10',
    executeAt: eightDaysAgo.toISOString(),
    delayMinutes: 60,
    reason: 'Ancien job complété',
    status: 'completed',
    createdAt: eightDaysAgo.toISOString(),
    completedAt: eightDaysAgo.toISOString()
  };
  
  // Créer un job récent (complété)
  const recentCompletedJob: RetryJob = {
    id: 'recent-completed',
    clientId: 'test-client',
    date: '2025-01-18',
    executeAt: threeDaysAgo.toISOString(),
    delayMinutes: 60,
    reason: 'Job récent complété',
    status: 'completed',
    createdAt: threeDaysAgo.toISOString(),
    completedAt: threeDaysAgo.toISOString()
  };
  
  // Créer un job ancien mais pending (doit être gardé)
  const oldPendingJob: RetryJob = {
    id: 'old-pending',
    clientId: 'test-client',
    date: '2025-01-10',
    executeAt: eightDaysAgo.toISOString(),
    delayMinutes: 60,
    reason: 'Ancien job pending',
    status: 'pending',
    createdAt: eightDaysAgo.toISOString()
  };
  
  const testQueue: RetryQueue = {
    jobs: [oldCompletedJob, recentCompletedJob, oldPendingJob]
  };
  
  saveRetryQueue(testQueue);
  
  const removedCount = cleanupOldRetries(7); // Nettoie jobs > 7 jours
  
  const queue = loadRetryQueue();
  const remainingJobs = queue.jobs.length;
  const hasOldPending = queue.jobs.some(j => j.id === 'old-pending');
  const hasRecentCompleted = queue.jobs.some(j => j.id === 'recent-completed');
  const hasOldCompleted = queue.jobs.some(j => j.id === 'old-completed');
  
  // Attendu : 1 job supprimé (old-completed), 2 restent (recent-completed + old-pending)
  const isCorrect = removedCount === 1 && remainingJobs === 2 && hasOldPending && hasRecentCompleted && !hasOldCompleted;
  
  console.log(`  → Jobs initiaux: 3`);
  console.log(`  → Jobs supprimés: ${removedCount}`);
  console.log(`  → Jobs restants: ${remainingJobs}`);
  console.log(`  → Old pending gardé: ${hasOldPending ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → Recent completed gardé: ${hasRecentCompleted ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → Old completed supprimé: ${!hasOldCompleted ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → ${isCorrect ? '✅ OK' : '❌ ERREUR'}`);
  
  cleanupTestQueue();
  
  return isCorrect;
}

async function testGetReadyJobs() {
  console.log('\n🧪 TEST 7 : getReadyJobs() récupère jobs prêts\n');
  console.log('═'.repeat(60));
  
  useTestQueue();
  
  const now = new Date();
  const pastDate = new Date(now.getTime() - 60 * 60 * 1000); // -1h
  const futureDate = new Date(now.getTime() + 60 * 60 * 1000); // +1h
  
  // Créer des jobs
  const pastJob: RetryJob = {
    id: 'past-job',
    clientId: 'test-client',
    date: '2025-01-20',
    executeAt: pastDate.toISOString(),
    delayMinutes: 60,
    reason: 'Job passé',
    status: 'pending',
    createdAt: now.toISOString()
  };
  
  const futureJob: RetryJob = {
    id: 'future-job',
    clientId: 'test-client',
    date: '2025-01-21',
    executeAt: futureDate.toISOString(),
    delayMinutes: 60,
    reason: 'Job futur',
    status: 'pending',
    createdAt: now.toISOString()
  };
  
  const completedJob: RetryJob = {
    id: 'completed-job',
    clientId: 'test-client',
    date: '2025-01-22',
    executeAt: pastDate.toISOString(),
    delayMinutes: 60,
    reason: 'Job complété',
    status: 'completed',
    createdAt: now.toISOString(),
    completedAt: now.toISOString()
  };
  
  const testQueue: RetryQueue = {
    jobs: [pastJob, futureJob, completedJob]
  };
  
  saveRetryQueue(testQueue);
  
  const readyJobs = getReadyJobs();
  
  // Attendu : seulement pastJob (status='pending' et executeAt <= now)
  const hasPastJob = readyJobs.some(j => j.id === 'past-job');
  const hasFutureJob = readyJobs.some(j => j.id === 'future-job');
  const hasCompletedJob = readyJobs.some(j => j.id === 'completed-job');
  const countCorrect = readyJobs.length === 1;
  
  const isCorrect = hasPastJob && !hasFutureJob && !hasCompletedJob && countCorrect;
  
  console.log(`  → Jobs dans queue: 3 (1 passé, 1 futur, 1 complété)`);
  console.log(`  → Jobs prêts: ${readyJobs.length}`);
  console.log(`  → Past job inclus: ${hasPastJob ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → Future job exclu: ${!hasFutureJob ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → Completed job exclu: ${!hasCompletedJob ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → ${isCorrect ? '✅ OK' : '❌ ERREUR'}`);
  
  cleanupTestQueue();
  
  return isCorrect;
}

async function testMarkJobCompleted() {
  console.log('\n🧪 TEST 8 : markJobCompleted() marque job comme complété\n');
  console.log('═'.repeat(60));
  
  useTestQueue();
  
  const job = scheduleRetry('test-client', '2025-01-24', 60, 'Test completion');
  
  markJobCompleted(job.id);
  
  const queue = loadRetryQueue();
  const updatedJob = queue.jobs.find(j => j.id === job.id);
  
  const isCompleted = updatedJob?.status === 'completed';
  const hasCompletedAt = updatedJob?.completedAt !== undefined;
  
  const isCorrect = isCompleted && hasCompletedAt;
  
  console.log(`  → Job status: ${updatedJob?.status} ${isCompleted ? '✅ OK' : '❌ ERREUR'}`);
  console.log(`  → completedAt défini: ${hasCompletedAt ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → ${isCorrect ? '✅ OK' : '❌ ERREUR'}`);
  
  cleanupTestQueue();
  
  return isCorrect;
}

async function testMarkJobFailed() {
  console.log('\n🧪 TEST 9 : markJobFailed() marque job comme échoué\n');
  console.log('═'.repeat(60));
  
  useTestQueue();
  
  const job = scheduleRetry('test-client', '2025-01-25', 60, 'Test failure');
  const errorMessage = 'Test error message';
  
  markJobFailed(job.id, errorMessage);
  
  const queue = loadRetryQueue();
  const updatedJob = queue.jobs.find(j => j.id === job.id);
  
  const isFailed = updatedJob?.status === 'failed';
  const hasError = updatedJob?.error === errorMessage;
  const hasCompletedAt = updatedJob?.completedAt !== undefined;
  
  const isCorrect = isFailed && hasError && hasCompletedAt;
  
  console.log(`  → Job status: ${updatedJob?.status} ${isFailed ? '✅ OK' : '❌ ERREUR'}`);
  console.log(`  → Error message: ${updatedJob?.error} ${hasError ? '✅ OK' : '❌ ERREUR'}`);
  console.log(`  → completedAt défini: ${hasCompletedAt ? '✅ OUI' : '❌ NON'}`);
  console.log(`  → ${isCorrect ? '✅ OK' : '❌ ERREUR'}`);
  
  cleanupTestQueue();
  
  return isCorrect;
}

// ────────────────────────────────────────────────────────────────
// EXÉCUTION
// ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  TESTS : Module scheduler (unitaire, isolé)               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  try {
    // Sauvegarder le fichier original
    backupOriginalQueue();
    
    // Tests
    const test1 = await testScheduleRetry();
    const test2 = await testHasPendingRetry();
    const test3 = await testLoadRetryQueue();
    const test4 = await testSaveRetryQueue();
    const test5 = await testDeduplication();
    const test6 = await testCleanupOldRetries();
    const test7 = await testGetReadyJobs();
    const test8 = await testMarkJobCompleted();
    const test9 = await testMarkJobFailed();
    
    // Restaurer le fichier original
    restoreOriginalQueue();
    
    // Résumé
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  RÉSUMÉ DES TESTS                                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n✅ TEST 1 (scheduleRetry): ${test1 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 2 (hasPendingRetry): ${test2 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 3 (loadRetryQueue): ${test3 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 4 (saveRetryQueue): ${test4 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 5 (Déduplication): ${test5 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 6 (cleanupOldRetries): ${test6 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 7 (getReadyJobs): ${test7 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 8 (markJobCompleted): ${test8 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 9 (markJobFailed): ${test9 ? 'PASS' : 'FAIL'}`);
    
    const allPassed = test1 && test2 && test3 && test4 && test5 && test6 && test7 && test8 && test9;
    console.log(`\n${allPassed ? '✅' : '❌'} RÉSULTAT GLOBAL: ${allPassed ? 'TOUS LES TESTS PASSENT' : 'QUELQUES TESTS ÉCHOUENT'}`);
    
    console.log('\n✅ Tests terminés (fichier queue restauré) !');
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    // Restaurer le fichier original en cas d'erreur
    restoreOriginalQueue();
    console.error('\n❌ Erreur lors des tests:', error);
    process.exit(1);
  }
}

// Exécuter si appelé directement
main().catch((error: Error) => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
