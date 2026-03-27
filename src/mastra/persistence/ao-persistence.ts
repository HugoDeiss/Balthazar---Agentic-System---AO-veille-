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
 * Une seule requête DB par source au lieu de N requêtes individuelles.
 * Utilise aussi uuid_procedure comme fallback pour les AO dont le source_id peut varier (ex: MarchesOnline).
 *
 * @param aos - Tableau d'AO avec source, source_id et optionnellement uuid_procedure
 * @param options - supabaseClient pour réutiliser le même client que la sauvegarde (évite décalage/RLS)
 * @returns Map<source_id, boolean> indiquant si chaque AO est déjà analysé
 */
export async function checkBatchAlreadyAnalyzed(
  aos: Array<{ source: string; source_id: string; uuid_procedure?: string | null }>,
  options?: { supabaseClient?: SupabaseClient }
): Promise<Map<string, boolean>> {
  const supabase = options?.supabaseClient ?? getSupabaseClient();
  const result = new Map<string, boolean>();

  if (aos.length === 0) {
    return result;
  }

  // Initialiser tous les AO à false (par défaut: non analysés)
  aos.forEach(ao => {
    if (!result.has(ao.source_id)) {
      result.set(ao.source_id, false);
    }
  });

  // 1. Requête par (source, source_id)
  // Critère: status='analyzed' ET analyzed_at non null
  const bySource = new Map<string, string[]>();
  for (const ao of aos) {
    const source = ao.source || 'BOAMP';
    if (!bySource.has(source)) {
      bySource.set(source, []);
    }
    bySource.get(source)!.push(ao.source_id);
  }

  for (const [source, ids] of bySource.entries()) {
    const sourceIds = [...new Set(ids)];

    const { data, error } = await supabase
      .from('appels_offres')
      .select('source_id, status, analyzed_at')
      .eq('source', source)
      .in('source_id', sourceIds)
      .eq('status', 'analyzed')
      .not('analyzed_at', 'is', null);

    if (error) {
      console.warn(`⚠️ Erreur vérification batch AO (source=${source}):`, error);
      continue;
    }

    const analyzedIds = new Set((data || []).map(ao => ao.source_id));
    sourceIds.forEach(id => {
      if (analyzedIds.has(id)) {
        result.set(id, true);
      }
    });
  }

  // 2. Fallback par uuid_procedure pour les AO non trouvés (source_id peut varier entre fetches)
  const aosWithUuid = aos.filter(ao => {
    const uuid = ao.uuid_procedure?.trim?.() || (ao as any).raw_json?.uuid_procedure;
    return uuid && !result.get(ao.source_id);
  });
  if (aosWithUuid.length > 0) {
    const uuids = [...new Set(aosWithUuid.map(ao => (ao.uuid_procedure?.trim?.() || (ao as any).raw_json?.uuid_procedure)?.toLowerCase?.()))].filter(Boolean);
    if (uuids.length > 0) {
      const { data: uuidData, error: uuidError } = await supabase
        .from('appels_offres')
        .select('uuid_procedure, source_id')
        .in('uuid_procedure', uuids)
        .eq('status', 'analyzed')
        .not('analyzed_at', 'is', null);

      if (!uuidError && uuidData && uuidData.length > 0) {
        const analyzedUuids = new Set(uuidData.map(r => (r.uuid_procedure as string)?.toLowerCase?.()).filter(Boolean));
        aosWithUuid.forEach(ao => {
          const uuid = (ao.uuid_procedure?.trim?.() || (ao as any).raw_json?.uuid_procedure)?.toLowerCase?.();
          if (uuid && analyzedUuids.has(uuid)) {
            result.set(ao.source_id, true);
          }
        });
      }
    }
  }

  const foundCount = [...result.values()].filter(Boolean).length;
  console.log(`🔍 checkBatchAlreadyAnalyzed: ${foundCount}/${aos.length} AO déjà analysés trouvés en DB`);
  if (foundCount === 0 && aos.length > 0) {
    const sampleIds = aos.slice(0, 3).map(a => `${a.source}:${a.source_id}`);
    console.log(`   ⚠️ Aucun trouvé — ex. IDs recherchés: ${sampleIds.join(', ')}${aos.length > 3 ? '...' : ''}`);
  }

  return result;
}

