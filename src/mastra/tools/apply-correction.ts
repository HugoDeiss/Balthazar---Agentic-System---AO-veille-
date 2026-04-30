import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from './_shared/supabase';
import { insertAndIndexChunk } from '../../utils/rag-indexer';

export const applyCorrection = createTool({
  id: 'applyCorrection',
  description:
    "Applique une correction après confirmation explicite de l'utilisateur. Ne jamais appeler cet outil sans que l'utilisateur ait dit oui, confirme, ou un équivalent explicite.",
  inputSchema: z.object({
    feedback_id: z.string().describe('ID du feedback retourné par proposeCorrection'),
    approved: z.boolean().describe("true si l'utilisateur a confirmé, false si refus"),
  }),
  outputSchema: z.object({
    applied: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ approved, feedback_id }) => {
    if (!approved) {
      await supabase
        .from('ao_feedback')
        .update({ status: 'rejected' })
        .eq('id', feedback_id);

      return { applied: false, message: 'Correction refusée. Aucun changement effectué.' };
    }

    const { data: feedback } = await supabase
      .from('ao_feedback')
      .select('*')
      .eq('id', feedback_id)
      .single();

    if (!feedback) {
      return { applied: false, message: 'Feedback introuvable.' };
    }

    if (feedback.correction_type === 'keyword_red_flag') {
      await supabase.from('keyword_overrides').insert({
        client_id: feedback.client_id,
        type: 'red_flag',
        value: feedback.correction_value,
        reason: feedback.reason,
        feedback_id: feedback.id,
        active: true,
      });
    }

    if (feedback.correction_type === 'rag_chunk') {
      await insertAndIndexChunk({
        indexName: 'policies',
        text: feedback.chunk_content ?? feedback.agent_proposal,
        metadata: {
          chunk_id: `feedback_${feedback.id}`,
          chunk_type: 'user_feedback',
          source_id: feedback.source_id,
          client_id: feedback.client_id,
          title: feedback.correction_value,
        },
      });
    }

    await supabase
      .from('ao_feedback')
      .update({ status: 'applied', processed_at: new Date().toISOString() })
      .eq('id', feedback_id);

    return {
      applied: true,
      message: "✅ Correction appliquée. Elle sera active dès le prochain run d'analyse (demain matin à 6h).",
    };
  },
});
