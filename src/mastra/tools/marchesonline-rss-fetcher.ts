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
      ['dc:Location', 'location'],
      ['guid', 'guid']
    ]
  }
});

// ═══════════════════════════════════════════════════════════
// 🔄 UTILITAIRES D'EXTRACTION
// ═══════════════════════════════════════════════════════════

// Mapping département → région (réutilisé depuis boamp-fetcher.ts)
const DEPARTEMENT_TO_REGION: Record<string, string> = {
  // Île-de-France
  '75': 'Île-de-France', '77': 'Île-de-France', '78': 'Île-de-France',
  '91': 'Île-de-France', '92': 'Île-de-France', '93': 'Île-de-France',
  '94': 'Île-de-France', '95': 'Île-de-France',
  
  // Auvergne-Rhône-Alpes
  '01': 'Auvergne-Rhône-Alpes', '03': 'Auvergne-Rhône-Alpes', '07': 'Auvergne-Rhône-Alpes',
  '15': 'Auvergne-Rhône-Alpes', '26': 'Auvergne-Rhône-Alpes', '38': 'Auvergne-Rhône-Alpes',
  '42': 'Auvergne-Rhône-Alpes', '43': 'Auvergne-Rhône-Alpes', '63': 'Auvergne-Rhône-Alpes',
  '69': 'Auvergne-Rhône-Alpes', '73': 'Auvergne-Rhône-Alpes', '74': 'Auvergne-Rhône-Alpes',
  
  // Provence-Alpes-Côte d'Azur
  '04': 'Provence-Alpes-Côte d\'Azur', '05': 'Provence-Alpes-Côte d\'Azur', '06': 'Provence-Alpes-Côte d\'Azur',
  '13': 'Provence-Alpes-Côte d\'Azur', '83': 'Provence-Alpes-Côte d\'Azur', '84': 'Provence-Alpes-Côte d\'Azur',
  
  // Nouvelle-Aquitaine
  '16': 'Nouvelle-Aquitaine', '17': 'Nouvelle-Aquitaine', '19': 'Nouvelle-Aquitaine',
  '23': 'Nouvelle-Aquitaine', '24': 'Nouvelle-Aquitaine', '33': 'Nouvelle-Aquitaine',
  '40': 'Nouvelle-Aquitaine', '47': 'Nouvelle-Aquitaine', '64': 'Nouvelle-Aquitaine',
  '79': 'Nouvelle-Aquitaine', '86': 'Nouvelle-Aquitaine', '87': 'Nouvelle-Aquitaine',
  
  // Occitanie
  '09': 'Occitanie', '11': 'Occitanie', '12': 'Occitanie', '30': 'Occitanie',
  '31': 'Occitanie', '32': 'Occitanie', '34': 'Occitanie', '46': 'Occitanie',
  '48': 'Occitanie', '65': 'Occitanie', '66': 'Occitanie', '81': 'Occitanie', '82': 'Occitanie',
  
  // Hauts-de-France
  '02': 'Hauts-de-France', '59': 'Hauts-de-France', '60': 'Hauts-de-France',
  '62': 'Hauts-de-France', '80': 'Hauts-de-France',
  
  // Normandie
  '14': 'Normandie', '27': 'Normandie', '50': 'Normandie', '61': 'Normandie', '76': 'Normandie',
  
  // Grand Est
  '08': 'Grand Est', '10': 'Grand Est', '51': 'Grand Est', '52': 'Grand Est',
  '54': 'Grand Est', '55': 'Grand Est', '57': 'Grand Est', '67': 'Grand Est',
  '68': 'Grand Est', '88': 'Grand Est',
  
  // Pays de la Loire
  '44': 'Pays de la Loire', '49': 'Pays de la Loire', '53': 'Pays de la Loire',
  '72': 'Pays de la Loire', '85': 'Pays de la Loire',
  
  // Bretagne
  '22': 'Bretagne', '29': 'Bretagne', '35': 'Bretagne', '56': 'Bretagne',
  
  // Centre-Val de Loire
  '18': 'Centre-Val de Loire', '28': 'Centre-Val de Loire', '36': 'Centre-Val de Loire',
  '37': 'Centre-Val de Loire', '41': 'Centre-Val de Loire', '45': 'Centre-Val de Loire',
  
  // Bourgogne-Franche-Comté
  '21': 'Bourgogne-Franche-Comté', '25': 'Bourgogne-Franche-Comté', '39': 'Bourgogne-Franche-Comté',
  '58': 'Bourgogne-Franche-Comté', '70': 'Bourgogne-Franche-Comté', '71': 'Bourgogne-Franche-Comté',
  '89': 'Bourgogne-Franche-Comté', '90': 'Bourgogne-Franche-Comté',
  
  // Corse
  '2A': 'Corse', '2B': 'Corse',
  
  // DOM-TOM
  '971': 'Guadeloupe', '972': 'Martinique', '973': 'Guyane',
  '974': 'La Réunion',   '976': 'Mayotte'
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractAcheteurFromDescription(description: string): string | null {
  // Format 1 : "Nom complet de l'acheteur : Ville de Neuilly-sur-Seine"
  const match1 = description.match(/Nom\s+complet\s+de\s+l['']acheteur\s*[:]\s*([^<\n]+)/i);
  if (match1) return match1[1].trim();
  
  // Format 2 : "Nom officiel: REGION DES PAYS DE LA LOIRE" (pour attributions)
  const match2 = description.match(/Nom\s+officiel\s*[:]\s*([^<\n]+)/i);
  if (match2) return match2[1].trim();
  
  // Format 3 : "1.1 Acheteur\n Nom officiel: ..." (format structuré)
  const match3 = description.match(/1\.1\s+Acheteur[^<]*?Nom\s+officiel\s*[:]\s*([^<\n]+)/i);
  if (match3) return match3[1].trim();
  
  // Format 4 : Fallback générique
  const match4 = description.match(/(?:Acheteur|Organisme)[\s:]+([^<\n]+)/i);
  return match4 ? match4[1].trim() : null;
}

function extractTypeMarche(text: string): string | null {
  const upper = text.toUpperCase();
  if (upper.includes('SERVICE') || upper.includes('CONSEIL')) return 'SERVICES';
  if (upper.includes('FOURNITURE')) return 'FOURNITURES';
  if (upper.includes('TRAVAUX') || upper.includes('CONSTRUCTION')) return 'TRAVAUX';
  return null;
}

function extractEmail(text: string): string | null {
  // Priorité 1 : Chercher dans l'attribut data-email (format MarchesOnline)
  // Format: <span class="jqMailto" data-email="email@example.com">
  const dataEmailMatch = text.match(/data-email\s*=\s*["']([^"']+@[^"']+)["']/i);
  if (dataEmailMatch) return dataEmailMatch[1].trim();
  
  // Priorité 2 : Chercher dans le texte (regex standard)
  const match = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Extrait la région depuis dc:Location (format: "92 - Neuilly-sur-Seine")
 * ou depuis la description (Code Postal)
 */
function extractRegionFromLocation(location: string | undefined, description: string): string | null {
  // Priorité 1 : Utiliser dc:Location si disponible (format: "92 - Neuilly-sur-Seine")
  if (location) {
    const match = location.match(/^(\d{2,3})\s*-\s*/);
    if (match) {
      const dept = match[1];
      const region = DEPARTEMENT_TO_REGION[dept];
      if (region) {
        return region;
      }
    }
  }
  
  // Priorité 2 : Extraire Code Postal depuis description et mapper vers région
  // Format: "Code Postal : 92522" ou "Code Postal: 92522"
  const cpMatch = description.match(/Code\s+Postal\s*[:]\s*(\d{2,3})\d{3}/i);
  if (cpMatch) {
    const dept = cpMatch[1];
    const region = DEPARTEMENT_TO_REGION[dept];
    if (region) {
      return region;
    }
  }
  
  return null;
}

/**
 * Extrait les mots-clés depuis les catégories RSS
 */
function extractKeywords(item: any): string[] {
  const keywords: string[] = [];
  
  // Extraire depuis les catégories RSS (<category>)
  if (item.categories && Array.isArray(item.categories)) {
    keywords.push(...item.categories);
  } else if (item.category) {
    if (Array.isArray(item.category)) {
      keywords.push(...item.category);
    } else {
      keywords.push(item.category);
    }
  }
  
  // Filtrer les catégories génériques qui ne sont pas des mots-clés utiles
  const filtered = keywords
    .filter(k => k && typeof k === 'string')
    .filter(k => {
      const upper = k.toUpperCase();
      // Exclure les catégories trop génériques
      return !['SERVICES', 'FOURNITURES', 'TRAVAUX'].includes(upper);
    })
    .map(k => k.trim())
    .filter(k => k.length > 0);
  
  return filtered;
}

/**
 * Détecte si un item RSS est une attribution (pas un appel d'offres)
 */
function isAttribution(item: any): boolean {
  // Méthode 1 : Vérifier l'URL (guid ou link)
  const url = item.guid || item.link || '';
  if (url.includes('/attribution/') || url.includes('/am-')) {
    return true;
  }
  
  // Méthode 2 : Vérifier la description
  const description = item.description || '';
  if (description.includes('Avis d\'attribution') || 
      description.includes('avis d\'attribution') ||
      description.includes('Attribution de marché')) {
    return true;
  }
  
  return false;
}

/**
 * Détecte si un item RSS est une annulation
 */
function isCancellation(item: any): boolean {
  const description = item.description || '';
  const title = item.title || '';
  
  const cancellationPatterns = [
    /avis\s+d['']annulation/i,
    /annulation\s+d['']avis/i,
    /marché\s+annulé/i,
    /procédure\s+annulée/i
  ];
  
  return cancellationPatterns.some(pattern => 
    pattern.test(description) || pattern.test(title)
  );
}

/**
 * Normalise un item RSS MarchesOnline en format CanonicalAO
 * (même structure que BOAMP pour compatibilité)
 */
function normalizeMarchesOnlineRSSItem(item: any): CanonicalAO {
  // Gérer publication_date - peut être dans pubDate ou dc:date
  // Format pubDate: "Tue, 13 Jan 2026 00:00:00 +0100"
  // Format dc:date: "2026-01-13T00:00:00Z"
  const pubDateRaw = item.pubDate || item['dc:date'] || null;
  const pubDate = pubDateRaw
    ? new Date(pubDateRaw).toISOString().split('T')[0]
    : null;
  
  // Gérer dc:dateAccepted (deadline) - peut être dans item.deadline (customFields) ou item['dc:dateAccepted']
  // Format: "2026-02-27T00:00:00Z"
  const deadlineRaw = item.deadline || item['dc:dateAccepted'] || null;
  const deadline = deadlineRaw
    ? new Date(deadlineRaw).toISOString().split('T')[0]
    : null;
  
  const description = stripHtml(item.description || item.contentSnippet || '');
  const rawDescription = item.description || item.contentSnippet || '';
  
  // 🆕 EXTRACTION UUID PROCÉDURE depuis description
  const uuid_procedure = extractUUIDFromMarchesOnline(rawDescription);
  
  // 🆕 EXTRACTION SIRET depuis description
  const siret = extractSIRET(rawDescription);
  
  const acheteur = item.creator || extractAcheteurFromDescription(rawDescription);
  
  // 🆕 DÉTECTION ÉTAT (annulation)
  const isAnnule = isCancellation(item);
  const etat = isAnnule ? 'AVIS_ANNULE' : null;
  
  // 🆕 EXTRACTION RÉGION depuis dc:Location ou description
  // Gérer le cas où location peut être dans item.location (customFields) ou item['dc:Location']
  const locationRaw = item.location || item['dc:Location'] || null;
  const region = extractRegionFromLocation(locationRaw, rawDescription);
  
  // 🆕 EXTRACTION KEYWORDS depuis catégories RSS
  const keywords = extractKeywords(item);
  
  return {
    source: 'MARCHESONLINE',
    source_id: item.guid || item.link || `MO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    
    // 🆕 UUID universel pour déduplication
    uuid_procedure: uuid_procedure,
    
    identity: {
      title: item.title || '',
      acheteur: acheteur,
      url: item.link || null,
      region: region
    },
    
    lifecycle: {
      etat: etat,
      nature: null,
      nature_label: isAnnule ? 'Avis d\'annulation' : null,
      annonce_lie: null,
      annonces_anterieures: null,
      publication_date: pubDate,
      deadline: deadline
    },
    
    content: {
      description: description,
      keywords: keywords
    },
    
    classification: {
      type_marche: extractTypeMarche(item.description || item.title || ''),
      procedure: null,
      famille: null
    },
    
    metadata: {
      acheteur_email: extractEmail(rawDescription),
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
          
          // 🆕 FILTRER LES ATTRIBUTIONS (ne pas les traiter comme des AO)
          if (isAttribution(item)) {
            console.log(`[MarchesOnline] ⏭️  Attribution ignorée: ${item.title?.slice(0, 50)}...`);
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
