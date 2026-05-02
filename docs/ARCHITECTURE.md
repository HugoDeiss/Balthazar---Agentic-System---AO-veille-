# Architecture Système — Balthazar Veille AO

Vue d'ensemble du système à deux repos et de leurs connexions.

---

## Deux repos, un système

```
balthazar-veille-app/          (Next.js — Interface utilisateur)
    └── lit Supabase directement
    └── appelle Mastra Platform via HTTP

Balthazar---Agentic-System---AO-veille-/   (Mastra — Backend IA)
    └── pipeline veille quotidienne (Inngest cron)
    └── hiérarchie feedback 3 agents (supervisor → correction → tuning)
    └── expose des API HTTP (agents, feedback)
```

Les deux repos partagent la **même base Supabase** (table `appels_offres`).

---

## Schéma des flux

```
                     ┌─────────────────────────────┐
                     │   Mastra Platform               │
                     │                              │
  Inngest cron ─────>│  aoVeilleWorkflow            │
  (6h UTC lun-ven)   │  ├─ BOAMP fetch              │
                     │  ├─ MarchesOnline RSS        │
                     │  ├─ keyword matching         │
                     │  ├─ GPT-4o + RAG             │
                     │  └─ scoring (HIGH/MED/LOW)   │
                     │                              │
                     │  aoFeedbackSupervisor ◄────────┼──── /api/chat (stream)
                     │  └─ aoCorrectionAgent         │  (subagent, protocole correction)
                     │     └─ aoFeedbackTuningAgent  │  (subagent, diagnostic structuré)
                     │                              │
                     │  feedbackWorkflow ◄───────────┼──── /api/feedback/submit
                     │  (HITL: suspend/resume)       │
                     └──────────┬───────────────────┘
                                │ upsert
                                ▼
                     ┌─────────────────────┐
                     │   Supabase          │
                     │   appels_offres     │◄──── lecture directe
                     │   rag_chunks        │      (service key)
                     └─────────────────────┘
                                ▲
                                │ lit
                     ┌─────────────────────────────┐
                     │   balthazar-veille-app       │
                     │   (Next.js — Vercel)         │
                     │                              │
                     │  /ao                         │
                     │  ├─ AOListPanel (filtres)    │
                     │  ├─ AODetailPanel (scores)   │
                     │  └─ AOAgentPanel (chat IA)   │
                     │                              │
                     │  /api/aos        → Supabase  │
                     │  /api/aos/[id]   → Supabase  │
                     │  /api/chat       → Mastra    │
                     │  /api/feedback   → Mastra    │
                     └─────────────────────────────┘
                                ▲
                                │ navigue
                              Pablo
                           (utilisateur)
```

---

## Connexions détaillées entre les deux repos

### 1. Chat IA (`/api/chat`)

L'app Next.js proxifie le stream vers Mastra :

```
Next.js /api/chat
  POST { messages, aoId }
    └─> MASTRA_URL/api/agents/aoFeedbackSupervisor/stream
          body: { messages: [{ role: 'user', content: '[source_id:xxx] ...' }] }
          └─> stream SSE → useChat (Vercel AI SDK)
```

- L'`aoId` est injecté en préfixe `[source_id:xxx]` dans le premier message
- `aoFeedbackSupervisor` charge le contexte via `getAODetails` + `searchRAGChunks`, explique le score, détecte l'intention
- Si correction demandée → délègue à `aoCorrectionAgent` (3 questions + simulation + application)
- `aoCorrectionAgent` délègue le diagnostic structuré à `aoFeedbackTuningAgent` → `FeedbackProposal`
- Si `correction_type=rag_chunk` : `executeCorrection` appelle `buildRAGChunk` (step S2b) → chunk structuré 150-300 mots au standard corpus (template + few-shot)
- Le stream est retransmis tel quel au navigateur

### 2. Feedback (`/api/feedback`)

```
Next.js /api/feedback
  POST { ao_id, reason }
    ├─ signe HMAC-SHA256(ao_id, FEEDBACK_SECRET)
    └─> MASTRA_URL/api/feedback/submit
          body: { ao_id, reason, client_id: 'balthazar', token }
            └─> feedbackWorkflow.suspend()
                  └─> email confirmation à Pablo
                        └─> Pablo confirme → feedbackWorkflow.resume()
                              └─> aoFeedbackTuningAgent diagnostique
                                    └─> insert dans rag_chunks (pgvector)
```

Le token HMAC garantit que seule l'app (qui connaît `FEEDBACK_SECRET`) peut soumettre du feedback à Mastra.

### 3. Base de données partagée (Supabase)

