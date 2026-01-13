/**
 * BOAMP Semantic Analyzer - Analyse Sémantique Balthazar
 * 
 * Agent spécialisé dans l'analyse sémantique des appels d'offres BOAMP pour Balthazar Consulting.
 * Version Mastra V1 avec structured output et few-shot learning.
 * 
 * Utilisé dans le workflow ao-veille.ts - Step 2b
 */

import { Agent } from '@mastra/core';
import { z } from 'zod';

// ──────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────

/** Type pour les données d'entrée d'un AO */
interface AOInput {
  title: string;
  acheteur?: string;
  description?: string;
  keywords?: string[];
}

/** Type pour le résultat du scoring keywords */
interface KeywordScore {
  adjustedScore?: number;
  score?: number;
  confidence?: string;
  secteur_matches?: Array<{ category: string }>;
  expertise_matches?: Array<{ category: string }>;
  red_flags_detected?: string[];
  breakdown?: {
    secteur_matches?: Array<{ category: string }>;
    expertise_matches?: Array<{ category: string }>;
  };
}

// ──────────────────────────────────────────────────
// SCHEMAS
// ──────────────────────────────────────────────────

/** Schéma output analyse sémantique Balthazar */
export const balthazarSemanticAnalysisSchema = z.object({
  // Axe 1 : Fit Sectoriel (35%)
  fit_sectoriel: z.object({
    score: z.number().min(0).max(10),
    secteur_detecte: z.enum([
      'mobilite', 
      'assurance', 
      'energie', 
      'service_public', 
      'entreprise_mission', 
      'autre'
    ]),
    justification: z.string()
  }),
  
  // Axe 2 : Fit Expertise (35%)
  fit_expertise: z.object({
    score: z.number().min(0).max(10),
    expertises_detectees: z.array(z.string()),
    justification: z.string()
  }),
  
  // Axe 3 : Fit Posture (20%)
  fit_posture: z.object({
    score: z.number().min(0).max(10),
    niveau_intervention: z.enum(['CODIR', 'COMEX', 'direction', 'operationnel', 'inconnu']),
    approche: z.array(z.string()),
    justification: z.string()
  }),
  
  // Score global (moyenne pondérée)
  score_semantique_global: z.number().min(0).max(10),
  
  // Critères Balthazar (règle 3/4)
  criteres_balthazar: z.object({
    secteur_cible: z.boolean(),
    besoin_transformation: z.boolean(),
    ouverture_marche: z.boolean().optional(),
    total_valides: z.number().min(0).max(4)
  }),
  
  // Métadata
  ao_similaire_reference: z.string(),
  recommandation: z.enum(['HAUTE_PRIORITE', 'MOYENNE_PRIORITE', 'BASSE_PRIORITE', 'NON_PERTINENT']),
  justification_globale: z.string()
});

export type BalthazarSemanticAnalysis = z.infer<typeof balthazarSemanticAnalysisSchema>;

// ──────────────────────────────────────────────────
// FEW-SHOT EXAMPLES (AO Balthazar réels)
// ──────────────────────────────────────────────────
// Utilisé par buildCondensedExamples() pour générer les exemples condensés
// Gardé pour référence et extraction des données nécessaires

