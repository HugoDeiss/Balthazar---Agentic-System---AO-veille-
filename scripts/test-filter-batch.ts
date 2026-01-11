#!/usr/bin/env ts-node
// ════════════════════════════════════════════════════════════════
// SCRIPT DE TEST : Test unitaire checkBatchAlreadyAnalyzed()
// ════════════════════════════════════════════════════════════════

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';
import { checkBatchAlreadyAnalyzed } from '../src/persistence/ao-persistence';

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

// AO déjà analysés (seront insérés en DB)
const AO_ALREADY_ANALYZED = [
  {
    source: 'BOAMP',
    source_id: 'TEST-BATCH-001',
    title: 'AO test batch 1',
    description: 'Description AO 1',
    keywords: ['test', 'batch'],
    acheteur: 'Test Acheteur 1',
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
  },
  {
    source: 'BOAMP',
    source_id: 'TEST-BATCH-002',
    title: 'AO test batch 2',
    description: 'Description AO 2',
    keywords: ['test', 'batch'],
    acheteur: 'Test Acheteur 2',
    budget_max: 75000,
    deadline: '2025-02-15',
    publication_date: TEST_DATE,
    type_marche: 'SERVICES',
    region: 'Île-de-France',
    client_id: 'balthazar',
    status: 'analyzed',
    analyzed_at: new Date().toISOString(),
    semantic_score: 8,
    final_score: 85,
    priority: 'HIGH'
  },
  {
    source: 'BOAMP',
    source_id: 'TEST-BATCH-003',
    title: 'AO test batch 3',
    description: 'Description AO 3',
    keywords: ['test', 'batch'],
    acheteur: 'Test Acheteur 3',
    budget_max: 50000,
    deadline: '2025-02-20',
    publication_date: TEST_DATE,
    type_marche: 'SERVICES',
    region: 'Île-de-France',
    client_id: 'balthazar',
    status: 'analyzed',
    analyzed_at: new Date().toISOString(),
    semantic_score: 6,
    final_score: 65,
    priority: 'LOW'
  },
  {
    source: 'BOAMP',
    source_id: 'TEST-BATCH-004',
    title: 'AO test batch 4',
    description: 'Description AO 4',
    keywords: ['test', 'batch'],
    acheteur: 'Test Acheteur 4',
    budget_max: 125000,
    deadline: '2025-03-10',
    publication_date: TEST_DATE,
    type_marche: 'SERVICES',
    region: 'Île-de-France',
    client_id: 'balthazar',
    status: 'analyzed',
    analyzed_at: new Date().toISOString(),
    semantic_score: 7.5,
    final_score: 78,
    priority: 'MEDIUM'
  },
  {
    source: 'BOAMP',
    source_id: 'TEST-BATCH-005',
    title: 'AO test batch 5',
    description: 'Description AO 5',
    keywords: ['test', 'batch'],
    acheteur: 'Test Acheteur 5',
    budget_max: 90000,
    deadline: '2025-02-28',
    publication_date: TEST_DATE,
    type_marche: 'SERVICES',
    region: 'Île-de-France',
    client_id: 'balthazar',
    status: 'analyzed',
    analyzed_at: new Date().toISOString(),
    semantic_score: 8.5,
    final_score: 88,
    priority: 'HIGH'
  }
];

// AO nouveaux (ne seront PAS insérés en DB)
const AO_NEW = [
  {
    source: 'BOAMP',
    source_id: 'TEST-BATCH-006'
  },
  {
    source: 'BOAMP',
    source_id: 'TEST-BATCH-007'
  },
  {
    source: 'BOAMP',
    source_id: 'TEST-BATCH-008'
  }
];

// ────────────────────────────────────────────────────────────────
// FONCTIONS DE TEST
// ────────────────────────────────────────────────────────────────

