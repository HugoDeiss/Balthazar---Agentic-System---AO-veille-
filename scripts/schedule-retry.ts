#!/usr/bin/env ts-node
/**
 * Script pour planifier un retry différé
 * 
 * Ce script écrit dans un fichier JSON les retries à effectuer.
 * Un cron job peut ensuite lire ce fichier et exécuter les retries.
 * 
 * Usage:
 *   ts-node scripts/schedule-retry.ts <clientId> <date> <delayMinutes>
 * 
 * Exemple:
 *   ts-node scripts/schedule-retry.ts balthazar 2025-12-19 60
 */

import * as fs from 'fs';
import * as path from 'path';

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

function scheduleRetry(clientId: string, date: string, delayMinutes: number): void {
  const now = new Date();
  const executeAt = new Date(now.getTime() + delayMinutes * 60 * 1000);
  
  const job: RetryJob = {
    clientId,
    date,
    scheduledAt: now.toISOString(),
    executeAt: executeAt.toISOString(),
    delayMinutes,
    status: 'pending'
  };
  
  console.log(`⏰ PLANIFICATION RETRY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`👤 Client: ${clientId}`);
  console.log(`📅 Date: ${date}`);
  console.log(`⏰ Planifié à: ${job.scheduledAt}`);
  console.log(`⏰ Exécution à: ${job.executeAt}`);
  console.log(`⏱️ Délai: ${delayMinutes} minutes`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  const queue = loadRetryQueue();
  queue.push(job);
  saveRetryQueue(queue);
  
  console.log(`✅ Retry planifié avec succès`);
  console.log(`📄 Fichier: ${RETRY_LOG_FILE}`);
}

// Exécution du script
const args = process.argv.slice(2);

if (args.length < 3) {
  console.error(`❌ Usage: ts-node scripts/schedule-retry.ts <clientId> <date> <delayMinutes>`);
  console.error(`   Exemple: ts-node scripts/schedule-retry.ts balthazar 2025-12-19 60`);
  process.exit(1);
}

const [clientId, date, delayMinutesStr] = args;
const delayMinutes = parseInt(delayMinutesStr, 10);

// Validation
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`❌ Format de date invalide: ${date}`);
  process.exit(1);
}

if (isNaN(delayMinutes) || delayMinutes <= 0) {
  console.error(`❌ Délai invalide: ${delayMinutesStr}`);
  process.exit(1);
}

try {
  scheduleRetry(clientId, date, delayMinutes);
  process.exit(0);
} catch (error) {
  console.error(`🚨 Erreur:`, error);
  process.exit(1);
}

