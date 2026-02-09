# ✅ Checklist Pre-Push - Workflow AO Veille Quotidienne

**Utilise cette checklist avant chaque modification du workflow GitHub Actions pour éviter les erreurs en production.**

---

## 🔧 1. Syntaxe et Structure YAML

- [ ] **Indentation correcte** : Utiliser uniquement des espaces (pas de tabs), 2 espaces par niveau
- [ ] **Validation YAML** : Tester le fichier avec un validateur YAML en ligne ou `yamllint`
- [ ] **Quotes cohérentes** : Vérifier que les guillemets sont bien fermés
- [ ] **Expressions GitHub** : Vérifier la syntaxe `${{ }}` pour toutes les variables

### Commandes de vérification :
```bash
# Installer yamllint si nécessaire
pip install yamllint

# Valider le fichier
yamllint .github/workflows/daily-ao-veille.yml

# Ou en ligne :
# https://www.yamllint.com/
```

---

## 🔑 2. Secrets GitHub

- [ ] **MASTRA_CLOUD_URL** : Vérifié et fonctionnel
- [ ] **BALTHAZAR_CLIENT_ID** : Défini (ou utilisation de `clientId` en input)
- [ ] **Accès aux secrets** : Confirmer que le repository a accès aux secrets
- [ ] **Pas de secrets en dur** : Vérifier qu'aucun secret n'est écrit directement dans le YAML

### Comment vérifier :
1. Aller dans `Settings` → `Secrets and variables` → `Actions`
2. Confirmer la présence de :
   - `MASTRA_CLOUD_URL`
   - `BALTHAZAR_CLIENT_ID`

---

## 📅 3. Configuration Cron

- [ ] **Syntaxe cron valide** : `'0 6 * * *'` = 6h00 UTC tous les jours
- [ ] **Fuseau horaire correct** : UTC → conversion Paris (7h hiver, 8h été)
- [ ] **Fréquence adaptée** : Vérifier que quotidien convient au besoin

### Vérification :
```bash
# Tester la syntaxe cron sur : https://crontab.guru/
# '0 6 * * *' = At 06:00 UTC every day
```

---

## 🔨 4. Syntaxe jq (CRITIQUE)

- [ ] **Syntaxe jq validée** : Le bloc de construction du payload JSON est correct
- [ ] **Test en local** : Tester la commande jq avant de push

### Version corrigée à utiliser :
```bash
PAYLOAD=$(jq -n \
  --arg clientId "$CLIENT_ID" \
  --arg since "$SINCE" \
  --arg until "$UNTIL" \
  --argjson urls '["url1", "url2"]' \
  '{
    inputData: (
      {
        clientId: $clientId,
        since: $since,
        marchesonlineRSSUrls: $urls
      } | if $until != "" then . + {until: $until} else . end
    )
  }')
```

### Test en local :
```bash
# Tester avec des valeurs de test
CLIENT_ID="test-client"
SINCE="2026-02-08"
UNTIL=""

PAYLOAD=$(jq -n \
  --arg clientId "$CLIENT_ID" \
  --arg since "$SINCE" \
  --arg until "$UNTIL" \
  --argjson urls '[]' \
  '{
    inputData: (
      {
        clientId: $clientId,
        since: $since,
        marchesonlineRSSUrls: $urls
      } | if $until != "" then . + {until: $until} else . end
    )
  }')

# Vérifier que le JSON est valide
echo "$PAYLOAD" | jq .

# Doit afficher :
# {
#   "inputData": {
#     "clientId": "test-client",
#     "since": "2026-02-08",
#     "marchesonlineRSSUrls": []
#   }
# }
```

### Test avec `until` rempli :
```bash
UNTIL="2026-02-10"

PAYLOAD=$(jq -n \
  --arg clientId "$CLIENT_ID" \
  --arg since "$SINCE" \
  --arg until "$UNTIL" \
  --argjson urls '[]' \
  '{
    inputData: (
      {
        clientId: $clientId,
        since: $since,
        marchesonlineRSSUrls: $urls
      } | if $until != "" then . + {until: $until} else . end
    )
  }')

echo "$PAYLOAD" | jq .

# Doit afficher :
# {
#   "inputData": {
#     "clientId": "test-client",
#     "since": "2026-02-08",
#     "until": "2026-02-10",
#     "marchesonlineRSSUrls": []
#   }
# }
```

---

## 🧪 5. Test Manuel du Workflow

