import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from './_shared/supabase';

export const getAOCorrectionHistory = createTool({
  id: 'getAOCorrectionHistory',
  description: `Retourne l'historique complet des corrections appliquées à un AO donné.
Inclut tous les types : keyword_red_flag, keyword_boost, rag_chunk, manual_override.
Pour chaque correction, indique si elle est encore active ou désactivée.
Utiliser quand l'utilisateur demande "qu'est-ce qui a été modifié sur cet AO ?" ou avant de proposer une annulation.`,
  inputSchema: z.object({
    source_id: z.string().describe("source_id de l'AO"),
    client_id: z.string().default('balthazar'),
  }),
  outputSchema: z.object({
    source_id: z.string(),
    total: z.number(),
    items: z.array(
      z.object({
        feedback_id: z.string(),
        correction_type: z.string(),
        correction_value: z.string().nullable(),
        reason: z.string().nullable(),
        status: z.string(),
        is_active: z.boolean(),
        created_by: z.string().nullable(),
        created_at: z.string(),
        processed_at: z.string().nullable(),
        override_id: z.string().nullable(),
      })
    ),
  }),
  execute: async ({ source_id, client_id }) => {
    const { data: feedbacks, error } = await supabase
      .from('ao_feedback')
      .select('id, correction_type, correction_value, reason, status, created_by, created_at, processed_at')
      .eq('source_id', source_id)
      .eq('client_id', client_id)
      .in('status', ['applied', 'deactivated'])
      .order('created_at', { ascending: false });

    if (error || !feedbacks) {
      return { source_id, total: 0, items: [] };
    }

    const feedbackIds = feedbacks
      .filter(f => f.correction_type === 'keyword_red_flag' || f.correction_type === 'keyword_boost')
      .map(f => f.id);

    const overridesByFeedbackId = new Map<string, { id: string; active: boolean }>();
    if (feedbackIds.length > 0) {
      const { data: overrides } = await supabase
        .from('keyword_overrides')
        .select('id, feedback_id, active')
        .in('feedback_id', feedbackIds);

      for (const ov of overrides ?? []) {
        if (ov.feedback_id) overridesByFeedbackId.set(ov.feedback_id, { id: ov.id, active: ov.active });
      }
    }

    const items = feedbacks.map(f => {
      const override = overridesByFeedbackId.get(f.id);
      let is_active: boolean;
      if (f.correction_type === 'keyword_red_flag' || f.correction_type === 'keyword_boost') {
        is_active = override?.active ?? false;
      } else {
        is_active = f.status === 'applied';
      }

      return {
        feedback_id: f.id,
        correction_type: f.correction_type,
        correction_value: f.correction_value ?? null,
        reason: f.reason ?? null,
        status: f.status,
        is_active,
        created_by: f.created_by ?? null,
        created_at: f.created_at,
        processed_at: f.processed_at ?? null,
        override_id: override?.id ?? null,
      };
    });

    return { source_id, total: items.length, items };
  },
});
