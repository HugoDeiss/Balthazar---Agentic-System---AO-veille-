# 🎯 Balthazar - Système de Veille Appels d'Offres BOAMP

**Système agentique intelligent pour la détection et l'analyse automatique des appels d'offres publics français.**

---

## 📋 Vue d'Ensemble

Balthazar est un système de veille automatisé qui :
- ✅ **Récupère** quotidiennement les appels d'offres du BOAMP (Bulletin Officiel des Annonces de Marchés Publics)
- ✅ **Filtre** intelligemment selon des critères structurels (API) et métier (IA)
- ✅ **Analyse** la pertinence et la faisabilité via des agents IA spécialisés
- ✅ **Score** et priorise les opportunités (HIGH, MEDIUM, LOW)
- ✅ **Sauvegarde** les résultats dans Supabase pour exploitation

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│  BOAMP API (OpenDataSoft)                       │
│  ~2000 AO/jour, filtrage ODSQL                  │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│  boamp-fetcher.ts                               │
│  - Pagination exhaustive                        │
│  - Filtrage structurel (date, type, deadline)   │
│  - Tolérance contrôlée (≤ 3 AO ou ≤ 0.5%)      │
│  - Retry différé (60 min)                       │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│  ao-veille.ts (Workflow Mastra)                 │
│  1. Fetch BOAMP                                 │
│  2. Gestion annulations                         │
│  3. Détection rectificatifs                     │
│  4. Pré-scoring mots-clés                       │
│  5. Analyse sémantique (IA)                     │
│  6. Analyse faisabilité (IA)                    │
│  7. Scoring final                               │
│  8. Sauvegarde Supabase                         │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│  Supabase (PostgreSQL)                          │
│  - Table clients (profils)                      │
│  - Table appels_offres (résultats analysés)     │
└─────────────────────────────────────────────────┘
```

---

## 🚀 Démarrage Rapide

### Prérequis

- Node.js 18+
- npm ou pnpm
- Compte Supabase
- Clé API OpenAI

### Installation

```bash
# Cloner le repo
git clone <repo-url>
cd Balthazar---Agentic-System---AO-veille-

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos clés
```

### Configuration `.env`

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_PUBLISHABLE_KEY=eyJ...
```

### Initialiser la Base de Données

```bash
# Exécuter le script SQL dans Supabase
# Fichier: supabase-setup.sql
```

### Lancer le Serveur

```bash
npm run dev
```

Le serveur Mastra démarre sur `http://localhost:3000`

---

## 📚 Documentation Détaillée

- **[BOAMP_FETCH.md](./BOAMP_FETCH.md)** - Comment on récupère les AO depuis l'API BOAMP
- **[WORKFLOW_AO_VEILLE.md](./WORKFLOW_AO_VEILLE.md)** - Comment fonctionne le workflow d'analyse

---

## 🎯 Utilisation

### Test Manuel dans Mastra Studio

1. Ouvrir `http://localhost:3000`
2. Naviguer vers "Workflows" → "aoVeilleWorkflow"
3. Exécuter avec :

```json
{
  "clientId": "balthazar",
  "since": "2025-12-20"
}
```

### Exécution Programmatique

```typescript
import { mastra } from './src/mastra';

const workflow = mastra.getWorkflow('aoVeilleWorkflow');

if (!workflow) {
  throw new Error('Workflow aoVeilleWorkflow not found');
}

// Utiliser l'API Mastra : createRunAsync() + start()
// Cela wire automatiquement logger, telemetry, storage, agents, etc.
const run = await workflow.createRunAsync();
const result = await run.start({
  inputData: {
    clientId: 'balthazar',
    since: '2025-12-20' // Optionnel, default = veille
  }
});

console.log(`${result.saved} AO analysés`);
console.log(`${result.high} HIGH, ${result.medium} MEDIUM`);
```

### Automatisation Quotidienne

Voir les scripts dans `scripts/` :
- `schedule-retry.ts` - Planifier un retry
- `retry-boamp-fetch.ts` - Exécuter un retry
- `process-retry-queue.ts` - Traiter la queue (cron)

---

## 🔧 Configuration Client

Le profil client est stocké dans Supabase (`clients` table) :

