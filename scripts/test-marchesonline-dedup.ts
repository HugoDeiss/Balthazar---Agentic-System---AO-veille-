// scripts/test-marchesonline-dedup.ts
/**
 * Script de test pour vérifier l'extraction du numéro d'annonce BOAMP
 * depuis les flux RSS MarchesOnline et la déduplication
 */

import Parser from 'rss-parser';
import { extractBoampAnnouncementNumber } from '../src/utils/cross-platform-dedup';

const parser = new Parser({
  customFields: {
    item: [
      ['dc:creator', 'creator'],
      ['dc:dateAccepted', 'deadline'],
      ['guid', 'guid']
    ]
  }
});

async function testMarchesOnlineDedup() {
  console.log('🔍 Test d\'extraction numéro d\'annonce BOAMP depuis MarchesOnline RSS...\n');
  
  // ═══════════════════════════════════════════════════════════
  // CONFIGURATION : Utiliser le flux RSS réel ou celui fourni en variable d'env
  // ═══════════════════════════════════════════════════════════
  const rssUrl = process.env.MARCHESONLINE_RSS_URL || 
    'https://www.marchesonline.com/mol/rss/appels-d-offres-domaine-activite-services.xml';
  
  try {
    console.log(`📡 Récupération du flux RSS: ${rssUrl}\n`);
    const feed = await parser.parseURL(rssUrl);
    
    console.log(`📊 ${feed.items.length} items trouvés dans le flux\n`);
    
    if (feed.items.length === 0) {
      console.log('⚠️ Aucun item trouvé dans le flux RSS');
      process.exit(0);
    }
    
    // Analyser tous les items
    console.log(`${'='.repeat(80)}\n`);
    console.log(`Analyse de ${feed.items.length} items\n`);
    console.log(`${'='.repeat(80)}\n`);
    
    let foundCount = 0;
    let notFoundCount = 0;
    const foundNumbers: string[] = [];
    
    feed.items.forEach((item, index) => {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`Item #${index + 1}`);
      console.log(`${'─'.repeat(80)}`);
      console.log(`Titre: ${item.title || 'N/A'}`);
      console.log(`GUID: ${item.guid || item.link || 'N/A'}`);
      console.log(`Date: ${item.pubDate || 'N/A'}`);
      
      // Description HTML brute
      const descriptionHtml = item.description || item.contentSnippet || '';
      const descriptionPreview = descriptionHtml.slice(0, 300);
      console.log(`\n📄 Description HTML (premiers 300 caractères):`);
      console.log(descriptionPreview + (descriptionHtml.length > 300 ? '...' : ''));
      
      // Extraire le numéro d'annonce BOAMP
      const boampNumber = extractBoampAnnouncementNumber(descriptionHtml);
      
      if (boampNumber) {
        foundCount++;
        foundNumbers.push(boampNumber);
        console.log(`\n✅ Numéro d'annonce BOAMP trouvé: "${boampNumber}"`);
        
        // Afficher le contexte où il a été trouvé
        const matchIndex = descriptionHtml.toLowerCase().indexOf(boampNumber.toLowerCase());
        if (matchIndex >= 0) {
          const contextStart = Math.max(0, matchIndex - 50);
          const contextEnd = Math.min(descriptionHtml.length, matchIndex + boampNumber.length + 50);
          const context = descriptionHtml.slice(contextStart, contextEnd);
          console.log(`   Contexte: "...${context}..."`);
        }
      } else {
        notFoundCount++;
        console.log(`\n❌ Aucun numéro d'annonce BOAMP trouvé`);
        
        // Chercher des patterns similaires pour debug
        const patterns = [
          /Annonce[^<]*?(\d{2}-\d+)/i,
          /(\d{2}-\d{4,})/g
        ];
        
        patterns.forEach((pattern, pIdx) => {
          const matches = descriptionHtml.match(pattern);
          if (matches) {
            const uniqueMatches = [...new Set(matches.slice(1))].filter(m => m && /^\d{2}-\d{4,}$/.test(m));
            if (uniqueMatches.length > 0) {
              console.log(`   Pattern ${pIdx + 1} trouvé: ${uniqueMatches.slice(0, 3).join(', ')}${uniqueMatches.length > 3 ? '...' : ''}`);
            }
          }
        });
      }
    });
    
    // Statistiques
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 Statistiques:`);
    console.log(`   ✅ Numéros d'annonce trouvés: ${foundCount}/${feed.items.length} (${(foundCount / feed.items.length * 100).toFixed(1)}%)`);
    console.log(`   ❌ Non trouvés: ${notFoundCount}/${feed.items.length} (${(notFoundCount / feed.items.length * 100).toFixed(1)}%)`);
    
    if (foundNumbers.length > 0) {
      console.log(`\n📋 Numéros extraits: ${foundNumbers.join(', ')}`);
      console.log(`\n💡 Ces numéros peuvent être utilisés pour déduplication avec boamp_id en base de données`);
    }
    
    if (foundCount === 0) {
      console.log('\n⚠️ Aucun numéro d\'annonce BOAMP trouvé dans les items analysés.');
      console.log('   Cela peut signifier que :');
      console.log('   1. Le format est différent de celui attendu');
      console.log('   2. Les items ne contiennent pas de référence BOAMP');
      console.log('   3. Le pattern d\'extraction doit être ajusté');
      console.log('\n   💡 Vérifiez la structure HTML de la description ci-dessus.\n');
    }
    
  } catch (error: any) {
    console.error('❌ Erreur lors du test:', error.message);
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error('   Impossible de se connecter au flux RSS. Vérifiez l\'URL.');
    }
    throw error;
  }
}

// Exécuter le test
testMarchesOnlineDedup()
  .then(() => {
    console.log('\n✅ Test terminé');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test échoué:', error);
    process.exit(1);
  });
