# 🚀 Quick Start - boampAgent

Guide de démarrage rapide pour utiliser le `boampAgent` et analyser les appels d'offres BOAMP.

## ⚡ Installation Express

```bash
# 1. Installer les dépendances (si pas déjà fait)
npm install

# 2. Configurer les variables d'environnement
cp .env.example .env

# Éditer .env et ajouter :
# ANTHROPIC_API_KEY=sk-ant-...
# SUPABASE_URL=https://xxx.supabase.co
# SUPABASE_SERVICE_KEY=eyJ...
```

## 🎯 Utilisation Rapide

### Option 1 : Workflow Complet (Recommandé)

Analyse automatique de tous les AO depuis une date :

```bash
# Démarrer le serveur
npm run dev

# Dans un autre terminal, lancer le workflow
curl -X POST http://localhost:4111/workflows/ao-veille-workflow/execute \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "client-001",
    "since": "2025-12-01"
  }'
```

**Résultat** :
```json
{
  "saved": 15,
  "high": 5,
  "medium": 7,
  "low": 3
}
```

Les AO analysés sont automatiquement sauvegardés dans Supabase avec :
- Score de pertinence sémantique
- Analyse de faisabilité
- Score final et priorisation

### Option 2 : Analyse Ponctuelle

Analyser un AO spécifique :

```typescript
import { analyzeAO } from './src/mastra/agents/boamp-agent';

// Définir l'AO et le client
const ao = { /* ... */ };
const client = { /* ... */ };

// Analyser
const report = await analyzeAO(ao, client);

console.log(`Recommandation: ${report.final_recommendation}`);
console.log(`Pertinence: ${report.semantic_analysis.score}/10`);
console.log(`Faisable: ${report.is_feasible ? 'OUI' : 'NON'}`);
```

### Option 3 : Exemples Interactifs

Tester toutes les fonctionnalités avec des données de démonstration :

```bash
npx tsx src/mastra/agents/boamp-agent.example.ts
```

**Exemples inclus** :
1. Analyse sémantique seule
2. Analyse de faisabilité seule
3. Analyse de compétitivité seule
4. Analyse complète
5. AO non faisable
6. Analyse batch

## 📊 Fonctionnalités Principales

### 1. Analyse Sémantique
```typescript
import { analyzeSemanticRelevance } from './src/mastra/agents/boamp-agent';

const result = await analyzeSemanticRelevance(ao, client);
// { score: 8.5, reason: "Forte correspondance..." }
```

### 2. Analyse de Faisabilité
```typescript
import { analyzeFeasibility } from './src/mastra/agents/boamp-agent';

const result = await analyzeFeasibility(ao, client);
// { financial: true, technical: true, timing: true, ... }
```

### 3. Analyse de Compétitivité
```typescript
import { analyzeCompetitiveness } from './src/mastra/agents/boamp-agent';

const result = await analyzeCompetitiveness(ao, client, semanticScore, feasibility);
// { competitiveness_score: 7.5, recommendation: "GO", ... }
```

### 4. Analyse Complète (Tout-en-un)
```typescript
import { analyzeAO } from './src/mastra/agents/boamp-agent';

const report = await analyzeAO(ao, client);
// Rapport complet avec toutes les analyses
```

## 🎨 Exemple Complet

```typescript
import { boampFetcherTool } from './src/mastra/tools/boamp-fetcher';
import { analyzeAO } from './src/mastra/agents/boamp-agent';

// 1. Récupérer les AO depuis le BOAMP
const boampData = await boampFetcherTool.execute({
  context: {
    since: '2025-12-01',
    typeMarche: 'SERVICES',
    limit: 10
  }
});

// 2. Définir le profil client
const client = {
  id: 'client-001',
  name: 'Digital Solutions SARL',
  email: 'contact@digitalsolutions.fr',
  preferences: { typeMarche: 'SERVICES' },
  criteria: { minBudget: 50000, regions: ['75', '92'] },
  keywords: ['développement web', 'application mobile', 'cloud'],
  profile: { /* ... */ },
  financial: {
    revenue: 1200000,
    employees: 15,
    yearsInBusiness: 7
  },
  technical: {
    references: 12
  }
};

// 3. Analyser chaque AO
for (const ao of boampData.records) {
  const report = await analyzeAO(ao, client);
  
  console.log(`\n📄 ${report.ao_title}`);
  console.log(`   Pertinence: ${report.semantic_analysis.score}/10`);
  console.log(`   Faisable: ${report.is_feasible ? '✅' : '❌'}`);
  console.log(`   Recommandation: ${report.final_recommendation}`);
  
  if (report.competitiveness_analysis) {
    console.log(`   Compétitivité: ${report.competitiveness_analysis.competitiveness_score}/10`);
    console.log(`   Conseil: ${report.competitiveness_analysis.strategic_advice}`);
  }
}
```

## 🔧 Configuration Minimale

### Structure du Client
```typescript
const client = {
  id: string,                    // ID unique
  name: string,                  // Nom de l'entreprise
  email: string,                 // Email de contact
  preferences: {
    typeMarche: 'SERVICES' | 'FOURNITURES' | 'TRAVAUX'
  },
  criteria: {
    minBudget: number,           // Budget minimum
    regions: string[]            // Codes départements (optionnel)
  },
  keywords: string[],            // Mots-clés métier
  profile: any,                  // Description détaillée
  financial: {
    revenue: number,             // CA annuel
    employees: number,           // Effectif
    yearsInBusiness: number      // Années d'expérience
  },
  technical: {
    references: number           // Nombre de références
  }
};
```

