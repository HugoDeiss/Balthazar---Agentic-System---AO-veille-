# Migration Guide v1.0 - Tracing

# Tracing | v1 Migration Guide

Mastra v1 Beta: Migration guide for updating from otel-telemetry or AI tracing to the new observability system.

Source: https://mastra.ai/guides/v1/migrations/upgrade-to-v1/tracing

---

# Tracing

The observability system has been restructured in v1 with a dedicated `@mastra/observability`package. This guide covers two migration paths depending on which version you're upgrading from. 

## Migration PathsDirect link to Migration Paths

### From OTEL-based Telemetry (0.x)Direct link to From OTEL-based Telemetry (0.x)

If you're using the old `telemetry:`configuration in Mastra, the system has been completely redesigned. 

**Before (0.x with OTEL telemetry):**

```
import { Mastra } from '@mastra/core';export const mastra = new Mastra({  telemetry: {    serviceName: 'my-app',    enabled: true,    sampling: {      type: 'always_on',    },    export: {      type: 'otlp',      endpoint: 'http://localhost:4318',    },  },});
```

**After (v1 with observability):**

```
import { Mastra } from '@mastra/core';import {  Observability,  DefaultExporter,  CloudExporter,  SensitiveDataFilter,} from '@mastra/observability';export const mastra = new Mastra({  observability: new Observability({    configs: {      default: {        serviceName: 'mastra',        exporters: [          new DefaultExporter(), // Persists traces to storage for Mastra Studio          new CloudExporter(), // Sends traces to Mastra Cloud (if MASTRA_CLOUD_ACCESS_TOKEN is set)        ],        spanOutputProcessors: [          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys        ],      },    },  }),});
```

This configuration includes `DefaultExporter`, `CloudExporter`, and `SensitiveDataFilter`processor. See the [observability tracing documentation](/docs/v1/observability/tracing/overview)for full configuration options. 

**After (v1 with custom configuration):**

If you need to configure specific exporters (like OTLP), install the exporter package and configure it: 

```
npm install @mastra/otel-exporter@beta @opentelemetry/exporter-trace-otlp-proto
```

```
import { Mastra } from '@mastra/core';import { Observability } from '@mastra/observability';import { OtelExporter } from '@mastra/otel-exporter';export const mastra = new Mastra({  observability: new Observability({    configs: {      production: {        serviceName: 'my-app',        sampling: { type: 'always' },        exporters: [          new OtelExporter({            provider: {              custom: {                endpoint: 'http://localhost:4318/v1/traces',                protocol: 'http/protobuf',              },            },          }),        ],      },    },  }),});
```

Key changes: 

2. Install @mastra/observability package
4. Replace telemetry: with observability: new Observability()
6. Use explicit configs: with DefaultExporter, CloudExporter, and SensitiveDataFilter
8. Export types change from string literals ('otlp') to exporter class instances (new OtelExporter())

