# 🔗 Intégration du boampAgent dans le Workflow

Ce document explique comment le `boampAgent` s'intègre dans le workflow `ao-veille.ts` et comment l'utiliser de manière autonome.

## 📊 Architecture du Système

```
┌─────────────────────────────────────────────────────────────┐
│                    WORKFLOW ao-veille.ts                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Collecte + Pré-qualification (rules-based)        │
│  Tool: boampFetcherTool                                     │
│  - Fetch BOAMP API                                          │
│  - Filtrage basique (budget, deadline, région, état)       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2a: Matching Mots-clés (rules-based)                 │
│  - Compte les mots-clés matchés                            │
│  - Seuil: 30% minimum                                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2b: Analyse Sémantique (LLM - boampAgent)           │
│  Agent: balthazar (alias de boampAgent)                    │
│  - Analyse la pertinence sémantique                        │
│  - Score 0-10 avec justification                           │
│  - Prend en compte le type de procédure                    │
│  - Seuil: score ≥ 6                                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Analyse Faisabilité (LLM - boampAgent)           │
│  Agent: balthazar (alias de boampAgent)                    │
│  - Vérifie critères financiers                            │
│  - Vérifie critères techniques                            │
│  - Vérifie délai suffisant                                │
│  - Identifie les blockers                                 │
│  - Garde seulement les AO faisables                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: Scoring + Priorisation (rules-based)             │
│  - Calcul score global (0-10)                              │
│  - Priorisation: HIGH / MEDIUM / LOW                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 5: Sauvegarde Résultats                             │
│  - Upsert dans Supabase                                    │
│  - Enrichissement avec métadonnées                         │
└─────────────────────────────────────────────────────────────┘
```

## 🔍 Utilisation dans le Workflow

### Step 2b : Analyse Sémantique

**Fichier** : `src/mastra/workflows/ao-veille.ts` (lignes 214-297)

**Code actuel** :
```typescript
const semanticAnalysisStep = createStep({
  id: 'semantic-analysis',
  execute: async ({ inputData, mastra }) => {
    const { keywordMatched, client } = inputData;
    
    // Récupération de l'agent via l'alias 'balthazar'
    const balthazarAgent = mastra?.getAgent('balthazar');
    
    const semanticAnalyzed = await Promise.all(
      keywordMatched.map(async (ao) => {
        const analysis = await balthazarAgent.generate([
          {
            role: 'user',
            content: `
              Profil client: ${JSON.stringify(client.profile, null, 2)}
              Appel d'offres: ...
              Question: Sur une échelle de 0 à 10, quelle est la pertinence ?
              Réponds UNIQUEMENT en JSON: { "score": <number>, "reason": "<string>" }
            `
          }
        ]);
        
        const result = JSON.parse(analysis.text);
        return { ...ao, semanticScore: result.score, semanticReason: result.reason };
      })
    );
    
    // Garde seulement score ≥ 6
    const relevant = semanticAnalyzed.filter(ao => ao.semanticScore >= 6);
    return { relevant, client };
  }
});
```

**Équivalent avec la fonction `analyzeSemanticRelevance`** :
```typescript
import { analyzeSemanticRelevance } from '../agents/boamp-agent';

const semanticAnalyzed = await Promise.all(
  keywordMatched.map(async (ao) => {
    const result = await analyzeSemanticRelevance(ao, client);
    return { 
      ...ao, 
      semanticScore: result.score, 
      semanticReason: result.reason 
    };
  })
);
```

### Step 3 : Analyse Faisabilité

**Fichier** : `src/mastra/workflows/ao-veille.ts` (lignes 299-421)

**Code actuel** :
```typescript
const feasibilityAnalysisStep = createStep({
  id: 'feasibility-analysis',
  execute: async ({ inputData, mastra }) => {
    const { relevant, client } = inputData;
    
    const balthazarAgent = mastra?.getAgent('balthazar');
    
    const feasibilityAnalyzed = await Promise.all(
      relevant.map(async (ao) => {
        const analysis = await balthazarAgent.generate([
          {
            role: 'user',
            content: `
              Profil client: ...
              Critères AO: ...
              Questions: 1. Critères financiers ? 2. Critères techniques ? 3. Délai réaliste ?
              Réponds UNIQUEMENT en JSON: { "financial": <bool>, "technical": <bool>, ... }
            `
          }
        ]);
        
        const feasibility = JSON.parse(analysis.text);
        return { ...ao, feasibility, isFeasible: ... };
      })
    );
    
    const feasible = feasibilityAnalyzed.filter(ao => ao.isFeasible);
    return { feasible, client };
  }
});
```

