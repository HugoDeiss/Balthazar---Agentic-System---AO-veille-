# Tests avant commit — Fiabilisation AO Veille

**Checklist pour valider les modifications avant commit et push.**

---

## 1. TypeScript

Vérifier que le projet compile sans erreur :

```bash
npx tsc --noEmit
```

---

## 2. Build Mastra

```bash
npm run build
```

---

## 3. Tests unitaires (vitest)

```bash
npm test
```

Couvre : `src/**/*.test.ts` — tools feedback, agents (schémas Zod).

---

## 4. Migrations Supabase (si colonnes/tables ajoutées)

Les migrations sont versionnées dans `supabase/migrations/`. Pour appliquer :

1. Ouvrir le SQL Editor Supabase
2. Coller le contenu du fichier de migration (`supabase/migrations/YYYYMMDD_*.sql`)
3. Exécuter et vérifier qu'il n'y a pas d'erreur de contrainte
4. (Optionnel) `npx supabase db push` si le CLI Supabase est configuré

---

## 5. Test manuel du workflow (recommandé)

**Option A — Inngest (prod)** : dashboard Inngest → **AO Veille Quotidienne** → **Invoke Function**, puis vérifier les logs Mastra Cloud.

**Option B — Mastra Studio (local)** : `npm run dev` → workflow `aoVeilleWorkflow` avec `clientId`, `since` (date), etc.

**Option C — API Mastra Cloud** : `POST /api/workflows/aoVeilleWorkflow/start-async` avec un JSON d'entrée (voir README / WORKFLOW_AO_VEILLE.md). Vérifier code HTTP 2xx et logs Mastra.

---

## 6. Déploiement backend (si changements backend)

```bash
cd ~/Balthazar---Agentic-System---AO-veille-
npx mastra server deploy
```

---

## 7. Tests comportementaux — Protocole chat (après déploiement)

> Vérifier que chaque comportement utilisateur déclenche le bon flow. Tester sur un AO réel avec corrections en base.

### 7.1 Flows existants (régression)

| Test | Phrase | Attendu |
|------|--------|---------|
| R1 | « Ce mot-clé n'est pas pertinent » | ChoiceCard → SimilarAOCard → CorrectionCard |
| R2 | « Cet AO est pertinent, il devrait remonter » | Flow include : ChoiceCard boost → CorrectionCard |
| R3 | « Passe en priorité HIGH » | ManualOverrideCard + badge priorité forcée |
| R4 | « Combien d'AOs a affecté cette correction ? » | Réponse avec chiffre et liste AOs |

### 7.2 Réversibilité (V1)

| Test | Contexte | Phrase / Action | Attendu |
|------|----------|----------------|---------|
| B3 | AO avec corrections | Ouvrir fiche AO | Section historique visible, items colorés par type |
| B3-expand | Timeline visible | Cliquer sur item | Accordéon : raison, date, bouton "Annuler" |
| B1-UI | Item actif | Cliquer "Annuler" → raison → confirmer | Item grisé + badge "Annulée", DB à jour |
| B1-chat-1 | 1 correction active | « Annule la correction sur cet AO » | Agent propose directement la correction |
| B1-chat-n | N corrections actives | « Annule la correction sur cet AO » | Agent liste numérotée, demande laquelle |
| B1-manual | manual_override actif | Chat revert | Agent appelle `revertManualOverride`, badge "Priorité forcée" disparaît |
| B1-refresh | Après correction chat | (automatique) | Timeline se rafraîchit sans reload de page |

### 7.3 Qualité RAG chunk (V1 bis)

| Test | Phrase | Attendu |
|------|--------|---------|
| RAG-quality | « Ce type de mission est trop opérationnel pour nous » | `chunk_content` ≥ 150 mots avec HORS SCOPE / IN SCOPE / RÈGLE CLEF |

Vérifier en SQL après apply :
```sql
SELECT correction_value, length(chunk_content) as len, chunk_content
FROM ao_feedback
WHERE correction_type = 'rag_chunk'
ORDER BY created_at DESC LIMIT 1;
```

---

## Checklist rapide

- [ ] `npx tsc --noEmit` réussit (0 erreur TypeScript)
- [ ] `npm run build` réussit
- [ ] `npm test` passe (vitest)
- [ ] Migrations Supabase appliquées (si nécessaire)
- [ ] Tests comportementaux §7 — régression (R1-R4) OK
- [ ] Tests comportementaux §7 — réversibilité (B1, B3) OK
- [ ] Tests comportementaux §7 — qualité RAG chunk OK
- [ ] Documentation à jour (`ARCHITECTURE.md`, `correction-behaviors.md`)
- [ ] `npx mastra server deploy` exécuté (si changements backend)
