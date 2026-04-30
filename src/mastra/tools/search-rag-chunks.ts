import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { embedQuery, getVectorStore } from './balthazar-rag-tools';

const policiesFilterTypeEnum = z.enum([
  'sector_definition',
  'mandate_type',
  'exclusion_rule',
  'conditional_rule',
  'priority_rule',
  'disambiguation_rule',
]);

export const searchRAGChunks = createTool({
  id: 'searchRAGChunks',
  description:
    "Recherche sémantique dans le corpus RAG policies (pgvector, index « policies »). À utiliser avant de proposer un nouveau chunk pour vérifier les règles ou formulations déjà présentes et éviter les doublons.",
  inputSchema: z.object({
    query: z.string().describe('Requête sémantique (sujet de la règle, mots-clés, contexte métier)'),
    filter_type: policiesFilterTypeEnum
      .optional()
      .nullable()
      .describe(
        "Filtre optionnel sur metadata.type (même schéma que l'index policies). Omettre pour chercher dans tout le corpus.",
      ),
    topK: z
      .number()
      .optional()
      .default(5)
      .describe('Nombre de chunks à retourner (défaut 5)'),
  }),
  execute: async ({ query, filter_type, topK }) => {
    try {
      const queryVector = await embedQuery(query);
      const store = getVectorStore();

      const results = await store.query({
        indexName: 'policies',
        queryVector,
        topK,
        filter: filter_type ? { type: { $eq: filter_type } } : undefined,
        includeVector: false,
      });

      const chunks = results.map(r => ({
        chunk_id: (r.metadata?.chunk_id as string) || r.id,
        score: r.score ?? 0,
        text: (r.metadata?.text as string) || '',
        metadata: r.metadata || {},
      }));

      return {
        status: 'ok' as const,
        query,
        chunks,
        count: chunks.length,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[searchRAGChunks] store.query failed:', message);
      return {
        status: 'error' as const,
        query,
        error: message,
        chunks: [] as Array<{
          chunk_id: string;
          score: number;
          text: string;
          metadata: Record<string, unknown>;
        }>,
        count: 0,
      };
    }
  },
});
