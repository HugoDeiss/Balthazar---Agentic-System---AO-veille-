// src/utils/cross-platform-dedup.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════
// 🔧 CLIENT SUPABASE
// ═══════════════════════════════════════════════════════════

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    
    if (!url || !key) {
      throw new Error('SUPABASE_URL et SUPABASE_SERVICE_KEY doivent être définis');
    }
    
    supabaseClient = createClient(url, key);
  }
  
  return supabaseClient;
}

// ═══════════════════════════════════════════════════════════
// 🔄 UTILITAIRES DE NORMALISATION
// ═══════════════════════════════════════════════════════════

/**
 * Normalise un texte pour comparaison (supprime accents, ponctuation, etc.)
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Supprimer accents
    .replace(/[^a-z0-9\s]/g, ' ')      // Remplacer ponctuation par espaces
    .replace(/\s+/g, ' ')              // Normaliser espaces
    .trim()
    .slice(0, 100);                    // Limiter longueur
}

/**
 * Extrait UUID depuis description HTML MarchésOnline
 */
export function extractUUIDFromMarchesOnline(description: string): string | null {
  // Pattern 1: "Identifiant de la procédure: UUID"
  const pattern1 = /Identifiant\s+de\s+la\s+procédure\s*[:=]\s*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
  const match1 = description.match(pattern1);
  if (match1) return match1[1].toLowerCase();
  
  // Pattern 2: UUID seul dans le texte
  const pattern2 = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
  const match2 = description.match(pattern2);
  return match2 ? match2[0].toLowerCase() : null;
}

/**
 * Extrait SIRET depuis description
 */
export function extractSIRET(description: string): string | null {
  const siretPattern = /\b(\d{14})\b/;
  const match = description.match(siretPattern);
  return match ? match[1] : null;
}

/**
 * Extrait le numéro d'annonce BOAMP depuis description HTML MarchesOnline
 * Format attendu : "Annonce n° 26-XXXX" ou "Annonce N° 26-XXXX"
 * Ce numéro correspond au boamp_id (idweb) de BOAMP
 * 
 * Gère les problèmes d'encodage (ISO-8859-1) où le caractère ° peut être mal interprété
 */
