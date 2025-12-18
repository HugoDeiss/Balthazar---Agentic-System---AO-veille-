# Balthazar - Système Agentique de Veille AO

Système agentique de veille et d'analyse des appels d'offres publics pour Balthazar Consulting (Colombus Group).

## 🎯 Objectif

Ce système permet aux équipes de Balthazar Consulting de :
- **Identifier** automatiquement les appels d'offres pertinents sur les plateformes de marchés publics
- **Analyser** chaque opportunité selon les critères du cabinet
- **Recommander** les marchés à prioriser (GO/NO GO)
- **Générer** des rapports de synthèse pour la prise de décision

## 🏗️ Architecture

Le système est construit avec [Mastra](https://mastra.ai), un framework TypeScript pour créer des applications AI agentiques.

```
src/mastra/
├── index.ts              # Configuration principale Mastra
├── agents/               # Agents IA
│   ├── tender-monitor-agent.ts    # Agent de veille
│   └── tender-analyst-agent.ts    # Agent d'analyse
├── tools/                # Outils des agents
│   ├── tender-search-tool.ts      # Recherche d'AO
│   └── tender-analysis-tool.ts    # Analyse d'AO
└── workflows/            # Workflows orchestrés
    └── tender-processing-workflow.ts  # Pipeline complet
```

## 🚀 Installation

### Prérequis

- Node.js v20 ou supérieur
- npm, pnpm, yarn ou bun
- Clé API OpenAI

### Étapes

1. **Cloner le repository**
```bash
git clone <repository-url>
cd Balthazar---Agentic-System---AO-veille-
```

2. **Installer les dépendances**
```bash
npm install
# ou
pnpm install
```

3. **Configurer les variables d'environnement**
```bash
cp .env.example .env
# Éditer .env et ajouter votre clé OPENAI_API_KEY
```

4. **Lancer le serveur de développement**
```bash
npm run dev
```

5. **Accéder à Mastra Studio**
Ouvrir http://localhost:4111 dans votre navigateur

## 📦 Agents

### Tender Monitor Agent
Agent de veille qui recherche les appels d'offres selon les critères définis :
- Mots-clés pertinents pour le conseil
- Filtrage par budget, région, catégorie
- Identification des opportunités prioritaires

### Tender Analyst Agent
Agent d'analyse qui évalue chaque opportunité :
- Score de pertinence (0-100)
- Analyse des exigences et compétences requises
- Recommandation GO / NO GO / À APPROFONDIR
- Identification des risques et points forts

## 🔧 Outils

### tender-search
Recherche des appels d'offres publics avec filtres :
- `keywords`: Mots-clés de recherche
- `category`: Catégorie de marché
- `minBudget` / `maxBudget`: Fourchette budgétaire
- `region`: Zone géographique
- `publicationDateFrom` / `deadlineFrom`: Filtres temporels

### tender-analysis
Analyse détaillée d'un appel d'offres :
- Extraction des exigences clés
- Évaluation de la pertinence
- Estimation de l'effort
- Identification des risques

## 🔄 Workflow

Le workflow `tender-processing-workflow` orchestre le pipeline complet :

1. **Recherche** → Collecte des AO selon les critères
2. **Analyse** → Évaluation de chaque opportunité
3. **Rapport** → Génération du rapport de synthèse

### Utilisation via API

```bash
# Déclencher le workflow
curl -X POST http://localhost:4111/api/workflows/tenderProcessingWorkflow/start \
  -H "Content-Type: application/json" \
  -d '{
    "inputData": {
      "keywords": ["conseil", "stratégie", "transformation digitale"],
      "category": "services",
      "minBudget": 50000,
      "region": "Île-de-France"
    }
  }'
```

## 🧪 Test avec Studio

Mastra Studio permet de tester les agents et workflows :

1. Lancer `npm run dev`
2. Ouvrir http://localhost:4111
3. Sélectionner un agent ou workflow
4. Interagir via l'interface de chat

### Exemples de prompts

**Pour l'agent de veille :**
```
Recherche les appels d'offres de conseil en stratégie avec un budget supérieur à 100 000€ en Île-de-France
```

**Pour l'agent d'analyse :**
```
Analyse cet appel d'offres : Mission d'audit organisationnel pour la Région Bretagne, budget 80 000€, date limite 15/02/2025
```

## 📝 Configuration

### Variables d'environnement

| Variable | Description | Requis |
|----------|-------------|--------|
| `OPENAI_API_KEY` | Clé API OpenAI | ✅ |
| `PORT` | Port du serveur (défaut: 4111) | ❌ |

### Personnalisation des agents

Les instructions des agents peuvent être modifiées dans les fichiers correspondants pour adapter :
- Les critères de sélection
- Les domaines d'expertise
- Les seuils de recommandation

## 🔜 Évolutions prévues

- [ ] Intégration avec les API des plateformes de marchés publics (BOAMP, JOUE, etc.)
- [ ] Stockage des analyses en base de données
- [ ] Notifications automatiques pour les nouvelles opportunités
- [ ] Interface web dédiée
- [ ] Export des rapports en PDF

## 📄 Licence

Projet interne - Balthazar Consulting / Colombus Group
