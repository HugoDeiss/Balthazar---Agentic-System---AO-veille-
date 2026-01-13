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
  '974': 'La Réunion',   '976': 'Mayotte'
};

// ═══════════════════════════════════════════════════════════
// 🔄 NORMALISATION BOAMP → AO CANONIQUE
// ═══════════════════════════════════════════════════════════
/**
 * Normalise un record BOAMP brut en AO canonique
 * Règle d'or : le record brut ne doit plus être référencé après cet appel
 */
function normalizeBoampRecord(rawRecord: any) {
  // Gérer la structure OpenDataSoft : les champs peuvent être dans record.fields
  // OpenDataSoft v2.1 renvoie : { results: [{ record: { fields: {...} } }] }
  const fields = rawRecord.record?.fields || rawRecord.fields || rawRecord;
  
  // Parse le JSON "donnees" pour extraire les infos riches
  let donneesObj: any = null;
  try {
    donneesObj = typeof fields.donnees === 'string' 
      ? JSON.parse(fields.donnees) 
      : fields.donnees;
  } catch (e) {
    console.warn(`Failed to parse donnees for ${fields.idweb}`);
  }
  
  // ═══════════════════════════════════════════════════════════
  // 🆕 EXTRACTION UUID PROCÉDURE (contractfolderid)
  // ═══════════════════════════════════════════════════════════
  let uuid_procedure: string | null = null;
  
  // Priorité 1 : Champ direct contractfolderid (si présent dans fields)
  if (fields.contractfolderid) {
    uuid_procedure = fields.contractfolderid;
  }
  // Priorité 2 : Chercher dans donnees JSON
  else if (donneesObj) {
    // Chercher dans différentes structures possibles
    uuid_procedure = donneesObj.CONTRACT_FOLDER_ID 
      || donneesObj.contractfolderid
      || donneesObj.IDENTIFIANT_PROCEDURE
      || extractUUIDFromString(JSON.stringify(donneesObj));
  }
  // Priorité 3 : Chercher dans description (fallback)
  if (!uuid_procedure) {
    const description = donneesObj?.OBJET?.OBJET_COMPLET || fields.objet || '';
    uuid_procedure = extractUUIDFromString(description);
  }
  
  // Calcul de la région depuis le département
  const codeDept = Array.isArray(fields.code_departement)
    ? fields.code_departement[0]
    : fields.code_departement;
  const region = DEPARTEMENT_TO_REGION[codeDept] || codeDept;
  
  // Normalisation du type_marche (array → string)
  const type_marche = Array.isArray(fields.type_marche) 
    ? fields.type_marche[0] 
    : fields.type_marche;
  
  // Construction de l'AO canonique structuré
  const ao = {
    // 🟦 Identité source (niveau racine)
    source: 'BOAMP',
    source_id: fields.idweb,
    
    // 🆕 UUID universel pour déduplication cross-platform
    uuid_procedure: uuid_procedure,

    // 🟦 Identity : Identité de l'AO
    identity: {
      title: fields.objet || '',
      acheteur: fields.nomacheteur || null,
      url: fields.url_avis || null,
      region: region
    },

    // 🟦 Lifecycle : Cycle de vie de l'AO
    lifecycle: {
      etat: fields.etat || null,
      nature: fields.nature_categorise || null,
      nature_label: fields.nature_libelle || null,
      annonce_lie: fields.annonce_lie || null,
      annonces_anterieures: fields.annonces_anterieures || null,
      publication_date: fields.dateparution,
      deadline: fields.datelimitereponse || null
    },

    // 🟦 Content : Contenu analysable
    content: {
      description: donneesObj?.OBJET?.OBJET_COMPLET || fields.objet || '',
      keywords: fields.descripteur_libelle || []
    },

    // 🟦 Classification : Classification de l'AO
    classification: {
      type_marche: type_marche,
      procedure: fields.procedure_libelle || null,
      famille: fields.famille_libelle || null
    },

    // 🟦 Metadata : Métadonnées complémentaires
    metadata: {
      acheteur_email: donneesObj?.IDENTITE?.MEL || null,
      acheteur_tel: donneesObj?.IDENTITE?.TEL || null,
      acheteur_adresse: donneesObj?.IDENTITE?.ADRESSE || null,
      acheteur_cp: donneesObj?.IDENTITE?.CP || null,
      acheteur_ville: donneesObj?.IDENTITE?.VILLE || null,
      criteres: fields.criteres || null,
      marche_public_simplifie: fields.marche_public_simplifie || null,
      titulaire: fields.titulaire || null,
      siret: null // SIRET non disponible dans BOAMP directement
    }
  };
  
  // Le record brut n'est plus référencé après ce point
  // Il devient éligible au GC immédiatement
  return ao;
}

