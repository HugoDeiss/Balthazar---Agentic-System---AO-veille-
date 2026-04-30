/**
 * AO Reason Classifier
 *
 * Mini-agent called by aoFeedbackSupervisor to classify a user's reason
 * into Cas A (conceptual), Cas B (precise term), or Cas C (personal).
 * Returns structured output — no conversation, no tool calls.
 */

import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { openai as openaiProvider } from '@ai-sdk/openai';

export const reasonClassificationSchema = z.object({
  type: z.enum(['A', 'B', 'C']).describe(
    'A = raison conceptuelle (domaine, logique métier) | B = terme précis cité par l\'utilisateur | C = raison personnelle sans règle généralisable'
  ),
  terms: z.array(z.string()).optional().describe(
    'Cas A uniquement — 1 à 3 termes métier caractéristiques extraits de la raison (ex: ["conseil en gestion", "PME"])'
  ),
  term: z.string().optional().describe(
    'Cas B uniquement — le mot ou groupe de mots exact cité par l\'utilisateur'
  ),
  confidence: z.number().min(0).max(1).describe(
    'Niveau de confiance dans la classification (0-1). En dessous de 0.75, le superviseur demandera confirmation à l\'utilisateur.'
  ),
  explanation: z.string().describe(
    'Explication courte en français justifiant la classification (1 phrase)'
  ),
});

export type ReasonClassification = z.infer<typeof reasonClassificationSchema>;

export const aoReasonClassifier = new Agent({
  id: 'ao-reason-classifier',
  name: 'ao-reason-classifier',
  model: openaiProvider.chat('gpt-4o-mini'),
  instructions: `Tu classifies les raisons données par des consultants pour justifier un changement de priorité d'appel d'offres.

## Les 3 cas

**Cas A — Raison conceptuelle** : l'utilisateur décrit un domaine d'activité ou une logique métier qui ne correspond pas au périmètre de Balthazar.
Exemples : "Balthazar ne fait pas de conseil en gestion", "ce n'est pas notre secteur", "aucun rapport avec notre expertise", "on n'intervient pas dans le BTP", "c'est du conseil aux PME en difficulté".
→ Extrais les 1-3 termes métier les plus caractéristiques du domaine décrit.

**Cas B — Raison avec terme précis** : l'utilisateur cite un mot ou groupe de mots spécifique qui a été mal interprété par le scoring.
Exemples : "le mot 'mobilité' ici ne correspond pas à notre secteur mobilité", "le terme 'stratégie' a été surpondéré", "c'est 'prestation conseil' au sens générique".
→ Retourne le terme exact tel que l'utilisateur l'a formulé.

**Cas C — Raison personnelle sans règle généralisable** : aucun domaine ni terme identifiable, ou raison trop situationnelle.
Exemples : "je préfère le traiter autrement", "c'est déjà pris en compte ailleurs", "je verrai plus tard", "pas urgent".
→ Pas de terms ni de term à extraire.

## Règles de classification

- Si l'utilisateur décrit un domaine ET cite un terme : préfère Cas A (la règle conceptuelle est plus durable qu'un seul terme).
- Si la raison est ambiguë entre A et C : choisis C avec confidence < 0.75.
- Si la raison est ambiguë entre A et B : choisis A avec confidence < 0.75.
- La confidence doit refléter honnêtement le degré d'ambiguïté.
- Ne jamais retourner terms pour Cas B, ni term pour Cas A.`,
});
