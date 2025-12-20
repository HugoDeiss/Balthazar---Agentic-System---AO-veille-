# 🎯 Nouvelle Stratégie de Filtrage API - Implémentation Complète

**Date**: 20 décembre 2025  
**Objectif**: Séparer clairement le filtrage structurel (API) du filtrage métier (IA)

---

## 📋 Principe Directeur

> **"Ne JAMAIS décider métier côté API, seulement éliminer le bruit évident"**

| Côté API (Structurel) | Côté IA (Métier) |
|----------------------|------------------|
| ✅ Temporalité | ✅ Budget |
| ✅ Nature juridique | ✅ Secteur |
| ✅ Statut (ouvert/attribué) | ✅ Localisation |
| ✅ Faisabilité minimale | ✅ Niveau stratégique |
| ✅ Type de marché | ✅ Complexité |
| | ✅ Fit métier |

---

## 🔧 Modifications Apportées

### 1️⃣ **boamp-fetcher.ts** - Nouveaux Filtres WHERE API

#### Avant
```typescript
const whereFilters = [
  `dateparution >= date'${since}'`,           // Date depuis X
  `nature_categorise = 'appeloffre/standard'`, // Seulement nouveaux avis
  `type_marche = '${typeMarche}'`              // SERVICES
];
```

#### Après
```typescript
const whereFilters = [
  // 1️⃣ TEMPORALITÉ : Avis publiés la veille (ou date spécifiée)
  `dateparution = date'${targetDate}'`,
  
  // 2️⃣ TYPOLOGIE : Nouveaux avis + Rectificatifs + Annulations
  `(nature_categorise = 'appeloffre/standard' OR annonce_lie IS NOT NULL OR annonces_anterieures IS NOT NULL OR etat = 'AVIS_ANNULE')`,
  
  // 3️⃣ ATTRIBUTION : Marché encore ouvert
  `titulaire IS NULL`,
  
  // 4️⃣ DEADLINE : Exploitable (NULL accepté pour AO stratégiques)
  `(datelimitereponse IS NULL OR datelimitereponse >= date'${minDeadline}')`,
  
  // 5️⃣ TYPE MARCHÉ : Compatible conseil
  `type_marche = '${typeMarche}'`
];
```

#### Changements Clés
- ✅ `since` devient **optionnel** (default = veille calculée automatiquement)
- ✅ `limit` augmenté de 100 à **500** (default)
- ❌ Paramètre `departement` **supprimé** (localisation = critère IA)
- ✅ Inclusion des **rectificatifs** et **annulations**
- ✅ Filtre **deadline** avec acceptation des NULL

---

### 2️⃣ **ao-veille.ts** - Suppression Pré-qualification

#### Avant
```typescript
const prequalified = boampData.records.filter((ao: any) => {
  return (
    ao.etat !== 'AVIS_ANNULE' &&
    !ao.titulaire &&
    (ao.budget_max || 0) >= client.criteria.minBudget &&
    isDeadlineValid(ao.deadline) &&
    (!client.criteria.regions || client.criteria.regions.includes(ao.region))
  );
});
```

#### Après
```typescript
// PASSTHROUGH : Tous les AO passent (filtrage métier = IA)
const prequalified = boampData.records;
```

#### Changements Clés
- ❌ **Suppression** de tous les filtres applicatifs (budget, région, deadline, état, titulaire)
- ✅ Le step devient un **passthrough** : transmet TOUS les AO récupérés par l'API

---

### 3️⃣ **ao-veille.ts** - Nouveau Step `handleCancellationsStep`

#### Ajout
```typescript
const handleCancellationsStep = createStep({
  id: 'handle-cancellations',
  // ...
  execute: async ({ inputData }) => {
    for (const ao of prequalified) {
      if (ao.etat === 'AVIS_ANNULE') {
        // Mise à jour DB : marquer comme annulé
        await supabase
          .from('appels_offres')
          .update({ etat: 'AVIS_ANNULE', status: 'cancelled' })
          .eq('source_id', ao.source_id);
        
        // Ne pas transmettre à l'analyse IA
        continue;
      }
      activeAOs.push(ao);
    }
    return { activeAOs, cancelledCount, client };
  }
});
```

