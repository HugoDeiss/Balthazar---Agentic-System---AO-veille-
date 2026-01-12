# Documentation : Système de Keyword Matching Balthazar

## Vue d'ensemble

Le système de keyword matching permet de pré-scorer les appels d'offres (AO) pour déterminer leur pertinence pour Balthazar Consulting avant de passer par l'analyse LLM coûteuse. Ce pré-scoring permet d'économiser ~50-60% des coûts LLM en filtrant les AO non pertinents.

## Architecture

### Flux de traitement

```
AO Input
  ↓
normalizeText (normalisation accents, espaces)
  ↓
findMatchesWithDeduplication (matching optimisé O(n))
  ↓
calculateCategoryScore (scoring logarithmique gradué)
  ↓
calculateConfidence (basé sur axes critiques)
  ↓
calculateEnhancedKeywordScore (bonus/malus métier)
  ↓
shouldSkipLLM (décision intelligente)
  ↓
{ Skip LLM ? → handleSkipLLMAOStep : analyzeAOCompleteWorkflow }
```

## Composants principaux

### 1. Lexique Balthazar (`balthazarLexicon`)

#### Secteurs cibles (pondération 3x-4x)
- **mobilite** (weight: 3) : SNCF, RATP, IDFM, transports publics, mobilité urbaine
- **assurance** (weight: 3) : MAIF, Groupama, mutuelles, protection sociale
- **energie** (weight: 3) : EDF, Engie, transition énergétique, réseaux
- **service_public** (weight: 3) : Collectivités, administrations, politiques publiques
- **entreprise_mission** (weight: 4) : Société à mission, raison d'être (cœur métier Balthazar)

#### Expertises métier (pondération 2x)
- **strategie** : Plan stratégique, diagnostic, vision
- **transformation** : Conduite du changement, modernisation
- **raison_etre** : Raison d'être, société à mission
- **gouvernance** : CODIR/COMEX, pilotage, organisation
- **rse** : Responsabilité sociétale, ESG, transition écologique
- **experience_usager** : Expérience client, satisfaction, parcours
- **strategie_developpement** : Trajectoire, M&A, innovation
- **strategie_transformation** : Roadmap, modèle opérationnel
- **strategie_responsable** : Feuille de route RSE, CSRD
- **strategie_mobilisation** : Projet d'entreprise, alignement parties prenantes

#### Posture intervention (pondération 1x)
- Méthodologie Balthazar : co-construction, séminaires CODIR/COMEX
- Livrables typiques : diagnostic stratégique, feuille de route, récit
- Approche singularité : ADN entreprise, essentiel, conviction

#### Red flags (pénalité -30pts)
- Fournitures matériel, livraisons
- Maintenance IT, développement applicatif
- Travaux publics, génie civil, BTP
- Formation catalogue (vs formation-action ✅)
- AMO technique, système information

#### Clients références (bonus +15pts)
- Mobilité : RATP, SNCF, IDFM, SYTRAL, TCL Lyon
- Assurance : MAIF, Groupama, Carsat
- Énergie : EDF, Engie, GRT Gaz, GRDF
- Autres : GCA, Lagardère Travel Retail

### 2. Fonctions de matching

#### `normalizeText(text: string): string`
Normalise un texte pour matching robuste :
- Suppression accents
- Normalisation apostrophes
- Normalisation espaces

#### `findMatchesWithDeduplication(fullText, keywords, patterns): string[]`
Trouve les matches avec déduplication optimisée O(n) :
- Priorise expressions longues (évite double comptage)
- Vérifie plages couvertes pour éviter overlaps
- Retourne liste dédupliquée de keywords matchés

### 3. Fonctions de scoring

#### `calculateCategoryScore(matches, weight, maxScore): number`
Calcule le score d'une catégorie avec scoring logarithmique gradué :

**Formule** : `log(n+1) × weight × 3.5` (plafonné à `maxScore`)

**Exemples** (weight=3, maxScore=15) :
- 1 match = log(2) × 3 × 3.5 ≈ 7.3pts
- 2 matches = log(3) × 3 × 3.5 ≈ 11.5pts
- 3 matches = log(4) × 3 × 3.5 ≈ 14.5pts
- 5+ matches = 15pts (plafond)

