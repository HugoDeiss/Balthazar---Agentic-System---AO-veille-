// src/mastra/tools/boamp-fetcher.ts
import { createTool } from '@mastra/core';
import { z } from 'zod';

// Mapping département → région
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
  '974': 'La Réunion', '976': 'Mayotte'
};

export const boampFetcherTool = createTool({
  id: 'boamp-fetcher',
  description: 'Récupère les appels d\'offres BOAMP (hors attributions)',
  
  inputSchema: z.object({
    since: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Date au format YYYY-MM-DD (ex: 2025-12-17)')
      .optional(),
    
    typeMarche: z.enum(['SERVICES', 'FOURNITURES', 'TRAVAUX'])
      .default('SERVICES'),
    
    pageSize: z.number()
      .min(1)
      .max(300)
      .default(200)
      .describe('Taille de page pour pagination (recommandé: 200-300)')
  }),
  
  execute: async ({ context }) => {
    const { since, typeMarche, pageSize } = context;
    
    const baseUrl = 'https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records';
    
    // 📅 Calcul automatique des dates
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateIn7Days = new Date(today);
    dateIn7Days.setDate(dateIn7Days.getDate() + 7);
    
    const formatDate = (date: Date) => date.toISOString().split('T')[0];
    const targetDate = since || formatDate(yesterday);
    const minDeadline = formatDate(dateIn7Days);
    
    // 🔍 WHERE - Nouvelle stratégie de filtrage structurel
    const whereFilters = [
      // 1️⃣ TEMPORALITÉ : Avis publiés la veille (ou date spécifiée)
      `dateparution = date'${targetDate}'`,
      
      // 2️⃣ TYPOLOGIE : Nouveaux avis + Rectificatifs + Annulations
      `(nature_categorise = 'appeloffre/standard' OR annonce_lie IS NOT NULL OR annonces_anterieures IS NOT NULL OR etat = 'AVIS_ANNULE')`,
      
      // 3️⃣ ATTRIBUTION : Marché encore ouvert
      `titulaire IS NULL`,
      
      // 4️⃣ DEADLINE : Exploitable (NULL accepté pour AO stratégiques)
      `(datelimitereponse IS NULL OR datelimitereponse >= date'${minDeadline}')`,
      
      // 5️⃣ TYPE MARCHÉ : Compatible conseil
      `type_marche = '${typeMarche}'`
    ];
    
    const whereClause = whereFilters.join(' AND ');
    
    // 📦 SELECT (champs à récupérer)
    const selectFields = [
      // 🔴 Essentiels
      'idweb',
      'objet',
      'nomacheteur',
      'dateparution',
      'datelimitereponse',
      'type_marche',
      'nature_categorise',
      'nature_libelle',
      'url_avis',
      'code_departement',
      'descripteur_libelle',  // Mots-clés
      
      // 🟠 Enrichissement
      'donnees',              // JSON complet
      
      // 🆕 Nouveaux champs pour filtrage et analyse
      'etat',                 // État de l'AO (AVIS_ANNULE, etc.)
      'procedure_libelle',    // Type de procédure (ouvert, restreint, etc.)
      'criteres',             // Critères d'attribution
      'annonce_lie',          // Correctifs publiés
      'annonces_anterieures', // Renouvellements
      'titulaire',            // Attribution (null = pas encore attribué)
      'marche_public_simplifie', // MPS
      'famille_libelle'       // Famille de marché
    ].join(',');
    
    // ═══════════════════════════════════════════════════════════
    // 🔄 PAGINATION EXHAUSTIVE (CRITIQUE)
    // ═══════════════════════════════════════════════════════════
    console.log(`🔗 Fetching BOAMP avec pagination exhaustive...`);
    console.log(`📅 Date cible: ${targetDate}`);
    console.log(`📦 Page size: ${pageSize}`);
    
    let allRecords: any[] = [];
    let offset = 0;
    let totalCount = 0;
    let pageNumber = 1;
    
    do {
      // Construire les paramètres de requête pour cette page
      const params = new URLSearchParams({
        select: selectFields,
        where: whereClause,
        order_by: 'dateparution desc',
        limit: pageSize.toString(),
        offset: offset.toString()
      });
      
      console.log(`📄 Page ${pageNumber}: fetching ${pageSize} AO (offset=${offset})...`);
      
      const response = await fetch(`${baseUrl}?${params}`);
      
      if (!response.ok) {
        throw new Error(`BOAMP API error ${response.status} on page ${pageNumber}`);
      }
      
      const data = await response.json();
      
      // Première page : récupérer le total_count
      if (pageNumber === 1) {
        totalCount = data.total_count || 0;
        console.log(`📊 Total AO disponibles: ${totalCount}`);
        
        if (totalCount === 0) {
          console.log(`ℹ️ Aucun AO trouvé pour les critères spécifiés`);
          break;
        }
        
        if (totalCount > 1000) {
          console.warn(`⚠️ ALERTE: ${totalCount} AO détectés (journée exceptionnelle)`);
        }
      }
      
      // Ajouter les résultats de cette page
      const pageResults = data.results || [];
      allRecords.push(...pageResults);
      
      console.log(`✅ Page ${pageNumber}: ${pageResults.length} AO récupérés`);
      console.log(`📊 Progression: ${allRecords.length}/${totalCount} (${Math.round(allRecords.length / totalCount * 100)}%)`);
      
      // Condition d'arrêt explicite
      if (pageResults.length < pageSize || offset + pageSize >= totalCount) {
        console.log(`🏁 Pagination terminée`);
        break;
      }
      
      // Préparer la page suivante
      offset += pageSize;
      pageNumber++;
      
      // Sécurité : éviter les boucles infinies
      if (pageNumber > 100) {
        throw new Error(`PAGINATION ABORT: Plus de 100 pages (${pageNumber * pageSize} AO), vérifier la logique`);
      }
      
    } while (offset < totalCount);
    
    // ═══════════════════════════════════════════════════════════
    // ✅ VÉRIFICATION DE COMPLÉTUDE (TOLÉRANCE CONTRÔLÉE)
    // ═══════════════════════════════════════════════════════════
    const missing = totalCount - allRecords.length;
    const missingRatio = totalCount > 0 ? missing / totalCount : 0;
    
    // Seuils de tolérance (production-grade)
    const ABSOLUTE_THRESHOLD = 3;      // Max 3 AO manquants
    const RELATIVE_THRESHOLD = 0.005;  // Max 0.5% de perte
    
    if (missing > 0) {
      // ⚠️ INCOHÉRENCE DÉTECTÉE
      console.warn(`⚠️ BOAMP INCONSISTENCY: missing=${missing}, total=${totalCount}, ratio=${(missingRatio * 100).toFixed(2)}%`);
      
      // Déterminer si l'incohérence est critique
      const isCritical = missing > ABSOLUTE_THRESHOLD && missingRatio > RELATIVE_THRESHOLD;
      
      if (isCritical) {
        // 🚨 INCOHÉRENCE CRITIQUE → FAIL-FAST
        const error = `BOAMP FETCH CRITICAL INCONSISTENCY: fetched=${allRecords.length}, expected=${totalCount}, missing=${missing} (${(missingRatio * 100).toFixed(2)}%)`;
        console.error(`🚨 ${error}`);
        throw new Error(error);
      } else {
        // 🟡 INCOHÉRENCE TOLÉRÉE → CONTINUER AVEC ALERTE
        console.warn(`🟡 BOAMP INCONSISTENCY TOLERATED: missing=${missing} AO (within acceptable threshold)`);
        console.warn(`📊 Thresholds: absolute=${ABSOLUTE_THRESHOLD}, relative=${(RELATIVE_THRESHOLD * 100).toFixed(2)}%`);
        console.warn(`⚠️ This fetch will be marked as DEGRADED`);
        
        // TODO: Implémenter retry différé automatique
        // scheduleRetry({ source: 'boamp', date: targetDate, delayMinutes: 60 });
      }
    } else if (missing < 0) {
      // 🔴 ANOMALIE : Plus de résultats que prévu (impossible normalement)
      console.error(`🔴 BOAMP ANOMALY: fetched=${allRecords.length} > expected=${totalCount} (surplus=${-missing})`);
      throw new Error(`BOAMP FETCH ANOMALY: More records than expected (fetched=${allRecords.length}, expected=${totalCount})`);
    } else {
      // ✅ EXHAUSTIVITÉ PARFAITE
      console.log(`✅ Vérification: ${allRecords.length}/${totalCount} AO récupérés (100% exhaustif)`);
    }
    
    // ═══════════════════════════════════════════════════════════
    // 📊 NORMALISATION (APRÈS PAGINATION)
    // ═══════════════════════════════════════════════════════════
    const data = { results: allRecords, total_count: totalCount };
    
    // 📊 NORMALISATION
    const normalized = data.results.map((record: any) => {
      // Parse le JSON "donnees" pour extraire les infos riches
      let donneesObj: any = null;
      try {
        donneesObj = typeof record.donnees === 'string' 
          ? JSON.parse(record.donnees) 
          : record.donnees;
      } catch (e) {
        console.warn(`Failed to parse donnees for ${record.idweb}`);
      }
      
      return {
        // IDs
        source: 'BOAMP',
        source_id: record.idweb,
        
        // Contenu
        title: record.objet,
        description: donneesObj?.OBJET?.OBJET_COMPLET || record.objet,
        keywords: record.descripteur_libelle || [],
        
        // Acheteur
        acheteur: record.nomacheteur,
        acheteur_email: donneesObj?.IDENTITE?.MEL || null,
        acheteur_tel: donneesObj?.IDENTITE?.TEL || null,
        acheteur_adresse: donneesObj?.IDENTITE?.ADRESSE || null,
        acheteur_cp: donneesObj?.IDENTITE?.CP || null,
        acheteur_ville: donneesObj?.IDENTITE?.VILLE || null,
        
        // Dates
        publication_date: record.dateparution,
        deadline: record.datelimitereponse,
        
        // Type
        type_marche: Array.isArray(record.type_marche) 
          ? record.type_marche[0] 
          : record.type_marche,
        nature: record.nature_categorise,
        nature_label: record.nature_libelle,
        
        // Géo
        region: (() => {
          const codeDept = Array.isArray(record.code_departement)
            ? record.code_departement[0]
            : record.code_departement;
          return DEPARTEMENT_TO_REGION[codeDept] || codeDept;
        })(),
        
        // Liens
        url_ao: record.url_avis,
        
        // 🆕 Nouveaux champs pour filtrage et analyse
        etat: record.etat || null,
        procedure_libelle: record.procedure_libelle || null,
        criteres: record.criteres || null,
        annonce_lie: record.annonce_lie || null,
        annonces_anterieures: record.annonces_anterieures || null,
        titulaire: record.titulaire || null,
        marche_public_simplifie: record.marche_public_simplifie || null,
        famille_libelle: record.famille_libelle || null,
        
        // Backup
        raw_json: record
      };
    });
    
    // Déterminer le statut de la collecte
    const fetchStatus = missing > 0 
      ? 'DEGRADED' 
      : 'OK';
    
    return {
      source: 'BOAMP',
      query: { 
        since: targetDate, 
        typeMarche, 
        pageSize,
        minDeadline 
      },
      total_count: totalCount,
      fetched: allRecords.length,
      missing: missing,
      missing_ratio: missingRatio,
      pages: pageNumber,
      status: fetchStatus,
      records: normalized
    };
  }
});
