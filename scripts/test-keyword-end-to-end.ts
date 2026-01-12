#!/usr/bin/env ts-node
// ════════════════════════════════════════════════════════════════
// SCRIPT DE TEST : Test end-to-end précision/rappel sur 50 AO
// ════════════════════════════════════════════════════════════════

import 'dotenv/config';
import { calculateKeywordScore, calculateEnhancedKeywordScore, shouldSkipLLM } from '../src/utils/balthazar-keywords';

// ────────────────────────────────────────────────────────────────
// DONNÉES DE TEST (25 pertinents + 25 hors scope)
// ────────────────────────────────────────────────────────────────

const AO_PERTINENTS = [
  // Secteur mobilité
  { title: "Stratégie mobilité SNCF", description: "Mission stratégie pour SNCF", keywords: ["stratégie", "sncf"], acheteur: "SNCF" },
  { title: "Transformation RATP", description: "Transformation pour RATP", keywords: ["transformation", "ratp"], acheteur: "RATP" },
  { title: "Gouvernance IDFM", description: "Gouvernance pour IDFM", keywords: ["gouvernance", "idfm"], acheteur: "IDFM" },
  { title: "Stratégie développement transport", description: "Stratégie développement", keywords: ["stratégie", "développement"], acheteur: "SNCF" },
  { title: "Mobilisation parties prenantes mobilité", description: "Mobilisation", keywords: ["mobilisation"], acheteur: "RATP" },
  
  // Secteur assurance
  { title: "Raison d'être MAIF", description: "Raison d'être", keywords: ["raison d'être", "maif"], acheteur: "MAIF" },
  { title: "Stratégie responsable Groupama", description: "Stratégie responsable", keywords: ["stratégie", "responsable"], acheteur: "Groupama" },
  { title: "Transformation assurance", description: "Transformation", keywords: ["transformation"], acheteur: "MAIF" },
  
  // Secteur énergie
  { title: "Feuille de route RSE EDF", description: "RSE", keywords: ["rse", "edf"], acheteur: "EDF" },
  { title: "Transition écologique Engie", description: "Transition", keywords: ["transition", "engie"], acheteur: "Engie" },
  { title: "Stratégie développement énergie", description: "Stratégie", keywords: ["stratégie"], acheteur: "EDF" },
  
  // Secteur service public
  { title: "Projet d'entreprise collectivité", description: "Projet", keywords: ["projet", "entreprise"], acheteur: "Métropole" },
  { title: "Stratégie mobilisation service public", description: "Mobilisation", keywords: ["mobilisation"], acheteur: "Région" },
  { title: "Gouvernance CODIR collectivité", description: "Gouvernance", keywords: ["gouvernance", "codir"], acheteur: "Département" },
  
  // Entreprise à mission
  { title: "Passage société à mission", description: "Société à mission", keywords: ["société à mission"], acheteur: "Entreprise" },
  { title: "Raison d'être et impact", description: "Raison d'être", keywords: ["raison d'être"], acheteur: "Entreprise" },
  
  // Multi-expertises
  { title: "Stratégie transformation gouvernance", description: "Multi", keywords: ["stratégie", "transformation", "gouvernance"], acheteur: "Client" },
  { title: "RSE et expérience usager", description: "Multi", keywords: ["rse", "expérience usager"], acheteur: "Client" },
  { title: "Stratégie développement responsable", description: "Multi", keywords: ["stratégie", "développement", "responsable"], acheteur: "Client" },
  
  // Posture Balthazar
  { title: "Co-construction stratégie", description: "Co-construction", keywords: ["co-construction", "stratégie"], acheteur: "Client" },
  { title: "Séminaire stratégique CODIR", description: "Séminaire", keywords: ["séminaire", "codir"], acheteur: "Client" },
  { title: "Diagnostic stratégique et feuille de route", description: "Diagnostic", keywords: ["diagnostic", "feuille de route"], acheteur: "Client" },
  { title: "Singularité entreprise et projet", description: "Singularité", keywords: ["singularité", "projet"], acheteur: "Client" },
  { title: "Alignement parties prenantes", description: "Alignement", keywords: ["alignement", "parties prenantes"], acheteur: "Client" }
];

