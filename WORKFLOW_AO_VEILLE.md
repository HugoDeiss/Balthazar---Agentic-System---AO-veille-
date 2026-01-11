# 🔄 Workflow AO Veille - Analyse Intelligente des Appels d'Offres

**Documentation technique du workflow d'analyse automatique des AO avec agents IA.**

---

## 🎯 Objectif

Analyser automatiquement les appels d'offres BOAMP pour identifier les opportunités pertinentes et faisables pour Balthazar, en utilisant des agents IA spécialisés.

---

## 🏗️ Architecture du Workflow

### Fichier Principal

**`src/mastra/workflows/ao-veille.ts`**

### Pipeline Complet

```
1. fetch-and-prequalify       (Collecte BOAMP)
          ↓
2. handle-cancellations       (Gestion annulations)
          ↓
3. detect-rectification       (Détection rectificatifs)
          ↓
4. keyword-matching           (Pré-scoring mots-clés)
          ↓
5. semantic-analysis          (Analyse IA - Pertinence)
          ↓
6. feasibility-analysis       (Analyse IA - Faisabilité)
          ↓
7. scoring                    (Score final + Priorité)
          ↓
8. save-results               (Sauvegarde Supabase)
```

---

## 📋 Steps Détaillés

### Step 1 : Fetch and Prequalify

**Fichier** : `fetchAndPrequalifyStep`

**Fonction** :
- Récupère le profil client depuis Supabase
- Appelle `boamp-fetcher` tool
- Transmet TOUS les AO (passthrough, pas de filtrage)

**Input** :
```typescript
{
  clientId: string,    // "balthazar"
  since?: string       // "2025-12-20" (optionnel, default = veille)
}
```

**Output** :
```typescript
{
  prequalified: AO[],  // Tous les AO récupérés
  client: Client,      // Profil client
  fetchStatus: string, // OK | DEGRADED | ERROR
  fetchMissing: number // Nombre d'AO manquants
}
```

**Logs** :
```
📥 BOAMP Fetch: 650 AO récupérés
📊 Total disponible: 650
📅 Date cible: 2025-12-20
📊 Statut: OK
✅ Collecte: 650 AO transmis à l'analyse
```

---

### Step 2 : Handle Cancellations

**Fichier** : `handleCancellationsStep`

**Fonction** :
- Filtre les AO annulés (`etat = 'AVIS_ANNULE'`)
- Met à jour la DB (statut = 'cancelled')
- Ne transmet PAS à l'analyse IA (économie de tokens)

**Input** :
```typescript
{
  prequalified: AO[],
  client: Client
}
```

**Output** :
```typescript
{
  activeAOs: AO[],        // AO actifs (non annulés)
  cancelledCount: number, // Nombre d'annulations traitées
  client: Client
}
```

**Logs** :
```
🚫 Traitement des annulations sur 650 AO...
❌ AO annulé détecté: Marché XYZ (BOAMP-123)
✅ AO BOAMP-123 marqué comme annulé en DB
✅ Annulations: 5 traitées, 645 AO actifs transmis
```

---

### Step 3 : Detect Rectification

**Fichier** : `detectRectificationStep`

**Fonction** :
- Détecte les rectificatifs (`annonce_lie IS NOT NULL`)
- Retrouve l'AO original en DB
- Compare les changements (budget, deadline, etc.)
- Si changement substantiel → re-analyse
- Si changement mineur → simple MAJ DB

**Input** :
```typescript
{
  activeAOs: AO[],
  client: Client
}
```

**Output** :
```typescript
{
  toAnalyze: AO[],                    // AO à analyser (nouveaux + rectifs substantiels)
  rectificationsMineurs: number,      // Rectifs mineurs (MAJ DB seulement)
  rectificationsSubstantiels: number, // Rectifs substantiels (re-analyse)
  client: Client
}
```

**Changements Substantiels** :
- Budget : variation > 10%
- Deadline : décalage > 7 jours
- Objet : modification du titre
- Critères : changement des critères d'attribution

