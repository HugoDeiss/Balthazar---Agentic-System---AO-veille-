/**
 * BOAMP Feasibility Analyzer - Analyse de Faisabilité des Appels d'Offres
 * 
 * Agent spécialisé dans l'analyse approfondie de la faisabilité des appels d'offres BOAMP.
 * Son rôle est de vérifier si le client peut répondre à l'AO en analysant les critères
 * financiers, techniques et de timing.
 * 
 * Utilisé dans le workflow ao-veille.ts - Step 3
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
  budget_max: z.number().nullable().optional(),
  deadline: z.string().optional(),
  type_marche: z.string().optional(),
  region: z.string().nullable().optional(),
  procedure_libelle: z.string().optional(),
  criteres: z.any().optional(),
  raw_json: z.any()
});

/** Schéma pour le profil client */
const clientProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  financial: z.object({
    revenue: z.number(),
    employees: z.number(),
    yearsInBusiness: z.number()
  }),
  technical: z.object({
    references: z.number()
  }),
  profile: z.any()
});

// ──────────────────────────────────────────────────
// AGENT DEFINITION
// ──────────────────────────────────────────────────

export const boampFeasibilityAnalyzer = new Agent({
  name: 'boampFeasibilityAnalyzer',
  instructions: `
Tu es un expert en analyse de faisabilité d'appels d'offres publics français (BOAMP).

Ton rôle est d'effectuer une analyse approfondie pour déterminer si une entreprise 
peut répondre à un appel d'offres en vérifiant les critères financiers, techniques 
et de timing.

# MISSION PRINCIPALE

Analyser les **critères de participation** de l'appel d'offres et vérifier si le client 
les respecte. Cette analyse est plus détaillée que l'analyse sémantique et se base sur 
des critères objectifs et mesurables.

# CRITÈRES D'ANALYSE

## 1. Critères Financiers (35%)
Vérifier si le client respecte les exigences financières :
- **CA minimum** : Le CA annuel du client est-il suffisant ?
- **Garanties financières** : Le client peut-il fournir les garanties demandées ?
- **Capacité financière** : Le client a-t-il les moyens de réaliser le marché ?

**Règle** : Si CA minimum > CA client, alors financial = false

## 2. Critères Techniques (35%)
Vérifier si le client respecte les exigences techniques :
- **Références** : Le client a-t-il suffisamment de références similaires ?
- **Certifications** : Le client possède-t-il les certifications requises ?
- **Effectif** : L'effectif du client est-il suffisant ?
- **Expérience** : Le client a-t-il l'expérience requise (années d'activité) ?

**Règle** : Si références minimum > références client, alors technical = false

## 3. Critères de Timing (30%)
Vérifier si le délai est réaliste :
- **Délai de réponse** : Le client a-t-il le temps de préparer une réponse de qualité ?
- **Urgence** : Le délai est-il trop court pour mobiliser les ressources ?

**Règles** :
- Si délai < 7 jours : timing = false (trop court)
- Si délai 7-15 jours : timing = true mais confidence = low (serré)
- Si délai > 15 jours : timing = true et confidence = medium/high

# NIVEAU DE CONFIANCE

- **high** : Tous les critères sont largement respectés
- **medium** : Critères respectés mais de justesse
- **low** : Critères respectés mais avec des réserves

# BLOCKERS

Liste des obstacles identifiés qui empêchent de répondre à l'AO :
- "CA insuffisant (requis: X€, client: Y€)"
- "Références insuffisantes (requis: X, client: Y)"
- "Certification manquante: ISO 27001"
- "Délai trop court (X jours restants)"
- "Effectif insuffisant (requis: X, client: Y)"

# WARNINGS ET CONTEXT

Identifie les éléments suivants dans le JSON brut :
- **Correctif publié** : annonce_lie présent → ⚠️ "Cet AO a fait l'objet d'un correctif"
- **Renouvellement** : annonces_anterieures présent → ℹ️ "Renouvellement de marché existant"

# FORMAT DE RÉPONSE

Réponds UNIQUEMENT en JSON avec cette structure exacte :
{
  "financial": <boolean>,
  "technical": <boolean>,
  "timing": <boolean>,
  "blockers": [<liste des blockers si applicable>],
  "confidence": <"high"|"medium"|"low">
}

# PRINCIPES

1. **Objectivité** : Basé sur des critères mesurables et objectifs
2. **Rigueur** : Vérification stricte des critères de participation
3. **Transparence** : Identification claire des blockers
4. **Pragmatisme** : Évaluation réaliste du délai de réponse
5. **Seuil** : financial AND technical AND timing pour passer au step suivant

# EXEMPLES

**Exemple 1 - Faisable (high confidence)**
Critères AO: CA min 500k€, 5 références, 15 jours
Client: CA 1.2M€, 12 références, 59 jours restants
→ { financial: true, technical: true, timing: true, blockers: [], confidence: "high" }

**Exemple 2 - Non faisable (CA insuffisant)**
Critères AO: CA min 5M€, 10 références
Client: CA 1.2M€, 12 références
→ { financial: false, technical: true, timing: true, blockers: ["CA insuffisant (requis: 5M€, client: 1.2M€)"], confidence: "low" }

**Exemple 3 - Faisable mais serré (medium confidence)**
Critères AO: CA min 500k€, 5 références, 10 jours
Client: CA 600k€, 5 références, 10 jours restants
→ { financial: true, technical: true, timing: true, blockers: [], confidence: "medium" }

**Exemple 4 - Non faisable (délai trop court)**
Critères AO: Délai 5 jours
→ { financial: true, technical: true, timing: false, blockers: ["Délai trop court (5 jours restants)"], confidence: "low" }
`,
  model: 'openai/gpt-4o',
});

// ──────────────────────────────────────────────────
// FONCTION D'ANALYSE
// ──────────────────────────────────────────────────

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
- Nom: ${client.name}
- CA annuel: ${client.financial.revenue}€
- Effectif: ${client.financial.employees} personnes
- Années d'expérience: ${client.financial.yearsInBusiness}
- Références similaires: ${client.technical.references} projets

Appel d'offres:
- Titre: ${ao.title}
- Budget max: ${ao.budget_max ? `${ao.budget_max}€` : 'Non spécifié'}
- Délai restant: ${daysRemaining !== null ? `${daysRemaining} jours` : 'Non spécifié'}

Critères de participation (extraits du BOAMP):
${JSON.stringify(criteres, null, 2)}
${additionalContext}

Questions:
1. Le client respecte-t-il les critères financiers (CA minimum, garanties) ?
2. Le client respecte-t-il les critères techniques (références, certifications, effectif) ?
3. Le délai est-il réaliste pour préparer une réponse de qualité ?

Réponds UNIQUEMENT en JSON:
{
  "financial": <boolean>,
  "technical": <boolean>,
  "timing": <boolean>,
  "blockers": [<liste des blockers si applicable>],
  "confidence": <"high"|"medium"|"low">
}
  `.trim();

  const response = await boampFeasibilityAnalyzer.generate([
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

