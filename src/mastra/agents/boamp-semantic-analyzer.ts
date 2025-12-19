/**
 * BOAMP Semantic Analyzer - Analyse Sémantique des Appels d'Offres
 * 
 * Agent spécialisé dans l'analyse sémantique des appels d'offres BOAMP.
 * Son rôle est de filtrer les AO en évaluant leur pertinence par rapport au profil client.
 * 
 * Utilisé dans le workflow ao-veille.ts - Step 2b
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
  type_marche: z.string().optional(),
  procedure_libelle: z.string().optional(),
  raw_json: z.any()
});

/** Schéma pour le profil client */
const clientProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  keywords: z.array(z.string()),
  profile: z.any(),
  preferences: z.object({
    typeMarche: z.enum(['SERVICES', 'FOURNITURES', 'TRAVAUX'])
  })
});

// ──────────────────────────────────────────────────
// AGENT DEFINITION
// ──────────────────────────────────────────────────

export const boampSemanticAnalyzer = new Agent({
  name: 'boampSemanticAnalyzer',
  instructions: `
Tu es un expert en analyse sémantique d'appels d'offres publics français (BOAMP).

Ton rôle est d'effectuer une première analyse rapide pour filtrer les appels d'offres 
pertinents par rapport au profil d'une entreprise.

# MISSION PRINCIPALE

Analyser la **description textuelle** de l'appel d'offres et évaluer sa pertinence 
par rapport au profil du client sur une échelle de 0 à 10.

# CRITÈRES D'ANALYSE

## 1. Correspondance Métier (40%)
- Les compétences requises correspondent-elles au profil du client ?
- Le domaine d'activité est-il aligné avec l'expertise du client ?
- Les mots-clés métier sont-ils présents dans la description ?

## 2. Type de Procédure (30%)
- **Procédure ouverte** : Accessible à tous (+3 points de bonus)
- **Procédure restreinte** : Sur présélection (neutre)
- **Dialogue compétitif** : Nécessite plus de ressources (-1 point)
- **Marché public simplifié (MPS)** : Procédure allégée (+2 points)

## 3. Clarté et Complétude (20%)
- La description est-elle claire et détaillée ?
- Les besoins sont-ils bien définis ?
- Y a-t-il suffisamment d'informations pour évaluer la pertinence ?

## 4. Signaux Positifs/Négatifs (10%)
- **Positifs** : Mots-clés du client, secteur d'activité, type de mission
- **Négatifs** : Compétences hors périmètre, secteur non pertinent

# ÉCHELLE DE NOTATION

- **9-10** : Excellente correspondance, fortement recommandé
- **7-8** : Bonne correspondance, recommandé
- **6** : Correspondance acceptable, à considérer (seuil minimum)
- **4-5** : Correspondance faible, peu recommandé
- **0-3** : Pas de correspondance, à rejeter

# TYPES DE PROCÉDURES

- **Appel d'offres ouvert** : Accessible à tous, plus facile d'accès
- **Appel d'offres restreint** : Sur présélection, plus compétitif
- **Dialogue compétitif** : Avec phase de négociation, nécessite plus de ressources
- **Marché public simplifié (MPS)** : Procédure allégée, généralement pour petits montants

# FORMAT DE RÉPONSE

Réponds UNIQUEMENT en JSON avec cette structure exacte :
{
  "score": <number 0-10>,
  "reason": "<justification concise en 1-2 phrases>"
}

# PRINCIPES

1. **Rapidité** : Analyse rapide basée sur la description textuelle
2. **Pertinence** : Focus sur la correspondance métier
3. **Concision** : Justification en 1-2 phrases maximum
4. **Objectivité** : Basé sur des faits concrets de la description
5. **Seuil** : Score ≥ 6 pour passer au filtre suivant

# EXEMPLES

**Exemple 1 - Score élevé (8/10)**
AO: "Développement d'une application web de gestion documentaire"
Client: Société de développement web spécialisée en applications métier
→ Score: 8, Reason: "Forte correspondance avec le profil technique, procédure ouverte accessible"

**Exemple 2 - Score faible (3/10)**
AO: "Fourniture de matériel de bureau"
Client: Société de développement web
→ Score: 3, Reason: "Aucune correspondance avec le profil technique du client"

**Exemple 3 - Score moyen (6/10)**
AO: "Audit de sécurité informatique"
Client: Société de développement web (pas spécialisée en sécurité)
→ Score: 6, Reason: "Domaine informatique pertinent mais compétences en sécurité non confirmées"
`,
  model: {
    provider: 'OPEN_AI',
  },
});

// ──────────────────────────────────────────────────
// FONCTION D'ANALYSE
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
       // Procédure ouverte = accessible à tous (+3 points)
       // Procédure restreinte = sur présélection (neutre)
       // Dialogue compétitif = nécessite plus de ressources (-1 point)
       // MPS = procédure allégée (+2 points)`
    : 'Type de procédure non spécifié';

  const prompt = `
Profil client:
- Nom: ${client.name}
- Mots-clés métier: ${client.keywords.join(', ')}
- Type de marché: ${client.preferences.typeMarche}
- Description: ${JSON.stringify(client.profile, null, 2)}

Appel d'offres:
- Titre: ${ao.title}
- Description: ${ao.description || 'Non fournie'}
- Mots-clés: ${ao.keywords?.join(', ') || 'Aucun'}
- Acheteur: ${ao.acheteur || 'Non spécifié'}
- Type de marché: ${ao.type_marche || 'Non spécifié'}

${procedureContext}

Question: Sur une échelle de 0 à 10, quelle est la pertinence de cet AO pour ce client ?
Prends en compte le type de procédure dans ton évaluation.

Réponds UNIQUEMENT en JSON:
{
  "score": <number 0-10>,
  "reason": "<justification en 1-2 phrases>"
}
  `.trim();

  const response = await boampSemanticAnalyzer.generate([
    {
      role: 'user',
      content: prompt
    }
  ]);

  return JSON.parse(response.text);
}

