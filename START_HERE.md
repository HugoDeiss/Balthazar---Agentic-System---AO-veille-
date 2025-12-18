# 🚀 START HERE - boampAgent

## ✅ Le boampAgent est prêt !

Un agent IA spécialisé dans l'analyse des appels d'offres BOAMP a été créé pour vous.

---

## 🎯 En 3 Étapes

### 1️⃣ Tester les Exemples (5 min)

```bash
npx tsx src/mastra/agents/boamp-agent.example.ts
```

Vous verrez 6 exemples d'analyse d'appels d'offres.

### 2️⃣ Lancer le Workflow Complet (10 min)

```bash
# Terminal 1 : Démarrer le serveur
npm run dev

# Terminal 2 : Lancer le workflow
curl -X POST http://localhost:4111/workflows/ao-veille-workflow/execute \
  -H "Content-Type: application/json" \
  -d '{"clientId": "client-001", "since": "2025-12-01"}'
```

### 3️⃣ Lire la Documentation (15 min)

Ouvrez **`BOAMP_AGENT_COMPLETE.md`** pour tout comprendre.

---

## 📚 Documentation Disponible

| Fichier | Quand l'utiliser | Temps |
|---------|------------------|-------|
| **`BOAMP_AGENT_COMPLETE.md`** | 🟢 Commencer ici | 10 min |
| **`QUICK_START_BOAMP_AGENT.md`** | Guide de démarrage | 15 min |
| **`src/mastra/agents/README.md`** | Documentation complète | 20 min |
| **`ARCHITECTURE.md`** | Comprendre l'architecture | 15 min |
| **`INDEX.md`** | Naviguer dans la doc | 5 min |

---

## 🎯 Ce que fait le boampAgent

### Analyse Sémantique
Évalue la pertinence d'un AO (score 0-10)

### Analyse de Faisabilité
Vérifie si vous pouvez répondre (financier, technique, timing)

### Analyse de Compétitivité
Évalue vos chances de succès (GO/NO-GO/MAYBE)

### Recommandations
Fournit des conseils stratégiques

---

## ⚙️ Configuration Requise

Créez un fichier `.env` :

```bash
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

---

## 💡 Besoin d'Aide ?

1. **Quick Start** → `QUICK_START_BOAMP_AGENT.md`
2. **Documentation** → `BOAMP_AGENT_COMPLETE.md`
3. **Exemples** → `src/mastra/agents/boamp-agent.example.ts`
4. **Navigation** → `INDEX.md`

---

## 🎉 C'est Tout !

Vous êtes prêt à analyser des appels d'offres avec l'IA ! 🚀

**Commencez maintenant** :
```bash
npx tsx src/mastra/agents/boamp-agent.example.ts
```

---

**Version** : 1.0.0  
**Date** : 18 décembre 2025  
**Équipe** : Balthazar - Colombus Group

