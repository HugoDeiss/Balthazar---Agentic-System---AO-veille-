# 🚀 Guide de Déploiement Mastra Cloud - Checklist Complète

**Documentation complète basée sur l'expérience de déploiement réelle**

Ce guide documente tous les points critiques à vérifier avant et pendant le déploiement sur Mastra Cloud, basé sur les problèmes rencontrés et résolus.

---

## 📋 Table des Matières

1. [Prérequis](#prérequis)
2. [Configuration package.json](#configuration-packagejson)
3. [Synchronisation package-lock.json](#synchronisation-package-lockjson)
4. [Configuration Mastra Cloud](#configuration-mastra-cloud)
5. [Vérifications Pré-Déploiement](#vérifications-pré-déploiement)
6. [Problèmes Connus et Solutions](#problèmes-connus-et-solutions)
7. [Checklist Complète](#checklist-complète)

---

## 1. Prérequis

### ✅ Versions Node.js

- **Mastra Cloud utilise Node.js 20+** (vérifié lors des déploiements)
- ⚠️ **Les versions beta 1.0.0 nécessitent Node.js 22+** → Ne pas utiliser en production Cloud
- ✅ **Utiliser les versions stables** : `@mastra/core@0.24.9` et `mastra@0.18.9`

### ✅ Structure du Projet

```
project-root/
├── src/
│   └── mastra/
│       ├── index.ts          # Instance Mastra principale
│       ├── agents/
│       ├── workflows/
│       └── tools/
├── package.json
├── package-lock.json          # ⚠️ CRITIQUE : Doit être synchronisé
└── .gitignore                # Doit ignorer node_modules/ et .mastra/
```

---

## 2. Configuration package.json

### ✅ Versions Mastra

**IMPORTANT :** Utiliser les versions stables, pas les beta :

```json
{
  "dependencies": {
    "@mastra/core": "0.24.9"  // ✅ Version stable
  },
  "devDependencies": {
    "mastra": "0.18.9"        // ✅ Version stable
  }
}
```

**❌ Ne PAS utiliser :**
- `@mastra/core@1.0.0-beta.*` → Nécessite Node.js 22+
- `mastra@1.0.0-beta.*` → Nécessite Node.js 22+

### ✅ Script de Build

**IMPORTANT :** Le script `build` peut utiliser `mastra` directement ou `npx mastra` :

```json
{
  "scripts": {
    "build": "npx mastra build --dir src/mastra"
  }
}
```

**Configuration recommandée :**
- `mastra` doit être dans `dependencies` (pas `devDependencies`) pour éviter le warning "mastra will be installed"
- Avec `mastra` en `dependencies`, vous pouvez utiliser :
  - `"build": "mastra build --dir src/mastra"` ✅ (direct)
  - `"build": "npx mastra build --dir src/mastra"` ✅ (via npx, fonctionne aussi)

**Pourquoi mettre `mastra` en `dependencies` ?**
- Mastra Cloud exécute `npm ci --omit=dev` (installe uniquement les `dependencies`)
- Si `mastra` est en `devDependencies`, `npx` le télécharge temporairement (warning)
- En `dependencies`, `mastra` est installé directement, plus propre et plus rapide

### ✅ Externals (Bundler)

Les packages listés dans `bundler.externals` ne sont **pas** bundlés et doivent être installés dans `node_modules` :

```typescript
// src/mastra/index.ts
export const mastra = new Mastra({
  bundler: {
    externals: [
      "xmlbuilder",              // ✅ Doit être dans dependencies
      "rss-parser",              // ✅ Doit être dans dependencies
      "@supabase/supabase-js",   // ✅ Doit être dans dependencies
      "resend",                  // ✅ Doit être dans dependencies
    ],
  },
});
```

**Vérification :** Tous les packages listés dans `externals` doivent être dans `dependencies` (pas `devDependencies`) :

```json
{
  "dependencies": {
    "xmlbuilder": "^11.0.1",
    "rss-parser": "^3.13.0",
    "@supabase/supabase-js": "^2.89.0",
    "resend": "^6.7.0"
  }
}
```

---

## 3. Synchronisation package-lock.json

### ⚠️ CRITIQUE : Synchronisation Obligatoire

**Le `package-lock.json` DOIT être synchronisé avec `package.json` avant chaque déploiement.**

### ✅ Procédure de Synchronisation

1. **Modifier `package.json`** (versions, dépendances, etc.)

2. **Mettre à jour le lockfile :**
   ```bash
   npm install
   ```

3. **Vérifier les changements :**
   ```bash
   git status
   # Doit montrer package-lock.json modifié
   ```

4. **Commit et push :**
   ```bash
   git add package.json package-lock.json
   git commit -m "chore: mettre à jour dépendances et synchroniser package-lock.json"
   git push origin main
   ```

### ❌ Erreur si Non Synchronisé

Si `package-lock.json` n'est pas synchronisé, Mastra Cloud affichera :

```
npm error `npm ci` can only install packages when your package.json and package-lock.json are in sync.
npm error Invalid: lock file's @mastra/core@0.24.9 does not satisfy @mastra/core@1.0.0-beta.21
```

**Solution :** Toujours faire `npm install` après modification de `package.json`, puis commit/push.

---

## 4. Configuration Mastra Cloud

### ✅ Paramètres de Déploiement

Dans l'interface Mastra Cloud, configurer :

| Paramètre | Valeur | Notes |
|-----------|--------|-------|
| **Mastra Directory** | `src/mastra` | Chemin vers le dossier Mastra |
| **Install Command** | `npm ci --omit=dev` | Installation production uniquement |
| **Build Command** | `npm run build` | Exécute le script défini dans package.json |
| **Project Port** | `4111` (ou celui défini dans votre config) | Port du serveur Mastra |

### ✅ Variables d'Environnement

Vérifier que toutes les variables nécessaires sont configurées dans Mastra Cloud :

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `DATABASE_URL` | ✅ Oui | Chaîne de connexion PostgreSQL (Supabase) pour pgvector (RAG) |
| `OPENAI_API_KEY` | ✅ Oui | Clé API OpenAI (agent + embeddings) |
| `SUPABASE_URL` | ✅ Oui | URL Supabase |
| `SUPABASE_SERVICE_KEY` | ✅ Oui | Clé service Supabase |
| `RESEND_API_KEY` | ✅ Oui | Clé API Resend (emails) |
| `EMAIL_FROM` | Optionnel | Adresse expéditrice des emails |

**Important** : `DATABASE_URL` est requis pour le vector store pgvector (policies, case studies). Sans elle, l'agent RAG ne peut pas s'initialiser correctement.

---

## 5. Vérifications Pré-Déploiement

### ✅ Checklist Avant Déploiement

#### 1. Versions Mastra
- [ ] `@mastra/core` est en version stable (0.24.9)
- [ ] `mastra` CLI est en version stable (0.18.9)
- [ ] Pas de versions beta dans `package.json`

#### 2. package.json
- [ ] Script `build` utilise `npx mastra build --dir src/mastra`
- [ ] Tous les `externals` sont dans `dependencies` (pas `devDependencies`)
- [ ] `engines.node` est défini si nécessaire

#### 3. package-lock.json
- [ ] Synchronisé avec `package.json` (faire `npm install` si modifié)
- [ ] Commité et pushé sur le repo

#### 4. Configuration Mastra
- [ ] `bundler.externals` contient tous les packages nécessaires
- [ ] Tous les externals sont dans `dependencies`
- [ ] Port du serveur correspond à la config Cloud

#### 5. Code Source
- [ ] Pas d'imports de packages manquants
- [ ] Tous les fichiers nécessaires sont commités
- [ ] `.gitignore` ignore `node_modules/` et `.mastra/`

#### 6. Mastra Cloud Settings
- [ ] Mastra Directory : `src/mastra`
- [ ] Install Command : `npm ci --omit=dev`
- [ ] Build Command : `npm run build`
- [ ] Variables d'environnement : `DATABASE_URL`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY` (voir section 4)

---

## 6. Problèmes Connus et Solutions

### 🐛 Bug : Circular Dependency dans @mastra/loggers-http

**Symptôme :**
```
Failed during bundler bundle stage: "HttpTransport" cannot be exported from 
".mastra/.build/@mastra-loggers-http.mjs" as it is a reexport that references itself.
```

**Warnings avant l'erreur :**
```
Circular dependency found: .mastra/.build/@mastra-loggers-http.mjs -> .mastra/.build/@mastra-loggers-http.mjs
```

**Cause :**
Bug dans le bundler du déployer Mastra Cloud (version 0.24.9). Problème interne à Mastra, pas dans votre code.

**Solutions Tentées :**
1. ✅ Versions stables (0.24.9) → Même erreur
2. ✅ Versions beta (1.0.0-beta.21) → Nécessite Node.js 22+ (non disponible)
3. ✅ Synchronisation package-lock.json → Nécessaire mais ne résout pas le bug
4. ✅ Configuration correcte → Nécessaire mais ne résout pas le bug

**Action :**
- ✅ Signaler le bug au support Mastra
- ⏳ Attendre le correctif de leur côté
- ✅ Le build local fonctionne, seul le déploiement Cloud est bloqué

**Workaround officiel (Mastra team, issue #11982) :**

Mastra Cloud peut échouer au bundling avec une erreur de circular re-export (`HttpTransport`).

**Fix temporaire :**
```bash
npm install @mastra/libsql@0.16.4 @mastra/loggers@0.10.19
```

**Note sur les versions :** Les versions exactes installées peuvent différer de `@mastra/core`. Dans ce projet, `@mastra/core@0.24.9` est utilisé avec `@mastra/libsql@0.16.4` et `@mastra/loggers@0.10.19`.

**Important :** Ces packages doivent être dans `dependencies` (pas `devDependencies`) car le build Cloud utilise `npm ci --omit=dev`.

**Note :** Ce workaround a été confirmé par l'équipe Mastra sur Discord (référence issue GitHub #11982).

---

### ⚠️ Erreur : "mastra: command not found"

**Symptôme :**
```
sh: 1: mastra: not found
```

**Cause :**
Le script `build` utilise `mastra` directement au lieu de `npx mastra`.

**Solution :**
Modifier `package.json` :
```json
{
  "scripts": {
    "build": "npx mastra build --dir src/mastra"  // ✅ Avec npx
  }
}
```

---

### ⚠️ Erreur : package-lock.json désynchronisé

**Symptôme :**
```
npm error `npm ci` can only install packages when your package.json and package-lock.json are in sync.
npm error Invalid: lock file's @mastra/core@0.24.9 does not satisfy @mastra/core@1.0.0-beta.21
```

**Cause :**
`package.json` modifié sans mettre à jour `package-lock.json`.

**Solution :**
```bash
npm install  # Met à jour package-lock.json
git add package.json package-lock.json
git commit -m "chore: synchroniser package-lock.json"
git push origin main
```

---

### ⚠️ Warnings Peer Dependency (Non bloquants)

**Symptôme :**
```
npm warn ERESOLVE overriding peer dependency
npm warn While resolving: @openrouter/ai-sdk-provider@1.2.3
npm warn Found: ai@4.3.19
npm warn Could not resolve dependency:
npm warn peer ai@"^5.0.0" from @openrouter/ai-sdk-provider-v5@1.2.3
npm warn Conflicting peer dependency: ai@5.0.121
```

**Cause :**
Incompatibilité de peer dependency entre `@mastra/core@0.24.9` (utilise `ai@^4.3.19`) et `@openrouter/ai-sdk-provider` (demande `ai@^5.0.0`). Problème interne à Mastra, pas dans votre code.

**Impact :**
- ✅ **Non bloquant** : Le build et le runtime fonctionnent correctement
- ⚠️ **Surveillance recommandée** : Surveiller les logs runtime pour d'éventuelles erreurs liées à OpenRouter
- 📝 **Action** : Documenter si des erreurs apparaissent en production

**Solution :**
Aucune action requise pour l'instant. Ces warnings sont attendus avec `@mastra/core@0.24.9` et n'affectent pas le fonctionnement du système.

---

### ⚠️ Erreur : External manquant dans node_modules

**Symptôme :**
Runtime error : `Cannot find module 'xmlbuilder'` (ou autre external)

**Cause :**
Package listé dans `bundler.externals` mais absent de `dependencies`.

**Solution :**
1. Vérifier que le package est dans `dependencies` (pas `devDependencies`)
2. Ajouter si manquant :
   ```bash
   npm install xmlbuilder --save  # --save = dependencies
   ```
3. Commit et push

---

### ⚠️ Erreur 524 (Cloudflare Timeout) au déclenchement cron

**Symptôme** : Le workflow GitHub reçoit un code 524 "A timeout occurred" lors de l'appel à Mastra Cloud.

**Causes possibles** :
- Code de debug laissé en prod : `fetch('http://127.0.0.1:7243/...')` dans `ao-veille.ts` ou `boamp-fetcher.ts` — **ne jamais commiter**
- `DATABASE_URL` manquant dans Mastra Cloud (connexion pgvector bloque au démarrage)

**Solution** : Supprimer toute instrumentation vers `127.0.0.1:7243`, vérifier `DATABASE_URL` dans les variables Mastra Cloud. Voir `GITHUB_WORKFLOW_QUOTIDIEN.md` section "Problème 5b".

---

## 7. Checklist Complète

### 📝 Avant Chaque Déploiement

#### Configuration
- [ ] `package.json` : Versions Mastra stables (0.24.9 / 0.18.9)
- [ ] `package.json` : Script `build` utilise `npx mastra build --dir src/mastra`
- [ ] `package.json` : Tous les externals sont dans `dependencies`
- [ ] `package-lock.json` : Synchronisé avec `package.json` (faire `npm install` si modifié)
- [ ] `src/mastra/index.ts` : `bundler.externals` contient tous les packages nécessaires
- [ ] Git : Tous les changements sont commités et pushés

#### Mastra Cloud Settings
- [ ] Mastra Directory : `src/mastra`
- [ ] Install Command : `npm ci --omit=dev`
- [ ] Build Command : `npm run build`
- [ ] Variables d'environnement : Toutes configurées

#### Vérifications Locales (Optionnel mais Recommandé)
- [ ] Build local fonctionne : `npm run build`
- [ ] Pas d'erreurs de linting
- [ ] Tests locaux passent (si applicable)

### 📝 Pendant le Déploiement

#### Logs à Surveiller
1. **Install Phase :**
   - ✅ `added X packages` → Installation réussie
   - ❌ Erreurs de synchronisation package-lock.json → Arrêter et corriger

2. **Build Phase :**
   - ✅ `Build successful, you can now deploy` → Build réussi
   - ✅ `Bundling Mastra done` → Bundling réussi
   - ❌ `mastra: not found` → Vérifier script build
   - ❌ Erreurs de bundling → Vérifier externals

3. **Deployer Phase :**
   - ✅ `Updated build ... with deployer version` → Déployer démarré
   - ⚠️ `Circular dependency found` → Bug connu (signaler au support)
   - ❌ `HttpTransport cannot be exported` → Bug connu (signaler au support)

### 📝 Après le Déploiement

- [ ] Vérifier que l'application est accessible
- [ ] Tester un workflow manuellement
- [ ] Vérifier les logs d'exécution
- [ ] Confirmer que les emails sont envoyés (si applicable)

---

## 📚 Résumé des Points Critiques

1. **Versions Mastra :** Toujours utiliser les versions stables (0.24.9 / 0.18.9)
2. **Script Build :** Toujours utiliser `npx mastra build --dir src/mastra`
3. **package-lock.json :** Toujours synchroniser avec `npm install` après modification de `package.json`
4. **Externals :** Tous doivent être dans `dependencies`, pas `devDependencies`
5. **Mastra Cloud Settings :** Install Command = `npm ci --omit=dev`, Build Command = `npm run build`
6. **Variables d'environnement :** `DATABASE_URL` obligatoire pour pgvector (RAG) — sans elle, timeout 524 possible
7. **Pas de debug en prod :** Ne jamais laisser de `fetch('http://127.0.0.1:7243/...')` dans le code
8. **Bug Connu :** Circular dependency dans bundler (signaler au support Mastra)

---

## 🔗 Ressources

- **Support Mastra :** Discord ou tickets
- **Documentation Mastra :** https://mastra.ai/docs
- **Versions disponibles :** `npm view @mastra/core versions` et `npm view mastra versions`

---

**Dernière mise à jour :** Mars 2026
**Versions testées :** @mastra/core@0.24.9, mastra@0.18.9
**Status :** Bug bundler connu, en attente de correctif Mastra
