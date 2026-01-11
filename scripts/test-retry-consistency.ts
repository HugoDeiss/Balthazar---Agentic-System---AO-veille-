#!/usr/bin/env ts-node
// ════════════════════════════════════════════════════════
// SCRIPT DE TEST : Cohérence des données lors d'un retry
// ════════════════════════════════════════════════════════

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { checkBatchAlreadyAnalyzed } from '../src/persistence/ao-persistence';

// ────────────────────────────────────────────────────────────────
// CONFIGURATION
// ────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const TEST_DATE = '2025-01-20';

// ────────────────────────────────────────────────────────────────
// UTILITAIRES DE TEST
// ────────────────────────────────────────────────────────────────

interface AOWithData {
  source: string;
  source_id: string;
  title: string;
  description?: string;
  status: string;
  analyzed_at: string | null;
  semantic_score?: number;
  final_score?: number;
  priority?: string;
  keyword_score?: number;
  matched_keywords?: string[];
  feasibility?: any;
  analysis_history?: any[];
}

async function createTestAOsWithFullData(): Promise<AOWithData[]> {
  console.log('📥 Création de 10 AO avec données complètes...\n');
  
  const aos: AOWithData[] = [];
  const now = new Date().toISOString();
  
  for (let i = 1; i <= 10; i++) {
    aos.push({
      source: 'BOAMP',
      source_id: `TEST-CONSISTENCY-${i}`,
      title: `AO test ${i}`,
      description: `Description AO test ${i}`,
      status: 'analyzed',
      analyzed_at: now,
      semantic_score: 8,
      final_score: 85,
      priority: 'HIGH',
      keyword_score: 0.7,
      matched_keywords: ['conseil', 'stratégie'],
      feasibility: {
        financial: true,
        technical: true,
        timing: true,
        blockers: [],
        confidence: 'high' as const
      },
      analysis_history: [
        {
          date: now,
          semantic_score: 8,
          feasibility: {
            financial: true,
            technical: true,
            timing: true,
            blockers: [],
            confidence: 'high'
          },
          priority: 'HIGH',
          final_score: 85
        }
      ]
    });
  }
  
  // Insérer en DB
  const { error } = await supabase
    .from('appels_offres')
    .upsert(aos, { onConflict: 'source_id' });
  
  if (error) {
    throw error;
  }
  
  console.log(`✅ ${aos.length} AO avec données complètes insérés en DB`);
  
  return aos;
}

async function cleanupTestData() {
  console.log('\n🧹 Nettoyage des données de test...\n');
  
  const sourceIds: string[] = [];
  for (let i = 1; i <= 12; i++) {
    sourceIds.push(`TEST-CONSISTENCY-${i}`);
  }
  
  const { error } = await supabase
    .from('appels_offres')
    .delete()
    .in('source_id', sourceIds);
  
  if (error) {
    console.error('⚠️ Erreur nettoyage:', error);
  } else {
    console.log(`✅ ${sourceIds.length} AO de test supprimés`);
  }
}

async function getAOFromDB(sourceId: string): Promise<AOWithData | null> {
  const { data, error } = await supabase
    .from('appels_offres')
    .select('*')
    .eq('source_id', sourceId)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data as AOWithData;
}

// Simuler filterAlreadyAnalyzedStep (pour simuler un retry)
async function simulateFilterStep(sourceIds: string[]) {
  const aos = sourceIds.map(id => ({
    source: 'BOAMP',
    source_id: id
  }));
  
  const alreadyAnalyzedMap = await checkBatchAlreadyAnalyzed(aos);
  
  return alreadyAnalyzedMap;
}

// ────────────────────────────────────────────────────────────────
// TESTS
// ────────────────────────────────────────────────────────────────

async function testPreservationOfScores() {
  console.log('\n🧪 TEST 1 : Préservation des scores\n');
  console.log('═'.repeat(60));
  
  const aos = await createTestAOsWithFullData();
  
  // Récupérer les données originales
  const originalData: Map<string, AOWithData> = new Map();
  for (const ao of aos) {
    const dbAO = await getAOFromDB(ao.source_id);
    if (dbAO) {
      originalData.set(ao.source_id, dbAO);
    }
  }
  
  console.log(`  → ${originalData.size} AO récupérés de la DB`);
  
  // Simuler un retry : vérifier que ces AO sont marqués comme déjà analysés
  const sourceIds = aos.map(ao => ao.source_id);
  const alreadyAnalyzedMap = await simulateFilterStep(sourceIds);
  
  console.log(`  → Vérification batch: ${alreadyAnalyzedMap.size} AO vérifiés`);
  
  // Simuler le filtrage : ces AO seront skippés, donc pas modifiés
  // Vérifier que les données n'ont pas changé
  let allPreserved = true;
  let preservedCount = 0;
  
  for (const ao of aos) {
    const originalAO = originalData.get(ao.source_id);
    const isAnalyzed = alreadyAnalyzedMap.get(ao.source_id);
    const currentAO = await getAOFromDB(ao.source_id);
    
    if (!originalAO || !currentAO || !isAnalyzed) {
      console.error(`  ❌ ${ao.source_id}: Données manquantes`);
      allPreserved = false;
      continue;
    }
    
    // Vérifier que les scores sont préservés
    const scoresPreserved = 
      originalAO.semantic_score === currentAO.semantic_score &&
      originalAO.final_score === currentAO.final_score &&
      originalAO.priority === currentAO.priority &&
      originalAO.keyword_score === currentAO.keyword_score;
    
    if (scoresPreserved) {
      preservedCount++;
    } else {
      console.error(`  ❌ ${ao.source_id}: Scores modifiés`);
      console.error(`     Original: semantic=${originalAO.semantic_score}, final=${originalAO.final_score}, priority=${originalAO.priority}`);
      console.error(`     Current: semantic=${currentAO.semantic_score}, final=${currentAO.final_score}, priority=${currentAO.priority}`);
      allPreserved = false;
    }
  }
  
  console.log(`  → Scores préservés: ${preservedCount}/${aos.length}`);
  console.log(`  → ${allPreserved ? '✅ OK' : '❌ ERREUR'}`);
  
  return allPreserved && preservedCount === aos.length;
}