- [ ] **Test avec `workflow_dispatch`** : Déclencher manuellement avant de laisser le cron
- [ ] **Test avec inputs vides** : Vérifier le comportement par défaut
- [ ] **Test avec inputs remplis** : Vérifier la plage de dates personnalisée
- [ ] **Test mercredi/vendredi** : Vérifier l'activation MarchesOnline

### Comment tester :
1. Aller dans `Actions` → `AO Veille Quotidienne` → `Run workflow`
2. Tester ces scénarios :
   - ✅ Sans aucun input (comportement par défaut)
   - ✅ Avec `since: 2026-02-01` seulement
   - ✅ Avec `since: 2026-02-01` et `until: 2026-02-05`
   - ✅ Un mercredi ou vendredi pour tester MarchesOnline

### Résultats attendus :
- ✅ Code HTTP 2xx dans les logs
- ✅ Step "✅ Vérifier le succès" s'exécute
- ✅ Logs Mastra Cloud montrent l'exécution du workflow
- ✅ Payload JSON valide dans les logs

---

## 🌐 6. Endpoint Mastra Cloud

- [ ] **URL correcte** : `${{ secrets.MASTRA_CLOUD_URL }}/api/workflows/aoVeilleWorkflow/start-async`
- [ ] **Endpoint accessible** : Tester avec curl
- [ ] **Headers corrects** : `Content-Type: application/json`

### Test manuel de l'endpoint :
```bash
# Récupérer l'URL de Mastra Cloud
MASTRA_URL="votre-url-mastra-cloud"

# Health check
curl -s -o /dev/null -w "%{http_code}" "$MASTRA_URL"

# Test complet
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Run-Id: test-manual" \
  -d '{
    "inputData": {
      "clientId": "test-client",
      "since": "2026-02-08",
      "marchesonlineRSSUrls": []
    }
  }' \
  "$MASTRA_URL/api/workflows/aoVeilleWorkflow/start-async"
```

---

## 📊 7. Logique MarchesOnline

- [ ] **Calcul du jour correct** : Mercredi = 3, Vendredi = 5
- [ ] **URLs correctes** : Vérifier le flux RSS MarchesOnline
- [ ] **Tableau vide si désactivé** : `[]` et non `null`

### Vérification de la logique :
```bash
# Tester localement
DAY_OF_WEEK=$(date +%u)
echo "Jour de la semaine: $DAY_OF_WEEK"

if [ "$DAY_OF_WEEK" -eq 3 ] || [ "$DAY_OF_WEEK" -eq 5 ]; then
  echo "MarchesOnline activé"
  URLS='["https://www.marchesonline.com/mol/rss/appels-d-offres-domaine-activite-services.xml"]'
else
  echo "MarchesOnline désactivé"
  URLS='[]'
fi

echo "URLs: $URLS"
```

---

## 🔍 8. Gestion d'Erreurs

- [ ] **Retry logic** : 3 tentatives avec délai de 10s
- [ ] **HTTP codes gérés** : 2xx = succès, 4xx = erreur client, 5xx = retry
- [ ] **Payload affiché en cas d'erreur** : Pour debug
- [ ] **Exit codes corrects** : `exit 1` en cas d'échec

### Vérification :
- [ ] Le retry s'arrête sur 2xx (succès)
- [ ] Le retry s'arrête sur 4xx (erreur client, pas de retry)
- [ ] Le retry continue sur 5xx (erreur serveur)
- [ ] Maximum 3 tentatives

---

## 📝 9. Logs et Debugging

- [ ] **Emojis cohérents** : Pour faciliter la lecture des logs
- [ ] **Informations clés loggées** :
  - GitHub Run ID
  - Client ID
  - Dates (since/until)
  - État MarchesOnline
  - Code HTTP
  - Preview de la réponse
- [ ] **Limite de preview** : 4000 caractères pour éviter les logs trop longs

### Vérification :
- [ ] Les logs sont lisibles et structurés
- [ ] Le GitHub Run ID est présent pour corrélation
- [ ] Le payload est affiché en cas d'erreur
- [ ] Les timestamps sont en UTC

---

## 🚀 10. Permissions et Configuration GitHub

- [ ] **Permissions du workflow** : Le repository autorise les GitHub Actions
- [ ] **Branch protection** : Vérifier que le workflow peut s'exécuter sur la branche `main`
- [ ] **Workflow activé** : Dans `Actions` → vérifier que le workflow n'est pas désactivé

