// ════════════════════════════════════════════════════════════════
// UTILITAIRES : Détection et traitement des rectificatifs BOAMP
// ════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────

export interface Change {
  field: string;
  old?: any;
  new?: any;
  change_pct?: number;
  days_added?: number;
  similarity?: number;
}

export interface SubstantialChangeResult {
  isSubstantial: boolean;
  changes: Change[];
}

// ────────────────────────────────────────────────────────────────
// 1. DÉTECTION DU RECTIFICATIF
// ────────────────────────────────────────────────────────────────

/**
 * Détecte si un AO est un rectificatif
 * @param ao - L'appel d'offres à vérifier
 * @returns true si c'est un rectificatif
 */
export function isRectification(ao: any): boolean {
  return (
    // Méthode 1 : Champ nature_categorise
    ao.raw_json?.nature_categorise === 'avis_rectificatif' ||
    
    // Méthode 2 : Type d'avis contient "rectificatif"
    ao.raw_json?.type_avis?.toLowerCase().includes('rectificatif') ||
    
    // Méthode 3 : Présence d'un lien vers l'annonce originale
    (ao.raw_json?.annonce_lie !== null && 
     ao.raw_json?.annonce_lie !== undefined &&
     ao.raw_json?.annonce_lie !== '')
  );
}

// ────────────────────────────────────────────────────────────────
// 2. RETROUVER L'AO ORIGINAL
// ────────────────────────────────────────────────────────────────

/**
 * Retrouve l'AO original à partir d'un rectificatif
 * Utilise plusieurs stratégies avec fallback
 * @param rectificationAO - Le rectificatif
 * @returns L'AO original ou null
 */
export async function findOriginalAO(rectificationAO: any): Promise<any | null> {
  console.log(`🔍 Recherche de l'AO original pour rectificatif: ${rectificationAO.title}`);
  
  // ────────────────────────────────────────────────────────────────
  // Stratégie 1 : Via annonce_lie (ID BOAMP de l'original)
  // ────────────────────────────────────────────────────────────────
  if (rectificationAO.raw_json?.annonce_lie) {
    const annonceId = rectificationAO.raw_json.annonce_lie;
    console.log(`  → Tentative 1 : Recherche par annonce_lie = "${annonceId}"`);
    
    // Essayer avec source_id (car annonce_lie contient l'idweb)
    const { data: bySourceId, error: error1 } = await supabase
      .from('appels_offres')
      .select('*')
      .eq('source_id', annonceId)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (bySourceId) {
      console.log(`  ✅ Trouvé via source_id`);
      return bySourceId;
    }
    
    // Essayer avec boamp_id
    const { data: byBoampId, error: error2 } = await supabase
      .from('appels_offres')
      .select('*')
      .eq('boamp_id', annonceId)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (byBoampId) {
      console.log(`  ✅ Trouvé via boamp_id`);
      return byBoampId;
    }
    
    console.log(`  ❌ Non trouvé via annonce_lie`);
  }
  
  // ────────────────────────────────────────────────────────────────
  // Stratégie 2 : Via titre similaire + même acheteur (fallback)
  // ────────────────────────────────────────────────────────────────
  if (rectificationAO.acheteur && rectificationAO.title) {
    console.log(`  → Tentative 2 : Recherche par acheteur + titre similaire`);
    
    // Extraire les 50 premiers caractères du titre (partie stable)
    const titlePrefix = rectificationAO.title.substring(0, 50);
    
    const { data: bySimilarity, error: error3 } = await supabase
      .from('appels_offres')
      .select('*')
      .eq('acheteur', rectificationAO.acheteur)
      .ilike('title', `%${titlePrefix}%`)
      .neq('source_id', rectificationAO.source_id) // Exclure lui-même
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (bySimilarity) {
      console.log(`  ✅ Trouvé via similarité (acheteur + titre)`);
      return bySimilarity;
    }
    
    console.log(`  ❌ Non trouvé via similarité`);
  }
  
  // ────────────────────────────────────────────────────────────────
  // Stratégie 3 : Via normalized_id (si disponible)
  // ────────────────────────────────────────────────────────────────
  if (rectificationAO.normalized_id) {
    console.log(`  → Tentative 3 : Recherche par normalized_id`);
    
    const { data: byNormalizedId, error: error4 } = await supabase
      .from('appels_offres')
      .select('*')
      .eq('normalized_id', rectificationAO.normalized_id)
      .neq('source_id', rectificationAO.source_id)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (byNormalizedId) {
      console.log(`  ✅ Trouvé via normalized_id`);
      return byNormalizedId;
    }
    
    console.log(`  ❌ Non trouvé via normalized_id`);
  }
  
  console.log(`  ⚠️ AO original introuvable (sera traité comme nouveau)`);
  return null;
}

