# 📡 MarchesOnline RSS Fetch - Récupération des Appels d'Offres

**Documentation technique complète de l'outil Mastra pour la récupération des AO depuis les flux RSS MarchesOnline.**

---

## 🎯 Objectif

Récupérer les appels d'offres publiés sur **MarchesOnline** via leurs flux RSS, avec :
- ✅ Parsing RSS robuste (rss-parser)
- ✅ Filtrage des attributions (exclusion automatique)
- ✅ Détection des annulations
- ✅ Extraction UUID procédure (déduplication cross-platform)
- ✅ Extraction SIRET (déduplication niveau 3)
- ✅ Normalisation vers format `CanonicalAO` (standardisation)
- ✅ Filtrage par date et type de marché

---

## 🏗️ Architecture de l'Outil Mastra

### Structure du Tool

L'outil `marchesonlineRSSFetcherTool` est créé avec `createTool` de Mastra (`@mastra/core`) :

```typescript
// src/mastra/tools/marchesonline-rss-fetcher.ts
export const marchesonlineRSSFetcherTool = createTool({
  id: 'marchesonline-rss-fetcher',
  description: 'Récupère les appels d\'offres depuis les flux RSS de MarchesOnline',
  
  inputSchema: z.object({
    rssUrls: z.array(z.string().url())
      .describe('Liste des URLs des flux RSS MarchesOnline à récupérer'),
    since: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Date au format YYYY-MM-DD (ex: 2025-12-17)')
      .optional(),
    typeMarche: z.enum(['SERVICES', 'FOURNITURES', 'TRAVAUX'])
      .default('SERVICES')
      .optional(),
  }),
  
  execute: async (inputData) => {
    // Logique de récupération RSS...
  }
});
```

### Schéma d'Entrée (Zod)

Le schéma Zod garantit la validation des paramètres :

- **`rssUrls`** : Tableau d'URLs valides des flux RSS MarchesOnline (requis)
- **`since`** : Date optionnelle au format `YYYY-MM-DD` (défaut = veille si non fourni)
- **`typeMarche`** : Enum strict (`SERVICES`, `FOURNITURES`, `TRAVAUX`) - filtre optionnel

### Schéma de Sortie

L'outil retourne une structure typée :

```typescript
{
  source: 'MARCHESONLINE',
  query: {
    rssUrls: string[],
    since: string,
    typeMarche: string
  },
  total_count: number,
  fetched: number,
  records: CanonicalAO[],  // Tableau d'AO normalisés
  status: 'success'
}
```

---

## 📦 Normalisation vers Format CanonicalAO

### Principe

**Règle d'or** : Aucun item RSS brut ne doit traverser le workflow. Chaque item RSS est immédiatement normalisé vers le format `CanonicalAO` (même structure que BOAMP pour compatibilité).

### Structure CanonicalAO (MarchesOnline)

```typescript
type CanonicalAO = {
  // 🟦 Identité source (niveau racine)
  source: 'MARCHESONLINE',
  source_id: string,              // GUID RSS ou ID généré
  uuid_procedure: UUID | null,    // UUID universel pour déduplication cross-platform
  
  // 🟦 Identity : Identité de l'AO
  identity: {
    title: string,                 // Titre depuis <title>
    acheteur: string | null,      // Extrait depuis dc:creator ou description
    url: string | null,           // Lien depuis <link>
    region: string | null         // Région depuis dc:Location ou Code Postal
  },
  
  // 🟦 Lifecycle : Cycle de vie de l'AO
  lifecycle: {
    etat: string | null,          // 'AVIS_ANNULE' si annulation détectée
    nature: null,                 // Non disponible dans RSS
    nature_label: string | null,  // 'Avis d'annulation' si applicable
    annonce_lie: null,
    annonces_anterieures: null,
    publication_date: string | null,  // Depuis pubDate ou dc:date
    deadline: string | null            // Depuis dc:dateAccepted
  },
  
  // 🟦 Content : Contenu de l'AO
  content: {
    description: string,           // Description HTML nettoyée
    keywords: string[]             // Catégories RSS filtrées
  },
  
  // 🟦 Classification : Classification de l'AO
  classification: {
    type_marche: 'SERVICES' | 'FOURNITURES' | 'TRAVAUX' | null,
    procedure: null,               // Non disponible dans RSS
    famille: null                  // Non disponible dans RSS
  },
  
  // 🟦 Metadata : Métadonnées enrichies
  metadata: {
    acheteur_email: string | null,     // Extrait depuis data-email ou texte
    acheteur_tel: null,
    acheteur_adresse: null,
    acheteur_cp: null,
    acheteur_ville: null,
    criteres: null,
    marche_public_simplifie: null,
    titulaire: null,
    siret: string | null               // SIRET pour déduplication niveau 3
  }
}
```

