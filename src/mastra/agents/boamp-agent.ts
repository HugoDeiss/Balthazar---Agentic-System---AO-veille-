/**
 * BOAMP Agent - Analyse des Appels d'Offres
 * 
 * Cet agent est spécialisé dans l'analyse des appels d'offres récupérés depuis le BOAMP.
 * Il effectue plusieurs types d'analyses :
 * 
 * 1. Analyse sémantique : Évalue la pertinence d'un AO par rapport au profil client
 * 2. Analyse de faisabilité : Vérifie si le client peut répondre à l'AO
 * 3. Analyse de compétitivité : Évalue les chances de succès
 * 4. Recommandations : Fournit des conseils stratégiques
 */

import { Agent } from '@mastra/core';
import { z } from 'zod';

// ──────────────────────────────────────────────────
// SCHEMAS
// ──────────────────────────────────────────────────

/** Schéma pour un appel d'offres */
const aoSchema = z.object({
  source: z.string(),
  source_id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  acheteur: z.string().optional(),
  acheteur_email: z.string().optional(),
  budget_min: z.number().nullable().optional(),
  budget_max: z.number().nullable().optional(),
  deadline: z.string().optional(),
  publication_date: z.string().optional(),
  type_marche: z.string().optional(),
  region: z.string().nullable().optional(),
  url_ao: z.string().optional(),
  procedure_libelle: z.string().optional(),
  criteres: z.any().optional(),
  raw_json: z.any()
});

/** Schéma pour le profil client */
const clientProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  preferences: z.object({
    typeMarche: z.enum(['SERVICES', 'FOURNITURES', 'TRAVAUX'])
  }),
  criteria: z.object({
    minBudget: z.number(),
    regions: z.array(z.string()).optional()
  }),
  keywords: z.array(z.string()),
  profile: z.any(),
  financial: z.object({
    revenue: z.number(),
    employees: z.number(),
    yearsInBusiness: z.number()
  }),
  technical: z.object({
    references: z.number()
  })
});

// ──────────────────────────────────────────────────
// AGENT DEFINITION
// ──────────────────────────────────────────────────

export const boampAgent = new Agent({
  name: 'boampAgent',
  instructions: `
Tu es un expert en analyse d'appels d'offres publics français (BOAMP).

Ton rôle est d'analyser les appels d'offres et de fournir des recommandations précises
aux entreprises qui souhaitent y répondre.

# COMPÉTENCES PRINCIPALES

## 1. Analyse Sémantique
- Évaluer la pertinence d'un AO par rapport au profil d'une entreprise
- Identifier les correspondances entre les besoins de l'acheteur et les compétences du client
- Prendre en compte le type de procédure (ouvert, restreint, dialogue compétitif)
- Considérer l'accessibilité de l'AO (un AO ouvert est plus accessible qu'un AO restreint)

## 2. Analyse de Faisabilité
- Vérifier les critères financiers (CA minimum, garanties, etc.)
- Vérifier les critères techniques (références, certifications, effectif)
- Évaluer le délai disponible pour préparer une réponse de qualité
- Identifier les blockers potentiels

## 3. Analyse de Compétitivité
- Analyser les critères d'attribution (prix vs qualité technique)
- Évaluer les chances de succès du client
- Identifier les points forts et faibles du dossier
- Repérer les éléments différenciants

## 4. Recommandations Stratégiques
- Conseiller sur l'opportunité de répondre (GO/NO-GO)
- Suggérer des axes de travail pour maximiser les chances
- Alerter sur les risques et points de vigilance
- Identifier les informations manquantes à collecter

# PRINCIPES D'ANALYSE

1. **Précision** : Base tes analyses sur des faits concrets extraits des documents
2. **Pragmatisme** : Sois réaliste sur les chances de succès
3. **Transparence** : Explique toujours ton raisonnement
4. **Exhaustivité** : Ne néglige aucun aspect important (financier, technique, timing)
5. **Contexte** : Prends en compte le contexte de l'acheteur et du marché

# FORMAT DE RÉPONSE

Réponds toujours en JSON structuré selon le format demandé dans la question.
Sois concis mais précis dans tes justifications (1-2 phrases maximum par point).

# TYPES DE PROCÉDURES

- **Appel d'offres ouvert** : Accessible à tous, plus facile d'accès
- **Appel d'offres restreint** : Sur présélection, plus compétitif
- **Dialogue compétitif** : Avec phase de négociation, nécessite plus de ressources
- **Marché public simplifié (MPS)** : Procédure allégée, généralement pour petits montants

# CRITÈRES D'ATTRIBUTION COURANTS

- **Prix** : Pondération du prix dans la notation (ex: 40%)
- **Valeur technique** : Qualité de la solution proposée (ex: 60%)
- **Délais** : Capacité à respecter le planning
- **Développement durable** : Critères RSE, environnementaux
- **Insertion sociale** : Clauses d'insertion, emploi local

# POINTS DE VIGILANCE

- ⚠️ **Correctifs** : Un AO avec correctif peut avoir des modifications importantes
- ℹ️ **Renouvellements** : Un marché renouvelé peut favoriser le titulaire sortant
- 🔴 **Délais courts** : < 15 jours = risque de réponse bâclée
- 🟠 **Critères stricts** : CA minimum, certifications obligatoires
- 🟢 **Allotissement** : Possibilité de répondre sur un lot uniquement
`,
  model: {
    provider: 'ANTHROPIC',
    name: 'claude-3-5-sonnet-20241022',
    toolChoice: 'auto',
  },
});