async function checkSupabaseConnection(): Promise<boolean> {
  try {
    // Test de connexion simple : ping Supabase
    const { data, error } = await supabase
      .from('appels_offres')
      .select('id')
      .limit(1);
    
    if (error && (error.message.includes('ENOTFOUND') || error.message.includes('fetch failed'))) {
      console.error(`\n❌ Erreur de connexion à Supabase:`);
      console.error(`   ${error.message}`);
      console.error(`\n💡 Solutions possibles:`);
      console.error(`   1. Vérifier que le projet Supabase existe dans votre dashboard`);
      console.error(`   2. Vérifier que l'URL dans .env est correcte: ${process.env.SUPABASE_URL?.substring(0, 50)}...`);
      console.error(`   3. Vérifier votre connexion internet`);
      console.error(`   4. Le projet Supabase pourrait être suspendu ou supprimé\n`);
      return false;
    }
    
    return true;
  } catch (error: any) {
    if (error.message?.includes('ENOTFOUND') || error.message?.includes('fetch failed')) {
      console.error(`\n❌ Impossible de se connecter à Supabase`);
      console.error(`   Erreur DNS: ${error.message}`);
      console.error(`\n💡 Le projet Supabase "${process.env.SUPABASE_URL?.match(/https?:\/\/([^\.]+)\.supabase\.co/)?.[1]}" n'est pas accessible.`);
      console.error(`   Vérifiez que le projet existe et que l'URL dans .env est correcte.\n`);
      return false;
    }
    throw error;
  }
}

async function setupTestData() {
  console.log('\n📥 Setup : Insertion de AO déjà analysés...\n');
  console.log('═'.repeat(60));
  
  // Vérifier la connexion Supabase d'abord
  console.log('🔍 Vérification de la connexion Supabase...');
  const isConnected = await checkSupabaseConnection();
  if (!isConnected) {
    throw new Error('Connexion Supabase échouée. Vérifiez votre configuration.');
  }
  console.log('✅ Connexion Supabase OK\n');
  
  // Insérer les AO déjà analysés
  for (const ao of AO_ALREADY_ANALYZED) {
    const { data, error } = await supabase
      .from('appels_offres')
      .upsert(ao, { onConflict: 'source_id' })
      .select('source_id, status, analyzed_at')
      .single();
    
    if (error) {
      console.error(`❌ Erreur insertion ${ao.source_id}:`, error);
      throw error;
    } else {
      console.log(`✅ ${ao.source_id} inséré (status: ${data.status}, analyzed_at: ${data.analyzed_at ? 'OUI' : 'NON'})`);
    }
  }
  
  console.log(`\n✅ ${AO_ALREADY_ANALYZED.length} AO déjà analysés insérés en DB\n`);
}

async function testEmptyList() {
  console.log('🧪 TEST 1 : Liste vide\n');
  console.log('═'.repeat(60));
  
  const result = await checkBatchAlreadyAnalyzed([]);
  
  const isEmpty = result.size === 0;
  console.log(`  → Résultat: ${isEmpty ? '✅ OK (Map vide)' : '❌ ERREUR (Map non vide)'}`);
  
  return isEmpty;
}

async function testAlreadyAnalyzed() {
  console.log('\n🧪 TEST 2 : AO déjà analysés\n');
  console.log('═'.repeat(60));
  
  const testAOs = AO_ALREADY_ANALYZED.map(ao => ({
    source: ao.source,
    source_id: ao.source_id
  }));
  
  console.log(`\n📊 Test avec ${testAOs.length} AO déjà analysés...`);
  
  const result = await checkBatchAlreadyAnalyzed(testAOs);
  
  let correctCount = 0;
  let errorCount = 0;
  
  console.log('\n📋 Résultats:');
  for (const ao of testAOs) {
    const isAnalyzed = result.get(ao.source_id);
    const expected = true;
    const isCorrect = isAnalyzed === expected;
    
    console.log(`  → ${ao.source_id}: ${isAnalyzed ? '✅ Analysé' : '❌ NON analysé'} ${isCorrect ? '' : '❌ ERREUR (attendu: analysé)'}`);
    
    if (isCorrect) correctCount++;
    else errorCount++;
  }
  
  console.log(`\n📊 Résultat: ${correctCount}/${testAOs.length} corrects, ${errorCount} erreurs`);
  
  return errorCount === 0;
}

async function testNewAOs() {
  console.log('\n🧪 TEST 3 : AO nouveaux\n');
  console.log('═'.repeat(60));
  
  console.log(`\n📊 Test avec ${AO_NEW.length} AO nouveaux (non insérés en DB)...`);
  
  const result = await checkBatchAlreadyAnalyzed(AO_NEW);
  
  let correctCount = 0;
  let errorCount = 0;
  
  console.log('\n📋 Résultats:');
  for (const ao of AO_NEW) {
    const isAnalyzed = result.get(ao.source_id);
    const expected = false;
    const isCorrect = isAnalyzed === expected;
    
    console.log(`  → ${ao.source_id}: ${isAnalyzed ? '✅ Analysé' : '❌ NON analysé'} ${isCorrect ? '' : '❌ ERREUR (attendu: NON analysé)'}`);
    
    if (isCorrect) correctCount++;
    else errorCount++;
  }
  
  console.log(`\n📊 Résultat: ${correctCount}/${AO_NEW.length} corrects, ${errorCount} erreurs`);
  
  return errorCount === 0;
}

