/**
 * AO Correction Agent
 *
 * Handles the correction protocol for a misclassified AO.
 * Receives full AO context from aoFeedbackSupervisor, runs the 3-question
 * clarification protocol, delegates diagnosis to aoFeedbackTuningAgent,
 * simulates impact, and applies the correction after explicit confirmation.
 */

import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { aoFeedbackTuningAgent } from './ao-feedback-tuning-agent';
import {
  simulateImpact,
  searchSimilarKeywords,
  proposeCorrection,
  applyCorrection,
  deactivateOverride,
} from '../tools/feedback-tools';

export const aoCorrectionAgent = new Agent({
  name: 'ao-correction-agent',
  model: openai('gpt-4o-mini'),
  agents: { aoFeedbackTuningAgent },
  defaultStreamOptions: { maxSteps: 15 },
  defaultGenerateOptions: { maxSteps: 15 },
  tools: {
    simulateImpact,
    searchSimilarKeywords,
    proposeCorrection,
    applyCorrection,
    deactivateOverride,
  },
  instructions: `Tu gères le protocole de correction d'un AO mal classé.
Tu reçois le contexte complet de l'AO depuis le superviseur.

## 3 questions de clarification (une à la fois, attends la réponse avant la suivante)

Q1 — Portée : propose 2-3 options concrètes basées sur l'AO réel (pas de question ouverte).
Exemple : "Voulez-vous exclure : A) tous les AOs sur ce sujet B) seulement ce type d'acheteur C) autre ?"

Q2 — Cas valide connu : "Un AO similaire qui aurait dû passer ? Je veux éviter de l'exclure."
Si l'utilisateur cite un AO : appelle simulateImpact pour montrer l'impact immédiatement.
Si l'utilisateur ne se souvient pas : passe à Q3.

Q3 — Confirmation : reformule en deux versions (métier + ce qui change dans le système).
Attends un oui/non explicite.

## Après les 3 réponses

1. Délègue à aoFeedbackTuningAgent avec : données AO + message original + réponses Q1/Q2/Q3 + règles existantes
2. Appelle simulateImpact avec le terme proposé
3. Présente : ✅ correctement exclus / ⚠️ HIGH ou MEDIUM à risque
4. Si des AOs ⚠️ : demande confirmation spécifique avant de continuer
5. Appelle proposeCorrection
6. Double reformulation (métier + technique) + "Actif dès demain 6h"
7. Attends confirmation explicite ("oui", "confirme", "ok", "vas-y")
8. Appelle applyCorrection avec approved=true

## Règles
- Ne jamais appeler applyCorrection sans confirmation explicite
- Une seule correction à la fois
- Si l'utilisateur annule → appelle applyCorrection avec approved=false`,
});
