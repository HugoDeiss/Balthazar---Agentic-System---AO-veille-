// src/persistence/ao-persistence.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
// 🔍 VÉRIFICATION D'ANALYSE
// ═══════════════════════════════════════════════════════════

/**
 * Vérifie si un AO est déjà analysé (status = 'analyzed' avec analyzed_at)
 * Utilisé pour éviter de re-analyser les AO lors des retries
 * 
 * @param source - Source de l'AO ('BOAMP')
 * @param sourceId - ID source de l'AO
 * @returns true si l'AO est déjà analysé, false sinon
 */
export async function isAOAlreadyAnalyzed(source: string, sourceId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('appels_offres')
    .select('id, status, analyzed_at')
    .eq('source', source)
    .eq('source_id', sourceId)
    .maybeSingle();
  
  if (error) {
    // Si erreur autre que "not found", on log mais on considère comme non analysé
    if (error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.warn(`⚠️ Erreur vérification AO ${sourceId}:`, error);
    }
    return false; // En cas d'erreur, on considère comme non analysé (sécurité)
  }
  
  // L'AO est déjà analysé si :
  // 1. Il existe en base
  // 2. Son status est 'analyzed'
  // 3. Il a un analyzed_at (date d'analyse)
  if (data && data.status === 'analyzed' && data.analyzed_at) {
    return true;
  }
  
  return false;
}

/**
 * Vérifie en batch quels AO sont déjà analysés (optimisation)
 * Une seule requête DB au lieu de N requêtes individuelles
 * 
 * @param aos - Tableau d'AO avec source et source_id
 * @returns Map<source_id, boolean> indiquant si chaque AO est déjà analysé
 */
export async function checkBatchAlreadyAnalyzed(
  aos: Array<{ source: string; source_id: string }>
): Promise<Map<string, boolean>> {
  const supabase = getSupabaseClient();
  const result = new Map<string, boolean>();
  
  if (aos.length === 0) {
    return result;
  }
  
  // Récupérer tous les source_id uniques
  const sourceIds = [...new Set(aos.map(ao => ao.source_id))];
  const source = aos[0]?.source || 'BOAMP'; // Tous les AO ont la même source
  
  // Requête batch : récupérer tous les AO déjà analysés pour ces source_id
  const { data, error } = await supabase
    .from('appels_offres')
    .select('source_id, status, analyzed_at')
    .eq('source', source)
    .in('source_id', sourceIds)
    .eq('status', 'analyzed')
    .not('analyzed_at', 'is', null);
  
  if (error) {
    console.warn(`⚠️ Erreur vérification batch AO:`, error);
    // En cas d'erreur, on considère tous comme non analysés (sécurité)
    sourceIds.forEach(id => result.set(id, false));
    return result;
  }
  
  // Construire la map : source_id -> true si analysé
  const analyzedIds = new Set((data || []).map(ao => ao.source_id));
  
  // Initialiser tous à false, puis marquer ceux qui sont analysés
  aos.forEach(ao => {
    result.set(ao.source_id, analyzedIds.has(ao.source_id));
  });
  
  return result;
}

