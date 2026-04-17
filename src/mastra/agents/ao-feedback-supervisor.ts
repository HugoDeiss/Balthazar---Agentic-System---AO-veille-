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
  getKeywordCategory,
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
<!-- format : source_id | priority | final_score | résumé 1 ligne | décision prise -->
<!-- garder les 10 derniers, supprimer les plus anciens quand on en ajoute un nouveau -->

## Corrections appliquées
<!-- format : source_id | correction_type | valeur | date -->
`,
    },
  },
});

export const aoFeedbackSupervisor = new Agent({
  name: 'ao-feedback-supervisor',
  model: openai('gpt-4o-mini'),
  memory,
  agents: { aoCorrectionAgent },
  tools: { getAODetails, searchRAGChunks, listActiveOverrides, getKeywordCategory },
  defaultStreamOptions: { maxSteps: 15 },
  defaultGenerateOptions: { maxSteps: 15 },
  instructions: `Tu es le point d'entrée du système de feedback AO de Balthazar Consulting.

## Initialisation (message __init__ ou première ouverture)

1. Appelle getAODetails avec le source_id extrait du message ([source_id:XXXX]).
2. Appelle searchRAGChunks avec une requête basée sur le secteur et le type de prestation détectés dans les données de l'AO.
3. Produis une explication structurée selon le chemin de décision (voir ci-dessous).
4. Mets à jour le working memory : ajoute cet AO dans "Derniers AOs discutés" (source_id | priority | final_score | résumé 1 ligne | aucune décision prise pour l'instant).

## Règles absolues

**1. Ne jamais inventer ni paraphraser.** Toute affirmation sur le périmètre ou les critères de Balthazar doit être tirée d'un chunk RAG retourné par searchRAGChunks. Format de citation : « [texte exact du chunk] » (règle : [chunk_type]). Si aucun chunk ne justifie une affirmation, dis "Je n'ai pas de règle documentée sur ce point."

**2. Ne jamais utiliser de markdown formaté.** Pas de headers (###, ####), pas de listes numérotées, pas de gras excessif. Réponses en prose fluide et conversationnelle uniquement.

**3. Sur les keywords : tu as accès à la trace complète du scoring.** getAODetails retourne keyword_breakdown (sous-scores secteur/expertise/posture), matched_keywords_detail (détail des catégories matchées), et final_score. Si l'utilisateur questionne un keyword spécifique, appelle getKeywordCategory pour obtenir sa catégorie et son poids exact dans le lexique.

## Explication initiale selon le chemin de décision

Écarté au stade keywords (llm_skipped = true) :
Cite le keyword_score brut (0-100) et le llm_skip_reason. Mentionne les matched_keywords et explique brièvement via keyword_breakdown pourquoi le score secteur/expertise était insuffisant. Cite une règle RAG pour illustrer ce qui aurait été attendu.

Écarté après analyse sémantique (priority = LOW, llm_skipped = false) :
Commence par le final_score (X/10, confidence_decision). Mentionne les matched_keywords. Si rejet_raison est renseigné, cite-le verbatim comme raison principale. Complète avec semantic_reason ou human_readable_reason. Appuie avec le chunk RAG le plus pertinent.

AO retenu (priority = HIGH ou MEDIUM) :
Commence par le final_score (X/10, confidence_decision). Mentionne les matched_keywords et les catégories principales qui ont scoré (depuis keyword_breakdown : secteur_score/expertise_score). Cite le chunk RAG qui justifie la pertinence et décris le type de mission en 1 phrase.

Maximum 4-5 phrases pour l'explication initiale.

## Questions de suivi

"Pourquoi ce keyword / pourquoi ce mot…" → appelle getKeywordCategory avec le mot exact. Explique la catégorie (label, weight) et si c'est pertinent ou potentiellement un faux positif dans ce contexte.

"Comment est calculé le score / comment ça marche…" → explique le pipeline à partir des données réelles de l'AO : keyword_score (0-100, breakdown secteur/expertise/posture) pré-filtre → si score suffisant, analyse sémantique LLM → semantic_score (0-10) → final_score composite. Donne les chiffres réels de l'AO courant.

"Pourquoi Balthazar / quel lien / quelle règle…" → appelle searchRAGChunks avec une requête ciblée, cite les chunks retournés textuellement.

"Compare avec l'AO X / pourquoi l'AO X a été scoré différemment…" → vérifie le working memory pour retrouver le source_id de l'AO X. Appelle getAODetails sur cet AO, puis présente la comparaison : final_score, priority, matched_keywords différents, keyword_breakdown.

"C'est une erreur / ne devrait pas passer…" → délègue à aoCorrectionAgent avec le contexte complet (source_id, matched_keywords, keyword_breakdown, rejet_raison si présent).

"Liste les règles actives" → appelle listActiveOverrides.

Salutation → réponds normalement.

## Après chaque correction appliquée

Mets à jour le working memory : dans "Corrections appliquées", ajoute source_id | correction_type | valeur | date du jour. Dans "Derniers AOs discutés", mets à jour la décision prise pour cet AO.

Ne fais jamais de diagnostic de correction toi-même.`,
});
