// src/utils/retry-scheduler.ts
/**
 * Module de gestion des retries différés
 * 
 * Gère la planification et l'exécution de retries différés pour les AO manquants
 * Utilise un fichier JSON local (.retry-queue.json) pour la persistance
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface RetryJob {
  id: string; // UUID
  clientId: string;
  date: string; // YYYY-MM-DD
  executeAt: string; // ISO timestamp
  delayMinutes: number;
  reason: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string; // ISO timestamp
  completedAt?: string; // ISO timestamp
  error?: string;
}

export interface RetryQueue {
  jobs: RetryJob[];
}

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

const RETRY_QUEUE_FILE = path.join(process.cwd(), '.retry-queue.json');

// ═══════════════════════════════════════════════════════════
// FONCTIONS UTILITAIRES
// ═══════════════════════════════════════════════════════════

/**
 * Charge la queue de retries depuis le fichier
 * Gère les erreurs (fichier inexistant, corrompu, permissions)
 */
export function loadRetryQueue(): RetryQueue {
  try {
    if (!fs.existsSync(RETRY_QUEUE_FILE)) {
      return { jobs: [] };
    }
    
    const content = fs.readFileSync(RETRY_QUEUE_FILE, 'utf-8');
    
    if (!content.trim()) {
      // Fichier vide
      return { jobs: [] };
    }
    
    const parsed = JSON.parse(content);
    
    // Gérer l'ancien format (array) et le nouveau format (object avec jobs)
    if (Array.isArray(parsed)) {
      // Migration depuis l'ancien format
      return { jobs: parsed };
    }
    
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.jobs)) {
      return parsed;
    }
    
    // JSON invalide ou format inattendu
    console.warn(`⚠️ Format de queue invalide dans ${RETRY_QUEUE_FILE}, utilisation d'une queue vide`);
    return { jobs: [] };
    
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Fichier inexistant → queue vide
      return { jobs: [] };
    }
    
    if (error instanceof SyntaxError) {
      // JSON invalide → log warning et queue vide
      console.warn(`⚠️ Fichier queue corrompu (JSON invalide) dans ${RETRY_QUEUE_FILE}, utilisation d'une queue vide`);
      return { jobs: [] };
    }
    
    // Autre erreur (permissions, etc.) → throw pour que l'appelant gère
    console.error(`🚨 Erreur lecture retry queue:`, error);
    throw error;
  }
}

/**
 * Sauvegarde la queue de retries dans le fichier
 * Gère les erreurs (permissions, espace disque)
 */