---

## 🔍 Extraction des Données RSS

### Parsing RSS avec rss-parser

L'outil utilise la bibliothèque `rss-parser` avec des champs personnalisés pour extraire les métadonnées Dublin Core :

```typescript
const parser = new Parser({
  customFields: {
    item: [
      ['dc:creator', 'creator'],           // Créateur (acheteur)
      ['dc:dateAccepted', 'deadline'],     // Date limite de réponse
      ['dc:Location', 'location'],         // Localisation (département - ville)
      ['guid', 'guid']                     // Identifiant unique RSS
    ]
  }
});
```

### Champs RSS Extraits

| Champ RSS | Mapping | Description |
|-----------|---------|-------------|
| `<title>` | `item.title` | Titre de l'appel d'offres |
| `<link>` | `item.link` | URL de l'annonce |
| `<description>` | `item.description` | Description HTML complète |
| `<pubDate>` | `item.pubDate` | Date de publication (format RFC 822) |
| `<dc:date>` | `item['dc:date']` | Date alternative (format ISO) |
| `<dc:dateAccepted>` | `item.deadline` | Date limite de réponse |
| `<dc:creator>` | `item.creator` | Nom de l'acheteur |
| `<dc:Location>` | `item.location` | Localisation (format: "92 - Neuilly-sur-Seine") |
| `<category>` | `item.categories` | Catégories/mots-clés RSS |
| `<guid>` | `item.guid` | Identifiant unique RSS |

---

## 🆔 Extraction UUID de Procédure

### Principe

L'UUID de procédure est **crucial** pour la déduplication cross-platform entre BOAMP et MarchesOnline. Il permet d'identifier qu'un même appel d'offres apparaît sur les deux plateformes.

### Fonction d'Extraction

```typescript
// src/utils/cross-platform-dedup.ts
export function extractUUIDFromMarchesOnline(description: string): UUID | null {
  // Format 1 : UUID dans attribut data-uuid
  // <span data-uuid="123e4567-e89b-12d3-a456-426614174000">
  const dataUuidMatch = description.match(/data-uuid\s*=\s*["']([^"']+)["']/i);
  if (dataUuidMatch) {
    const uuid = dataUuidMatch[1].trim();
    if (isValidUUID(uuid)) return uuid;
  }
  
  // Format 2 : UUID dans texte (format standard)
  // "Identifiant de la procédure : 123e4567-e89b-12d3-a456-426614174000"
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const match = description.match(uuidPattern);
  if (match && isValidUUID(match[0])) {
    return match[0];
  }
  
  return null;
}
```

### Formats Supportés

1. **Attribut HTML** : `<span data-uuid="123e4567-e89b-12d3-a456-426614174000">`
2. **Texte brut** : "Identifiant de la procédure : 123e4567-e89b-12d3-a456-426614174000"

### Utilisation dans la Déduplication

L'UUID extrait est utilisé dans le workflow pour comparer les AO MarchesOnline avec ceux de BOAMP :

```typescript
// Dans ao-veille.ts (fetch-and-prequalify step)
const existingBOAMP = await supabase
  .from('appels_offres')
  .select('uuid_procedure')
  .eq('uuid_procedure', marchesonlineAO.uuid_procedure)
  .single();
```

---

## 🏢 Extraction SIRET

### Principe

Le SIRET (14 chiffres) permet une déduplication supplémentaire lorsque l'UUID n'est pas disponible. Il est utilisé en combinaison avec la date limite pour créer une clé composite.

### Fonction d'Extraction

```typescript
// src/utils/cross-platform-dedup.ts
export function extractSIRET(text: string): string | null {
  // Format standard : 14 chiffres consécutifs
  // Exemples : "SIRET : 12345678901234" ou "12345678901234"
  const siretPattern = /\b\d{14}\b/;
  const match = text.match(siretPattern);
  return match ? match[0] : null;
}
```

### Utilisation dans la Déduplication

Le SIRET est utilisé pour créer une clé composite `siret_deadline_key` :

```typescript
// Clé composite : SIRET + deadline
const siretDeadlineKey = `${siret}_${deadline}`;
```

---

## 🗺️ Extraction Région

### Principe

La région est extraite depuis `dc:Location` (format: "92 - Neuilly-sur-Seine") ou depuis le Code Postal dans la description.

