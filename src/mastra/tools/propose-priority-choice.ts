import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const proposePriorityChoice = createTool({
  id: 'proposePriorityChoice',
  description: `Affiche la carte interactive de choix de priorité cible (HIGH/MEDIUM/LOW/KEEP).
À appeler EN FIN d'initialisation, après getAODetails et searchRAGChunks.
L'interface affichera 4 boutons. Le choix de l'utilisateur arrivera comme [priority_choice:VALUE] au tour suivant.
NE PAS appeler si une session de correction est déjà en cours.`,
  inputSchema: z.object({
    source_id: z.string().describe("source_id de l'AO"),
    current_priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).nullable().describe('Priorité actuelle de l\'AO'),
  }),
  outputSchema: z.object({
    source_id: z.string(),
    current_priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).nullable(),
  }),
  execute: async ({ source_id, current_priority }) => ({
    source_id,
    current_priority,
  }),
});