**Logs** :
```
🔍 Détection des rectificatifs sur 645 AO...
📝 Rectificatif détecté: Marché ABC
🔗 AO original trouvé (ID: 123)
⚠️ Changement substantiel: Budget 50k€ → 75k€ (+50%)
✅ Re-analyse planifiée
📊 Rectificatifs: 2 mineurs, 1 substantiel
✅ 644 AO à analyser (nouveaux + rectificatifs substantiels)
```

---

### Step 4 : Keyword Matching (Pré-scoring)

**Fichier** : `keywordMatchingStep`

**Fonction** :
- Calcule un score basé sur les mots-clés client
- Détecte des signaux faibles (concepts clés)
- **NON BLOQUANT** : tous les AO passent
- Produit des signaux pour enrichir l'analyse IA

**Input** :
```typescript
{
  toAnalyze: AO[],
  client: Client
}
```

**Output** :
```typescript
{
  keywordMatched: AO[],  // Tous les AO avec pré-score
  client: Client
}
```

**AO Enrichi** :
```typescript
{
  ...ao,
  keywordScore: 0.65,              // 65% des mots-clés matchent
  matchedKeywords: ['conseil', 'transformation', 'digitale'],
  keywordSignals: {
    strategy: true,
    transformation: true,
    innovation: false,
    management: true,
    performance: false,
    conseil: true,
    audit: false,
    conduite_changement: true
  }
}
```

**Logs** :
```
✅ Keyword matching: 644/644 AO (tous transmis avec pré-score)
```

---

### Step 5 : Semantic Analysis (Agent IA)

**Fichier** : `semanticAnalysisStep`  
**Agent** : `boampSemanticAnalyzer`

**Fonction** :
- Analyse la **pertinence métier** de l'AO pour le client
- Évalue l'adéquation secteur, expertise, mots-clés
- Prend en compte budget, région, pré-score
- Score : 0-10

**Prompt IA** :
```
Profil client:
- Nom: Balthazar Consulting
- Mots-clés métier: conseil, stratégie, transformation, digitale, ...
- Budget minimum: 50 000€
- Régions cibles: Île-de-France, Auvergne-Rhône-Alpes

Appel d'offres:
- Titre: Accompagnement transformation digitale
- Description: ...
- Budget estimé: 75 000€
- Région: Île-de-France
- Pré-score mots-clés: 0.65
- Signaux détectés: strategy, transformation, conseil, conduite_changement

Question: Sur une échelle de 0 à 10, quelle est la pertinence de cet AO pour ce client ?

Critères d'évaluation:
1. Adéquation métier (secteur, expertise, mots-clés)
2. Budget compatible avec les capacités du client
3. Localisation géographique (priorité aux régions cibles)
4. Type de procédure (ouvert = accessible)
5. Signaux faibles détectés par le pré-scoring

Réponds UNIQUEMENT en JSON:
{
  "score": 8,
  "reason": "Excellente adéquation : transformation digitale, budget adapté, région prioritaire"
}
```

**Seuil** : Score ≥ 6 pour passer au step suivant

**Input** :
```typescript
{
  keywordMatched: AO[],
  client: Client
}
```

**Output** :
```typescript
{
  relevant: AO[],  // AO avec score ≥ 6
  client: Client
}
```

**AO Enrichi** :
```typescript
{
  ...ao,
  semanticScore: 8,
  semanticReason: "Excellente adéquation : transformation digitale, budget adapté, région prioritaire"
}
```

**Logs** :
```
✅ Analyse sémantique (boampSemanticAnalyzer): 150/644 AO
```

---

### Step 6 : Feasibility Analysis (Agent IA)

**Fichier** : `feasibilityAnalysisStep`  
**Agent** : `boampFeasibilityAnalyzer`

**Fonction** :
- Analyse la **faisabilité** de répondre à l'AO
- Évalue capacité financière, technique, timing
- Identifie les blockers potentiels
- Niveau de confiance : high | medium | low

