#!/usr/bin/env ts-node
/**
 * Script pour traiter la queue de retries
 * 
 * Ce script doit être exécuté régulièrement (ex: toutes les 5 minutes via cron)
 * Il lit le fichier .retry-queue.json et exécute les retries dont l'heure est venue.
 * 
 * Utilise le module partagé retry-scheduler pour charger et sauvegarder la queue.
 * 
 * Usage:
 *   ts-node scripts/process-retry-queue.ts
 * 
 * Cron exemple (toutes les 5 minutes):
 *   */5 * * * * cd /path/to/project && ts-node scripts/process-retry-queue.ts
 */

import * as path from 'path';
import { execSync } from 'child_process';
import {
  loadRetryQueue,
  saveRetryQueue,
  getReadyJobs,
  markJobCompleted,
  markJobFailed,
  cleanupOldRetries
} from '../src/utils/retry-scheduler';
import type { RetryQueue } from '../src/utils/retry-scheduler';

function processRetryQueue(): void {
  console.log(`🔄 TRAITEMENT RETRY QUEUE`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`⏰ ${new Date().toISOString()}`);
  
  const queue = loadRetryQueue();
  
  if (queue.jobs.length === 0) {
    console.log(`ℹ️ Aucun retry en attente`);
    return;
  }
  
  console.log(`📊 ${queue.jobs.length} retry(s) dans la queue`);
  
  // Récupérer les jobs prêts à être exécutés
  const readyJobs = getReadyJobs();
  
  if (readyJobs.length === 0) {
    console.log(`ℹ️ Aucun retry prêt à être exécuté`);
    
    // Nettoyage des anciens jobs
    const removedCount = cleanupOldRetries(7);
    if (removedCount > 0) {
      console.log(`🧹 Nettoyage: ${removedCount} ancien(s) job(s) supprimé(s)`);
    }
    
    return;
  }
  
  console.log(`⏰ ${readyJobs.length} retry(s) prêt(s) à être exécuté(s)`);
  
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  
  for (const job of readyJobs) {
    console.log(`\n⏰ Exécution retry: ${job.clientId} / ${job.date} (ID: ${job.id})`);
    if (job.reason) {
      console.log(`📝 Raison: ${job.reason}`);
    }
    processed++;
    
    try {
      // Exécuter le script de retry
      const scriptPath = path.join(__dirname, 'retry-boamp-fetch.ts');
      const command = `ts-node ${scriptPath} ${job.clientId} ${job.date}`;
      
      console.log(`🚀 Commande: ${command}`);
      execSync(command, { stdio: 'inherit' });
      
      markJobCompleted(job.id);
      succeeded++;
      console.log(`✅ Retry réussi (job ${job.id})`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      markJobFailed(job.id, errorMessage);
      failed++;
      console.error(`🚨 Retry échoué (job ${job.id}):`, error);
    }
  }
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 RÉSUMÉ`);
  console.log(`  Traités: ${processed}`);
  console.log(`  Réussis: ${succeeded}`);
  console.log(`  Échoués: ${failed}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  // Nettoyer les anciens jobs (> 7 jours)
  const removedCount = cleanupOldRetries(7);
  if (removedCount > 0) {
    console.log(`🧹 Nettoyage: ${removedCount} ancien(s) job(s) supprimé(s)`);
  }
}

// Exécution du script
try {
  processRetryQueue();
  process.exit(0);
} catch (error) {
  console.error(`🚨 Erreur:`, error);
  process.exit(1);
}

