import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import {
  getAODetails,
  searchRAGChunks,
  listActiveOverrides,
  getKeywordCategory,
  executeCorrection,
  deactivateOverride,
  proposeChoices,
  simulateImpact,
  manualOverride,
  proposePriorityChoice,
  checkDuplicateCorrection,
  deactivateRAGChunk,
  queryImpactHistory,
} from '../../tools';
import { supervisorInstructions } from './instructions';

const memory = new Memory({
  storage: new PostgresStore({
    id: 'mastra-memory-pg-store',
    connectionString: process.env.SUPABASE_DIRECT_URL!,
  }),
  options: {
    lastMessages: 15,
    generateTitle: false,
    workingMemory: {
      enabled: true,
      scope: 'resource',
      template: `# Session AO courante
<!-- Réinitialise cette section à chaque nouvel AO (nouveau thread) -->

## AO courant
- source_id:
- priority_actuelle: <!-- HIGH | MEDIUM | LOW — NE JAMAIS perdre cette valeur -->
- manual_priority: <!-- HIGH | MEDIUM | LOW | null — si renseigné, PRIME sur priority_actuelle pour expliquer le classement -->
- override_par: <!-- crédit du consultant qui a forcé la priorité, ex: pablo -->
- override_raison: <!-- raison humaine exacte depuis last_applied_feedbacks.reason -->
- llm_skipped: <!-- true | false -->
- raison_système: <!-- explication métier en 1 phrase, sans score numérique — IGNORÉE si manual_priority est renseigné -->
- phase: <!-- diagnosis | gathering | proposal | done -->
- correction_proposée: <!-- type | valeur | feedback_id si proposé -->

---

# Profil utilisateur — Préférences veille
<!-- Cette section persiste entre les conversations -->

## Secteurs prioritaires confirmés
<!-- mis à jour automatiquement selon les corrections appliquées -->

## Règles récurrentes mentionnées
<!-- patterns de feedback observés au fil des conversations -->

## Derniers AOs discutés
<!-- format : source_id | priority | résumé 1 ligne | décision prise -->
<!-- garder les 10 derniers max -->

## Corrections appliquées
<!-- format : source_id | correction_type | valeur | date -->
`,
    },
  },
});

export const aoFeedbackSupervisor = new Agent({
  id: 'ao-feedback-supervisor',
  name: 'ao-feedback-supervisor',
  model: openai('gpt-4o-mini'),
  memory,
  tools: { getAODetails, searchRAGChunks, listActiveOverrides, getKeywordCategory, executeCorrection, deactivateOverride, proposeChoices, simulateImpact, manualOverride, proposePriorityChoice, checkDuplicateCorrection, deactivateRAGChunk, queryImpactHistory },
  defaultStreamOptionsLegacy: { maxSteps: 20 },
  defaultGenerateOptionsLegacy: { maxSteps: 20 },
  instructions: supervisorInstructions,
});
