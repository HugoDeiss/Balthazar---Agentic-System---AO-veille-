import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { boampFetcherTool, type CanonicalAO } from '../tools/boamp-fetcher';
import { marchesonlineRSSFetcherTool } from '../tools/marchesonline-rss-fetcher';
import {
  isRectification,
  findOriginalAO,
  detectSubstantialChanges
} from './rectificatif-utils';
import { checkBatchAlreadyAnalyzed } from '../../persistence/ao-persistence';
import { scheduleRetry } from '../../utils/retry-scheduler';
import { calculateKeywordScore, calculateEnhancedKeywordScore, shouldSkipLLM } from '../../utils/balthazar-keywords';
import { analyzeSemanticRelevance, DEFAULT_FALLBACK_ANALYSIS, type BalthazarSemanticAnalysis } from '../agents/boamp-semantic-analyzer';
import { findBatchBOAMPMatches } from '../../utils/cross-platform-dedup';
import { generateEmailHTML, generateEmailText, generateEmailSubject, type EmailData } from '../../utils/email-templates';
import { sendEmail } from '../../utils/email-sender';

// ──────────────────────────────────────────────────
// SUPABASE CLIENT
// ──────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ──────────────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────────────

/** Récupère un client depuis Supabase */
async function getClient(clientId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();
  
  if (error) throw new Error(`Client not found: ${clientId}`);
  return data;
}

/** Calcule le nombre de jours restants avant une deadline */
function getDaysRemaining(deadline: string): number {
  const deadlineDate = new Date(deadline);
  const today = new Date();
  const diffTime = deadlineDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/** Convertit un CanonicalAO (structure imbriquée) vers le format plat aoSchema */
function canonicalAOToFlatSchema(canonicalAO: CanonicalAO): z.infer<typeof aoSchema> {
  // Détecter les annulations depuis nature_label ou nature
  // BOAMP utilise nature_label: "Avis d'annulation" au lieu de etat: "AVIS_ANNULE"
  const isAnnulation = 
    canonicalAO.lifecycle.nature_label?.toLowerCase().includes('annulation') ||
    canonicalAO.lifecycle.nature?.toLowerCase().includes('annulation') ||
    canonicalAO.lifecycle.etat === 'AVIS_ANNULE';
  
  const normalizedEtat = isAnnulation ? 'AVIS_ANNULE' : (canonicalAO.lifecycle.etat || undefined);
  
  return {
    source: canonicalAO.source,
    source_id: canonicalAO.source_id,
    title: canonicalAO.identity.title,
    description: canonicalAO.content.description,
    keywords: canonicalAO.content.keywords,
    acheteur: canonicalAO.identity.acheteur || undefined,
    acheteur_email: canonicalAO.metadata.acheteur_email || undefined,
    budget_min: null, // Non disponible dans CanonicalAO pour l'instant
    budget_max: null, // Non disponible dans CanonicalAO pour l'instant
    deadline: canonicalAO.lifecycle.deadline || undefined,
    publication_date: canonicalAO.lifecycle.publication_date,
    type_marche: canonicalAO.classification.type_marche || undefined,
    region: canonicalAO.identity.region,
    url_ao: canonicalAO.identity.url || undefined,
    etat: normalizedEtat,
    raw_json: canonicalAO // Conserver l'objet complet pour référence (inclut uuid_procedure et siret)
  };
}

// ──────────────────────────────────────────────────
// SCHEMAS
// ──────────────────────────────────────────────────
const clientSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  preferences: z.object({
    typeMarche: z.enum(['SERVICES', 'FOURNITURES', 'TRAVAUX'])
  }),
  criteria: z.object({
    minBudget: z.number(),
    regions: z.array(z.string()).optional()
  }),
  keywords: z.array(z.string()),
  profile: z.any(),
  financial: z.object({
    revenue: z.number(),
    employees: z.number(),
    yearsInBusiness: z.number()
  }),
  technical: z.object({
    references: z.number()
  })
});

const aoSchema = z.object({
  source: z.string(),
  source_id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  acheteur: z.string().optional(),
  acheteur_email: z.string().optional(),
  budget_min: z.number().nullable(),
  budget_max: z.number().nullable(),
  deadline: z.string().optional(),
  publication_date: z.string().optional(),
  type_marche: z.string().optional(),
  region: z.string().nullable(),
  url_ao: z.string().optional(),
  etat: z.string().optional(), // État de l'annonce (AVIS_ANNULE, etc.)
  raw_json: z.any()
});

// ──────────────────────────────────────────────────
// STEP 1: COLLECTE (gratuit, filtrage structurel API)
// ──────────────────────────────────────────────────
const fetchAndPrequalifyStep = createStep({
  id: 'fetch-and-prequalify',
  inputSchema: z.object({
    clientId: z.string(),
    since: z.string().optional(),
    until: z.string().optional(), // Plage : si fourni, fetch since→until ; sinon mode jour unique (cron)
    marchesonlineRSSUrls: z.array(z.string().url()).optional()
  }),
  outputSchema: z.object({
    prequalified: z.array(aoSchema),
    client: clientSchema,
    since: z.string().optional(),
    until: z.string().optional()
  }),
  execute: async ({ inputData, requestContext }) => {
    const client = await getClient(inputData.clientId);

    // 1️⃣ Fetch BOAMP (filtrage structurel côté API)
    let boampData: any;
    try {
      boampData = await boampFetcherTool.execute!({
        since: inputData.since,
        until: inputData.until,
        typeMarche: client.preferences.typeMarche,
        pageSize: 100
      }, {
        requestContext
      }) as {
        source: string;
        query: { since?: string; typeMarche: string; pageSize: number; minDeadline: string };
        total_count: number;
        fetched: number;
        missing: number;
        missing_ratio: number;
        status: string;
        records: CanonicalAO[];
      };
    } catch (error: any) {
      throw error;
    }

    // Vérifier si le tool a retourné une erreur au lieu de la structure attendue
    if (boampData && (boampData.error || boampData.message || boampData.validationErrors)) {
      const errorMessage = boampData.message || boampData.error || 'Unknown error from BOAMP fetcher';
      const validationErrors = boampData.validationErrors ? JSON.stringify(boampData.validationErrors) : '';
      throw new Error(`BOAMP fetcher tool error: ${errorMessage}${validationErrors ? ` - Validation errors: ${validationErrors}` : ''}`);
    }
    
    // Initialiser records à un tableau vide si undefined
    if (!boampData.records) {
      boampData.records = [];
      boampData.total_count = 0;
      boampData.fetched = 0;
      boampData.missing = 0;
      boampData.missing_ratio = 0;
      boampData.status = 'ERROR';
      if (!boampData.query) {
        boampData.query = {
          since: inputData.since,
          typeMarche: client.preferences.typeMarche,
          pageSize: 100,
          minDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        };
      }
    }

    console.log(`📥 BOAMP Fetch: ${boampData.records.length} AO récupérés`);
    console.log(`📊 Total disponible: ${boampData.total_count}`);
    console.log(`📅 Date cible: ${boampData.query.since}`);
    console.log(`📊 Statut: ${boampData.status}`);
    
    // 2️⃣ RETRY DIFFÉRÉ si incohérence détectée
    if (boampData.missing > 0) {
      console.warn(`⏰ Incohérence détectée (${boampData.missing} AO manquants)`);
      console.warn(`⏰ Retry automatique planifié dans 60 minutes`);
      console.warn(`⏰ Date cible pour retry: ${boampData.query.since}`);
      
      try {
        const targetDate = boampData.query.since || new Date().toISOString().split('T')[0];
        scheduleRetry(
          inputData.clientId,
          targetDate,
          60, // 60 minutes
          `Incohérence détectée: ${boampData.missing} AO manquants (${(boampData.missing_ratio * 100).toFixed(2)}%)`
        );
        console.log(`✅ Retry planifié dans 60 minutes pour ${inputData.clientId}/${targetDate}`);
      } catch (error) {
        console.error('⚠️ Erreur planification retry:', error);
        // Ne pas faire échouer le workflow si la planification échoue
      }
    }
    
    // 3️⃣ Fetch MarchesOnline RSS (si configuré)
    let marchesonlineData = null;
    // 🆕 Priorité : paramètre input > config client
    const rssUrls = inputData.marchesonlineRSSUrls || client.preferences.marchesonlineRSSUrls;
    
    if (rssUrls && Array.isArray(rssUrls) && rssUrls.length > 0) {
      console.log(`📡 Fetching MarchesOnline RSS (${rssUrls.length} flux)...`);
      if (inputData.marchesonlineRSSUrls) {
        console.log(`   📋 Source: paramètre input (override)`);
      } else {
        console.log(`   📋 Source: config client`);
      }
      
      marchesonlineData = await marchesonlineRSSFetcherTool.execute!({
        rssUrls: rssUrls,
        since: inputData.since,
        until: inputData.until,
        typeMarche: client.preferences.typeMarche
      }, {
        requestContext
      }) as any as {
        source: string;
        query: { rssUrls: string[]; since: string; typeMarche: string };
        total_count: number;
        fetched: number;
        records: CanonicalAO[];
        status: string;
      };
      
      console.log(`📥 MarchesOnline RSS: ${marchesonlineData.records.length} AO récupérés`);
      
      // 4️⃣ DÉDUPLICATION CRITIQUE : Vérifier quels AO MarchesOnline existent déjà via BOAMP
      if (marchesonlineData.records.length > 0) {
        const matches = await findBatchBOAMPMatches(
          marchesonlineData.records.map(ao => ({
            uuid_procedure: ao.uuid_procedure,
            title: ao.identity.title,
            acheteur: ao.identity.acheteur,
            deadline: ao.lifecycle.deadline,
            publication_date: ao.lifecycle.publication_date,
            siret: (ao.metadata as any).siret,
            description: ao.content.description // 🆕 Description pour extraction numéro d'annonce BOAMP
          }))
        );
        
        // Filtrer : garder uniquement les AO MarchesOnline SANS match BOAMP
        const uniqueMarchesonlineAOs = marchesonlineData.records.filter((ao, index) => {
          const match = matches.get(index);
          if (match) {
            console.log(`⏭️  AO MarchesOnline "${ao.identity.title.slice(0, 50)}..." déjà traité via BOAMP ${match.source_id} (${match.match_strategy})`);
            return false; // Exclure ce doublon
          }
          return true; // Garder cet AO unique
        });
        
        const duplicateCount = marchesonlineData.records.length - uniqueMarchesonlineAOs.length;
        console.log(`✅ MarchesOnline: ${uniqueMarchesonlineAOs.length} AO uniques (${duplicateCount} doublons exclus)`);
        
        marchesonlineData.records = uniqueMarchesonlineAOs;
      }
    }
    
    // 5️⃣ Fusionner les deux sources (maintenant sans doublons)
    const allRecords = [
      ...(boampData.records || []),
      ...(marchesonlineData?.records || [])
    ];
    
    // 6️⃣ TRANSFORMATION : Convertir CanonicalAO[] (structure imbriquée) vers format plat aoSchema
    const prequalified = allRecords.map(canonicalAOToFlatSchema);
    
    console.log(`✅ Collecte: ${prequalified.length} AO transmis à l'analyse (${boampData.records?.length || 0} BOAMP + ${marchesonlineData?.records?.length || 0} MarchesOnline)`);
    
    return { 
      prequalified, 
      client,
      fetchStatus: boampData.status,
      fetchMissing: boampData.missing,
      since: inputData.since,
      until: inputData.until
    };
  }
});

