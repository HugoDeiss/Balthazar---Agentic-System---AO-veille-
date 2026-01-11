# Migration Guide v1.0 - Processors

# Processors | v1 Migration Guide

Mastra v1 Beta: Learn how to migrate processor changes when upgrading to v1.

Source: https://mastra.ai/guides/v1/migrations/upgrade-to-v1/processors

---

# Processors

Processor interfaces have been updated to use consistent naming patterns and database message types. 

## ChangedDirect link to Changed

### Processor configuration from name to idDirect link to processor-configuration-from-name-to-id

Processors now require an `id`field instead of `name`. The `name`field is now optional. This change provides consistency with other Mastra entities like scorers and agents. 

To migrate, update processor definitions to use `id`as the required field. 

```
  import type { InputProcessor } from '@mastra/core/processors';  const processor: InputProcessor = {-   name: 'my-processor',+   id: 'my-processor',+   name: 'My Processor', // optional    processInput: async ({ messages }) => {      // ...    },  };
```

### Processor message types from MastraMessageV2 to MastraDBMessageDirect link to processor-message-types-from-mastramessagev2-to-mastradbmessage

Processor message types have changed from `MastraMessageV2`to `MastraDBMessage`. This change provides consistency with scorer configuration and better type safety by aligning with the database message format. 

To migrate, update processor message type imports and usage. 

```
  import type { InputProcessor } from '@mastra/core/processors';- import type { MastraMessageV2 } from '@mastra/core/agent';+ import type { MastraDBMessage } from '@mastra/core/agent';  const processor: InputProcessor = {    id: 'my-processor',-   processInput: async ({ messages }: { messages: MastraMessageV2[] }) => {+   processInput: async ({ messages }: { messages: MastraDBMessage[] }) => {      // ...    },  };
```

## RemovedDirect link to Removed

### Deprecated input processor exportsDirect link to Deprecated input processor exports

Deprecated input-processor exports which include the built-in processors have been removed from `@mastra/core/agent/input-processors/processors`. Use `@mastra/core/processors`instead. This change consolidates processor types under the unified `Processor`interface. 

If you have used `InputProcessor`, replace it with `Processor`which implements a `processInput`function. 

```
- import { InputProcessor, ModerationProcessor } from '@mastra/core/agent/input-processors/processors';+ import { Processor, ModerationProcessor } from '@mastra/core/processors';
```

### Memory processor exports moved to coreDirect link to Memory processor exports moved to core

The `@mastra/memory/processors`export has been removed. All processors are now exported from `@mastra/core/processors`. This change consolidates all processor exports in a single location. 

To migrate, update your import paths from `@mastra/memory/processors`to `@mastra/core/processors`. 

```
- import { TokenLimiter, ToolCallFilter } from '@mastra/memory/processors';+ import { TokenLimiter, ToolCallFilter } from '@mastra/core/processors';
```
