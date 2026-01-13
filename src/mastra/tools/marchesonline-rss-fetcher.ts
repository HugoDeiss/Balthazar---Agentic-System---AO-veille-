// src/mastra/tools/marchesonline-rss-fetcher.ts
import { createTool } from '@mastra/core';
import { z } from 'zod';
import Parser from 'rss-parser';
import { extractUUIDFromMarchesOnline, extractSIRET } from '../../utils/cross-platform-dedup';
import type { CanonicalAO } from './boamp-fetcher';

const parser = new Parser({
  customFields: {
    item: [
      ['dc:creator', 'creator'],
      ['dc:dateAccepted', 'deadline'],
      ['guid', 'guid']
    ]
  }
});

// ═══════════════════════════════════════════════════════════
// 🔄 UTILITAIRES D'EXTRACTION
// ═══════════════════════════════════════════════════════════

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractAcheteurFromDescription(description: string): string | null {
  const match = description.match(/(?:Acheteur|Organisme)[\s:]+([^<\n]+)/i);
  return match ? match[1].trim() : null;
}

function extractTypeMarche(text: string): string | null {
  const upper = text.toUpperCase();
  if (upper.includes('SERVICE') || upper.includes('CONSEIL')) return 'SERVICES';
  if (upper.includes('FOURNITURE')) return 'FOURNITURES';
  if (upper.includes('TRAVAUX') || upper.includes('CONSTRUCTION')) return 'TRAVAUX';
  return null;
}

function extractEmail(text: string): string | null {
  const match = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function extractRegionFromDescription(description: string): string | null {
  // Chercher des mentions de régions ou départements
  // À améliorer selon le format réel des flux RSS
  return null; // Placeholder
}

function extractKeywords(description: string): string[] {
  // Extraire des mots-clés depuis la description
  // À améliorer selon le format réel
  return [];
}

/**
 * Normalise un item RSS MarchesOnline en format CanonicalAO
 * (même structure que BOAMP pour compatibilité)
 */
function normalizeMarchesOnlineRSSItem(item: any): CanonicalAO {
  const pubDate = item.pubDate 
    ? new Date(item.pubDate).toISOString().split('T')[0]
    : null;
  
  const deadline = item.deadline || item['dc:dateAccepted']
    ? new Date(item.deadline || item['dc:dateAccepted']).toISOString().split('T')[0]
    : null;
  
  const description = stripHtml(item.description || item.contentSnippet || '');
  
  // 🆕 EXTRACTION UUID PROCÉDURE depuis description
  const uuid_procedure = extractUUIDFromMarchesOnline(item.description || '');
  
  // 🆕 EXTRACTION SIRET depuis description
  const siret = extractSIRET(item.description || '');
  
  const acheteur = item.creator || extractAcheteurFromDescription(item.description || '');
  
  return {
    source: 'MARCHESONLINE',
    source_id: item.guid || item.link || `MO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    
    // 🆕 UUID universel pour déduplication
    uuid_procedure: uuid_procedure,
    
    identity: {
      title: item.title || '',
      acheteur: acheteur,
      url: item.link || null,
      region: extractRegionFromDescription(item.description || '')
    },
    
    lifecycle: {
      etat: null,
      nature: null,
      nature_label: null,
      annonce_lie: null,
      annonces_anterieures: null,
      publication_date: pubDate,
      deadline: deadline
    },
    
    content: {
      description: description,
      keywords: extractKeywords(item.description || '')
    },
    
    classification: {
      type_marche: extractTypeMarche(item.description || item.title || ''),
      procedure: null,
      famille: null
    },
    
    metadata: {
      acheteur_email: extractEmail(item.description || ''),
      acheteur_tel: null,
      acheteur_adresse: null,
      acheteur_cp: null,
      acheteur_ville: null,
      criteres: null,
      marche_public_simplifie: null,
      titulaire: null,
      siret: siret as any  // 🆕 SIRET pour déduplication niveau 3 (ajouté au type)
    }
  };
}

// ═══════════════════════════════════════════════════════════
// 🛠️ TOOL MARCHESONLINE RSS FETCHER
// ═══════════════════════════════════════════════════════════

export const marchesonlineRSSFetcherTool = createTool({
  id: 'marchesonline-rss-fetcher',
  description: 'Récupère les appels d\'offres depuis les flux RSS de MarchesOnline',
  
  inputSchema: z.object({
    rssUrls: z.array(z.string().url())
      .describe('Liste des URLs des flux RSS MarchesOnline à récupérer'),
    since: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Date au format YYYY-MM-DD (ex: 2025-12-17)')
      .optional(),
    typeMarche: z.enum(['SERVICES', 'FOURNITURES', 'TRAVAUX'])
      .default('SERVICES')
      .optional(),
  }),
  
  execute: async (inputData: any) => {
    const { rssUrls, since, typeMarche } = inputData;
    
    const targetDate = since || new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const allRecords: CanonicalAO[] = [];
    
    // Récupérer tous les flux RSS
    for (const rssUrl of rssUrls) {
      try {
        console.log(`[MarchesOnline] Fetching ${rssUrl}...`);
        const feed = await parser.parseURL(rssUrl);
        
        console.log(`[MarchesOnline] ${rssUrl}: ${feed.items.length} items trouvés`);
        
        for (const item of feed.items || []) {
          const pubDate = item.pubDate 
            ? new Date(item.pubDate).toISOString().split('T')[0]
            : null;
          
          // Filtrer par date si spécifiée
          if (since && pubDate !== targetDate) {
            continue;
          }
          
          const normalized = normalizeMarchesOnlineRSSItem(item);
          
          // Filtrer par type de marché si disponible
          if (typeMarche && normalized.classification.type_marche !== typeMarche) {
            continue;
          }
          
          allRecords.push(normalized);
        }
      } catch (error) {
        console.error(`[MarchesOnline] Erreur lors de la récupération du flux RSS ${rssUrl}:`, error);
      }
    }
    
    console.log(`[MarchesOnline] Total: ${allRecords.length} AO récupérés`);
    
    return {
      source: 'MARCHESONLINE',
      query: { rssUrls, since: targetDate, typeMarche },
      total_count: allRecords.length,
      fetched: allRecords.length,
      records: allRecords,
      status: 'success'
    };
  }
});
