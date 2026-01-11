#!/usr/bin/env ts-node
/**
 * Script pour planifier un retry différé
 * 
 * Ce script utilise le module partagé retry-scheduler pour planifier un retry.
 * Un cron job peut ensuite lire le fichier .retry-queue.json et exécuter les retries.
 * 
 * Usage:
 *   ts-node scripts/schedule-retry.ts <clientId> <date> <delayMinutes> [reason]
 * 
 * Exemple:
 *   ts-node scripts/schedule-retry.ts balthazar 2025-12-19 60 "Test retry manuel"
 */

import { scheduleRetry } from '../src/utils/retry-scheduler';
import * as path from 'path';

const RETRY_LOG_FILE = path.join(process.cwd(), '.retry-queue.json');

// Exécution du script
const args = process.argv.slice(2);

if (args.length < 3) {
  console.error(`❌ Usage: ts-node scripts/schedule-retry.ts <clientId> <date> <delayMinutes> [reason]`);
  console.error(`   Exemple: ts-node scripts/schedule-retry.ts balthazar 2025-12-19 60 "Test retry manuel"`);
  process.exit(1);
}

const [clientId, date, delayMinutesStr, reason] = args;
const delayMinutes = parseInt(delayMinutesStr, 10);

// Validation
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`❌ Format de date invalide: ${date}`);
  console.error(`   Format attendu: YYYY-MM-DD (ex: 2025-12-19)`);
  process.exit(1);
}

if (isNaN(delayMinutes) || delayMinutes <= 0) {
  console.error(`❌ Délai invalide: ${delayMinutesStr}`);
  console.error(`   Le délai doit être un nombre positif (en minutes)`);
  process.exit(1);
}

try {
  console.log(`⏰ PLANIFICATION RETRY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`👤 Client: ${clientId}`);
  console.log(`📅 Date: ${date}`);
  console.log(`⏱️ Délai: ${delayMinutes} minutes`);
  if (reason) {
    console.log(`📝 Raison: ${reason}`);
  }
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  
  const job = scheduleRetry(clientId, date, delayMinutes, reason);
  
  console.log(`\n✅ Retry planifié avec succès`);
  console.log(`📄 Job ID: ${job.id}`);
  console.log(`📄 Fichier: ${RETRY_LOG_FILE}`);
  console.log(`⏰ Exécution prévue à: ${job.executeAt}`);
  
  process.exit(0);
} catch (error) {
  console.error(`\n🚨 Erreur:`, error);
  process.exit(1);
}

