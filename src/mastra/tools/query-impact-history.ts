import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from './_shared/supabase';

export const queryImpactHistory = createTool({
  id: 'queryImpactHistory',
  description: `Retourne l'impact réel d'une correction déjà appliquée : combien d'AOs correspondent au terme ou à la règle, et lesquels sont encore ouverts.
Utilise cet outil quand l'utilisateur demande "combien d'AOs a affecté ma correction ?".`,
  inputSchema: z.object({
    feedback_id: z.string().optional().describe('ID du ao_feedback à analyser'),
    value: z.string().optional().describe('Terme à rechercher directement si pas de feedback_id'),
    client_id: z.string().default('balthazar'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    correction_value: z.string().nullable(),
    correction_type: z.string().nullable(),
    total_matching_aos: z.number(),
    open_affected: z.number(),
    high_medium_count: z.number(),
    low_count: z.number(),
    applied_at: z.string().nullable(),
    summary: z.string(),
  }),
  execute: async ({ feedback_id, value }) => {
    let correctionValue = value ?? null;
    let correctionType: string | null = null;
    let appliedAt: string | null = null;

    if (feedback_id) {
      const { data: feedback } = await supabase
        .from('ao_feedback')
        .select('correction_value, correction_type, processed_at')
        .eq('id', feedback_id)
        .single();

      if (!feedback) {
        return { found: false, correction_value: null, correction_type: null, total_matching_aos: 0, open_affected: 0, high_medium_count: 0, low_count: 0, applied_at: null, summary: 'Correction introuvable.' };
      }

      correctionValue = feedback.correction_value;
      correctionType = feedback.correction_type;
      appliedAt = feedback.processed_at;
    }

    if (!correctionValue) {
      return { found: false, correction_value: null, correction_type: null, total_matching_aos: 0, open_affected: 0, high_medium_count: 0, low_count: 0, applied_at: null, summary: 'Aucune valeur à rechercher.' };
    }

    const today = new Date().toISOString().split('T')[0];
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const { data: matchingAOs } = await supabase
      .from('appels_offres')
      .select('source_id, title, priority, deadline, analyzed_at')
      .gte('analyzed_at', since.toISOString())
      .or(`title.ilike.%${correctionValue}%,description.ilike.%${correctionValue}%`);

    const allMatching = matchingAOs ?? [];
    const openAOs = allMatching.filter(ao => !ao.deadline || ao.deadline >= today);
    const highMedium = openAOs.filter(ao => ao.priority === 'HIGH' || ao.priority === 'MEDIUM');
    const low = openAOs.filter(ao => ao.priority === 'LOW' || !ao.priority);

    const appliedStr = appliedAt ? ` (appliquée le ${appliedAt.split('T')[0]})` : '';
    const summary = [
      `Correction "${correctionValue}"${appliedStr} :`,
      `${allMatching.length} AO(s) correspondants sur 90 jours.`,
      openAOs.length > 0 ? `${openAOs.length} encore ouverts : ${highMedium.length} HIGH/MEDIUM, ${low.length} LOW.` : 'Aucun AO ouvert correspondant.',
    ].join(' ');

    return {
      found: true,
      correction_value: correctionValue,
      correction_type: correctionType,
      total_matching_aos: allMatching.length,
      open_affected: openAOs.length,
      high_medium_count: highMedium.length,
      low_count: low.length,
      applied_at: appliedAt,
      summary,
    };
  },
});
