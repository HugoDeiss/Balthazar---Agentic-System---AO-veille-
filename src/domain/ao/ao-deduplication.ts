// src/domain/ao/ao-deduplication.ts
import type { CanonicalAO } from '../../mastra/tools/boamp-fetcher';
import { findExistingAO } from '../../persistence/ao-persistence';

// ═══════════════════════════════════════════════════════════
// 🧠 DÉCISION DE DÉDUPLICATION
// ═══════════════════════════════════════════════════════════
/**
 * Décision explicite pour chaque AO entrant
 * 
 * Les 4 cas possibles :
 * - CREATE : AO jamais vu → création
 * - SKIP : AO déjà vu, identique → ignore
 * - CANCEL : AO annulé → mise à jour status
 * - RECTIFY : AO rectifié → traitement rectificatif
 */
export type DeduplicationDecision =
  | { action: 'CREATE' }
  | { action: 'SKIP'; reason: string }
  | { action: 'CANCEL'; existingId: number }
  | { action: 'RECTIFY'; existingId: number };

// ═══════════════════════════════════════════════════════════
// 🔍 HELPERS
// ═══════════════════════════════════════════════════════════
/**
 * Normalise une chaîne en supprimant les accents pour la recherche
 * @example normalizeForSearch("annulé") → "annule"
 */
function normalizeForSearch(str: string): string {
  return str
    .normalize('NFD') // Décompose les caractères avec accents
    .replace(/[\u0300-\u036f]/g, '') // Supprime les diacritiques (accents)
    .toLowerCase();
}

/**
 * Détecte si un AO est un avis d'annulation
 * 
 * Un AO est considéré comme annulé si :
 * - etat === 'AVIS_ANNULE' (ancien format)
 * - nature_categorise contient une variante de "annulation"
 * - nature_libelle contient une variante de "annulation" ou "avis d'annulation"
 * - title contient une variante de "annulation" (fallback, champ libre)
 * 
 * Variantes détectées (insensibles à la casse et aux accents) :
 * - annulation, annulé, annule, annulée, annuler
 * - avis d'annulation, avis-annulation, avis annulation
 */
export function isCancellationNotice(ao: CanonicalAO): boolean {
  // Liste exhaustive des mots-clés d'annulation (sans accents pour normalisation)
  const cancellationKeywords = [
    'annulation',
    'annule',
    'annulee', // annulée sans accent
    'annuler'
  ];
  
  // Phrases complètes à rechercher (prioritaires)
  const cancellationPhrases = [
    'avis d\'annulation',
    'avis-annulation',
    'avis annulation',
    'avis d\'annule',
    'avis-annule',
    'avis annule'
  ];
  
  // Méthode 1 : Champ etat (source de vérité principale)
  if (ao.lifecycle.etat === 'AVIS_ANNULE') {
    return true;
  }
  
  // Méthode 2 : nature_categorise (format normalisé, source de vérité principale)
  const nature = normalizeForSearch(ao.lifecycle.nature || '');
  if (cancellationKeywords.some(keyword => nature.includes(keyword)) ||
      cancellationPhrases.some(phrase => nature.includes(normalizeForSearch(phrase)))) {
    return true;
  }
  
  // Méthode 3 : nature_libelle (format lisible, source de vérité principale)
  const natureLabel = normalizeForSearch(ao.lifecycle.nature_label || '');
  if (cancellationKeywords.some(keyword => natureLabel.includes(keyword)) ||
      cancellationPhrases.some(phrase => natureLabel.includes(normalizeForSearch(phrase)))) {
    return true;
  }
  
  // Méthode 4 : Titre/objet (champ libre, fallback uniquement)
  // On cherche d'abord les phrases complètes, puis les mots-clés
  const title = normalizeForSearch(ao.identity.title || '');
  if (cancellationPhrases.some(phrase => title.includes(normalizeForSearch(phrase)))) {
    return true;
  }
  if (cancellationKeywords.some(keyword => title.includes(keyword))) {
    return true;
  }
  
  return false;
}

// ═══════════════════════════════════════════════════════════
// 🔍 LOGIQUE DE DÉDUPLICATION
// ═══════════════════════════════════════════════════════════
/**
 * Détermine l'action à effectuer pour un AO canonique
 * 
 * Règles métier :
 * 1. Cas A — AO jamais vu → CREATE
 * 2. Cas B — AO déjà vu, identique → SKIP
 * 3. Cas C — AO annulé → CANCEL
 * 4. Cas D — AO rectifié → RECTIFY
 * 
 * @param ao - AO canonique à analyser
 * @returns Décision explicite avec action et contexte
 */
export async function deduplicateAO(
  ao: CanonicalAO
): Promise<DeduplicationDecision> {
  // Recherche de l'AO existant dans la base
  const existing = await findExistingAO(ao);

  // 🟢 CAS A — AO jamais vu
  if (!existing) {
    return { action: 'CREATE' };
  }

  // 🔴 CAS C — AO annulé
  if (isCancellationNotice(ao)) {
    return {
      action: 'CANCEL',
      existingId: existing.id
    };
  }

  // 🟠 CAS D — Rectificatif
  // Un AO est considéré comme rectificatif si :
  // - il a un annonce_lie (lien vers un AO précédent)
  // - ou il a des annonces_anterieures (renouvellement)
  if (ao.lifecycle.annonce_lie || ao.lifecycle.annonces_anterieures) {
    return {
      action: 'RECTIFY',
      existingId: existing.id
    };
  }

  // ⚪ CAS B — Doublon strict
  // L'AO existe déjà, n'est pas annulé, et n'est pas un rectificatif
  // → On skip (pas de retraitement)
  return {
    action: 'SKIP',
    reason: 'AO déjà analysé et inchangé'
  };
}