**Avantage** : Graduation douce qui récompense la diversité sans plafonner immédiatement.

#### `calculateConfidence(secteurScore, expertiseScore, ...): 'HIGH' | 'MEDIUM' | 'LOW'`
Calcule la confidence basée sur axes critiques (secteur + expertise) :

**Logique** :
- **HIGH** : Les 2 axes critiques matchés avec score ≥40 OU 1 axe ≥30
- **MEDIUM** : Au moins 1 axe critique avec score ≥15 OU score combiné ≥25
- **LOW** : Sinon

**Avantage** : Réduit les faux négatifs (AO pertinents avec score faible mais axes critiques présents).

### 4. Fonctions de scoring amélioré

#### `calculateEnhancedKeywordScore(ao, baseScoreResult): EnhancedKeywordScoreResult`
Applique bonus/malus métier au score de base :

**Bonus** :
- Client référence Balthazar : +15pts
- Raison d'être / Société à mission : +10pts
- Niveau CODIR/COMEX explicite : +8pts
- Multi-expertises (2+) : +5pts

**Malus** :
- Red flags critiques : -30pts (mais pas éliminatoire)
- Aucun secteur cible : -15pts

**Score final** : Plafonné entre 0 et 100.

#### `shouldSkipLLM(scoreResult): { skip, reason?, priority }`
Détermine si l'analyse LLM doit être skippée :

**Logique** :
1. Score < 20 → **SKIP** (trop faible)
2. Red flags avec score ajusté < 15 → **SKIP** (red flags critiques)
3. Score 20-29 avec HIGH confidence → **ANALYSER** (exception importante)
4. Score 20-29 sans HIGH confidence → **SKIP** (score faible)
5. Score 30-39 avec LOW confidence → **SKIP** (économiser)
6. Score ≥30 → **ANALYSER** (priorité selon score/confidence)

**Avantage** : Gère les cas limites (HIGH confidence même avec score < 30).

## Exemples de scores

### Exemple 1 : AO très pertinent
```
Titre: "Stratégie transformation SNCF"
Secteurs: mobilite (SNCF) → 12pts
Expertises: strategie (stratégie) + transformation → 18pts
Posture: diagnostic, accompagnement → 6pts
Client référence: SNCF → +15pts bonus
---
Score base: 36pts
Score avec bonus: 51pts
Confidence: HIGH (secteur + expertise)
Skip LLM: NON (priorité: MEDIUM)
```

### Exemple 2 : AO pertinent mais score faible
```
Titre: "Gouvernance CODIR"
Secteurs: aucun → 0pts
Expertises: gouvernance (CODIR) → 8pts
Posture: séminaire → 3pts
---
Score base: 11pts
Confidence: MEDIUM (expertise seule)
Skip LLM: OUI (score trop faible)
```

### Exemple 3 : AO avec red flags
```
Titre: "Fourniture matériel informatique"
Secteurs: aucun → 0pts
Expertises: aucun → 0pts
Red flags: fourniture matériel → -30pts
---
Score base: 0pts
Score avec malus: 0pts
Skip LLM: OUI (red flags critiques)
```

## Métriques de performance

### Objectifs
- **Couverture** : 60% → 90% AO pertinents détectés
- **Faux positifs** : Réduction de ~40%
- **Économie LLM** : 50-60% coûts évités
- **Précision confidence** : >85%

### Validation
Utiliser les scripts de test :
- `scripts/test-keyword-enrichment.ts` : Validation enrichissement lexique
- `scripts/test-keyword-scoring.ts` : Validation scoring logarithmique
- `scripts/test-keyword-end-to-end.ts` : Mesure précision/rappel sur 50 AO

## Évolutions futures

### Améliorations possibles
1. **Machine Learning** : Entraîner un modèle sur AO historiques pour affiner scoring
2. **Feedback loop** : Ajuster coefficients selon résultats réels Balthazar
3. **Synonymes** : Ajouter détection de synonymes (ex: "conseil" = "accompagnement")
4. **Contextes** : Prendre en compte contexte (ex: "formation-action" ≠ "formation catalogue")

### Maintenance
- Mettre à jour lexique régulièrement selon nouveaux secteurs/expertises Balthazar
- Ajuster seuils skip LLM selon économie réelle vs précision
- Monitorer métriques précision/rappel sur production
