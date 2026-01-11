# Migration Guide v1.0 - Client SDK

# Client SDK | v1 Migration Guide

Mastra v1 Beta: Learn how to migrate client SDK changes when upgrading to v1.

Source: https://mastra.ai/guides/v1/migrations/upgrade-to-v1/client

---

# Client SDK

Client SDK changes align with server-side API updates including renamed utilities, updated pagination, and type naming conventions. 

## ChangedDirect link to Changed

### Client SDK types from Get* to List*Direct link to client-sdk-types-from-get-to-list

Client SDK types have been renamed from `Get*`to `List*`pattern. This change aligns type names with the method naming convention. 

To migrate, update type imports to use the new naming pattern. 

```
- import type {-   GetWorkflowRunsParams,-   GetWorkflowRunsResponse,-   GetMemoryThreadParams,- } from '@mastra/client-js';+ import type {+   ListWorkflowRunsParams,+   ListWorkflowRunsResponse,+   ListMemoryThreadsParams,+ } from '@mastra/client-js';
```

Codemod You can use Mastra's codemod CLI to update your code automatically: 

```
npx @mastra/codemod@beta v1/client-sdk-types .
```

### Pagination parameters from offset/limit to page/perPageDirect link to pagination-parameters-from-offsetlimit-to-pageperpage

All client SDK methods that used `offset/limit`now use `page/perPage`. This change provides a more intuitive pagination model aligned with web pagination patterns. 

To migrate, update pagination parameters in all client SDK method calls. Example: 

```
  client.memory.listMessages({    threadId: 'thread-123',-   offset: 0,-   limit: 20,+   page: 0,+   perPage: 20,  });
```

Codemod You can use Mastra's codemod CLI to update your code automatically: 

```
npx @mastra/codemod@beta v1/client-offset-limit .
```

### getMemoryThread parameter structureDirect link to getmemorythread-parameter-structure

The `getMemoryThread`method parameter structure has been updated. This change provides a more consistent API across memory methods. 

To migrate, update the method call with the new parameter structure. Check the updated API documentation for the specific changes. 

```
- const thread = await client.getMemoryThread(threadId, agentId);+ const thread = await client.getMemoryThread({ threadId, agentId });
```

Codemod You can use Mastra's codemod CLI to update your code automatically: 

```
npx @mastra/codemod@beta v1/client-get-memory-thread .
```

### Unified runById API for workflow runsDirect link to unified-runbyid-api-for-workflow-runs

The `runById()`method now returns a unified `WorkflowState`object containing both metadata (runId, workflowName, resourceId, createdAt, updatedAt) and processed execution state (status, result, error, payload, steps). This unifies the previously separate `runById()`and `runExecutionResult()`methods. 

The method also accepts an options object with optional `fields`and `withNestedWorkflows`parameters for performance optimization. 

```
  const workflow = client.getWorkflow('my-workflow');- // Previously: runById returned raw WorkflowRun with snapshot- const run = await workflow.runById(runId, requestContext);- // Separately: runExecutionResult returned processed execution state- const result = await workflow.runExecutionResult(runId);+ // Now: Single method returns unified WorkflowState+ const run = await workflow.runById(runId, {+   requestContext,  // Optional request context+   fields: ['status', 'result'],  // Optional: request only specific fields+   withNestedWorkflows: false,  // Optional: skip nested workflow data for performance+ });+ // Returns: { runId, workflowName, resourceId, createdAt, updatedAt, status, result, error, payload, steps }
```

## RemovedDirect link to Removed

### runExecutionResult method and GetWorkflowRunExecutionResultResponse typeDirect link to runexecutionresult-method-and-getworkflowrunexecutionresultresponse-type

The `runExecutionResult()`method and `GetWorkflowRunExecutionResultResponse`type have been removed from `@mastra/client-js`. The `/execution-result`API endpoints have also been removed. 

To migrate, use `runById()`instead, which now returns the same unified `WorkflowState`with both metadata and processed execution state. 

```
- import type { GetWorkflowRunExecutionResultResponse } from '@mastra/client-js';-- const workflow = client.getWorkflow('my-workflow');- const result = await workflow.runExecutionResult(runId);+ const workflow = client.getWorkflow('my-workflow');+ const result = await workflow.runById(runId);+ // Or with options for performance optimization:+ const result = await workflow.runById(runId, {+   fields: ['status', 'result'],  // Only fetch specific fields+   withNestedWorkflows: false,     // Skip expensive nested workflow data+ });
```

### toAISdkFormat functionDirect link to toaisdkformat-function

The `toAISdkFormat()`function has been removed from `@mastra/ai-sdk`. This change provides clearer naming for stream conversion utilities. 

To migrate, use `toAISdkStream()`instead. 