// ──────────────────────────────────────────────────
// STEP 1b: GESTION DES ANNULATIONS (gratuit)
// ──────────────────────────────────────────────────
const handleCancellationsStep = createStep({
  id: 'handle-cancellations',
  inputSchema: z.object({
    prequalified: z.array(aoSchema),
    client: clientSchema,
    since: z.string().optional(),
    until: z.string().optional()
  }),
  outputSchema: z.object({
    activeAOs: z.array(aoSchema),
    cancelledCount: z.number(),
    client: clientSchema,
    since: z.string().optional(),
    until: z.string().optional()
  }),
  execute: async ({ inputData }) => {
    const { prequalified, client, since, until } = inputData;
    const activeAOs: any[] = [];
    let cancelledCount = 0;
    
    console.log(`🚫 Traitement des annulations sur ${prequalified.length} AO...`);
    
    for (const ao of prequalified) {
      if (ao.etat === 'AVIS_ANNULE') {
        cancelledCount++;
        console.log(`❌ AO annulé détecté: ${ao.title} (${ao.source_id})`);
        
        // Mise à jour DB : marquer comme annulé (ou créer si n'existe pas)
        try {
          // Calculer les clés de déduplication (comme dans save-results)
          const { generateDedupKeys } = await import('../../utils/cross-platform-dedup');
          const dedupKeys = generateDedupKeys({
            uuid_procedure: ao.raw_json?.uuid_procedure || null,
            title: ao.title,
            acheteur: ao.acheteur || null,
            deadline: ao.deadline || null,
            publication_date: ao.publication_date || null,
            siret: ao.raw_json?.metadata?.siret || null,
            source_id: ao.source_id || null,
            source: ao.source || null
          });
          
          // Extraire les données depuis raw_json si nécessaire
          const rawJson = ao.raw_json || {};
          const metadata = rawJson.metadata || {};
          
          const { data, error } = await supabase
            .from('appels_offres')
            .upsert({
              source: ao.source,
              source_id: ao.source_id,
              
              // 🆕 Identifiants BOAMP
              boamp_id: ao.source === 'BOAMP' ? ao.source_id : null,
              
              // 🆕 Déduplication cross-platform
              uuid_procedure: dedupKeys.uuid_key,
              siret: ao.raw_json?.metadata?.siret || null,
              dedup_key: dedupKeys.composite_key,
              siret_deadline_key: dedupKeys.siret_deadline_key,
              
              title: ao.title,
              description: ao.description,
              keywords: ao.keywords,
              acheteur: ao.acheteur,
              acheteur_email: ao.acheteur_email || metadata.acheteur_email || null,
              acheteur_tel: metadata.acheteur_tel || null,
              budget_min: ao.budget_min,
              budget_max: ao.budget_max,
              deadline: ao.deadline,
              publication_date: ao.publication_date,
              type_marche: ao.type_marche,
              region: ao.region,
              url_ao: ao.url_ao,
              etat: 'AVIS_ANNULE',
              status: 'cancelled',
              raw_json: ao.raw_json
            }, {
              onConflict: 'source_id',
              ignoreDuplicates: false
            })
            .select();
          
          if (error) {
            console.error(`⚠️ Erreur MAJ annulation pour ${ao.source_id}:`, error);
            console.error(`   Détails:`, JSON.stringify(error, null, 2));
          } else {
            const rowsAffected = data?.length || 0;
            if (rowsAffected > 0) {
              console.log(`✅ AO ${ao.source_id} marqué comme annulé en DB (${rowsAffected} ligne(s) affectée(s))`);
            } else {
              console.warn(`⚠️ Aucune ligne affectée pour ${ao.source_id} (peut-être déjà annulé ?)`);
            }
          }
        } catch (err) {
          console.error(`⚠️ Exception MAJ annulation pour ${ao.source_id}:`, err);
        }
        
        // Ne pas transmettre à l'analyse IA
        continue;
      }
      
      // AO actif : transmettre au step suivant
      activeAOs.push(ao);
    }
    
    console.log(`✅ Annulations: ${cancelledCount} traitées, ${activeAOs.length} AO actifs transmis`);
    
    return { 
      activeAOs, 
      cancelledCount,
      client,
      since,
      until
    };
  }
});

// ──────────────────────────────────────────────────
// STEP 1c: DÉTECTION DES RECTIFICATIFS (gratuit)
// ──────────────────────────────────────────────────
const detectRectificationStep = createStep({
  id: 'detect-rectification',
  inputSchema: z.object({
    activeAOs: z.array(aoSchema),
    client: clientSchema,
    since: z.string().optional(),
    until: z.string().optional()
  }),
  outputSchema: z.object({
    toAnalyze: z.array(aoSchema.extend({
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    })),
    rectificationsMineurs: z.number(),
    rectificationsSubstantiels: z.number(),
    client: clientSchema,
    since: z.string().optional(),
    until: z.string().optional()
  }),
  execute: async ({ inputData }) => {
    const { activeAOs, client, since, until } = inputData;
    const toAnalyze: any[] = [];
    let rectificationsMineurs = 0;
    let rectificationsSubstantiels = 0;
    
    console.log(`🔍 Détection des rectificatifs sur ${activeAOs.length} AO...`);
    
    for (const ao of activeAOs) {
      // ────────────────────────────────────────────────────────────
      // 1. Vérifier si c'est un rectificatif
      // ────────────────────────────────────────────────────────────
      if (isRectification(ao)) {
        console.log(`📝 Rectificatif détecté: ${ao.title}`);
        
        // ────────────────────────────────────────────────────────────
        // 2. Retrouver l'AO original
        // ────────────────────────────────────────────────────────────
        const originalAO = await findOriginalAO(ao);
        
        if (originalAO) {
          console.log(`🔗 AO original trouvé (ID: ${originalAO.id})`);
          
          // ────────────────────────────────────────────────────────────
          // 3. Détecter les changements substantiels
          // ────────────────────────────────────────────────────────────
          const changeResult = detectSubstantialChanges(originalAO, ao);
          
          if (changeResult.isSubstantial) {
            // ═══════════════════════════════════════════════════════════
            // RECTIFICATIF SUBSTANTIEL → RE-ANALYSE NÉCESSAIRE
            // ═══════════════════════════════════════════════════════════
            console.log(`🔥 Rectificatif SUBSTANTIEL → Re-analyse requise`);
            rectificationsSubstantiels++;
            
            // Marquer l'ancien AO comme rectifié
            await supabase
              .from('appels_offres')
              .update({
                is_rectified: true,
                rectification_date: new Date().toISOString()
              })
              .eq('id', originalAO.id);
            
            // Ajouter à la liste pour re-analyse
            toAnalyze.push({
              ...ao,
              _isRectification: true,
              _originalAO: originalAO,
              _changes: changeResult
            });
            
          } else {
            // ═══════════════════════════════════════════════════════════
            // RECTIFICATIF MINEUR → SIMPLE UPDATE
            // ═══════════════════════════════════════════════════════════
            console.log(`✅ Rectificatif mineur → Simple mise à jour`);
            rectificationsMineurs++;
            
            // Mettre à jour les champs modifiés (deadline, etc.)
            await supabase
              .from('appels_offres')
              .update({
                deadline: ao.deadline,
                raw_json: ao.raw_json,
                rectification_date: new Date().toISOString(),
                rectification_count: (originalAO.rectification_count || 0) + 1
              })
              .eq('id', originalAO.id);
            
            // Ne pas ajouter à la liste d'analyse (déjà traité)
          }
          
        } else {
          // ═══════════════════════════════════════════════════════════
          // AO ORIGINAL INTROUVABLE → TRAITER COMME NOUVEAU
          // ═══════════════════════════════════════════════════════════
          console.log(`⚠️ AO original introuvable → Traiter comme nouveau AO`);
          toAnalyze.push(ao);
        }
        
      } else {
        // ═══════════════════════════════════════════════════════════
        // AO STANDARD (pas un rectificatif)
        // ═══════════════════════════════════════════════════════════
        toAnalyze.push(ao);
      }
    }
    
    console.log(`📊 Rectificatifs: ${rectificationsMineurs} mineurs, ${rectificationsSubstantiels} substantiels`);
    console.log(`✅ ${toAnalyze.length} AO à analyser (nouveaux + rectificatifs substantiels)`);
    
    return {
      toAnalyze,
      rectificationsMineurs,
      rectificationsSubstantiels,
      client,
      since,
      until
    };
  }
});