Les deux repos pointent sur le même projet Supabase :

| Repo | Usage |
|------|-------|
| Mastra | Upsert `appels_offres` après analyse, insert `rag_chunks` après feedback |
| Next.js | Lecture `appels_offres` (via service key côté serveur) |

La Next.js app ne **modifie jamais** Supabase directement — tout write passe par Mastra.

---

## Variables d'environnement

### Repo Mastra (`Balthazar---Agentic-System---AO-veille-`)

```bash
OPENAI_API_KEY=          # GPT-4o agent + embeddings
DATABASE_URL=            # PostgreSQL direct (pgvector)
SUPABASE_URL=            # Supabase REST
SUPABASE_SERVICE_KEY=    # Supabase write
SUPABASE_PUBLISHABLE_KEY=
RESEND_API_KEY=          # emails confirmation feedback
FEEDBACK_SECRET=         # clé HMAC 32 chars (partagée avec Next.js)
MASTRA_URL=              # https://balthazar-tender-monitoring.server.mastra.cloud
```

### Repo Next.js (`balthazar-veille-app`)

```bash
NEXT_PUBLIC_SUPABASE_URL=        # même projet Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # lecture publique (ou PUBLISHABLE_DEFAULT_KEY)
SUPABASE_SERVICE_KEY=            # lecture côté serveur (bypass RLS)
OPENAI_API_KEY=                  # (non utilisé directement — passage par Mastra)
MASTRA_URL=                      # même URL Mastra Platform
FEEDBACK_SECRET=                 # même clé HMAC que le backend
```

> `FEEDBACK_SECRET` doit être **identique** dans les deux repos.

---

## Cycle de vie d'un AO

```
1. [Mastra] Inngest déclenche aoVeilleWorkflow à 6h UTC
2. [Mastra] Fetch BOAMP + MarchesOnline → normalisation CanonicalAO
3. [Mastra] Keyword matching → score 0-100
4. [Mastra] Si score ≥ seuil → GPT-4o + RAG → score sémantique 0-10
5. [Mastra] Scoring final → priorité HIGH/MEDIUM/LOW
6. [Mastra] Upsert dans appels_offres (Supabase)

7. [Next.js] Pablo ouvre l'app → liste les AOs via /api/aos
8. [Next.js] Pablo clique sur un AO → fetch /api/aos/[sourceId]
9. [Next.js] AOAgentPanel s'ouvre → auto-déclenche : "Pourquoi HIGH ?"
10. [Next.js] /api/chat proxifie vers aoFeedbackSupervisor (stream)
11. [Next.js] Pablo envoie un retour → bouton "Enregistrer le feedback"
12. [Next.js] /api/feedback signe HMAC → envoie à Mastra /api/feedback/submit

13. [Mastra] feedbackWorkflow suspend → email confirmation à Pablo
14. [Mastra] Pablo confirme → resume → aoFeedbackTuningAgent diagnostique
15. [Mastra] Nouveau chunk inséré dans rag_chunks (pgvector)
16. → Prochain AO similaire bénéficie du feedback dans le RAG
```

---

## Structure des repos

### Backend Mastra

