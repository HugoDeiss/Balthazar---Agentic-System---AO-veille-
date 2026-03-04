import { Mastra } from "@mastra/core/mastra";
import { PgVector } from "@mastra/pg";

// Import agents
import { 
  boampSemanticAnalyzer
} from "./agents";

// Import workflows
import { aoVeilleWorkflow } from "./workflows";

// ─────────────────────────────────────────────────────────────────────────────
// Vector Store — Supabase PostgreSQL + pgvector (via @mastra/vector-pg)
// Uses DATABASE_URL (Postgres connection string) for both dev and prod.
// ─────────────────────────────────────────────────────────────────────────────
const balthazarKnowledgeStore = new PgVector({
  connectionString: process.env.DATABASE_URL!,
});

/**
 * Balthazar Tender Monitoring System
 * 
 * Main Mastra instance configuration for the tender monitoring and analysis system.
 * This system supports Balthazar Consulting teams in identifying and assessing
 * relevant public procurement opportunities.
 * 
 * Features:
 * - Automated tender search across public procurement platforms (BOAMP)
 * - AI-powered relevance analysis and scoring
 * - GO/NO-GO recommendations with detailed justification
 * - Workflow-based processing pipeline
 * 
 * Agents:
 * - boampSemanticAnalyzer: Semantic analysis of BOAMP tenders (Step 2b) - uses GPT-4o-mini
 * 
 * Workflows:
 * - aoVeilleWorkflow: Complete pipeline from BOAMP fetch to analysis and storage
 */
export const mastra = new Mastra({
  agents: {
    boampSemanticAnalyzer,
  },
  workflows: {
    aoVeilleWorkflow,
  },
  vectors: {
    // Single LibSQL store exposing two indexes: "policies" and "case_studies"
    // The tools in balthazar-rag-tools.ts access this store directly via env vars
    // (singleton pattern) so they don't need to go through the Mastra instance.
    balthazarKnowledge: balthazarKnowledgeStore,
  },
  bundler: {
    externals: [
      "xmlbuilder",
      "rss-parser",
      "@supabase/supabase-js",
      "resend",
    ],
  },
  server: {
    port: 4111,
    cors: {
      origin: ["*"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    },
  },
});