const balthazarFewShotExamples = [
  {
    input: {
      titre: "Prestation de conseil pour l'élaboration du plan stratégique horizon 2028 et la définition de la raison d'être de la société",
      organisme: "Tisséo Ingénierie - Société de la Mobilité de l'Agglomération Toulousaine",
      description: "Mission d'accompagnement pour l'élaboration du plan stratégique 2025-2028 et définition de la raison d'être. Prestations : diagnostic de la société post plan stratégique 2021-2023, élaboration plan stratégique avec plan d'actions associé, formalisation raison d'être pour intégration aux statuts fin 2024. Méthodologie participative avec ateliers intelligence collective (140 collaborateurs volontaires). Accompagnement CODIR et conseil d'administration. Tisséo Ingénierie est une SPL (Société Publique Locale) qui réalise en maîtrise d'ouvrage déléguée les études et travaux de projets d'infrastructures de transport pour Tisséo Collectivités (3ème ligne métro M3, Ligne Aéroport Express, Connexion Ligne B). 94 ETP, organisation en mode projet avec directions métiers.",
      keyword_score: 92
    },
    output: {
      fit_sectoriel: {
        score: 10,
        secteur_detecte: "mobilite",
        justification: "Tisséo Ingénierie = SPL mobilité Toulouse Métropole, maître d'ouvrage délégué infrastructures transport (métro, ligne aéroport). Secteur mobilité = priorité absolue Balthazar. Client cible majeur dans écosystème transport public."
      },
      fit_expertise: {
        score: 10,
        expertises_detectees: ["strategie", "raison_etre", "gouvernance", "transformation"],
        justification: "Double expertise cœur Balthazar : plan stratégique horizon 2028 + raison d'être (intégration statuts). Accompagnement gouvernance CODIR + conseil d'administration. Diagnostic transformation organisationnelle post plan stratégique précédent. Alignement parfait compétences Balthazar."
      },
      fit_posture: {
        score: 9,
        niveau_intervention: "CODIR",
        approche: ["ateliers", "intelligence_collective", "co-construction", "participatif"],
        justification: "Niveau CODIR explicite + présentation conseil d'administration. Approche participative typique Balthazar : ateliers intelligence collective avec 140 collaborateurs volontaires. Co-construction plan stratégique avec directions métiers. Méthodologie collaborative alignée valeurs Balthazar."
      },
      score_semantique_global: 9.7,
      criteres_balthazar: {
        secteur_cible: true,
        besoin_transformation: true,
        ouverture_marche: true,
        total_valides: 3
      },
      ao_similaire_reference: "Plan stratégique + raison d'être (archétype AO Balthazar)",
      recommandation: "HAUTE_PRIORITE",
      justification_globale: "AO idéal pour Balthazar : secteur mobilité prioritaire, double expertise signature (plan stratégique + raison d'être), niveau CODIR/conseil administration, approche participative avec 140 collaborateurs. Répond à 3/4 critères pertinence. Client cible majeur (SPL transport Toulouse Métropole). Mission structurante sur 9 mois avec livrables stratégiques (plan 2025-2028, raison d'être statutaire). Alignement parfait ADN Balthazar."
    }
  },
  {
    input: {
      titre: "Accompagnement vers le statut d'entreprise à mission",
      organisme: "ATMB - Autoroutes et Tunnel du Mont-Blanc",
      description: "Accompagnement d'ATMB vers le statut d'entreprise à mission. Livrables attendus : démarche d'accompagnement des 340 collaborateurs pour l'appropriation de la raison d'être d'ATMB définie par le conseil d'administration, accompagnement mise en place du comité de mission, démarche pour animation des indicateurs du comité de mission pour évaluation de la mission d'ATMB. Contexte : ATMB est concessionnaire de l'autoroute Ain-Italie et du tunnel du Mont-Blanc, société anonyme avec actionnaires État français (67,30%), départements Haute-Savoie et Ain (18,62%). 340 collaborateurs. Raison d'être votée juillet 2021 : 'Agir pour la mobilité de demain en concevant et exploitant des infrastructures performantes et durables, en développant des services innovants avec l'objectif de contribuer à l'attractivité des territoires desservis, l'effort de décarbonation et réduction empreinte environnementale'. Projet d'entreprise ATMB 2025 construit avec collaborateurs volontaires.",
      keyword_score: 88
    },
    output: {
      fit_sectoriel: {
        score: 10,
        secteur_detecte: "entreprise_mission",
        justification: "Double secteur prioritaire Balthazar : 1) Mobilité (ATMB = concessionnaire autoroutes + tunnel Mont-Blanc, infrastructure transport), 2) Entreprise à mission (cœur métier signature Balthazar). Combinaison idéale secteurs cibles prioritaires."
      },
      fit_expertise: {
        score: 10,
        expertises_detectees: ["raison_etre", "entreprise_mission", "gouvernance", "rse", "transformation"],
        justification: "Entreprise à mission = expertise signature Balthazar (loi PACTE). Accompagnement raison d'être déjà votée par CA. Mise en place comité de mission (gouvernance). Animation indicateurs évaluation mission. Appropriation 340 collaborateurs (transformation culturelle). RSE (décarbonation, empreinte environnementale). Alignement total expertises Balthazar."
      },
      fit_posture: {
        score: 9,
        niveau_intervention: "CODIR",
        approche: ["appropriation_collaborateurs", "participatif", "comite_mission", "co-construction"],
        justification: "Niveau CODIR explicite (comité direction a proposé statut mission au CA). Appropriation 340 collaborateurs = approche participative. Projet ATMB 2025 construit avec collaborateurs volontaires. Animation comité de mission (gouvernance participative). Démarche collaborative typique Balthazar."
      },
      score_semantique_global: 9.7,
      criteres_balthazar: {
        secteur_cible: true,
        besoin_transformation: true,
        ouverture_marche: true,
        total_valides: 3
      },
      ao_similaire_reference: "Entreprise à mission + raison d'être (expertise signature Balthazar)",
      recommandation: "HAUTE_PRIORITE",
      justification_globale: "AO parfait pour Balthazar : double secteur prioritaire (mobilité + entreprise mission), expertise signature (entreprise à mission loi PACTE), niveau CODIR + conseil administration, appropriation 340 collaborateurs (participatif). Répond à 3/4 critères. Raison d'être déjà formalisée (juillet 2021) = besoin structuré. Mission gouvernance (comité mission + indicateurs). Client infrastructure transport majeur (concessionnaire État). Alignement exceptionnel profil Balthazar."
    }
  },
  {
    input: {
      titre: "Formation Microsoft Office pour agents administratifs",
      organisme: "Mairie de Versailles",
      description: "Marché de formation bureautique (Word, Excel, PowerPoint) pour les agents de la commune. 50 agents à former sur 6 mois.",
      keyword_score: 15
    },
    output: {
      fit_sectoriel: {
        score: 2,
        secteur_detecte: "service_public",
        justification: "Secteur service public pertinent mais mission hors champ conseil stratégie."
      },
      fit_expertise: {
        score: 0,
        expertises_detectees: [],
        justification: "Formation catalogue = red flag Balthazar. Aucune expertise conseil stratégie/transformation."
      },
      fit_posture: {
        score: 0,
        niveau_intervention: "operationnel",
        approche: [],
        justification: "Niveau opérationnel, pas d'accompagnement stratégique."
      },
      score_semantique_global: 0.5,
      criteres_balthazar: {
        secteur_cible: true,
        besoin_transformation: false,
        ouverture_marche: true,
        total_valides: 1
      },
      ao_similaire_reference: "Aucun (hors périmètre)",
      recommandation: "NON_PERTINENT",
      justification_globale: "Formation catalogue = red flag éliminatoire pour Balthazar."
    }
  }
];