// ──────────────────────────────────────────────────
// STEP 1d: FILTRAGE DES AO DÉJÀ ANALYSÉS (déduplication retry)
// ──────────────────────────────────────────────────
// Placé APRÈS detectRectificationStep et AVANT keywordMatchingStep
// Objectif : éviter le keyword matching inutile pour les AO déjà analysés
const filterAlreadyAnalyzedStep = createStep({
  id: 'filter-already-analyzed',
  inputSchema: z.object({
    toAnalyze: z.array(aoSchema.extend({
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    })),
    rectificationsMineurs: z.number(),
    rectificationsSubstantiels: z.number(),
    client: clientSchema,
    since: z.string().optional(),
    until: z.string().optional()
  }),
  outputSchema: z.object({
    toAnalyze: z.array(aoSchema.extend({
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    })),
    rectificationsMineurs: z.number(),
    rectificationsSubstantiels: z.number(),
    skipped: z.number(),
    client: clientSchema,
    since: z.string().optional(),
    until: z.string().optional()
  }),
  execute: async ({ inputData }) => {
    const { toAnalyze, rectificationsMineurs, rectificationsSubstantiels, client, since, until } = inputData;
    
    console.log(`🔍 Vérification des AO déjà analysés (${toAnalyze.length} AO)...`);
    
    // Vérification en batch pour optimiser (une seule requête DB)
    const alreadyAnalyzedMap = await checkBatchAlreadyAnalyzed(
      toAnalyze.map(ao => ({
        source: ao.source || 'BOAMP',
        source_id: ao.source_id
      }))
    );
    
    const filteredAOs: typeof toAnalyze = [];
    let skipped = 0;
    
    for (const ao of toAnalyze) {
      const isAlreadyAnalyzed = alreadyAnalyzedMap.get(ao.source_id) || false;
      
      // ═══════════════════════════════════════════════════════
      // EXCEPTIONS : Ces AO doivent passer même s'ils sont analysés
      // ═══════════════════════════════════════════════════════
      
      // 1. Rectificatif substantiel → TOUJOURS re-analysé (changement important)
      if (ao._isRectification && ao._changes?.isSubstantial === true) {
        console.log(`📝 Rectificatif substantiel ${ao.source_id} → re-analyse requise`);
        filteredAOs.push(ao);
        continue;
      }
      
      // 2. AO annulé → doit être géré par handleCancellationsStep
      // Mais si déjà analysé puis annulé, on le skip ici
      if (ao.etat === 'AVIS_ANNULE' && isAlreadyAnalyzed) {
        // L'annulation sera gérée en DB mais pas besoin de re-analyse IA
        skipped++;
        console.log(`⏭️ SKIP AO annulé ${ao.source_id} (déjà analysé)`);
        continue;
      }
      
      // ═══════════════════════════════════════════════════════
      // CAS STANDARD : Filtrer si déjà analysé
      // ═══════════════════════════════════════════════════════
      if (isAlreadyAnalyzed) {
        skipped++;
        console.log(`⏭️ SKIP AO ${ao.source_id} (déjà analysé)`);
        continue;
      }
      
      // Nouveau AO → à analyser
      filteredAOs.push(ao);
    }
    
    console.log(`✅ Filtrage terminé:`);
    console.log(`   📊 ${toAnalyze.length} AO vérifiés`);
    console.log(`   ⏭️ ${skipped} AO déjà analysés (sautés)`);
    console.log(`   🆕 ${filteredAOs.length} AO nouveaux à analyser`);
    if (skipped > 0) {
      console.log(`   💰 Économie: ${skipped} × (keyword matching + IA) évités`);
    }
    
    return {
      toAnalyze: filteredAOs,
      rectificationsMineurs,
      rectificationsSubstantiels,
      skipped,
      client,
      since,
      until
    };
  }
});

