# Ancien workflow GitHub — archivé

Le fichier **`.github/workflows/daily-ao-veille.yml`** a été **supprimé**. La veille quotidienne en production est déclenchée uniquement par **Inngest** sur Mastra Cloud.

- **Planification et configuration** : [INNGEST.md](./INNGEST.md)
- **Détail métier du pipeline** : [WORKFLOW_AO_VEILLE.md](./WORKFLOW_AO_VEILLE.md)

## Tests manuels (sans GitHub Actions)

1. **Inngest** (recommandé en prod) : dashboard → fonction **AO Veille Quotidienne** → **Invoke Function**.
2. **Mastra Studio** (local) : `npm run dev` → Workflows → `aoVeilleWorkflow` avec un JSON d’entrée (`clientId`, `since`, etc.).
3. **API Mastra Cloud** : `POST /api/workflows/aoVeilleWorkflow/start-async` avec un corps JSON — voir [README.md](./README.md) (section exécution programmatique / test manuel).

## Contexte historique

GitHub Actions appelait Mastra via `curl` avec une fenêtre de temps limitée ; des **524 Cloudflare** ou timeouts pouvaient faire **retry** le job et lancer plusieurs fois le workflow. Le passage à **Inngest** pour le cron évite ce modèle d’orchestration HTTP « court ».

Pour les timeouts côté **client HTTP** encore possibles si tu appelles l’API Mastra depuis un script externe, voir la section **Erreur 524** dans [DEPLOIEMENT_MASTRA_CLOUD.md](./DEPLOIEMENT_MASTRA_CLOUD.md).
