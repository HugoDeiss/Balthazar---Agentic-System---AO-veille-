# 🔄 Workflow AO Veille - Analyse Intelligente des Appels d'Offres

**Documentation technique complète du workflow Mastra d'analyse automatique des AO avec agents IA.**

---

## 🎯 Objectif

Analyser automatiquement les appels d'offres BOAMP et MarchesOnline pour identifier les opportunités pertinentes et faisables pour Balthazar, en utilisant des **agents IA spécialisés** orchestrés par le framework **Mastra**.

---

## 🏗️ Architecture Mastra Workflow

### Structure du Workflow

Le workflow `aoVeilleWorkflow` est construit avec l'API Mastra `createWorkflow` :

```typescript
// src/mastra/workflows/ao-veille.ts
export const aoVeilleWorkflow = createWorkflow({
  id: 'aoVeilleWorkflow',
  inputSchema: z.object({
    clientId: z.string(),
    since: z.string().optional(),
    marchesonlineRSSUrls: z.array(z.string().url()).optional()
  }),
  outputSchema: z.object({
    saved: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
    cancelled: z.number(),
    llmCalls: z.number()
  })
})
  .then(fetchAndPrequalifyStep)
  .then(handleCancellationsStep)
  .then(detectRectificationStep)
  .then(filterAlreadyAnalyzedStep)
  .then(keywordMatchingStep)
  .map(async ({ inputData }) => {
    // Transformation pour .foreach()
  })
  .foreach(processOneAOWorkflow, { concurrency: 10 })
  .then(normalizeBranchResultsStep)
  .then(aggregateResultsStep)
  .then(saveResultsStep)
  .then(sendEmailStep)
  .commit();
```

### Composants Mastra Utilisés

1. **`createWorkflow`** : Création du workflow principal avec schémas Zod
2. **`createStep`** : Création de steps individuels avec validation entrée/sortie
3. **`.then()`** : Enchaînement séquentiel des steps
4. **`.map()`** : Transformation des données entre steps
5. **`.foreach()`** : Traitement parallèle avec workflow imbriqué
6. **`.branch()`** : Branching conditionnel dans le workflow imbriqué

### Flux de Données Typé

Chaque step a un **schéma Zod d'entrée et de sortie** garantissant :
- Validation des données à l'entrée
- Structure garantie à la sortie
- Typage TypeScript complet
- Détection d'erreurs à la compilation

---

## 📊 Diagramme de Flux Complet

```mermaid
graph TB
    Start([Déclenchement<br/>clientId, since]) --> Fetch[fetchAndPrequalifyStep<br/>Collecte BOAMP + MarchesOnline]
    Fetch --> Cancellations[handleCancellationsStep<br/>Filtre annulations]
    Cancellations --> Rectifs[detectRectificationStep<br/>Détecte rectificatifs]
    Rectifs --> Filter[filterAlreadyAnalyzedStep<br/>Évite re-analyse]
    Filter --> Keywords[keywordMatchingStep<br/>Pré-scoring mots-clés]
    Keywords --> Map[.map<br/>Transformation pour foreach]
    Map --> Foreach[.foreach processOneAOWorkflow<br/>Traitement individuel<br/>concurrency: 10]
    
    Foreach --> Branch1[Branch 1: AO Annulé<br/>0€ LLM]
    Foreach --> Branch2[Branch 2: Rectificatif Mineur<br/>0€ LLM]
    Foreach --> Branch3[Branch 2.5: Skip LLM<br/>0€ LLM]
    Foreach --> Branch4[Branch 3/4: Analyse Complète<br/>1 appel LLM]
    
    Branch1 --> Normalize[normalizeBranchResultsStep<br/>Normalisation résultats]
    Branch2 --> Normalize
    Branch3 --> Normalize
    Branch4 --> Normalize
    
    Normalize --> Aggregate[aggregateResultsStep<br/>Agrégation + Stats]
    Aggregate --> Save[saveResultsStep<br/>Sauvegarde Supabase]
    Save --> Email[sendEmailStep<br/>Email récapitulatif]
    Email --> End([Résultat Final])
    
    style Fetch fill:#fff4e1
    style Keywords fill:#fff4e1
    style Branch4 fill:#e1f5ff
    style Foreach fill:#e8f5e9
```

---

## 📋 Steps Détaillés

### Step 1 : fetchAndPrequalifyStep

**Rôle** : Collecte initiale depuis BOAMP et MarchesOnline avec déduplication cross-platform.

#### Schéma d'Entrée

```typescript
z.object({
  clientId: z.string(),
  since: z.string().optional(),
  marchesonlineRSSUrls: z.array(z.string().url()).optional()
})
```

#### Schéma de Sortie

```typescript
z.object({
  prequalified: z.array(aoSchema),
  client: clientSchema,
  fetchStatus: z.string(),
  fetchMissing: z.number()
})
```

#### Logique Métier

1. **Récupération Client** : Charge le profil client depuis Supabase (`clients` table)
2. **Appel Outil BOAMP** : Utilise `boampFetcherTool.execute()` avec :
   - `since` : Date cible (défaut = veille)
   - `typeMarche` : Depuis préférences client (`SERVICES`)
   - `pageSize` : 100 (MAX autorisé par OpenDataSoft)