// ──────────────────────────────────────────────────
// STEP 2a: PRÉ-SCORING MOTS-CLÉS (gratuit, non bloquant)
// ──────────────────────────────────────────────────
const keywordMatchingStep = createStep({
  id: 'keyword-matching',
  inputSchema: z.object({
    toAnalyze: z.array(aoSchema.extend({
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    })),
    rectificationsMineurs: z.number(),
    rectificationsSubstantiels: z.number(),
    skipped: z.number().optional(),
    client: clientSchema,
    since: z.string().optional(),
    until: z.string().optional()
  }),
  outputSchema: z.object({
    keywordMatched: z.array(aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      keywordDetails: z.any().optional(),
      _shouldSkipLLM: z.boolean().optional(),
      _skipLLMPriority: z.enum(['SKIP', 'LOW', 'MEDIUM', 'HIGH']).optional(),
      _skipLLMReason: z.string().optional(),
      keywordSignals: z.record(z.boolean()).optional(),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    })),
    client: clientSchema,
    since: z.string().optional(),
    until: z.string().optional()
  }),
  execute: async ({ inputData }) => {
    const { toAnalyze: prequalified, client, since, until } = inputData;
    
    console.log(`🔍 Keyword matching amélioré (lexique Balthazar) sur ${prequalified.length} AO...`);
    
    const keywordMatched = prequalified.map(ao => {
      // Utiliser la nouvelle fonction de scoring
      const baseScoreResult = calculateKeywordScore(
        ao.title,
        ao.description,
        ao.keywords,
        ao.acheteur
      );
      
      // Appliquer bonus/malus métier
      const enhancedScoreResult = calculateEnhancedKeywordScore(ao, baseScoreResult);
      
      // Décision skip LLM intelligente
      const skipDecision = shouldSkipLLM(enhancedScoreResult);
      
      // Convertir score 0-100 → 0-1 pour compatibilité avec score final actuel
      const keywordScore = enhancedScoreResult.score / 100;
      
      // Analyse des critères d'attribution pour scorer la compétitivité (conservé pour compatibilité)
      const criteres = ao.raw_json?.metadata?.criteres || ao.raw_json?.criteres || null;
      
      return {
        ...ao,
        keywordScore, // 0-1 (compatible avec workflow actuel)
        matchedKeywords: enhancedScoreResult.allMatches, // Pour compatibilité
        keywordDetails: enhancedScoreResult, // Détails complets pour utilisation future
        _shouldSkipLLM: skipDecision.skip, // Metadata pour optimisation
        _skipLLMPriority: skipDecision.priority, // Nouveau
        _skipLLMReason: skipDecision.reason,     // Nouveau
        // Préserver les métadonnées de rectificatif
        _isRectification: ao._isRectification,
        _originalAO: ao._originalAO,
        _changes: ao._changes,
        criteresAttribution: criteres
      };
    })
    .sort((a, b) => b.keywordScore - a.keywordScore);
    
    const skippedLLMCount = keywordMatched.filter(ao => ao._shouldSkipLLM).length;
    const avgScore = keywordMatched.length > 0
      ? (keywordMatched.reduce((sum, ao) => sum + ao.keywordScore, 0) / keywordMatched.length * 100).toFixed(1)
      : '0';
    console.log(`✅ Keyword matching: ${keywordMatched.length} AO`);
    console.log(`   📊 Score moyen: ${avgScore}/100`);
    if (skippedLLMCount > 0) {
      const skipReasons = keywordMatched
        .filter(ao => ao._shouldSkipLLM)
        .reduce((acc, ao) => {
          const reason = (ao as any)._skipLLMReason || 'unknown';
          acc[reason] = (acc[reason] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
      console.log(`   ⚡ ${skippedLLMCount} AO signalés pour skip LLM`);
      console.log(`   📋 Raisons: ${JSON.stringify(skipReasons)}`);
    }
    
    return { keywordMatched, client, since, until };
  }
});

// ──────────────────────────────────────────────────
// STEP 5: SAUVEGARDE RÉSULTATS
// ──────────────────────────────────────────────────
const saveResultsStep = createStep({
  id: 'save-results',
  inputSchema: z.object({
    all: z.array(z.any()),
    high: z.array(z.any()),
    medium: z.array(z.any()),
    low: z.array(z.any()),
    cancelled: z.array(z.any()),
    stats: z.object({
      total: z.number(),
      analysed: z.number(),
      cancelled: z.number(),
      skipped: z.number().optional(),
      high: z.number(),
      medium: z.number(),
      low: z.number(),
      llmCalls: z.number()
    }),
    client: clientSchema.nullable(),
    statsBySource: z.object({
      BOAMP: z.object({
        total: z.number(),
        high: z.number(),
        medium: z.number(),
        low: z.number()
      }),
      MARCHESONLINE: z.object({
        total: z.number(),
        high: z.number(),
        medium: z.number(),
        low: z.number()
      })
    }),
    highBySource: z.object({
      BOAMP: z.array(z.any()),
      MARCHESONLINE: z.array(z.any())
    }),
    mediumBySource: z.object({
      BOAMP: z.array(z.any()),
      MARCHESONLINE: z.array(z.any())
    }),
    lowBySource: z.object({
      BOAMP: z.array(z.any()),
      MARCHESONLINE: z.array(z.any())
    })
  }),
  outputSchema: z.object({
    saved: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
    cancelled: z.number(),
    llmCalls: z.number(),
    statsBySource: z.object({
      BOAMP: z.object({
        total: z.number(),
        high: z.number(),
        medium: z.number(),
        low: z.number()
      }),
      MARCHESONLINE: z.object({
        total: z.number(),
        high: z.number(),
        medium: z.number(),
        low: z.number()
      })
    }),
    highBySource: z.object({
      BOAMP: z.array(z.any()),
      MARCHESONLINE: z.array(z.any())
    }),
    mediumBySource: z.object({
      BOAMP: z.array(z.any()),
      MARCHESONLINE: z.array(z.any())
    }),
    lowBySource: z.object({
      BOAMP: z.array(z.any()),
      MARCHESONLINE: z.array(z.any())
    }),
    client: clientSchema.nullable(),
    since: z.string().optional(),
    until: z.string().optional()
  }),
  execute: async ({ inputData }) => {
    const { all: scored, client, stats, since, until } = inputData;
    
    // Gérer le cas où client est null (aucun AO à sauvegarder)
    if (!client) {
      console.log(`⚠️ Pas de client disponible, aucune sauvegarde effectuée`);
      return {
        saved: 0,
        high: stats.high,
        medium: stats.medium,
        low: stats.low,
        cancelled: stats.cancelled,
        llmCalls: stats.llmCalls,
        statsBySource: inputData.statsBySource,
        highBySource: inputData.highBySource,
        mediumBySource: inputData.mediumBySource,
        lowBySource: inputData.lowBySource,
        client: null,
        since,
        until
      };
    }
    
    console.log(`💾 Sauvegarde de ${scored.length} AO pour le client ${client.name}...`);
    
    // Sauvegarde dans Supabase
    for (const ao of scored) {
      // ────────────────────────────────────────────────────────────
      // CAS SPÉCIAL : Rectificatif substantiel
      // ────────────────────────────────────────────────────────────
      if (ao._isRectification && ao._originalAO) {
        console.log(`💾 Sauvegarde rectificatif substantiel: ${ao.title}`);
        
        // Construire l'historique
        const history = ao._originalAO.analysis_history || [];
        history.push({
          date: ao._originalAO.analyzed_at,
          semantic_score: ao._originalAO.semantic_score,
          priority: ao._originalAO.priority,
          final_score: ao._originalAO.final_score,
          rejected_reason: ao._originalAO.rejected_reason || null
        });
        
        // Recalculer les clés de déduplication car certains champs peuvent avoir changé
        const { generateDedupKeys } = await import('../../utils/cross-platform-dedup');
        const dedupKeys = generateDedupKeys({
          uuid_procedure: ao.raw_json?.uuid_procedure || null,
          title: ao.title,
          acheteur: ao.acheteur || null,
          deadline: ao.deadline || null,
          publication_date: ao.publication_date || null,
          siret: ao.raw_json?.metadata?.siret || null,
          source_id: ao.source_id || null,
          source: ao.source || null
        });
        
        // UPDATE de l'AO existant (pas INSERT)
        await supabase.from('appels_offres').update({
          // 🆕 Recalculer les clés de déduplication (si champs ont changé)
          dedup_key: dedupKeys.composite_key,
          siret_deadline_key: dedupKeys.siret_deadline_key,
          
          // Contenu
          title: ao.title,
          description: ao.description,
          keywords: ao.keywords,
          
          // Acheteur
          acheteur: ao.acheteur,
          acheteur_email: ao.acheteur_email,
          acheteur_tel: ao.acheteur_tel,
          
          // Budget & Dates
          budget_max: ao.budget_max,
          deadline: ao.deadline,
          publication_date: ao.publication_date,
          
          // Classification
          type_marche: ao.type_marche,
          region: ao.region,
          url_ao: ao.url_ao,
          
          // Analyse keywords
          keyword_score: ao.keywordScore,
          matched_keywords: ao.matchedKeywords,
          
          // Analyse sémantique
          semantic_score: ao.semanticScore,
          semantic_reason: ao.semanticReason,
          
          // Scoring final
          final_score: ao.finalScore,
          priority: ao.priority,
          
          // Context enrichi
          procedure_type: ao.procedureType,
          has_correctif: ao.hasCorrectif,
          is_renewal: ao.isRenewal,
          warnings: ao.warnings,
          criteres_attribution: ao.criteresAttribution,
          
          // Métadonnées
          raw_json: ao.raw_json,
          status: 'analyzed',
          analyzed_at: new Date().toISOString(),
          
          // 🆕 Gestion du rectificatif
          is_rectified: true,
          rectification_date: new Date().toISOString(),
          rectification_count: (ao._originalAO.rectification_count || 0) + 1,
          analysis_history: history,
          rectification_changes: {
            changes: ao._changes.changes,
            detected_at: new Date().toISOString()
          },
          
          // 🆕 Stocker annonce_lie pour recherche optimisée
          annonce_lie: ao.raw_json?.lifecycle?.annonce_lie || ao.raw_json?.annonce_lie || null
        }).eq('id', ao._originalAO.id);
        
        continue; // Passer à l'AO suivant
      }
      
      // ────────────────────────────────────────────────────────────
      // CAS NORMAL : AO nouveau ou non-rectificatif
      // ────────────────────────────────────────────────────────────
      
      // 🆕 Calculer les clés de déduplication
      const { generateDedupKeys } = await import('../../utils/cross-platform-dedup');
      const dedupKeys = generateDedupKeys({
        uuid_procedure: ao.raw_json?.uuid_procedure || null,
        title: ao.title,
        acheteur: ao.acheteur || null,
        deadline: ao.deadline || null,
        publication_date: ao.publication_date || null,
        siret: ao.raw_json?.metadata?.siret || null
      });
      
      await supabase.from('appels_offres').upsert({
        // Identifiants
        source: ao.source,
        source_id: ao.source_id,
        
        // 🆕 Identifiants BOAMP
        boamp_id: ao.source === 'BOAMP' ? ao.source_id : null,
        
        // 🆕 Déduplication cross-platform
        uuid_procedure: dedupKeys.uuid_key,
        siret: ao.raw_json?.metadata?.siret || null,
        dedup_key: dedupKeys.composite_key,
        siret_deadline_key: dedupKeys.siret_deadline_key,
        
        // Contenu
        title: ao.title,
        description: ao.description,
        keywords: ao.keywords,
        
        // Acheteur
        acheteur: ao.acheteur,
        acheteur_email: ao.acheteur_email,
        acheteur_tel: ao.acheteur_tel,
        
        // Budget & Dates
        budget_max: ao.budget_max,
        deadline: ao.deadline,
        publication_date: ao.publication_date,
        
        // Classification
        type_marche: ao.type_marche,
        region: ao.region,
        url_ao: ao.url_ao,
        
        // Analyse keywords
        keyword_score: ao.keywordScore,
        matched_keywords: ao.matchedKeywords,
        
        // Analyse sémantique
        semantic_score: ao.semanticScore,
        semantic_reason: ao.semanticReason,
        
        // Scoring final
        final_score: ao.finalScore,
        priority: ao.priority,
        
        // Context enrichi
        procedure_type: ao.procedureType,
        has_correctif: ao.hasCorrectif,
        is_renewal: ao.isRenewal,
        warnings: ao.warnings,
        criteres_attribution: ao.criteresAttribution,
        
        // Métadonnées
        client_id: client.id,
        raw_json: ao.raw_json,
        status: 'analyzed',
        analyzed_at: new Date().toISOString(),
        
        // 🆕 Stocker annonce_lie pour recherche optimisée
        annonce_lie: ao.raw_json?.lifecycle?.annonce_lie || ao.raw_json?.annonce_lie || null
      }, {
        onConflict: 'source_id'
      });
    }
    
    console.log(`✅ Sauvegarde terminée: ${scored.length} AO`);
    console.log(`   📊 Stats finales:`);
    console.log(`      - HIGH: ${stats.high} AO`);
    console.log(`      - MEDIUM: ${stats.medium} AO`);
    console.log(`      - LOW: ${stats.low} AO`);
    console.log(`      - CANCELLED: ${stats.cancelled} AO`);
    console.log(`      - Appels LLM: ${stats.llmCalls}`);
    
    return {
      saved: scored.length,
      high: stats.high,
      medium: stats.medium,
      low: stats.low,
      cancelled: stats.cancelled,
      llmCalls: stats.llmCalls,
      statsBySource: inputData.statsBySource,
      highBySource: inputData.highBySource,
      mediumBySource: inputData.mediumBySource,
      lowBySource: inputData.lowBySource,
      client: inputData.client,
      since: inputData.since,
      until: inputData.until
    };
  }
});

// ──────────────────────────────────────────────────
// STEP : ENVOI EMAIL RÉCAPITULATIF
// ──────────────────────────────────────────────────
const sendEmailStep = createStep({
  id: 'send-email',
  inputSchema: z.object({
    saved: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
    cancelled: z.number(),
    llmCalls: z.number(),
    statsBySource: z.object({
      BOAMP: z.object({
        total: z.number(),
        high: z.number(),
        medium: z.number(),
        low: z.number()
      }),
      MARCHESONLINE: z.object({
        total: z.number(),
        high: z.number(),
        medium: z.number(),
        low: z.number()
      })
    }),
    highBySource: z.object({
      BOAMP: z.array(z.any()),
      MARCHESONLINE: z.array(z.any())
    }),
    mediumBySource: z.object({
      BOAMP: z.array(z.any()),
      MARCHESONLINE: z.array(z.any())
    }),
    lowBySource: z.object({
      BOAMP: z.array(z.any()),
      MARCHESONLINE: z.array(z.any())
    }),
    client: clientSchema.nullable(),
    since: z.string().optional(),
    until: z.string().optional()
  }),
  outputSchema: z.object({
    emailSent: z.boolean()
  }),
  execute: async ({ inputData }) => {
    // ────────────────────────────────────────────────────────────
    // 0. ANTI-DUPLICATION EMAIL : vérifier si un email a déjà été envoyé
    //    pour ce client et cette période (since/until ou date unique).
    // ────────────────────────────────────────────────────────────
    if (!inputData.client) {
      console.log(`⚠️ Pas de client disponible, email non envoyé`);
      return { emailSent: false };
    }

    const clientId = inputData.client.id;

    // 2. DATE POUR L'EMAIL : plage (since→until) ou jour unique (veille)
    const { since, until } = inputData;
    const today = new Date();
    const singleDate = since || today.toISOString().split('T')[0];

    // Clés normalisées pour la table veille_email_logs (DATE, pas TIMESTAMP)
    const sinceDate = singleDate;
    const untilDate = until || singleDate;

    try {
      const { data: existingEmail, error: emailCheckError } = await supabase
        .from('veille_email_logs')
        .select('id, sent_at, status')
        .eq('client_id', clientId)
        .eq('since', sinceDate)
        .eq('until', untilDate)
        .eq('status', 'sent')
        .maybeSingle();

      if (emailCheckError) {
        console.error('⚠️ Erreur lors de la vérification des emails existants:', emailCheckError);
      } else if (existingEmail) {
        console.log(`⏭️ Email déjà envoyé pour ${clientId} (${sinceDate} → ${untilDate}), skip envoi.`);
        return { emailSent: false };
      }
    } catch (err) {
      console.error('⚠️ Exception lors de la vérification des emails existants:', err);
    }

    // ────────────────────────────────────────────────────────────
    // 1. VÉRIFICATION PRÉALABLE
    // ────────────────────────────────────────────────────────────
    // (client déjà vérifié plus haut)

    // ────────────────────────────────────────────────────────────
    // 3. ORGANISATION DES DONNÉES POUR LE TEMPLATE
    // ────────────────────────────────────────────────────────────
    // Combiner HIGH et MEDIUM de toutes les sources
    const relevantAOs: EmailData['relevantAOs'] = [];
    
    // Ajouter HIGH et MEDIUM de BOAMP
    [...inputData.highBySource.BOAMP, ...inputData.mediumBySource.BOAMP].forEach(ao => {
      relevantAOs.push({
        source: 'BOAMP',
        title: ao.title || 'Sans titre',
        url: ao.url_ao || '#',
        semanticReason: ao.semanticReason || ao.semantic_reason || 'Aucune justification disponible',
        priority: ao.priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
        acheteur: ao.acheteur,
        deadline: ao.deadline
      });
    });
    
    // Ajouter HIGH et MEDIUM de MarchesOnline
    [...inputData.highBySource.MARCHESONLINE, ...inputData.mediumBySource.MARCHESONLINE].forEach(ao => {
      relevantAOs.push({
        source: 'MARCHESONLINE',
        title: ao.title || 'Sans titre',
        url: ao.url_ao || '#',
        semanticReason: ao.semanticReason || ao.semantic_reason || 'Aucune justification disponible',
        priority: ao.priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
        acheteur: ao.acheteur,
        deadline: ao.deadline
      });
    });

    // Extraire LOW de toutes les sources
    const lowPriorityAOs: EmailData['lowPriorityAOs'] = [];
    
    [...inputData.lowBySource.BOAMP, ...inputData.lowBySource.MARCHESONLINE].forEach(ao => {
      // Extraire la raison de faible priorité
      // Priorité : rejected_reason > semanticReason > message générique
      let reason: string | undefined;
      if ((ao as any).rejected_reason) {
        reason = (ao as any).rejected_reason;
      } else if (ao.semanticReason || (ao as any).semantic_reason) {
        reason = ao.semanticReason || (ao as any).semantic_reason;
      } else if ((ao as any)._skipLLM) {
        reason = 'Score keywords insuffisant pour une analyse approfondie';
      } else {
        reason = 'Analyse sémantique indique une pertinence limitée pour Balthazar';
      }
      
      lowPriorityAOs.push({
        source: ao.source || 'UNKNOWN',
        title: ao.title || 'Sans titre',
        url: ao.url_ao || '#',
        reason
      });
    });

    // Déterminer la raison si aucun AO analysé
    let noAOsReason: string | undefined;
    const totalAnalyzed = inputData.statsBySource.BOAMP.total + inputData.statsBySource.MARCHESONLINE.total;
    if (totalAnalyzed === 0) {
      noAOsReason = 'Aucun appel d\'offres n\'a été trouvé pour cette date, ou tous les AO ont été filtrés (déjà analysés, annulés, etc.).';
    }

    // ────────────────────────────────────────────────────────────
    // 4. PRÉPARATION DES DONNÉES POUR LE TEMPLATE
    // ────────────────────────────────────────────────────────────
    const emailData: EmailData = {
      date: singleDate,
      ...(since && until && { dateRange: { since, until } }),
      statsBySource: inputData.statsBySource,
      relevantAOs,
      lowPriorityAOs,
      noAOsReason
    };

    // ────────────────────────────────────────────────────────────
    // 5. GÉNÉRATION DU CONTENU EMAIL
    // ────────────────────────────────────────────────────────────
    try {
      const htmlBody = generateEmailHTML(emailData);
      const textBody = generateEmailText(emailData);
      const subject = generateEmailSubject(emailData);

      // ────────────────────────────────────────────────────────────
      // 6. ENVOI DE L'EMAIL
      // ────────────────────────────────────────────────────────────
      const result = await sendEmail(subject, htmlBody, textBody);

      // Journaliser dans veille_email_logs, même en cas d'échec
      try {
        const { error: logError } = await supabase
          .from('veille_email_logs')
          .insert({
            client_id: clientId,
            since: sinceDate,
            until: untilDate,
            status: result.success ? 'sent' : 'failed',
            message_id_resend: result.messageId || null
          });

        if (logError) {
          console.error('⚠️ Erreur lors de l\'insertion dans veille_email_logs:', logError);
        } else {
          console.log(`💾 Log email veille enregistré pour ${clientId} (${sinceDate} → ${untilDate}) [status=${result.success ? 'sent' : 'failed'}]`);
        }
      } catch (logEx) {
        console.error('⚠️ Exception lors du logging veille_email_logs:', logEx);
      }

      if (result.success) {
        console.log(`✅ Email récapitulatif envoyé avec succès`);
        return { emailSent: true };
      } else {
        console.error(`❌ Échec envoi email: ${result.error}`);
        // Ne pas faire échouer le workflow si l'email échoue
        return { emailSent: false };
      }
    } catch (error: any) {
      console.error(`❌ Exception lors de la génération/envoi email:`, error?.message || error);
      // Ne pas faire échouer le workflow si l'email échoue
      return { emailSent: false };
    }
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// WORKFLOW IMBRIQUÉ : TRAITEMENT D'UN SEUL AO
// ══════════════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────
// BRANCH 1 : GESTION D'UN AO ANNULÉ
// ──────────────────────────────────────────────────
const handleCancellationAOStep = createStep({
  id: 'handle-cancellation-ao',
  inputSchema: z.object({
    ao: aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      keywordSignals: z.record(z.boolean()).optional(),
      criteresAttribution: z.any().optional(),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    }),
    client: clientSchema
  }),
  outputSchema: z.object({
    ao: aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      semanticScore: z.number().optional(),
      semanticReason: z.string().optional(),
      finalScore: z.number(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW', 'CANCELLED'])
    }),
    client: clientSchema
  }),
  execute: async ({ inputData }) => {
    const { ao, client } = inputData;
    
    console.log(`❌ AO ANNULÉ: ${ao.title} (${ao.source_id})`);
    
    // Mise à jour DB : marquer comme annulé
    try {
      await supabase
        .from('appels_offres')
        .update({
          etat: 'AVIS_ANNULE',
          status: 'cancelled'
        })
        .eq('source_id', ao.source_id);
      
      console.log(`✅ AO ${ao.source_id} marqué comme annulé en DB`);
    } catch (err) {
      console.error(`⚠️ Erreur MAJ annulation:`, err);
    }
    
    // Retourner l'AO avec un statut CANCELLED
    // Pas d'analyse LLM, pas de score
    return {
      ao: {
        ...ao,
        finalScore: 0,
        priority: 'CANCELLED' as const
      },
      client
    };
  }
});

// ──────────────────────────────────────────────────
// BRANCH 2 : GESTION D'UN RECTIFICATIF MINEUR
// ──────────────────────────────────────────────────
const handleMinorRectificationAOStep = createStep({
  id: 'handle-minor-rectification-ao',
  inputSchema: z.object({
    ao: aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      keywordSignals: z.record(z.boolean()).optional(),
      criteresAttribution: z.any().optional(),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    }),
    client: clientSchema
  }),
  outputSchema: z.object({
    ao: aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      semanticScore: z.number().optional(),
      semanticReason: z.string().optional(),
      finalScore: z.number(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW', 'CANCELLED']),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    }),
    client: clientSchema
  }),
  execute: async ({ inputData }) => {
    const { ao, client } = inputData;
    
    console.log(`📝 RECTIFICATIF MINEUR: ${ao.title} (${ao.source_id})`);
    console.log(`   Changements: ${ao._changes?.changes.join(', ')}`);
    
    // Mettre à jour les champs modifiés (deadline, etc.) en DB
    try {
      // Recalculer les clés de déduplication car le deadline peut avoir changé
      const { generateDedupKeys } = await import('../../utils/cross-platform-dedup');
      const dedupKeys = generateDedupKeys({
        uuid_procedure: ao.raw_json?.uuid_procedure || null,
        title: ao.title,
        acheteur: ao.acheteur || null,
        deadline: ao.deadline || null,
        publication_date: ao.publication_date || null,
        siret: ao.raw_json?.metadata?.siret || null
      });
      
      await supabase
        .from('appels_offres')
        .update({
          deadline: ao.deadline,
          raw_json: ao.raw_json,
          // 🆕 Recalculer les clés de déduplication (deadline peut avoir changé)
          dedup_key: dedupKeys.composite_key,
          siret_deadline_key: dedupKeys.siret_deadline_key,
          rectification_date: new Date().toISOString(),
          rectification_count: (ao._originalAO?.rectification_count || 0) + 1
        })
        .eq('id', ao._originalAO?.id);
      
      console.log(`✅ Rectificatif mineur appliqué en DB pour ${ao.source_id}`);
    } catch (err) {
      console.error(`⚠️ Erreur MAJ rectificatif mineur:`, err);
    }
    
    // Retourner l'AO avec les scores de l'original (pas de re-analyse)
    // Le fond du besoin n'a pas changé, le score reste valide
    return {
      ao: {
        ...ao,
        semanticScore: ao._originalAO?.semantic_score || 0,
        semanticReason: ao._originalAO?.semantic_reason || 'Score conservé du rectificatif',
        finalScore: ao._originalAO?.final_score || 0,
        priority: (ao._originalAO?.priority || 'LOW') as 'HIGH' | 'MEDIUM' | 'LOW' | 'CANCELLED'
      },
      client
    };
  }
});