```
- import { toAISdkFormat } from '@mastra/ai-sdk';- const stream = toAISdkFormat(agentStream, { from: 'agent' });+ import { toAISdkStream } from '@mastra/ai-sdk';+ const stream = toAISdkStream(agentStream, { from: 'agent' });
```

Codemod You can use Mastra's codemod CLI to update your code automatically: 

```
npx @mastra/codemod@beta v1/client-to-ai-sdk-format .
```

### Network memory methodsDirect link to Network memory methods

Network memory methods have been removed from `@mastra/client-js`. The `NetworkMemoryThread`class and all network memory-related methods are no longer available. This change simplifies the memory API by removing specialized network memory functionality. 

To migrate, use regular memory APIs instead of network memory. 

```
- import { MastraClient } from '@mastra/client-js';- - const client = new MastraClient({ baseUrl: '...' });- const networkThread = client.networkMemory.getThread('thread-id');- const networkThread = client.memory.networkThread('thread-id', 'network-id');- await networkThread.get();- await networkThread.getMessages();+ // Use regular memory thread APIs instead+ const client = new MastraClient({ baseUrl: '...' });+ const thread = client.memory.getThread('thread-id');+ await thread.get();+ const messages = await thread.listMessages();
```

### Watch-related typesDirect link to Watch-related types

Watch-related types have been removed from `@mastra/client-js`. This includes `WorkflowWatchResult`, `WatchEvent`, and related types. This change reflects the removal of the watch API in favor of streaming. 

To migrate, use workflow streaming APIs instead of watch. 

```
- import type { WorkflowWatchResult, WatchEvent } from '@mastra/client-js';- - const workflow = client.getWorkflow('my-workflow');- const run = await workflow.createRun();- await run.watch((event: WatchEvent) => {-   console.log('Event:', event);- });+ const workflow = client.getWorkflow('my-workflow');+ const run = await workflow.createRun();+ const stream = await run.stream({ inputData: { ... } });+ for await (const chunk of stream) {+   console.log('Event:', chunk);+ }
```

### Run-related methods cannot be called directly on workflow instanceDirect link to Run-related methods cannot be called directly on workflow instance

Run-related methods cannot be called directly on workflow instance. You need to create a run instance first using `createRun()`method. 

```
- const result = await workflow.start({ runId: '123', inputData: { ... } });+ const run = await workflow.createRun({ runId: '123' });+ const result = await run.start({ inputData: { ... } });
```

```
- const result = await workflow.stream({ runId: '123', inputData: { ... } });+ const run = await workflow.createRun({ runId: '123' });+ const stream = await run.stream({ inputData: { ... } });
```

### streamVNext, resumeStreamVNext, and observeStreamVNext methodsDirect link to streamvnext-resumestreamvnext-and-observestreamvnext-methods

The experimental `streamVNext()`, `resumeStreamVNext()`, and `observeStreamVNext()`methods have been removed. These methods are now the standard implementation with updated event structures and return types. 

To migrate, use the standard `stream()`, `resumeStream()`, and `observeStream()`methods instead. 

```
+ const run = await workflow.createRun({ runId: '123' });- const stream = await run.streamVNext({ inputData: { ... } });+ const stream = await run.stream({ inputData: { ... } });
```

### Deprecated stream endpointsDirect link to Deprecated stream endpoints

Some stream endpoints are deprecated and will be removed. The `/api/agents/:agentId/stream/vnext`endpoint returns 410 Gone, and `/api/agents/:agentId/stream/ui`is deprecated. This change consolidates on standard streaming endpoints. 

To migrate, use the standard stream endpoint or `@mastra/ai-sdk`for UI message transformations. 

```
- const response = await fetch('/api/agents/my-agent/stream/vnext', {-   method: 'POST',-   body: JSON.stringify({ messages: [...] }),- });+ const response = await fetch('/api/agents/my-agent/stream', {+   method: 'POST',+   body: JSON.stringify({ messages: [...] }),+ });+ + // Or use @mastra/ai-sdk for UI message transformations
```

### Network memory API endpointsDirect link to Network memory API endpoints

Network memory API endpoints have been removed including `/api/memory/network/*`. This change simplifies the memory API surface. 

To migrate, use regular memory API endpoints. 

```
- const networkThread = await fetch('/api/memory/network/threads/thread-123');+ const thread = await fetch('/api/memory/threads/thread-123');
```

### Eval-related client SDK typesDirect link to Eval-related client SDK types

Several eval-related types have been removed from the client SDK including `GetEvalsByAgentIdResponse`, `GetTelemetryResponse`, and `GetTelemetryParams`. This change reflects the removal of legacy evals functionality. 

To migrate, use the new scorers API instead of legacy evals.
