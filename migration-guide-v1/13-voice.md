# Migration Guide v1.0 - Voice

# Voice | v1 Migration Guide

Mastra v1 Beta: Learn how to migrate voice package changes when upgrading to v1.

Source: https://mastra.ai/guides/v1/migrations/upgrade-to-v1/voice

---

# Voice Packages

Voice packages have been renamed from speech to voice with updated class names and API methods. 

## ChangedDirect link to Changed

### Voice configuration property namesDirect link to Voice configuration property names

Voice configuration properties have been renamed for consistency. `speakProvider`is now `output`, `listenProvider`is now `input`, and `realtimeProvider`is now `realtime`. This change provides more intuitive property names. 

To migrate, update configuration property names when configuring agents with voice capabilities. 

```
  const agent = new Agent({    voice: {-     speakProvider: murfVoice,-     listenProvider: deepgramVoice,-     realtimeProvider: openaiRealtime,+     output: murfVoice,+     input: deepgramVoice,+     realtime: openaiRealtime,    },  });
```

Codemod You can use Mastra's codemod CLI to update your code automatically: 

```
npx @mastra/codemod@beta v1/voice-property-names .
```