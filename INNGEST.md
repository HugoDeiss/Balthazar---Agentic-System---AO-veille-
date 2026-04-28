# Inngest — planification de la veille AO

La **veille quotidienne** (`aoVeilleWorkflow`) est déclenchée en production par **[Inngest](https://www.inngest.com/)**, pas par le cron GitHub Actions.

## Comportement

| Élément | Valeur |
|--------|--------|
| App Inngest | `balthazar-ao-veille` (id client dans le code : même chaîne) |
| Fonction | **AO Veille Quotidienne** (`ao-veille-daily`) |
| Cron | `0 6 * * 1-5` — 6h00 UTC, **lundi–vendredi** |
| MarchesOnline RSS | Injecté **mercredi et vendredi** uniquement (logique dans `src/mastra/inngest/index.ts`) |

## Code

- Handler HTTP : `serve()` depuis `inngest/hono`, monté via `server.apiRoutes` dans `src/mastra/index.ts`.
- Définition de la fonction : `src/mastra/inngest/index.ts`.

## URL de sync (dashboard Inngest)

Après déploiement sur Mastra Cloud, l’URL à enregistrer dans Inngest (sync manuelle ou auto) est :

```text
https://<votre-domaine-mastra-cloud>/api/inngest
```

Exemple : `https://balthazar-tender-monitoring.server.mastra.cloud/api/inngest`

Un `GET` sur cette URL doit répondre **200** avec un JSON de métadonnées Inngest (dont `function_count`) lorsque le déploiement est à jour.

## Variables d’environnement (Mastra Cloud)

| Variable | Rôle |
|----------|------|
| `INNGEST_EVENT_KEY` | Événements / client Inngest (selon config Inngest) |
| `INNGEST_SIGNING_KEY` | Vérification des requêtes signées depuis Inngest Cloud |
| `BALTHAZAR_CLIENT_ID` | Client passé en entrée du workflow (ex. `balthazar`) |

Les autres variables habituelles (Supabase, OpenAI, Resend, `DATABASE_URL`, etc.) restent requises comme pour une exécution manuelle du workflow.

## Tests manuels

- **Inngest** : **Invoke Function** sur **AO Veille Quotidienne** (même chemin d’exécution que le cron).
- **Mastra Studio** (local) ou **API** `start-async` : voir [README.md](./README.md) et [WORKFLOW_AO_VEILLE.md](./WORKFLOW_AO_VEILLE.md).

L’ancien workflow GitHub a été retiré ; note d’archivage : [GITHUB_WORKFLOW_QUOTIDIEN.md](./GITHUB_WORKFLOW_QUOTIDIEN.md).