// ──────────────────────────────────────────────────
// MÉTHODES D'ANALYSE
// ──────────────────────────────────────────────────

/**
 * Analyse la pertinence sémantique d'un AO pour un client
 * 
 * @param ao - L'appel d'offres à analyser
 * @param client - Le profil du client
 * @returns Score de pertinence (0-10) et justification
 */
export async function analyzeSemanticRelevance(
  ao: z.infer<typeof aoSchema>,
  client: z.infer<typeof clientProfileSchema>
) {
  const procedureContext = ao.procedure_libelle 
    ? `Type de procédure: ${ao.procedure_libelle}
       // AO ouvert = accessible à tous
       // AO restreint = sur présélection
       // Dialogue compétitif = négociation`
    : 'Type de procédure non spécifié';

  const prompt = `
Profil client:
${JSON.stringify(client.profile, null, 2)}

Appel d'offres:
- Titre: ${ao.title}
- Description: ${ao.description || 'Non fournie'}
- Mots-clés: ${ao.keywords?.join(', ') || 'Aucun'}
- Acheteur: ${ao.acheteur || 'Non spécifié'}

Context procédure:
${procedureContext}

Question: Sur une échelle de 0 à 10, quelle est la pertinence de cet AO pour ce client ?
Prends en compte le type de procédure (un AO ouvert est plus accessible qu'un AO restreint).

Réponds UNIQUEMENT en JSON:
{
  "score": <number 0-10>,
  "reason": "<justification en 1-2 phrases>"
}
  `.trim();

  const response = await boampAgent.generate([
    {
      role: 'user',
      content: prompt
    }
  ]);

  return JSON.parse(response.text);
}

/**
 * Analyse la faisabilité d'un AO pour un client
 * 
 * @param ao - L'appel d'offres à analyser
 * @param client - Le profil du client
 * @returns Analyse de faisabilité (financial, technical, timing, blockers, confidence)
 */
