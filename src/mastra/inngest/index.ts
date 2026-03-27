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
    // TEMPORARY TEST — revert to '0 6 * * 1-5' after test
    { cron: '50 15 * * *' },
    async ({ step }) => {
      const dayOfWeek = new Date().getDay(); // 0=Sun 1=Mon 3=Wed 5=Fri
      const isMarchesonlineDay = dayOfWeek === 3 || dayOfWeek === 5;

      const marchesonlineRSSUrls = isMarchesonlineDay
        ? ['https://www.marchesonline.com/mol/rss/appels-d-offres-domaine-activite-services.xml']
        : undefined;

      // step.run() provides Inngest memoization: if this function retries,
      // the workflow won't re-execute (idempotency at step level).
      return step.run('run-ao-veille', async () => {
        const workflow = mastra.getWorkflow('aoVeilleWorkflow');
        const run = await workflow.createRunAsync();

        // Fire and forget — do NOT await run.start()
        // The workflow runs async in Mastra Cloud's own execution engine.
        run
          .start({
            inputData: {
              clientId: process.env.BALTHAZAR_CLIENT_ID!,
              ...(marchesonlineRSSUrls && { marchesonlineRSSUrls }),
            },
          })
          .catch((err: unknown) => {
            console.error(
              '[inngest] aoVeilleWorkflow start error:',
              err instanceof Error ? err.message : err,
            );
          });

        return { triggered: true, timestamp: new Date().toISOString() };
      });
    },
  );
}

/**
 * Inngest function — triggered when a feedback is submitted.
 * Starts the feedbackWorkflow to diagnose and propose a correction.
 */
function createFeedbackProcessorFunction(mastra: Mastra) {
  return inngest.createFunction(
    { id: 'feedback-processor', name: 'AO Feedback Processor' },
    { event: 'ao.feedback.submitted' },
    async ({ event, step }) => {
      await step.run('run-feedback-workflow', async () => {
        const workflow = mastra.getWorkflow('feedbackWorkflow');
        const run = await workflow.createRunAsync();
        await run.start({ inputData: { feedbackId: event.data.feedbackId } });
      });
    },
  );
}

/**
 * Returns a Hono handler for the /api/inngest endpoint.
 * Called from Mastra's server.apiRoutes so the mastra instance is injected.
 */
export function createInngestHandler(mastra: Mastra) {
  const functions = [
    createAoVeilleFunction(mastra),
    createFeedbackProcessorFunction(mastra),
  ];
  return serve({ client: inngest, functions });
}