### Fonction d'Extraction

```typescript
function extractRegionFromLocation(location: string | undefined, description: string): string | null {
  // Priorité 1 : Utiliser dc:Location si disponible
  if (location) {
    const match = location.match(/^(\d{2,3})\s*-\s*/);
    if (match) {
      const dept = match[1];
      const region = DEPARTEMENT_TO_REGION[dept];
      if (region) return region;
    }
  }
  
  // Priorité 2 : Extraire Code Postal depuis description
  const cpMatch = description.match(/Code\s+Postal\s*[:]\s*(\d{2,3})\d{3}/i);
  if (cpMatch) {
    const dept = cpMatch[1];
    const region = DEPARTEMENT_TO_REGION[dept];
    if (region) return region;
  }
  
  return null;
}
```

### Mapping Département → Région

Le système utilise un mapping complet des départements français vers leurs régions (même mapping que BOAMP pour cohérence).

---

## 🏷️ Extraction Mots-Clés

### Principe

Les mots-clés sont extraits depuis les catégories RSS (`<category>`) et filtrés pour exclure les catégories trop génériques.

### Fonction d'Extraction

```typescript
function extractKeywords(item: any): string[] {
  const keywords: string[] = [];
  
  // Extraire depuis les catégories RSS
  if (item.categories && Array.isArray(item.categories)) {
    keywords.push(...item.categories);
  } else if (item.category) {
    if (Array.isArray(item.category)) {
      keywords.push(...item.category);
    } else {
      keywords.push(item.category);
    }
  }
  
  // Filtrer les catégories génériques
  const filtered = keywords
    .filter(k => k && typeof k === 'string')
    .filter(k => {
      const upper = k.toUpperCase();
      return !['SERVICES', 'FOURNITURES', 'TRAVAUX'].includes(upper);
    })
    .map(k => k.trim())
    .filter(k => k.length > 0);
  
  return filtered;
}
```

### Catégories Exclues

Les catégories génériques suivantes sont automatiquement exclues :
- `SERVICES`
- `FOURNITURES`
- `TRAVAUX`

---

## 🚫 Filtrage des Attributions

### Principe

**Important** : MarchesOnline publie à la fois des appels d'offres ET des avis d'attribution. Les attributions ne doivent **jamais** être traitées comme des AO.

### Détection des Attributions

```typescript
function isAttribution(item: any): boolean {
  // Méthode 1 : Vérifier l'URL
  const url = item.guid || item.link || '';
  if (url.includes('/attribution/') || url.includes('/am-')) {
    return true;
  }
  
  // Méthode 2 : Vérifier la description
  const description = item.description || '';
  if (description.includes('Avis d\'attribution') || 
      description.includes('avis d\'attribution') ||
      description.includes('Attribution de marché')) {
    return true;
  }
  
  return false;
}
```

### Exclusion Automatique

Les attributions sont automatiquement exclues avant normalisation :

```typescript
// Dans execute()
if (isAttribution(item)) {
  console.log(`[MarchesOnline] ⏭️  Attribution ignorée: ${item.title?.slice(0, 50)}...`);
  continue;
}
```

---

## ❌ Détection des Annulations

### Principe

Les avis d'annulation doivent être détectés et marqués avec `etat: 'AVIS_ANNULE'` pour traitement spécial dans le workflow.

### Détection des Annulations

```typescript
function isCancellation(item: any): boolean {
  const description = item.description || '';
  const title = item.title || '';
  
  const cancellationPatterns = [
    /avis\s+d['']annulation/i,
    /annulation\s+d['']avis/i,
    /marché\s+annulé/i,
    /procédure\s+annulée/i
  ];
  
  return cancellationPatterns.some(pattern => 
    pattern.test(description) || pattern.test(title)
  );
}
```

### Marquage dans CanonicalAO

```typescript
const isAnnule = isCancellation(item);
const etat = isAnnule ? 'AVIS_ANNULE' : null;
const nature_label = isAnnule ? 'Avis d\'annulation' : null;
```

---

## 📧 Extraction Email Acheteur

### Principe

L'email de l'acheteur est extrait depuis la description HTML, avec priorité pour l'attribut `data-email` (format MarchesOnline).

### Fonction d'Extraction

```typescript
function extractEmail(text: string): string | null {
  // Priorité 1 : Chercher dans l'attribut data-email
  // Format: <span class="jqMailto" data-email="email@example.com">
  const dataEmailMatch = text.match(/data-email\s*=\s*["']([^"']+@[^"']+)["']/i);
  if (dataEmailMatch) return dataEmailMatch[1].trim();
  
  // Priorité 2 : Chercher dans le texte (regex standard)
  const match = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}
```

