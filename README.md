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
│   ├── tender-analyst-agent.ts    # Agent d'analyse
│   ├── boamp-agent.ts             # 🆕 Agent d'analyse BOAMP
│   ├── boamp-agent.example.ts     # Exemples d'utilisation
│   ├── README.md                  # Documentation des agents
│   ├── INTEGRATION.md             # Guide d'intégration
│   └── index.ts                   # Export des agents
├── tools/                # Outils des agents
│   ├── boamp-fetcher.ts           # 🆕 Récupération BOAMP
│   └── index.ts                   # Export des outils
└── workflows/            # Workflows orchestrés
    ├── ao-veille.ts               # 🆕 Pipeline complet BOAMP
    └── index.ts                   # Export des workflows
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

### 🆕 BOAMP Agent
Agent spécialisé dans l'analyse des appels d'offres BOAMP :
- **Analyse sémantique** : Évalue la pertinence d'un AO (score 0-10)
- **Analyse de faisabilité** : Vérifie les critères financiers, techniques et de timing
- **Analyse de compétitivité** : Évalue les chances de succès et fournit des conseils stratégiques
- **Recommandation finale** : GO / NO-GO / MAYBE avec justifications détaillées

**Fonctionnalités avancées** :
- Détection automatique des correctifs et renouvellements
- Prise en compte du type de procédure (ouvert, restreint, dialogue compétitif)
- Identification des blockers et points de vigilance
- Analyse des critères d'attribution (prix vs qualité technique)

**Documentation complète** : `src/mastra/agents/README.md`

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

### 🆕 boamp-fetcher
Récupération des appels d'offres depuis l'API BOAMP :
- `since`: Date de début (format YYYY-MM-DD)
- `typeMarche`: Type de marché (SERVICES, FOURNITURES, TRAVAUX)
- `limit`: Nombre maximum d'AO à récupérer (1-100)
- `departement`: Code département (optionnel)

**Fonctionnalités** :
- Filtrage automatique des AO annulés et attribués
- Extraction des données enrichies (critères, procédure, acheteur)
- Normalisation des données pour l'analyse
- Support des champs avancés (correctifs, renouvellements)

## 🔄 Workflows

### 🆕 ao-veille-workflow (BOAMP)

Pipeline complet d'analyse des appels d'offres BOAMP :

1. **Collecte + Pré-qualification** → Fetch BOAMP + filtrage basique (budget, deadline, région)
2. **Matching Mots-clés** → Filtrage par mots-clés client (seuil 30%)
3. **Analyse Sémantique** (LLM) → Évaluation de la pertinence (score ≥ 6)
4. **Analyse Faisabilité** (LLM) → Vérification des critères (financier, technique, timing)
5. **Scoring + Priorisation** → Calcul du score global et priorisation (HIGH/MEDIUM/LOW)
6. **Sauvegarde** → Upsert dans Supabase avec enrichissement

**Optimisation des coûts** :
- Étapes 1, 2, 5, 6 : Rules-based (gratuit)
- Étapes 3, 4 : LLM uniquement sur les AO pré-qualifiés

### Utilisation via API

```bash
# Déclencher le workflow BOAMP
curl -X POST http://localhost:4111/workflows/ao-veille-workflow/execute \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "client-001",
    "since": "2025-12-01"
  }'

# Réponse attendue
{
  "saved": 15,
  "high": 5,
  "medium": 7,
  "low": 3
}
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
| `ANTHROPIC_API_KEY` | Clé API Anthropic (pour boampAgent) | ✅ |
| `SUPABASE_URL` | URL de votre projet Supabase | ✅ |
| `SUPABASE_SERVICE_KEY` | Clé service Supabase | ✅ |
| `PORT` | Port du serveur (défaut: 4111) | ❌ |

### Personnalisation des agents

Les instructions des agents peuvent être modifiées dans les fichiers correspondants pour adapter :
- Les critères de sélection
- Les domaines d'expertise
- Les seuils de recommandation

## ✅ Fonctionnalités Implémentées

- [x] Intégration avec l'API BOAMP (boamp-fetcher tool)
- [x] Agent d'analyse BOAMP spécialisé (boampAgent)
- [x] Workflow complet de veille et analyse (ao-veille-workflow)
- [x] Stockage des analyses en Supabase
- [x] Analyse sémantique, faisabilité et compétitivité
- [x] Scoring et priorisation automatiques

## 🔜 Évolutions Prévues

- [ ] Système de cache pour éviter les ré-analyses
- [ ] Notifications automatiques pour les AO prioritaires
- [ ] Interface web dédiée pour la consultation
- [ ] Export des rapports en PDF
- [ ] Support d'autres sources (PLACE, AWS, JOUE)
- [ ] Génération automatique de réponses aux AO
- [ ] Tests unitaires et d'intégration
- [ ] Métriques de performance et coût LLM

## 📚 Documentation Complète

- **Agent BOAMP** : `src/mastra/agents/README.md`
- **Intégration** : `src/mastra/agents/INTEGRATION.md`
- **Exemples** : `src/mastra/agents/boamp-agent.example.ts`
- **Résumé** : `BOAMP_AGENT_SUMMARY.md`

## 📄 Licence

Projet interne - Balthazar Consulting / Colombus Group
