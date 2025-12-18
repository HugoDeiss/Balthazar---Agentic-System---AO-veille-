# Agents Balthazar - Documentation

Ce dossier contient les agents IA utilisés dans le système de veille des appels d'offres Balthazar.

## 📋 Liste des Agents

### 1. `boampAgent` - Agent d'Analyse BOAMP

**Rôle** : Expert en analyse d'appels d'offres publics français (BOAMP)

**Spécialisation** : Analyse approfondie des appels d'offres récupérés via le workflow `ao-veille.ts`

#### Fonctionnalités

##### 🔍 Analyse Sémantique
```typescript
import { analyzeSemanticRelevance } from './boamp-agent';

const result = await analyzeSemanticRelevance(ao, client);
// Retourne: { score: 8.5, reason: "Forte correspondance avec le profil..." }
```

Évalue la pertinence d'un AO par rapport au profil client en prenant en compte :
- Correspondance entre besoins de l'acheteur et compétences du client
- Type de procédure (ouvert, restreint, dialogue compétitif)
- Accessibilité de l'AO

**Output** :
- `score` (0-10) : Score de pertinence
- `reason` : Justification en 1-2 phrases

##### ✅ Analyse de Faisabilité
```typescript
import { analyzeFeasibility } from './boamp-agent';

const result = await analyzeFeasibility(ao, client);
// Retourne: { financial: true, technical: true, timing: true, blockers: [], confidence: "high" }
```

Vérifie si le client peut répondre à l'AO :
- **Critères financiers** : CA minimum, garanties
- **Critères techniques** : Références, certifications, effectif
- **Délai** : Temps disponible pour préparer une réponse de qualité
- **Blockers** : Obstacles identifiés

**Output** :
- `financial` : Respect des critères financiers
- `technical` : Respect des critères techniques
- `timing` : Délai suffisant
- `blockers` : Liste des obstacles
- `confidence` : Niveau de confiance ("high", "medium", "low")
- `warnings` : Alertes (correctifs, renouvellements)
- `daysRemaining` : Jours restants avant la deadline

##### 🏆 Analyse de Compétitivité
```typescript
import { analyzeCompetitiveness } from './boamp-agent';

const result = await analyzeCompetitiveness(ao, client, semanticScore, feasibility);
// Retourne: { competitiveness_score: 7.5, strengths: [...], weaknesses: [...], recommendation: "GO", strategic_advice: "..." }
```

Évalue les chances de succès :
- Analyse des critères d'attribution (prix vs qualité technique)
- Identification des points forts et faibles
- Recommandation GO/NO-GO/MAYBE
- Conseils stratégiques

**Output** :
- `competitiveness_score` (0-10) : Score de compétitivité
- `strengths` : Liste des points forts
- `weaknesses` : Liste des points faibles
- `recommendation` : "GO" | "NO-GO" | "MAYBE"
- `strategic_advice` : Conseil stratégique

##### 📊 Analyse Complète
```typescript
import { analyzeAO } from './boamp-agent';

const report = await analyzeAO(ao, client);
```

Orchestre les 3 analyses et génère un rapport complet.

**Output** :
```typescript
{
  ao_id: string,
  ao_title: string,
  client_id: string,
  client_name: string,
  semantic_analysis: { score, reason },
  feasibility_analysis: { financial, technical, timing, blockers, confidence, warnings, daysRemaining },
  competitiveness_analysis: { competitiveness_score, strengths, weaknesses, recommendation, strategic_advice } | null,
  is_feasible: boolean,
  final_recommendation: "GO" | "NO-GO" | "MAYBE",
  analyzed_at: string
}
```

#### Types de Procédures Supportées

- **Appel d'offres ouvert** : Accessible à tous, plus facile d'accès
- **Appel d'offres restreint** : Sur présélection, plus compétitif
- **Dialogue compétitif** : Avec phase de négociation, nécessite plus de ressources
- **Marché public simplifié (MPS)** : Procédure allégée, généralement pour petits montants

#### Points de Vigilance

L'agent détecte automatiquement :
- ⚠️ **Correctifs** : AO avec modifications importantes
- ℹ️ **Renouvellements** : Marché renouvelé (peut favoriser le titulaire sortant)
- 🔴 **Délais courts** : < 15 jours = risque de réponse bâclée
- 🟠 **Critères stricts** : CA minimum, certifications obligatoires
- 🟢 **Allotissement** : Possibilité de répondre sur un lot uniquement

#### Configuration

Le `boampAgent` utilise le modèle **Claude 3.5 Sonnet** d'Anthropic pour ses analyses.

```typescript
model: {
  provider: 'ANTHROPIC',
  name: 'claude-3-5-sonnet-20241022',
  toolChoice: 'auto',
}
```

#### Utilisation dans le Workflow

Le `boampAgent` est utilisé dans le workflow `ao-veille.ts` pour :

1. **Analyse sémantique** (Step 2b) : Filtrer les AO pertinents
2. **Analyse de faisabilité** (Step 3) : Vérifier la capacité du client à répondre

**Note** : Le workflow référence actuellement l'agent sous le nom `balthazar`. Il faudra mettre à jour le workflow pour utiliser `boampAgent`.

---

### 2. `tenderMonitorAgent` - Agent de Surveillance

**Rôle** : Surveillance et recherche d'opportunités d'appels d'offres

*(À documenter)*

---

### 3. `tenderAnalystAgent` - Agent d'Analyse

**Rôle** : Analyse des appels d'offres et recommandations

*(À documenter)*

---

## 🚀 Exemple d'Utilisation Complète

```typescript
import { boampAgent, analyzeAO } from './agents/boamp-agent';
import { boampFetcherTool } from './tools/boamp-fetcher';

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
  id: 'client-123',
  name: 'Acme Corp',
  email: 'contact@acme.com',
  preferences: { typeMarche: 'SERVICES' },
  criteria: { minBudget: 50000, regions: ['75', '92'] },
  keywords: ['développement web', 'application mobile', 'cloud'],
  profile: { /* ... */ },
  financial: {
    revenue: 1000000,
    employees: 15,
    yearsInBusiness: 5
  },
  technical: {
    references: 10
  }
};

// 3. Analyser chaque AO
for (const ao of boampData.records) {
  const report = await analyzeAO(ao, client);
  
  console.log(`
    AO: ${report.ao_title}
    Pertinence: ${report.semantic_analysis.score}/10
    Faisabilité: ${report.is_feasible ? 'OUI' : 'NON'}
    Recommandation: ${report.final_recommendation}
  `);
  
  if (report.competitiveness_analysis) {
    console.log(`Conseil: ${report.competitiveness_analysis.strategic_advice}`);
  }
}
```

---

## 📝 Notes de Développement

### TODO
- [ ] Mettre à jour le workflow `ao-veille.ts` pour utiliser `boampAgent` au lieu de `balthazar`
- [ ] Documenter `tenderMonitorAgent` et `tenderAnalystAgent`
- [ ] Ajouter des tests unitaires pour `boampAgent`
- [ ] Implémenter un système de cache pour éviter de ré-analyser les mêmes AO
- [ ] Ajouter des métriques de performance (temps d'analyse, coût LLM)

### Améliorations Futures
- Support de sources supplémentaires (PLACE, AWS, etc.)
- Analyse multi-critères avancée (scoring personnalisé par client)
- Génération automatique de réponses aux AO
- Système de notifications pour les AO prioritaires