export function extractBoampAnnouncementNumber(description: string): string | null {
  if (!description || typeof description !== 'string') return null;
  
  // Pattern 1: "Annonce n° 26-XXXX" ou "Annonce N° 26-XXXX" (avec °)
  // Gérer différents encodages : ° (U+00B0), º (U+00BA), o, O, ou espace
  // Le flux RSS est en ISO-8859-1, donc le ° peut être mal interprété
  const pattern1 = /Annonce\s+n[°ºoO\s]\s*(\d{2}-\d+)/i;
  const match1 = description.match(pattern1);
  if (match1) {
    const number = match1[1].trim();
    // Vérifier que ça ressemble à un idweb BOAMP (format XX-XXXX ou XX-XXXXX)
    if (/^\d{2}-\d{4,}$/.test(number)) {
      return number;
    }
  }
  
  // Pattern 2: "Annonce 26-XXXX" (sans le n°)
  const pattern2 = /Annonce\s+(\d{2}-\d+)/i;
  const match2 = description.match(pattern2);
  if (match2) {
    const number = match2[1].trim();
    if (/^\d{2}-\d{4,}$/.test(number)) {
      return number;
    }
  }
  
  // Pattern 3: "26-XXXX" seul (format BOAMP idweb) - chercher dans contexte d'annonce
  // On cherche un pattern qui ressemble à un idweb BOAMP près du mot "Annonce"
  const pattern3 = /Annonce[^<]*?(\d{2}-\d{4,})/i;
  const match3 = description.match(pattern3);
  if (match3) {
    const number = match3[1].trim();
    if (/^\d{2}-\d{4,}$/.test(number)) {
      return number;
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════
// 🔑 GÉNÉRATION DES CLÉS DE DÉDOUBLONNAGE
// ═══════════════════════════════════════════════════════════

/**
 * Génère les clés de dédoublonnage multi-niveaux
 * 
 * Stratégie multi-niveaux :
 * 1. UUID (99% fiabilité) - si présent
 * 2. Composite (95% fiabilité) - toujours disponible
 * 3. SIRET + deadline (80% fiabilité) - si SIRET disponible
 * 4. source_id (pour BOAMP uniquement, pas cross-platform) - si UUID absent
 */
export function generateDedupKeys(ao: {
  uuid_procedure?: string | null;
  title: string;
  acheteur: string | null;
  deadline: string | null;
  publication_date: string | null;
  siret?: string | null;
  source_id?: string | null; // 🆕 Ajouté pour fallback BOAMP
  source?: string | null; // 🆕 Ajouté pour identifier la source
}): {
  uuid_key: string | null;
  composite_key: string;
  siret_deadline_key: string | null;
  source_id_key?: string | null; // 🆕 Clé de secours pour BOAMP
} {
  // Niveau 1 : UUID (99% fiabilité)
  const uuid_key = ao.uuid_procedure || null;
  
  // Niveau 2 : Composite (titre + acheteur + deadline) - 95% fiabilité
  const titre_norm = normalizeText(ao.title);
  const acheteur_norm = normalizeText(ao.acheteur);
  const deadline_norm = ao.deadline 
    ? new Date(ao.deadline).toISOString().split('T')[0] 
    : '';
  const composite_key = `${titre_norm}|${deadline_norm}|${acheteur_norm}`;
  
  // Niveau 3 : SIRET + deadline (80% fiabilité) - si titre variable
  const siret_deadline_key = (ao.siret && deadline_norm)
    ? `${ao.siret}|${deadline_norm}`
    : null;
  
  // 🆕 Niveau 4 : source_id (pour BOAMP uniquement, pas cross-platform)
  // Utilisé uniquement si uuid_procedure est null ET source = BOAMP
  // Note: Cette clé ne peut pas être utilisée pour déduplication cross-platform
  // car MarchesOnline n'a pas de idweb équivalent
  const source_id_key = (!uuid_key && ao.source_id && ao.source === 'BOAMP') 
    ? `BOAMP:${ao.source_id}` 
    : null;
  
  return {
    uuid_key,
    composite_key,
    siret_deadline_key,
    source_id_key
  };
}

// ═══════════════════════════════════════════════════════════
// 🔍 CONSTRUCTION D'INDEX POUR MATCHING RAPIDE
// ═══════════════════════════════════════════════════════════

/**
 * Construit un index des AO existants en DB pour matching rapide
 * Une seule requête DB pour tous les AO analysés
 */
export async function buildExistingAOIndex(): Promise<{
  byUUID: Map<string, any>;
  byComposite: Map<string, any>;
  bySIRET: Map<string, any>;
  byBoampId: Map<string, any>; // 🆕 Index par boamp_id pour déduplication MarchesOnline → BOAMP
}> {
  const supabase = getSupabaseClient();
  
  const { data: existingAOs, error } = await supabase
    .from('appels_offres')
    .select('id, uuid_procedure, title, acheteur, deadline, publication_date, siret, dedup_key, siret_deadline_key, source, source_id, boamp_id') // 🆕 Ajouter boamp_id
    .eq('status', 'analyzed');
  
  if (error) {
    console.warn('⚠️ Erreur construction index AO existants:', error);
    return {
      byUUID: new Map(),
      byComposite: new Map(),
      bySIRET: new Map(),
      byBoampId: new Map()
    };
  }
  
  const byUUID = new Map<string, any>();
  const byComposite = new Map<string, any>();
  const bySIRET = new Map<string, any>();
  const byBoampId = new Map<string, any>(); // 🆕 Index par boamp_id
  
  (existingAOs || []).forEach(ao => {
    // Index par UUID
    if (ao.uuid_procedure) {
      byUUID.set(ao.uuid_procedure.toLowerCase(), ao);
    }
    
    // Index par clé composite (utiliser celle en DB ou la recalculer)
    const compositeKey = ao.dedup_key || generateDedupKeys({
      title: ao.title,
      acheteur: ao.acheteur,
      deadline: ao.deadline,
      publication_date: ao.publication_date
    }).composite_key;
    byComposite.set(compositeKey, ao);
    
    // Index par SIRET + deadline
    if (ao.siret_deadline_key) {
      bySIRET.set(ao.siret_deadline_key, ao);
    }
    
    // 🆕 Index par boamp_id (pour déduplication MarchesOnline → BOAMP)
    // Si l'AO provient de BOAMP, boamp_id = source_id (idweb)
    if (ao.boamp_id) {
      byBoampId.set(ao.boamp_id, ao);
    }
  });
  
  console.log(`📊 Index construit: ${byUUID.size} UUID, ${byComposite.size} composite, ${bySIRET.size} SIRET, ${byBoampId.size} boamp_id`);
  
  return { byUUID, byComposite, bySIRET, byBoampId };
}

// ═══════════════════════════════════════════════════════════
// 🔍 RECHERCHE DE MATCH BOAMP
// ═══════════════════════════════════════════════════════════

/**
 * Vérifie si un AO MarchesOnline existe déjà via BOAMP
 * Retourne l'AO BOAMP correspondant s'il existe, null sinon
 */
export async function findBOAMPMatch(
  marchesonlineAO: {
    uuid_procedure?: string | null;
    title: string;
    acheteur: string | null;
    deadline: string | null;
    publication_date: string | null;
    siret?: string | null;
  }
): Promise<{ source: string; source_id: string; id: number; match_strategy: string } | null> {
  const index = await buildExistingAOIndex();
  const keys = generateDedupKeys(marchesonlineAO);
  
  // Stratégie 1 : UUID (99% fiabilité)
  if (keys.uuid_key && index.byUUID.has(keys.uuid_key)) {
    const match = index.byUUID.get(keys.uuid_key);
    console.log(`✅ Match UUID: ${keys.uuid_key} → BOAMP ${match.source_id}`);
    return {
      source: match.source,
      source_id: match.source_id,
      id: match.id,
      match_strategy: 'uuid'
    };
  }
  
  // Stratégie 2 : Composite (95% fiabilité)
  if (index.byComposite.has(keys.composite_key)) {
    const match = index.byComposite.get(keys.composite_key);
    console.log(`✅ Match Composite: "${marchesonlineAO.title.slice(0, 40)}..." → BOAMP ${match.source_id}`);
    return {
      source: match.source,
      source_id: match.source_id,
      id: match.id,
      match_strategy: 'composite'
    };
  }
  
  // Stratégie 3 : SIRET + deadline (80% fiabilité)
  if (keys.siret_deadline_key && index.bySIRET.has(keys.siret_deadline_key)) {
    const match = index.bySIRET.get(keys.siret_deadline_key);
    console.log(`✅ Match SIRET: ${keys.siret_deadline_key} → BOAMP ${match.source_id}`);
    return {
      source: match.source,
      source_id: match.source_id,
      id: match.id,
      match_strategy: 'siret'
    };
  }
  
  return null;
}

/**
 * Vérifie en batch quels AO MarchesOnline ont déjà un match BOAMP
 * Optimisation: une seule construction d'index pour tous les AO
 */
export async function findBatchBOAMPMatches(
  marchesonlineAOs: Array<{
    uuid_procedure?: string | null;
    title: string;
    acheteur: string | null;
    deadline: string | null;
    publication_date: string | null;
    siret?: string | null;
    description?: string; // 🆕 Description pour extraction numéro d'annonce BOAMP
  }>
): Promise<Map<number, { source: string; source_id: string; id: number; match_strategy: string } | null>> {
  const result = new Map();
  
  if (marchesonlineAOs.length === 0) {
    return result;
  }
  
  // Construire l'index une seule fois
  const index = await buildExistingAOIndex();
  
  // Matcher chaque AO MarchesOnline
  marchesonlineAOs.forEach((moAO, idx) => {
    const keys = generateDedupKeys(moAO);
    let match = null;
    
    // 🆕 STRATÉGIE 0 : Numéro d'annonce BOAMP (100% fiabilité si présent)
    // Si MarchesOnline mentionne "Annonce n° 26-XXXX" et qu'on a un AO BOAMP avec boamp_id = "26-XXXX"
    if (moAO.description) {
      const boampAnnouncementNumber = extractBoampAnnouncementNumber(moAO.description);
      if (boampAnnouncementNumber && index.byBoampId.has(boampAnnouncementNumber)) {
        const found = index.byBoampId.get(boampAnnouncementNumber);
        match = {
          source: found.source,
          source_id: found.source_id,
          id: found.id,
          match_strategy: 'boamp_announcement_number'
        };
        console.log(`✅ Match BOAMP Annonce: "${boampAnnouncementNumber}" → BOAMP ${found.source_id}`);
      }
    }
    
    // Stratégie 1 : UUID (99% fiabilité) - seulement si pas de match par numéro d'annonce
    if (!match && keys.uuid_key && index.byUUID.has(keys.uuid_key)) {
      const found = index.byUUID.get(keys.uuid_key);
      match = {
        source: found.source,
        source_id: found.source_id,
        id: found.id,
        match_strategy: 'uuid'
      };
    }
    // Stratégie 2 : Composite (95% fiabilité) - seulement si pas de match précédent
    else if (!match && index.byComposite.has(keys.composite_key)) {
      const found = index.byComposite.get(keys.composite_key);
      match = {
        source: found.source,
        source_id: found.source_id,
        id: found.id,
        match_strategy: 'composite'
      };
    }
    // Stratégie 3 : SIRET (80% fiabilité) - seulement si pas de match précédent
    else if (!match && keys.siret_deadline_key && index.bySIRET.has(keys.siret_deadline_key)) {
      const found = index.bySIRET.get(keys.siret_deadline_key);
      match = {
        source: found.source,
        source_id: found.source_id,
        id: found.id,
        match_strategy: 'siret'
      };
    }
    
    result.set(idx, match);
  });
  
  const matchCount = Array.from(result.values()).filter(m => m !== null).length;
  const matchByStrategy = Array.from(result.values())
    .filter(m => m !== null)
    .reduce((acc: Record<string, number>, m: any) => {
      acc[m.match_strategy] = (acc[m.match_strategy] || 0) + 1;
      return acc;
    }, {});
  
  console.log(`📊 Batch matching: ${matchCount}/${marchesonlineAOs.length} AO MarchesOnline ont un match BOAMP`);
  if (Object.keys(matchByStrategy).length > 0) {
    console.log(`   Stratégies: ${JSON.stringify(matchByStrategy)}`);
  }
  
  return result;
}
