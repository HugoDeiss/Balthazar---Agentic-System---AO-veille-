#!/usr/bin/env ts-node
/**
 * Script de retry différé pour fetch BOAMP
 * 
 * Usage:
 *   ts-node scripts/retry-boamp-fetch.ts <clientId> <date>
 * 
 * Exemple:
 *   ts-node scripts/retry-boamp-fetch.ts balthazar 2025-12-19
 * 
 * Ce script est appelé automatiquement 60 min après une incohérence détectée.
 * Il peut être déclenché par:
 * - Un cron job
 * - Une queue (Redis, BullMQ)
 * - Un workflow schedulé Mastra
 */

import { mastra } from '../src/mastra';

async function retryBoampFetch(clientId: string, date: string) {
  console.log(`🔄 RETRY BOAMP FETCH`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📅 Date: ${date}`);
  console.log(`👤 Client: ${clientId}`);
  console.log(`⏰ Retry automatique après incohérence détectée`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  try {
    // Récupérer le workflow (méthode recommandée par Mastra)
    const workflow = mastra.getWorkflow('aoVeilleWorkflow');
    
    if (!workflow) {
      throw new Error('Workflow aoVeilleWorkflow not found');
    }
    
    // Utiliser l'API Mastra : createRunAsync() + start()
    // Cela wire automatiquement logger, telemetry, storage, agents, etc.
    console.log(`🚀 Lancement du workflow...`);
    const run = await workflow.createRunAsync();
    const result = await run.start({
      inputData: {
        clientId,
        since: date
      }
    });
    
    console.log(`✅ Retry terminé avec succès`);
    console.log(`📊 Résultat:`, result);
    
    return result;
    
  } catch (error) {
    console.error(`🚨 Erreur lors du retry:`, error);
    throw error;
  }
}

// Exécution du script
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error(`❌ Usage: ts-node scripts/retry-boamp-fetch.ts <clientId> <date>`);
  console.error(`   Exemple: ts-node scripts/retry-boamp-fetch.ts balthazar 2025-12-19`);
  process.exit(1);
}

const [clientId, date] = args;

// Validation de la date (format YYYY-MM-DD)
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`❌ Format de date invalide: ${date}`);
  console.error(`   Format attendu: YYYY-MM-DD (ex: 2025-12-19)`);
  process.exit(1);
}

retryBoampFetch(clientId, date)
  .then(() => {
    console.log(`✅ Script terminé avec succès`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`🚨 Script terminé avec erreur:`, error);
    process.exit(1);
  });

