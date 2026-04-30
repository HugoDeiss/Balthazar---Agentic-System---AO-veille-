import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import {
  getAODetails,
  searchSimilarKeywords,
  searchRAGChunks,
  simulateImpact,
  proposeCorrection,
  applyCorrection,
  deactivateOverride,
  listActiveOverrides,
} from '../../tools';
import { feedbackAgentInstructions } from './instructions';

export const aoFeedbackAgent = new Agent({
  id: 'ao-feedback-agent',
  name: 'ao-feedback-agent',
  model: openai.chat('gpt-4o'),
  defaultGenerateOptionsLegacy: { maxSteps: 20 },
  defaultStreamOptionsLegacy: { maxSteps: 20 },
  instructions: feedbackAgentInstructions,
  tools: {
    getAODetails,
    searchSimilarKeywords,
    searchRAGChunks,
    simulateImpact,
    proposeCorrection,
    applyCorrection,
    deactivateOverride,
    listActiveOverrides,
  },
});
