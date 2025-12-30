// src/persistence/ao-persistence.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { CanonicalAO } from '../mastra/tools/boamp-fetcher';

// ═══════════════════════════════════════════════════════════
// 🔧 CLIENT SUPABASE
// ═══════════════════════════════════════════════════════════

let supabaseClient: SupabaseClient | null = null;

/**
 * Récupère ou crée le client Supabase
 * Réutilise la même instance pour éviter les reconnexions
 */
function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    
    if (!url || !key) {
      throw new Error('SUPABASE_URL et SUPABASE_SERVICE_KEY doivent être définis dans les variables d\'environnement');
    }
    
    supabaseClient = createClient(url, key);
  }
  
  return supabaseClient;
}

// ═══════════════════════════════════════════════════════════
// 🔄 UTILITAIRES DE CONVERSION
// ═══════════════════════════════════════════════════════════

/**
 * Convertit une date string (YYYY-MM-DD) en timestamp ISO pour Supabase
 * Si la date est null, retourne null
 */
function toTimestamp(dateString: string | null): string | null {
  if (!dateString) return null;
  
  // Si c'est déjà un timestamp ISO, on le retourne tel quel
  if (dateString.includes('T')) {
    return dateString;
  }
  
  // Sinon, on convertit YYYY-MM-DD en timestamp ISO
  // On utilise minuit UTC pour éviter les problèmes de timezone
  const date = new Date(`${dateString}T00:00:00.000Z`);
  
  if (isNaN(date.getTime())) {
    console.warn(`⚠️ Date invalide: ${dateString}, retour null`);
    return null;
  }
  
  return date.toISOString();
}

/**
 * Déduplique un tableau de strings
 */
function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

// ═══════════════════════════════════════════════════════════
// 🔍 DÉDUPLICATION
// ═══════════════════════════════════════════════════════════

/**
 * Recherche un AO existant dans Supabase par source + source_id
 * @returns L'enregistrement existant ou null si non trouvé
 */
export async function findExistingAO(ao: CanonicalAO) {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('appels_offres')
    .select('id, source, source_id, status, is_rectified, rectification_count, analysis_history')
    .eq('source', ao.source)
    .eq('source_id', ao.source_id)
    .maybeSingle();
  
  if (error) {
    // Si l'erreur n'est pas "not found", on la propage
    if (error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error(`⚠️ Erreur lors de la recherche d'AO existant ${ao.source_id}:`, error);
      throw error;
    }
  }
  
  return data || null;
}

// ═══════════════════════════════════════════════════════════
// 💾 PERSISTANCE MINIMALE
// ═══════════════════════════════════════════════════════════

/**
 * Persiste un AO minimal dans Supabase
 * Champs minimum : identité, contenu de base, dates, classification
 * Status initial : 'ingested' (non encore analysé)
 * 
 * @returns L'enregistrement créé avec id, source, source_id, status
 */
export async function persistBaseAO(ao: CanonicalAO) {
  const supabase = getSupabaseClient();
  
  const payload = {
    // Identifiants
    source: ao.source,
    source_id: ao.source_id,
    
    // Contenu de base
    title: ao.identity.title,
    description: ao.content.description || null,
    keywords: ao.content.keywords || [],
    
    // Acheteur
    acheteur: ao.identity.acheteur || null,
    acheteur_email: ao.metadata.acheteur_email || null,
    acheteur_tel: ao.metadata.acheteur_tel || null,
    
    // Dates (conversion en timestamp)
    publication_date: toTimestamp(ao.lifecycle.publication_date),
    deadline: toTimestamp(ao.lifecycle.deadline),
    
    // Classification
    type_marche: ao.classification.type_marche || null,
    region: ao.identity.region || null,
    url_ao: ao.identity.url || null,
    procedure_type: ao.classification.procedure || null,
    
    // Status initial : ingested (non encore analysé)
    status: 'ingested'
  };
  
  const { data, error } = await supabase
    .from('appels_offres')
    .insert(payload)
    .select('id, source, source_id, status')
    .single();
  
  if (error) {
    // Gestion de l'erreur de contrainte unique (race condition)
    if (error.code === '23505') { // PostgreSQL unique violation
      console.log(`ℹ️ AO ${ao.source_id} déjà présent (insertion parallèle détectée)`);
      // On retourne null pour indiquer qu'il existe déjà
      // Le prochain appel à findExistingAO le trouvera
      return null;
    }
    
    // Autre erreur : on la propage
    console.error(`⚠️ Erreur lors de l'insertion de l'AO ${ao.source_id}:`, error);
    throw error;
  }
  
  return data;
}

// ═══════════════════════════════════════════════════════════
// 🚫 GESTION DES ANNULATIONS
// ═══════════════════════════════════════════════════════════

/**
 * Marque un AO comme annulé (idempotent)
 * 
 * @param existingId - ID de l'AO en base
 * @param ao - AO canonique avec lifecycle.etat === 'AVIS_ANNULE'
 * @returns Résultat avec id et flag updated
 */
export async function markCancelledAOById(existingId: number, ao: CanonicalAO) {
  const supabase = getSupabaseClient();

  const { data: existing, error: readError } = await supabase
    .from('appels_offres')
    .select('id, status, priority, analysis_history, warnings')
    .eq('id', existingId)
    .single();

  if (readError) throw readError;
  if (!existing) throw new Error(`AO id=${existingId} introuvable`);

  // Idempotence stricte : si déjà cancelled, on ne fait rien
  if (existing.status === 'cancelled') {
    return { id: existingId, updated: false };
  }

  const now = new Date().toISOString();

  const history = Array.isArray(existing.analysis_history)
    ? existing.analysis_history
    : [];

  const cancelEvent = {
    date: now,
    event: 'cancelled',
    etat: ao.lifecycle.etat ?? null,
    source: ao.source,
    previous_status: existing.status ?? null,
    previous_priority: existing.priority ?? null,
  };

  const warnings = uniq([
    ...(Array.isArray(existing.warnings) ? existing.warnings : []),
    'cancelled_in_source',
  ]);

  const { data: updated, error: updateError } = await supabase
    .from('appels_offres')
    .update({
      status: 'cancelled',
      analysis_history: [...history, cancelEvent],
      warnings,
      analyzed_at: now,
    })
    .eq('id', existingId)
    .select('id, status')
    .single();

  if (updateError) throw updateError;

  return { id: updated.id, status: updated.status, updated: true };
}