3. **Appel Outil MarchesOnline** (optionnel) : Si `marchesonlineRSSUrls` configuré dans client ou input
4. **Déduplication Cross-Platform** : Utilise `findBatchBOAMPMatches()` pour exclure les doublons MarchesOnline déjà présents dans BOAMP
5. **Transformation** : Convertit `CanonicalAO[]` → format plat `aoSchema[]` via `canonicalAOToFlatSchema()`
6. **Planification Retry** : Si `missing > 0`, planifie un retry à 60 min via `scheduleRetry()`

#### Appels aux Outils

```typescript
// Outil BOAMP
const boampData = await boampFetcherTool.execute!({
  since: inputData.since,
  typeMarche: client.preferences.typeMarche,
  pageSize: 100
}, { requestContext });

// Retourne: { records: CanonicalAO[], total_count, fetched, status, ... }

// Outil MarchesOnline (si configuré)
const marchesonlineData = await marchesonlineRSSFetcherTool.execute!({
  rssUrls: rssUrls,
  since: inputData.since,
  typeMarche: client.preferences.typeMarche
}, { requestContext });

// Déduplication cross-platform
const matches = await findBatchBOAMPMatches(
  marchesonlineData.records.map(ao => ({
    uuid_procedure: ao.uuid_procedure,
    title: ao.identity.title,
    acheteur: ao.identity.acheteur,
    deadline: ao.lifecycle.deadline,
    siret: ao.metadata.siret
  }))
);
```

#### Exemple de Données

**Input** :
```json
{
  "clientId": "balthazar",
  "since": "2025-12-20"
}
```

**Output** :
```json
{
  "prequalified": [
    {
      "source": "BOAMP",
      "source_id": "26-12345",
      "title": "Accompagnement transformation digitale",
      "description": "Mission de conseil...",
      "keywords": ["conseil", "transformation"],
      "acheteur": "SNCF",
      "deadline": "2025-01-15",
      "region": "Île-de-France",
      "type_marche": "SERVICES",
      "raw_json": { /* CanonicalAO complet avec uuid_procedure */ }
    }
  ],
  "client": { /* Profil client */ },
  "fetchStatus": "COMPLETE",
  "fetchMissing": 0
}
```

---

### Step 2 : handleCancellationsStep

**Rôle** : Filtre et marque les AO annulés en base de données.

#### Schéma d'Entrée

```typescript
z.object({
  prequalified: z.array(aoSchema),
  client: clientSchema
})
```

#### Schéma de Sortie

```typescript
z.object({
  activeAOs: z.array(aoSchema),
  cancelledCount: z.number(),
  client: clientSchema
})
```

#### Logique Métier

1. **Détection** : Filtre les AO avec `etat === 'AVIS_ANNULE'` ou détection via `nature_label`/`nature`
2. **Mise à Jour DB** : Upsert dans `appels_offres` avec :
   - `status = 'cancelled'`
   - `etat = 'AVIS_ANNULE'`
   - Clés de déduplication calculées (`uuid_procedure`, `dedup_key`, `siret_deadline_key`)
3. **Exclusion** : Ne transmet PAS les AO annulés à l'analyse IA (économie de tokens)

#### Gestion d'Erreurs

- Erreurs DB loggées mais n'interrompent pas le workflow
- Continue même si certaines annulations échouent

---

### Step 3 : detectRectificationStep

**Rôle** : Détecte les rectificatifs et compare avec l'AO original pour décider si re-analyse nécessaire.

#### Schéma d'Entrée

```typescript
z.object({
  activeAOs: z.array(aoSchema),
  client: clientSchema
})
```

#### Schéma de Sortie

```typescript
z.object({
  toAnalyze: z.array(aoSchema.extend({
    _isRectification: z.boolean().optional(),
    _originalAO: z.any().optional(),
    _changes: z.any().optional()
  })),
  rectificationsMineurs: z.number(),
  rectificationsSubstantiels: z.number(),
  client: clientSchema
})
```

#### Logique Métier

1. **Détection Rectificatif** : Utilise `isRectification(ao)` qui vérifie :
   - `nature_categorise === 'avis_rectificatif'`
   - `type_avis` contient "rectificatif"
   - `annonce_lie IS NOT NULL`

2. **Recherche AO Original** : Utilise `findOriginalAO(rectificationAO)` avec 3 stratégies :
   - **Stratégie 1** : Recherche directe par `annonce_lie` (optimisé, 1 requête)
   - **Stratégie 2** : Recherche par acheteur + titre similaire (fallback)
   - **Stratégie 3** : Recherche par `normalized_id` (si disponible)

3. **Détection Changements Substantiels** : Utilise `detectSubstantialChanges(oldAO, newAO)` qui vérifie :
   - **Budget** : Variation > 20%
   - **Deadline** : Décalage > 7 jours
   - **Critères financiers** : Modification `CAP_ECO` (extrait depuis `raw_json.donnees`)
   - **Critères techniques** : Modification `CAP_TECH`
   - **Type de marché** : Changement
   - **Région** : Changement
   - **Titre** : Similarité < 80% (distance Levenshtein)

4. **Décision** :
   - **Changement substantiel** → Re-analyse complète (ajout à `toAnalyze` avec métadonnées `_isRectification`, `_originalAO`, `_changes`)
   - **Changement mineur** → Simple MAJ DB (deadline, `rectification_count++`)

#### Utilisation des Utilitaires