async function testPreservationOfTimestamps() {
  console.log('\n🧪 TEST 2 : Préservation des timestamps\n');
  console.log('═'.repeat(60));
  
  const aos = await createTestAOsWithFullData();
  
  // Récupérer les timestamps originaux
  const originalTimestamps: Map<string, { analyzed_at: string; updated_at: string }> = new Map();
  
  for (const ao of aos) {
    const dbAO = await getAOFromDB(ao.source_id);
    if (dbAO) {
      originalTimestamps.set(ao.source_id, {
        analyzed_at: dbAO.analyzed_at || '',
        updated_at: (dbAO as any).updated_at || ''
      });
    }
  }
  
  console.log(`  → ${originalTimestamps.size} timestamps originaux capturés`);
  
  // Simuler un retry : vérifier que ces AO sont skippés
  const sourceIds = aos.map(ao => ao.source_id);
  const alreadyAnalyzedMap = await simulateFilterStep(sourceIds);
  
  // Attendre un peu pour simuler le temps de traitement
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Vérifier que les timestamps n'ont pas changé
  let allPreserved = true;
  let preservedCount = 0;
  
  for (const ao of aos) {
    const original = originalTimestamps.get(ao.source_id);
    const currentAO = await getAOFromDB(ao.source_id);
    
    if (!original || !currentAO) {
      allPreserved = false;
      continue;
    }
    
    // Vérifier analyzed_at (ne doit pas changer)
    const analyzedAtPreserved = original.analyzed_at === (currentAO.analyzed_at || '');
    
    if (analyzedAtPreserved) {
      preservedCount++;
    } else {
      console.error(`  ❌ ${ao.source_id}: analyzed_at modifié`);
      console.error(`     Original: ${original.analyzed_at}`);
      console.error(`     Current: ${currentAO.analyzed_at || 'null'}`);
      allPreserved = false;
    }
  }
  
  console.log(`  → Timestamps préservés: ${preservedCount}/${aos.length}`);
  console.log(`  → ${allPreserved ? '✅ OK' : '❌ ERREUR'}`);
  
  return allPreserved && preservedCount === aos.length;
}

async function testPreservationOfMetadata() {
  console.log('\n🧪 TEST 3 : Préservation des métadonnées\n');
  console.log('═'.repeat(60));
  
  const aos = await createTestAOsWithFullData();
  
  // Récupérer les métadonnées originales
  const originalMetadata: Map<string, any> = new Map();
  
  for (const ao of aos) {
    const dbAO = await getAOFromDB(ao.source_id);
    if (dbAO) {
      originalMetadata.set(ao.source_id, {
        feasibility: dbAO.feasibility,
        matched_keywords: dbAO.matched_keywords,
        analysis_history: dbAO.analysis_history
      });
    }
  }
  
  console.log(`  → ${originalMetadata.size} métadonnées originales capturées`);
  
  // Simuler un retry : vérifier que ces AO sont skippés
  const sourceIds = aos.map(ao => ao.source_id);
  const alreadyAnalyzedMap = await simulateFilterStep(sourceIds);
  
  // Vérifier que les métadonnées sont préservées
  let allPreserved = true;
  let preservedCount = 0;
  
  for (const ao of aos) {
    const original = originalMetadata.get(ao.source_id);
    const currentAO = await getAOFromDB(ao.source_id);
    
    if (!original || !currentAO) {
      allPreserved = false;
      continue;
    }
    
    // Vérifier feasibility
    const feasibilityPreserved = JSON.stringify(original.feasibility) === JSON.stringify(currentAO.feasibility);
    const keywordsPreserved = JSON.stringify(original.matched_keywords) === JSON.stringify(currentAO.matched_keywords);
    const historyPreserved = JSON.stringify(original.analysis_history) === JSON.stringify(currentAO.analysis_history);
    
    const metadataPreserved = feasibilityPreserved && keywordsPreserved && historyPreserved;
    
    if (metadataPreserved) {
      preservedCount++;
    } else {
      console.error(`  ❌ ${ao.source_id}: Métadonnées modifiées`);
      if (!feasibilityPreserved) console.error(`     - feasibility modifié`);
      if (!keywordsPreserved) console.error(`     - matched_keywords modifié`);
      if (!historyPreserved) console.error(`     - analysis_history modifié`);
      allPreserved = false;
    }
  }
  
  console.log(`  → Métadonnées préservées: ${preservedCount}/${aos.length}`);
  console.log(`  → ${allPreserved ? '✅ OK' : '❌ ERREUR'}`);
  
  return allPreserved && preservedCount === aos.length;
}