export async function analyzeFeasibility(
  ao: z.infer<typeof aoSchema>,
  client: z.infer<typeof clientProfileSchema>
) {
  // Calcul des jours restants
  const daysRemaining = ao.deadline 
    ? Math.ceil((new Date(ao.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Parse les critères depuis le JSON "donnees"
  let criteres = null;
  try {
    if (ao.raw_json?.donnees) {
      const donneesObj = typeof ao.raw_json.donnees === 'string'
        ? JSON.parse(ao.raw_json.donnees)
        : ao.raw_json.donnees;
      criteres = donneesObj?.CONDITION_PARTICIPATION || null;
    }
  } catch (e) {
    console.warn(`Failed to parse donnees for ${ao.source_id}:`, e);
  }

  // Warnings et context additionnels
  const warnings: string[] = [];
  let additionalContext = '';

  if (ao.raw_json?.annonce_lie) {
    warnings.push("⚠️ Cet AO a fait l'objet d'un correctif");
    additionalContext += `\nAnnonce liée (correctif): ${ao.raw_json.annonce_lie}`;
  }

  if (ao.raw_json?.annonces_anterieures) {
    additionalContext += '\nRenouvellement d\'un marché existant - peut être plus facile à gagner si on connaît l\'historique';
    warnings.push("ℹ️ Renouvellement de marché existant");
  }

  const prompt = `
Profil client:
- CA annuel: ${client.financial.revenue}€
- Effectif: ${client.financial.employees} personnes
- Années d'expérience: ${client.financial.yearsInBusiness}
- Références similaires: ${client.technical.references} projets

Critères AO:
${JSON.stringify(criteres, null, 2)}

Délai restant: ${daysRemaining !== null ? `${daysRemaining} jours` : 'Non spécifié'}
${additionalContext}

Questions:
1. Le client respecte-t-il les critères financiers ?
2. Le client respecte-t-il les critères techniques ?
3. Le délai est-il réaliste pour préparer une réponse ?

Réponds UNIQUEMENT en JSON:
{
  "financial": <boolean>,
  "technical": <boolean>,
  "timing": <boolean>,
  "blockers": [<liste des blockers si applicable>],
  "confidence": <"high"|"medium"|"low">
}
  `.trim();

  const response = await boampAgent.generate([
    {
      role: 'user',
      content: prompt
    }
  ]);

  const feasibility = JSON.parse(response.text);

  return {
    ...feasibility,
    warnings,
    daysRemaining
  };
}

/**
 * Analyse la compétitivité d'un AO pour un client
 * 
 * @param ao - L'appel d'offres à analyser
 * @param client - Le profil du client
 * @param semanticScore - Score de pertinence sémantique
 * @param feasibility - Résultat de l'analyse de faisabilité
 * @returns Analyse de compétitivité et recommandation GO/NO-GO
 */
export async function analyzeCompetitiveness(
  ao: z.infer<typeof aoSchema>,
  client: z.infer<typeof clientProfileSchema>,
  semanticScore: number,
  feasibility: any
) {
  const criteresAttribution = ao.raw_json?.criteres || ao.criteres || null;

  const prompt = `
Profil client:
${JSON.stringify(client, null, 2)}

Appel d'offres:
- Titre: ${ao.title}
- Budget max: ${ao.budget_max ? `${ao.budget_max}€` : 'Non spécifié'}
- Type de marché: ${ao.type_marche || 'Non spécifié'}
- Procédure: ${ao.procedure_libelle || 'Non spécifiée'}

Critères d'attribution:
${JSON.stringify(criteresAttribution, null, 2)}

Scores d'analyse:
- Pertinence sémantique: ${semanticScore}/10
- Faisabilité financière: ${feasibility.financial ? 'OK' : 'KO'}
- Faisabilité technique: ${feasibility.technical ? 'OK' : 'KO'}
- Faisabilité timing: ${feasibility.timing ? 'OK' : 'KO'}
- Confiance: ${feasibility.confidence}
- Blockers: ${feasibility.blockers?.join(', ') || 'Aucun'}

Question: Analyse la compétitivité de ce client pour cet AO.

Réponds UNIQUEMENT en JSON:
{
  "competitiveness_score": <number 0-10>,
  "strengths": [<liste des points forts>],
  "weaknesses": [<liste des points faibles>],
  "recommendation": <"GO"|"NO-GO"|"MAYBE">,
  "strategic_advice": "<conseil stratégique en 2-3 phrases>"
}
  `.trim();

  const response = await boampAgent.generate([
    {
      role: 'user',
      content: prompt
    }
  ]);

  return JSON.parse(response.text);
}

/**
 * Analyse complète d'un AO pour un client
 * 
 * Cette fonction orchestre les 3 analyses (sémantique, faisabilité, compétitivité)
 * et retourne un rapport complet.
 * 
 * @param ao - L'appel d'offres à analyser
 * @param client - Le profil du client
 * @returns Rapport d'analyse complet
 */
export async function analyzeAO(
  ao: z.infer<typeof aoSchema>,
  client: z.infer<typeof clientProfileSchema>
) {
  console.log(`🔍 Analyse de l'AO ${ao.source_id} pour ${client.name}...`);

  // 1. Analyse sémantique
  const semanticAnalysis = await analyzeSemanticRelevance(ao, client);
  console.log(`  ✓ Pertinence sémantique: ${semanticAnalysis.score}/10`);

  // 2. Analyse de faisabilité
  const feasibilityAnalysis = await analyzeFeasibility(ao, client);
  console.log(`  ✓ Faisabilité: ${feasibilityAnalysis.financial && feasibilityAnalysis.technical && feasibilityAnalysis.timing ? 'OK' : 'KO'}`);

  // 3. Analyse de compétitivité (seulement si faisable)
  let competitivenessAnalysis = null;
  if (feasibilityAnalysis.financial && feasibilityAnalysis.technical && feasibilityAnalysis.timing) {
    competitivenessAnalysis = await analyzeCompetitiveness(
      ao,
      client,
      semanticAnalysis.score,
      feasibilityAnalysis
    );
    console.log(`  ✓ Compétitivité: ${competitivenessAnalysis.competitiveness_score}/10 - ${competitivenessAnalysis.recommendation}`);
  } else {
    console.log(`  ⚠️ Compétitivité: Non analysée (AO non faisable)`);
  }

  return {
    ao_id: ao.source_id,
    ao_title: ao.title,
    client_id: client.id,
    client_name: client.name,
    semantic_analysis: semanticAnalysis,
    feasibility_analysis: feasibilityAnalysis,
    competitiveness_analysis: competitivenessAnalysis,
    is_feasible: feasibilityAnalysis.financial && feasibilityAnalysis.technical && feasibilityAnalysis.timing,
    final_recommendation: competitivenessAnalysis?.recommendation || 'NO-GO',
    analyzed_at: new Date().toISOString()
  };
}