### Structure de l'AO (simplifié)
```typescript
const ao = {
  source: 'BOAMP',
  source_id: string,             // ID unique
  title: string,                 // Titre de l'AO
  description: string,           // Description
  keywords: string[],            // Mots-clés
  acheteur: string,              // Nom de l'acheteur
  budget_max: number,            // Budget max
  deadline: string,              // Date limite (ISO 8601)
  type_marche: string,           // Type de marché
  region: string,                // Code département
  procedure_libelle: string,     // Type de procédure
  raw_json: any                  // Données brutes BOAMP
};
```

## 📈 Optimisation des Coûts

Pour économiser les appels LLM, analysez progressivement :

```typescript
// 1. D'abord, sémantique (rapide, peu coûteux)
const semanticResult = await analyzeSemanticRelevance(ao, client);
if (semanticResult.score < 6) {
  console.log('AO non pertinent, arrêt');
  return;
}

// 2. Ensuite, faisabilité (plus détaillé)
const feasibilityResult = await analyzeFeasibility(ao, client);
if (!feasibilityResult.financial || !feasibilityResult.technical) {
  console.log('AO non faisable, arrêt');
  return;
}

// 3. Enfin, compétitivité (analyse approfondie)
const competitivenessResult = await analyzeCompetitiveness(
  ao, client, semanticResult.score, feasibilityResult
);
console.log(`Recommandation: ${competitivenessResult.recommendation}`);
```

## 🎯 Cas d'Usage Courants

### 1. Veille Quotidienne Automatique
```bash
# Cron job (tous les jours à 9h)
0 9 * * * curl -X POST http://localhost:4111/workflows/ao-veille-workflow/execute \
  -H "Content-Type: application/json" \
  -d '{"clientId": "client-001", "since": "$(date -d '1 day ago' +%Y-%m-%d)"}'
```

### 2. Analyse Ponctuelle d'un AO
```typescript
// Récupérer un AO spécifique par son ID
const ao = await fetchAOById('25-12345');
const report = await analyzeAO(ao, client);
```

### 3. Analyse Batch de Plusieurs Clients
```typescript
const clients = [client1, client2, client3];
const ao = await fetchAOById('25-12345');

const reports = await Promise.all(
  clients.map(client => analyzeAO(ao, client))
);

// Trouver le client le plus pertinent
const bestMatch = reports.reduce((best, current) => 
  current.semantic_analysis.score > best.semantic_analysis.score ? current : best
);
```

### 4. Filtrage Avancé
```typescript
// Analyser seulement les AO > 100k€ en Île-de-France
const boampData = await boampFetcherTool.execute({
  context: {
    since: '2025-12-01',
    typeMarche: 'SERVICES',
    limit: 100
  }
});

const filteredAOs = boampData.records.filter(ao => 
  (ao.budget_max || 0) > 100000 &&
  ['75', '92', '93', '94', '95'].includes(ao.region)
);

const reports = await Promise.all(
  filteredAOs.map(ao => analyzeAO(ao, client))
);
```

## 🐛 Dépannage

### Erreur : "Agent balthazar not found"
**Solution** : Vérifier que l'alias est configuré dans `src/mastra/index.ts` :
```typescript
agents: {
  boampAgent,
  balthazar: boampAgent,  // Alias pour le workflow
}
```

### Erreur : "ANTHROPIC_API_KEY not found"
**Solution** : Ajouter la clé API dans `.env` :
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

### Erreur : "Supabase connection failed"
**Solution** : Vérifier les variables d'environnement :
```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

### Performances lentes
**Solution** : Utiliser l'analyse progressive pour réduire les appels LLM :
```typescript
// Filtrer d'abord avec sémantique, puis faisabilité
const semanticResult = await analyzeSemanticRelevance(ao, client);
if (semanticResult.score >= 6) {
  const feasibilityResult = await analyzeFeasibility(ao, client);
  // ...
}
```

## 📚 Ressources

- **Documentation complète** : `src/mastra/agents/README.md`
- **Guide d'intégration** : `src/mastra/agents/INTEGRATION.md`
- **Exemples** : `src/mastra/agents/boamp-agent.example.ts`
- **Résumé** : `BOAMP_AGENT_SUMMARY.md`

## 💡 Conseils

1. **Testez d'abord avec les exemples** : `npx tsx src/mastra/agents/boamp-agent.example.ts`
2. **Utilisez le workflow pour la production** : Plus simple et automatisé
3. **Optimisez les coûts** : Filtrez avec les règles avant d'appeler le LLM
4. **Sauvegardez les résultats** : Utilisez Supabase pour éviter les ré-analyses
5. **Ajustez les seuils** : Modifiez les scores minimaux selon vos besoins

## 🎉 Prêt à Commencer !

```bash
# 1. Installer et configurer
npm install
cp .env.example .env
# Éditer .env avec vos clés API

# 2. Tester les exemples
npx tsx src/mastra/agents/boamp-agent.example.ts

# 3. Lancer le workflow
npm run dev
curl -X POST http://localhost:4111/workflows/ao-veille-workflow/execute \
  -H "Content-Type: application/json" \
  -d '{"clientId": "client-001", "since": "2025-12-01"}'
```

**Besoin d'aide ?** Consultez la documentation complète dans `src/mastra/agents/README.md` 📖