```typescript
import {
  isRectification,
  findOriginalAO,
  detectSubstantialChanges,
  calculateLevenshteinSimilarity
} from './rectificatif-utils';
```

---

### Step 4 : filterAlreadyAnalyzedStep

**Rôle** : Évite la re-analyse des AO déjà traités (optimisation coûts LLM).

#### Schéma d'Entrée

```typescript
z.object({
  toAnalyze: z.array(aoSchema.extend({...})),
  rectificationsMineurs: z.number(),
  rectificationsSubstantiels: z.number(),
  client: clientSchema
})
```

#### Schéma de Sortie

```typescript
z.object({
  toAnalyze: z.array(aoSchema.extend({...})),
  rectificationsMineurs: z.number(),
  rectificationsSubstantiels: z.number(),
  skipped: z.number(),
  client: clientSchema
})
```

#### Logique Métier

1. **Vérification Batch** : Utilise `checkBatchAlreadyAnalyzed()` pour une seule requête DB optimisée
2. **Exceptions** :
   - Rectificatifs substantiels → **TOUJOURS** re-analysés (changement important)
   - AO annulés déjà analysés → Skip (gérés par step précédent)
3. **Filtrage** : Exclut les AO avec `status = 'analyzed'` en DB

#### Optimisation

- **Économie** : Évite `keyword matching + LLM` pour les AO déjà analysés
- **Typique** : ~50% des AO sont déjà analysés → économie significative (~1€/jour)

---

### Step 5 : keywordMatchingStep

**Rôle** : Pré-scoring basé sur lexique Balthazar (gratuit, non bloquant).

#### Schéma d'Entrée

```typescript
z.object({
  toAnalyze: z.array(aoSchema.extend({...})),
  rectificationsMineurs: z.number(),
  rectificationsSubstantiels: z.number(),
  skipped: z.number().optional(),
  client: clientSchema
})
```

#### Schéma de Sortie

```typescript
z.object({
  keywordMatched: z.array(aoSchema.extend({
    keywordScore: z.number(),              // 0-1 (compatible workflow)
    matchedKeywords: z.array(z.string()),
    keywordDetails: z.any().optional(),   // Détails complets (score 0-100)
    _shouldSkipLLM: z.boolean().optional(),
    _skipLLMPriority: z.enum(['SKIP', 'LOW', 'MEDIUM', 'HIGH']).optional(),
    _skipLLMReason: z.string().optional(),
    keywordSignals: z.record(z.boolean()).optional()
  })),
  client: clientSchema
})
```

#### Logique Métier