### Formats Supportés

1. **Attribut HTML** : `<span class="jqMailto" data-email="contact@example.com">`
2. **Texte brut** : "Email : contact@example.com"

---

## 🔄 Traitement des Dates

### Publication Date

La date de publication peut être dans `pubDate` (RFC 822) ou `dc:date` (ISO) :

```typescript
const pubDateRaw = item.pubDate || item['dc:date'] || null;
const pubDate = pubDateRaw
  ? new Date(pubDateRaw).toISOString().split('T')[0]
  : null;
```

### Deadline (Date Limite)

La date limite est extraite depuis `dc:dateAccepted` :

```typescript
const deadlineRaw = item.deadline || item['dc:dateAccepted'] || null;
const deadline = deadlineRaw
  ? new Date(deadlineRaw).toISOString().split('T')[0]
  : null;
```

### Filtrage par Date

Les items sont filtrés pour ne garder que ceux publiés à la date cible (`since` ou veille par défaut) :

```typescript
const targetDate = since || new Date(Date.now() - 86400000).toISOString().split('T')[0];

if (pubDate && pubDate !== targetDate) {
  continue; // Ignorer les items hors période
}
```

---

## 🏭 Extraction Type de Marché

### Principe

Le type de marché est détecté depuis le titre ou la description en cherchant des mots-clés spécifiques.

### Fonction d'Extraction

```typescript
function extractTypeMarche(text: string): string | null {
  const upper = text.toUpperCase();
  if (upper.includes('SERVICE') || upper.includes('CONSEIL')) return 'SERVICES';
  if (upper.includes('FOURNITURE')) return 'FOURNITURES';
  if (upper.includes('TRAVAUX') || upper.includes('CONSTRUCTION')) return 'TRAVAUX';
  return null;
}
```

### Filtrage Optionnel

Si `typeMarche` est fourni dans l'input, seuls les AO correspondants sont conservés :

```typescript
if (typeMarche && normalized.classification.type_marche !== typeMarche) {
  continue;
}
```

---

## 🔗 Intégration dans le Workflow

### Étape `fetch-and-prequalify`

L'outil MarchesOnline est appelé **après** BOAMP dans l'étape `fetch-and-prequalify` :

```typescript
// 1. Récupération BOAMP (toujours)
const boampData = await boampFetcherTool.execute!({
  since: input.since || yesterday,
  typeMarche: input.typeMarche || 'SERVICES'
});

// 2. Récupération MarchesOnline (si configuré)
let marchesonlineData = null;
if (input.marchesonlineRSSUrls && input.marchesonlineRSSUrls.length > 0) {
  marchesonlineData = await marchesonlineRSSFetcherTool.execute!({
    rssUrls: input.marchesonlineRSSUrls,
    since: input.since || yesterday,
    typeMarche: input.typeMarche || 'SERVICES'
  });
}
```

### Déduplication Cross-Platform

Les AO MarchesOnline sont comparés avec BOAMP via UUID procédure avant d'être ajoutés au batch :

```typescript
// Trouver les matches BOAMP pour chaque AO MarchesOnline
const marchesonlineWithMatches = marchesonlineData.records.map(ao => ({
  ao,
  existingBOAMP: await findBOAMPMatchByUUID(ao.uuid_procedure)
}));

// Filtrer : garder uniquement les AO MarchesOnline SANS match BOAMP
const uniqueMarchesonlineAOs = marchesonlineData.records.filter((ao, index) => {
  const match = marchesonlineWithMatches[index];
  return !match.existingBOAMP; // Exclure les doublons
});
```

### Configuration Client

Les URLs RSS peuvent être configurées au niveau client (profil Supabase) ou passées en input :

```typescript
// Depuis profil client
const clientRSSUrls = client.profile?.marchesonlineRSSUrls || [];

// Depuis input workflow (override)
const rssUrls = input.marchesonlineRSSUrls || clientRSSUrls;
```

---

## 📊 Métriques et Statistiques

### Retour de l'Outil

L'outil retourne des statistiques détaillées :

```typescript
{
  source: 'MARCHESONLINE',
  query: {
    rssUrls: ['https://...', 'https://...'],
    since: '2025-12-17',
    typeMarche: 'SERVICES'
  },
  total_count: 45,        // Nombre total d'AO récupérés
  fetched: 45,            // Nombre effectivement récupérés (identique ici)
  records: CanonicalAO[], // Tableau d'AO normalisés
  status: 'success'       // Statut de l'opération
}
```

