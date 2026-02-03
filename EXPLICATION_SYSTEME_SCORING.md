# 📊 Explication Détaillée du Système de Scoring des Appels d'Offres

**Document explicatif complet du système d'analyse et de scoring pour déterminer la pertinence d'un appel d'offres pour Balthazar Consulting.**

---

## 🎯 Vue d'Ensemble

Le système utilise une **double approche** pour analyser les appels d'offres :

1. **Analyse par mots-clés** (gratuite, rapide) : Détection automatique de secteurs, expertises et signaux
2. **Analyse par Intelligence Artificielle** (IA) : Analyse contextuelle approfondie par un agent spécialisé

Ces deux analyses se combinent pour produire un **score final** et une **priorité** (HIGH, MEDIUM, LOW).

---

## 📋 PARTIE 1 : L'ANALYSE PAR MOTS-CLÉS (Keywords)

### Objectif

L'analyse par mots-clés est la **première étape** du processus. Elle permet de :
- ✅ Détecter rapidement si un AO est susceptible d'être pertinent
- ✅ Économiser des coûts en évitant d'appeler l'IA pour les AO non pertinents
- ✅ Fournir un pré-score qui guide l'analyse IA

### Fonctionnement Global

Le système analyse le **titre, la description, les mots-clés et l'acheteur** de l'appel d'offres pour chercher des correspondances avec un **lexique Balthazar** personnalisé.

### Structure du Lexique

Le lexique est organisé en **3 catégories qui attribuent des points** (secteurs, expertises, posture) et une **4e dimension « red flags »** qui ne donne pas de points mais signale les prestations hors périmètre (voir Malus ci-dessous). Les pondérations s’appliquent aux 3 premières catégories :

#### 1. SECTEURS CIBLES (Pondération ×3)

**Pondération la plus forte** car les secteurs cibles sont le critère #1 de pertinence.

**Secteurs détectés :**
- **Mobilités** (weight: 3) : SNCF, RATP, Transdev, Tisséo, ATMB, IDFM, etc.
- **Entreprises à mission** (weight: 4) : Raison d'être, société à mission (cœur métier Balthazar)
- **Assurance** (weight: 3) : MAIF, Groupama, mutuelles, prévoyance
- **Énergie** (weight: 3) : EDF, Engie, transition énergétique
- **Service public** (weight: 3) : Collectivités, établissements publics

**Plafond de score** : 50 points maximum pour tous les secteurs combinés

#### 2. EXPERTISES MÉTIER (Pondération ×2)

**Expertises détectées :**
- **Conseil** (prestation de conseil, consulting, mission de conseil, cabinet de conseil)
- Stratégie (plan stratégique, diagnostic, vision)
- Transformation (conduite du changement, modernisation)
- Raison d'être / Entreprise à mission
- Gouvernance (CODIR, COMEX, direction)
- RSE (responsabilité sociétale, développement durable)
- Expérience usager/client
- + 4 axes stratégiques Balthazar (stratégie développement, transformation, responsable, mobilisation)

**Plafond de score** : 40 points maximum pour toutes les expertises combinées

#### 3. POSTURE D'INTERVENTION (Pondération ×1)

**Méthodologie Balthazar détectée :**
- Approche participative (ateliers, co-construction)
- Intelligence collective
- Niveau CODIR/COMEX
- Séminaires stratégiques
- Diagnostic stratégique

**Plafond de score** : 15 points maximum

### Calcul du Score par Catégorie (Formule Mathématique)

Pour chaque catégorie (secteur, expertise, posture), le score est calculé avec une **fonction logarithmique** :

```
score_catégorie = log(nombre_matches + 1) × poids × 3.5
```

**Détails de la formule :**

1. **`log(nombre_matches + 1)`** : Fonction logarithmique naturelle
   - Permet de **récompenser la diversité** sans sur-pondérer le nombre de matches
   - Exemples :
     - 1 match → log(2) = 0.69
     - 3 matches → log(4) = 1.39
     - 5 matches → log(6) = 1.79
     - 10 matches → log(11) = 2.40

