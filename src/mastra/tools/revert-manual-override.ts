import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from './_shared/supabase';

export const revertManualOverride = createTool({
  id: 'revertManualOverride',
  description: `Annule un override manuel de priorité (manual_override) sur un AO.
Remet manual_priority à NULL dans appels_offres et marque le feedback comme désactivé.
Utiliser uniquement pour les corrections de type manual_override.
Pour rag_chunk → deactivateRAGChunk. Pour keyword → deactivateOverride.`,
  inputSchema: z.object({
    feedback_id: z.string().describe("ID du ao_feedback de type manual_override à annuler"),
    source_id: z.string().describe("source_id de l'AO concerné"),
    reason: z.string().describe("Raison de l'annulation"),
    client_id: z.string().default('balthazar'),
  }),
  outputSchema: z.object({
    reverted: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ feedback_id, source_id, reason, client_id }) => {
    const { data: feedback } = await supabase
      .from('ao_feedback')
      .select('id, correction_type, status')
      .eq('id', feedback_id)
      .eq('client_id', client_id)
      .single();

    if (!feedback) {
      return { reverted: false, message: 'Correction introuvable.' };
    }

    if (feedback.correction_type !== 'manual_override') {
      return { reverted: false, message: `Ce feedback est de type "${feedback.correction_type}" — utilise le bon outil.` };
    }

    if (feedback.status !== 'applied') {
      return { reverted: false, message: `Cette correction n'est pas active (status: ${feedback.status}).` };
    }

    await supabase
      .from('ao_feedback')
      .update({ status: 'deactivated', reason: `Annulé : ${reason}` })
      .eq('id', feedback_id);

    await supabase
      .from('appels_offres')
      .update({ manual_priority: null })
      .eq('source_id', source_id);

    // Recompute human_readable_reason from remaining active corrections
    const { data: remainingFeedbacks } = await supabase
      .from('ao_feedback')
      .select('correction_type, correction_value, reason')
      .eq('source_id', source_id)
      .eq('client_id', client_id)
      .eq('status', 'applied')
      .order('created_at', { ascending: false });

    if (remainingFeedbacks && remainingFeedbacks.length > 0) {
      const parts = remainingFeedbacks
        .filter(f => f.reason)
        .map(f => f.reason as string);
      if (parts.length > 0) {
        await supabase
          .from('appels_offres')
          .update({ human_readable_reason: parts.join(' — ') })
          .eq('source_id', source_id);
      }
    }

    return {
      reverted: true,
      message: `Override de priorité annulé sur l'AO ${source_id}. La priorité reviendra au score calculé lors du prochain run nightly.`,
    };
  },
});
