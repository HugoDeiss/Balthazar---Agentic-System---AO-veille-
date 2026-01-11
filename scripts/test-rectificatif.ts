#!/usr/bin/env ts-node
// ════════════════════════════════════════════════════════════════
// SCRIPT DE TEST : Simulation d'un rectificatif BOAMP
// ════════════════════════════════════════════════════════════════

import 'dotenv/config';
import * as readline from 'readline';
import { createClient } from '@supabase/supabase-js';
import {
  isRectification,
  findOriginalAO,
  detectSubstantialChanges,
  formatChangesForEmail
} from '../src/mastra/workflows/rectificatif-utils';

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

const TEST_AO_ORIGINAL = {
  source: 'BOAMP',
  source_id: 'TEST-2025-001',
  boamp_id: 'TEST-2025-001',
  title: 'Mission de conseil en stratégie digitale',
  description: 'Accompagnement à la transformation numérique',
  acheteur: 'Région Île-de-France',
  acheteur_email: 'marches@iledefrance.fr',
  budget_max: 100000,
  deadline: '2025-03-01T23:59:59Z',
  publication_date: '2025-01-15T10:00:00Z',
  type_marche: 'SERVICES',
  region: 'Île-de-France',
  url_ao: 'https://www.boamp.fr/avis/TEST-2025-001',
  raw_json: {
    idweb: 'TEST-2025-001',
    nature_categorise: 'appeloffre/standard',
    donnees: {
      CONDITION_PARTICIPATION: {
        CAP_ECO: 'CA minimum : 500k€',
        CAP_TECH: '3 références similaires'
      }
    }
  },
  client_id: 'balthazar',
  status: 'analyzed',
  analyzed_at: '2025-01-15T12:00:00Z',
  semantic_score: 75,
  priority: 'MOYENNE'
};

const TEST_RECTIFICATIF_SUBSTANTIEL = {
  source: 'BOAMP',
  source_id: 'TEST-2025-001-RECT',
  title: 'Mission de conseil en stratégie digitale',
  description: 'Accompagnement à la transformation numérique (RECTIFICATIF)',
  acheteur: 'Région Île-de-France',
  acheteur_email: 'marches@iledefrance.fr',
  budget_max: 500000, // x5 !
  deadline: '2025-03-20T23:59:59Z', // +19 jours
  publication_date: '2025-01-20T10:00:00Z',
  type_marche: 'SERVICES',
  region: 'Île-de-France',
  url_ao: 'https://www.boamp.fr/avis/TEST-2025-001-RECT',
  raw_json: {
    idweb: 'TEST-2025-001-RECT',
    nature_categorise: 'avis_rectificatif', // ← Rectificatif !
    annonce_lie: 'TEST-2025-001', // ← Lien vers l'original
    donnees: {
      CONDITION_PARTICIPATION: {
        CAP_ECO: 'CA minimum : 2M€', // Changé !
        CAP_TECH: '5 références similaires' // Changé !
      }
    }
  }
};

const TEST_RECTIFICATIF_MINEUR = {
  source: 'BOAMP',
  source_id: 'TEST-2025-002-RECT',
  title: 'Mission de conseil en stratégie digitale', // Identique à l'original
  description: 'Accompagnement à la transformation numérique (correction de date)',
  acheteur: 'Région Île-de-France', // Identique à l'original
  acheteur_email: 'marches@iledefrance.fr', // Identique à l'original
  budget_max: 100000, // Identique à l'original (pas de changement)
  deadline: '2025-02-18T23:59:59Z', // +3 jours seulement (< 7 jours, OK pour mineur)
  publication_date: '2025-01-20T10:00:00Z',
  type_marche: 'SERVICES', // Identique à l'original
  region: 'Île-de-France', // Identique à l'original
  url_ao: 'https://www.boamp.fr/avis/TEST-2025-002-RECT',
  raw_json: {
    idweb: 'TEST-2025-002-RECT',
    nature_categorise: 'avis_rectificatif',
    annonce_lie: 'TEST-2025-002',
    donnees: {
      CONDITION_PARTICIPATION: {
        CAP_ECO: 'CA minimum : 500k€', // Identique à l'original
        CAP_TECH: '3 références similaires' // Identique à l'original
      }
    }
  }
};