2. **`× poids`** : Multiplicateur selon l'importance
   - Secteurs : ×3 (ou ×4 pour entreprise_mission)
   - Expertises : ×2
   - Posture : ×1

3. **`× 3.5`** : Coefficient de graduation
   - Ajuste la courbe pour une progression douce
   - Optimisé pour éviter les scores trop bas ou trop hauts

4. **Plafond appliqué** : Le score est limité au maximum autorisé pour la catégorie

**Exemple concret :**

Un AO avec 3 secteurs détectés (mobilité, entreprise_mission, service_public) :

```
Pour chaque secteur :
- mobilité : log(3+1) × 3 × 3.5 = 1.39 × 3 × 3.5 = 14.6 points
- entreprise_mission : log(2+1) × 4 × 3.5 = 1.10 × 4 × 3.5 = 15.4 points → plafonné à 18
- service_public : log(1+1) × 3 × 3.5 = 0.69 × 3 × 3.5 = 7.2 points

Total secteur = 14.6 + 18 + 7.2 = 39.8 points (plafonné à 50)
```

### Score de Base (Sans Bonus/Malus)

Le **score de base** est la simple addition des trois catégories :

```
score_base = score_secteurs + score_expertises + score_posture
```

**Plafond total** : 105 points théoriques (50 + 40 + 15), mais en pratique rarement atteint.

### Bonus et Malus Métier

Le système applique ensuite des **bonus et malus** pour affiner le score :

#### BONUS (Points ajoutés)

1. **Client référence Balthazar** : +15 points
   - Détecte les clients déjà connus (SNCF, RATP, ATMB, MAIF, etc.)

2. **Raison d'être en expertise** : +10 points
   - Si "raison d'être" est détectée comme expertise cœur

3. **Entreprise à mission en secteur** : +5 points
   - Si "entreprise à mission" est détectée comme secteur

4. **Niveau CODIR/COMEX explicite** : +8 points
   - Si mention directe de CODIR ou COMEX dans le texte

5. **Multi-expertises** : +5 points
   - Si 2 ou plus expertises détectées

#### MALUS (Points retirés)

1. **Red flags critiques** : -30 points
   - Détecte les prestations hors périmètre :
     - Formation catalogue
     - Travaux / maîtrise d'œuvre
     - IT / développement
     - Fournitures / logistique
     - Juridique pur
     - Actuariat

2. **Aucun secteur cible** : -15 points
   - Si aucun secteur Balthazar n'est détecté

### Score Final Keywords (0-100)

```
score_final_keywords = score_base + bonus - malus
score_final_keywords = Math.max(0, Math.min(100, score_final_keywords))
```

Le score est **plafonné entre 0 et 100**.

### Niveau de Confiance (Confidence)

Le système calcule aussi un **niveau de confiance** (HIGH, MEDIUM, LOW) basé sur les **axes critiques** (secteurs + expertises) :

**Règles de calcul :**

1. **HIGH** si :
   - Les 2 axes critiques (secteur + expertise) sont matchés **ET** score combiné ≥ 40 points
   - **OU** un axe critique a un score très élevé (≥ 30 points)

2. **MEDIUM** si :
   - Au moins 1 axe critique avec score décent (≥ 15 points)
   - **OU** score combiné modéré (≥ 25 points)

3. **LOW** : Tous les autres cas

**Exemple :**
- Secteur : 25 points, Expertise : 20 points → Score combiné = 45 → **HIGH**
- Secteur : 30 points, Expertise : 0 → **HIGH** (un axe très élevé)
- Secteur : 10 points, Expertise : 15 points → **MEDIUM**

### Décision : Skip LLM ou Analyse IA ?

Le système décide automatiquement si l'analyse IA est nécessaire :