**Équivalent avec la fonction `analyzeFeasibility`** :
```typescript
import { analyzeFeasibility } from '../agents/boamp-agent';

const feasibilityAnalyzed = await Promise.all(
  relevant.map(async (ao) => {
    const result = await analyzeFeasibility(ao, client);
    return { 
      ...ao, 
      feasibility: {
        financial: result.financial,
        technical: result.technical,
        timing: result.timing,
        blockers: result.blockers,
        confidence: result.confidence
      },
      isFeasible: result.financial && result.technical && result.timing,
      warnings: result.warnings,
      daysRemaining: result.daysRemaining
    };
  })
);
```

## 🚀 Utilisation Autonome (Hors Workflow)

Le `boampAgent` peut être utilisé indépendamment du workflow pour des analyses ponctuelles.

### Exemple 1 : Analyse Rapide d'un AO

```typescript
import { analyzeAO } from './agents/boamp-agent';
import { boampFetcherTool } from './tools/boamp-fetcher';

// 1. Récupérer un AO spécifique
const boampData = await boampFetcherTool.execute({
  context: {
    since: '2025-12-01',
    typeMarche: 'SERVICES',
    limit: 1
  }
});

const ao = boampData.records[0];

// 2. Définir le profil client
const client = { /* ... */ };

// 3. Analyser
const report = await analyzeAO(ao, client);

console.log(`Recommandation: ${report.final_recommendation}`);
console.log(`Pertinence: ${report.semantic_analysis.score}/10`);
```

### Exemple 2 : Analyse Batch avec Filtrage Personnalisé

```typescript
import { analyzeAO } from './agents/boamp-agent';
import { boampFetcherTool } from './tools/boamp-fetcher';

// 1. Récupérer plusieurs AO
const boampData = await boampFetcherTool.execute({
  context: {
    since: '2025-12-01',
    typeMarche: 'SERVICES',
    limit: 50
  }
});

// 2. Filtrage personnalisé (exemple: seulement les AO > 100k€)
const filteredAOs = boampData.records.filter(ao => 
  (ao.budget_max || 0) > 100000
);

// 3. Analyser en parallèle
const reports = await Promise.all(
  filteredAOs.map(ao => analyzeAO(ao, client))
);

// 4. Filtrer les recommandations GO
const goReports = reports.filter(r => r.final_recommendation === 'GO');

console.log(`${goReports.length} AO recommandés sur ${reports.length} analysés`);
```

### Exemple 3 : Analyse Progressive (Optimisation des Coûts)

Pour économiser les appels LLM, vous pouvez analyser progressivement :

```typescript
import { 
  analyzeSemanticRelevance, 
  analyzeFeasibility, 
  analyzeCompetitiveness 
} from './agents/boamp-agent';

// 1. D'abord, analyse sémantique (rapide)
const semanticResult = await analyzeSemanticRelevance(ao, client);

if (semanticResult.score < 6) {
  console.log('AO non pertinent, arrêt de l\'analyse');
  return;
}

// 2. Ensuite, faisabilité (plus détaillé)
const feasibilityResult = await analyzeFeasibility(ao, client);

if (!feasibilityResult.financial || !feasibilityResult.technical || !feasibilityResult.timing) {
  console.log('AO non faisable, arrêt de l\'analyse');
  return;
}

// 3. Enfin, compétitivité (analyse approfondie)
const competitivenessResult = await analyzeCompetitiveness(
  ao, 
  client, 
  semanticResult.score, 
  feasibilityResult
);

console.log(`Recommandation finale: ${competitivenessResult.recommendation}`);
```

## 🔄 Migration du Workflow (Optionnel)

Si vous souhaitez refactoriser le workflow pour utiliser directement les fonctions du `boampAgent` :

