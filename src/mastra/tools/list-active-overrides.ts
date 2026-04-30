import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from './_shared/supabase';

export const listActiveOverrides = createTool({
  id: 'listActiveOverrides',
  description: `Liste toutes les règles de filtrage actives (keyword overrides).
Utilise cet outil quand l'utilisateur demande à voir les règles existantes,
ou quand tu suspectes qu'une règle précédente cause des effets de bord.`,
  inputSchema: z.object({
    client_id: z.string().default('balthazar'),
    type: z.enum(['red_flag', 'required_keyword', 'all']).default('all'),
  }),
  outputSchema: z.object({
    overrides: z.array(z.object({
      id: z.string(),
      type: z.string(),
      value: z.string(),
      reason: z.string().nullable(),
      created_at: z.string(),
    })),
    total: z.number(),
    summary: z.string(),
  }),
  execute: async ({ client_id, type }) => {
    let query = supabase
      .from('keyword_overrides')
      .select('id, type, value, reason, created_at')
      .eq('client_id', client_id)
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (type !== 'all') {
      query = query.eq('type', type);
    }

    const { data } = await query;
    const overrides = data ?? [];

    const summary = overrides.length === 0
      ? 'Aucune règle personnalisée active pour le moment.'
      : overrides.map((o, i) =>
          `${i + 1}. [${o.type}] "${o.value}" — ${o.reason ?? 'aucune raison documentée'}`
        ).join('\n');

    return {
      overrides,
      total: overrides.length,
      summary: `${overrides.length} règle(s) active(s) :\n${summary}`,
    };
  },
});
