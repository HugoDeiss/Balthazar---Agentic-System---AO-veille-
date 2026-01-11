#!/usr/bin/env ts-node
// ════════════════════════════════════════════════════════════════
// SCRIPT DE TEST : Test unitaire isAOAlreadyAnalyzed()
// ════════════════════════════════════════════════════════════════

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';
import { isAOAlreadyAnalyzed } from '../src/persistence/ao-persistence';

// ────────────────────────────────────────────────────────────────
// CONFIGURATION
// ────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ────────────────────────────────────────────────────────────────
// DONNÉES DE TEST
// ────────────────────────────────────────────────────────────────

const TEST_DATE = '2025-01-20';

// AO déjà analysé (sera inséré en DB)
const AO_ANALYZED = {
  source: 'BOAMP',
  source_id: 'TEST-INDIVIDUAL-001',
  title: 'AO test individuel',
  description: 'Description AO test',
  keywords: ['test', 'individuel'],
  acheteur: 'Test Acheteur',
  budget_max: 100000,
  deadline: '2025-03-01',
  publication_date: TEST_DATE,
  type_marche: 'SERVICES',
  region: 'Île-de-France',
  client_id: 'balthazar',
  status: 'analyzed',
  analyzed_at: new Date().toISOString(),
  semantic_score: 7,
  final_score: 75,
  priority: 'MEDIUM'
};

// AO non analysé (sera inséré avec status='ingested')
const AO_NOT_ANALYZED = {
  source: 'BOAMP',
  source_id: 'TEST-INDIVIDUAL-002',
  title: 'AO test non analysé',
  description: 'Description AO non analysé',
  keywords: ['test'],
  acheteur: 'Test Acheteur 2',
  budget_max: 50000,
  deadline: '2025-02-15',
  publication_date: TEST_DATE,
  type_marche: 'SERVICES',
  region: 'Île-de-France',
  client_id: 'balthazar',
  status: 'ingested' // Non analysé
  // Pas de analyzed_at
};

// ────────────────────────────────────────────────────────────────
// FONCTIONS DE TEST
// ────────────────────────────────────────────────────────────────

async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('appels_offres')
      .select('id')
      .limit(1);
    
    if (error && (error.message.includes('ENOTFOUND') || error.message.includes('fetch failed'))) {
      console.error(`\n❌ Erreur de connexion à Supabase:`);
      console.error(`   ${error.message}`);
      console.error(`\n💡 Solutions possibles:`);
      console.error(`   1. Vérifier que le projet Supabase existe dans votre dashboard`);
      console.error(`   2. Vérifier que l'URL dans .env est correcte`);
      console.error(`   3. Vérifier votre connexion internet`);
      console.error(`   4. Le projet Supabase pourrait être suspendu ou supprimé\n`);
      return false;
    }
    
    return true;
  } catch (error: any) {
    if (error.message?.includes('ENOTFOUND') || error.message?.includes('fetch failed')) {
      console.error(`\n❌ Impossible de se connecter à Supabase`);
      console.error(`   Erreur DNS: ${error.message}`);
      console.error(`\n💡 Vérifiez que le projet Supabase existe et que l'URL dans .env est correcte.\n`);
      return false;
    }
    throw error;
  }
}

async function setupTestData() {
  console.log('\n📥 Setup : Insertion de données de test...\n');
  console.log('═'.repeat(60));
  
  // Vérifier la connexion Supabase d'abord
  console.log('🔍 Vérification de la connexion Supabase...');
  const isConnected = await checkSupabaseConnection();
  if (!isConnected) {
    throw new Error('Connexion Supabase échouée. Vérifiez votre configuration.');
  }
  console.log('✅ Connexion Supabase OK\n');
  
  // Insérer AO analysé
  const { data: analyzedData, error: analyzedError } = await supabase
    .from('appels_offres')
    .upsert(AO_ANALYZED, { onConflict: 'source_id' })
    .select('source_id, status, analyzed_at')
    .single();
  
  if (analyzedError) {
    console.error(`❌ Erreur insertion AO analysé:`, analyzedError);
    throw analyzedError;
  }
  console.log(`✅ ${analyzedData.source_id} inséré (status: ${analyzedData.status}, analyzed_at: ${analyzedData.analyzed_at ? 'OUI' : 'NON'})`);
  
  // Insérer AO non analysé
  const { data: notAnalyzedData, error: notAnalyzedError } = await supabase
    .from('appels_offres')
    .upsert(AO_NOT_ANALYZED, { onConflict: 'source_id' })
    .select('source_id, status, analyzed_at')
    .single();
  
  if (notAnalyzedError) {
    console.error(`❌ Erreur insertion AO non analysé:`, notAnalyzedError);
    throw notAnalyzedError;
  }
  console.log(`✅ ${notAnalyzedData.source_id} inséré (status: ${notAnalyzedData.status}, analyzed_at: ${notAnalyzedData.analyzed_at ? 'OUI' : 'NON'})`);
  
  console.log(`\n✅ 2 AO de test insérés en DB\n`);
}

async function testAnalyzedAO() {
  console.log('🧪 TEST 1 : AO déjà analysé\n');
  console.log('═'.repeat(60));
  
  const result = await isAOAlreadyAnalyzed(AO_ANALYZED.source, AO_ANALYZED.source_id);
  const expected = true;
  const isCorrect = result === expected;
  
  console.log(`  → source_id: ${AO_ANALYZED.source_id}`);
  console.log(`  → Résultat: ${result ? '✅ Analysé' : '❌ NON analysé'}`);
  console.log(`  → Attendu: ${expected ? 'Analysé' : 'NON analysé'}`);
  console.log(`  → ${isCorrect ? '✅ OK' : '❌ ERREUR'}`);
  
  return isCorrect;
}

