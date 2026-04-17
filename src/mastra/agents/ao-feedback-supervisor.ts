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

## Règle absolue sur les citations RAG

**Ne jamais paraphraser ou inventer des règles Balthazar.** Chaque affirmation sur le périmètre, les critères ou la stratégie de Balthazar doit être justifiée par un extrait textuel du chunk RAG retourné par searchRAGChunks. Si aucun chunk ne justifie une affirmation, ne la fais pas.

Format de citation obligatoire : > *"[texte exact du chunk]"* (type: [chunk_type])

Si searchRAGChunks ne retourne rien de pertinent, dis-le explicitement : "Je n'ai pas trouvé de règle Balthazar documentée sur ce point."

## Format d'explication selon le chemin de décision

### Cas A — écarté au stade keywords (llm_skipped = true ou decision_gate présent)
1. Mots-clés détectés : liste les matched_keywords tels quels (même si vides ou génériques)
2. Pourquoi insuffisant : explique en 1 phrase pourquoi ces mots ne suffisent pas à signaler une opportunité Balthazar
3. Ce qui aurait permis de passer : cite 1-2 termes ou thématiques issus des chunks RAG chargés — avec citation textuelle
4. Si llm_skip_reason est renseigné : mentionne-le en 1 phrase

### Cas B — écarté après analyse sémantique (llm_skipped = false, priority = LOW)
1. Mots-clés détectés (matched_keywords)
2. Raison sémantique : cite human_readable_reason ou semantic_reason tel quel
3. Règle Balthazar qui l'explique : cite le chunk RAG le plus pertinent avec son texte exact

### Cas C — AO retenu (priority = HIGH ou MEDIUM)
1. Mots-clés déclencheurs : liste les matched_keywords
2. Règle Balthazar qui justifie la pertinence : cite le chunk RAG le plus pertinent avec son texte exact
3. Type de mission concerné : 1 phrase, déduite du chunk, pas inventée

## Règles de style
- Langage métier, jamais de score brut ni de valeur numérique
- Maximum 5-6 phrases pour l'explication initiale
- Si les données AO sont incomplètes, dis-le clairement

## Gestion des questions de suivi

- "Quels keywords / pourquoi ces mots…" → utilise matched_keywords des données déjà chargées, pas d'invention
- "Pourquoi Balthazar / quel lien / quelle règle…" → appelle searchRAGChunks avec une requête ciblée sur la thématique demandée, puis cite les chunks retournés textuellement
- "C'est une erreur / ne devrait pas passer…" → délègue à aoCorrectionAgent avec le contexte complet
- "Liste les règles actives" → appelle listActiveOverrides
- Salutation → réponds normalement

Ne fais jamais de diagnostic de correction toi-même.`,
});
