#!/usr/bin/env ts-node
// ════════════════════════════════════════════════════════════════
// SCRIPT : Vérification de la connexion Supabase
// ════════════════════════════════════════════════════════════════

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function checkConnection() {
  console.log('🔍 Vérification de la connexion Supabase...\n');
  
  // Vérifier les variables d'environnement
  if (!process.env.SUPABASE_URL) {
    console.error('❌ SUPABASE_URL non défini dans .env');
    process.exit(1);
  }
  
  if (!process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_KEY non défini dans .env');
    process.exit(1);
  }
  
  const url = process.env.SUPABASE_URL;
  const match = url.match(/https?:\/\/([^\.]+)\.supabase\.co/);
  
  if (!match) {
    console.error('❌ Format URL Supabase invalide:', url);
    console.error('   Format attendu: https://PROJECT_ID.supabase.co');
    process.exit(1);
  }
  
  const projectId = match[1];
  console.log(`📋 Projet Supabase: ${projectId}`);
  console.log(`📋 URL: ${url.substring(0, 50)}...\n`);
  
  // Test de connexion
  const supabase = createClient(url, process.env.SUPABASE_SERVICE_KEY);
  
  try {
    console.log('🔗 Test de connexion...');
    const { data, error } = await supabase
      .from('appels_offres')
      .select('id')
      .limit(1);
    
    if (error) {
      if (error.message.includes('ENOTFOUND') || error.message.includes('fetch failed')) {
        console.error('\n❌ Erreur DNS: Impossible de résoudre le domaine Supabase');
        console.error(`   Domaine: ${projectId}.supabase.co`);
        console.error(`   Erreur: ${error.message}`);
        console.error('\n💡 Solutions possibles:');
        console.error('   1. Vérifier que le projet Supabase existe dans votre dashboard');
        console.error('      https://supabase.com/dashboard/project/' + projectId);
        console.error('   2. Vérifier que l\'URL dans .env est correcte');
        console.error('   3. Vérifier votre connexion internet');
        console.error('   4. Le projet Supabase pourrait être suspendu ou supprimé');
        console.error('   5. Si vous utilisez un projet local, vérifier qu\'il est démarré');
        process.exit(1);
      } else if (error.code === 'PGRST301' || error.message.includes('permission')) {
        console.error('\n❌ Erreur d\'authentification:');
        console.error(`   ${error.message}`);
        console.error('\n💡 Vérifiez que SUPABASE_SERVICE_KEY dans .env est correct');
        process.exit(1);
      } else {
        console.error('\n❌ Erreur de connexion:');
        console.error(`   ${error.message}`);
        console.error(`   Code: ${error.code || 'N/A'}`);
        process.exit(1);
      }
    }
    
    console.log('✅ Connexion Supabase réussie !');
    console.log('✅ L\'accès à la base de données fonctionne correctement\n');
    
    // Test de la table appels_offres
    console.log('🔍 Test d\'accès à la table appels_offres...');
    const { count, error: countError } = await supabase
      .from('appels_offres')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.warn('⚠️  Erreur lors du comptage:', countError.message);
      console.warn('   (La connexion fonctionne mais la table pourrait ne pas exister)');
    } else {
      console.log(`✅ Table appels_offres accessible (${count || 0} entrées)`);
    }
    
    console.log('\n✅ Tous les tests de connexion sont passés !');
    process.exit(0);
    
  } catch (error: any) {
    console.error('\n❌ Erreur inattendue:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkConnection().catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