async function testNotAnalyzedAO() {
  console.log('\n🧪 TEST 2 : AO non analysé\n');
  console.log('═'.repeat(60));
  
  const result = await isAOAlreadyAnalyzed(AO_NOT_ANALYZED.source, AO_NOT_ANALYZED.source_id);
  const expected = false;
  const isCorrect = result === expected;
  
  console.log(`  → source_id: ${AO_NOT_ANALYZED.source_id}`);
  console.log(`  → Résultat: ${result ? '✅ Analysé' : '❌ NON analysé'}`);
  console.log(`  → Attendu: ${expected ? 'Analysé' : 'NON analysé'}`);
  console.log(`  → ${isCorrect ? '✅ OK' : '❌ ERREUR'}`);
  
  return isCorrect;
}

async function testNonExistentAO() {
  console.log('\n🧪 TEST 3 : AO inexistant\n');
  console.log('═'.repeat(60));
  
  const nonExistentId = 'TEST-INDIVIDUAL-999';
  const result = await isAOAlreadyAnalyzed('BOAMP', nonExistentId);
  const expected = false;
  const isCorrect = result === expected;
  
  console.log(`  → source_id: ${nonExistentId} (inexistant)`);
  console.log(`  → Résultat: ${result ? '✅ Analysé' : '❌ NON analysé'}`);
  console.log(`  → Attendu: ${expected ? 'Analysé' : 'NON analysé'} (non trouvé = non analysé)`);
  console.log(`  → ${isCorrect ? '✅ OK' : '❌ ERREUR'}`);
  
  return isCorrect;
}

async function testAnalyzedAtNull() {
  console.log('\n🧪 TEST 4 : AO avec analyzed_at null\n');
  console.log('═'.repeat(60));
  
  // Insérer un AO avec status='analyzed' mais analyzed_at=null
  const aoWithNullAnalyzedAt = {
    ...AO_NOT_ANALYZED,
    source_id: 'TEST-INDIVIDUAL-003',
    status: 'analyzed',
    analyzed_at: null
  };
  
  const { error: insertError } = await supabase
    .from('appels_offres')
    .upsert(aoWithNullAnalyzedAt, { onConflict: 'source_id' })
    .select('source_id, status, analyzed_at')
    .single();
  
  if (insertError) {
    console.error(`❌ Erreur insertion:`, insertError);
    return false;
  }
  
  const result = await isAOAlreadyAnalyzed(aoWithNullAnalyzedAt.source, aoWithNullAnalyzedAt.source_id);
  const expected = false; // analyzed_at null = non analysé
  const isCorrect = result === expected;
  
  console.log(`  → source_id: ${aoWithNullAnalyzedAt.source_id}`);
  console.log(`  → status: ${aoWithNullAnalyzedAt.status}`);
  console.log(`  → analyzed_at: null`);
  console.log(`  → Résultat: ${result ? '✅ Analysé' : '❌ NON analysé'}`);
  console.log(`  → Attendu: ${expected ? 'Analysé' : 'NON analysé'} (analyzed_at null = non analysé)`);
  console.log(`  → ${isCorrect ? '✅ OK' : '❌ ERREUR'}`);
  
  // Nettoyer
  await supabase
    .from('appels_offres')
    .delete()
    .eq('source_id', aoWithNullAnalyzedAt.source_id);
  
  return isCorrect;
}

async function nettoyageTests() {
  console.log('\n🧹 Nettoyage des données de test...\n');
  console.log('═'.repeat(60));
  
  const testIds = [
    AO_ANALYZED.source_id,
    AO_NOT_ANALYZED.source_id,
    'TEST-INDIVIDUAL-003'
  ];
  
  const { error } = await supabase
    .from('appels_offres')
    .delete()
    .in('source_id', testIds);
  
  if (error) {
    console.error('❌ Erreur nettoyage:', error);
    return false;
  } else {
    console.log(`✅ ${testIds.length} AO de test supprimés`);
    return true;
  }
}

// ────────────────────────────────────────────────────────────────
// EXÉCUTION
// ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  TESTS : isAOAlreadyAnalyzed() (vérification individuelle) ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  try {
    // Vérifier les variables d'environnement
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      console.error('\n❌ Variables d\'environnement manquantes:');
      console.error('  - SUPABASE_URL');
      console.error('  - SUPABASE_SERVICE_KEY');
      process.exit(1);
    }
    
    // Setup
    await setupTestData();
    
    // Tests
    const test1 = await testAnalyzedAO();
    const test2 = await testNotAnalyzedAO();
    const test3 = await testNonExistentAO();
    const test4 = await testAnalyzedAtNull();
    
    // Résumé
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  RÉSUMÉ DES TESTS                                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n✅ TEST 1 (AO analysé): ${test1 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 2 (AO non analysé): ${test2 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 3 (AO inexistant): ${test3 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 4 (analyzed_at null): ${test4 ? 'PASS' : 'FAIL'}`);
    
    const allPassed = test1 && test2 && test3 && test4;
    console.log(`\n${allPassed ? '✅' : '❌'} RÉSULTAT GLOBAL: ${allPassed ? 'TOUS LES TESTS PASSENT' : 'QUELQUES TESTS ÉCHOUENT'}`);
    
    // Nettoyage automatique (pour éviter interaction dans les tests automatisés)
    if (process.env.CLEANUP_TEST_DATA !== 'false') {
      await nettoyageTests();
    }
    
    console.log('\n✅ Tests terminés !');
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Erreur lors des tests:', error);
    process.exit(1);
  }
}

// Exécuter si appelé directement
main().catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