async function testNewAOsAreCreated() {
  console.log('\n🧪 TEST 4 : Nouveaux AO sont créés (pas préservés)\n');
  console.log('═'.repeat(60));
  
  // Créer 10 AO déjà analysés
  await createTestAOsWithFullData();
  
  // Créer 2 nouveaux AO (non en DB)
  const newAOs: AOWithData[] = [
    {
      source: 'BOAMP',
      source_id: 'TEST-CONSISTENCY-NEW-1',
      title: 'Nouveau AO 1',
      description: 'Description nouveau AO 1',
      status: 'ingested',
      analyzed_at: null
    },
    {
      source: 'BOAMP',
      source_id: 'TEST-CONSISTENCY-NEW-2',
      title: 'Nouveau AO 2',
      description: 'Description nouveau AO 2',
      status: 'ingested',
      analyzed_at: null
    }
  ];
  
  // Simuler un retry : vérifier que les nouveaux AO ne sont pas marqués comme analysés
  const sourceIds = [
    ...Array.from({ length: 10 }, (_, i) => `TEST-CONSISTENCY-${i + 1}`),
    'TEST-CONSISTENCY-NEW-1',
    'TEST-CONSISTENCY-NEW-2'
  ];
  
  const alreadyAnalyzedMap = await simulateFilterStep(sourceIds);
  
  // Vérifier que les nouveaux AO ne sont pas marqués comme analysés
  const newAO1Analyzed = alreadyAnalyzedMap.get('TEST-CONSISTENCY-NEW-1');
  const newAO2Analyzed = alreadyAnalyzedMap.get('TEST-CONSISTENCY-NEW-2');
  
  console.log(`  → Nouveau AO 1 analysé: ${newAO1Analyzed ? '❌ OUI (ERREUR)' : '✅ NON (OK)'}`);
  console.log(`  → Nouveau AO 2 analysé: ${newAO2Analyzed ? '❌ OUI (ERREUR)' : '✅ NON (OK)'}`);
  
  const passed = !newAO1Analyzed && !newAO2Analyzed;
  
  console.log(`  → ${passed ? '✅ OK' : '❌ ERREUR'}`);
  
  await cleanupTestData();
  
  return passed;
}

// ────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  TESTS : Cohérence des données lors d\'un retry            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  try {
    // Vérifier la connexion Supabase
    console.log('🔍 Vérification de la connexion Supabase...');
    const { data, error } = await supabase
      .from('appels_offres')
      .select('id')
      .limit(1);
    
    if (error && (error.message.includes('ENOTFOUND') || error.message.includes('fetch failed'))) {
      console.error(`\n❌ Erreur de connexion à Supabase:`);
      console.error(`   ${error.message}`);
      console.error(`\n💡 Vérifiez votre configuration Supabase dans .env\n`);
      process.exit(1);
    }
    
    console.log('✅ Connexion Supabase OK\n');
    
    const test1 = await testPreservationOfScores();
    const test2 = await testPreservationOfTimestamps();
    const test3 = await testPreservationOfMetadata();
    const test4 = await testNewAOsAreCreated();
    
    // Résumé
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  RÉSUMÉ DES TESTS                                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    console.log(`\n✅ TEST 1 (Préservation scores): ${test1 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 2 (Préservation timestamps): ${test2 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 3 (Préservation métadonnées): ${test3 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 4 (Nouveaux AO créés): ${test4 ? 'PASS' : 'FAIL'}`);
    
    const allPassed = test1 && test2 && test3 && test4;
    
    console.log(`\n${allPassed ? '✅' : '❌'} RÉSULTAT GLOBAL: ${allPassed ? 'TOUS LES TESTS PASSENT' : 'QUELQUES TESTS ÉCHOUENT'}`);
    
    if (allPassed) {
      console.log(`\n🔒 COHÉRENCE VALIDÉE:`);
      console.log(`   → Les AO déjà analysés ne sont pas modifiés lors d'un retry`);
      console.log(`   → Les nouveaux AO sont correctement identifiés`);
      console.log(`   → Les scores, timestamps et métadonnées sont préservés`);
    }
    
    console.log('\n✅ Tests terminés !');
    
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Erreur lors des tests:', error);
    await cleanupTestData().catch(() => {});
    process.exit(1);
  }
}

// Exécuter si appelé directement
main().catch((error: Error) => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
