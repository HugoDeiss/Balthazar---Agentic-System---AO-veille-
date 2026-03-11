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

1. **GitHub Actions** → Workflow "AO Veille Quotidienne" → "Run workflow"
2. Renseigner :
   - `since` : une date récente (ex. hier)
   - `clientId` : laisser vide pour le défaut
3. Lancer et vérifier :
   - Code HTTP 2xx ou 524 → job vert
   - Un seul email reçu (pas de doublon)
   - Logs Mastra : pas d'erreur 429 non gérée

---

## 4. Vérifications rapides

- [ ] `npm run build` réussit
- [ ] Migrations Supabase appliquées (si nécessaire)
- [ ] Test manuel workflow_dispatch OK (optionnel)
- [ ] Documentation à jour (`GITHUB_WORKFLOW_QUOTIDIEN.md`, `WORKFLOW_AO_VEILLE.md`)
