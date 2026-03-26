import { Inngest } from 'inngest';
import { realtimeMiddleware } from '@inngest/realtime/middleware';
import { init, createStep, serve } from '@mastra/inngest';

export const inngest = new Inngest({
  id: 'balthazar-ao-veille',
  middleware: [realtimeMiddleware()],
});

const { createWorkflow } = init(inngest);
export { createWorkflow, createStep, serve };
