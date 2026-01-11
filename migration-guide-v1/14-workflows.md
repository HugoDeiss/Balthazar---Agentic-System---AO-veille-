# Migration Guide v1.0 - Workflows

# Workflows | v1 Migration Guide

Mastra v1 Beta: Learn how to migrate workflow-related changes when upgrading to v1.

Source: https://mastra.ai/guides/v1/migrations/upgrade-to-v1/workflows

---

# Workflows

Legacy workflow features have been removed. 

## ChangedDirect link to Changed

### getWorkflows to listWorkflowsDirect link to getworkflows-to-listworkflows

The `mastra.getWorkflows()`method has been renamed to `mastra.listWorkflows()`. This change aligns with the naming convention used across the API where plural getter methods use the `list`prefix. 

To migrate, replace all calls to `mastra.getWorkflows()`with `mastra.listWorkflows()`. 

```
- const workflows = mastra.getWorkflows();+ const workflows = mastra.listWorkflows();
```

Codemod You can use Mastra's codemod CLI to update your imports automatically: 

```
npx @mastra/codemod@beta v1/mastra-plural-apis .
```

### RuntimeContext to RequestContext in step contextDirect link to runtimecontext-to-requestcontext-in-step-context

The parameter name `runtimeContext`has been changed to `requestContext`in workflow step execution context. This change aligns with the global rename for clarity. 

To migrate, update references from `runtimeContext`to `requestContext`in step execution functions. 

```
  createStep({-   execute: async ({ runtimeContext } ) => {-     const userTier = context.runtimeContext.get('userTier');+   execute: async ({ requestContext } ) => {+     const userTier = requestContext.get('userTier');      return { result: userTier };    },  });
```

Codemod You can use Mastra's codemod CLI to update your imports automatically: 

```
npx @mastra/codemod@beta v1/runtime-context .
```

### createRunAsync to createRunDirect link to createrunasync-to-createrun

The `createRunAsync()`method has been renamed to `createRun()`. This change simplifies the API by removing the redundant "Async" suffix since all run creation is asynchronous. 

To migrate, rename method calls from `createRunAsync`to `createRun`. 

```
- await workflow.createRunAsync({ input: { ... } });+ await workflow.createRun({ input: { ... } });
```

Codemod You can use Mastra's codemod CLI to update your code automatically: 

```
npx @mastra/codemod@beta v1/workflow-create-run-async .
```

### runCount to retryCount (deprecated)Direct link to runcount-to-retrycount-deprecated

The `runCount`parameter has been deprecated in favor of `retryCount`in workflow step execution. This change provides clearer naming that better describes retry behavior. The old `runCount`still works but shows deprecation warnings. 

To migrate, rename `runCount`to `retryCount`in step execution functions. 

```
  createStep({    execute: async (inputData, context) => {-     console.log(`Step run ${context.runCount} times`);+     console.log(`Step retry count: ${context.retryCount}`);    },  });
```

Codemod You can use Mastra's codemod CLI to update your code automatically: 

```
npx @mastra/codemod@beta v1/workflow-run-count .
```

### getWorkflowRuns to listWorkflowRunsDirect link to getworkflowruns-to-listworkflowruns

The `getWorkflowRuns()`method has been renamed to `listWorkflowRuns()`. This change aligns with the convention that `list*`methods return collections. 

To migrate, rename method calls from `getWorkflowRuns`to `listWorkflowRuns`. 

```
- const runs = await workflow.getWorkflowRuns({ fromDate, toDate });+ const runs = await workflow.listWorkflowRuns({ fromDate, toDate });
```

Codemod You can use Mastra's codemod CLI to update your code automatically: 

```
npx @mastra/codemod@beta v1/workflow-list-runs .
```

### Inputs are validated by defaultDirect link to Inputs are validated by default

Previously, inputs weren't validated by default. The [validateInputs](/reference/v1/workflows/workflow#workflowoptions)flag determines whether to validate the workflow inputs or not. This boolean has been flipped to `true`. If you want the old behavior or have workflows whose schemas don't need to be validated, set `validateInputs: false`. 

```
createWorkflow({+  options: {+    validateInputs: false+  }})
```

### Step suspendPayload validationDirect link to step-suspendpayload-validation

Step `suspendPayload`is now validated for steps that have a `suspendSchema`defined. This also uses the `validateInputs`flag to determine whether to validate the `suspendPayload`or not. 

```
  createStep({    id: "suspend-resume-step",    // ... other step properties    suspendSchema: z.object({      reason: z.string(),      otherReason: z.string()    }),    execute: async ({ suspend, resumeData}) => {      if (!resumeData) {-       return suspend({ reason: "Suspension reason" }); // Missing otherReason+       return suspend({ reason: "Suspension reason", otherReason: "Other reason" });      }    },  });
```

### Branch result fields are now optionalDirect link to Branch result fields are now optional

The `.branch()`method now returns a schema where all branch output fields are optional. This reflects the runtime behavior where each branch only executes if its condition is truthy, so outputs from any branch may be undefined. 

To migrate, update any code that consumes branch outputs to handle optional values. 

```
  const workflow = createWorkflow({...})    .branch([      [condition1, stepA],  // outputSchema: { result: z.string() }      [condition2, stepB],  // outputSchema: { data: z.number() }    ])-   // Previously: stepA.result typed as string, stepB.data typed as number+   // Now: stepA.result typed as string | undefined, stepB.data typed as number | undefined    .then(nextStep);
```

If your code depends on non-optional types, add runtime checks or provide default values when accessing branch outputs. 

### writableStream to outputWriter in Run.start() & Run.timeTravel()Direct link to writablestream-to-outputwriter-in-runstart--runtimetravel

