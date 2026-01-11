# Migration Guide v1.0 - Memory

# Memory | v1 Migration Guide

Mastra v1 Beta: Learn how to migrate memory-related changes when upgrading to v1.

Source: https://mastra.ai/guides/v1/migrations/upgrade-to-v1/memory

---

# Memory

Memory configuration now requires explicit parameters, and default settings have been updated for better performance and predictability. 

## ChangedDirect link to Changed

### Default settings for semantic recall and last messagesDirect link to Default settings for semantic recall and last messages

Default settings have changed to more reasonable values based on usage patterns. The `lastMessages`default decreased from 40 to 10, `semanticRecall`is now disabled by default, and thread title generation is disabled by default. These changes improve performance and reduce unexpected LLM API calls. 

To migrate, if you were relying on the old defaults, explicitly configure these settings. 

```
  const memory = new Memory({    storage,    vector,    embedder,+   options: {+     lastMessages: 40, // Was default before+     semanticRecall: {+       topK: 2,+       messageRange: 2,+       scope: 'thread',+     }, // Was enabled by default before+     generateTitle: true, // Was enabled by default before+   },  });
```

### Default memory scope from thread to resourceDirect link to default-memory-scope-from-thread-to-resource

The default scope for both working memory and semantic recall has changed from `'thread'`to `'resource'`. This change aligns with common use cases where applications want to remember user information across conversations. When semantic recall is enabled, it now defaults to searching across all user conversations rather than just the current thread. 

To migrate, if you want to maintain the old behavior where memory is isolated per conversation thread, explicitly set `scope: 'thread'`. 

```
  const memory = new Memory({    storage,    vector,    embedder,    options: {      workingMemory: {        enabled: true,+       scope: 'thread', // Explicitly set to thread-scoped        template: `# User Profile...`,      },      semanticRecall: {        topK: 3,+       scope: 'thread', // Explicitly set to thread-scoped      },    },  });
```

### Thread title generation locationDirect link to Thread title generation location

The `generateTitle`option has been moved from `threads.generateTitle`to the top-level of memory options. This change simplifies the API by moving the option to where it logically belongs. 

To migrate, move `generateTitle`from the `threads`config to the top level of options. 

```
  const memory = new Memory({    storage,    vector,    embedder,    options: {-     threads: {-       generateTitle: true,-     },+     generateTitle: true,    },  });
