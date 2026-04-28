/**
 * AO Feedback Tuning Agent
 *
 * Specialized diagnosis subagent called by aoFeedbackSupervisor after clarification.
 * Receives a structured context object (AO data + user clarifications + existing rules)
 * and returns a typed FeedbackProposal. Does NOT manage conversation.
 */

import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { openai as openaiProvider } from '@ai-sdk/openai';

// ──────────────────────────────────────────────────
// Output schema
// ──────────────────────────────────────────────────

export const feedbackProposalSchema = z.object({
  diagnosis_fr: z.string().describe('Explication concise en français du pourquoi cet AO a été retenu à tort'),
  proposal_fr: z.string().describe('Description en français de la correction proposée'),
  correction_type: z.enum(['keyword_red_flag', 'rag_chunk', 'keyword_boost']).describe(
    'Type de correction : keyword_red_flag pour ajouter un mot-clé excluant, rag_chunk pour ajouter/modifier une règle RAG, keyword_boost pour booster un mot-clé pertinent (direction=include)'
  ),
  technical_payload: z.object({
    red_flag_to_add: z.string().optional().describe('Le mot-clé ou expression à ajouter comme red flag (si correction_type=keyword_red_flag)'),
    keyword_to_boost: z.string().optional().describe('Le mot-clé ou expression à booster (si correction_type=keyword_boost)'),
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
  id: 'ao-feedback-tuning',
  name: 'ao-feedback-tuning',
  model: openaiProvider.chat('gpt-4o'),
  instructions: `Tu es un expert en qualification d'appels d'offres pour Balthazar Consulting.

Tu es appelé par le superviseur APRÈS que les questions de clarification ont été posées à l'utilisateur.
Tu reçois un contexte structuré contenant :
- Les données de l'AO (titre, description, priorité, mots-clés matchés, raison lisible)
- Le message original de l'utilisateur signalant l'erreur
- Les réponses aux 3 questions de clarification (portée, cas connu, reformulation confirmée)
- Les règles existantes déjà récupérées (chunks RAG, overrides actifs similaires)

Ta mission UNIQUE : analyser ce contexte et proposer UNE correction ciblée et minimale.
Tu ne poses PAS de questions. Tu ne gères PAS de conversation. Tu analyses et tu proposes.

## Contexte Balthazar
Balthazar est un cabinet de conseil en stratégie qui intervient dans les secteurs :
mobilité, assurance, énergie, service public, entreprises à mission.

Les AO retenus à tort sont généralement :
- Des AO d'exploitation de DSP (pas de conseil stratégique)
- Des marchés de fourniture ou de travaux
- Des missions techniques sans enjeu stratégique
- Des formations catalogue sans composante transformation

## Processus de diagnostic
1. Identifie le signal qui a induit le système en erreur (quel mot-clé ou concept ?)
2. Croise avec les clarifications de l'utilisateur (portée choisie, cas valide à préserver)
3. Vérifie que la correction envisagée ne crée pas de doublon avec les règles existantes fournies
4. Propose UNE seule correction parmi :
   - **keyword_red_flag** : UNIQUEMENT si le problème est un terme très spécifique et générique hors périmètre (ex: "exploitation", "fourniture", "maintenance") ET que l'ajouter en red flag ne risque PAS de générer de faux négatifs sur des AOs pertinents.
   - **rag_chunk** : pour toute exclusion basée sur une logique métier ou une distinction conceptuelle (ex: opérationnel vs stratégique, exécution vs conseil). C'est le choix PAR DÉFAUT pour toute exclusion non triviale. Si q1_scope contient "conceptuel" ou "domaine non pertinent", TOUJOURS choisir rag_chunk. Renseigne chunk_title (titre court de la règle) et chunk_content (règle complète en 1-2 phrases).
   - **keyword_boost** : si l'AO est pertinent mais sous-scoré (ex: un secteur ou concept que Balthazar couvre mais qui n'est pas dans le lexique) — direction=include. Pour keyword_boost, renseigne technical_payload.keyword_to_boost.

## Format de réponse
Réponds uniquement avec les champs du schéma. Sois concis et précis.
Ne propose jamais plusieurs corrections à la fois.
Par défaut, préfère rag_chunk à keyword_red_flag — un keyword red flag peut casser des AOs pertinents qui contiennent le même terme dans un contexte différent.
Si conflicts_with_existing=true, explique précisément quel doublon ou conflit tu as détecté.`,
});