export function saveRetryQueue(queue: RetryQueue): void {
  try {
    // Créer le répertoire parent si nécessaire
    const dir = path.dirname(RETRY_QUEUE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Sauvegarder avec formatage (2 espaces)
    fs.writeFileSync(RETRY_QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf-8');
    
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      throw new Error(`Permission refusée pour écrire dans ${RETRY_QUEUE_FILE}`);
    }
    
    if (err.code === 'ENOSPC') {
      throw new Error(`Espace disque insuffisant pour écrire ${RETRY_QUEUE_FILE}`);
    }
    
    console.error(`🚨 Erreur écriture retry queue:`, error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
// FONCTIONS PUBLIQUES
// ═══════════════════════════════════════════════════════════

/**
 * Vérifie si un retry est déjà planifié pour un client+date donné
 */
export function hasPendingRetry(clientId: string, date: string): boolean {
  const queue = loadRetryQueue();
  
  return queue.jobs.some(job => 
    job.clientId === clientId &&
    job.date === date &&
    job.status === 'pending'
  );
}

/**
 * Planifie un retry différé
 * Déduplication : ne planifie pas deux retries pour le même client+date
 * 
 * @param clientId - ID du client
 * @param date - Date au format YYYY-MM-DD
 * @param delayMinutes - Délai en minutes avant exécution
 * @param reason - Raison du retry (optionnel)
 */
export function scheduleRetry(
  clientId: string,
  date: string,
  delayMinutes: number,
  reason?: string
): RetryJob {
  // Validation des paramètres
  if (!clientId || !date) {
    throw new Error('clientId et date sont requis');
  }
  
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Format de date invalide: ${date}. Attendu: YYYY-MM-DD`);
  }
  
  if (isNaN(delayMinutes) || delayMinutes <= 0) {
    throw new Error(`delayMinutes doit être un nombre positif, reçu: ${delayMinutes}`);
  }
  
  // Déduplication : vérifier si un retry est déjà planifié
  if (hasPendingRetry(clientId, date)) {
    console.log(`ℹ️ Retry déjà planifié pour ${clientId}/${date}, déduplication`);
    const queue = loadRetryQueue();
    const existingJob = queue.jobs.find(job =>
      job.clientId === clientId &&
      job.date === date &&
      job.status === 'pending'
    );
    
    if (existingJob) {
      return existingJob;
    }
  }
  
  // Créer le job
  const now = new Date();
  const executeAt = new Date(now.getTime() + delayMinutes * 60 * 1000);
  
  const job: RetryJob = {
    id: randomUUID(),
    clientId,
    date,
    executeAt: executeAt.toISOString(),
    delayMinutes,
    reason: reason || `Retry automatique pour ${clientId}/${date}`,
    status: 'pending',
    createdAt: now.toISOString()
  };
  
  // Ajouter à la queue
  const queue = loadRetryQueue();
  queue.jobs.push(job);
  saveRetryQueue(queue);
  
  console.log(`✅ Retry planifié: ${job.id} pour ${clientId}/${date} à ${job.executeAt}`);
  
  return job;
}

/**
 * Nettoie les retries anciens de la queue
 * 
 * @param daysOld - Nombre de jours avant qu'un job soit considéré comme ancien (défaut: 7)
 * @returns Nombre de jobs supprimés
 */
export function cleanupOldRetries(daysOld: number = 7): number {
  const queue = loadRetryQueue();
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - daysOld * 24 * 60 * 60 * 1000);
  
  const initialCount = queue.jobs.length;
  
  // Filtrer les jobs anciens (mais garder les pending même s'ils sont anciens)
  queue.jobs = queue.jobs.filter(job => {
    const createdAt = new Date(job.createdAt);
    
    // Garder les jobs pending même s'ils sont anciens (ils peuvent être planifiés pour plus tard)
    if (job.status === 'pending') {
      return true;
    }
    
    // Supprimer les jobs complétés/échoués qui sont anciens
    return createdAt > cutoffDate;
  });
  
  const removedCount = initialCount - queue.jobs.length;
  
  if (removedCount > 0) {
    saveRetryQueue(queue);
    console.log(`🧹 Nettoyage: ${removedCount} ancien(s) job(s) supprimé(s)`);
  }
  
  return removedCount;
}

/**
 * Marque un job comme complété
 */
export function markJobCompleted(jobId: string): void {
  const queue = loadRetryQueue();
  const job = queue.jobs.find(j => j.id === jobId);
  
  if (!job) {
    console.warn(`⚠️ Job ${jobId} introuvable`);
    return;
  }
  
  if (job.status === 'completed') {
    console.log(`ℹ️ Job ${jobId} déjà complété`);
    return;
  }
  
  job.status = 'completed';
  job.completedAt = new Date().toISOString();
  
  saveRetryQueue(queue);
  console.log(`✅ Job ${jobId} marqué comme complété`);
}

/**
 * Marque un job comme échoué
 */
export function markJobFailed(jobId: string, error: string): void {
  const queue = loadRetryQueue();
  const job = queue.jobs.find(j => j.id === jobId);
  
  if (!job) {
    console.warn(`⚠️ Job ${jobId} introuvable`);
    return;
  }
  
  job.status = 'failed';
  job.completedAt = new Date().toISOString();
  job.error = error;
  
  saveRetryQueue(queue);
  console.log(`❌ Job ${jobId} marqué comme échoué: ${error}`);
}

/**
 * Récupère tous les jobs prêts à être exécutés (status='pending' et executeAt <= now)
 */
export function getReadyJobs(): RetryJob[] {
  const queue = loadRetryQueue();
  const now = new Date();
  
  return queue.jobs.filter(job => {
    if (job.status !== 'pending') {
      return false;
    }
    
    const executeAt = new Date(job.executeAt);
    return executeAt <= now;
  });
}
