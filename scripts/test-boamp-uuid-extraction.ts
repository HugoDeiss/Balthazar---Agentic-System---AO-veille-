// scripts/test-boamp-uuid-extraction.ts
/**
 * Script de diagnostic pour comprendre la structure des données BOAMP
 * et identifier pourquoi uuid_procedure est null
 */

import { boampFetcherTool } from '../src/mastra/tools/boamp-fetcher';

async function testBoampUUIDExtraction() {
  console.log('🔍 Test d\'extraction UUID depuis BOAMP...\n');
  
  try {
    // Récupérer quelques AO récents
    const result = await boampFetcherTool.execute!({
      since: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Il y a 2 jours
      typeMarche: 'SERVICES',
      pageSize: 5 // Seulement 5 AO pour le test
    }, {
      requestContext: {}
    }) as any;
    
    console.log(`📊 ${result.records.length} AO récupérés\n`);
    
    // Analyser chaque AO
    result.records.forEach((ao: any, index: number) => {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`AO #${index + 1}: ${ao.source_id}`);
      console.log(`Titre: ${ao.identity.title.slice(0, 60)}...`);
      console.log(`UUID procédure: ${ao.uuid_procedure || '❌ NULL'}`);
      
      // Analyser raw_json si disponible
      if (ao.raw_json) {
        const raw = ao.raw_json;
        console.log(`\n📋 Structure des données:`);
        console.log(`  - source: ${raw.source}`);
        console.log(`  - source_id: ${raw.source_id}`);
        
        // Vérifier si contractfolderid existe dans les champs
        if (raw.fields) {
          const fields = raw.fields;
          const idFields = Object.keys(fields).filter(k => 
            k.toLowerCase().includes('id') || 
            k.toLowerCase().includes('uuid') || 
            k.toLowerCase().includes('contract') ||
            k.toLowerCase().includes('folder')
          );
          
          if (idFields.length > 0) {
            console.log(`  - Champs ID/UUID/Contract dans fields: ${idFields.join(', ')}`);
            idFields.forEach(key => {
              const value = fields[key];
              if (value) {
                console.log(`    → ${key}: ${String(value).slice(0, 50)}${String(value).length > 50 ? '...' : ''}`);
              }
            });
          }
        }
        
        // Analyser donnees JSON si disponible
        if (raw.donnees) {
          let donneesObj: any;
          try {
            donneesObj = typeof raw.donnees === 'string' 
              ? JSON.parse(raw.donnees) 
              : raw.donnees;
            
            console.log(`  - Structure donnees JSON:`);
            console.log(`    → Clés principales: ${Object.keys(donneesObj).slice(0, 10).join(', ')}`);
            
            // Chercher des champs contenant UUID
            const uuidFields: string[] = [];
            function searchForUUID(obj: any, path: string = '') {
              if (typeof obj === 'object' && obj !== null) {
                for (const [key, value] of Object.entries(obj)) {
                  const currentPath = path ? `${path}.${key}` : key;
                  if (typeof value === 'string' && /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(value)) {
                    uuidFields.push(`${currentPath}: ${value}`);
                  } else if (typeof value === 'object' && value !== null) {
                    searchForUUID(value, currentPath);
                  }
                }
              }
            }
            
            searchForUUID(donneesObj);
            if (uuidFields.length > 0) {
              console.log(`    → UUID trouvés dans donnees:`);
              uuidFields.forEach(field => {
                console.log(`      • ${field}`);
              });
            } else {
              console.log(`    → ❌ Aucun UUID trouvé dans donnees`);
            }
            
            // Chercher des champs contenant "contract" ou "folder"
            const contractFields = Object.keys(donneesObj).filter(k => 
              k.toLowerCase().includes('contract') || 
              k.toLowerCase().includes('folder') ||
              k.toLowerCase().includes('identifiant') ||
              k.toLowerCase().includes('procedure')
            );
            
            if (contractFields.length > 0) {
              console.log(`    → Champs contract/folder/identifiant: ${contractFields.join(', ')}`);
              contractFields.forEach(key => {
                const value = donneesObj[key];
                if (value) {
                  console.log(`      • ${key}: ${String(value).slice(0, 50)}${String(value).length > 50 ? '...' : ''}`);
                }
              });
            }
            
          } catch (e) {
            console.log(`  - ❌ Erreur parsing donnees: ${e}`);
          }
        } else {
          console.log(`  - ❌ Pas de champ donnees disponible`);
        }
      }
    });
    
    // Statistiques
    const withUUID = result.records.filter((ao: any) => ao.uuid_procedure !== null).length;
    const withoutUUID = result.records.length - withUUID;
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 Statistiques:`);
    console.log(`  - AO avec UUID: ${withUUID}/${result.records.length} (${(withUUID / result.records.length * 100).toFixed(1)}%)`);
    console.log(`  - AO sans UUID: ${withoutUUID}/${result.records.length} (${(withoutUUID / result.records.length * 100).toFixed(1)}%)`);
    console.log(`\n`);
    
  } catch (error) {
    console.error('❌ Erreur lors du test:', error);
    throw error;
  }
}

// Exécuter le test
testBoampUUIDExtraction()
  .then(() => {
    console.log('✅ Test terminé');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test échoué:', error);
    process.exit(1);
  });
