#!/usr/bin/env ts-node
// ════════════════════════════════════════════════════════════════
// SCRIPT DE TEST : Validation enrichissement lexique keywords
// ════════════════════════════════════════════════════════════════

import 'dotenv/config';
import { calculateKeywordScore } from '../src/utils/balthazar-keywords';

// ────────────────────────────────────────────────────────────────
// DONNÉES DE TEST
// ────────────────────────────────────────────────────────────────

// 5 AO pertinents Balthazar (devraient être bien détectés)
const AO_PERTINENTS = [
  {
    title: "Accompagnement stratégique transformation digitale SNCF",
    description: "Mission de conseil en stratégie de transformation numérique pour SNCF. Co-construction d'une feuille de route avec séminaire CODIR. Diagnostic stratégique et plan de transformation.",
    keywords: ["stratégie", "transformation", "sncf", "codir"],
    acheteur: "SNCF"
  },
  {
    title: "Mission raison d'être et passage en société à mission pour MAIF",
    description: "Accompagnement pour définir la raison d'être et préparer le passage en société à mission. Ateliers participatifs avec parties prenantes.",
    keywords: ["raison d'être", "société à mission", "maif"],
    acheteur: "MAIF"
  },
  {
    title: "Stratégie de développement et trajectoire pour RATP",
    description: "Élaboration d'une stratégie de développement avec analyse de marché et études prospectives. Business plan et innovation.",
    keywords: ["stratégie", "développement", "ratp", "trajectoire"],
    acheteur: "RATP"
  },
  {
    title: "Feuille de route RSE et transition écologique EDF",
    description: "Définition d'une feuille de route RSE avec reporting extra-financier. Transition écologique et convention entreprises climat.",
    keywords: ["rse", "transition écologique", "edf", "csrd"],
    acheteur: "EDF"
  },
  {
    title: "Stratégie de mobilisation et projet d'entreprise pour collectivité",
    description: "Accompagnement pour embarquer parties prenantes dans un projet d'entreprise. Séminaire stratégique et alignement CODIR/COMEX.",
    keywords: ["mobilisation", "projet d'entreprise", "codir", "comex"],
    acheteur: "Métropole de Lyon"
  }
];

// 5 AO hors scope (ne devraient pas être détectés)
const AO_HORS_SCOPE = [
  {
    title: "Fourniture de matériel informatique",
    description: "Livraison d'équipements informatiques et maintenance IT. Hébergement serveurs et infrastructure technique.",
    keywords: ["fourniture", "matériel", "informatique"],
    acheteur: "Mairie de Paris"
  },
  {
    title: "Travaux de génie civil et voirie",
    description: "Réalisation de travaux publics, génie civil et voirie. Étude de sol et maîtrise d'ouvrage déléguée.",
    keywords: ["travaux", "génie civil", "voirie"],
    acheteur: "Conseil départemental"
  },
  {
    title: "Formation bureautique et technique",
    description: "Organisme de formation proposant catalogue de formations bureautiques et techniques.",
    keywords: ["formation", "bureautique", "catalogue"],
    acheteur: "Centre de formation"
  },
  {
    title: "Amo système information et développement applicatif",
    description: "Assistance maîtrise d'ouvrage SI et développement applicatif. Intégration système et génie logiciel.",
    keywords: ["amo", "système information", "développement"],
    acheteur: "Entreprise IT"
  },
  {
    title: "Prestations de nettoyage et entretien",
    description: "Services de nettoyage, entretien et maintenance technique. Gardiennage et surveillance.",
    keywords: ["nettoyage", "entretien", "maintenance"],
    acheteur: "Syndicat"
  }
];

// ────────────────────────────────────────────────────────────────
// FONCTIONS DE TEST
// ────────────────────────────────────────────────────────────────

