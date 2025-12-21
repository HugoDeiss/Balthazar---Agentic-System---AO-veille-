#!/usr/bin/env ts-node
/**
 * Script pour traiter la queue de retries
 * 
 * Ce script doit être exécuté régulièrement (ex: toutes les 5 minutes via cron)
 * Il lit le fichier .retry-queue.json et exécute les retries dont l'heure est venue.
 * 
 * Usage:
 *   ts-node scripts/process-retry-queue.ts
 * 
 * Cron exemple (toutes les 5 minutes):
 *   */5 * * * * cd /path/to/project && ts-node scripts/process-retry-queue.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface RetryJob {
  clientId: string;
  date: string;
  scheduledAt: string;
  executeAt: string;
  delayMinutes: number;
  status: 'pending' | 'completed' | 'failed';
}

const RETRY_LOG_FILE = path.join(__dirname, '../.retry-queue.json');

function loadRetryQueue(): RetryJob[] {
  try {
    if (fs.existsSync(RETRY_LOG_FILE)) {
      const content = fs.readFileSync(RETRY_LOG_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn(`⚠️ Erreur lecture retry queue:`, error);
  }
  return [];
}

function saveRetryQueue(queue: RetryJob[]): void {
  try {
    fs.writeFileSync(RETRY_LOG_FILE, JSON.stringify(queue, null, 2), 'utf-8');
  } catch (error) {
    console.error(`🚨 Erreur écriture retry queue:`, error);
    throw error;
  }
}

function processRetryQueue(): void {
  console.log(`🔄 TRAITEMENT RETRY QUEUE`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`⏰ ${new Date().toISOString()}`);
  
  const queue = loadRetryQueue();
  
  if (queue.length === 0) {
    console.log(`ℹ️ Aucun retry en attente`);
    return;
  }
  
  console.log(`📊 ${queue.length} retry(s) dans la queue`);
  
  const now = new Date();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  
  for (const job of queue) {
    if (job.status !== 'pending') {
      continue;
    }
    
    const executeAt = new Date(job.executeAt);
    
    if (now >= executeAt) {
      console.log(`\n⏰ Exécution retry: ${job.clientId} / ${job.date}`);
      processed++;
      
      try {
        // Exécuter le script de retry
        const scriptPath = path.join(__dirname, 'retry-boamp-fetch.ts');
        const command = `ts-node ${scriptPath} ${job.clientId} ${job.date}`;
        
        console.log(`🚀 Commande: ${command}`);
        execSync(command, { stdio: 'inherit' });
        
        job.status = 'completed';
        succeeded++;
        console.log(`✅ Retry réussi`);
        
      } catch (error) {
        job.status = 'failed';
        failed++;
        console.error(`🚨 Retry échoué:`, error);
      }
    }
  }
  
  // Sauvegarder la queue mise à jour
  saveRetryQueue(queue);
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 RÉSUMÉ`);
  console.log(`  Traités: ${processed}`);
  console.log(`  Réussis: ${succeeded}`);
  console.log(`  Échoués: ${failed}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  // Nettoyer les anciens jobs (> 7 jours)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const cleanedQueue = queue.filter(job => {
    const executeAt = new Date(job.executeAt);
    return executeAt > sevenDaysAgo || job.status === 'pending';
  });
  
  if (cleanedQueue.length < queue.length) {
    console.log(`🧹 Nettoyage: ${queue.length - cleanedQueue.length} ancien(s) job(s) supprimé(s)`);
    saveRetryQueue(cleanedQueue);
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