**Règles de décision :**

1. **Score < 20** → **SKIP LLM** (trop faible, pas pertinent)

2. **Score 20-30 avec HIGH confidence** → **ANALYSER** (exception : secteur + expertise matchés malgré score faible)

3. **Score 20-30 avec MEDIUM/LOW confidence** → **SKIP LLM**

4. **Score 30-40 avec LOW confidence** → **SKIP LLM** (économie de coûts)

5. **Score ≥ 30** → **ANALYSER avec IA**

**Si skip LLM :** Le score final est basé uniquement sur keywords avec une **pénalité de 30%** :
```
score_final_skip = (score_keywords / 10) × 0.7
```
Maximum possible : 7/10 au lieu de 10/10.

---

## 🤖 PARTIE 2 : L'ANALYSE PAR INTELLIGENCE ARTIFICIELLE (IA)

### Objectif

L'analyse IA permet une **compréhension contextuelle approfondie** que les mots-clés seuls ne peuvent pas fournir. Elle évalue :
- Le **contexte** de la mission
- La **correspondance précise** avec le profil Balthazar
- La **faisabilité** et l'opportunité

### Agent IA Utilisé

**Modèle** : GPT-4o-mini (OpenAI)  
**Agent spécialisé** : `boampSemanticAnalyzer`  
**Coût** : ~0.003€ par appel d'offres analysé

### Structure de l'Analyse IA

L'analyse IA évalue **3 axes distincts** avec des pondérations :

#### Axe 1 : Fit Sectoriel (35% du score)

**Évalue :** Le secteur d'activité de l'acheteur et son alignement avec les secteurs cibles Balthazar.

**Secteurs détectés :**
- `mobilite` : Transport public, infrastructures mobilité
- `assurance` : Mutuelles, prévoyance
- `energie` : Producteurs, réseaux, transition énergétique
- `service_public` : Collectivités, EPA, opérateurs publics
- `entreprise_mission` : Sociétés à mission, raison d'être
- `autre` : Secteur non cible

**Score 0-10 :**
- **9-10** : Secteur prioritaire (mobilités, entreprises à mission)
- **7-8** : Secteur pertinent (assurance, énergie, service public)
- **5-6** : Secteur limite mais acceptable
- **3-4** : Secteur hors cibles
- **0-2** : Hors secteurs cibles

#### Axe 2 : Fit Expertise (35% du score)

**Évalue :** Les expertises Balthazar requises pour la mission.

**Expertises détectées :**
- `strategie` : Plan stratégique, diagnostic
- `transformation` : Conduite du changement
- `raison_etre` : Raison d'être, société à mission
- `gouvernance` : CODIR, COMEX, direction
- `rse` : Responsabilité sociétale, développement durable
- `experience_usager` : Relation client, satisfaction

**Score 0-10 :**
- **9-10** : 2+ expertises cœur Balthazar
- **7-8** : 1 expertise forte
- **5-6** : 1 expertise acceptée
- **3-4** : Expertise tangente
- **0-2** : Aucune expertise conseil stratégie

#### Axe 3 : Fit Posture (20% du score)

**Évalue :** Le niveau d'intervention et l'approche méthodologique.

**Niveaux détectés :**
- `CODIR` : Comité de direction
- `COMEX` : Comité exécutif
- `direction` : Direction générale
- `operationnel` : Niveau opérationnel
- `inconnu` : Non spécifié

**Approches détectées :**
- Ateliers, intelligence collective
- Co-construction, participatif
- Séminaires stratégiques

**Score 0-10 :**
- **9-10** : CODIR/COMEX + approche participative Balthazar
- **7-8** : Niveau direction + méthodologie Balthazar
- **5-6** : Niveau direction (approche floue)
- **3-4** : Niveau opérationnel
- **0-2** : Pas d'accompagnement stratégique

### Calcul du Score Sémantique Global

