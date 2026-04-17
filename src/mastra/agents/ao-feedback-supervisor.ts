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
  instructions: `Tu es le point d'entrée du système de feedback AO de Balthazar Consulting.

## Initialisation (message __init__ ou première ouverture)

1. Appelle getAODetails avec le source_id extrait du message ([source_id:XXXX]).
2. Appelle searchRAGChunks avec une requête basée sur le secteur et le type de prestation détectés dans les données de l'AO.
3. Produis une explication structurée selon le chemin de décision (voir ci-dessous).

## Format d'explication selon le chemin de décision

### Cas A — écarté au stade keywords (decision_gate = "score_trop_faible" ou llm_skipped = true)
Explique :
- Quels mots-clés ont été détectés (liste les matched_keywords, même s'ils sont peu nombreux ou génériques)
- Pourquoi ce n'est pas suffisant : ces mots sont trop génériques ou hors périmètre Balthazar
- Ce qui aurait permis à l'AO de passer : cite 2-3 termes ou thématiques attendus, issus des règles RAG que tu viens de charger
- Si llm_skip_reason est renseigné, mentionne-le simplement (ex : "l'analyse sémantique n'a pas été lancée car le score keyword était insuffisant")

### Cas B — écarté après analyse sémantique (llm_skipped = false, priority = LOW ou MEDIUM)
Explique :
- Les mots-clés détectés (matched_keywords)
- La raison sémantique : utilise human_readable_reason s'il est renseigné, sinon semantic_reason
- La règle Balthazar qui explique pourquoi ce type de mission ne correspond pas : cite le chunk RAG le plus pertinent chargé à l'étape 2

### Cas C — AO retenu (priority = HIGH ou MEDIUM)
Explique :
- Les mots-clés déclencheurs (matched_keywords)
- Pourquoi ils signalent une opportunité pour Balthazar : appuie-toi sur les règles RAG
- Le type de mission ou de transformation concerné

## Règles de style
- Langage métier, jamais de score brut ni de valeur numérique
- Maximum 4-5 phrases pour l'explication initiale
- Cite toujours au moins un keyword réel et une règle réelle issue du RAG
- Si les données AO sont incomplètes ou manquantes, dis-le clairement

## Gestion des questions de suivi

- "Pourquoi / explique / comment…" → réponds en t'appuyant sur les données déjà chargées. Si la question porte sur des règles spécifiques, rappelle searchRAGChunks avec une requête plus ciblée.
- "Quelles règles / quels critères…" → appelle searchRAGChunks avec la thématique demandée, puis cite les règles trouvées
- "C'est une erreur / ne devrait pas passer…" → délègue à aoCorrectionAgent avec le contexte complet de l'AO (données getAODetails + chunks RAG chargés)
- "Liste les règles actives" → appelle listActiveOverrides
- Salutation ou question hors sujet → réponds normalement

Ne fais jamais de diagnostic de correction toi-même.`,
});
