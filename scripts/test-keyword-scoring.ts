#!/usr/bin/env ts-node
// ════════════════════════════════════════════════════════════════
// SCRIPT DE TEST : Validation nouveau scoring logarithmique
// ════════════════════════════════════════════════════════════════

import 'dotenv/config';
import { calculateKeywordScore, shouldSkipLLM } from '../src/utils/balthazar-keywords';

// ────────────────────────────────────────────────────────────────
// DONNÉES DE TEST
// ────────────────────────────────────────────────────────────────

const TEST_AOS = [
  // Test graduation scoring (1, 2, 3+ matches)
  {
    title: "Stratégie SNCF",
    description: "Mission stratégique pour SNCF",
    keywords: ["stratégie", "sncf"],
    acheteur: "SNCF",
    expectedScore: "medium", // 1 secteur + 1 expertise
    expectedConfidence: "MEDIUM"
  },
  {
    title: "Stratégie transformation SNCF RATP",
    description: "Mission stratégie et transformation pour SNCF et RATP. Diagnostic et accompagnement.",
    keywords: ["stratégie", "transformation", "sncf", "ratp", "diagnostic"],
    acheteur: "SNCF",
    expectedScore: "high", // Multi-secteurs + multi-expertises
    expectedConfidence: "HIGH"
  },
  {
    title: "Raison d'être MAIF",
    description: "Accompagnement raison d'être pour MAIF",
    keywords: ["raison d'être", "maif"],
    acheteur: "MAIF",
    expectedScore: "high", // Secteur + expertise raison d'être
    expectedConfidence: "HIGH"
  },
  {
    title: "Transformation digitale collectivité",
    description: "Mission transformation digitale",
    keywords: ["transformation", "digitale"],
    acheteur: "Métropole",
    expectedScore: "medium",
    expectedConfidence: "MEDIUM"
  },
  {
    title: "Gouvernance CODIR entreprise mission",
    description: "Séminaire CODIR pour entreprise à mission",
    keywords: ["gouvernance", "codir", "entreprise à mission"],
    acheteur: "Entreprise",
    expectedScore: "high",
    expectedConfidence: "HIGH"
  },
  // Test skip LLM
  {
    title: "Fourniture matériel",
    description: "Livraison équipement",
    keywords: ["fourniture", "matériel"],
    acheteur: "Client",
    expectedSkip: true,
    expectedReason: "red_flags_critiques"
  },
  {
    title: "Stratégie développement",
    description: "Mission stratégie de développement",
    keywords: ["stratégie", "développement"],
    acheteur: "Client",
    expectedSkip: false,
    expectedConfidence: "HIGH"
  },
  {
    title: "Service public transformation",
    description: "Mission pour service public avec transformation",
    keywords: ["service public", "transformation"],
    acheteur: "Collectivité",
    expectedSkip: false,
    expectedConfidence: "MEDIUM"
  }
];

// ────────────────────────────────────────────────────────────────
// FONCTIONS DE TEST
// ────────────────────────────────────────────────────────────────

function testScoring() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST SCORING LOGARITHMIQUE ET CONFIDENCE');
  console.log('═══════════════════════════════════════════════════════════\n');

  let testsPassed = 0;
  let testsTotal = 0;

  TEST_AOS.forEach((ao, index) => {
    console.log(`\n📋 TEST ${index + 1}: ${ao.title}`);
    console.log('─'.repeat(60));
    
    const result = calculateKeywordScore(
      ao.title,
      ao.description,
      ao.keywords,
      ao.acheteur
    );
    
    const skipDecision = shouldSkipLLM(result);
    
    console.log(`Score: ${result.score}/100`);
    console.log(`Confidence: ${result.confidence}`);
    console.log(`Secteurs: ${result.secteur_matches.length} (${result.breakdown.secteur_score}pts)`);
    console.log(`Expertises: ${result.expertise_matches.length} (${result.breakdown.expertise_score}pts)`);
    console.log(`Posture: ${result.posture_matches.length} (${result.breakdown.posture_score}pts)`);
    console.log(`Skip LLM: ${skipDecision.skip} (${skipDecision.priority})`);
    if (skipDecision.reason) {
      console.log(`Raison: ${skipDecision.reason}`);
    }
    
    // Vérifications
    let testPassed = true;
    
    if (ao.expectedScore) {
      const isHigh = result.score >= 60;
      const isMedium = result.score >= 30 && result.score < 60;
      const isLow = result.score < 30;
      
      const matchesExpected = 
        (ao.expectedScore === 'high' && isHigh) ||
        (ao.expectedScore === 'medium' && isMedium) ||
        (ao.expectedScore === 'low' && isLow);
      
      if (!matchesExpected) {
        console.log(`❌ Score attendu: ${ao.expectedScore}, obtenu: ${isHigh ? 'high' : isMedium ? 'medium' : 'low'}`);
        testPassed = false;
      } else {
        console.log(`✅ Score attendu: ${ao.expectedScore}`);
      }
    }
    
    if (ao.expectedConfidence) {
      if (result.confidence !== ao.expectedConfidence) {
        console.log(`❌ Confidence attendue: ${ao.expectedConfidence}, obtenue: ${result.confidence}`);
        testPassed = false;
      } else {
        console.log(`✅ Confidence attendue: ${ao.expectedConfidence}`);
      }
    }
    
    if (ao.expectedSkip !== undefined) {
      if (skipDecision.skip !== ao.expectedSkip) {
        console.log(`❌ Skip attendu: ${ao.expectedSkip}, obtenu: ${skipDecision.skip}`);
        testPassed = false;
      } else {
        console.log(`✅ Skip attendu: ${ao.expectedSkip}`);
      }
    }
    
    if (ao.expectedReason) {
      if (skipDecision.reason !== ao.expectedReason) {
        console.log(`❌ Raison attendue: ${ao.expectedReason}, obtenue: ${skipDecision.reason}`);
        testPassed = false;
      } else {
        console.log(`✅ Raison attendue: ${ao.expectedReason}`);
      }
    }
    
    if (testPassed) testsPassed++;
    testsTotal++;
  });

  // Résultats
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('RÉSULTATS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log(`Tests réussis: ${testsPassed}/${testsTotal} (${(testsPassed / testsTotal * 100).toFixed(1)}%)\n`);
  
  const isSuccess = testsPassed === testsTotal;
  console.log(`${isSuccess ? '✅ TOUS LES TESTS RÉUSSIS' : '❌ CERTAINS TESTS ONT ÉCHOUÉ'}\n`);
  
  return isSuccess;
}

// ────────────────────────────────────────────────────────────────
// EXECUTION
// ────────────────────────────────────────────────────────────────

if (require.main === module) {
  const success = testScoring();
  process.exit(success ? 0 : 1);
}

export { testScoring };