```

### Semantic recall default settings optimizationDirect link to Semantic recall default settings optimization

The default settings for semantic recall have been optimized based on RAG research. The `topK`increased from 2 to 4, and `messageRange`changed from `{ before: 2, after: 2 }`to `{ before: 1, after: 1 }`. These changes provide better accuracy while only slightly increasing message count. 

To migrate, if you were relying on the previous defaults, explicitly set these values. 

```
  const memory = new Memory({    storage,    vector,    embedder,    options: {      semanticRecall: {+       topK: 2, // Was default before+       messageRange: { before: 2, after: 2 }, // Was default before      },    },  });
```

### memory.readOnly moved to memory.options.readOnlyDirect link to memoryreadonly-moved-to-memoryoptionsreadonly

The `readOnly`property has been moved from the top-level of the memory option to inside `options`. This change aligns `readOnly`with other memory configuration options like `lastMessages`and `semanticRecall`. 

To migrate, move `readOnly`from the top level to inside `options`. 

```
  agent.stream('Hello', {    memory: {      thread: threadId,      resource: resourceId,-     readOnly: true,+     options: {+       readOnly: true,+     },    },  });
```

Codemod You can use Mastra's codemod CLI to update your code automatically: 

```
npx @mastra/codemod@beta v1/memory-readonly-to-options .
```

### Memory.query() renamed to Memory.recall()Direct link to memoryquery-renamed-to-memoryrecall

The `Memory.query()`method has been renamed to `Memory.recall()`. The new method returns a simpler format with just `{ messages: MastraDBMessage[] }`instead of multiple format variations. This change better describes the action of retrieving messages from memory and simplifies the API. 

To migrate, rename `query()`to `recall()`and update code that expects the old return format. 

```
- const result = await memory.query({ threadId: 'thread-123' });+ const result = await memory.recall({ threadId: 'thread-123' });- // result: { messages: CoreMessage[], uiMessages: UIMessageWithMetadata[], messagesV2: MastraMessageV2[] }+ // result: { messages: MastraDBMessage[] }+ const messages = result.messages;
```

Codemod You can use Mastra's codemod CLI to update your code automatically: 

```
npx @mastra/codemod@beta v1/memory-query-to-recall .
```

### Memory.recall() parameter changesDirect link to memoryrecall-parameter-changes

The `Memory.recall()`method now uses `StorageListMessagesInput`format with pagination, and the `vectorMessageSearch`parameter has been renamed to `vectorSearchString`. These changes align the memory API with the storage pagination API and provide more consistent naming. 

To migrate, update method name, query parameters, and the vector search parameter. 

```
- memory.query({+ memory.recall({    threadId: 'thread-123',-   vectorMessageSearch: 'What did we discuss?',-   selectBy: { ... },+   vectorSearchString: 'What did we discuss?',+   page: 0,+   perPage: 20,+   orderBy: 'createdAt',+   filter: { ... },+   threadConfig: { semanticRecall: true },  });
```

Codemod You can use Mastra's codemod CLI to update your code automatically: 

```
npx @mastra/codemod@beta v1/memory-vector-search-param .
```

### MastraMessageV2 type renamed to MastraDBMessageDirect link to mastramessagev2-type-renamed-to-mastradbmessage

The `MastraMessageV2`type has been renamed to `MastraDBMessage`for clarity. This change better describes the purpose of this type as the database message format. 

To migrate, replace all instances of `MastraMessageV2`with `MastraDBMessage`. 

```
- import { MastraMessageV2 } from '@mastra/core';- function yourCustomFunction(input: MastraMessageV2) {}+ import { MastraDBMessage } from '@mastra/core';+ function yourCustomFunction(input: MastraDBMessage) {}
```

Codemod You can use Mastra's codemod CLI to update your code automatically: 

```
npx @mastra/codemod@beta v1/memory-message-v2-type .
```

## RemovedDirect link to Removed

### Working memory text-stream modeDirect link to working-memory-text-stream-mode

Working memory `use: "text-stream"`option has been removed. Only `tool-call`mode is supported. This change simplifies the working memory API by removing the less reliable streaming mode. 

To migrate, remove the `use: "text-stream"`option. Working memory will default to tool-call mode. 

```
  const memory = new Memory({    storage,    vector,    embedder,    options: {      workingMemory: {        enabled: true,-       use: 'text-stream',        template: '...',      },    },  });
```

### Memory.rememberMessages() methodDirect link to memoryremembermessages-method

The `Memory.rememberMessages()`method has been removed. This method performed the same function as `query()`(now `recall()`), and consolidating to one method simplifies the API. 

To migrate, replace `rememberMessages()`calls with `recall()`. 

```
- const { messages } = await memory.rememberMessages({+ const { messages } = await memory.recall({    threadId,    resourceId,  });
```

### format parameter from memory methodsDirect link to format-parameter-from-memory-methods

The `format`parameter has been removed from all memory get methods. `MastraDBMessage`is now the default return format everywhere. AI SDK format conversion has moved to dedicated utility functions in `@mastra/ai-sdk/ui`. This change improves tree-shaking by moving UI-specific conversion code to a separate package. 

To migrate, remove the `format`parameter and use conversion functions for AI SDK formats. 

```
- const messages = await memory.getMessages({ threadId, format: 'v2' });- const uiMessages = await memory.getMessages({ threadId, format: 'ui' });+ const result = await memory.recall({ threadId });+ const messages = result.messages; // Always MastraDBMessage[]+ + // Use conversion functions for AI SDK formats+ import { toAISdkV5Messages } from '@mastra/ai-sdk/ui';+ const uiMessages = toAISdkV5Messages(messages);
```

### MastraMessageV3 typeDirect link to mastramessagev3-type

The `MastraMessageV3`type and related conversion methods have been removed. Messages now convert directly between `MastraMessageV2`(now `MastraDBMessage`) and AI SDK v5 formats. This change simplifies the architecture by removing an intermediary format. 

To migrate, use `MastraDBMessage`for storage or AI SDK v5 message formats directly. 

```
- import type { MastraMessageV3 } from '@mastra/core/agent';- const v3Messages = messageList.get.all.v3();+ // For storage+ const v2Messages = messageList.get.all.v2();+ + // For AI SDK v5+ const uiMessages = messageList.get.all.aiV5.ui();+ const modelMessages = messageList.get.all.aiV5.model();
```

### processors config from Memory constructorDirect link to processors-config-from-memory-constructor

The `processors`config option in the Memory constructor has been deprecated and now throws an error. Processors should be configured at the Agent level instead. This change provides clearer configuration boundaries and better encapsulation. 

To migrate, move processor configuration from Memory to Agent using `inputProcessors`and/or `outputProcessors`. 

```
+ import { TokenLimiter } from '@mastra/core/processors';+  const memory = new Memory({    storage,    vector,    embedder,-   processors: [/* ... */],  });  const agent = new Agent({    memory,+   inputProcessors: [+     new TokenLimiter({ limit: 4000 }), // Limits historical messages to fit context window+   ],  });
```

Additionally, the `@mastra/memory/processors`import path has been removed. Import processors from `@mastra/core/processors`instead. See the [processors migration guide](/guides/v1/migrations/upgrade-to-v1/processors#memory-processor-exports-moved-to-core)for details. 

For more information on using processors with agents, see the [Processors docs](/docs/v1/agents/processors). For a complete example with memory, see the [TokenLimiter reference](/reference/v1/processors/token-limiter-processor#extended-usage-example).