// ──────────────────────────────────────────────────
// BRANCH 2.5 : GESTION SKIP LLM (score keywords uniquement)
// ──────────────────────────────────────────────────
const handleSkipLLMAOStep = createStep({
  id: 'handle-skip-llm-ao',
  inputSchema: z.object({
    ao: aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      keywordSignals: z.record(z.boolean()).optional(),
      keywordDetails: z.any().optional(),
      criteresAttribution: z.any().optional(),
      _shouldSkipLLM: z.boolean().optional(),
      _skipLLMPriority: z.enum(['SKIP', 'LOW', 'MEDIUM', 'HIGH']).optional(),
      _skipLLMReason: z.string().optional(),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    }),
    client: clientSchema
  }),
  outputSchema: z.object({
    ao: aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      semanticScore: z.number().optional(),
      semanticReason: z.string().optional(),
      finalScore: z.number(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW', 'CANCELLED']),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    }),
    client: clientSchema
  }),
  execute: async ({ inputData }) => {
    const { ao, client } = inputData;
    
    console.log(`⚡ SKIP LLM: ${ao.title} (${ao.source_id})`);
    const keywordDetails = (ao as any).keywordDetails;
    if (keywordDetails) {
      console.log(`   Score keywords: ${keywordDetails.score}/100 (${keywordDetails.confidence})`);
      const skipReason = (ao as any)._skipLLMReason || 'unknown';
      const skipPriority = (ao as any)._skipLLMPriority || 'SKIP';
      console.log(`   Raison skip: ${skipReason} (priorité: ${skipPriority})`);
      if (keywordDetails.red_flags_detected && keywordDetails.red_flags_detected.length > 0) {
        console.log(`   ⚠️ Red flags: ${keywordDetails.red_flags_detected.join(', ')}`);
      }
    }
    
    // Calculer score final uniquement basé sur keywords (pas de LLM)
    // Convertir score keywords 0-100 → 0-10 pour le score final
    const keywordScoreOn10 = keywordDetails 
      ? keywordDetails.score / 10  // 0-100 → 0-10
      : ao.keywordScore * 10;      // 0-1 → 0-10 (backward compat)
    
    // Score final basé uniquement sur keywords (avec pénalité car pas d'analyse LLM)
    // Pénalité de 30% car pas d'analyse sémantique/faisabilité
    const finalScore = keywordScoreOn10 * 0.7; // Max 7/10 au lieu de 10/10
    
    // Priorisation basée sur score réduit
    const priority: 'HIGH' | 'MEDIUM' | 'LOW' = 
      finalScore >= 5.6 ? 'MEDIUM' : // 80% de 7
      finalScore >= 4.2 ? 'LOW' : 'LOW'; // 60% de 7
    
    console.log(`✅ Score final (keywords only): ${finalScore.toFixed(2)}/10 - Priorité: ${priority}`);
    
    return {
      ao: {
        ...ao,
        // Pas de semanticScore ni feasibility (skip LLM)
        finalScore,
        priority,
        // Flag pour indiquer que c'était un skip LLM
        _skipLLM: true
      },
      client
    };
  }
});