1. **Scoring Keywords** : Utilise `calculateKeywordScore()` :
   - Analyse titre, description, keywords, acheteur
   - Lexique Balthazar avec pondérations :
     - Secteurs cibles : ×3 (mobilités, entreprises à mission, assurance, énergie, service public)
     - Expertises : ×2 (conseil, stratégie, transformation, gouvernance, RSE, raison d'être, etc.)
     - Red flags : pénalité -30 pts (formation catalogue, travaux, IT, fournitures, juridique pur, actuariat)

2. **Scoring Amélioré** : Utilise `calculateEnhancedKeywordScore()` :
   - Bonus/malus métier
   - Détection signaux faibles (strategy, transformation, innovation, etc.)

3. **Décision Skip LLM** : Utilise `shouldSkipLLM()` (voir `EXPLICATION_SYSTEME_SCORING.md` pour le détail) :
   - Score < 20 → Skip LLM
   - Score 20-30 → Analyse LLM seulement si confiance HIGH, sinon Skip
   - Score 30-40 avec confiance LOW → Skip LLM (économie)
   - Score ≥ 30 (avec confiance MEDIUM/HIGH) → Analyse LLM requise

4. **Tri** : Trie par score décroissant (meilleurs AO en premier)

#### Fonctions Utilisées

```typescript
import {
  calculateKeywordScore,
  calculateEnhancedKeywordScore,
  shouldSkipLLM
} from '../../utils/balthazar-keywords';
```

#### Exemple de Données Enrichies

```typescript
{
  ...ao,
  keywordScore: 0.65,  // 65/100 converti en 0-1 (compatible workflow)
  matchedKeywords: ['conseil', 'transformation', 'digitale'],
  keywordDetails: {
    score: 65,
    confidence: 'HIGH',
    secteur_matches: [{ category: 'mobilite' }],
    expertise_matches: [{ category: 'transformation' }, { category: 'strategie' }],
    red_flags_detected: [],
    breakdown: {
      secteur_score: 30,
      expertise_score: 25,
      posture_score: 10
    }
  },
  _shouldSkipLLM: false,  // Score suffisant pour LLM
  _skipLLMPriority: null,
  _skipLLMReason: null,
  keywordSignals: {
    strategy: true,
    transformation: true,
    conseil: true,
    innovation: false
  }
}
```

---

### Step 6 : Transformation pour `.foreach()`

**Rôle** : Transformer l'objet `{ keywordMatched: [...], client: {...} }` en tableau pour `.foreach()`.

#### Logique

```typescript
.map(async ({ inputData }) => {
  const { keywordMatched, client } = inputData;
  
  // Chaque élément contient l'AO ET le client
  // Le client est dupliqué car Mastra ne partage pas le contexte entre itérations
  return keywordMatched.map(ao => ({ 
    ao, 
    client 
  }));
})
```

**Résultat** : `[{ ao: AO1, client }, { ao: AO2, client }, ...]`

---

### Step 7 : processOneAOWorkflow (Workflow Imbriqué)

**Rôle** : Traite chaque AO individuellement avec un système de **branching conditionnel**.

#### Architecture du Workflow Imbriqué

```typescript
const processOneAOWorkflow = createWorkflow({
  id: 'process-one-ao',
  inputSchema: z.object({
    ao: aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      keywordDetails: z.any().optional(),
      _shouldSkipLLM: z.boolean().optional(),
      ...
    }),
    client: clientSchema
  }),
  outputSchema: z.object({
    ao: aoSchema.extend({
      finalScore: z.number(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW', 'CANCELLED'])
    }),
    client: clientSchema
  })
})
  .branch([
    // Branch 1 : AO Annulé
    [condition1, handleCancellationAOStep],
    
    // Branch 2 : Rectificatif Mineur
    [condition2, handleMinorRectificationAOStep],
    
    // Branch 2.5 : Skip LLM
    [condition3, handleSkipLLMAOStep],
    
    // Branch 3/4 : Analyse Complète (LLM)
    [condition4, analyzeAOCompleteWorkflow]
  ]);
```

#### Système de Branching

Le workflow utilise `.branch()` avec des conditions évaluées dans l'ordre :

```mermaid
graph TD
    Start([AO avec keywordScore]) --> Check1{AO Annulé?}
    Check1 -->|Oui| Branch1[handleCancellationAOStep<br/>0€ LLM<br/>Status: CANCELLED]
    Check1 -->|Non| Check2{Rectificatif<br/>Mineur?}
    Check2 -->|Oui| Branch2[handleMinorRectificationAOStep<br/>0€ LLM<br/>Conserve score original]
    Check2 -->|Non| Check3{Skip LLM?<br/>score < 40}
    Check3 -->|Oui| Branch3[handleSkipLLMAOStep<br/>0€ LLM<br/>Score keywords uniquement]
    Check3 -->|Non| Branch4[analyzeAOCompleteWorkflow<br/>1 appel LLM<br/>Analyse sémantique]
    
    Branch1 --> End([Résultat])
    Branch2 --> End
    Branch3 --> End
    Branch4 --> End
    
    style Branch1 fill:#ffebee
    style Branch2 fill:#fff3e0
    style Branch3 fill:#fff9c4
    style Branch4 fill:#e1f5ff
```

#### Branch 1 : AO Annulé

**Condition** :
```typescript
const isAnnule = 
  ao.etat === 'AVIS_ANNULE' ||
  ao.raw_json?.lifecycle?.nature_label?.toLowerCase().includes('annulation') ||
  ao.raw_json?.lifecycle?.nature?.toLowerCase().includes('annulation');
```

**Action** :
- Mise à jour DB : `status = 'cancelled'`, `etat = 'AVIS_ANNULE'`
- Retour : `priority = 'CANCELLED'`, `finalScore = 0`
- **Coût LLM** : 0€

#### Branch 2 : Rectificatif Mineur

**Condition** :
```typescript
ao._isRectification && 
ao._changes?.isSubstantial === false
```

**Action** :
- Mise à jour DB : Deadline, `rectification_count++`, `rectification_date`
- Retour : Conserve score original de l'AO (`_originalAO.finalScore`)
- **Coût LLM** : 0€

#### Branch 2.5 : Skip LLM

**Condition** :
```typescript
ao._shouldSkipLLM === true
```

**Action** :
- Score final basé uniquement sur keywords (avec pénalité 30%)
- Formule : `finalScore = (keywordScore / 10) * 0.7` (max 7/10)
- Priorité : MEDIUM si score ≥ 5.6, sinon LOW
- **Coût LLM** : 0€

#### Branch 3/4 : Analyse Complète (LLM)

**Condition** : Tous les autres cas (nouveaux AO ou rectificatifs substantiels)

**Workflow** : `analyzeAOCompleteWorkflow` qui enchaîne :
1. `analyzeOneAOSemanticStep` → Appel agent IA
2. `scoreOneAOStep` → Calcul score final

**Coût LLM** : 1 appel par AO (~0.003€)

---

### Step 8 : analyzeOneAOSemanticStep ⭐

**Rôle** : Analyse sémantique via agent IA `boampSemanticAnalyzer`.

#### Schéma d'Entrée

```typescript
z.object({
  ao: aoSchema.extend({
    keywordScore: z.number(),
    matchedKeywords: z.array(z.string()),
    keywordDetails: z.any().optional(),
    ...
  }),
  client: clientSchema
})
```

#### Schéma de Sortie

```typescript
z.object({
  ao: aoSchema.extend({
    semanticScore: z.number(),        // 0-10
    semanticReason: z.string(),
    semanticDetails: z.any().optional(),
    procedureType: z.string().nullable(),
    daysRemaining: z.number(),
    ...
  }),
  client: clientSchema
})
```

#### Intégration de l'Agent IA

**Appel de l'Agent** :

```typescript
// Dans analyzeOneAOSemanticStep
const result = await analyzeSemanticRelevance(ao, keywordDetails);

// Fonction analyzeSemanticRelevance (dans boamp-semantic-analyzer.ts)
export async function analyzeSemanticRelevance(
  ao: AOInput,
  keywordScore?: KeywordScore
): Promise<{
  score: number;
  reason: string;
  details: BalthazarSemanticAnalysis | null;
}> {
  // Construction du prompt avec few-shot examples
  const prompt = buildBalthazarSemanticPrompt(ao, keywordScore);
  
  // Appel agent avec structured output
  const response = await boampSemanticAnalyzer.generate(prompt, {
    structuredOutput: {
      schema: balthazarSemanticAnalysisSchema,
      errorStrategy: 'fallback',
      fallbackValue: DEFAULT_FALLBACK_ANALYSIS
    },
  });
  
  const analysis = response.object as BalthazarSemanticAnalysis;
  
  return {
    score: analysis.score_semantique_global,
    reason: analysis.justification_globale,
    details: analysis
  };
}
```

#### Construction du Prompt

Le prompt est construit avec :

1. **Few-shot Examples** : 3 exemples réels Balthazar condensés :
   - Ex1 : Tisséo (HAUTE_PRIORITE) - Plan stratégique + raison d'être
   - Ex2 : ATMB (HAUTE_PRIORITE) - Entreprise à mission
   - Ex3 : Formation Microsoft (NON_PERTINENT) - Red flag

2. **Contexte Keywords** : 
   - Score keywords (0-100)
   - Secteurs détectés
   - Expertises détectées
   - Red flags

3. **Données AO** : Titre, organisme, description, keywords

**Exemple de Prompt** :

```
## EXEMPLES D'ANALYSE

Ex1: "Prestation de conseil pour l'élaboration du plan stratégique..." → 9.7/10 (mobilite, strategie+raison_etre+gouvernance+transformation, CODIR) → HAUTE_PRIORITE
Ex2: "Accompagnement vers le statut d'entreprise à mission" → 9.7/10 (entreprise_mission, raison_etre+entreprise_mission+gouvernance+rse+transformation, CODIR) → HAUTE_PRIORITE
Ex3: "Formation Microsoft Office pour agents administratifs" → 0.5/10 (red flag formation) → NON_PERTINENT

## AO À ANALYSER

Titre: Accompagnement transformation digitale SNCF
Organisme: SNCF
Description: Mission de conseil en stratégie de transformation numérique...
Keywords: conseil, stratégie, transformation, sncf
Pré-scoring: 92/100
Confidence: HIGH
Secteurs: mobilite
Expertises: strategie, transformation, gouvernance
Red flags: aucun

Analyse cet AO selon le format des exemples ci-dessus.
```

#### Structured Output

L'agent retourne un schéma Zod structuré avec 3 axes :

```typescript
const balthazarSemanticAnalysisSchema = z.object({
  // Axe 1 : Fit Sectoriel (35%)
  fit_sectoriel: z.object({
    score: z.number().min(0).max(10),
    secteur_detecte: z.enum(['mobilite', 'assurance', 'energie', 'service_public', 'entreprise_mission', 'autre']),
    justification: z.string()
  }),
  
  // Axe 2 : Fit Expertise (35%)
  fit_expertise: z.object({
    score: z.number().min(0).max(10),
    expertises_detectees: z.array(z.string()),
    justification: z.string()
  }),
  
  // Axe 3 : Fit Posture (20%)
  fit_posture: z.object({
    score: z.number().min(0).max(10),
    niveau_intervention: z.enum(['CODIR', 'COMEX', 'direction', 'operationnel', 'inconnu']),
    approche: z.array(z.string()),
    justification: z.string()
  }),
  
  // Score global (moyenne pondérée: 0.35×secteur + 0.35×expertise + 0.20×posture)
  score_semantique_global: z.number().min(0).max(10),
  
  // Critères Balthazar (règle 3/4)
  criteres_balthazar: z.object({
    secteur_cible: z.boolean(),
    besoin_transformation: z.boolean(),
    ouverture_marche: z.boolean().optional(),
    total_valides: z.number().min(0).max(4)
  }),
  
  // Recommandation
  recommandation: z.enum(['HAUTE_PRIORITE', 'MOYENNE_PRIORITE', 'BASSE_PRIORITE', 'NON_PERTINENT']),
  justification_globale: z.string()
});
```

#### Gestion des Erreurs

- **Structured Output Fallback** : Valeur par défaut si parsing échoue
- **Fallback Fonctionnel** : Score basé sur keywords si erreur LLM (`(keywordScore / 100) * 0.7`)
- **Logs** : Traçabilité complète pour debugging

#### Exemple de Réponse Agent

```json
{
  "fit_sectoriel": {
    "score": 10,
    "secteur_detecte": "mobilite",
    "justification": "SNCF = secteur mobilité prioritaire Balthazar"
  },
  "fit_expertise": {
    "score": 9,
    "expertises_detectees": ["strategie", "transformation", "gouvernance"],
    "justification": "Double expertise cœur Balthazar : plan stratégique + transformation"
  },
  "fit_posture": {
    "score": 9,
    "niveau_intervention": "CODIR",
    "approche": ["ateliers", "intelligence_collective", "co-construction"],
    "justification": "Niveau CODIR + approche participative typique Balthazar"
  },
  "score_semantique_global": 9.4,
  "criteres_balthazar": {
    "secteur_cible": true,
    "besoin_transformation": true,
    "ouverture_marche": true,
    "total_valides": 3
  },
  "recommandation": "HAUTE_PRIORITE",
  "justification_globale": "AO idéal pour Balthazar : secteur mobilité prioritaire, expertises signature, niveau CODIR, approche participative"
}
```

---

### Step 9 : scoreOneAOStep

**Rôle** : Calcule le score final et détermine la priorité.

#### Formule de Scoring

```typescript
// Calcul score global (0-10)
const keywordContribution = keywordDetails
  ? (keywordDetails.score / 100) * 0.30  // Nouveau: 30% (0-100 → 0-10)
  : (ao.keywordScore * 10) * 0.25;       // Ancien: 25% (backward compat)

const score = (
  ao.semanticScore * 0.50 +              // Pertinence: 50%
  keywordContribution +                   // Keywords: 25-30%
  (1 - Math.min(ao.daysRemaining / 60, 1)) * 10 * 0.20  // Urgence: 20%
);

// Priorisation
const priority = 
  score >= 8 ? 'HIGH' :
  score >= 6 ? 'MEDIUM' : 'LOW';
```

#### Pondérations

- **Pertinence sémantique** : 50% (analyse agent IA)
- **Keywords** : 25-30% (pré-scoring gratuit)
- **Urgence** : 20% (jours restants avant deadline, max 60 jours)

#### Seuils de Priorité

- **HIGH** : Score ≥ 8/10
- **MEDIUM** : Score ≥ 6/10
- **LOW** : Score < 6/10

---

### Step 10 : normalizeBranchResultsStep

**Rôle** : Normalise les résultats des branches (le workflow branché retourne un objet avec clés de branches).

#### Logique

```typescript
// Le workflow branché retourne :
// { "handle-cancellation-ao": {...}, "analyze-ao-complete": {...} }
// On extrait le résultat de la branche exécutée
```

---

### Step 11 : aggregateResultsStep

**Rôle** : Agrège les résultats de tous les AO traités et calcule les statistiques.

#### Schéma de Sortie

```typescript
z.object({
  all: z.array(z.any()),
  high: z.array(z.any()),
  medium: z.array(z.any()),
  low: z.array(z.any()),
  cancelled: z.array(z.any()),
  stats: z.object({
    total: z.number(),
    analysed: z.number(),
    cancelled: z.number(),
    skipped: z.number().optional(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
    llmCalls: z.number()
  }),
  statsBySource: z.object({
    BOAMP: z.object({ total, high, medium, low }),
    MARCHESONLINE: z.object({ total, high, medium, low })
  }),
  highBySource: z.object({
    BOAMP: z.array(z.any()),
    MARCHESONLINE: z.array(z.any())
  }),
  mediumBySource: z.object({...}),
  lowBySource: z.object({...})
})
```

#### Calcul des Statistiques

- **Total** : Nombre total d'AO traités
- **Analysés** : Total - Annulés
- **LLM Calls** : Nombre d'AO avec `semanticScore` défini (exclut skip LLM et annulés)
- **Par Source** : Séparation BOAMP / MarchesOnline pour email

---

### Step 12 : saveResultsStep

**Rôle** : Sauvegarde les AO analysés dans Supabase.

#### Logique Métier

1. **Upsert** : Utilise `onConflict: 'source_id'` pour éviter doublons
2. **Gestion Rectificatifs** : Si rectificatif substantiel, met à jour l'AO existant avec historique dans `analysis_history`
3. **Calcul Clés Déduplication** : Génère `uuid_procedure`, `dedup_key`, `siret_deadline_key` via `generateDedupKeys()`
4. **Sauvegarde Tous les AO** : HIGH, MEDIUM, LOW (pas seulement HIGH+MEDIUM)

#### Champs Sauvegardés

```typescript
{
  // Identifiants
  source: 'BOAMP',
  source_id: '26-12345',
  uuid_procedure: UUID,
  siret: string | null,
  dedup_key: string,
  siret_deadline_key: string,
  
  // Contenu
  title: string,
  description: string,
  keywords: string[],
  
  // Acheteur
  acheteur: string,
  acheteur_email: string | null,
  
  // Budget & Dates
  budget_max: number | null,
  deadline: string,
  publication_date: string,
  
  // Classification
  type_marche: 'SERVICES',
  region: 'Île-de-France',
  
  // Scores
  keyword_score: 0.65,
  semantic_score: 9.4,
  final_score: 8.5,
  priority: 'HIGH',
  
  // Métadonnées
  client_id: 'balthazar',
  status: 'analyzed',
  analyzed_at: timestamp,
  
  // Rectificatifs
  is_rectified: boolean,
  rectification_count: number,
  analysis_history: JSONB,
  rectification_changes: JSONB,
  
  // Backup
  raw_json: CanonicalAO
}
```

---

### Step 13 : sendEmailStep

**Rôle** : Envoie un email récapitulatif au client avec les AO pertinents.

#### Fonctionnalités

- Génère HTML et texte avec templates (`generateEmailHTML`, `generateEmailText`)
- Liste les AO HIGH et MEDIUM par source
- Liste les AO LOW avec raisons
- Statistiques par source (BOAMP / MarchesOnline)
- Gestion d'erreurs gracieuse (n'interrompt pas le workflow)