**Prompt IA** :
```
Profil client:
- CA annuel: 5 000 000€
- Effectif: 50 personnes
- Années d'expérience: 10
- Références similaires: 25 projets
- Budget minimum ciblé: 50 000€
- Régions d'intervention: Île-de-France, Auvergne-Rhône-Alpes

Appel d'offres:
- Titre: Accompagnement transformation digitale
- Budget: 75 000€
- Deadline: 2025-01-15 (25 jours restants)
- Région: Île-de-France
- Procédure: Ouverte
- Critères attribution: 60% technique, 40% prix

Question: Ce client peut-il répondre à cet AO ?

Évalue:
1. Financial: Le budget est-il dans les capacités du client ?
2. Technical: Le client a-t-il les compétences requises ?
3. Timing: Le délai est-il suffisant pour préparer une réponse de qualité ?

Réponds UNIQUEMENT en JSON:
{
  "financial": true,
  "technical": true,
  "timing": true,
  "blockers": [],
  "confidence": "high"
}
```

**Seuil** : `isFeasible = financial && technical && timing`

**Input** :
```typescript
{
  relevant: AO[],
  client: Client
}
```

**Output** :
```typescript
{
  feasible: AO[],  // AO faisables
  client: Client
}
```

**AO Enrichi** :
```typescript
{
  ...ao,
  feasibility: {
    financial: true,
    technical: true,
    timing: true,
    blockers: [],
    confidence: 'high'
  },
  isFeasible: true
}
```

**Logs** :
```
✅ Analyse faisabilité (boampFeasibilityAnalyzer): 120/150 AO
```

---

### Step 7 : Scoring

**Fichier** : `scoringStep`

**Fonction** :
- Calcule un score final (0-100)
- Détermine la priorité (HIGH, MEDIUM, LOW)

**Formule** :
```typescript
finalScore = (
  keywordScore * 20 +      // 20 points max
  semanticScore * 5 +      // 50 points max (score 0-10)
  (isFeasible ? 30 : 0)    // 30 points bonus si faisable
);

priority = 
  finalScore >= 80 ? 'HIGH' :
  finalScore >= 60 ? 'MEDIUM' :
  'LOW';
```

**Input** :
```typescript
{
  feasible: AO[],
  client: Client
}
```

**Output** :
```typescript
{
  scored: AO[],  // AO avec score final et priorité
  client: Client
}
```

**AO Enrichi** :
```typescript
{
  ...ao,
  finalScore: 83,
  priority: 'HIGH'
}
```

**Logs** :
```
✅ Scoring: 50 HIGH, 60 MEDIUM
```

---

### Step 8 : Save Results

**Fichier** : `saveResultsStep`

**Fonction** :
- Sauvegarde les AO HIGH et MEDIUM dans Supabase
- Gère l'historique des rectificatifs
- Upsert sur `source_id` (évite les doublons)

**Input** :
```typescript
{
  scored: AO[],
  client: Client
}
```

**Output** :
```typescript
{
  saved: number,   // Nombre d'AO sauvegardés
  high: number,    // Nombre HIGH
  medium: number,  // Nombre MEDIUM
  low: number      // Nombre LOW
}
```

**Champs Sauvegardés** :
```typescript
{
  // Identifiants
  source: 'BOAMP',
  source_id: 'BOAMP-123',
  
  // Contenu
  title: '...',
  description: '...',
  keywords: [...],
  
  // Acheteur
  acheteur: '...',
  acheteur_email: '...',
  
  // Budget & Dates
  budget_max: 75000,
  deadline: '2025-01-15',
  publication_date: '2025-12-20',
  
  // Classification
  type_marche: 'SERVICES',
  region: 'Île-de-France',
  
  // Analyse keywords
  keyword_score: 0.65,
  matched_keywords: [...],
  
  // Analyse sémantique
  semantic_score: 8,
  semantic_reason: '...',
  
  // Analyse faisabilité
  feasibility: {...},
  
  // Scoring final
  final_score: 83,
  priority: 'HIGH',
  
  // Métadonnées
  client_id: 'balthazar',
  status: 'analyzed',
  analyzed_at: '2025-12-20T10:00:00Z',
  
  // Rectificatifs
  is_rectified: false,
  rectification_count: 0,
  
  // Backup
  raw_json: {...}
}
```

