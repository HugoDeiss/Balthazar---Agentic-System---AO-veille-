import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from './_shared/supabase';
import { aoFeedbackTuningAgent, feedbackProposalSchema } from '../agents/ao-feedback-tuning-agent';
import { buildRAGChunk } from './build-rag-chunk';

export const executeCorrection = createTool({
  id: 'executeCorrection',
  description: `Exécute le pipeline complet de correction : diagnostic (tuning agent), simulation d'impact, et enregistrement de la proposition.
Appelle cet outil après avoir collecté les réponses Q1/Q2/Q3 de l'utilisateur.
Retourne un résultat typé avec feedback_id, résumé de la proposition et de la simulation.
Ne demande PAS de confirmation à l'utilisateur — c'est le superviseur qui gère la phase de confirmation via les boutons UI.`,
  inputSchema: z.object({
    source_id: z.string().describe("source_id de l'AO concerné"),
    client_id: z.string().default('balthazar'),
    ao_context: z.string().describe('JSON stringifié des données AO (title, priority, matched_keywords, keyword_breakdown, rejet_raison, etc.)'),
    user_reason: z.string().describe("Message original de l'utilisateur signalant l'erreur ou la pertinence"),
    q1_scope: z.string().describe('Réponse Q1 — portée choisie (quelle catégorie exclure ou booster)'),
    q2_valid_case: z.string().describe('Réponse Q2 — impact confirmé (AOs à préserver ou AOs à promouvoir)'),
    q3_confirmed_rule: z.string().describe('Réponse Q3 — reformulation confirmée de la règle'),
    direction: z.enum(['exclude', 'include']).default('exclude').describe("'exclude' pour faux positif, 'include' pour faux négatif"),
    created_by: z.string().optional().describe("Identité du consultant courant (pablo/alexandre)"),
  }),
  outputSchema: z.object({
    feedback_id: z.string(),
    proposal_summary: z.string(),
    simulation_summary: z.string(),
    correction_type: z.enum(['keyword_red_flag', 'rag_chunk', 'keyword_boost']),
    correction_value: z.string(),
    affected_high_medium: z.array(z.object({ source_id: z.string(), title: z.string(), priority: z.string() })),
  }),
  execute: async ({ source_id, client_id, ao_context, user_reason, q1_scope, q2_valid_case, q3_confirmed_rule, direction, created_by }) => {
    // Step 1 — Check for duplicate rules
    const { data: existingOverrides } = await supabase
      .from('keyword_overrides')
      .select('value, type, reason')
      .eq('client_id', client_id)
      .eq('active', true)
      .ilike('value', `%${q3_confirmed_rule.substring(0, 20)}%`);

    const similarRulesContext = existingOverrides?.length
      ? `Règles similaires déjà actives : ${existingOverrides.map(o => `"${o.value}" (${o.type})`).join(', ')}`
      : 'Aucune règle similaire détectée.';

    // Step 2 — Tuning agent: structured diagnosis
    const diagnosisPrompt = `Contexte AO :
${ao_context}

Message utilisateur : ${user_reason}

Direction de la correction : ${direction === 'include' ? 'INCLUSION (faux négatif — AO pertinent sous-scoré)' : 'EXCLUSION (faux positif — AO non pertinent retenu)'}

Réponses aux questions de clarification :
Q1 (portée) : ${q1_scope}
Q2 (impact confirmé) : ${q2_valid_case}
Q3 (reformulation confirmée) : ${q3_confirmed_rule}

${similarRulesContext}

Propose une correction unique et ciblée. Pour direction=include, utilise correction_type=keyword_boost.`;

    const diagnosisResult = await aoFeedbackTuningAgent.generate(diagnosisPrompt, {
      structuredOutput: { schema: feedbackProposalSchema },
    });

    const proposal = diagnosisResult.object;

    // Enforce direction → correction_type mapping — tuning agent can hallucinate the wrong type
    if (direction === 'include') {
      proposal.correction_type = 'keyword_boost';
    }

    // Step 2b — If rag_chunk: generate high-quality structured chunk (dedicated step, always runs)
    if (proposal.correction_type === 'rag_chunk') {
      let aoTitle = '';
      let aoDescription: string | undefined;
      try {
        const parsed = JSON.parse(ao_context);
        aoTitle = parsed.title ?? '';
        aoDescription = parsed.description ?? undefined;
      } catch {
        aoTitle = q3_confirmed_rule;
      }

      const ragChunkResult = await (buildRAGChunk.execute as Function)({
        ao_title: aoTitle,
        ao_description: aoDescription,
        user_reason,
        q1_scope,
        q2_valid_case,
        q3_confirmed_rule,
        direction,
        tuning_chunk_title: proposal.technical_payload.chunk_title,
      });

      if (ragChunkResult && 'chunk_content' in ragChunkResult) {
        proposal.technical_payload.chunk_title = ragChunkResult.chunk_title;
        proposal.technical_payload.chunk_content = ragChunkResult.chunk_content;
        proposal.technical_payload.chunk_type = ragChunkResult.chunk_type;
      }
    }

    // Step 3 — Determine the term to simulate (direction-aware)
    const term = direction === 'include'
      ? (proposal.technical_payload.keyword_to_boost || q3_confirmed_rule)
      : (proposal.technical_payload.red_flag_to_add || proposal.technical_payload.chunk_title || q3_confirmed_rule);

    // Step 4 — Simulate impact (open AOs only: analyzed within 30 days, deadline not yet passed)
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const today = new Date().toISOString().split('T')[0];

    const { data: affectedAOs } = await supabase
      .from('appels_offres')
      .select('source_id, title, priority, deadline')
      .gte('analyzed_at', since.toISOString())
      .or(`title.ilike.%${term}%,description.ilike.%${term}%`);

    const affected = (affectedAOs ?? []).filter(ao => !ao.deadline || ao.deadline >= today);
    let simulationSummary: string;
    let affectedHighMedium: Array<{ source_id: string; title: string; priority: string }> = [];

    if (direction === 'include') {
      const wouldPromote = affected.filter(ao => ao.priority === 'LOW' || ao.priority === null);
      const alreadyPassing = affected.filter(ao => ao.priority === 'HIGH' || ao.priority === 'MEDIUM');
      const simulationLines: string[] = [`${affected.length} AO(s) ouverts concernés sur les 30 derniers jours.`];
      if (wouldPromote.length > 0) simulationLines.push(`🔼 ${wouldPromote.length} AO(s) LOW seraient promus.`);
      if (alreadyPassing.length > 0) simulationLines.push(`✅ ${alreadyPassing.length} déjà HIGH/MEDIUM — pas d'impact.`);
      simulationSummary = simulationLines.join(' ');
    } else {
      const correctlyExcluded = affected.filter(ao => ao.priority === 'LOW' || ao.priority === null);
      const potentiallyWrong = affected.filter(ao => ao.priority === 'HIGH' || ao.priority === 'MEDIUM');
      affectedHighMedium = potentiallyWrong.map(ao => ({ source_id: ao.source_id, title: ao.title, priority: ao.priority as string }));
      const simulationLines: string[] = [`${affected.length} AO(s) ouverts affectés sur les 30 derniers jours.`];
      if (correctlyExcluded.length > 0) simulationLines.push(`✅ ${correctlyExcluded.length} correctement exclus (déjà LOW).`);
      if (potentiallyWrong.length > 0) simulationLines.push(`⚠️ ${potentiallyWrong.length} à reclasser (HIGH/MEDIUM encore ouverts).`);
      simulationSummary = simulationLines.join(' ');
    }

    // Step 5 — Record the proposal (pending confirmation)
    const { data: feedbackRow } = await supabase
      .from('ao_feedback')
      .insert({
        source_id,
        client_id,
        feedback: direction === 'include' ? 'relevant' : 'not_relevant',
        reason: user_reason,
        correction_type: proposal.correction_type,
        correction_value: term,
        chunk_content: proposal.technical_payload.chunk_content ?? null,
        agent_diagnosis: proposal.diagnosis_fr,
        agent_proposal: proposal.proposal_fr,
        status: 'agent_proposed',
        source: 'chat',
        created_by: created_by ?? null,
      })
      .select()
      .single();

    const feedbackId = feedbackRow?.id ?? '';
    const proposalSummary = `${proposal.proposal_fr} — ${proposal.impact_fr}`;

    return {
      feedback_id: feedbackId,
      proposal_summary: proposalSummary,
      simulation_summary: simulationSummary,
      correction_type: proposal.correction_type,
      correction_value: term,
      affected_high_medium: affectedHighMedium,
    };
  },
});