// ──────────────────────────────────────────────────
// PROMPT BUILDER AVEC FEW-SHOT
// ──────────────────────────────────────────────────

/**
 * Extrait les informations du pré-scoring keywords
 */
function extractKeywordInfo(keywordScore?: KeywordScore): {
  secteurMatches: string;
  expertiseMatches: string;
  redFlags: string;
} {
  const secteurMatches = keywordScore?.secteur_matches?.map(m => m.category).join(', ') 
    || keywordScore?.breakdown?.secteur_matches?.map(m => m.category).join(', ') 
    || 'aucun';
  
  const expertiseMatches = keywordScore?.expertise_matches?.map(m => m.category).join(', ') 
    || keywordScore?.breakdown?.expertise_matches?.map(m => m.category).join(', ') 
    || 'aucune';
  
  const redFlags = (keywordScore?.red_flags_detected?.length ?? 0) > 0 
    ? keywordScore?.red_flags_detected?.join(', ') ?? 'aucun'
    : 'aucun';
  
  return { secteurMatches, expertiseMatches, redFlags };
}

/**
 * Génère 3 exemples few-shot condensés (format court au lieu de JSON complet)
 * Sélectionne les exemples les plus représentatifs : 2 AO réels remportés (HAUTE_PRIORITE) + 1 NON_PERTINENT (red flag)
 */