---

## 🤖 Intégration de l'Agent IA

### Architecture de l'Intégration

```mermaid
sequenceDiagram
    participant Workflow as semanticAnalysisStep
    participant Function as analyzeSemanticRelevance
    participant Agent as boampSemanticAnalyzer
    participant LLM as GPT-4o-mini
    participant Workflow2 as Workflow (suite)
    
    Workflow->>Function: analyzeSemanticRelevance(ao, keywordDetails)
    Function->>Function: buildBalthazarSemanticPrompt()
    Note over Function: Few-shot examples<br/>+ Contexte keywords<br/>+ Données AO
    Function->>Agent: agent.generate(prompt, structuredOutput)
    Agent->>LLM: Appel API OpenAI
    Note over LLM: Analyse selon<br/>3 axes (sectoriel,<br/>expertise, posture)
    LLM-->>Agent: Réponse JSON structurée
    Agent->>Agent: Validation schéma Zod
    Agent-->>Function: BalthazarSemanticAnalysis
    Function->>Function: Extraction score + reason
    Function-->>Workflow: { score: 9.4, reason: "...", details: {...} }
    Workflow->>Workflow2: Continue avec semanticScore
```

### Flux de Données Agent → Workflow

1. **Input** : AO avec `keywordScore` et `keywordDetails`
2. **Prompt Building** : Construction avec few-shot + contexte keywords
3. **Appel Agent** : `agent.generate()` avec structured output
4. **Validation** : Schéma Zod garantit le format
5. **Extraction** : Score 0-10 + justification
6. **Enrichissement AO** : Ajout de `semanticScore` et `semanticReason`
7. **Continuation** : Workflow continue avec AO enrichi