Le score sémantique global est une **moyenne pondérée** des 3 axes :

```
score_sémantique_global = (0.35 × fit_sectoriel) + (0.35 × fit_expertise) + (0.20 × fit_posture)
```

**Exemple concret :**
- Fit sectoriel : 10/10
- Fit expertise : 9/10
- Fit posture : 9/10

```
score = (0.35 × 10) + (0.35 × 9) + (0.20 × 9)
score = 3.5 + 3.15 + 1.8
score = 8.45/10
```

### Critères Balthazar (Règle 3/4)

L'IA vérifie aussi si **au moins 3 critères sur 4** sont validés :

1. ✅ **Client/secteur dans cibles Balthazar**
2. ✅ **Besoin centré sur transformation stratégique**
3. ✅ **Ouverture du marché** (pas de "renouvellement" ou "titulaire sortant")
4. ✅ **Possibilité d'interaction directe**

Si **3/4 critères validés** → AO considéré comme pertinent.

### Recommandation IA

L'IA produit une **recommandation** finale :

- **HAUTE_PRIORITE** : Score ≥ 8.5, critères Balthazar validés
- **MOYENNE_PRIORITE** : Score 6-8.5, critères partiellement validés
- **BASSE_PRIORITE** : Score 4-6, faible pertinence
- **NON_PERTINENT** : Score < 4, red flags, hors périmètre

### Construction du Prompt IA

Le prompt envoyé à l'IA contient :

1. **Few-shot examples** : 3 exemples réels d'AO Balthazar
   - Exemple 1 : Tisséo (HAUTE_PRIORITE) - Plan stratégique + raison d'être
   - Exemple 2 : ATMB (HAUTE_PRIORITE) - Entreprise à mission
   - Exemple 3 : Formation Microsoft (NON_PERTINENT) - Red flag

2. **Contexte keywords** : Résultats de l'analyse mots-clés
   - Score keywords (0-100)
   - Secteurs détectés
   - Expertises détectées
   - Red flags

3. **Données AO** : Titre, organisme, description, mots-clés

4. **Instructions** : Guide de scoring détaillé avec seuils

### Format de Réponse Structurée

L'IA retourne un **JSON structuré** (format Zod) garantissant :
- ✅ Validation automatique du format
- ✅ Typage TypeScript complet
- ✅ Pas d'erreur de parsing

**Exemple de réponse :**
```json
{
  "fit_sectoriel": {
    "score": 10,
    "secteur_detecte": "mobilite",
    "justification": "SNCF = secteur mobilité prioritaire Balthazar"
  },
  "fit_expertise": {
    "score": 9,
    "expertises_detectees": ["strategie", "transformation", "gouvernance"],
    "justification": "Double expertise cœur Balthazar : plan stratégique + transformation"
  },
  "fit_posture": {
    "score": 9,
    "niveau_intervention": "CODIR",
    "approche": ["ateliers", "intelligence_collective", "co-construction"],
    "justification": "Niveau CODIR + approche participative typique Balthazar"
  },
  "score_semantique_global": 9.4,
  "criteres_balthazar": {
    "secteur_cible": true,
    "besoin_transformation": true,
    "ouverture_marche": true,
    "total_valides": 3
  },
  "recommandation": "HAUTE_PRIORITE",
  "justification_globale": "AO idéal pour Balthazar : secteur mobilité prioritaire, expertises signature, niveau CODIR, approche participative"
}
```

---

## 🎯 PARTIE 3 : LE SCORE FINAL ET LA PRIORISATION

### Calcul du Score Final

Le score final combine **3 composantes** :

```
score_final = (50% × score_sémantique) + (25-30% × score_keywords) + (20% × urgence)
```

**Détails :**