### Avant (Step 2b)
```typescript
const analysis = await balthazarAgent.generate([
  {
    role: 'user',
    content: `...`
  }
]);
const result = JSON.parse(analysis.text);
```

### Après (Step 2b)
```typescript
import { analyzeSemanticRelevance } from '../agents/boamp-agent';

const result = await analyzeSemanticRelevance(ao, client);
```

**Avantages** :
- Code plus lisible et maintenable
- Réutilisation des fonctions dans d'autres contextes
- Meilleure gestion des erreurs
- Tests unitaires plus faciles

**Inconvénients** :
- Nécessite de modifier le workflow existant
- Perte de la flexibilité du prompt inline

## 🎯 Recommandations d'Utilisation

### Pour le Workflow Complet
✅ **Utilisez l'alias `balthazar`** (configuration actuelle)
- Pas de modification du workflow nécessaire
- Fonctionne immédiatement

### Pour des Analyses Ponctuelles
✅ **Utilisez les fonctions exportées**
- `analyzeAO()` pour une analyse complète
- `analyzeSemanticRelevance()` pour un filtrage rapide
- `analyzeFeasibility()` pour vérifier les critères
- `analyzeCompetitiveness()` pour une analyse approfondie

### Pour Optimiser les Coûts LLM
✅ **Analysez progressivement**
1. Sémantique (rapide, peu coûteux)
2. Faisabilité (si pertinent)
3. Compétitivité (si faisable)

### Pour des Analyses Personnalisées
✅ **Utilisez l'agent directement**
```typescript
import { boampAgent } from './agents/boamp-agent';

const response = await boampAgent.generate([
  {
    role: 'user',
    content: 'Votre prompt personnalisé...'
  }
]);
```

## 📊 Comparaison des Approches

| Approche | Avantages | Inconvénients | Cas d'usage |
|----------|-----------|---------------|-------------|
| **Workflow complet** | Automatisé, complet, sauvegarde en DB | Moins flexible, analyse tous les AO | Production, veille quotidienne |
| **Fonctions exportées** | Réutilisable, testable, modulaire | Nécessite plus de code | Analyses ponctuelles, intégrations |
| **Agent direct** | Maximum de flexibilité | Nécessite de gérer les prompts | Expérimentations, cas spéciaux |
| **Analyse progressive** | Optimise les coûts LLM | Plus de code, plus complexe | Gros volumes, budget limité |

## 🧪 Tests d'Intégration

Pour vérifier que l'intégration fonctionne :

```bash
# 1. Démarrer le serveur Mastra
npm run dev

# 2. Tester le workflow complet
curl -X POST http://localhost:4111/workflows/ao-veille-workflow/execute \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "client-001",
    "since": "2025-12-01"
  }'

# 3. Vérifier les logs
# Vous devriez voir :
# ✅ Pré-qualification: X/Y AO
# ✅ Keyword matching: X/Y AO
# ✅ Analyse sémantique: X/Y AO (appels au boampAgent)
# ✅ Analyse faisabilité: X/Y AO (appels au boampAgent)
# ✅ Scoring: X HIGH, Y MEDIUM
# ✅ Sauvegarde: Z AO
```

## 📝 Checklist de Vérification

- [x] L'alias `balthazar` est configuré dans `/src/mastra/index.ts`
- [x] Le workflow `ao-veille.ts` utilise `mastra?.getAgent('balthazar')`
- [x] Les fonctions `analyzeSemanticRelevance` et `analyzeFeasibility` sont exportées
- [x] La documentation d'intégration est complète
- [ ] Tests d'intégration avec des données réelles
- [ ] Mesure des performances (temps d'exécution, coût LLM)
- [ ] Optimisation des prompts si nécessaire

## 🎉 Conclusion

Le `boampAgent` s'intègre parfaitement dans le système existant grâce à l'alias `balthazar`. Vous pouvez :
- **Continuer à utiliser le workflow** tel quel (recommandé pour la production)
- **Utiliser les fonctions exportées** pour des analyses ponctuelles
- **Combiner les deux approches** selon vos besoins

Pour toute question ou amélioration, consultez la documentation complète dans `/src/mastra/agents/README.md`.