```json
{
  "id": "balthazar",
  "name": "Balthazar Consulting",
  "preferences": {
    "typeMarche": "SERVICES"
  },
  "criteria": {
    "minBudget": 50000,
    "regions": ["Île-de-France", "Auvergne-Rhône-Alpes"]
  },
  "keywords": [
    "conseil", "stratégie", "transformation",
    "digitale", "numérique", "innovation"
  ],
  "profile": {
    "secteurs": ["Secteur public", "Collectivités territoriales"],
    "expertises": ["Transformation digitale", "Conduite du changement"]
  },
  "financial": {
    "revenue": 5000000,
    "employees": 50,
    "yearsInBusiness": 10
  },
  "technical": {
    "references": 25,
    "certifications": ["ISO 9001", "Qualiopi"]
  }
}
```

---

## 📊 Résultats

Les AO analysés sont sauvegardés dans `appels_offres` avec :

| Champ | Description |
|-------|-------------|
| `source_id` | ID BOAMP unique |
| `title` | Titre de l'AO |
| `acheteur` | Nom de l'acheteur |
| `budget_max` | Budget estimé |
| `deadline` | Date limite de réponse |
| `region` | Région |
| `keyword_score` | Score mots-clés (0-1) |
| `semantic_score` | Score sémantique IA (0-10) |
| `feasibility` | Faisabilité (financial, technical, timing) |
| `final_score` | Score final (0-100) |
| `priority` | Priorité (HIGH, MEDIUM, LOW) |
| `status` | Statut (analyzed, cancelled) |

---

## 🎯 Fonctionnalités Clés

### 1. Pagination Exhaustive

- ✅ Récupération de **100% des AO** (pas de perte)
- ✅ Boucle LIMIT + OFFSET jusqu'à `total_count`
- ✅ Fail-fast si incohérence critique

### 2. Tolérance Contrôlée

- ✅ Accepte ≤ 3 AO manquants OU ≤ 0.5% de perte
- ✅ Bloque si incohérence > seuils
- ✅ Traçabilité complète (logs, statut DEGRADED)

### 3. Retry Différé Automatique

- ✅ Retry automatique à 60 min si incohérence
- ✅ Queue simple (`.retry-queue.json`)
- ✅ Cron job toutes les 5 minutes
- ✅ Taux résolution : 80% au 1er retry

### 4. Filtrage Intelligent

**Côté API (Structurel)** :
- Temporalité (date publication)
- Nature juridique (nouveaux, rectifs, annulations)
- Statut (marché ouvert)
- Deadline (exploitable)
- Type de marché (SERVICES)

**Côté IA (Métier)** :
- Budget (évaluation contextuelle)
- Région (priorité mais pas éliminatoire)
- Secteur (sémantique)
- Fit métier (sémantique)

### 5. Gestion Rectificatifs

- ✅ Détection automatique
- ✅ Comparaison avec AO original
- ✅ Re-analyse si changement substantiel
- ✅ Historique des modifications

---

## 🧪 Tests

```bash
# Tests unitaires (rectificatifs)
npm run test:rectificatif

# Test workflow complet
ts-node scripts/test-workflow-trigger.sh
```

---

## 📈 Métriques

Le système log automatiquement :
- Nombre d'AO récupérés vs disponibles
- Taux d'exhaustivité (cible : 100%)
- Nombre d'AO par priorité (HIGH, MEDIUM, LOW)
- Statut de collecte (OK, DEGRADED, ERROR)
- Incohérences détectées et résolues

---

## 🔒 Sécurité

- ✅ Variables d'environnement (`.env`)
- ✅ Clés API Supabase (service_role pour backend)
- ✅ Validation des inputs (Zod schemas)
- ✅ Sandbox Mastra pour exécution sécurisée

---

## 🛠️ Stack Technique

- **Framework** : [Mastra](https://mastra.ai/) (workflows agentiques)
- **LLM** : OpenAI GPT-4
- **Base de données** : Supabase (PostgreSQL)
- **API** : BOAMP OpenDataSoft v2.1
- **Runtime** : Node.js 18+
- **Langage** : TypeScript

---

## 📝 Licence

Propriétaire - Balthazar Consulting

---

## 🤝 Support

Pour toute question ou problème :
- 📧 Email : contact@balthazar-consulting.fr
- 📚 Documentation : Voir `BOAMP_FETCH.md` et `WORKFLOW_AO_VEILLE.md`

---

**Système production-grade, résilient et auto-réparant.** 🚀