const AO_HORS_SCOPE = [
  // Red flags techniques
  { title: "Fourniture matériel informatique", description: "Fourniture", keywords: ["fourniture", "matériel"], acheteur: "Client" },
  { title: "Livraison équipement", description: "Livraison", keywords: ["livraison"], acheteur: "Client" },
  { title: "Maintenance IT", description: "Maintenance", keywords: ["maintenance", "it"], acheteur: "Client" },
  { title: "Développement applicatif", description: "Développement", keywords: ["développement", "applicatif"], acheteur: "Client" },
  { title: "Amo système information", description: "Amo", keywords: ["amo", "système"], acheteur: "Client" },
  
  // Red flags BTP
  { title: "Travaux génie civil", description: "Travaux", keywords: ["travaux", "génie civil"], acheteur: "Client" },
  { title: "Voirie et chaussée", description: "Voirie", keywords: ["voirie"], acheteur: "Client" },
  { title: "BTP gros œuvre", description: "BTP", keywords: ["btp"], acheteur: "Client" },
  
  // Red flags formation
  { title: "Formation bureautique", description: "Formation", keywords: ["formation", "bureautique"], acheteur: "Client" },
  { title: "Catalogue formation", description: "Catalogue", keywords: ["catalogue", "formation"], acheteur: "Client" },
  
  // Red flags autres
  { title: "Nettoyage et entretien", description: "Nettoyage", keywords: ["nettoyage"], acheteur: "Client" },
  { title: "Gardiennage surveillance", description: "Gardiennage", keywords: ["gardiennage"], acheteur: "Client" },
  { title: "Restauration collective", description: "Restauration", keywords: ["restauration"], acheteur: "Client" },
  { title: "Blanchisserie pressing", description: "Blanchisserie", keywords: ["blanchisserie"], acheteur: "Client" },
  { title: "Télécommunications", description: "Télécoms", keywords: ["télécommunications"], acheteur: "Client" },
  
  // Hors scope générique
  { title: "Juridique contentieux", description: "Juridique", keywords: ["juridique"], acheteur: "Client" },
  { title: "Actuariat", description: "Actuariat", keywords: ["actuariat"], acheteur: "Client" },
  { title: "Amo travaux", description: "Amo", keywords: ["amo", "travaux"], acheteur: "Client" },
  { title: "Maîtrise d'œuvre", description: "Maîtrise", keywords: ["maîtrise", "œuvre"], acheteur: "Client" },
  { title: "Construction bâtiment", description: "Construction", keywords: ["construction"], acheteur: "Client" },
  { title: "Hébergement serveurs", description: "Hébergement", keywords: ["hébergement"], acheteur: "Client" },
  { title: "Reprographie impression", description: "Reprographie", keywords: ["reprographie"], acheteur: "Client" },
  { title: "Sécurité incendie", description: "Sécurité", keywords: ["sécurité", "incendie"], acheteur: "Client" },
  { title: "Location matériel", description: "Location", keywords: ["location"], acheteur: "Client" },
  { title: "Prestations administratives", description: "Prestations", keywords: ["prestations"], acheteur: "Client" }
];

// ────────────────────────────────────────────────────────────────
// FONCTIONS DE TEST
// ────────────────────────────────────────────────────────────────