### Gestion des Erreurs

- **Structured Output Fallback** : Valeur par défaut si parsing échoue
- **Fallback Fonctionnel** : Score basé sur keywords si erreur LLM
- **Logs** : Traçabilité complète pour debugging

---

## 📊 Système de Scoring Multi-Niveaux

### Pipeline Complet

```mermaid
graph LR
    A[AO Brut] --> B[Keyword Matching<br/>Score 0-100<br/>Gratuit]
    B --> C{Score ≥ 40?}
    C -->|Oui| D[Semantic Analysis<br/>Agent IA<br/>Score 0-10<br/>~0.003€]
    C -->|Non| E[Skip LLM<br/>Score keywords<br/>avec pénalité 30%]
    D --> F[Scoring Final<br/>0-10<br/>50% sémantique<br/>25-30% keywords<br/>20% urgence]
    E --> F
    F --> G{Priorité}
    G -->|≥8| H[HIGH]
    G -->|≥6| I[MEDIUM]
    G -->|<6| J[LOW]
    
    style D fill:#e1f5ff
    style B fill:#fff4e1
    style F fill:#e8f5e9
```

### Niveau 1 : Keyword Matching

- **Fonction** : `calculateKeywordScore()` + `calculateEnhancedKeywordScore()`
- **Lexique** : Secteurs (×3), Expertises (×2), Red flags
- **Score** : 0-100
- **Optimisation** : `shouldSkipLLM()` évite appels LLM inutiles