// ────────────────────────────────────────────────────────────────
// 3. DÉTECTION DES CHANGEMENTS SUBSTANTIELS
// ────────────────────────────────────────────────────────────────

/**
 * Détecte si les changements entre deux versions d'un AO sont substantiels
 * @param oldAO - Version originale
 * @param newAO - Version rectifiée
 * @returns Résultat avec flag isSubstantial et liste des changements
 */
export function detectSubstantialChanges(
  oldAO: any,
  newAO: any
): SubstantialChangeResult {
  const changes: Change[] = [];
  let isSubstantial = false;
  
  // ────────────────────────────────────────────────────────────────
  // 1. Budget modifié > 20%
  // ────────────────────────────────────────────────────────────────
  if (oldAO.budget_max && newAO.budget_max) {
    const pct = Math.abs((newAO.budget_max - oldAO.budget_max) / oldAO.budget_max);
    if (pct > 0.2) {
      changes.push({
        field: 'budget',
        old: oldAO.budget_max,
        new: newAO.budget_max,
        change_pct: Math.round(pct * 100)
      });
      isSubstantial = true;
    }
  }
  
  // ────────────────────────────────────────────────────────────────
  // 2. Deadline prolongée > 7 jours
  // ────────────────────────────────────────────────────────────────
  if (oldAO.deadline && newAO.deadline) {
    const oldDate = new Date(oldAO.deadline);
    const newDate = new Date(newAO.deadline);
    const days = Math.abs((newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (days > 7) {
      changes.push({
        field: 'deadline',
        old: oldAO.deadline,
        new: newAO.deadline,
        days_added: Math.round(days)
      });
      isSubstantial = true;
    }
  }
  
  // ────────────────────────────────────────────────────────────────
  // 3. Critères financiers modifiés (CAP_ECO)
  // ────────────────────────────────────────────────────────────────
  const oldCapEco = extractCapEco(oldAO);
  const newCapEco = extractCapEco(newAO);
  
  if (JSON.stringify(oldCapEco) !== JSON.stringify(newCapEco)) {
    changes.push({
      field: 'financial_criteria',
      old: oldCapEco,
      new: newCapEco
    });
    isSubstantial = true;
  }
  
  // ────────────────────────────────────────────────────────────────
  // 4. Critères techniques modifiés (CAP_TECH)
  // ────────────────────────────────────────────────────────────────
  const oldCapTech = extractCapTech(oldAO);
  const newCapTech = extractCapTech(newAO);
  
  if (JSON.stringify(oldCapTech) !== JSON.stringify(newCapTech)) {
    changes.push({
      field: 'technical_criteria',
      old: oldCapTech,
      new: newCapTech
    });
    isSubstantial = true;
  }
  
  // ────────────────────────────────────────────────────────────────
  // 5. Type de marché changé
  // ────────────────────────────────────────────────────────────────
  if (oldAO.type_marche && newAO.type_marche && oldAO.type_marche !== newAO.type_marche) {
    changes.push({
      field: 'type_marche',
      old: oldAO.type_marche,
      new: newAO.type_marche
    });
    isSubstantial = true;
  }
  
  // ────────────────────────────────────────────────────────────────
  // 6. Région changée
  // ────────────────────────────────────────────────────────────────
  if (oldAO.region && newAO.region && oldAO.region !== newAO.region) {
    changes.push({
      field: 'region',
      old: oldAO.region,
      new: newAO.region
    });
    isSubstantial = true;
  }
  
  // ────────────────────────────────────────────────────────────────
  // 7. Titre significativement changé (< 80% similarité)
  // ────────────────────────────────────────────────────────────────
  if (oldAO.title && newAO.title) {
    const similarity = calculateLevenshteinSimilarity(oldAO.title, newAO.title);
    if (similarity < 0.8) {
      changes.push({
        field: 'title',
        similarity: Math.round(similarity * 100) / 100
      });
      isSubstantial = true;
    }
  }
  
  // ────────────────────────────────────────────────────────────────
  // Log des changements détectés
  // ────────────────────────────────────────────────────────────────
  if (changes.length > 0) {
    console.log(`📋 Changements détectés (${isSubstantial ? 'SUBSTANTIELS' : 'mineurs'}):`);
    changes.forEach(c => {
      if (c.field === 'budget') {
        console.log(`  - Budget: ${c.old}€ → ${c.new}€ (+${c.change_pct}%)`);
      } else if (c.field === 'deadline') {
        console.log(`  - Deadline prolongée de ${c.days_added} jours`);
      } else if (c.field === 'financial_criteria') {
        console.log(`  - Critères financiers modifiés`);
      } else if (c.field === 'technical_criteria') {
        console.log(`  - Critères techniques modifiés`);
      } else if (c.field === 'type_marche') {
        console.log(`  - Type de marché: ${c.old} → ${c.new}`);
      } else if (c.field === 'region') {
        console.log(`  - Région: ${c.old} → ${c.new}`);
      } else if (c.field === 'title') {
        console.log(`  - Titre modifié (similarité: ${c.similarity})`);
      }
    });
  }
  
  return { isSubstantial, changes };
}

// ────────────────────────────────────────────────────────────────
// FONCTIONS UTILITAIRES
// ────────────────────────────────────────────────────────────────

/**
 * Extrait les critères financiers (CAP_ECO) depuis le JSON BOAMP
 */
function extractCapEco(ao: any): any {
  try {
    const donnees = typeof ao.raw_json?.donnees === 'string'
      ? JSON.parse(ao.raw_json.donnees)
      : ao.raw_json?.donnees;
    
    return donnees?.CONDITION_PARTICIPATION?.CAP_ECO || null;
  } catch (e) {
    return null;
  }
}

/**
 * Extrait les critères techniques (CAP_TECH) depuis le JSON BOAMP
 */
function extractCapTech(ao: any): any {
  try {
    const donnees = typeof ao.raw_json?.donnees === 'string'
      ? JSON.parse(ao.raw_json.donnees)
      : ao.raw_json?.donnees;
    
    return donnees?.CONDITION_PARTICIPATION?.CAP_TECH || null;
  } catch (e) {
    return null;
  }
}

/**
 * Calcule la similarité entre deux chaînes (Levenshtein)
 * @returns Nombre entre 0 (différent) et 1 (identique)
 */
export function calculateLevenshteinSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calcule la distance de Levenshtein entre deux chaînes
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  // Initialisation
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  // Calcul
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Génère un résumé textuel des changements pour l'email
 */
export function formatChangesForEmail(changes: Change[]): string {
  return changes.map(c => {
    if (c.field === 'budget') {
      return `• Budget : ${formatCurrency(c.old)} → ${formatCurrency(c.new)} (+${c.change_pct}%)`;
    } else if (c.field === 'deadline') {
      return `• Deadline prolongée de ${c.days_added} jours`;
    } else if (c.field === 'financial_criteria') {
      return `• Critères financiers modifiés`;
    } else if (c.field === 'technical_criteria') {
      return `• Critères techniques modifiés`;
    } else if (c.field === 'type_marche') {
      return `• Type de marché : ${c.old} → ${c.new}`;
    } else if (c.field === 'region') {
      return `• Région : ${c.old} → ${c.new}`;
    } else if (c.field === 'title') {
      return `• Titre modifié (similarité : ${(c.similarity! * 100).toFixed(0)}%)`;
    }
    return `• ${c.field} modifié`;
  }).join('\n');
}

/**
 * Formate un montant en euros
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

