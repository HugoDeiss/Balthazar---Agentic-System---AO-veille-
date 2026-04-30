import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from './_shared/supabase';

export const manualOverride = createTool({
  id: 'manualOverride',
  description: `Change directement la priorité d'un AO sans passer par le pipeline de correction.
Utilise cet outil UNIQUEMENT quand l'utilisateur demande explicitement un changement de priorité ("mets cet AO en HIGH", "passe-le en prioritaire", "cet AO ne devrait pas être LOW").
Ne pas utiliser pour des corrections de scoring — utiliser executeCorrection dans ce cas.
Retourne un résultat pour confirmation UI — ne pas appliquer immédiatement.`,
  inputSchema: z.object({
    source_id: z.string().describe("source_id de l'AO"),
    client_id: z.string().default('balthazar'),
    new_priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).describe('Nouvelle priorité demandée par l\'utilisateur'),
    reason: z.string().describe('Raison du changement de priorité'),
    created_by: z.string().describe("Identité du consultant courant (pablo/alexandre)"),
  }),
  outputSchema: z.object({
    feedback_id: z.string(),
    ao_title: z.string(),
    current_priority: z.string().nullable(),
    new_priority: z.string(),
  }),
  execute: async ({ source_id, client_id, new_priority, reason, created_by }) => {
    const { data: ao } = await supabase
      .from('appels_offres')
      .select('title, priority, manual_priority')
      .eq('source_id', source_id)
      .single();

    const { data: feedbackRow } = await supabase
      .from('ao_feedback')
      .insert({
        source_id,
        client_id,
        feedback: new_priority === 'HIGH' ? 'relevant' : 'not_relevant',
        reason,
        correction_type: 'manual_override',
        correction_value: new_priority,
        agent_diagnosis: `Changement de priorité manuel : ${ao?.priority ?? '?'} → ${new_priority}`,
        agent_proposal: `Priorité de l'AO "${ao?.title ?? source_id}" changée en ${new_priority}`,
        status: 'agent_proposed',
        source: 'chat',
        created_by,
      })
      .select()
      .single();

    return {
      feedback_id: feedbackRow?.id ?? '',
      ao_title: ao?.title ?? source_id,
      current_priority: (ao?.manual_priority ?? ao?.priority) ?? null,
      new_priority,
    };
  },
});
