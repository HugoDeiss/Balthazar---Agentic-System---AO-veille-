// src/mastra/tools/boamp-fetcher.ts
import { createTool } from '@mastra/core';
import { z } from 'zod';

export const boampFetcherTool = createTool({
  id: 'boamp-fetcher',
  description: 'Récupère les appels d\'offres BOAMP (hors attributions)',
  
  inputSchema: z.object({
    since: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Date au format YYYY-MM-DD (ex: 2025-12-17)'),
    
    typeMarche: z.enum(['SERVICES', 'FOURNITURES', 'TRAVAUX'])
      .default('SERVICES'),
    
    limit: z.number()
      .min(1)
      .max(100)
      .default(100),
    
    departement: z.string().optional()
      .describe('Code département (ex: "75")')
  }),
  
  execute: async ({ context }) => {
    const { since, typeMarche, limit, departement } = context;
    
    const baseUrl = 'https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records';
    
    // 🔍 WHERE
    const whereFilters = [
      `dateparution >= date'${since}'`,
      `nature_categorise = 'appeloffre/standard'`,
      `type_marche = '${typeMarche}'`
    ];
    
    if (departement) {
      whereFilters.push(`code_departement = '${departement}'`);
    }
    
    const whereClause = whereFilters.join(' AND ');
    
    // 📦 PARAMS
    const params = new URLSearchParams({
      select: [
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
      ].join(','),
      
      where: whereClause,
      order_by: 'dateparution desc',
      limit: limit.toString()
    });
    
    // 🌐 FETCH
    console.log(`🔗 Fetching BOAMP: ${baseUrl}?${params}`);
    
    const response = await fetch(`${baseUrl}?${params}`);
    
    if (!response.ok) {
      throw new Error(`BOAMP API error ${response.status}`);
    }
    
    const data = await response.json();
    
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
        region: Array.isArray(record.code_departement)
          ? record.code_departement[0]
          : record.code_departement,
        
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
    
    return {
      source: 'BOAMP',
      query: { since, typeMarche, departement, limit },
      total_count: data.total_count,
      fetched: data.results.length,
      records: normalized
    };
  }
});
