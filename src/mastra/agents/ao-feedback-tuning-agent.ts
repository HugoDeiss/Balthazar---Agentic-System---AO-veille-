/**
 * AO Feedback Tuning Agent
 *
 * Diagnoses why an AO triggered a false positive and proposes a targeted correction:
 * either adding a keyword red flag or inserting a new RAG chunk.
 */

import { Agent } from '@mastra/core';
import { z } from 'zod';
import { openai as openaiProvider } from '@ai-sdk/openai';

// ──────────────────────────────────────────────────
// Output schema
// ──────────────────────────────────────────────────

export const feedbackProposalSchema = z.object({
  diagnosis_fr: z.string().describe('Explication concise en français du pourquoi cet AO a été retenu à tort'),
  proposal_fr: z.string().describe('Description en français de la correction proposée'),
  correction_type: z.enum(['keyword_red_flag', 'rag_chunk']).describe(
    'Type de correction : keyword_red_flag pour ajouter un mot-clé excluant, rag_chunk pour ajouter/modifier une règle RAG'
  ),
  technical_payload: z.object({
    red_flag_to_add: z.string().optional().describe('Le mot-clé ou expression à ajouter comme red flag (si correction_type=keyword_red_flag)'),
    chunk_title: z.string().optional().describe('Titre du chunk RAG à insérer (si correction_type=rag_chunk)'),
    chunk_content: z.string().optional().describe('Contenu du chunk RAG (règle ou contexte à ajouter)'),
    chunk_type: z.string().optional().describe('Type du chunk : exclusion_rule, disambiguation_rule, sector_definition, etc.'),
  }),
  impact_fr: z.string().describe('Impact attendu de la correction sur les futures analyses'),
  conflicts_with_existing: z.boolean().describe('La correction risque-t-elle de créer des conflits avec des règles existantes ?'),
  conflict_detail: z.string().optional().describe('Détail du conflit potentiel si conflicts_with_existing=true'),
});

export type FeedbackProposal = z.infer<typeof feedbackProposalSchema>;

// ──────────────────────────────────────────────────
// Agent
// ──────────────────────────────────────────────────

export const aoFeedbackTuningAgent = new Agent({
  name: 'ao-feedback-tuning',
  model: openaiProvider('gpt-4o'),
  instructions: `Tu es un expert en qualification d'appels d'offres pour Balthazar Consulting.
Ta mission UNIQUE est de diagnostiquer pourquoi un AO a été retenu à tort, puis de proposer UNE correction ciblée et minimale.

## Contexte Balthazar
Balthazar est un cabinet de conseil en stratégie qui intervient dans les secteurs :
mobilité, assurance, énergie, service public, entreprises à mission.

Les AO retenus à tort sont généralement :
- Des AO d'exploitation de DSP (pas de conseil stratégique)
- Des marchés de fourniture ou de travaux
- Des missions techniques sans enjeu stratégique
- Des formations catalogue sans composante transformation

## Règles de diagnostic
1. Lis attentivement le titre, l'acheteur et la raison machine (human_readable_reason)
2. Identifie le signal qui a induit le système en erreur (quel mot-clé ou concept ?)
3. Propose UNE seule correction parmi :
   - **keyword_red_flag** : si le problème est un terme générique qui apparaît dans des AO hors périmètre (ex: "exploitation", "fourniture", "maintenance")
   - **rag_chunk** : si le problème nécessite une règle de qualification plus nuancée (ex: distinguer conseil stratégique vs opérationnel pour un secteur donné)

## Format de réponse
Réponds uniquement avec les champs du schéma demandé. Sois concis et précis.
Ne propose jamais plusieurs corrections à la fois.
Si tu n'es pas sûr, préfère rag_chunk à keyword_red_flag (moins risqué pour les faux négatifs).`,
});
