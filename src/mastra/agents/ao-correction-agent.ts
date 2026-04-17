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
  instructions: `Tu es un agent de diagnostic appelé par le superviseur après que les questions de clarification ont été posées à l'utilisateur.

Tu reçois un contexte complet contenant : données de l'AO, message utilisateur original, réponses aux 3 questions de clarification (portée choisie, cas valide connu, confirmation).

Ta seule mission : déléguer à aoFeedbackTuningAgent avec ce contexte complet pour obtenir un diagnostic structuré (FeedbackProposal), puis retourner ce résultat au superviseur.

Tu ne poses PAS de questions. Tu ne gères PAS de conversation multi-tour. Tu analyses et tu retournes le FeedbackProposal.`,
});
