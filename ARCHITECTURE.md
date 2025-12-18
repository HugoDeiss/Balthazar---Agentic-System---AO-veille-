# 🏗️ Architecture du Système Balthazar

## Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                    SYSTÈME BALTHAZAR                            │
│              Veille et Analyse des Appels d'Offres              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │         MASTRA FRAMEWORK                │
        │    (Orchestration & Configuration)      │
        └─────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌───────────────┐                          ┌───────────────┐
│    AGENTS     │                          │    TOOLS      │
└───────────────┘                          └───────────────┘
        │                                           │
        ├─ tenderMonitorAgent                      ├─ boampFetcherTool
        ├─ tenderAnalystAgent                      └─ (autres tools...)
        └─ boampAgent (🆕)                          
                │
                ▼
        ┌───────────────────────────────────┐
        │      WORKFLOWS                    │
        │  (Pipelines d'Analyse)            │
        └───────────────────────────────────┘
                │
                └─ ao-veille-workflow (🆕)
                        │
                        ▼
                ┌───────────────┐
                │   SUPABASE    │
                │  (Stockage)   │
                └───────────────┘
```

## Détail du Workflow ao-veille

```
┌─────────────────────────────────────────────────────────────────┐
│                  WORKFLOW: ao-veille-workflow                   │
└─────────────────────────────────────────────────────────────────┘

INPUT: { clientId: string, since: string }

    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Collecte + Pré-qualification (Rules-Based)             │
│ ───────────────────────────────────────────────────────────────│
│ Tool: boampFetcherTool                                          │
│ - Fetch BOAMP API (100 AO max)                                 │
│ - Filtrage basique:                                             │
│   • État != AVIS_ANNULE                                         │
│   • Titulaire == null (pas encore attribué)                    │
│   • Budget >= minBudget                                         │
│   • Deadline > aujourd'hui + 7 jours                           │
│   • Région (si spécifiée)                                       │
│                                                                 │
│ Coût: GRATUIT (API publique)                                    │
│ Output: prequalified[] (ex: 50/100 AO)                         │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2a: Matching Mots-clés (Rules-Based)                      │
│ ───────────────────────────────────────────────────────────────│
│ - Compte les mots-clés client matchés                          │
│ - Calcul keywordScore = matchCount / totalKeywords             │
│ - Seuil: keywordScore >= 0.3 (30%)                             │
│                                                                 │
│ Coût: GRATUIT (calcul local)                                    │
│ Output: keywordMatched[] (ex: 30/50 AO)                        │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2b: Analyse Sémantique (LLM - boampAgent) 🆕              │
│ ───────────────────────────────────────────────────────────────│
│ Agent: balthazar (alias de boampAgent)                          │
│ Model: Claude 3.5 Sonnet (Anthropic)                            │
│                                                                 │
│ Pour chaque AO:                                                 │
│ - Analyse la pertinence par rapport au profil client           │
│ - Prend en compte le type de procédure                         │
│ - Score 0-10 avec justification                                │
│ - Seuil: semanticScore >= 6                                     │
│                                                                 │
│ Coût: ~$0.003 par AO (30 AO = ~$0.09)                          │
│ Output: relevant[] (ex: 20/30 AO)                              │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Analyse Faisabilité (LLM - boampAgent) 🆕              │
│ ───────────────────────────────────────────────────────────────│
│ Agent: balthazar (alias de boampAgent)                          │
│ Model: Claude 3.5 Sonnet (Anthropic)                            │
│                                                                 │
│ Pour chaque AO:                                                 │
│ - Vérifie critères financiers (CA, garanties)                  │
│ - Vérifie critères techniques (références, certifications)     │
│ - Vérifie délai suffisant pour répondre                        │
│ - Identifie les blockers                                        │
│ - Niveau de confiance (high/medium/low)                        │
│ - Seuil: financial && technical && timing                      │
│                                                                 │
│ Coût: ~$0.004 par AO (20 AO = ~$0.08)                          │
│ Output: feasible[] (ex: 15/20 AO)                              │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Scoring + Priorisation (Rules-Based)                   │
│ ───────────────────────────────────────────────────────────────│
│ Calcul du score global (0-10):                                  │
│ - Pertinence sémantique: 40%                                    │
│ - Keywords: 20%                                                 │
│ - Faisabilité (confidence): 30%                                 │
│ - Urgence (deadline): 10%                                       │
│                                                                 │
│ Priorisation:                                                   │
│ - HIGH: score >= 8                                              │
│ - MEDIUM: score >= 6                                            │
│ - LOW: score < 6                                                │
│                                                                 │
│ Coût: GRATUIT (calcul local)                                    │
│ Output: scored[] (ex: 5 HIGH, 7 MEDIUM, 3 LOW)                 │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: Sauvegarde Résultats                                   │
│ ───────────────────────────────────────────────────────────────│
│ Database: Supabase                                              │
│ Table: appels_offres                                            │
│                                                                 │
│ Upsert (onConflict: source_id):                                 │
│ - Identifiants (source, source_id)                             │
│ - Contenu (title, description, keywords)                        │
│ - Acheteur (nom, email, tel, adresse)                          │
│ - Budget & Dates                                                │
│ - Scores (keyword, semantic, final)                             │
│ - Analyses (feasibility, priority)                              │
│ - Context (procedure, correctif, renewal)                       │
│ - Métadonnées (client_id, analyzed_at)                         │
│                                                                 │
│ Coût: GRATUIT (dans les limites Supabase)                      │
│ Output: { saved: 15, high: 5, medium: 7, low: 3 }              │
└─────────────────────────────────────────────────────────────────┘

OUTPUT: { saved: number, high: number, medium: number, low: number }
```

## Architecture du boampAgent

```
┌─────────────────────────────────────────────────────────────────┐
│                        boampAgent                               │
│              (Claude 3.5 Sonnet - Anthropic)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Analyse     │   │   Analyse     │   │   Analyse     │
│  Sémantique   │   │ Faisabilité   │   │Compétitivité  │
└───────────────┘   └───────────────┘   └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Score 0-10    │   │ Financial ✓/✗ │   │ Score 0-10    │
│ + Reason      │   │ Technical ✓/✗ │   │ + Strengths   │
│               │   │ Timing ✓/✗    │   │ + Weaknesses  │
│               │   │ + Blockers    │   │ + Advice      │
│               │   │ + Confidence  │   │ + GO/NO-GO    │
└───────────────┘   └───────────────┘   └───────────────┘
        │                     │                     │
        └─────────────────────┴─────────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │  analyzeAO()      │
                    │  (Orchestrateur)  │
                    └───────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ Rapport Complet   │
                    │ + Recommandation  │
                    └───────────────────┘
```

## Flux de Données

```
┌─────────────┐
│   BOAMP     │  API publique
│     API     │  (data.gouv.fr)
└──────┬──────┘
       │
       │ HTTP GET
       │ (JSON)
       ▼
┌─────────────────────┐
│ boampFetcherTool    │  Normalisation
│ - Parse JSON        │  + Enrichissement
│ - Normalise         │
│ - Enrichit          │
└──────┬──────────────┘
       │
       │ records[]
       │
       ▼
┌─────────────────────┐
│ ao-veille-workflow  │  Pipeline
│ - Pré-qualification │  d'Analyse
│ - Keywords          │
│ - Sémantique (LLM)  │
│ - Faisabilité (LLM) │
│ - Scoring           │
└──────┬──────────────┘
       │
       │ scored[]
       │
       ▼
┌─────────────────────┐
│    Supabase         │  Stockage
│ Table: appels_offres│  Persistant
│ - Données AO        │
│ - Analyses          │
│ - Scores            │
└─────────────────────┘
```

## Stack Technique

### Backend
- **Framework** : Mastra (TypeScript)
- **Runtime** : Node.js v20+
- **Language** : TypeScript

### AI/LLM
- **Provider** : Anthropic
- **Model** : Claude 3.5 Sonnet
- **Usage** : Analyse sémantique + faisabilité

### Data Sources
- **BOAMP** : API publique (data.gouv.fr)
- **Format** : JSON via OpenDataSoft

### Storage
- **Database** : Supabase (PostgreSQL)
- **Tables** : appels_offres, clients

### Validation
- **Schema** : Zod
- **Types** : TypeScript strict

## Coûts Estimés

### Par Exécution du Workflow (100 AO initiaux)

| Étape | Type | Coût | AO Traités |
|-------|------|------|------------|
| Step 1 | Rules | $0.00 | 100 → 50 |
| Step 2a | Rules | $0.00 | 50 → 30 |
| Step 2b | LLM | ~$0.09 | 30 → 20 |
| Step 3 | LLM | ~$0.08 | 20 → 15 |
| Step 4 | Rules | $0.00 | 15 |
| Step 5 | DB | $0.00 | 15 |
| **TOTAL** | | **~$0.17** | **15 AO finaux** |

### Optimisations
- Filtrage rules-based avant LLM (économise 70% des appels)
- Seuils progressifs (sémantique → faisabilité)
- Cache possible pour éviter ré-analyses

## Sécurité

### Variables d'Environnement
```bash
ANTHROPIC_API_KEY=sk-ant-...     # Clé API Anthropic
SUPABASE_URL=https://...         # URL Supabase
SUPABASE_SERVICE_KEY=eyJ...      # Clé service (admin)
```

### Accès
- **BOAMP API** : Public, pas d'authentification
- **Anthropic** : Clé API privée
- **Supabase** : Service key (admin) pour upsert

### Best Practices
- ✅ Variables d'environnement (pas de hardcode)
- ✅ Service key Supabase (pas de clé publique)
- ✅ Validation Zod des inputs
- ✅ Gestion des erreurs

## Scalabilité

### Limites Actuelles
- **BOAMP API** : 100 AO par requête (limite API)
- **Workflow** : Séquentiel (1 client à la fois)
- **LLM** : Rate limits Anthropic

### Améliorations Possibles
- **Batch processing** : Plusieurs clients en parallèle
- **Pagination** : Récupérer plus de 100 AO
- **Cache** : Éviter ré-analyses des mêmes AO
- **Queue** : File d'attente pour gros volumes

## Monitoring

### Logs
```typescript
console.log(`✅ Pré-qualification: ${prequalified.length}/${total} AO`);
console.log(`✅ Keyword matching: ${matched.length}/${prequalified.length} AO`);
console.log(`✅ Analyse sémantique: ${relevant.length}/${matched.length} AO`);
console.log(`✅ Analyse faisabilité: ${feasible.length}/${relevant.length} AO`);
console.log(`✅ Scoring: ${high} HIGH, ${medium} MEDIUM, ${low} LOW`);
console.log(`✅ Sauvegarde: ${saved} AO`);
```

### Métriques à Suivre
- Temps d'exécution total
- Coût LLM par exécution
- Taux de filtrage à chaque étape
- Nombre d'AO HIGH/MEDIUM/LOW
- Erreurs et exceptions

## Évolutions Futures

### Court Terme
- [ ] Système de cache (Redis/Supabase)
- [ ] Tests unitaires et d'intégration
- [ ] Métriques de performance

### Moyen Terme
- [ ] Support multi-sources (PLACE, AWS, JOUE)
- [ ] Batch processing (plusieurs clients)
- [ ] Dashboard de visualisation

### Long Terme
- [ ] Génération automatique de réponses
- [ ] Système de notifications
- [ ] Interface web complète
- [ ] Machine Learning pour améliorer les scores

---

**Version** : 1.0.0  
**Date** : 18 décembre 2025  
**Équipe** : Balthazar - Colombus Group