```
src/
├── mastra/
│   ├── index.ts                          # instance Mastra, agents, workflows
│   ├── feedback-routes.ts                # handlers HTTP feedback (form/submit/confirm)
│   ├── agents/
│   │   ├── boamp-semantic-analyzer.ts    # agent qualification AO (GPT-4o + RAG)
│   │   ├── ao-feedback-supervisor/       # lean router : chargement contexte + intent routing
│   │   │   ├── index.ts                  # définition agent (Memory, tools, model)
│   │   │   └── instructions.ts           # system prompt complet
│   │   ├── ao-feedback-agent/            # agent feedback (subagent)
│   │   │   ├── index.ts
│   │   │   └── instructions.ts
│   │   ├── ao-correction-agent.ts        # protocole correction : 3 questions + simulation + apply
│   │   ├── ao-feedback-tuning-agent.ts   # subagent diagnostic structuré (FeedbackProposal)
│   │   ├── ao-reason-classifier.ts       # classifieur de raison (schéma Zod + agent)
│   │   └── index.ts                      # re-exports agents
│   ├── tools/
│   │   ├── _shared/supabase.ts           # client Supabase partagé
│   │   ├── get-ao-details.ts             # getAODetails
│   │   ├── search-similar-keywords.ts    # searchSimilarKeywords
│   │   ├── search-rag-chunks.ts          # searchRAGChunks
│   │   ├── propose-choices.ts            # proposeChoices (+ termExtractorAgent local)
│   │   ├── propose-correction.ts         # proposeCorrection
│   │   ├── simulate-impact.ts            # simulateImpact
│   │   ├── apply-correction.ts           # applyCorrection
│   │   ├── deactivate-override.ts        # deactivateOverride
│   │   ├── list-active-overrides.ts      # listActiveOverrides
│   │   ├── get-keyword-category.ts       # getKeywordCategory
│   │   ├── execute-correction.ts         # executeCorrection
│   │   ├── manual-override.ts            # manualOverride
│   │   ├── propose-priority-choice.ts    # proposePriorityChoice
│   │   ├── check-duplicate-correction.ts # checkDuplicateCorrection
│   │   ├── deactivate-rag-chunk.ts       # deactivateRAGChunk
│   │   ├── query-impact-history.ts       # queryImpactHistory
│   │   ├── get-ao-correction-history.ts  # getAOCorrectionHistory — historique unifié par AO
│   │   ├── revert-manual-override.ts     # revertManualOverride — annule manual_priority
│   │   ├── build-rag-chunk.ts            # buildRAGChunk — génère chunk structuré corpus-quality
│   │   ├── index.ts                      # barrel — re-exports tous les tools
│   │   ├── balthazar-rag-tools.ts        # RAG tools (embed, vectorStore, singleton)
│   │   ├── boamp-fetcher.ts              # BOAMP API fetcher
│   │   └── marchesonline-rss-fetcher.ts  # MarchesOnline RSS fetcher
│   ├── workflows/
│   │   ├── ao-veille.ts                  # pipeline principal
│   │   └── feedback-workflow.ts          # HITL feedback (suspend/resume)
│   └── inngest/index.ts                  # cron Inngest (ao-veille-daily + feedback-processor)
├── utils/
│   ├── balthazar-keywords.ts             # moteur de scoring keywords
│   ├── human-readable-reason.ts          # construit la raison lisible de décision
│   ├── feedback-token.ts                 # HMAC-SHA256 sign/verify
│   └── rag-indexer.ts                    # insertAndIndexChunk() → pgvector
rag/
├── balthazar_corpus.jsonl                # corpus source RAG (policies + case studies)
├── balthazar_clients.json                # historique clients
docs/
├── ARCHITECTURE.md                       # ce fichier
├── FEEDBACK_AO_VISION_ET_MASTRA.md       # vision produit feedback
├── RAG_ET_EVALS.md                       # RAG, évals, état du système
└── TESTS_AVANT_COMMIT.md                 # checklist avant commit
```

### Frontend Next.js

```
app/
├── ao/page.tsx                           # workspace principal (force-dynamic)
└── api/
    ├── aos/route.ts                      # GET liste AOs (filtres + pagination)
    ├── aos/[sourceId]/route.ts           # GET détail AO
    ├── chat/route.ts                     # POST stream → aoFeedbackSupervisor
    ├── feedback/route.ts                 # POST HMAC + forward → Mastra
    ├── priority/route.ts                 # POST applique manual_priority + human_readable_reason
    ├── corrections/apply/route.ts        # POST applique une correction RAG/keyword via Mastra
    ├── corrections/revert/route.ts       # POST annule une correction (dispatch par type)
    └── aos/[sourceId]/corrections/route.ts # GET historique corrections d'un AO
components/
├── AOWorkspace.tsx                       # coordinateur 3 panneaux + refreshKey state
├── AOListPanel.tsx                       # liste + filtres (date, priorité)
├── AODetailPanel.tsx                     # détail AO, scores, keywords, correctionRefreshKey
├── CorrectionHistoryTimeline.tsx         # timeline accordéon + modal revert
└── AOAgentPanel.tsx                      # chat IA (useChat + feedback banner)
lib/
├── supabase.ts                           # getServerSupabase() + interface AO
```

---

## Déploiement

| Composant | Plateforme | URL |
|-----------|-----------|-----|
| Backend Mastra | Mastra Platform | `https://balthazar-tender-monitoring.server.mastra.cloud` |
| Frontend Next.js | Vercel (ou local) | Variable |
| Base de données | Supabase | Projet partagé |
| Cron | Inngest | Dashboard Inngest → ao-veille-daily |

---

*Voir aussi :*
- *[README.md](../README.md) — Backend Mastra (agents, workflow, scoring)*
- *[docs/FEEDBACK_AO_VISION_ET_MASTRA.md](./FEEDBACK_AO_VISION_ET_MASTRA.md) — Vision feedback*
- *[docs/RAG_ET_EVALS.md](./RAG_ET_EVALS.md) — RAG et évaluations*
- *[INNGEST.md](../INNGEST.md) — Cron production*
