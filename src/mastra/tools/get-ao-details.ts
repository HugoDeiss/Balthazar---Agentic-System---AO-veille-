import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from './_shared/supabase';

export const getAODetails = createTool({
  id: 'getAODetails',
  description:
    "Récupère les détails complets d'un AO et sa trace d'analyse depuis Supabase. Utilise cet outil en premier pour comprendre pourquoi l'AO a reçu cette priorité.",
  inputSchema: z.object({
    source_id: z.string().describe("Identifiant unique de l'AO (ex: 26-30368)"),
  }),
  outputSchema: z.object({
    title: z.string().nullable(),
    description: z.string().nullable(),
    acheteur: z.string().nullable(),
    priority: z.string().nullable(),
    manual_priority: z.string().nullable(),
    keyword_score: z.number().nullable(),
    semantic_score: z.number().nullable(),
    final_score: z.number().nullable(),
    confidence_decision: z.string().nullable(),
    matched_keywords: z.array(z.string()).nullable(),
    matched_keywords_detail: z.any().nullable(),
    keyword_breakdown: z.any().nullable(),
    semantic_reason: z.string().nullable(),
    rejet_raison: z.string().nullable(),
    human_readable_reason: z.string().nullable(),
    rag_sources_detail: z.any().nullable(),
    decision_gate: z.string().nullable(),
    llm_skipped: z.boolean().nullable(),
    llm_skip_reason: z.string().nullable(),
    last_applied_feedbacks: z.array(z.object({
      id: z.string(),
      correction_type: z.string(),
      correction_value: z.string().nullable(),
      reason: z.string().nullable(),
      created_by: z.string().nullable(),
      processed_at: z.string().nullable(),
    })),
  }),
  execute: async ({ source_id }) => {
    const { data } = await supabase
      .from('appels_offres')
      .select(`
        title, description, acheteur, priority, manual_priority,
        keyword_score, semantic_score, final_score, confidence_decision,
        matched_keywords, matched_keywords_detail,
        keyword_breakdown, semantic_reason, rejet_raison, human_readable_reason,
        rag_sources_detail, decision_gate, llm_skipped, llm_skip_reason
      `)
      .eq('source_id', source_id)
      .single();

    const { data: feedbacks } = await supabase
      .from('ao_feedback')
      .select('id, correction_type, correction_value, reason, created_by, processed_at')
      .eq('source_id', source_id)
      .eq('status', 'applied')
      .order('processed_at', { ascending: false })
      .limit(3);

    return {
      title: data?.title ?? null,
      description: data?.description ?? null,
      acheteur: data?.acheteur ?? null,
      priority: data?.priority ?? null,
      manual_priority: data?.manual_priority ?? null,
      keyword_score: data?.keyword_score ?? null,
      semantic_score: data?.semantic_score ?? null,
      final_score: data?.final_score ?? null,
      confidence_decision: data?.confidence_decision ?? null,
      matched_keywords: data?.matched_keywords ?? null,
      matched_keywords_detail: data?.matched_keywords_detail ?? null,
      keyword_breakdown: data?.keyword_breakdown ?? null,
      semantic_reason: data?.semantic_reason ?? null,
      rejet_raison: data?.rejet_raison ?? null,
      human_readable_reason: data?.human_readable_reason ?? null,
      rag_sources_detail: data?.rag_sources_detail ?? null,
      decision_gate: data?.decision_gate ?? null,
      llm_skipped: data?.llm_skipped ?? null,
      llm_skip_reason: data?.llm_skip_reason ?? null,
      last_applied_feedbacks: feedbacks ?? [],
    };
  },
});
