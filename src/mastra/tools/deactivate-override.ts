import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from './_shared/supabase';

export const deactivateOverride = createTool({
  id: 'deactivateOverride',
  description: `Désactive un keyword override existant dans keyword_overrides.
Utilise cet outil quand l'utilisateur signale qu'une règle précédemment ajoutée exclut des AOs qui devraient passer.
La règle est désactivée (active=false) mais conservée pour l'audit.`,
  inputSchema: z.object({
    override_id: z.string().optional().describe("UUID de l'override à désactiver"),
    value: z.string().optional().describe("Valeur du keyword à désactiver si pas d'ID"),
    client_id: z.string().default('balthazar'),
    reason: z.string().describe('Pourquoi on désactive cette règle'),
  }),
  outputSchema: z.object({
    deactivated: z.boolean(),
    message: z.string(),
    affected_rule: z.object({
      value: z.string(),
      type: z.string(),
    }).nullable(),
  }),
  execute: async ({ override_id, value, client_id }) => {
    if (!override_id && !value) {
      return { deactivated: false, message: 'Fournir override_id ou value.', affected_rule: null };
    }

    let query = supabase
      .from('keyword_overrides')
      .update({ active: false })
      .eq('client_id', client_id)
      .eq('active', true);

    if (override_id) {
      query = query.eq('id', override_id);
    } else {
      query = query.ilike('value', `%${value}%`);
    }

    const { data, error } = await query.select().single();

    if (error || !data) {
      return { deactivated: false, message: 'Override non trouvé ou déjà inactif.', affected_rule: null };
    }

    return {
      deactivated: true,
      message: `Règle "${data.value}" désactivée. Elle ne s'appliquera plus dès le prochain run.`,
      affected_rule: { value: data.value, type: data.type },
    };
  },
});