### Comment vérifier :
1. `Settings` → `Actions` → `General`
2. Confirmer : "Allow all actions and reusable workflows"
3. Vérifier que les workflows ne sont pas désactivés

---

## 🧹 11. Cleanup et Bonnes Pratiques

- [ ] **Pas de code commenté** : Supprimer ou documenter clairement
- [ ] **TODOs traités** : Implémenter ou créer des issues
- [ ] **Documentation à jour** : Mettre à jour le README si nécessaire
- [ ] **Commit message clair** : Décrire les changements effectués

---

## 📋 12. Checklist Finale Avant Push

### Fichiers à vérifier :
- [ ] `.github/workflows/daily-ao-veille.yml` : Syntaxe corrigée
- [ ] `README.md` ou documentation : À jour
- [ ] Pas de fichiers sensibles : Pas de `.env`, tokens, etc.

### Commandes à exécuter :
```bash
# 1. Valider le YAML
yamllint .github/workflows/daily-ao-veille.yml

# 2. Tester jq localement (voir section 4)

# 3. Vérifier git status
git status

# 4. Vérifier le diff
git diff .github/workflows/daily-ao-veille.yml

# 5. Commit
git add .github/workflows/daily-ao-veille.yml
git commit -m "fix: correct jq syntax in daily AO veille workflow"

# 6. Push
git push origin main
```

### Après le push :
- [ ] **Vérifier sur GitHub** : Le workflow apparaît dans Actions
- [ ] **Déclencher manuellement** : Tester avec `workflow_dispatch`
- [ ] **Surveiller les logs** : Vérifier que tout se passe bien
- [ ] **Attendre le prochain cron** : Confirmer l'exécution automatique demain matin

---

## 🆘 En Cas d'Échec

### Diagnostic rapide :
1. **Erreur de syntaxe YAML** → Vérifier l'indentation et les quotes
2. **Erreur jq** → Tester la commande jq en local
3. **Code HTTP 4xx** → Vérifier le payload et l'endpoint
4. **Code HTTP 5xx** → Problème côté Mastra Cloud
5. **Secrets manquants** → Vérifier dans Settings → Secrets

### Ressources :
- **Validation YAML** : https://www.yamllint.com/
- **Test cron** : https://crontab.guru/
- **Logs GitHub Actions** : Dans l'onglet Actions du repository
- **Documentation jq** : https://jqlang.github.io/jq/
- **Documentation workflow** : `GITHUB_WORKFLOW_QUOTIDIEN.md`

---

## ✅ Résumé du Fix Critique

**Problème identifié** : Syntaxe jq incorrecte pour l'ajout conditionnel du champ `until`

**Solution appliquée** :
```yaml
# ❌ AVANT (incorrect)
'{
  inputData: {
    clientId: $clientId,
    since: $since,
    marchesonlineRSSUrls: $urls
  } + (if $until != "" then {until: $until} else {} end)
}'

# ✅ APRÈS (correct)
'{
  inputData: (
    {
      clientId: $clientId,
      since: $since,
      marchesonlineRSSUrls: $urls
    } | if $until != "" then . + {until: $until} else . end
  )
}'
```

**Erreurs évitées** :
- `jq: error: syntax error, unexpected '+', expecting '}'`
- `jq: error: syntax error, unexpected else, expecting end of file`
- `jq: error: May need parentheses around object key expression`

---

## 🎯 Bon à Savoir

- **Délai cron GitHub** : Les cron jobs GitHub Actions peuvent avoir jusqu'à **10 minutes de délai** par rapport à l'heure programmée en période de forte charge. C'est normal et ne doit pas être considéré comme un échec.

- **Retry automatique** : Le workflow retry automatiquement 3 fois sur erreur 5xx avec un délai de 10s entre chaque tentative.

- **Corrélation GitHub ↔ Mastra** : Utilise le `GitHub Run ID` (format `gh-XXXXXXXX-1`) pour retrouver un run GitHub dans les logs Mastra Cloud.

- **Health check** : Le workflow vérifie la disponibilité de Mastra Cloud avant d'envoyer le payload, mais continue même si le health check échoue (c'est juste informatif).

---

## 📚 Documentation Complémentaire

- **Documentation complète** : `GITHUB_WORKFLOW_QUOTIDIEN.md`
- **Workflow métier** : `WORKFLOW_AO_VEILLE.md`
- **README principal** : `README.md`

---

**🎯 Utilise cette checklist avant chaque modification du workflow pour garantir un déploiement sans erreur !**