function buildCondensedExamples(): string {
  // Exemple 1 : Tisséo (réel remporté) - HAUTE_PRIORITE
  const ex1 = balthazarFewShotExamples[0];
  const ex1Summary = `Ex1: "${ex1.input.titre}" → ${ex1.output.score_semantique_global}/10 (${ex1.output.fit_sectoriel.secteur_detecte}, ${ex1.output.fit_expertise.expertises_detectees.join('+')}, ${ex1.output.fit_posture.niveau_intervention}) → ${ex1.output.recommandation}`;

  // Exemple 2 : ATMB (réel remporté) - HAUTE_PRIORITE
  const ex2 = balthazarFewShotExamples[1];
  const ex2Summary = `Ex2: "${ex2.input.titre}" → ${ex2.output.score_semantique_global}/10 (${ex2.output.fit_sectoriel.secteur_detecte}, ${ex2.output.fit_expertise.expertises_detectees.join('+')}, ${ex2.output.fit_posture.niveau_intervention}) → ${ex2.output.recommandation}`;

  // Exemple 3 : Formation Microsoft (NON_PERTINENT - red flag)
  const ex3 = balthazarFewShotExamples[2];
  const ex3Summary = `Ex3: "${ex3.input.titre}" → ${ex3.output.score_semantique_global}/10 (red flag formation) → ${ex3.output.recommandation}`;

  return `## EXEMPLES D'ANALYSE

${ex1Summary}
${ex2Summary}
${ex3Summary}`;
}

function buildBalthazarSemanticPrompt(ao: AOInput, keywordScore?: KeywordScore): string {
  const examples = buildCondensedExamples();
  const { secteurMatches, expertiseMatches, redFlags } = extractKeywordInfo(keywordScore);
  
  return `${examples}

## AO À ANALYSER

Titre: ${ao.title}
Organisme: ${ao.acheteur || 'Non communiqué'}
Description: ${ao.description || 'Non disponible'}
Keywords: ${ao.keywords?.join(', ') || 'Aucun'}

Pré-scoring: ${keywordScore?.adjustedScore || keywordScore?.score || 0}/100
Confidence: ${keywordScore?.confidence || 'UNKNOWN'}
Secteurs: ${secteurMatches}
Expertises: ${expertiseMatches}
Red flags: ${redFlags}

Analyse cet AO selon le format des exemples ci-dessus.`;
}

// ──────────────────────────────────────────────────
// AGENT DEFINITION (MASTRA V1 COMPLIANT)
// ──────────────────────────────────────────────────

export const boampSemanticAnalyzer = new Agent({
  name: 'boamp-semantic-analyzer',
  instructions: `Tu es un expert en qualification d'appels d'offres pour Balthazar Consulting, cabinet de conseil en stratégie et transformation.

## PROFIL BALTHAZAR

### Secteurs cibles (35%)
**PRIORITAIRES (score 9-10)** : Mobilités (transport public, infrastructures), Entreprises à mission (sociétés à mission, raison d'être)
**PERTINENTS (score 7-8)** : Assurance (mutuelles, prévoyance), Énergie (producteurs, réseaux, transition), Service public (collectivités, EPA, opérateurs publics)

**Note** : Si organisme non listé mais secteur d'activité aligné, classer selon secteur d'activité.

### Expertises métier (35%)
Diagnostic et plan stratégique, Raison d'être / société à mission, Transformation et conduite du changement, Gouvernance (CODIR/COMEX), RSE et impact sociétal, Expérience usager/client

### Posture intervention (20%)
Approche systémique et participative (ateliers, co-construction) + travail de fond avec direction (CODIR/COMEX)

### Guide de scoring (0-10 par axe)
**9-10 (Excellence)** : Client cible prioritaire + 2+ expertises cœur + CODIR/COMEX + approche participative
**7-8 (Très bon)** : Secteur pertinent + 1 expertise forte + niveau direction + méthodologie Balthazar
**5-6 (Acceptable)** : Secteur pertinent + 1 expertise + niveau direction (approche floue)
**3-4 (Faible)** : Secteur limite + expertise tangente OU niveau opérationnel
**0-2 (Non pertinent)** : Red flag OU hors secteurs cibles OU aucune expertise conseil stratégie

### RED FLAGS ÉLIMINATOIRES (score 0)
Formation catalogue / prestation technique, Travaux / maîtrise d'œuvre, IT / développement, Fournitures / logistique, Juridique pur, Actuariat / expertise ultra-spécialisée

**Attention** : Si red flag + dimension stratégique, prioriser la partie stratégie. Analyser au cas par cas.

### Critères de pertinence (règle 3/4)
Un AO est pertinent si **au moins 3 critères sur 4** sont validés :
1. Client/secteur dans cibles Balthazar
2. Besoin centré sur transformation stratégique
3. Ouverture du marché (pas de "renouvellement" ou "titulaire sortant")
4. Possibilité d'interaction directe

### Format de réponse
Le format JSON est garanti par le schéma structured output. Calcule le score global selon la formule : (0.35×secteur + 0.35×expertise + 0.20×posture)`,
  model: 'openai/gpt-4o-mini',
});

