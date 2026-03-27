import { Mastra } from "@mastra/core/mastra";
import { createInngestHandler } from "./inngest";

// Import agents
import {
  boampSemanticAnalyzer,
  aoFeedbackTuningAgent,
  aoFeedbackAgent,
} from "./agents";

// Import workflows
import { aoVeilleWorkflow, feedbackWorkflow } from "./workflows";

// Import feedback handlers
import {
  handleFeedbackForm,
  handleFeedbackSubmit,
  handleFeedbackConfirm,
} from "./feedback-routes";

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
    aoFeedbackTuningAgent,
    aoFeedbackAgent,
  },
  workflows: {
    aoVeilleWorkflow,
    feedbackWorkflow,
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
    apiRoutes: [
      {
        path: '/api/inngest',
        method: 'ALL',
        createHandler: async ({ mastra }) => createInngestHandler(mastra),
      },
      {
        path: '/api/feedback',
        method: 'GET',
        createHandler: async () => async (req: Request) => handleFeedbackForm(req),
      },
      {
        path: '/api/feedback/submit',
        method: 'POST',
        createHandler: async () => async (req: Request) => handleFeedbackSubmit(req),
      },
      {
        path: '/api/feedback/confirm',
        method: 'GET',
        createHandler: async ({ mastra }) => async (req: Request) => handleFeedbackConfirm(req, mastra),
      },
    ],
    cors: {
      origin: ["*"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    },
  },
});