// ────────────────────────────────────────────────────────────────
// FONCTIONS DE TEST
// ────────────────────────────────────────────────────────────────

async function testDetection() {
  console.log('\n🧪 TEST 1 : Détection des rectificatifs\n');
  console.log('═'.repeat(60));
  
  // Test 1a : AO standard
  console.log('\n📄 AO Standard:');
  const isStandard = isRectification(TEST_AO_ORIGINAL);
  console.log(`  → isRectification: ${isStandard} ${isStandard ? '❌ ERREUR' : '✅ OK'}`);
  
  // Test 1b : Rectificatif substantiel
  console.log('\n📝 Rectificatif Substantiel:');
  const isRectifSubstantiel = isRectification(TEST_RECTIFICATIF_SUBSTANTIEL);
  console.log(`  → isRectification: ${isRectifSubstantiel} ${isRectifSubstantiel ? '✅ OK' : '❌ ERREUR'}`);
  
  // Test 1c : Rectificatif mineur
  console.log('\n📝 Rectificatif Mineur:');
  const isRectifMineur = isRectification(TEST_RECTIFICATIF_MINEUR);
  console.log(`  → isRectification: ${isRectifMineur} ${isRectifMineur ? '✅ OK' : '❌ ERREUR'}`);
}

async function testRetrouvageOriginal() {
  console.log('\n🧪 TEST 2 : Retrouver l\'AO original\n');
  console.log('═'.repeat(60));
  
  // Insérer l'AO original dans Supabase
  console.log('\n📥 Insertion de l\'AO original dans Supabase...');
  const { data: inserted, error: insertError } = await supabase
    .from('appels_offres')
    .upsert(TEST_AO_ORIGINAL, { onConflict: 'source_id' })
    .select()
    .single();
  
  if (insertError) {
    console.error('❌ Erreur insertion:', insertError);
    return;
  }
  
  console.log(`✅ AO original inséré (ID: ${inserted.id})`);
  
  // Tenter de retrouver l'original
  console.log('\n🔍 Recherche de l\'AO original via rectificatif...');
  const foundOriginal = await findOriginalAO(TEST_RECTIFICATIF_SUBSTANTIEL);
  
  if (foundOriginal) {
    console.log(`✅ AO original retrouvé !`);
    console.log(`  → ID: ${foundOriginal.id}`);
    console.log(`  → Source ID: ${foundOriginal.source_id}`);
    console.log(`  → Titre: ${foundOriginal.title}`);
  } else {
    console.log('❌ AO original introuvable');
  }
}

async function testDetectionChangements() {
  console.log('\n🧪 TEST 3 : Détection des changements substantiels\n');
  console.log('═'.repeat(60));
  
  // Test 3a : Rectificatif substantiel
  console.log('\n📊 Rectificatif SUBSTANTIEL (budget x5, deadline +19j, critères changés):');
  const resultSubstantiel = detectSubstantialChanges(
    TEST_AO_ORIGINAL,
    TEST_RECTIFICATIF_SUBSTANTIEL
  );
  
  console.log(`  → isSubstantial: ${resultSubstantiel.isSubstantial} ${resultSubstantiel.isSubstantial ? '✅ OK' : '❌ ERREUR'}`);
  console.log(`  → Nombre de changements: ${resultSubstantiel.changes.length}`);
  
  if (resultSubstantiel.changes.length > 0) {
    console.log('\n  📋 Détails des changements:');
    console.log(formatChangesForEmail(resultSubstantiel.changes).split('\n').map(l => `    ${l}`).join('\n'));
  }
  
  // Test 3b : Rectificatif mineur
  console.log('\n📊 Rectificatif MINEUR (deadline +3j seulement):');
  const aoOriginalMineur = {
    ...TEST_AO_ORIGINAL,
    source_id: 'TEST-2025-002',
    deadline: '2025-02-15T23:59:59Z'
  };
  
  const resultMineur = detectSubstantialChanges(
    aoOriginalMineur,
    TEST_RECTIFICATIF_MINEUR
  );
  
  console.log(`  → isSubstantial: ${resultMineur.isSubstantial} ${!resultMineur.isSubstantial ? '✅ OK' : '❌ ERREUR'}`);
  console.log(`  → Nombre de changements: ${resultMineur.changes.length}`);
}

