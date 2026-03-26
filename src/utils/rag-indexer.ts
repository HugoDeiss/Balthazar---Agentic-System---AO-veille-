/**
 * RAG Indexer
 *
 * Embeds a chunk and upserts it into the PgVector store.
 * Reuses the same PgVector instance as balthazar-rag-tools.ts.
 */

import { openai as openaiProvider } from '@ai-sdk/openai';
import { embedMany } from 'ai-v5';
import { PgVector } from '@mastra/pg';

const EMBEDDING_MODEL = 'text-embedding-3-small';

let _vectorStore: PgVector | null = null;

function getVectorStore(): PgVector {
  if (!_vectorStore) {
    _vectorStore = new PgVector({
      connectionString: process.env.DATABASE_URL!,
    });
  }
  return _vectorStore;
}

export interface ChunkPayload {
  indexName: 'policies' | 'case_studies';
  text: string;
  metadata: Record<string, unknown>;
}

/**
 * Embeds the chunk text and upserts it into the specified pgvector index.
 */
export async function insertAndIndexChunk(payload: ChunkPayload): Promise<void> {
  const { indexName, text, metadata } = payload;

  const { embeddings } = await embedMany({
    model: openaiProvider.embedding(EMBEDDING_MODEL),
    values: [text],
  });

  const vector = embeddings[0];
  const store = getVectorStore();

  await store.upsert({
    indexName,
    vectors: [
      {
        id: (metadata.chunk_id as string) ?? `feedback_${Date.now()}`,
        vector,
        metadata: {
          ...metadata,
          text,
        },
      },
    ],
  });

  console.log(`[rag-indexer] Chunk inserted in "${indexName}" index (id: ${metadata.chunk_id})`);
}