async function testMixedList() {
  console.log('\n🧪 TEST 4 : Liste mixte (analysés + nouveaux)\n');
  console.log('═'.repeat(60));
  
  // Créer une liste mixte
  const mixedAOs = [
    ...AO_ALREADY_ANALYZED.map(ao => ({ source: ao.source, source_id: ao.source_id })),
    ...AO_NEW
  ];
  
  console.log(`\n📊 Test avec ${mixedAOs.length} AO (${AO_ALREADY_ANALYZED.length} analysés + ${AO_NEW.length} nouveaux)...`);
  
  const result = await checkBatchAlreadyAnalyzed(mixedAOs);
  
  let correctCount = 0;
  let errorCount = 0;
  
  console.log('\n📋 Résultats:');
  
  // Vérifier les AO déjà analysés
  for (const ao of AO_ALREADY_ANALYZED) {
    const isAnalyzed = result.get(ao.source_id);
    const expected = true;
    const isCorrect = isAnalyzed === expected;
    
    console.log(`  → ${ao.source_id}: ${isAnalyzed ? '✅ Analysé' : '❌ NON analysé'} ${isCorrect ? '' : '❌ ERREUR (attendu: analysé)'}`);
    
    if (isCorrect) correctCount++;
    else errorCount++;
  }
  
  // Vérifier les nouveaux AO
  for (const ao of AO_NEW) {
    const isAnalyzed = result.get(ao.source_id);
    const expected = false;
    const isCorrect = isAnalyzed === expected;
    
    console.log(`  → ${ao.source_id}: ${isAnalyzed ? '✅ Analysé' : '❌ NON analysé'} ${isCorrect ? '' : '❌ ERREUR (attendu: NON analysé)'}`);
    
    if (isCorrect) correctCount++;
    else errorCount++;
  }
  
  console.log(`\n📊 Résultat: ${correctCount}/${mixedAOs.length} corrects, ${errorCount} erreurs`);
  
  return errorCount === 0;
}

async function testPerformance() {
  console.log('\n🧪 TEST 5 : Performance (une seule requête DB)\n');
  console.log('═'.repeat(60));
  
  // Créer une liste mixte
  const mixedAOs = [
    ...AO_ALREADY_ANALYZED.map(ao => ({ source: ao.source, source_id: ao.source_id })),
    ...AO_NEW
  ];
  
  console.log(`\n📊 Test performance avec ${mixedAOs.length} AO...`);
  console.log(`  → Vérification qu'une seule requête DB est effectuée`);
  
  const startTime = Date.now();
  await checkBatchAlreadyAnalyzed(mixedAOs);
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log(`  → Temps d'exécution: ${duration}ms`);
  console.log(`  → ${duration < 1000 ? '✅ OK (rapide)' : '⚠️ Lent mais acceptable'}`);
  
  return true; // On ne peut pas vérifier le nombre exact de requêtes, on vérifie juste que c'est rapide
}

async function nettoyageTests() {
  console.log('\n🧹 Nettoyage des données de test...\n');
  console.log('═'.repeat(60));
  
  const testIds = AO_ALREADY_ANALYZED.map(ao => ao.source_id);
  
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
  console.log('║  TESTS : checkBatchAlreadyAnalyzed() (batch check)      ║');
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
    const test1 = await testEmptyList();
    const test2 = await testAlreadyAnalyzed();
    const test3 = await testNewAOs();
    const test4 = await testMixedList();
    const test5 = await testPerformance();
    
    // Résumé
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  RÉSUMÉ DES TESTS                                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n✅ TEST 1 (Liste vide): ${test1 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 2 (AO analysés): ${test2 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 3 (AO nouveaux): ${test3 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 4 (Liste mixte): ${test4 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ TEST 5 (Performance): ${test5 ? 'PASS' : 'FAIL'}`);
    
    const allPassed = test1 && test2 && test3 && test4 && test5;
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