function testEndToEnd() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST END-TO-END : PRÉCISION/RAPPEL SUR 50 AO');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test AO pertinents
  console.log('📊 ANALYSE AO PERTINENTS (25 AO)\n');
  let pertinentsDetected = 0;
  let pertinentsSkipped = 0;
  let totalScorePertinents = 0;
  const scoresPertinents: number[] = [];
  
  AO_PERTINENTS.forEach((ao, index) => {
    const baseResult = calculateKeywordScore(
      ao.title,
      ao.description,
      ao.keywords,
      ao.acheteur
    );
    
    const enhancedResult = calculateEnhancedKeywordScore(ao, baseResult);
    const skipDecision = shouldSkipLLM(enhancedResult);
    
    totalScorePertinents += enhancedResult.score;
    scoresPertinents.push(enhancedResult.score);
    
    const isDetected = enhancedResult.score >= 30;
    if (isDetected) pertinentsDetected++;
    if (skipDecision.skip) pertinentsSkipped++;
  });

  // Test AO hors scope
  console.log('📊 ANALYSE AO HORS SCOPE (25 AO)\n');
  let horsScopeDetected = 0;
  let horsScopeSkipped = 0;
  let totalScoreHorsScope = 0;
  const scoresHorsScope: number[] = [];
  
  AO_HORS_SCOPE.forEach((ao, index) => {
    const baseResult = calculateKeywordScore(
      ao.title,
      ao.description,
      ao.keywords,
      ao.acheteur
    );
    
    const enhancedResult = calculateEnhancedKeywordScore(ao, baseResult);
    const skipDecision = shouldSkipLLM(enhancedResult);
    
    totalScoreHorsScope += enhancedResult.score;
    scoresHorsScope.push(enhancedResult.score);
    
    const isDetected = enhancedResult.score >= 30;
    if (isDetected) horsScopeDetected++;
    if (skipDecision.skip) horsScopeSkipped++;
  });

  // Calcul métriques
  const precision = pertinentsDetected / (pertinentsDetected + horsScopeDetected) || 0;
  const recall = pertinentsDetected / AO_PERTINENTS.length;
  const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
  const falsePositiveRate = horsScopeDetected / AO_HORS_SCOPE.length;
  const falseNegativeRate = (AO_PERTINENTS.length - pertinentsDetected) / AO_PERTINENTS.length;
  const llmEconomy = (pertinentsSkipped + horsScopeSkipped) / (AO_PERTINENTS.length + AO_HORS_SCOPE.length);
  
  const avgScorePertinents = totalScorePertinents / AO_PERTINENTS.length;
  const avgScoreHorsScope = totalScoreHorsScope / AO_HORS_SCOPE.length;
  const minScorePertinents = Math.min(...scoresPertinents);
  const maxScorePertinents = Math.max(...scoresPertinents);
  const minScoreHorsScope = Math.min(...scoresHorsScope);
  const maxScoreHorsScope = Math.max(...scoresHorsScope);

  // Résultats
  console.log('═══════════════════════════════════════════════════════════');
  console.log('RÉSULTATS DÉTAILLÉS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log('📈 AO PERTINENTS:');
  console.log(`   Détectés (score ≥30): ${pertinentsDetected}/${AO_PERTINENTS.length} (${(recall * 100).toFixed(1)}%)`);
  console.log(`   Skippés LLM: ${pertinentsSkipped}/${AO_PERTINENTS.length} (${(pertinentsSkipped / AO_PERTINENTS.length * 100).toFixed(1)}%)`);
  console.log(`   Score moyen: ${avgScorePertinents.toFixed(1)}/100`);
  console.log(`   Score min/max: ${minScorePertinents}/${maxScorePertinents}\n`);
  
  console.log('📉 AO HORS SCOPE:');
  console.log(`   Détectés (faux positifs): ${horsScopeDetected}/${AO_HORS_SCOPE.length} (${(falsePositiveRate * 100).toFixed(1)}%)`);
  console.log(`   Skippés LLM: ${horsScopeSkipped}/${AO_HORS_SCOPE.length} (${(horsScopeSkipped / AO_HORS_SCOPE.length * 100).toFixed(1)}%)`);
  console.log(`   Score moyen: ${avgScoreHorsScope.toFixed(1)}/100`);
  console.log(`   Score min/max: ${minScoreHorsScope}/${maxScoreHorsScope}\n`);
  
  console.log('📊 MÉTRIQUES GLOBALES:');
  console.log(`   Précision: ${(precision * 100).toFixed(1)}%`);
  console.log(`   Rappel: ${(recall * 100).toFixed(1)}%`);
  console.log(`   F1-Score: ${(f1Score * 100).toFixed(1)}%`);
  console.log(`   Taux faux positifs: ${(falsePositiveRate * 100).toFixed(1)}%`);
  console.log(`   Taux faux négatifs: ${(falseNegativeRate * 100).toFixed(1)}%`);
  console.log(`   Économie LLM: ${(llmEconomy * 100).toFixed(1)}%\n`);
  
  // Validation
  const isSuccess = 
    precision >= 0.85 &&
    recall >= 0.85 &&
    falsePositiveRate <= 0.15 &&
    llmEconomy >= 0.50;
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('VALIDATION');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log(`✅ Précision ≥85%: ${precision >= 0.85 ? 'OUI' : 'NON'} (${(precision * 100).toFixed(1)}%)`);
  console.log(`✅ Rappel ≥85%: ${recall >= 0.85 ? 'OUI' : 'NON'} (${(recall * 100).toFixed(1)}%)`);
  console.log(`✅ Faux positifs ≤15%: ${falsePositiveRate <= 0.15 ? 'OUI' : 'NON'} (${(falsePositiveRate * 100).toFixed(1)}%)`);
  console.log(`✅ Économie LLM ≥50%: ${llmEconomy >= 0.50 ? 'OUI' : 'NON'} (${(llmEconomy * 100).toFixed(1)}%)\n`);
  
  console.log(`${isSuccess ? '✅ TEST END-TO-END RÉUSSI' : '❌ TEST END-TO-END ÉCHOUÉ'}\n`);
  
  return isSuccess;
}

// ────────────────────────────────────────────────────────────────
// EXECUTION
// ────────────────────────────────────────────────────────────────

if (require.main === module) {
  const success = testEndToEnd();
  process.exit(success ? 0 : 1);
}

export { testEndToEnd };