// ──────────────────────────────────────────────────
// STEP : ANALYSE SÉMANTIQUE D'UN SEUL AO
// ──────────────────────────────────────────────────
const analyzeOneAOSemanticStep = createStep({
  id: 'analyze-one-ao-semantic',
  inputSchema: z.object({
    ao: aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      keywordDetails: z.any().optional(),
      keywordSignals: z.record(z.boolean()).optional(),
      criteresAttribution: z.any().optional(),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    }),
    client: clientSchema
  }),
  outputSchema: z.object({
    ao: aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      keywordDetails: z.any().optional(),
      keywordSignals: z.record(z.boolean()).optional(),
      criteresAttribution: z.any().optional(),
      semanticScore: z.number(),
      semanticReason: z.string(),
      semanticDetails: z.any().optional(),
      procedureType: z.string().nullable(),
      daysRemaining: z.number(),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    }),
    client: clientSchema
  }),
  execute: async ({ inputData }) => {
    const { ao, client } = inputData;
    
    console.log(`🔍 Analyse sémantique de l'AO: ${ao.title}`);

    // Récupérer keywordDetails si disponible
    const keywordDetails = (ao as any).keywordDetails || null;

    // Gate explicite : si le score keywords est insuffisant, ne pas appeler le LLM/RAG
    // Défense en profondeur — le branching de processOneAOWorkflow devrait déjà éviter ce cas,
    // mais on l'applique ici aussi en cas de propagation incomplète du flag _shouldSkipLLM.
    if (keywordDetails) {
      const skipDecision = shouldSkipLLM(keywordDetails);
      if (skipDecision.skip) {
        console.log(`[ao-veille] LLM gate: skip "${ao.title}" — kwScore: ${keywordDetails.adjustedScore ?? keywordDetails.score}/100 (${skipDecision.reason})`);
        const kwScoreOn10 = ((keywordDetails.adjustedScore ?? keywordDetails.score ?? 0) / 100) * 0.5;
        const daysRemaining = getDaysRemaining(ao.deadline || '');
        return {
          ao: {
            ...ao,
            semanticScore: kwScoreOn10,
            semanticReason: 'Hors périmètre — score mots-clés insuffisant.',
            semanticDetails: DEFAULT_FALLBACK_ANALYSIS,
            procedureType: ao.raw_json?.procedure_libelle || null,
            daysRemaining
          },
          client
        };
      }
    }

    // Utiliser la nouvelle fonction avec structured output
    const result = await analyzeSemanticRelevance(ao, keywordDetails);
    
    // Calculer les jours restants
    const daysRemaining = getDaysRemaining(ao.deadline || '');
    
    console.log(`✅ Score sémantique: ${result.score}/10 - ${ao.title}`);
    if (result.details) {
      console.log(`  → Recommandation: ${result.details.recommandation}`);
      console.log(`  → Critères Balthazar: ${result.details.criteres_balthazar.total_valides}/4`);
    }
    
    return {
      ao: {
        ...ao,
        semanticScore: result.score,
        semanticReason: result.reason,
        semanticDetails: result.details,
        procedureType: ao.raw_json?.procedure_libelle || null,
        daysRemaining
      },
      client
    };
  }
});

// ──────────────────────────────────────────────────
// STEP : SCORING D'UN SEUL AO
// ──────────────────────────────────────────────────
const scoreOneAOStep = createStep({
  id: 'score-one-ao',
  inputSchema: z.object({
    ao: aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      semanticScore: z.number(),
      semanticReason: z.string(),
      daysRemaining: z.number(),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    }),
    client: clientSchema
  }),
  outputSchema: z.object({
    ao: aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      semanticScore: z.number(),
      semanticReason: z.string(),
      finalScore: z.number(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    }),
    client: clientSchema
  }),
  execute: async ({ inputData }) => {
    const { ao, client } = inputData;
    
    console.log(`🎯 Scoring de l'AO: ${ao.title}`);
    
    // Calcul score global (0-10)
    // Utiliser keywordDetails si disponible (nouveau scoring), sinon fallback
    const keywordContribution = (ao as any).keywordDetails
      ? ((ao as any).keywordDetails.score / 100) * 0.30  // Nouveau: 30% du score (0-100 → 0-10)
      : (ao.keywordScore * 10) * 0.25;                    // Ancien: 25% (backward compat)
    
    const score = (
      ao.semanticScore * 0.50 +              // Pertinence: 50% (augmenté de 35%)
      keywordContribution +                   // Keywords: 25-30% (augmenté de 20-25%)
      (1 - Math.min(ao.daysRemaining / 60, 1)) * 10 * 0.20  // Urgence: 20% (augmenté de 10%)
    );
    
    // Priorisation
    const priority: 'HIGH' | 'MEDIUM' | 'LOW' = 
      score >= 8 ? 'HIGH' :
      score >= 6 ? 'MEDIUM' : 'LOW';

    // Override: if the agent explicitly decided HAUTE or MOYENNE priorité,
    // don't downgrade to LOW based on numeric score alone.
    // Guard: only apply when semanticDetails is a real analysis, not DEFAULT_FALLBACK_ANALYSIS
    // (detected via recommandation !== 'NON_PERTINENT' AND score_semantique_global > 0).
    const semanticDetails = (ao as any).semanticDetails as BalthazarSemanticAnalysis | null;
    const agentRecommandation = semanticDetails?.recommandation;
    const isRealAnalysis =
      agentRecommandation &&
      agentRecommandation !== 'NON_PERTINENT' &&
      (semanticDetails?.score_semantique_global ?? 0) > 0;

    let finalPriority = priority;
    if (isRealAnalysis && finalPriority === 'LOW') {
      if (agentRecommandation === 'HAUTE_PRIORITE') finalPriority = 'HIGH';
      else if (agentRecommandation === 'MOYENNE_PRIORITE') finalPriority = 'MEDIUM';
    }

    if (finalPriority !== priority) {
      console.log(`   ⬆️  Override priorité: ${priority} → ${finalPriority} (agent: ${agentRecommandation})`);
    }

    console.log(`✅ Score final: ${score.toFixed(2)}/10 - Priorité: ${finalPriority} - ${ao.title}`);
    if ((ao as any).keywordDetails) {
      const details = (ao as any).keywordDetails;
      console.log(`   📊 Keyword breakdown: Secteurs ${details.breakdown.secteur_score} + Expertises ${details.breakdown.expertise_score} + Posture ${details.breakdown.posture_score} = ${details.score}/100`);
    }
    
    return {
      ao: {
        ...ao,
        finalScore: score,
        priority: finalPriority
      },
      client
    };
  }
});