function testEnrichment() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST ENRICHISSEMENT LEXIQUE KEYWORDS');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test AO pertinents
  console.log('📊 TEST 1 : AO PERTINENTS BALTHAZAR\n');
  let pertinentsDetected = 0;
  let totalScorePertinents = 0;
  
  AO_PERTINENTS.forEach((ao, index) => {
    const result = calculateKeywordScore(
      ao.title,
      ao.description,
      ao.keywords,
      ao.acheteur
    );
    
    totalScorePertinents += result.score;
    const isDetected = result.score >= 30; // Seuil minimum pour être considéré comme détecté
    if (isDetected) pertinentsDetected++;
    
    console.log(`AO ${index + 1}: ${ao.title.substring(0, 60)}...`);
    console.log(`   Score: ${result.score}/100 (${result.confidence})`);
    console.log(`   Secteurs matchés: ${result.secteur_matches.length}`);
    console.log(`   Expertises matchées: ${result.expertise_matches.length}`);
    console.log(`   Keywords: ${result.allMatches.slice(0, 5).join(', ')}${result.allMatches.length > 5 ? '...' : ''}`);
    console.log(`   ✅ Détecté: ${isDetected ? 'OUI' : 'NON'}\n`);
  });

  // Test AO hors scope
  console.log('📊 TEST 2 : AO HORS SCOPE\n');
  let horsScopeDetected = 0;
  let totalScoreHorsScope = 0;
  
  AO_HORS_SCOPE.forEach((ao, index) => {
    const result = calculateKeywordScore(
      ao.title,
      ao.description,
      ao.keywords,
      ao.acheteur
    );
    
    totalScoreHorsScope += result.score;
    const isDetected = result.score >= 30; // Devrait être faible
    if (isDetected) horsScopeDetected++;
    
    console.log(`AO ${index + 1}: ${ao.title.substring(0, 60)}...`);
    console.log(`   Score: ${result.score}/100 (${result.confidence})`);
    console.log(`   Red flags: ${result.red_flags_detected.length > 0 ? result.red_flags_detected.join(', ') : 'aucun'}`);
    console.log(`   ✅ Détecté: ${isDetected ? 'OUI (faux positif!)' : 'NON (correct)'}\n`);
  });

  // Résultats
  console.log('═══════════════════════════════════════════════════════════');
  console.log('RÉSULTATS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const avgScorePertinents = totalScorePertinents / AO_PERTINENTS.length;
  const avgScoreHorsScope = totalScoreHorsScope / AO_HORS_SCOPE.length;
  const precision = pertinentsDetected / AO_PERTINENTS.length;
  const recall = pertinentsDetected / AO_PERTINENTS.length; // Dans ce cas, même chose
  
  console.log(`📈 AO Pertinents:`);
  console.log(`   Détectés: ${pertinentsDetected}/${AO_PERTINENTS.length} (${(precision * 100).toFixed(1)}%)`);
  console.log(`   Score moyen: ${avgScorePertinents.toFixed(1)}/100\n`);
  
  console.log(`📉 AO Hors Scope:`);
  console.log(`   Détectés (faux positifs): ${horsScopeDetected}/${AO_HORS_SCOPE.length}`);
  console.log(`   Score moyen: ${avgScoreHorsScope.toFixed(1)}/100\n`);
  
  console.log(`✅ Précision: ${(precision * 100).toFixed(1)}%`);
  console.log(`✅ Rappel: ${(recall * 100).toFixed(1)}%`);
  console.log(`✅ Taux faux positifs: ${(horsScopeDetected / AO_HORS_SCOPE.length * 100).toFixed(1)}%\n`);
  
  // Validation
  const isSuccess = precision >= 0.8 && horsScopeDetected <= 1;
  console.log(`\n${isSuccess ? '✅ TEST RÉUSSI' : '❌ TEST ÉCHOUÉ'}`);
  console.log(`   Critères: Précision ≥80% et ≤1 faux positif\n`);
  
  return isSuccess;
}

// ────────────────────────────────────────────────────────────────
// EXECUTION
// ────────────────────────────────────────────────────────────────

if (require.main === module) {
  const success = testEnrichment();
  process.exit(success ? 0 : 1);
}

export { testEnrichment };