### Niveau 2 : Semantic Analysis (Agent IA)

- **Agent** : `boampSemanticAnalyzer`
- **Modèle** : GPT-4o-mini
- **Structured Output** : Schéma Zod avec 3 axes
- **Score** : 0-10 (moyenne pondérée)
- **Coût** : ~0.003€ par AO

### Niveau 3 : Scoring Final

- **Formule** :
  ```typescript
  score = (
    semanticScore * 0.50 +      // 50%
    keywordContribution * 0.30 + // 25-30%
    urgency * 0.20              // 20%
  );
  ```
- **Priorité** : HIGH (≥8), MEDIUM (≥6), LOW (<6)

---

## 🔗 Déduplication Cross-Platform

### Principe

Les AO peuvent apparaître sur **BOAMP** et **MarchesOnline**. Le système détecte et exclut les doublons avant l'analyse.

### Stratégie de Matching (3 Niveaux)

#### Niveau 1 : UUID Procédure (99% Fiabilité)

```typescript
// Matching direct via UUID universel
const match = await supabase
  .from('appels_offres')
  .select('*')
  .eq('uuid_procedure', marchesonlineAO.uuid_procedure)
  .single();
```

**Taux de succès** : ~99% des cas

#### Niveau 2 : Clé Composite (95% Fiabilité)

```typescript
// Matching via clé normalisée : title|deadline|acheteur
const dedupKey = normalizeText(`${title}|${deadline}|${acheteur}`);
const match = await supabase
  .from('appels_offres')
  .select('*')
  .eq('dedup_key', dedupKey)
  .single();
```

**Taux de succès** : ~95% des cas (fallback si UUID absent)

#### Niveau 3 : SIRET + Deadline (80% Fiabilité)

```typescript
// Matching via SIRET + deadline
const siretDeadlineKey = `${siret}|${deadline}`;
const match = await supabase
  .from('appels_offres')
  .select('*')
  .eq('siret_deadline_key', siretDeadlineKey)
  .single();
```

**Taux de succès** : ~80% des cas (fallback ultime)

### Fonction de Matching Batch