// ──────────────────────────────────────────────────
// WORKFLOW BRANCH 3 & 4 : Analyse complète (LLM)
// ──────────────────────────────────────────────────
// Ce workflow est utilisé pour :
// - Branch 3 : Rectificatifs substantiels (avec contexte)
// - Branch 4 : Nouveaux AO (sans contexte)
const analyzeAOCompleteWorkflow = createWorkflow({
  id: 'analyze-ao-complete',
  inputSchema: z.object({
    ao: aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      keywordSignals: z.record(z.boolean()).optional(),
      criteresAttribution: z.any().optional(),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    }),
    client: clientSchema
  }),
  outputSchema: z.object({
    ao: aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      semanticScore: z.number(),
      semanticReason: z.string(),
      finalScore: z.number(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW', 'CANCELLED']),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    }),
    client: clientSchema
  })
})
  .then(analyzeOneAOSemanticStep)
  .then(scoreOneAOStep)
  .commit();

// ──────────────────────────────────────────────────
// WORKFLOW IMBRIQUÉ : Traitement complet d'UN AO avec BRANCHING
// ──────────────────────────────────────────────────
const processOneAOWorkflow = createWorkflow({
  id: 'process-one-ao',
  inputSchema: z.object({
    ao: aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      keywordSignals: z.record(z.boolean()).optional(),
      keywordDetails: z.any().optional(),
      criteresAttribution: z.any().optional(),
      _shouldSkipLLM: z.boolean().optional(),
      _skipLLMPriority: z.enum(['SKIP', 'LOW', 'MEDIUM', 'HIGH']).optional(),
      _skipLLMReason: z.string().optional(),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    }),
    client: clientSchema
  }),
  outputSchema: z.object({
    ao: aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      semanticScore: z.number().optional(),
      semanticReason: z.string().optional(),
      finalScore: z.number(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW', 'CANCELLED']),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    }),
    client: clientSchema
  })
})
  // ═══════════════════════════════════════════════════════
  // BRANCHING PAR TYPE D'AO
  // ═══════════════════════════════════════════════════════
  // Ordre important : du plus bloquant au plus coûteux
  .branch([
    // ────────────────────────────────────────────────────
    // BRANCH 1 : AO ANNULÉ
    // ────────────────────────────────────────────────────
    // Critère : etat === 'AVIS_ANNULE' ou nature_label/nature contient "annulation"
    // Action : Update DB uniquement, STOP du pipeline
    // Coût LLM : 0
    [
      async ({ inputData }) => {
        // Vérifier etat normalisé (priorité)
        // Fallback : vérifier raw_json si etat n'est pas encore normalisé
        const isAnnule = 
          inputData.ao.etat === 'AVIS_ANNULE' ||
          (inputData.ao.raw_json?.lifecycle?.nature_label?.toLowerCase().includes('annulation')) ||
          (inputData.ao.raw_json?.lifecycle?.nature?.toLowerCase().includes('annulation'));
        if (isAnnule) {
          console.log(`🔀 Branch 1: AO ANNULÉ détecté - ${inputData.ao.title}`);
        }
        return isAnnule;
      },
      handleCancellationAOStep
    ],
    
    // ────────────────────────────────────────────────────
    // BRANCH 2 : RECTIFICATIF MINEUR
    // ────────────────────────────────────────────────────
    // Critère : _isRectification === true && !isSubstantial
    // Action : Update DB, conserver score précédent, STOP du pipeline
    // Coût LLM : 0
    [
      async ({ inputData }) => {
        const isMinorRectif = 
          inputData.ao._isRectification === true && 
          inputData.ao._changes?.isSubstantial === false;
        if (isMinorRectif) {
          console.log(`🔀 Branch 2: RECTIFICATIF MINEUR détecté - ${inputData.ao.title}`);
        }
        return isMinorRectif;
      },
      handleMinorRectificationAOStep
    ],
    
    // ────────────────────────────────────────────────────
    // BRANCH 2.5 : SKIP LLM (score keywords uniquement)
    // ────────────────────────────────────────────────────
    // Critère : _shouldSkipLLM === true
    // Action : Score basé uniquement sur keywords, skip analyses LLM
    // Coût LLM : 0
    [
      async ({ inputData }) => {
        const shouldSkip = (inputData.ao as any)._shouldSkipLLM === true;
        if (shouldSkip) {
          console.log(`🔀 Branch 2.5: SKIP LLM détecté - ${inputData.ao.title}`);
        }
        return shouldSkip;
      },
      handleSkipLLMAOStep
    ],
    
    // ────────────────────────────────────────────────────
    // BRANCH 3 : RECTIFICATIF SUBSTANTIEL
    // ────────────────────────────────────────────────────
    // Critère : _isRectification === true && isSubstantial
    // Action : Pipeline LLM complet avec contexte de comparaison
    // Coût LLM : 1 appel (semantic)
    [
      async ({ inputData }) => {
        const isSubstantialRectif = 
          inputData.ao._isRectification === true && 
          inputData.ao._changes?.isSubstantial === true;
        if (isSubstantialRectif) {
          console.log(`🔀 Branch 3: RECTIFICATIF SUBSTANTIEL détecté - ${inputData.ao.title}`);
          console.log(`   Changements: ${inputData.ao._changes.changes.join(', ')}`);
        }
        return isSubstantialRectif;
      },
      analyzeAOCompleteWorkflow
    ],
    
    // ────────────────────────────────────────────────────
    // BRANCH 4 : NOUVEL AO (FALLBACK)
    // ────────────────────────────────────────────────────
    // Critère : !_shouldSkipLLM (ne s'exécute que si on ne skip pas LLM)
    // Action : Pipeline LLM complet standard
    // Coût LLM : 1 appel (semantic)
    [
      async ({ inputData }) => {
        const shouldSkip = (inputData.ao as any)._shouldSkipLLM === true;
        if (!shouldSkip) {
          console.log(`🔀 Branch 4: NOUVEL AO - ${inputData.ao.title}`);
        }
        return !shouldSkip; // Ne s'exécute que si on ne skip pas LLM
      },
      analyzeAOCompleteWorkflow
    ]
  ])
  .commit();

// ──────────────────────────────────────────────────
// STEP : NORMALISATION DES RÉSULTATS BRANCHÉS
// ──────────────────────────────────────────────────
// Rôle : Extraire le résultat de la branche exécutée depuis l'objet branché
// Input : Tableau d'objets avec clés de branches { "handle-skip-llm-ao": {...}, ... }
// Output : Tableau de { ao, client } normalisé
const normalizeBranchResultsStep = createStep({
  id: 'normalize-branch-results',
  inputSchema: z.array(z.any()), // Tableau d'objets branchés
  outputSchema: z.array(z.object({
    ao: z.any(),
    client: clientSchema
  })),
  execute: async ({ inputData }) => {
    // Normaliser chaque résultat branché
    return inputData.map((branchResult: any) => {
      // Le workflow branché retourne un objet avec des clés de branches
      // On extrait le résultat de la première branche qui existe
      if (branchResult['handle-skip-llm-ao']) {
        return branchResult['handle-skip-llm-ao'];
      }
      if (branchResult['handle-cancelled-ao']) {
        return branchResult['handle-cancelled-ao'];
      }
      if (branchResult['analyze-ao-complete']) {
        return branchResult['analyze-ao-complete'];
      }
      // Fallback : si la structure est déjà normalisée
      if (branchResult.ao && branchResult.client) {
        return branchResult;
      }
      // Si aucune structure attendue n'est trouvée, on essaie de prendre la première valeur
      const keys = Object.keys(branchResult);
      if (keys.length > 0) {
        return branchResult[keys[0]];
      }
      throw new Error(`Cannot normalize branch result: ${JSON.stringify(branchResult)}`);
    });
  }
});

