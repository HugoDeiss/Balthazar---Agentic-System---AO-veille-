import { createTool } from '@mastra/core/tools';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { supabase } from './_shared/supabase';

// Minimal agent for extracting business terms from AO text
const termExtractorAgent = new Agent({
  id: 'term-extractor',
  name: 'term-extractor',
  model: openai('gpt-4o-mini'),
  instructions: "Tu extrais des termes métier pertinents depuis des titres et descriptions d'appels d'offres publics français. Réponds uniquement en JSON.",
});

export const proposeChoices = createTool({
  id: 'proposeChoices',
  description: `Génère les options structurées pour Q1 (portée de la correction).
Appelle ce tool pour formuler Q1 de façon structurée — le résultat s'affichera sous forme de carte interactive dans l'interface.
Pour un faux positif (direction=exclude) : options d'exclusion basées sur les keywords de l'AO.
Pour un faux négatif (direction=include) : options de boost basées sur les keywords de l'AO.`,
  inputSchema: z.object({
    source_id: z.string().describe("source_id de l'AO concerné"),
    direction: z.enum(['exclude', 'include']).default('exclude').describe("'exclude' pour un faux positif, 'include' pour un faux négatif"),
  }),
  outputSchema: z.object({
    question: z.string(),
    choices: z.array(z.object({
      letter: z.string(),
      label: z.string(),
      value: z.string(),
    })),
    direction: z.enum(['exclude', 'include']),
  }),
  execute: async ({ source_id, direction }) => {
    const { data } = await supabase
      .from('appels_offres')
      .select('title, description, matched_keywords, keyword_breakdown')
      .eq('source_id', source_id)
      .single();

    const choices: Array<{ letter: string; label: string; value: string }> = [];
    const letters = ['A', 'B', 'C'];

    if (direction === 'exclude') {
      const keywords: string[] = ((data?.matched_keywords as string[]) ?? []).slice(0, 2);
      keywords.forEach((kw, i) => {
        choices.push({ letter: letters[i], label: `Les AOs liés à "${kw}"`, value: kw });
      });
      choices.push({ letter: letters[choices.length], label: 'Autre (je précise)', value: 'autre' });
      return { question: 'On exclut :', choices, direction: 'exclude' as const };
    } else {
      let suggestedTerms: string[] = [];
      try {
        const result = await termExtractorAgent.generate([{
          role: 'user',
          content: `Titre AO: "${data?.title ?? ''}"
Description: "${(data?.description as string ?? '').slice(0, 400)}"

Extrais exactement 2 termes métier pertinents (2-4 mots max chacun) qui caractérisent le secteur ou l'expertise de cet appel d'offres. Réponds UNIQUEMENT au format JSON: ["terme1", "terme2"]`,
        }]);
        suggestedTerms = JSON.parse(result.text);
      } catch {
        // fallback: empty, only "Autre" option
      }
      suggestedTerms.slice(0, 2).forEach((term, i) => {
        choices.push({ letter: letters[i], label: `Booster les AOs liés à "${term}"`, value: term });
      });
      choices.push({ letter: letters[choices.length], label: 'Autre (je précise)', value: 'autre' });
      return { question: 'Quel terme booster pour inclure cet AO ?', choices, direction: 'include' as const };
    }
  },
});
