import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from './_shared/supabase';

export const checkDuplicateCorrection = createTool({
  id: 'checkDuplicateCorrection',
  description: `Vérifie si une correction similaire a déjà été appliquée ou proposée.
Appelle cet outil avant executeCorrection pour détecter les doublons et conflits.
Retourne isDuplicate=true si une règle existante couvre déjà le même terme ou concept.`,
  inputSchema: z.object({
    client_id: z.string().default('balthazar'),
    correction_type: z.enum(['keyword_red_flag', 'keyword_boost', 'rag_chunk']),
    value: z.string().describe('Terme ou concept à vérifier (ex: "prestation conseil", "mobilité")'),
  }),
  outputSchema: z.object({
    isDuplicate: z.boolean(),
    existingFeedbackId: z.string().nullable(),
    existingValue: z.string().nullable(),
    existingType: z.string().nullable(),
    message: z.string(),
  }),
  execute: async ({ client_id, correction_type, value }) => {
    const normalizedValue = value.toLowerCase().trim();

    if (correction_type === 'keyword_red_flag' || correction_type === 'keyword_boost') {
      const overrideType = correction_type === 'keyword_red_flag' ? 'red_flag' : 'required_keyword';
      const { data: existing } = await supabase
        .from('keyword_overrides')
        .select('id, value, type, feedback_id')
        .eq('client_id', client_id)
        .eq('type', overrideType)
        .eq('active', true);

      const match = (existing ?? []).find(o =>
        o.value.toLowerCase().includes(normalizedValue) ||
        normalizedValue.includes(o.value.toLowerCase())
      );

      if (match) {
        return {
          isDuplicate: true,
          existingFeedbackId: match.feedback_id ?? null,
          existingValue: match.value,
          existingType: match.type,
          message: `Une règle similaire existe déjà : "${match.value}" (${match.type}). Réutilise-la ou précise une variante distincte.`,
        };
      }
    }

    if (correction_type === 'rag_chunk') {
      const { data: existing } = await supabase
        .from('ao_feedback')
        .select('id, correction_value, correction_type')
        .eq('client_id', client_id)
        .eq('correction_type', 'rag_chunk')
        .eq('status', 'applied');

      const match = (existing ?? []).find(f =>
        f.correction_value &&
        (f.correction_value.toLowerCase().includes(normalizedValue) ||
         normalizedValue.includes(f.correction_value.toLowerCase()))
      );

      if (match) {
        return {
          isDuplicate: true,
          existingFeedbackId: match.id,
          existingValue: match.correction_value,
          existingType: 'rag_chunk',
          message: `Un chunk RAG similaire a déjà été appliqué pour "${match.correction_value}". Vérifie s'il couvre déjà ce cas avant d'en créer un nouveau.`,
        };
      }
    }

    return {
      isDuplicate: false,
      existingFeedbackId: null,
      existingValue: null,
      existingType: null,
      message: 'Aucune règle similaire détectée — correction nouvelle.',
    };
  },
});