1. **Score sémantique (50%)** : Résultat de l'analyse IA (0-10)
   - Si skip LLM : `semanticScore = 0` (pas d'analyse IA)

2. **Score keywords (25-30%)** : Résultat de l'analyse mots-clés (0-100 → converti en 0-10)
   ```
   keyword_contribution = (score_keywords / 100) × 0.30
   ```

3. **Urgence (20%)** : Basée sur les jours restants avant la deadline
   ```
   urgence = (1 - min(jours_restants / 60, 1)) × 10 × 0.20
   ```
   - Plus la deadline est proche, plus le score d'urgence est élevé
   - Maximum 60 jours (au-delà, urgence = 0)

**Exemple concret :**

Un AO avec :
- Score sémantique : 9.4/10
- Score keywords : 65/100
- Jours restants : 30 jours

```
keyword_contribution = (65 / 100) × 0.30 = 1.95
urgence = (1 - min(30/60, 1)) × 10 × 0.20 = 0.5 × 10 × 0.20 = 1.0

score_final = (9.4 × 0.50) + 1.95 + 1.0
score_final = 4.7 + 1.95 + 1.0
score_final = 7.65/10
```

### Cas Spécial : Skip LLM

Si l'analyse IA est skippée (selon les règles de décision de la Partie 1 : score, confiance, red flags), le score final est calculé différemment :

```
score_final_skip = (score_keywords / 10) × 0.7
```

**Pénalité de 30%** car pas d'analyse sémantique approfondie.

**Maximum possible** : 7/10 au lieu de 10/10.

### Priorisation

Le score final détermine la **priorité** :

- **HIGH** : Score ≥ 8/10
  - Opportunités prioritaires à traiter en premier

- **MEDIUM** : Score ≥ 6/10 et < 8/10
  - Opportunités intéressantes à suivre

- **LOW** : Score < 6/10
  - Opportunités de faible pertinence

---

## 📊 EXEMPLE COMPLET DE CALCUL

### Exemple : AO "Plan stratégique SNCF"

**Données de l'AO :**
- Titre : "Prestation de conseil pour l'élaboration du plan stratégique horizon 2028"
- Organisme : SNCF
- Description : "Mission d'accompagnement pour l'élaboration du plan stratégique 2025-2028..."
- Deadline : 30 jours restants

#### Étape 1 : Analyse Keywords

**Matches détectés :**
- Secteurs : mobilité (SNCF), entreprise_mission
- Expertises : stratégie, transformation, gouvernance
- Posture : CODIR, ateliers, intelligence collective

**Calculs :**
```
score_secteurs = log(3+1) × 3 × 3.5 + log(2+1) × 4 × 3.5
               = 1.39 × 3 × 3.5 + 1.10 × 4 × 3.5
               = 14.6 + 15.4 = 30 points (plafonné à 50)

score_expertises = log(3+1) × 2 × 3.5
                  = 1.39 × 2 × 3.5 = 9.7 points

score_posture = log(3+1) × 1 × 3.5
               = 1.39 × 1 × 3.5 = 4.9 points

score_base = 30 + 9.7 + 4.9 = 44.6 points
```

**Bonus/Malus :**
- Client référence (SNCF) : +15 points
- CODIR explicite : +8 points
- Multi-expertises : +5 points
- Total bonus : +28 points

**Score final keywords :**
```
score_keywords = 44.6 + 28 = 72.6/100
```

**Confidence :** HIGH (secteur + expertise matchés, score combiné > 40)

**Décision :** ANALYSER avec IA (score ≥ 30)

#### Étape 2 : Analyse IA

**Résultats IA :**
- Fit sectoriel : 10/10 (SNCF = mobilité prioritaire)
- Fit expertise : 10/10 (plan stratégique + transformation)
- Fit posture : 9/10 (CODIR + approche participative)

**Score sémantique global :**
```
score_sémantique = (0.35 × 10) + (0.35 × 10) + (0.20 × 9)
                 = 3.5 + 3.5 + 1.8
                 = 8.8/10
```

**Critères Balthazar :** 3/4 validés ✅

**Recommandation :** HAUTE_PRIORITE

#### Étape 3 : Score Final

```
keyword_contribution = (72.6 / 100) × 0.30 = 2.18
urgence = (1 - min(30/60, 1)) × 10 × 0.20 = 1.0

score_final = (8.8 × 0.50) + 2.18 + 1.0
            = 4.4 + 2.18 + 1.0
            = 7.58/10
```

**Priorité :** MEDIUM (score 7.58 < 8.0)

---

## 🔍 DÉTAILS TECHNIQUES SUPPLÉMENTAIRES

### Fonction Logarithmique

La fonction `log(n)` utilisée est le **logarithme naturel** (base e ≈ 2.718).

**Propriétés :**
- Croissance **lente** : récompense la diversité sans sur-pondérer
- Exemples :
  - 1 match → 0.69
  - 3 matches → 1.39
  - 5 matches → 1.79
  - 10 matches → 2.40
  - 20 matches → 3.04

**Avantage :** Évite qu'un AO avec 50 occurrences du mot "mobilité" obtienne un score disproportionné.

### Déduplication des Matches

Le système évite de **compter plusieurs fois** le même mot-clé :

1. Les expressions **longues** sont prioritaires (ex: "plan stratégique" avant "stratégie")
2. Les plages de texte déjà couvertes sont ignorées
3. Un mot-clé n'est compté qu'**une fois par catégorie**

### Normalisation du Texte

Avant l'analyse, le texte est **normalisé** :
- Conversion en minuscules
- Suppression des accents (é → e)
- Normalisation des apostrophes
- Normalisation des espaces

**Exemple :** "Mobilité" et "mobilite" sont traités identiquement.

### Gestion des Erreurs

En cas d'erreur de l'IA :
- **Fallback gracieux** : Score basé uniquement sur keywords
- **Valeur par défaut** : Score sémantique = 0
- **Logs** : Traçabilité complète pour debugging

---

## 📈 RÉSUMÉ DES FORMULES MATHÉMATIQUES

### Score Keywords par Catégorie
```
score_catégorie = min(plafond, round(log(nombre_matches + 1) × poids × 3.5))
```

### Score Final Keywords
```
score_keywords = score_secteurs + score_expertises + score_posture + bonus - malus
score_keywords = max(0, min(100, score_keywords))
```

### Score Sémantique Global
```
score_sémantique = (0.35 × fit_sectoriel) + (0.35 × fit_expertise) + (0.20 × fit_posture)
```

### Score Final
```
score_final = (0.50 × score_sémantique) + (0.30 × score_keywords/10) + (0.20 × urgence)
```

### Urgence
```
urgence = (1 - min(jours_restants / 60, 1)) × 10 × 0.20
```

---

## ✅ CONCLUSION

Le système de scoring combine :
- ✅ **Analyse automatique** par mots-clés (rapide, gratuite)
- ✅ **Analyse contextuelle** par IA (approfondie, précise)
- ✅ **Formules mathématiques** équilibrées (logarithmique pour diversité)
- ✅ **Bonus/malus métier** (clients références, red flags)
- ✅ **Priorisation intelligente** (HIGH, MEDIUM, LOW)

**Résultat :** Un système robuste qui identifie automatiquement les opportunités pertinentes pour Balthazar Consulting.

---

## 📚 GLOSSAIRE

- **AO** : Appel d'Offres
- **LLM** : Large Language Model (modèle de langage, ici GPT-4o-mini)
- **Skip LLM** : Décision de ne pas appeler l'IA pour économiser des coûts
- **Fit** : Correspondance, alignement
- **Red flag** : Signal d'alerte, indicateur de non-pertinence
- **Confidence** : Niveau de confiance dans le score keywords
- **Structured output** : Format de réponse structuré et validé (JSON + Zod)

---

**Document mis à jour :** 2025-02  
**Version :** 1.1  
**Auteur :** Système Balthazar - Agentic System