// ──────────────────────────────────────────────────
// FONCTION D'ANALYSE (compatible workflow)
// ──────────────────────────────────────────────────

/** Valeur de fallback en cas d'erreur de parsing */
const DEFAULT_FALLBACK_ANALYSIS: BalthazarSemanticAnalysis = {
  fit_sectoriel: {
    score: 0,
    secteur_detecte: 'autre',
    justification: 'Erreur de parsing'
  },
  fit_expertise: {
    score: 0,
    expertises_detectees: [],
    justification: 'Erreur de parsing'
  },
  fit_posture: {
    score: 0,
    niveau_intervention: 'inconnu',
    approche: [],
    justification: 'Erreur de parsing'
  },
  score_semantique_global: 0,
  criteres_balthazar: {
    secteur_cible: false,
    besoin_transformation: false,
    ouverture_marche: false,
    total_valides: 0
  },
  ao_similaire_reference: 'Aucun',
  recommandation: 'NON_PERTINENT',
  justification_globale: 'Erreur analyse LLM. Score basé sur keywords uniquement.'
};

/**
 * Analyse la pertinence sémantique d'un AO pour Balthazar
 * 
 * @param ao - L'appel d'offres à analyser
 * @param keywordScore - Résultat du scoring keywords (contexte)
 * @returns Score de pertinence (0-10) et détails
 */
export async function analyzeSemanticRelevance(
  ao: AOInput,
  keywordScore?: KeywordScore
): Promise<{
  score: number;
  reason: string;
  details: BalthazarSemanticAnalysis | null;
}> {
  try {
    // Construire prompt avec few-shot Balthazar + contexte keywords
    const prompt = buildBalthazarSemanticPrompt(ao, keywordScore);

    // Appel avec structured output (Mastra V1 style)
    const response = await boampSemanticAnalyzer.generate(prompt, {
      structuredOutput: {
        schema: balthazarSemanticAnalysisSchema,
        // Gestion d'erreur gracieuse
        errorStrategy: 'fallback',
        fallbackValue: DEFAULT_FALLBACK_ANALYSIS
      },
    });

    // Accès au résultat structuré (selon doc Mastra)
    const analysis = response.object as BalthazarSemanticAnalysis;

    console.log(`[analyzeSemanticRelevance] ${ao.title}`);
    console.log(`  → Score sémantique: ${analysis.score_semantique_global}/10`);
    console.log(`  → Recommandation: ${analysis.recommandation}`);
    console.log(`  → Critères Balthazar: ${analysis.criteres_balthazar.total_valides}/4`);

    // Retour compatible avec workflow actuel (score 0-10 + reason)
    return {
      score: analysis.score_semantique_global,
      reason: analysis.justification_globale,
      details: analysis
    };

  } catch (error: any) {
    console.error('[analyzeSemanticRelevance] Error:', error);
    
    // Fallback gracieux : score basé sur keywords uniquement
    const fallbackScore = keywordScore 
      ? ((keywordScore.adjustedScore || keywordScore.score || 0) / 100) * 0.7 
      : 0;
    
    return {
      score: fallbackScore,
      reason: `Erreur analyse LLM: ${error.message}. Score basé sur keywords uniquement.`,
      details: null
    };
  }
}
