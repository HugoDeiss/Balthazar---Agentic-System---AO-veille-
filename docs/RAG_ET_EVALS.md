# RAG Balthazar et Évaluations

**Documentation du système RAG (Retrieval-Augmented Generation) et des packs d'évaluation pour l'agent de qualification AO.**

---

## 1. Vue d'ensemble du RAG

L'agent **boamp-semantic-analyzer** s'appuie sur une base de connaissances vectorielle (« règles Balthazar ») pour ancrer ses décisions dans les règles métier réelles. Il ne raisonne plus uniquement sur des exemples en prompt : il interroge des **policies** (règles, exclusions, désambiguïsations) et des **case studies** (missions représentatives).

### Sources de données

| Source | Rôle | Fichier / stockage |
|--------|------|---------------------|
| **Policies** | Règles, secteurs, exclusions, désambiguïsation | `rag/balthazar_corpus.jsonl` (index `policies`) |
| **Case studies** | Missions représentatives (clients, secteurs) | `rag/balthazar_corpus.jsonl` (index `case_studies`) |
| **Clients historiques** | Liste déterministe pour lookup | `rag/balthazar_clients.json` |

### Outils RAG exposés à l'agent

- **balthazar-policies-query** : requêtes sémantiques sur les règles (exclusions, secteurs, désambiguïsation).
- **balthazar-case-studies-query** : recherche de missions similaires.
- **client-history-lookup** : lookup déterministe + fuzzy sur `balthazar_clients.json`.
- **ao-text-verification** : vérification d'extraits du texte AO (sécurité, prompt injection).

### Indexation

- **Script** : `scripts/rag/index-balthazar.ts`
- **Corpus** : `rag/balthazar_corpus.jsonl` (une ligne JSON par chunk).
- **Vector store** : pgvector sur Supabase (`DATABASE_URL` en prod).
- **Embeddings** : OpenAI `text-embedding-3-small` (dimension 1536), via `ai-v5`.

```bash
# Ré-indexer après modification du corpus
DATABASE_URL=... npx tsx scripts/rag/index-balthazar.ts
```

**Prérequis** : `OPENAI_API_KEY` et `DATABASE_URL` dans `.env`.

---

## 2. Corpus et chunks

### Structure d'un chunk (JSONL)

Chaque ligne de `rag/balthazar_corpus.jsonl` est un objet :

- **id** : identifiant stable (ex. `pol_exclusions_formelles`, `cs_ouigo_strategie_distribution`).
- **content** : texte du chunk (règle ou description de mission).
- **metadata** : `type`, `secteur`, `decision`, `trigger_keywords`, etc.
- **index** : `"policies"` ou `"case_studies"`.

### Types de chunks policies (exemples)

- **sector_definition** : périmètre secteur (mobilité, énergie, assurance, secteur public).
- **exclusion_rule** : exclusions formelles (IT, juridique, audit, formation catalogue, etc.).
- **disambiguation_rule** : faux amis (IT vs stratégie, actuariat/rating, PAT/santé, PCAET, DSP exploitation, stratégie marketing/communication).
- **conditional_rule** : missions acceptables sous conditions.

### Chunks de désambiguïsation (trigger proactif)

L'agent est instruit pour lancer des requêtes ciblées lorsque l'AO contient certains termes, afin de récupérer les bons chunks (ex. « ERP CRM transformation numérique SI exclusion » → `pol_disambiguation_it_vs_strategie`). La liste exacte des triggers est dans les instructions de l'agent (`boamp-semantic-analyzer.ts`).

### Référence métier

Le document source des règles et du positionnement Balthazar est **`RAG-Expertise-Balthazar.md`** (référence pour faire évoluer le corpus).

---

## 3. Packs d'évaluation

### 3.1 Pack synthétique (scope pack)

- **Script** : `evals/balthazar-scope-pack.ts`
- **Cas** : 30 cas construits (exclusions, traps terminologiques, clients historiques, borderlines).
- **Usage** :

```bash
DATABASE_URL=... npx tsx evals/balthazar-scope-pack.ts
DATABASE_URL=... npx tsx evals/balthazar-scope-pack.ts --verbose
```

### 3.2 Pack cas réels (42 cas labellisés)

- **Script** : `evals/balthazar-real-cases.ts`
- **Données** : `eval_cases_labeled.json` (42 AO réels avec `decision_expected`, `priority_expected`, `category`, `policy_expected`, etc.).
- **Usage** :

```bash
DATABASE_URL=... npx tsx evals/balthazar-real-cases.ts
DATABASE_URL=... npx tsx evals/balthazar-real-cases.ts --verbose
DATABASE_URL=... npx tsx evals/balthazar-real-cases.ts --category=borderline,client_historique
DATABASE_URL=... npx tsx evals/balthazar-real-cases.ts --id=eval_037
```

**Délai** : 20 s entre chaque cas (limite TPM OpenAI gpt-4o). Un run complet 42 cas dure ~15 min.

### 3.3 Test du gate keywords (sans LLM)

- **Script** : `scripts/test-keyword-gate.ts`
- **Coût** : 0 token OpenAI — test instantané.
- **Usage** :

```bash
npx tsx scripts/test-keyword-gate.ts
```

Résultat cible : **9/9** (7 cas SKIP + 2 cas LLM).

### 3.4 Métriques rapportées

