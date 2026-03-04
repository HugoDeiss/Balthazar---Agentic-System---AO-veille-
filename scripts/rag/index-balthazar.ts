/**
 * scripts/rag/index-balthazar.ts
 *
 * Reads rag/balthazar_corpus.jsonl, generates embeddings via OpenAI,
 * and upserts into two pgvector-backed indexes: "policies" and "case_studies".
 *
 * Usage:
 *   npx tsx scripts/rag/index-balthazar.ts
 *
 * Prerequisites:
 *   OPENAI_API_KEY set in .env
 *   DATABASE_URL set in .env (Supabase Postgres connection string)
 *
 * Notes:
 *   - Idempotent: chunk_id is used as stable vector ID so re-running upserts safely.
 *   - Dimension 1536 matches text-embedding-3-small output.
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { resolve } from 'path';
import { config } from 'dotenv';
import { openai as openaiProvider } from '@ai-sdk/openai';
import { embedMany } from 'ai-v5';
import { PgVector } from '@mastra/pg';

config(); // Load .env

// ─────────────────────────────────────────
// Config
// ─────────────────────────────────────────

const CORPUS_PATH = resolve(process.cwd(), 'rag/balthazar_corpus.jsonl');
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSION = 1536;
const BATCH_SIZE = 20; // embedMany batch size

const DATABASE_URL = process.env.DATABASE_URL;

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

interface CorpusChunk {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  index: 'policies' | 'case_studies';
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

async function readCorpus(filePath: string): Promise<CorpusChunk[]> {
  const chunks: CorpusChunk[] = [];
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const chunk = JSON.parse(trimmed) as CorpusChunk;
      chunks.push(chunk);
    } catch (err) {
      console.warn(`[WARN] Skipping invalid JSONL line: ${trimmed.slice(0, 80)}...`);
    }
  }
  return chunks;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

// ─────────────────────────────────────────
// Main
// ─────────────────────────────────────────

async function main() {
  console.log('🔍 Reading corpus from', CORPUS_PATH);
  const allChunks = await readCorpus(CORPUS_PATH);
  console.log(`📄 Loaded ${allChunks.length} chunks`);

  // Split by index
  const policiesChunks = allChunks.filter(c => c.index === 'policies');
  const caseStudiesChunks = allChunks.filter(c => c.index === 'case_studies');

  console.log(`  → policies: ${policiesChunks.length} chunks`);
  console.log(`  → case_studies: ${caseStudiesChunks.length} chunks`);

  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL must be set in environment for pgvector indexing');
  }

  // Initialize vector store (pgvector on Supabase Postgres)
  const vectorStore = new PgVector({ connectionString: DATABASE_URL });

  // Create / ensure indexes exist
  for (const indexName of ['policies', 'case_studies'] as const) {
    try {
      await vectorStore.createIndex({
        indexName,
        dimension: EMBEDDING_DIMENSION,
        metric: 'cosine',
      });
      console.log(`✅ Index "${indexName}" created`);
    } catch (err: any) {
      // Index may already exist — that's fine
      if (err.message?.includes('already exists') || err.code === 'ALREADY_EXISTS') {
        console.log(`ℹ️  Index "${indexName}" already exists, skipping creation`);
      } else {
        console.error(`⚠️  Could not create index "${indexName}":`, err.message);
      }
    }
  }

  // Embed and upsert each index
  for (const [indexName, chunks] of [
    ['policies', policiesChunks],
    ['case_studies', caseStudiesChunks],
  ] as const) {
    if (chunks.length === 0) {
      console.log(`\nℹ️  No chunks for "${indexName}", skipping`);
      continue;
    }

    console.log(`\n🔢 Embedding ${chunks.length} chunks for "${indexName}"...`);

    const batches = chunkArray(chunks, BATCH_SIZE);
    let processed = 0;

    for (const batch of batches) {
      const texts = batch.map(c => c.content);

      const { embeddings } = await embedMany({
        model: openaiProvider.embedding(EMBEDDING_MODEL),
        values: texts,
      });

      await vectorStore.upsert({
        indexName,
        vectors: embeddings,
        metadata: batch.map(c => ({
          text: c.content,
          chunk_id: c.id,
          ...c.metadata,
        })),
        ids: batch.map(c => c.id),
      });

      processed += batch.length;
      console.log(`  ${processed}/${chunks.length} chunks indexed`);
    }

    console.log(`✅ "${indexName}" indexed successfully`);
  }

  console.log('\n🎉 Indexing complete!');
  console.log(`   Vector DB (pgvector): ${DATABASE_URL}`);
  console.log(`   Total vectors: ${allChunks.length}`);
  console.log('\nNext step: run the workflow with RAG tools enabled.');
}

main().catch(err => {
  console.error('❌ Indexing failed:', err);
  process.exit(1);
});