/**
 * Extrait un UUID v4 depuis une string
 */
function extractUUIDFromString(text: string): string | null {
  const uuidPattern = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
  const match = text.match(uuidPattern);
  return match ? match[0].toLowerCase() : null;
}

// Type explicite pour l'AO canonique
export type CanonicalAO = ReturnType<typeof normalizeBoampRecord>;

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
      .max(100)
      .default(100)
      .describe('Taille de page pour pagination (MAX autorisé: 100 par OpenDataSoft)')
  }),
  
  execute: async (inputData, context) => {
    const { since, typeMarche, pageSize: rawPageSize } = inputData;
    
    // Forcer le maximum à 100 (limite OpenDataSoft)
    const pageSize = Math.min(rawPageSize || 100, 100);
    
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
    
    // 🔍 WHERE - Version conforme à la documentation OpenDataSoft ODSQL
    // 🧪 MODE TEST : Si TEST_AO_ID est défini, fetch uniquement cet AO (ignore tous les autres filtres)
    const whereClause = process.env.TEST_AO_ID
      ? `idweb = '${process.env.TEST_AO_ID}'`
      : (() => {
          const whereFilters = [
            // 1️⃣ TEMPORALITÉ : Avis publiés la veille (ou date spécifiée)
            // Format requis : date'YYYY-MM-DD' selon la doc OpenDataSoft
            `dateparution = date'${targetDate}'`,
            
            // 2️⃣ TYPOLOGIE : Nouveaux avis + Rectificatifs + Annulations
            // IMPORTANT: Pas de retours à la ligne dans WHERE (OpenDataSoft ne les supporte pas)
            `(nature_categorise = 'appeloffre/standard' OR annonce_lie IS NOT NULL OR annonces_anterieures IS NOT NULL OR etat = 'AVIS_ANNULE')`,
            
            // 3️⃣ TYPE MARCHÉ : Compatible conseil
            // type_marche est un champ multi-valué (array) dans OpenDataSoft
            // Syntaxe ODSQL pour vérifier si une valeur est dans un array : 'VALUE' IN field
            `'${typeMarche}' IN type_marche`,
            
            // 4️⃣ DEADLINE : Exploitable (NULL accepté pour AO stratégiques)
            // Format requis : date'YYYY-MM-DD' selon la doc OpenDataSoft
            `(datelimitereponse IS NULL OR datelimitereponse >= date'${minDeadline}')`,
            
            // 5️⃣ ATTRIBUTION : Marché encore ouvert
            `titulaire IS NULL`
          ];
          return whereFilters.join(' AND ');
        })();
    
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
      
      // 🆕 UUID universel pour déduplication cross-platform
      'contractfolderid',     // UUID de la procédure (identifiant universel)
      
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
    // 🔄 PAGINATION EXHAUSTIVE
    // ═══════════════════════════════════════════════════════════
    // Règle d'architecture : Aucun JSON BOAMP brut ne doit traverser le workflow
    // Chaque record est normalisé puis retourné au workflow pour traitement
    console.log(`🔗 Fetching BOAMP avec pagination exhaustive...`);
    console.log(`📅 Date cible: ${targetDate}`);
    console.log(`📦 Page size: ${pageSize} (MAX autorisé: 100 par OpenDataSoft)`);
    
    // Tableau pour accumuler les AO normalisés (pour retour au workflow)
    const records: CanonicalAO[] = [];
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2a7a9442-8c95-4d87-9e14-186d0a65ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'boamp-fetcher.ts:268',message:'Records array initialized',data:{recordsIsArray:Array.isArray(records),recordsLength:records.length,recordsType:typeof records},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    let offset = 0;
    let totalCount = 0;
    let pageNumber = 1;
    let fetchedCount = 0;
    
    do {
      // Construire les paramètres de requête pour cette page
      const params = new URLSearchParams({
        select: selectFields,
        where: whereClause,
        order_by: 'dateparution desc',
        limit: pageSize.toString(),
        offset: offset.toString()
      });
      
      const fullUrl = `${baseUrl}?${params}`;
      
      console.log(`📄 Page ${pageNumber}: fetching ${pageSize} AO (offset=${offset})...`);
      console.log(`🔍 WHERE clause: ${whereClause}`);
      console.log(`🌐 Full URL: ${fullUrl}`);
      console.log('[BOAMP] WHERE:', whereClause);
      
      const response = await fetch(fullUrl);
      
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
          console.log(`ℹ️ Volume BOAMP élevé: ${totalCount} AO`);
        }
      }
      
      // Récupérer les résultats bruts de cette page
      const pageResults = data.results || [];
      
      // Normalisation et accumulation des AO pour retour au workflow
      for (const rawRecord of pageResults) {
        // Normaliser immédiatement (le record brut devient éligible au GC après)
        const ao = normalizeBoampRecord(rawRecord);
        
        // Accumuler pour retour au workflow
        records.push(ao);
        
        fetchedCount++;
        
        // Le rawRecord sort de scope ici → GC OK
      }
      
      console.log(`✅ Page ${pageNumber}: ${pageResults.length} AO traités`);
      console.log(`📊 Progression: ${fetchedCount}/${totalCount} (${Math.round(fetchedCount / totalCount * 100)}%)`);
      
      // Condition d'arrêt explicite
      if (pageResults.length < pageSize || offset + pageSize >= totalCount) {
        console.log(`🏁 Pagination terminée`);
        break;
      }
      
      // Préparer la page suivante
      offset += pageSize;
      pageNumber++;
      
      // Sécurité : respecter la limite OpenDataSoft (offset + limit < 10000)
      // Avec pageSize=100, max théorique = 100 pages = 10000 AO
      if (offset + pageSize >= 10000) {
        throw new Error(`PAGINATION ABORT: Limite OpenDataSoft atteinte (offset=${offset} + limit=${pageSize} >= 10000)`);
      }
      
      // Sécurité supplémentaire : éviter les boucles infinies
      if (pageNumber > 100) {
        throw new Error(`PAGINATION ABORT: Plus de 100 pages (${pageNumber * pageSize} AO), vérifier la logique`);
      }
      
    } while (offset < totalCount);
    
    // ═══════════════════════════════════════════════════════════
    // 📊 RAPPORT DE COMPLÉTUDE (CONSTATATION, PAS DE DÉCISION)
    // ═══════════════════════════════════════════════════════════
    // Le fetcher constate les faits, mais ne prend aucune décision métier
    // Les décisions (seuils, retry, statut) sont prises par le workflow
    const missing = totalCount - fetchedCount;
    const missingRatio = totalCount > 0 ? missing / totalCount : 0;
    
    // Logs informatifs uniquement (pas d'interprétation métier)
    if (missing > 0) {
      console.log(`📊 BOAMP fetch: missing=${missing}, total=${totalCount}, ratio=${(missingRatio * 100).toFixed(2)}%`);
    } else if (missing < 0) {
      console.log(`📊 BOAMP fetch: surplus=${-missing}, fetched=${fetchedCount}, expected=${totalCount}`);
    } else {
      console.log(`📊 BOAMP fetch: ${fetchedCount}/${totalCount} AO traités (100% exhaustif)`);
    }
    
    // Rapport de fetch (constatation pure, sans décision métier)
    // Calcul précis du nombre de pages réellement fetchées
    const pagesFetched = Math.ceil(fetchedCount / pageSize);
    
    // Déterminer le statut basé sur missing
    const status = missing > 0 ? 'DEGRADED' : 'COMPLETE';
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2a7a9442-8c95-4d87-9e14-186d0a65ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'boamp-fetcher.ts:421',message:'Before return - check records',data:{recordsIsUndefined:records===undefined,recordsIsNull:records===null,recordsType:typeof records,recordsIsArray:Array.isArray(records),recordsLength:records?.length,totalCount,fetchedCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C'})}).catch(()=>{});
    // #endregion
    
    // Retourner la structure attendue par le workflow
    // Les AO normalisés sont retournés pour traitement par le workflow
    const returnValue = {
      source: 'BOAMP',
      query: { 
        since: targetDate, 
        typeMarche, 
        pageSize,
        minDeadline 
      },
      total_count: totalCount,
      fetched: fetchedCount,
      missing: missing,
      missing_ratio: missingRatio,
      status: status,
      records: records // Tableau des AO normalisés pour le workflow
    };
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2a7a9442-8c95-4d87-9e14-186d0a65ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'boamp-fetcher.ts:435',message:'Return value structure',data:{hasRecords:returnValue.hasOwnProperty('records'),recordsInReturn:returnValue.records!==undefined,recordsLengthInReturn:returnValue.records?.length,returnKeys:Object.keys(returnValue)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    return returnValue;
  }
});