| Métrique | Description |
|----------|-------------|
| **decision_accuracy** | % de cas avec décision PASS/REJECT correcte |
| **priority_accuracy** | % de cas avec niveau de priorité correct (HAUTE/MOYENNE/BASSE/NON_PERTINENT) |
| **rag_grounded** | % de cas avec au moins une source RAG citée |
| **policy_cited** | % de cas où au moins un chunk attendu (`policy_expected`) apparaît dans `rag_sources` |

Les rapports incluent aussi un détail par catégorie et par niveau de priorité, la couverture des « gaps » documentés et la comparaison avec l'ancienne IA.

---

## 4. État du système (post re-run 42 cas)

Dernier run complet : 42 cas réels, modèle **GPT-4o**, délai 20 s entre cas.

### Métriques finales

| Métrique | Valeur |
|----------|--------|
| **decision_accuracy** | 90,5 % (38/42) |
| **priority_accuracy** | 83,3 % (35/42) |
| **RAG grounded** | 100 % (42/42) |
| **policy_cited** | 47,6 % (20/42) |
| **Erreurs / rate limit** | 0 |

### Par catégorie (décision)

- **clear_reject** : 8/8
- **terminological_trap** : 18/18
- **keyword_miss** : 8/11
- **borderline** : 2/3
- **client_historique** : 2/2

### Points connus

- **eval_015** (coaching managers Sytral) : label REJECT/BASSE contestable ; le système renvoie PASS/MOYENNE (décision défendable). À soumettre à validation humaine.
- **eval_026, eval_037** : écart priorité attendue BASSE vs NON_PERTINENT — contrainte de design (REJECT implique NON_PERTINENT dans le schéma). Une évolution type « signal_faible » serait un chantier ultérieur.
- **eval_025, eval_027, eval_036** : cas limites (secteur mobilité / public) ; à traiter en v3 (corpus ou règles) si besoin.

### Nouveau système vs ancienne IA

Sur les 8 cas où l'ancienne IA se trompait, le nouveau système est correct dans **8/8** cas.

---

## 5. Gate keywords — protection du LLM/RAG

Le LLM (GPT-4o) et les outils RAG **ne sont appelés que si les keywords justifient une analyse approfondie**. Ce gate est implémenté à deux niveaux pour garantir qu'aucun AO hors périmètre ne consomme de tokens.

### Architecture du gate (double protection)

**Niveau 1 — Branch 2.5 dans `processOneAOWorkflow`**
La fonction `shouldSkipLLM(keywordDetails)` est évaluée sur chaque AO après `keywordMatchingStep`. Si elle retourne `skip: true`, l'AO est routé vers `handleSkipLLMAOStep` (score keywords uniquement, 0 token LLM).

**Niveau 2 — Gate explicite dans `analyzeOneAOSemanticStep`**
Défense en profondeur : même si un AO atteint ce step, `shouldSkipLLM` est ré-évalué juste avant l'appel à `analyzeSemanticRelevance`. En cas de skip, `semanticReason = "Hors périmètre — score mots-clés insuffisant."` est retourné sans aucun appel OpenAI.

### Seuils `shouldSkipLLM` (calibrés)

| Condition | Décision |
|-----------|----------|
| score < 20 | SKIP systématique |
| 20 <= score < 30, confidence = LOW | SKIP (bruit, keywords génériques) |
| 20 <= score < 30, confidence = MEDIUM ou HIGH | LLM autorisé (signal métier réel) |
| 30 <= score < 40, confidence = LOW | SKIP |
| score >= 30, confidence >= MEDIUM | LLM autorisé |

### Red flags critiques (pénalité -30 points)

Certains termes annulent les matches sectoriels (ex. "transport" dans un contexte de déchets) :

- **Déchets** : `déchets`, `collecte des déchets`, `traitement des déchets`, `ordures ménagères`, `encombrants`, etc.
- **DSP exploitation** : `exploitation d'un service`, `délégation de service public`, `dsp exploitation`
- **IT/BTP** : `maîtrise d'oeuvre`, `développement logiciel`, `génie civil`, etc. (liste complète dans `balthazar-keywords.ts`)

### Concurrency LLM

La directive `.foreach(processOneAOWorkflow, { concurrency: 3 })` limite à **3 appels GPT-4o simultanés**, compatible avec la limite TPM de 30 000 tokens/min (GPT-4o ≈ 10 000 tokens/appel).

### Messages affichés dans les emails

| Cas | Message dans l'email |
|-----|---------------------|
| Skip par Branch 2.5 | `Score keywords insuffisant pour une analyse approfondie` |
| Skip par gate step | `Hors périmètre — score mots-clés insuffisant.` |
| LLM sans erreur | Justification détaillée GPT-4o ancrée RAG |
| LLM erreur rate limit (rare) | `Erreur analyse LLM: ... Score basé sur keywords uniquement.` |

---

## 6. Déploiement et prérequis

- **Variables d'environnement** : `OPENAI_API_KEY`, `DATABASE_URL` (Supabase pgvector), `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
- **Base vectorielle** : pgvector sur Supabase. Indexer avec `scripts/rag/index-balthazar.ts` après chaque modification du corpus.
- **Workflow** : le gate keywords filtre avant le LLM ; seuls les AOs avec score suffisant atteignent `analyzeSemanticRelevance()` et les outils RAG.

```bash
# Ré-indexer le corpus RAG
DATABASE_URL=... npx tsx scripts/rag/index-balthazar.ts
```

Pour une description du déploiement Mastra Cloud, voir **DEPLOIEMENT_MASTRA_CLOUD.md**.
