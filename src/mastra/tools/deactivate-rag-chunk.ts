import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from './_shared/supabase';
import { getVectorStore } from './balthazar-rag-tools';

export const deactivateRAGChunk = createTool({
  id: 'deactivateRAGChunk',
  description: `Désactive un chunk RAG précédemment appliqué.
Utilise cet outil quand l'utilisateur veut annuler une règle de type rag_chunk.
Supprime le vecteur du store et marque le feedback comme désactivé en DB.
Pour les keyword_red_flag et keyword_boost, utiliser deactivateOverride à la place.`,
  inputSchema: z.object({
    feedback_id: z.string().describe("ID du ao_feedback de type rag_chunk à désactiver"),
    reason: z.string().describe('Raison de la désactivation'),
  }),
  outputSchema: z.object({
    deactivated: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ feedback_id, reason }) => {
    const { data: feedback } = await supabase
      .from('ao_feedback')
      .select('id, correction_type, correction_value, status')
      .eq('id', feedback_id)
      .single();

    if (!feedback) {
      return { deactivated: false, message: 'Feedback introuvable.' };
    }

    if (feedback.correction_type !== 'rag_chunk') {
      return { deactivated: false, message: `Ce feedback est de type "${feedback.correction_type}" — utilise deactivateOverride pour les keyword overrides.` };
    }

    if (feedback.status !== 'applied') {
      return { deactivated: false, message: `Ce chunk n'est pas actif (status: ${feedback.status}).` };
    }

    const store = getVectorStore();
    try {
      await store.deleteVector({ indexName: 'policies', id: `feedback_${feedback_id}` });
    } catch (e) {
      // Vector may not exist — continue to mark DB status
      console.warn(`[deactivateRAGChunk] deleteVector warning for feedback_${feedback_id}:`, e);
    }

    await supabase
      .from('ao_feedback')
      .update({ status: 'deactivated', reason: `${feedback.correction_value ?? ''} — désactivé : ${reason}` })
      .eq('id', feedback_id);

    return {
      deactivated: true,
      message: `Chunk RAG "${feedback.correction_value ?? feedback_id}" désactivé. Il ne sera plus utilisé dans les prochaines analyses.`,
    };
  },
});
