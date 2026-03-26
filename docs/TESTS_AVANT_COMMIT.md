# Tests avant commit — Fiabilisation AO Veille

**Checklist pour valider les modifications avant commit et push.**

---

## 1. Build

Vérifier que le projet compile sans erreur :

```bash
npm run build
```

---

## 2. Migrations Supabase (si tables ajoutées)

Si `supabase-setup.sql` a été modifié (ex. `ao_veille_runs`, `veille_email_logs`) :

1. Ouvrir le SQL Editor Supabase
2. Exécuter les blocs `CREATE TABLE` et `CREATE INDEX` pour les nouvelles tables
3. Vérifier qu'aucune erreur de contrainte ou de dépendance

---

## 3. Test manuel du workflow (recommandé)

**Option A — Inngest (prod)** : dashboard Inngest → **AO Veille Quotidienne** → **Invoke Function**, puis vérifier les logs Mastra Cloud.

**Option B — Mastra Studio (local)** : `npm run dev` → workflow `aoVeilleWorkflow` avec `clientId`, `since` (date), etc.

**Option C — API Mastra Cloud** : `POST /api/workflows/aoVeilleWorkflow/start-async` avec un JSON d’entrée (voir README / WORKFLOW_AO_VEILLE.md). Vérifier code HTTP 2xx et logs Mastra.

---

## 4. Vérifications rapides

- [ ] `npm run build` réussit
- [ ] Migrations Supabase appliquées (si nécessaire)
- [ ] Test manuel (Inngest invoke ou Studio / API) OK (optionnel)
- [ ] Documentation à jour (`INNGEST.md`, `WORKFLOW_AO_VEILLE.md`)