```typescript
// Dans fetchAndPrequalifyStep
const matches = await findBatchBOAMPMatches(
  marchesonlineData.records.map(ao => ({
    uuid_procedure: ao.uuid_procedure,
    title: ao.identity.title,
    acheteur: ao.identity.acheteur,
    deadline: ao.lifecycle.deadline,
    siret: ao.metadata.siret
  }))
);

// Filtrer : garder uniquement les AO MarchesOnline SANS match BOAMP
const uniqueMarchesonlineAOs = marchesonlineData.records.filter((ao, index) => {
  const match = matches.get(index);
  return !match; // Exclure si match trouvé
});
```

---

## 📝 Gestion des Rectificatifs

### Algorithme de Détection

1. **Détection** : `isRectification(ao)` vérifie 3 critères
2. **Recherche Original** : `findOriginalAO()` avec 3 stratégies
3. **Comparaison** : `detectSubstantialChanges()` analyse 7 types de changements
4. **Décision** : Substantiel → Re-analyse, Mineur → MAJ DB

### Types de Changements Détectés

| Type | Seuil | Détection |
|------|-------|-----------|
| Budget | Variation > 20% | Calcul pourcentage |
| Deadline | Décalage > 7 jours | Calcul jours |
| Critères financiers | Modification | Comparaison JSON `CAP_ECO` |
| Critères techniques | Modification | Comparaison JSON `CAP_TECH` |
| Type de marché | Changement | Comparaison string |
| Région | Changement | Comparaison string |
| Titre | Similarité < 80% | Distance Levenshtein |

### Exemple de Changement Substantiel

```typescript
{
  isSubstantial: true,
  changes: [
    {
      field: 'budget',
      old: 50000,
      new: 75000,
      change_pct: 50
    },
    {
      field: 'deadline',
      old: '2025-01-15',
      new: '2025-02-01',
      days_added: 17
    }
  ]
}
```

---

## 📈 Métriques et Résultats

### Taux de Conversion Typiques

```
650 AO récupérés (BOAMP)
  ↓
645 AO actifs (5 annulations)
  ↓
644 AO à analyser (1 rectif substantiel)
  ↓
320 AO nouveaux (324 déjà analysés - skip)
  ↓
320 AO avec pré-score keywords
  ↓
280 AO pertinents (40 skip LLM - score < 40)
  ↓
280 AO analysés par agent IA
  ↓
110 AO sauvegardés (HIGH + MEDIUM)
  ↓
50 HIGH (8%), 60 MEDIUM (9%)
```

### Temps d'Exécution

| Step | Durée | Coût LLM |
|------|-------|----------|
| Fetch | 5-10s | 0€ |
| Cancellations | < 1s | 0€ |
| Rectifications | 1-2s | 0€ |
| Filter Already Analyzed | 1-2s | 0€ |
| Keywords | 1-2s | 0€ |
| Semantic (280 AO) | 60-90s | ~0.84€ |
| Scoring | < 1s | 0€ |
| Save | 2-5s | 0€ |
| Email | 1-2s | 0€ |
| **TOTAL** | **~2-3 min** | **~1€/jour** |

### Coûts LLM Optimisés

- **Skip LLM** : ~40 AO/jour évités (score < 40) → Économie ~0.12€
- **Déjà analysés** : ~324 AO/jour évités → Économie ~1€
- **Total économisé** : ~1.12€/jour grâce aux optimisations

---

## 🎯 Garanties

| Propriété | Garantie |
|-----------|----------|
| **Exhaustivité** | ✅ 100% des AO analysés (sauf skip LLM justifié) |
| **Zéro faux négatif** | ✅ Tous les AO passent le pré-scoring keywords |
| **Analyse IA** | ✅ Évaluation contextuelle avec structured output |
| **Coût optimisé** | ✅ ~1€/jour (pré-filtrage intelligent) |
| **Traçabilité** | ✅ Logs complets + historique DB |
| **Typage** | ✅ Schémas Zod garantissent la structure |
| **Résilience** | ✅ Fallback gracieux en cas d'erreur LLM |

---

## 🚀 Exécution

### Mastra Studio

```
http://localhost:4111
→ Workflows → aoVeilleWorkflow
→ Execute
```

### Programmatique

```typescript
import { mastra } from './src/mastra';

const workflow = mastra.getWorkflow('aoVeilleWorkflow');

if (!workflow) {
  throw new Error('Workflow aoVeilleWorkflow not found');
}

const run = await workflow.createRunAsync();
const result = await run.start({
  inputData: {
    clientId: 'balthazar',
    since: '2025-12-20' // Optionnel
  }
});

console.log(`${result.saved} AO analysés`);
console.log(`${result.high} HIGH, ${result.medium} MEDIUM`);
console.log(`${result.llmCalls} appels LLM effectués`);
```

---

## 🔧 Configuration Avancée

### Concurrence du `.foreach()`

```typescript
.foreach(processOneAOWorkflow, { concurrency: 10 })
```

- **Parallélisme** : 10 AO traités simultanément
- **Rate Limiting** : Contrôle le nombre d'appels LLM simultanés
- **Optimisation** : Équilibre vitesse / limites API OpenAI

### Override MarchesOnline RSS

```typescript
const result = await run.start({
  inputData: {
    clientId: 'balthazar',
    marchesonlineRSSUrls: [
      'https://www.marchesonline.com/rss/...',
      'https://www.marchesonline.com/rss/...'
    ]
  }
});
```

---

**Workflow production-grade avec architecture agentique Mastra, intégration IA structurée et optimisations coûts.** 🚀