See the [exporters documentation](/docs/v1/observability/tracing/overview#exporters)for all available exporters. 

### From AI TracingDirect link to From AI Tracing

If you already upgraded to AI tracing (the intermediate system), you need to install the new package and use the explicit configuration. 

**Before (AI tracing):**

```
import { Mastra } from '@mastra/core';export const mastra = new Mastra({  observability: {    default: { enabled: true },  },});
```

**After (v1 observability):**

```
import { Mastra } from '@mastra/core';import {  Observability,  DefaultExporter,  CloudExporter,  SensitiveDataFilter,} from '@mastra/observability';export const mastra = new Mastra({  observability: new Observability({    configs: {      default: {        serviceName: 'mastra',        exporters: [          new DefaultExporter(),          new CloudExporter(),        ],        spanOutputProcessors: [          new SensitiveDataFilter(),        ],      },    },  }),});
```

Key changes: 

2. Install @mastra/observability package
4. Import Observability, exporters, and processors from @mastra/observability
6. Use explicit configs with DefaultExporter, CloudExporter, and SensitiveDataFilter

## ChangedDirect link to Changed

### Package import pathDirect link to Package import path

The observability functionality has moved to a dedicated `@mastra/observability`package. 

To migrate, install the package and update your import statements: 

```
npm install @mastra/observability@beta
```

```
- import { Tracing } from '@mastra/core/observability';+ import { Observability } from '@mastra/observability';
```

### Registry configurationDirect link to Registry configuration

The observability registry is now configured using an `Observability`class instance with explicit configs instead of a plain object. 

To migrate, use `new Observability()`with explicit exporters and processors. 

```
+ import {+   Observability,+   DefaultExporter,+   CloudExporter,+   SensitiveDataFilter,+ } from '@mastra/observability';  export const mastra = new Mastra({-   observability: {-     default: { enabled: true },-   },+   observability: new Observability({+     configs: {+       default: {+         serviceName: 'mastra',+         exporters: [new DefaultExporter(), new CloudExporter()],+         spanOutputProcessors: [new SensitiveDataFilter()],+       },+     },+   }),  });
```

### Configuration property processors to spanOutputProcessorsDirect link to configuration-property-processors-to-spanoutputprocessors

The configuration property for span processors has been renamed from `processors`to `spanOutputProcessors`. 

To migrate, rename the property in your configuration objects. 

```
+ import { SensitiveDataFilter } from '@mastra/observability';  export const mastra = new Mastra({    observability: new Observability({      configs: {        production: {          serviceName: 'my-app',-         processors: [new SensitiveDataFilter()],+         spanOutputProcessors: [new SensitiveDataFilter()],          exporters: [...],        },      },    }),  });
```

### Exporter method exportEvent to exportTracingEventDirect link to exporter-method-exportevent-to-exporttracingevent

If you built custom exporters, the exporter method has been renamed from `exportEvent`to `exportTracingEvent`. 

To migrate, update method implementations in custom exporters. 

```
  export class MyExporter implements ObservabilityExporter {-   exportEvent(event: TracingEvent): void {+   exportTracingEvent(event: TracingEvent): void {      // export logic    }  }
```

## RemovedDirect link to Removed

### OTEL-based telemetry configurationDirect link to otel-based-telemetry-configuration

The OTEL-based `telemetry`configuration from 0.x has been removed. The old system with `serviceName`, `sampling.type`, and `export.type`properties is no longer supported. 

To migrate, follow the "From OTEL-based Telemetry" section above. For detailed configuration options, see the [observability tracing documentation](/docs/v1/observability/tracing/overview). 

### Custom instrumentation filesDirect link to Custom instrumentation files

The automatic detection of instrumentation files in `/mastra`(with `.ts`, `.js`, or `.mjs`extensions) has been removed. Custom instrumentation is no longer supported through separate files. 

To migrate, use the built-in exporter system or implement custom exporters using the `ObservabilityExporter`interface. See the [exporters documentation](/docs/v1/observability/tracing/overview#exporters)for details. 

### instrumentation.mjs filesDirect link to instrumentationmjs-files

If you were using `instrumentation.mjs`files to initialize OpenTelemetry instrumentation (common in deployment setups like AWS Lambda), these are no longer needed. The new observability system is configured directly in your Mastra instance. 

**Before (0.x):**

You needed an instrumentation file: 

```
// instrumentation.mjsimport { NodeSDK } from '@opentelemetry/sdk-node';// ... OTEL setup
```

And had to import it when starting your process: 

```
node --import=./.mastra/output/instrumentation.mjs --env-file=".env" .mastra/output/index.mjs
```

**After (v1):**

Simply remove the `instrumentation.mjs`file and configure observability in your Mastra instance: 

```
// src/mastra/index.tsimport {  Observability,  DefaultExporter,  CloudExporter,  SensitiveDataFilter,} from '@mastra/observability';export const mastra = new Mastra({  observability: new Observability({    configs: {      default: {        serviceName: 'mastra',        exporters: [new DefaultExporter(), new CloudExporter()],        spanOutputProcessors: [new SensitiveDataFilter()],      },    },  }),});
```

Start your process normally without the `--import`flag: 

```
node --env-file=".env" .mastra/output/index.mjs
```

No separate instrumentation files or special startup flags required. 

## Provider Migration ReferenceDirect link to Provider Migration Reference

If you were using OTEL-based telemetry with specific providers in 0.x, here's how to configure them in v1: 

ProviderExporterGuideReferenceArize AX, Arize PhoenixArizeGuideReferenceBraintrustBraintrustGuideReferenceLangfuseLangfuseGuideReferenceLangSmithLangSmithGuideReferenceDash0, Laminar, New Relic, SigNoz, Traceloop, Custom OTELOpenTelemetryGuideReferenceLangWatch<coming soon>--

### InstallationDirect link to Installation

**Dedicated exporters**(Arize, Braintrust, Langfuse, LangSmith): 

```
npm install @mastra/[exporter-name]-exporter
```

**OpenTelemetry exporter**(Dash0, Laminar, New Relic, SigNoz, Traceloop): 

```
npm install @mastra/otel-exporter@beta
```

Plus the required protocol package for your provider (see [OTEL guide](/docs/v1/observability/tracing/exporters/otel#installation)).