import { Mastra } from "@mastra/core/mastra";

// Import agents
import { tenderMonitorAgent, tenderAnalystAgent } from "./agents";

// Import workflows
import { aoVeilleWorkflow } from "./workflows";

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
 * - tenderMonitorAgent: Monitors and searches for tender opportunities
 * - tenderAnalystAgent: Analyzes tenders and provides recommendations
 * 
 * Workflows:
 * - aoVeilleWorkflow: Complete pipeline from BOAMP fetch to analysis and storage
 */
export const mastra = new Mastra({
  agents: {
    tenderMonitorAgent,
    tenderAnalystAgent,
  },
  workflows: {
    aoVeilleWorkflow,
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