### Logs Console

L'outil génère des logs détaillés pour le debugging :

```
[MarchesOnline] Fetching https://www.marchesonline.com/rss/... ...
[MarchesOnline] https://www.marchesonline.com/rss/...: 120 items trouvés
[MarchesOnline] ⏭️  Attribution ignorée: Marché attribué à...
[MarchesOnline] Total: 45 AO récupérés
```

---

## ⚠️ Gestion des Erreurs

### Erreurs de Parsing RSS

Si un flux RSS est inaccessible ou invalide, l'erreur est loggée mais n'interrompt pas le traitement des autres flux :

```typescript
try {
  const feed = await parser.parseURL(rssUrl);
  // Traitement...
} catch (error) {
  console.error(`[MarchesOnline] Erreur lors de la récupération du flux RSS ${rssUrl}:`, error);
  // Continue avec les autres flux
}
```

### Items Invalides

Les items RSS invalides (sans titre, sans GUID) sont automatiquement ignorés lors de la normalisation.

---

## 🔄 Différences avec BOAMP

| Aspect | BOAMP | MarchesOnline |
|--------|-------|---------------|
| **Source** | API OpenDataSoft v2.1 | Flux RSS |
| **Pagination** | Oui (pageSize, offset) | Non (flux complet) |
| **Filtrage API** | Oui (query params) | Non (filtrage post-parsing) |
| **UUID Procédure** | Champ direct `uuid_procedure` | Extraction depuis description HTML |
| **SIRET** | Champ direct `siret` | Extraction depuis description HTML |
| **Région** | Champ direct `region` | Extraction depuis dc:Location ou Code Postal |
| **Mots-clés** | Champ direct `keywords` | Extraction depuis catégories RSS |
| **Attributions** | Exclues côté API | Exclusion manuelle (isAttribution) |
| **Annulations** | Champ `etat` direct | Détection manuelle (isCancellation) |

---

## 🎯 Cas d'Usage

### 1. Veille Quotidienne Standard

```typescript
const result = await marchesonlineRSSFetcherTool.execute!({
  rssUrls: [
    'https://www.marchesonline.com/rss/services',
    'https://www.marchesonline.com/rss/fournitures'
  ],
  since: '2025-12-17',
  typeMarche: 'SERVICES'
});
```

### 2. Veille Multi-Sources

```typescript
// Récupération depuis plusieurs flux RSS spécialisés
const result = await marchesonlineRSSFetcherTool.execute!({
  rssUrls: [
    'https://www.marchesonline.com/rss/services',
    'https://www.marchesonline.com/rss/services/ile-de-france',
    'https://www.marchesonline.com/rss/services/nouvelle-aquitaine'
  ],
  since: '2025-12-17'
});
```

### 3. Intégration Workflow

```typescript
// Dans ao-veille.ts
const marchesonlineData = await marchesonlineRSSFetcherTool.execute!({
  rssUrls: input.marchesonlineRSSUrls || client.profile?.marchesonlineRSSUrls || [],
  since: input.since || yesterday,
  typeMarche: input.typeMarche || 'SERVICES'
});
```

---

## 📝 Notes Techniques

### Performance

- **Parsing RSS** : Asynchrone, traitement séquentiel des flux
- **Filtrage** : Post-parsing (pas de filtrage côté serveur RSS)
- **Normalisation** : Synchrone, traitement mémoire

### Limitations

- **Pas de pagination** : Les flux RSS retournent un nombre limité d'items (généralement 50-100)
- **Pas de filtrage API** : Tout le filtrage se fait côté client après parsing
- **Dépendance réseau** : Chaque flux RSS doit être accessible

### Améliorations Futures

- Cache des flux RSS pour éviter les requêtes répétées
- Support de la pagination si MarchesOnline l'implémente
- Retry automatique en cas d'échec de parsing

---

## 🔗 Références

- **Code Source** : `src/mastra/tools/marchesonline-rss-fetcher.ts`
- **Utilitaires Déduplication** : `src/utils/cross-platform-dedup.ts`
- **Workflow Principal** : `src/mastra/workflows/ao-veille.ts`
- **Bibliothèque RSS** : [rss-parser](https://www.npmjs.com/package/rss-parser)
- **Documentation BOAMP** : `BOAMP_FETCH.md`
- **Documentation Workflow** : `WORKFLOW_AO_VEILLE.md`

---

**Dernière mise à jour** : Décembre 2025
