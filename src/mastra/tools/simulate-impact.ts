import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from './_shared/supabase';

const simulateImpactAOSchema = z.object({
  source_id: z.string(),
  title: z.string(),
  priority: z.string().nullable(),
  url_ao: z.string().nullable(),
  final_score: z.number().nullable(),
  reason: z.string(),
});

export const simulateImpact = createTool({
  id: 'simulateImpact',
  description: `Simule l'impact d'un terme sur les AOs récents. Appelle cet outil pour Q2 : montrer à l'utilisateur les AOs similaires affectés avant de confirmer la correction.
Pour direction=exclude : montre les AOs HIGH/MEDIUM qui seraient exclus à tort (à vérifier) et les LOW correctement exclus.
Pour direction=include : montre les AOs LOW qui seraient promus.
Le résultat s'affichera sous forme de carte interactive dans l'interface.`,
  inputSchema: z.object({
    term: z.string().describe("Terme à tester (red flag pour exclude, keyword à booster pour include)"),
    days_back: z.number().default(30).describe('Fenêtre temporelle en jours (défaut: 30)'),
    direction: z.enum(['exclude', 'include']).default('exclude').describe("'exclude' pour simuler un red flag, 'include' pour simuler un boost"),
  }),
  outputSchema: z.object({
    total_affected: z.number(),
    correctly_excluded: z.array(simulateImpactAOSchema),
    potentially_wrong: z.array(simulateImpactAOSchema),
    would_promote: z.array(simulateImpactAOSchema),
    summary: z.string(),
    direction: z.enum(['exclude', 'include']),
  }),
  execute: async ({ term, days_back, direction }) => {
    const since = new Date();
    since.setDate(since.getDate() - (days_back ?? 30));

    const { data } = await supabase
      .from('appels_offres')
      .select('source_id, title, priority, url_ao, final_score')
      .gte('analyzed_at', since.toISOString())
      .or(`title.ilike.%${term}%,description.ilike.%${term}%`);

    const affected = data ?? [];

    if (direction === 'exclude') {
      const correctly_excluded = affected
        .filter(ao => ao.priority === 'LOW' || ao.priority === null)
        .map(ao => ({
          source_id: ao.source_id,
          title: ao.title,
          priority: ao.priority,
          url_ao: ao.url_ao ?? null,
          final_score: ao.final_score ?? null,
          reason: "AO déjà classé LOW — l'exclusion ne change rien de visible",
        }));

      const potentially_wrong = affected
        .filter(ao => ao.priority === 'HIGH' || ao.priority === 'MEDIUM')
        .map(ao => ({
          source_id: ao.source_id,
          title: ao.title,
          priority: ao.priority,
          url_ao: ao.url_ao ?? null,
          final_score: ao.final_score ?? null,
          reason: `AO classé ${ao.priority} — à vérifier avant de confirmer l'exclusion`,
        }));

      const summaryLines: string[] = [`${affected.length} AO(s) affecté(s) sur les ${days_back} derniers jours.`];
      if (correctly_excluded.length > 0) summaryLines.push(`✅ ${correctly_excluded.length} correctement exclus (déjà LOW).`);
      if (potentially_wrong.length > 0) summaryLines.push(`⚠️ ${potentially_wrong.length} à vérifier (HIGH/MEDIUM) : ${potentially_wrong.map(a => `"${a.title}"`).join(', ')}.`);

      return {
        total_affected: affected.length,
        correctly_excluded,
        potentially_wrong,
        would_promote: [],
        summary: summaryLines.join(' '),
        direction: 'exclude' as const,
      };
    } else {
      const would_promote = affected
        .filter(ao => ao.priority === 'LOW' || ao.priority === null)
        .map(ao => ({
          source_id: ao.source_id,
          title: ao.title,
          priority: ao.priority,
          url_ao: ao.url_ao ?? null,
          final_score: ao.final_score ?? null,
          reason: 'AO LOW qui serait promu avec ce boost',
        }));

      const already_passing = affected
        .filter(ao => ao.priority === 'HIGH' || ao.priority === 'MEDIUM')
        .map(ao => ({
          source_id: ao.source_id,
          title: ao.title,
          priority: ao.priority,
          url_ao: ao.url_ao ?? null,
          final_score: ao.final_score ?? null,
          reason: `AO déjà ${ao.priority} — pas d'impact`,
        }));

      const summaryLines: string[] = [`${affected.length} AO(s) concerné(s) sur les ${days_back} derniers jours.`];
      if (would_promote.length > 0) summaryLines.push(`🔼 ${would_promote.length} AO(s) LOW seraient promus.`);
      if (already_passing.length > 0) summaryLines.push(`✅ ${already_passing.length} déjà HIGH/MEDIUM — pas d'impact.`);
      if (affected.length === 0) summaryLines.push('Aucun AO récent contient ce terme.');

      return {
        total_affected: affected.length,
        correctly_excluded: already_passing,
        potentially_wrong: [],
        would_promote,
        summary: summaryLines.join(' '),
        direction: 'include' as const,
      };
    }
  },
});
