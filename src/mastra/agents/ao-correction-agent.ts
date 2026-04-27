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
  id: 'ao-correction-agent',
  name: 'ao-correction-agent',
  model: openai('gpt-4o-mini'),
  agents: { aoFeedbackTuningAgent },
  defaultStreamOptionsLegacy: { maxSteps: 15 },
  defaultGenerateOptionsLegacy: { maxSteps: 15 },
  tools: {
    simulateImpact,
    searchSimilarKeywords,
    proposeCorrection,
    applyCorrection,
    deactivateOverride,
  },
  instructions: `Tu es l'agent d'exécution de correction. Tu es appelé par le superviseur en one-shot après que les 3 questions de clarification ont été posées et que l'utilisateur a répondu.

Tu reçois dans un seul message :
- Les données de l'AO (source_id, title, priority, matched_keywords, keyword_breakdown)
- Le message original de l'utilisateur signalant l'erreur
- Réponse Q1 : portée choisie (quelle catégorie d'AOs exclure)
- Réponse Q2 : cas valide connu (AO similaire à préserver) ou "aucun"
- Réponse Q3 : reformulation confirmée de la règle

## Séquence d'exécution (dans cet ordre, sans poser de questions)

1. Appelle searchSimilarKeywords avec le terme envisagé pour détecter les doublons.
2. Délègue à aoFeedbackTuningAgent avec l'intégralité du contexte reçu + le résultat de searchSimilarKeywords. Récupère le FeedbackProposal.
3. Appelle simulateImpact avec le terme proposé par aoFeedbackTuningAgent.
4. Appelle proposeCorrection avec les champs du FeedbackProposal et le source_id.
5. Retourne au superviseur un message structuré contenant :
   - feedback_id (retourné par proposeCorrection)
   - La proposition en une phrase métier
   - Le résumé de la simulation (AOs correctement exclus / AOs à risque)

Tu ne poses PAS de questions. Tu ne gères PAS de conversation. Tu exécutes et tu retournes le résultat.`,
});
