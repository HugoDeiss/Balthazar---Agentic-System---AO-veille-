import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from './_shared/supabase';

export const searchSimilarKeywords = createTool({
  id: 'searchSimilarKeywords',
  description:
    'Vérifie si un keyword ou une règle similaire existe déjà dans les overrides actifs ou les red flags statiques. Utilise cet outil avant de proposer une correction pour éviter les doublons.',
  inputSchema: z.object({
    term: z.string().describe('Terme à rechercher (ex: transport scolaire, accompagnement RH)'),
    client_id: z.string().default('balthazar'),
  }),
  outputSchema: z.object({
    existing_overrides: z.array(
      z.object({
        value: z.string(),
        type: z.string(),
        reason: z.string().nullable(),
      }),
    ),
    has_conflict: z.boolean(),
    conflict_detail: z.string().nullable(),
  }),
  execute: async ({ term, client_id }) => {
    const { data } = await supabase
      .from('keyword_overrides')
      .select('value, type, reason')
      .eq('client_id', client_id)
      .eq('active', true)
      .ilike('value', `%${term}%`);

    const overrides = data ?? [];

    return {
      existing_overrides: overrides,
      has_conflict: overrides.length > 0,
      conflict_detail:
        overrides.length > 0
          ? `Règle similaire déjà active : "${overrides[0].value}" (${overrides[0].type})`
          : null,
    };
  },
});
