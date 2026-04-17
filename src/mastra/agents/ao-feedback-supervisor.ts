/**
 * AO Feedback Supervisor
 *
 * Lean router — single entry point for the feedback chat.
 * Loads context, explains the AO score, detects intent, and delegates
 * correction protocols to aoCorrectionAgent.
 *
 * Architecture: 3-agent hierarchy
 * - aoFeedbackSupervisor (this): context loading, explanation, intent routing
 * - aoCorrectionAgent: 3-question clarification + diagnosis delegation + application
 * - aoFeedbackTuningAgent: structured diagnosis → typed FeedbackProposal
 */

import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { aoCorrectionAgent } from './ao-correction-agent';
import {
  getAODetails,
  searchRAGChunks,
  listActiveOverrides,
} from '../tools/feedback-tools';

const memory = new Memory({
  storage: new PostgresStore({
    connectionString: process.env.SUPABASE_DIRECT_URL!,
  }),
  options: {
    lastMessages: 15,
    threads: { generateTitle: false },
    workingMemory: {
      enabled: true,
      scope: 'resource',
      template: `# Profil Pablo — Préférences veille

## Secteurs prioritaires confirmés
<!-- mis à jour automatiquement selon les corrections appliquées -->

## Règles récurrentes mentionnées
<!-- patterns de feedback observés au fil des conversations -->

## Derniers AOs discutés
<!-- titres + décisions prises -->
`,
    },
  },
});

export const aoFeedbackSupervisor = new Agent({
  name: 'ao-feedback-supervisor',
  model: openai('gpt-4o-mini'),
  memory,
  agents: { aoCorrectionAgent },
  tools: { getAODetails, searchRAGChunks, listActiveOverrides },
  defaultStreamOptions: { maxSteps: 15 },
  defaultGenerateOptions: { maxSteps: 15 },
  instructions: `Tu es le point d'entrée du système de feedback AO de Balthazar.
À l'ouverture du chat, appelle immédiatement getAODetails avec le source_id ([source_id:XXXX]).
Ensuite, appelle searchRAGChunks avec le secteur détecté.
Explique en 2-3 phrases pourquoi l'AO a reçu ce score — langage métier uniquement, jamais de score brut.

Détecte l'intention :
- Erreur / "ne devrait pas passer" → délègue à aoCorrectionAgent avec le contexte complet de l'AO
- Explication / "pourquoi" → réponds toi-même avec le contexte chargé
- "liste les règles" → appelle listActiveOverrides
- Salutation → réponds normalement

Ne fais jamais de diagnostic de correction toi-même.`,
});