The `writableStream`parameter in `Run.start()`and `Run.timeTravel()`has been replaced with `outputWriter`. Instead of passing a `WritableStream`, you now pass an async callback function that receives each workflow event chunk directly. 

This change simplifies the API - rather than creating a `WritableStream`wrapper, you handle chunks directly in the callback. 

**Example:**Streaming workflow events to an HTTP response (SSE): 

```
  const run = await workflow.createRun();- const stream = new WritableStream({-   write(chunk) {-     response.write(`data: ${JSON.stringify(chunk)}\n\n`);-   }- });- await run.start({ inputData, writableStream: stream });+ await run.start({+   inputData,+   outputWriter: async (chunk) => {+     response.write(`data: ${JSON.stringify(chunk)}\n\n`);+   },+ });
```

note The `writer`parameter passed to step `execute`functions is not affected by this change. It remains a `ToolStream`that extends `WritableStream<unknown>`and provides `.write()`and `.custom()`methods: 

```
createStep({  id: 'my-step',  execute: async ({ writer }) => {    // This API is unchanged    await writer.write({ data: 'some output' });    await writer.custom({ type: 'custom-event', payload: {} });  },});
```

### setState() is now async and the data passed is validatedDirect link to setstate-is-now-async-and-the-data-passed-is-validated

The `setState()`function is now async. The data passed is now validated against the `stateSchema`defined in the step. The state data validation also uses the `validateInputs`flag to determine whether to validate the state data or not. Also, when calling `setState()`, you can now pass only the state data being updated, instead of adding the previous state spread `(...state)`. 

To migrate, update the `setState()`function to be async. 

```
- setState({ ...state, sharedCounter: state.sharedCounter + 1 });+ await setState({ sharedCounter: state.sharedCounter + 1 });+ // await setState({ ...state, sharedCounter: state.sharedCounter + 1 }); + // this also works, as the previous state spread remains supported
```

## RemovedDirect link to Removed

### streamVNext, resumeStreamVNext, and observeStreamVNext methodsDirect link to streamvnext-resumestreamvnext-and-observestreamvnext-methods

The experimental `streamVNext()`, `resumeStreamVNext()`, and `observeStreamVNext()`methods have been removed. These methods are now the standard implementation with updated event structures and return types. 

To migrate, use the standard `stream()`, `resumeStream()`, and `observeStream()`methods. Update event type checks to use workflow-prefixed names and access stream properties directly. 

See [Run.stream()](/reference/v1/streaming/workflows/stream), [Run.resumeStream()](/reference/v1/streaming/workflows/resumeStream), and [Run.observeStream()](/reference/v1/streaming/workflows/observeStream)for details. 

Codemod You can use Mastra's codemod CLI to update your code automatically: 

```
npx @mastra/codemod@beta v1/workflow-stream-vnext .
```

### suspend and setState are not available in step condition functions parametersDirect link to suspend-and-setstate-are-not-available-in-step-condition-functions-parameters

The `suspend`and `setState`functions are not available in step condition functions parameters. 

To migrate, use the `suspend`function in the step execute function instead. 

```
.dowhile(step, async ({ suspend, state, setState }) => {- setState({...state, updatedState: "updated state"})- await suspend({ reason: "Suspension reason" });+ // Use the suspend/setState in the step execute function instead});
```

This is the same for `dountil`and `branch`condition functions parameters. 

### Legacy workflows exportDirect link to Legacy workflows export

The `./workflows/legacy`export path has been removed from `@mastra/core`. Legacy workflows are no longer supported. 

To migrate, use the new workflow API. There is no direct migration path from legacy workflows. 

```
- import { LegacyWorkflow } from '@mastra/core/workflows/legacy';+ // Legacy workflows are no longer supported+ // Migrate to the new workflow API
```

### pipeThrough and pipeTo methods from WorkflowRunOutputDirect link to pipethrough-and-pipeto-methods-from-workflowrunoutput

The `pipeThrough()`and `pipeTo()`methods on `WorkflowRunOutput`are deprecated. These methods still work but show console warnings. 

To migrate, use the `fullStream`property instead of calling methods directly on the run output. 

```
  const run = await workflow.createRun({ input: { ... } });- await run.pipeTo(writableStream);- const transformed = run.pipeThrough(transformStream);+ await run.fullStream.pipeTo(writableStream);+ const transformed = run.fullStream.pipeThrough(transformStream);
```

### Watch events APIDirect link to Watch events API

Legacy watch events have been removed and consolidated on the v2 events API. The `watch()`method and related watch endpoints are no longer available. 

To migrate, use the workflow events API or streaming instead of watch events. 

```
- const workflow = mastraClient.getWorkflow('my-workflow');- const run = await workflow.createRun();- await run.watch((event) => {-   console.log('Step completed:', event);- });+ const workflow = mastraClient.getWorkflow('my-workflow');+ const run = await workflow.createRun();+ const stream = await run.stream({ inputData: { ... } });+ for await (const chunk of stream) {+   console.log('Step completed:', chunk);+ }
```

### waitForEvent APIDirect link to waitforevent-api

The `waitForEvent`API has been removed from workflows. Use the suspend/resume API instead. 

To migrate, use suspend/resume API for waiting on workflow execution milestones. 

```
- workflow.waitForEvent('step-complete', step1).commit();+ workflow.then(step1).commit();+ // Use suspend/resume API instead, in step1 execute functioncreateStep({- execute: async (inputData, context) => {-  // ... execution logic - }+ execute: async (inputData, context) => {+   if (!context.resumeData) {+     return context.suspend({})+   }+ }});++ // after workflow is suspended, you can resume it+ const result = await run.start({ inputData: { ... } });+ if (result.status === 'suspended') {+   const resumedResult = await run.resume({+     resumeData: {+       event: 'step-complete',+     },+     step: 'step1',+   });+ }
```