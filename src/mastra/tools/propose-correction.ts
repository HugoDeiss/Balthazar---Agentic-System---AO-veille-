import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from './_shared/supabase';

export const proposeCorrection = createTool({
  id: 'proposeCorrection',
  description:
    "Enregistre une proposition de correction dans la base de données. Utilise cet outil après avoir diagnostiqué le problème et formulé une correction précise. La correction ne sera PAS appliquée tant que l'utilisateur n'a pas confirmé.",
  inputSchema: z.object({
    source_id: z.string(),
    client_id: z.string().default('balthazar'),
    correction_type: z
      .enum(['keyword_red_flag', 'rag_chunk'])
      .describe(
        'keyword_red_flag: ajouter un red flag qui exclura les AOs similaires. rag_chunk: ajouter une règle métier dans le corpus RAG.',
      ),
    value: z
      .string()
      .describe(
        'Pour keyword_red_flag: le terme exact à exclure. Pour rag_chunk: le titre du nouveau chunk.',
      ),
    chunk_content: z
      .string()
      .optional()
      .describe('Contenu du chunk RAG (uniquement pour correction_type=rag_chunk)'),
    diagnosis_fr: z.string().describe("Explication en français de pourquoi l'AO a passé le filtre"),
    proposal_fr: z.string().describe('Description en français de ce qui sera modifié'),
    impact_fr: z.string().describe("Impact attendu en une phrase (ex: à partir de demain, les AOs sur X seront exclus)"),
    user_reason: z.string().describe("Raison fournie par l'utilisateur"),
    created_by: z.string().optional().describe("Identité du consultant courant (pablo/alexandre)"),
  }),
  outputSchema: z.object({
    feedback_id: z.string(),
    proposal_summary: z.string(),
  }),
  execute: async ({ source_id, client_id, user_reason, correction_type, value, chunk_content, diagnosis_fr, proposal_fr, impact_fr, created_by }) => {
    const { data } = await supabase
      .from('ao_feedback')
      .insert({
        source_id,
        client_id,
        feedback: 'not_relevant',
        reason: user_reason,
        correction_type,
        correction_value: value,
        chunk_content: chunk_content ?? null,
        agent_diagnosis: diagnosis_fr,
        agent_proposal: proposal_fr,
        status: 'agent_proposed',
        source: 'chat',
        created_by: created_by ?? null,
      })
      .select()
      .single();

    return {
      feedback_id: data?.id ?? '',
      proposal_summary: `${proposal_fr} — ${impact_fr}`,
    };
  },
});
