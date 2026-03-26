import { Inngest } from 'inngest';
import { serve } from 'inngest/hono';
import type { Mastra } from '@mastra/core/mastra';

export const inngest = new Inngest({ id: 'balthazar-ao-veille' });

/**
 * Scheduled Inngest function — replaces the GitHub Actions cron.
 * Inngest handles idempotency: if the pod is cold and the first
 * invocation is slow, Inngest will not fire a duplicate event.
 *
 * MarchesOnline RSS is activated on Wednesday (3) and Friday (5) only,
 * matching the previous GitHub Actions schedule logic.
 */
function createAoVeilleFunction(mastra: Mastra) {
  return inngest.createFunction(
    { id: 'ao-veille-daily', name: 'AO Veille Quotidienne' },
    { cron: '0 6 * * 1-5' },
    async () => {
      const dayOfWeek = new Date().getDay(); // 0=Sun 1=Mon 3=Wed 5=Fri
      const isMarchesonlineDay = dayOfWeek === 3 || dayOfWeek === 5;

      const marchesonlineRSSUrls = isMarchesonlineDay
        ? ['https://www.marchesonline.com/mol/rss/appels-d-offres-domaine-activite-services.xml']
        : undefined;

      const workflow = mastra.getWorkflow('aoVeilleWorkflow');
      const run = await workflow.createRunAsync();
      const result = await run.start({
        inputData: {
          clientId: process.env.BALTHAZAR_CLIENT_ID!,
          ...(marchesonlineRSSUrls && { marchesonlineRSSUrls }),
        },
      });

      return result;
    },
  );
}

/**
 * Returns a Hono handler for the /api/inngest endpoint.
 * Called from Mastra's server.apiRoutes so the mastra instance is injected.
 */
export function createInngestHandler(mastra: Mastra) {
  const functions = [createAoVeilleFunction(mastra)];
  return serve({ client: inngest, functions });
}