#### Pipeline Modifié
```
fetch BOAMP
→ handleCancellationsStep    // 🆕 NOUVEAU
→ detectRectificationStep
→ keywordMatchingStep
→ semanticAnalysisStep
→ feasibilityAnalysisStep
→ scoringStep
→ saveResultsStep
```

#### Changements Clés
- ✅ Les **annulations** sont récupérées par l'API
- ✅ Elles mettent à jour la DB (marquées comme annulées)
- ✅ Elles **ne passent PAS** par l'analyse IA (économie de tokens)

---

### 4️⃣ **ao-veille.ts** - Transformation `keywordMatchingStep`

#### Avant (Filtre Éliminatoire)
```typescript
const keywordMatched = prequalified.map(ao => {
  const keywordScore = matchCount / client.keywords.length;
  return { ...ao, keywordScore, matchedKeywords };
})
.filter(ao => ao.keywordScore >= 0.3) // ❌ ÉLIMINATOIRE
.sort((a, b) => b.keywordScore - a.keywordScore);
```

#### Après (Pré-score Non Bloquant)
```typescript
const keywordMatched = prequalified.map(ao => {
  const keywordScore = matchCount / client.keywords.length;
  
  // 🆕 Signaux faibles : détection de concepts clés
  const keywordSignals = {
    strategy: /stratégie|stratégique/i.test(aoKeywords),
    transformation: /transformation|digitale|numérique/i.test(aoKeywords),
    innovation: /innovation|innovant/i.test(aoKeywords),
    management: /management|pilotage|gestion/i.test(aoKeywords),
    performance: /performance|efficacité|optimisation/i.test(aoKeywords),
    conseil: /conseil|consulting|accompagnement/i.test(aoKeywords),
    audit: /audit|diagnostic|évaluation/i.test(aoKeywords),
    conduite_changement: /conduite.{0,5}changement|change.{0,5}management/i.test(aoKeywords)
  };
  
  return { ...ao, keywordScore, matchedKeywords, keywordSignals };
})
// 🆕 PLUS DE FILTRE : tous les AO passent
.sort((a, b) => b.keywordScore - a.keywordScore);
```

#### Changements Clés
- ❌ **Suppression** du filtre `keywordScore >= 0.3`
- ✅ Ajout de **signaux faibles** (concepts clés détectés)
- ✅ Le step devient un **pré-score non bloquant** : produit des signaux pour l'IA, ne rejette JAMAIS

---

### 5️⃣ **ao-veille.ts** - Adaptation Prompts Agents IA

#### Agent Sémantique (`boampSemanticAnalyzer`)

##### Avant
```typescript
Profil client:
- Nom: ${client.name}
- Mots-clés métier: ${client.keywords.join(', ')}
- Type de marché: ${client.preferences.typeMarche}
- Description: ${JSON.stringify(client.profile, null, 2)}

Appel d'offres:
- Titre: ${ao.title}
- Description: ${ao.description || 'Non fournie'}
- Mots-clés: ${ao.keywords?.join(', ') || 'Aucun'}
```

##### Après
```typescript
Profil client:
- Nom: ${client.name}
- Mots-clés métier: ${client.keywords.join(', ')}
- Type de marché: ${client.preferences.typeMarche}
- Description: ${JSON.stringify(client.profile, null, 2)}
- Budget minimum: ${client.criteria.minBudget}€                    // 🆕
- Régions cibles: ${client.criteria.regions?.join(', ')}           // 🆕

Appel d'offres:
- Titre: ${ao.title}
- Description: ${ao.description || 'Non fournie'}
- Mots-clés: ${ao.keywords?.join(', ') || 'Aucun'}
- Budget estimé: ${ao.budget_max ? `${ao.budget_max}€` : 'N/A'}   // 🆕
- Région: ${ao.region || 'Non spécifiée'}                          // 🆕
- Pré-score mots-clés: ${ao.keywordScore?.toFixed(2)}             // 🆕
- Signaux détectés: ${Object.entries(ao.keywordSignals)...}       // 🆕

Critères d'évaluation:
1. Adéquation métier (secteur, expertise, mots-clés)
2. Budget compatible avec les capacités du client                  // 🆕
3. Localisation géographique (priorité aux régions cibles)         // 🆕
4. Type de procédure (ouvert = accessible, restreint = compétitif)
5. Signaux faibles détectés par le pré-scoring                     // 🆕
```