async function testFluxComplet() {
  console.log('\n🧪 TEST 4 : Flux complet de traitement\n');
  console.log('═'.repeat(60));
  
  // Récupérer l'AO original
  const { data: originalAO } = await supabase
    .from('appels_offres')
    .select('*')
    .eq('source_id', 'TEST-2025-001')
    .single();
  
  if (!originalAO) {
    console.log('❌ AO original introuvable (exécuter TEST 2 d\'abord)');
    return;
  }
  
  console.log('✅ AO original récupéré');
  console.log(`  → Score sémantique: ${originalAO.semantic_score}`);
  console.log(`  → Priorité: ${originalAO.priority}`);
  
  // Simuler le traitement du rectificatif
  console.log('\n🔄 Traitement du rectificatif substantiel...');
  
  const changeResult = detectSubstantialChanges(originalAO, TEST_RECTIFICATIF_SUBSTANTIEL);
  
  if (changeResult.isSubstantial) {
    console.log('✅ Changements substantiels détectés → Re-analyse requise');
    
    // Construire l'historique
    const history = originalAO.analysis_history || [];
    history.push({
      date: originalAO.analyzed_at,
      semantic_score: originalAO.semantic_score,
      priority: originalAO.priority
    });
    
    console.log('\n💾 Mise à jour de l\'AO avec historique...');
    
    const { error: updateError } = await supabase
      .from('appels_offres')
      .update({
        is_rectified: true,
        rectification_date: new Date().toISOString(),
        rectification_count: (originalAO.rectification_count || 0) + 1,
        analysis_history: history,
        rectification_changes: {
          changes: changeResult.changes,
          detected_at: new Date().toISOString()
        }
      })
      .eq('id', originalAO.id);
    
    if (updateError) {
      console.error('❌ Erreur mise à jour:', updateError);
    } else {
      console.log('✅ AO mis à jour avec succès');
      
      // Vérifier la mise à jour
      const { data: updatedAO } = await supabase
        .from('appels_offres')
        .select('*')
        .eq('id', originalAO.id)
        .single();
      
      console.log('\n📊 État après mise à jour:');
      console.log(`  → is_rectified: ${updatedAO.is_rectified}`);
      console.log(`  → rectification_count: ${updatedAO.rectification_count}`);
      console.log(`  → analysis_history: ${JSON.stringify(updatedAO.analysis_history, null, 2)}`);
    }
  } else {
    console.log('✅ Changements mineurs → Simple update (pas de re-analyse)');
  }
}

async function nettoyageTests() {
  console.log('\n🧹 Nettoyage des données de test...\n');
  console.log('═'.repeat(60));
  
  const { error } = await supabase
    .from('appels_offres')
    .delete()
    .like('source_id', 'TEST-%');
  
  if (error) {
    console.error('❌ Erreur nettoyage:', error);
  } else {
    console.log('✅ Données de test supprimées');
  }
}

// ────────────────────────────────────────────────────────────────
// EXÉCUTION
// ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  TESTS : Gestion des Rectificatifs BOAMP                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  try {
    // Vérifier les variables d'environnement
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      console.error('\n❌ Variables d\'environnement manquantes:');
      console.error('  - SUPABASE_URL');
      console.error('  - SUPABASE_SERVICE_KEY');
      process.exit(1);
    }
    
    // Exécuter les tests
    await testDetection();
    await testRetrouvageOriginal();
    await testDetectionChangements();
    await testFluxComplet();
    
    // Nettoyage (optionnel)
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('\n❓ Supprimer les données de test ? (y/N) ', async (answer: string) => {
      if (answer.toLowerCase() === 'y') {
        await nettoyageTests();
      }
      
      console.log('\n✅ Tests terminés !');
      rl.close();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('\n❌ Erreur lors des tests:', error);
    process.exit(1);
  }
}

// Exécuter si appelé directement
main().catch((error: Error) => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});


