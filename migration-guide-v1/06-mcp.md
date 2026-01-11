# Migration Guide v1.0 - MCP

# MCP | v1 Migration Guide

Mastra v1 Beta: Learn how to migrate MCP-related changes when upgrading to v1.

Source: https://mastra.ai/guides/v1/migrations/upgrade-to-v1/mcp

---

# MCP

MCP (Model Context Protocol) tool execution context has been reorganized, and deprecated client classes have been removed. 

## ChangedDirect link to Changed

### getMCPServers to listMCPServersDirect link to getmcpservers-to-listmcpservers

The `mastra.getMCPServers()`method has been renamed to `mastra.listMCPServers()`. This change aligns with the naming convention used across the API where plural getter methods use the `list`prefix. 

To migrate, replace all calls to `mastra.getMCPServers()`with `mastra.listMCPServers()`. 

```
- const servers = await mastra.getMCPServers();+ const servers = await mastra.listMCPServers();
```

Codemod You can use Mastra's codemod CLI to update your code automatically: 

```
npx @mastra/codemod@beta v1/mastra-plural-apis .
```

### getTools to listToolsDirect link to gettools-to-listtools

The `mcp.getTools()`method has been renamed to `mcp.listTools()`. This change aligns with the naming convention used across the API where plural getter methods use the `list`prefix. 

To migrate, replace all calls to `mcp.getTools()`with `mcp.listTools()`. 

```
- const tools = await mcp.getTools();+ const tools = await mcp.listTools();
```

Codemod You can use Mastra's codemod CLI to update your code automatically: 

```
npx @mastra/codemod@beta v1/mcp-get-tools .
```

### getToolsets to listToolsetsDirect link to gettoolsets-to-listtoolsets

The `mcp.getToolsets()`method has been renamed to `mcp.listToolsets()`. This change aligns with the naming convention used across the API where plural getter methods use the `list`prefix. 

To migrate, replace all calls to `mcp.getToolsets()`with `mcp.listToolsets()`. 

```
- const toolsets = await mcp.getToolsets();+ const toolsets = await mcp.listToolsets();
```

Codemod You can use Mastra's codemod CLI to update your code automatically: 

```
npx @mastra/codemod@beta v1/mcp-get-toolsets .
```

### MCP tool context properties organizationDirect link to MCP tool context properties organization

Context properties in MCP tools are now organized under the `context.mcp`namespace. This change provides better organization and clearer API surface for MCP-specific functionality. 

To migrate, access MCP-specific properties like `elicitation`and `extra`through `context.mcp`instead of directly from the context parameter. 

```
  createTool({    id: 'account-balance',-   execute: async ({ context, elicitation, extra }) => {-     await checkAuth(extra.authInfo);-     const result = await elicitation.sendRequest({-       message: `Is it ok to fetch account ${context.accountId}?`,-     });-   },+   execute: async (inputData, context) => {+     await checkAuth(context?.mcp?.extra.authInfo);+     const result = await context?.mcp?.elicitation.sendRequest({+       message: `Is it ok to fetch account ${inputData.accountId}?`,+     });+   },  });
```

## RemovedDirect link to Removed

### Deprecated MCP client classesDirect link to Deprecated MCP client classes

The `MastraMCPClient`and related deprecated APIs have been removed from `@mastra/mcp`. This change consolidates on the new MCP client API. 

To migrate, use the new `MCPClient`class instead of deprecated classes. 

```
- import { MastraMCPClient, MCPConfiguration } from '@mastra/mcp/client';+ import { MCPClient } from '@mastra/mcp/client';- const client = new MastraMCPClient({ ... });- const config = new MCPConfiguration({ ... });+ const client = new MCPClient({ ... });
```