**Logs** :
```
✅ Sauvegarde: 110 AO (50 HIGH, 60 MEDIUM, 0 LOW)
```

---

## 🤖 Agents IA

### Agent 1 : boampSemanticAnalyzer

**Fichier** : `src/mastra/agents/boamp-semantic-analyzer.ts`

**Rôle** : Analyser la pertinence métier

**Modèle** : OpenAI GPT-4

**Prompt Système** :
```
Tu es un expert en analyse d'appels d'offres publics français.
Ta mission : évaluer la pertinence d'un AO pour un cabinet de conseil.

Critères d'évaluation:
- Adéquation secteur et expertise
- Compatibilité budget
- Localisation géographique
- Type de procédure
- Signaux métier détectés

Réponds toujours en JSON avec score (0-10) et raison.
```

---

### Agent 2 : boampFeasibilityAnalyzer

**Fichier** : `src/mastra/agents/boamp-feasibility-analyzer.ts`

**Rôle** : Analyser la faisabilité

**Modèle** : OpenAI GPT-4

**Prompt Système** :
```
Tu es un expert en évaluation de capacité à répondre aux appels d'offres.
Ta mission : déterminer si un cabinet peut répondre à un AO.

Critères d'évaluation:
- Financial: Budget dans les capacités ?
- Technical: Compétences requises disponibles ?
- Timing: Délai suffisant pour réponse de qualité ?

Identifie les blockers potentiels.
Réponds toujours en JSON structuré.
```

---

## 📊 Métriques et Résultats

### Taux de Conversion Typiques

```
650 AO récupérés (BOAMP)
  ↓
645 AO actifs (5 annulations)
  ↓
644 AO à analyser (1 rectif substantiel)
  ↓
644 AO avec pré-score (tous passent)
  ↓
150 AO pertinents (23% - score ≥ 6)
  ↓
120 AO faisables (18% - feasibility OK)
  ↓
110 AO sauvegardés (17% - HIGH + MEDIUM)
  ↓
50 HIGH (8%), 60 MEDIUM (9%)
```

### Temps d'Exécution

| Step | Durée | Coût LLM |
|------|-------|----------|
| Fetch | 5-10s | 0€ |
| Cancellations | < 1s | 0€ |
| Rectifications | 1-2s | 0€ |
| Keywords | 1-2s | 0€ |
| Semantic (150 AO) | 30-60s | ~0.50€ |
| Feasibility (120 AO) | 30-60s | ~0.40€ |
| Scoring | < 1s | 0€ |
| Save | 2-5s | 0€ |
| **TOTAL** | **~2-3 min** | **~1€/jour** |

---

## 🎯 Garanties

| Propriété | Garantie |
|-----------|----------|
| **Exhaustivité** | ✅ 100% des AO analysés |
| **Zéro faux négatif** | ✅ Tous les AO passent le pré-scoring |
| **Analyse IA** | ✅ Évaluation contextuelle (pas binaire) |
| **Coût optimisé** | ✅ ~1€/jour (pré-filtrage intelligent) |
| **Traçabilité** | ✅ Logs complets + historique DB |

---

## 🚀 Exécution

### Mastra Studio

```
http://localhost:3000
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

// Utiliser l'API Mastra : createRunAsync() + start()
const run = await workflow.createRunAsync();
const result = await run.start({
  inputData: {
    clientId: 'balthazar',
    since: '2025-12-20' // Optionnel
  }
});

console.log(`${result.saved} AO analysés`);
console.log(`${result.high} HIGH, ${result.medium} MEDIUM`);
```

---

**Workflow production-grade avec analyse IA contextuelle.** 🚀