// ──────────────────────────────────────────────────
// STEP : AGRÉGATION DES RÉSULTATS APRÈS .foreach()
// ──────────────────────────────────────────────────
// Rôle : Mise en forme et tri uniquement (pas d'intelligence)
// Input : Tableau de { ao, client } depuis .foreach()
// Output : Objet structuré avec catégories et stats
const aggregateResultsStep = createStep({
  id: 'aggregate-results',
  inputSchema: z.array(z.object({
    ao: z.any(),
    client: clientSchema
  })),
  outputSchema: z.object({
    all: z.array(z.any()),
    high: z.array(z.any()),
    medium: z.array(z.any()),
    low: z.array(z.any()),
    cancelled: z.array(z.any()),
    stats: z.object({
      total: z.number(),
      analysed: z.number(),
      cancelled: z.number(),
      skipped: z.number().optional(),
      high: z.number(),
      medium: z.number(),
      low: z.number(),
      llmCalls: z.number()
    }),
    client: clientSchema.nullable(),
    statsBySource: z.object({
      BOAMP: z.object({
        total: z.number(),
        high: z.number(),
        medium: z.number(),
        low: z.number()
      }),
      MARCHESONLINE: z.object({
        total: z.number(),
        high: z.number(),
        medium: z.number(),
        low: z.number()
      })
    }),
    highBySource: z.object({
      BOAMP: z.array(z.any()),
      MARCHESONLINE: z.array(z.any())
    }),
    mediumBySource: z.object({
      BOAMP: z.array(z.any()),
      MARCHESONLINE: z.array(z.any())
    }),
    lowBySource: z.object({
      BOAMP: z.array(z.any()),
      MARCHESONLINE: z.array(z.any())
    }),
    since: z.string().optional(),
    until: z.string().optional()
  }),
  execute: async ({ inputData }) => {
    console.log(`📊 Agrégation de ${inputData.length} AO traités...`);
    
    // ────────────────────────────────────────────────────────────
    // 1. GÉRER LE CAS OÙ IL N'Y A AUCUN AO (tous annulés ou filtrés)
    // ────────────────────────────────────────────────────────────
    if (inputData.length === 0) {
      console.log(`⚠️ Aucun AO à agréger (tous annulés ou filtrés)`);
      // Retourner une structure vide avec des stats à zéro
      // Note: client est null car on ne peut pas le récupérer sans AO
      return {
        all: [],
        high: [],
        medium: [],
        low: [],
        cancelled: [],
        stats: {
          total: 0,
          analysed: 0,
          cancelled: 0,
          skipped: 0,
          high: 0,
          medium: 0,
          low: 0,
          llmCalls: 0
        },
        client: null,
        statsBySource: {
          BOAMP: { total: 0, high: 0, medium: 0, low: 0 },
          MARCHESONLINE: { total: 0, high: 0, medium: 0, low: 0 }
        },
        highBySource: { BOAMP: [], MARCHESONLINE: [] },
        mediumBySource: { BOAMP: [], MARCHESONLINE: [] },
        lowBySource: { BOAMP: [], MARCHESONLINE: [] },
        since: undefined,
        until: undefined
      };
    }
    
    // ────────────────────────────────────────────────────────────
    // 2. EXTRACTION : Récupérer tous les AO du tableau
    // ────────────────────────────────────────────────────────────
    const allAOs = inputData.map(item => item.ao);
    
    // ────────────────────────────────────────────────────────────
    // 3. RÉCUPÉRATION DU CLIENT ET DE LA PLAGE DE DATES
    // ────────────────────────────────────────────────────────────
    const client = inputData[0].client;
    const dateRange = (client as any)._dateRange;
    const since = dateRange?.since;
    const until = dateRange?.until;
    
    // ────────────────────────────────────────────────────────────
    // 3. SÉPARATION PAR CATÉGORIE (tri simple, pas d'intelligence)
    // ────────────────────────────────────────────────────────────
    const high = allAOs.filter(ao => ao.priority === 'HIGH');
    const medium = allAOs.filter(ao => ao.priority === 'MEDIUM');
    const low = allAOs.filter(ao => ao.priority === 'LOW');
    const cancelled = allAOs.filter(ao => ao.priority === 'CANCELLED');
    
    // ────────────────────────────────────────────────────────────
    // 3.5. SÉPARATION PAR SOURCE (pour email)
    // ────────────────────────────────────────────────────────────
    const highBySource = {
      BOAMP: high.filter(ao => ao.source === 'BOAMP'),
      MARCHESONLINE: high.filter(ao => ao.source === 'MARCHESONLINE')
    };
    
    const mediumBySource = {
      BOAMP: medium.filter(ao => ao.source === 'BOAMP'),
      MARCHESONLINE: medium.filter(ao => ao.source === 'MARCHESONLINE')
    };
    
    const lowBySource = {
      BOAMP: low.filter(ao => ao.source === 'BOAMP'),
      MARCHESONLINE: low.filter(ao => ao.source === 'MARCHESONLINE')
    };
    
    // ────────────────────────────────────────────────────────────
    // 4. CALCUL DES STATISTIQUES
    // ────────────────────────────────────────────────────────────
    const total = allAOs.length;
    const cancelledCount = cancelled.length;
    const analysed = total - cancelledCount; // AO qui ont été analysés (pas annulés)
    
    // Calcul du nombre d'appels LLM effectués
    // - Branch 1 (CANCELLED) : 0 appel LLM
    // - Branch 1 (annulé) : 0 appel LLM
    // - Branch 2 (rectificatif mineur) : 0 appel LLM (conserve score original)
    // - Branch 2.5 (skip LLM) : 0 appel LLM (score keywords uniquement)
    // - Branch 3 (rectificatif substantiel) : 1 appel LLM (semantic)
    // - Branch 4 (nouvel AO) : 1 appel LLM (semantic)
    // 
    // Les AO avec semanticScore défini ont été analysés par LLM
    // Exclure les AO avec _skipLLM === true (skip LLM, pas d'analyse)
    const aoWithLLMAnalysis = allAOs.filter(ao => 
      ao.semanticScore !== undefined && 
      ao.semanticScore !== null &&
      ao.priority !== 'CANCELLED' &&
      !(ao as any)._skipLLM
    );
    const llmCalls = aoWithLLMAnalysis.length * 1; // 1 appel par AO (semantic)
    
    // ────────────────────────────────────────────────────────────
    // 4.5. CALCUL STATS PAR SOURCE
    // ────────────────────────────────────────────────────────────
    const boampAOs = allAOs.filter(ao => ao.source === 'BOAMP');
    const marchesonlineAOs = allAOs.filter(ao => ao.source === 'MARCHESONLINE');
    
    const statsBySource = {
      BOAMP: {
        total: boampAOs.length,
        high: highBySource.BOAMP.length,
        medium: mediumBySource.BOAMP.length,
        low: lowBySource.BOAMP.length
      },
      MARCHESONLINE: {
        total: marchesonlineAOs.length,
        high: highBySource.MARCHESONLINE.length,
        medium: mediumBySource.MARCHESONLINE.length,
        low: lowBySource.MARCHESONLINE.length
      }
    };
    
    // ────────────────────────────────────────────────────────────
    // 5. LOGS RÉCAPITULATIFS
    // ────────────────────────────────────────────────────────────
    console.log(`✅ Agrégation terminée pour le client ${client.name}`);
    console.log(`   📊 Total: ${total} AO traités`);
    console.log(`   ✅ Analysés: ${analysed} AO`);
    console.log(`   ❌ Annulés: ${cancelledCount} AO`);
    // Note: Les skipped sont déjà loggés dans filterAlreadyAnalyzedStep
    // car ils ne passent pas par le foreach, donc pas disponibles ici
    console.log(`   🔥 HIGH: ${high.length} AO`);
    console.log(`   🟡 MEDIUM: ${medium.length} AO`);
    console.log(`   🟢 LOW: ${low.length} AO`);
    console.log(`   💰 Appels LLM: ${llmCalls} (${aoWithLLMAnalysis.length} AO × 1)`);
    
    // ────────────────────────────────────────────────────────────
    // 6. RETOUR DE L'OBJET STRUCTURÉ
    // ────────────────────────────────────────────────────────────
    return {
      all: allAOs,
      high,
      medium,
      low,
      cancelled,
      since,
      until,
      stats: {
        total,
        analysed,
        cancelled: cancelledCount,
        skipped: 0, // Les skipped sont loggés dans filterAlreadyAnalyzedStep, pas disponibles ici
        high: high.length,
        medium: medium.length,
        low: low.length,
        llmCalls
      },
      client,
      statsBySource,
      highBySource,
      mediumBySource,
      lowBySource
    };
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// WORKFLOW PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────
// WORKFLOW
// ──────────────────────────────────────────────────
export const aoVeilleWorkflow = createWorkflow({
  id: 'aoVeilleWorkflow',
  inputSchema: z.object({
    clientId: z.string(),
    since: z.string().optional(),
    until: z.string().optional(), // Plage : si fourni avec since, fetch since→until ; sinon mode jour unique (cron)
    marchesonlineRSSUrls: z.array(z.string().url()).optional()
  }),
  outputSchema: z.object({
    saved: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
    cancelled: z.number(),
    llmCalls: z.number()
  })
})
  // ═══════════════════════════════════════════════════════
  // PHASE 1 : COLLECTE & FILTRAGE GRATUIT (pas de LLM)
  // ═══════════════════════════════════════════════════════
  .then(fetchAndPrequalifyStep)
  .then(handleCancellationsStep)      // 🆕 STEP 1b: Gestion annulations
  .then(detectRectificationStep)      // 🆕 STEP 1c: Détection rectificatifs
  .then(filterAlreadyAnalyzedStep)    // 🆕 STEP 1d: Filtrage AO déjà analysés
  .then(keywordMatchingStep)
  
  // ═══════════════════════════════════════════════════════
  // PHASE 2 : TRANSFORMATION POUR .foreach()
  // ═══════════════════════════════════════════════════════
  // Transformer l'objet { keywordMatched: [...], client: {...} }
  // en tableau pur [{ ao: AO1, client }, { ao: AO2, client }, ...]
  // pour permettre l'utilisation de .foreach()
  .map(async ({ inputData }) => {
    const { keywordMatched, client, since, until } = inputData;
    // Stocker since/until dans client pour propagation (foreach ne transmet pas les champs supplémentaires)
    const clientWithDateRange = { ...client, _dateRange: since && until ? { since, until } : undefined } as any;
    return keywordMatched.map(ao => ({ ao, client: clientWithDateRange }));
  })
  
  // ═══════════════════════════════════════════════════════
  // PHASE 3 : TRAITEMENT INDIVIDUEL PAR AO (LLM)
  // ═══════════════════════════════════════════════════════
  // Chaque AO est traité individuellement par le workflow imbriqué.
  // Concurrency à 3 : GPT-4o consomme ~10K tokens/appel, limite TPM = 30K → max 3 appels simultanés.
  // Les AOs skippés (branch 2.5) ne consomment aucun token et ne contribuent pas à la limite.
  .foreach(processOneAOWorkflow, { concurrency: 2 })
  
  // ═══════════════════════════════════════════════════════
  // PHASE 3.5 : NORMALISATION DES RÉSULTATS BRANCHÉS
  // ═══════════════════════════════════════════════════════
  // Le workflow branché retourne { "handle-skip-llm-ao": {...}, "analyze-ao-complete": {...} }
  // On doit extraire le résultat de la branche qui a été exécutée
  .then(normalizeBranchResultsStep)
  
  // ═══════════════════════════════════════════════════════
  // PHASE 4 : AGRÉGATION DES RÉSULTATS
  // ═══════════════════════════════════════════════════════
  // Transformer le tableau [{ ao: AO1 }, { ao: AO2 }, ...]
  // en objet { scored: [...], client: {...} }
  .then(aggregateResultsStep)
  
  // ═══════════════════════════════════════════════════════
  // PHASE 5 : SAUVEGARDE
  // ═══════════════════════════════════════════════════════
  .then(saveResultsStep)
  
  // ═══════════════════════════════════════════════════════
  // PHASE 6 : ENVOI EMAIL RÉCAPITULATIF
  // ═══════════════════════════════════════════════════════
  .then(sendEmailStep)
  .commit();