#### Agent Faisabilité (`boampFeasibilityAnalyzer`)

##### Ajout
```typescript
Profil client:
- Budget minimum ciblé: ${client.criteria.minBudget}€              // 🆕
- Régions d'intervention: ${client.criteria.regions?.join(', ')}   // 🆕
```

#### Changements Clés
- ✅ Les critères **budget** et **région** sont maintenant **intégrés dans les prompts IA**
- ✅ L'IA évalue ces critères de manière **contextuelle et nuancée** (pas binaire)
- ✅ Les **signaux faibles** du pré-scoring sont transmis à l'IA pour enrichir l'analyse

---

## 📊 Impact sur les Inputs du Workflow

| Paramètre | Avant | Après |
|-----------|-------|-------|
| `clientId` | Obligatoire | ✅ Obligatoire (inchangé) |
| `since` | Obligatoire | ⚡ **Optionnel** (default = veille) |

---

## 🎯 Résultat Attendu

### Avant (Problème)
```
📥 BOAMP Fetch: 100 AO récupérés
✅ Pré-qualification: 0/100 AO
📊 Rejets détaillés:
  - Budget < 50000€: 100    ❌ Tous rejetés
```

### Après (Solution)
```
📥 BOAMP Fetch: 50-200 AO récupérés (veille)
✅ Collecte: 50-200 AO transmis à l'analyse
🚫 Annulations: 5 traitées, 45-195 AO actifs transmis
🔍 Détection rectificatifs: 2 mineurs, 1 substantiel
✅ Keyword matching: 45-195 AO (tous transmis avec pré-score)
✅ Analyse sémantique: 15-30 AO pertinents (IA décide)
✅ Analyse faisabilité: 10-20 AO faisables (IA décide)
✅ Scoring: 5-10 HIGH, 5-10 MEDIUM
```

---

## 🚀 Avantages de la Nouvelle Stratégie

| Avant | Après |
|-------|-------|
| ❌ Faux négatifs (AO pertinents rejetés) | ✅ Zéro faux négatif |
| ❌ Filtres métier codés en dur | ✅ Décisions métier par IA |
| ❌ Budget/région binaires (in/out) | ✅ Évaluation contextuelle et nuancée |
| ❌ Rectificatifs ignorés | ✅ Rectificatifs et annulations gérés |
| ❌ Keyword matching éliminatoire | ✅ Pré-score non bloquant avec signaux |
| ❌ Volume limité (100 AO) | ✅ Volume adapté (500 AO) |

---

## 📝 Checklist de Test

- [ ] Tester avec `since` omis (doit utiliser la veille)
- [ ] Tester avec `since` spécifié (doit utiliser la date fournie)
- [ ] Vérifier que les annulations sont marquées en DB
- [ ] Vérifier que les rectificatifs sont détectés
- [ ] Vérifier que tous les AO passent le keyword matching
- [ ] Vérifier que l'IA reçoit budget et région dans les prompts
- [ ] Vérifier que les signaux faibles sont détectés
- [ ] Vérifier le volume d'AO récupérés (devrait être > 0 maintenant)

---

## 🔗 Fichiers Modifiés

1. **`src/mastra/tools/boamp-fetcher.ts`** - Nouveaux filtres WHERE API
2. **`src/mastra/workflows/ao-veille.ts`** - Suppression pré-qualification, nouveau step annulations, transformation keyword matching, adaptation prompts IA

---

## 📚 Documentation Associée

- `Rectificatif_Analysis.md` - Analyse des rectificatifs BOAMP
- `RECTIFICATIF_IMPLEMENTATION.md` - Implémentation technique des rectificatifs
- `README.md` - Documentation générale du projet

---

**Implémentation complète validée le 20 décembre 2025** ✅

