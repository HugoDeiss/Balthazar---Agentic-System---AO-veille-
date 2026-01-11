import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { boampFetcherTool, type CanonicalAO } from '../tools/boamp-fetcher';
import {
  isRectification,
  findOriginalAO,
  detectSubstantialChanges
} from './rectificatif-utils';
import { checkBatchAlreadyAnalyzed } from '../../persistence/ao-persistence';
import { scheduleRetry } from '../../utils/retry-scheduler';

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
    etat: canonicalAO.lifecycle.etat || undefined,
    raw_json: canonicalAO // Conserver l'objet complet pour référence
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
    since: z.string().optional()
  }),
  outputSchema: z.object({
    prequalified: z.array(aoSchema),
    client: clientSchema
  }),
  execute: async ({ inputData, requestContext }) => {
    const client = await getClient(inputData.clientId);
    
    // 1️⃣ Fetch BOAMP (filtrage structurel côté API)
    const boampData = await boampFetcherTool.execute!({
      since: inputData.since, // Optionnel, default = veille
      typeMarche: client.preferences.typeMarche,
      pageSize: 200 // Nombre d'AO à récupérer par page
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
    
    // 3️⃣ TRANSFORMATION : Convertir CanonicalAO[] (structure imbriquée) vers format plat aoSchema
    const prequalified = boampData.records.map(canonicalAOToFlatSchema);
    
    console.log(`✅ Collecte: ${prequalified.length} AO transmis à l'analyse`);
    
    return { 
      prequalified, 
      client,
      fetchStatus: boampData.status,
      fetchMissing: boampData.missing
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
    client: clientSchema
  }),
  outputSchema: z.object({
    activeAOs: z.array(aoSchema),
    cancelledCount: z.number(),
    client: clientSchema
  }),
  execute: async ({ inputData }) => {
    const { prequalified, client } = inputData;
    const activeAOs: any[] = [];
    let cancelledCount = 0;
    
    console.log(`🚫 Traitement des annulations sur ${prequalified.length} AO...`);
    
    for (const ao of prequalified) {
      if (ao.etat === 'AVIS_ANNULE') {
        cancelledCount++;
        console.log(`❌ AO annulé détecté: ${ao.title} (${ao.source_id})`);
        
        // Mise à jour DB : marquer comme annulé
        try {
          const { error } = await supabase
            .from('appels_offres')
            .update({
              etat: 'AVIS_ANNULE',
              status: 'cancelled',
              updated_at: new Date().toISOString()
            })
            .eq('source_id', ao.source_id);
          
          if (error) {
            console.error(`⚠️ Erreur MAJ annulation pour ${ao.source_id}:`, error);
          } else {
            console.log(`✅ AO ${ao.source_id} marqué comme annulé en DB`);
          }
        } catch (err) {
          console.error(`⚠️ Exception MAJ annulation:`, err);
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
      client 
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
    client: clientSchema
  }),
  outputSchema: z.object({
    toAnalyze: z.array(aoSchema.extend({
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    })),
    rectificationsMineurs: z.number(),
    rectificationsSubstantiels: z.number(),
    client: clientSchema
  }),
  execute: async ({ inputData }) => {
    const { activeAOs, client } = inputData;
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
                rectification_count: (originalAO.rectification_count || 0) + 1,
                updated_at: new Date().toISOString()
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
      client
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
    client: clientSchema
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
    client: clientSchema
  }),
  execute: async ({ inputData }) => {
    const { toAnalyze, rectificationsMineurs, rectificationsSubstantiels, client } = inputData;
    
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
      client
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
    client: clientSchema
  }),
  outputSchema: z.object({
    keywordMatched: z.array(aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      keywordSignals: z.record(z.boolean()).optional(),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    })),
    client: clientSchema
  }),
  execute: async ({ inputData }) => {
    const { toAnalyze: prequalified, client } = inputData;
    
    // 🎯 NOUVEAU : Pré-score NON BLOQUANT
    // Ne rejette JAMAIS un AO, produit seulement des signaux pour l'IA
    const keywordMatched = prequalified.map(ao => {
      const aoKeywords = [
        ...(ao.keywords || []),
        ao.title.toLowerCase(),
        ao.description?.toLowerCase() || ''
      ].join(' ');
      
      // Compte combien de keywords client matchent
      const matchedKeywords = client.keywords.filter(kw => 
        aoKeywords.includes(kw.toLowerCase())
      );
      const matchCount = matchedKeywords.length;
      const keywordScore = matchCount / client.keywords.length;
      
      // 🆕 Signaux faibles : détection de concepts clés
      const keywordSignals: Record<string, boolean> = {
        strategy: /stratégie|stratégique/i.test(aoKeywords),
        transformation: /transformation|digitale|numérique/i.test(aoKeywords),
        innovation: /innovation|innovant/i.test(aoKeywords),
        management: /management|pilotage|gestion/i.test(aoKeywords),
        performance: /performance|efficacité|optimisation/i.test(aoKeywords),
        conseil: /conseil|consulting|accompagnement/i.test(aoKeywords),
        audit: /audit|diagnostic|évaluation/i.test(aoKeywords),
        conduite_changement: /conduite.{0,5}changement|change.{0,5}management/i.test(aoKeywords)
      };
      
      // Analyse des critères d'attribution pour scorer la compétitivité
      const criteres = ao.raw_json?.criteres || null;
      
      return {
        ...ao,
        keywordScore,
        matchedKeywords,
        keywordSignals,
        criteresAttribution: criteres,
        // Préserver les métadonnées de rectificatif
        _isRectification: ao._isRectification,
        _originalAO: ao._originalAO,
        _changes: ao._changes
      };
    })
    // 🆕 PLUS DE FILTRE : tous les AO passent
    .sort((a, b) => b.keywordScore - a.keywordScore);
    
    console.log(`✅ Keyword matching: ${keywordMatched.length}/${prequalified.length} AO (tous transmis avec pré-score)`);
    
    return { keywordMatched, client };
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
    client: clientSchema
  }),
  outputSchema: z.object({
    saved: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
    cancelled: z.number(),
    llmCalls: z.number()
  }),
  execute: async ({ inputData }) => {
    const { all: scored, client, stats } = inputData;
    
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
          feasibility: ao._originalAO.feasibility,
          priority: ao._originalAO.priority,
          final_score: ao._originalAO.final_score,
          rejected_reason: ao._originalAO.rejected_reason || null
        });
        
        // UPDATE de l'AO existant (pas INSERT)
        await supabase.from('appels_offres').update({
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
          
          // Analyse faisabilité
          feasibility: ao.feasibility,
          
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
          }
        }).eq('id', ao._originalAO.id);
        
        continue; // Passer à l'AO suivant
      }
      
      // ────────────────────────────────────────────────────────────
      // CAS NORMAL : AO nouveau ou non-rectificatif
      // ────────────────────────────────────────────────────────────
      await supabase.from('appels_offres').upsert({
        // Identifiants
        source: ao.source,
        source_id: ao.source_id,
        
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
        
        // Analyse faisabilité
        feasibility: ao.feasibility,
        
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
        analyzed_at: new Date().toISOString()
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
      llmCalls: stats.llmCalls
    };
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
      feasibility: z.object({
        financial: z.boolean(),
        technical: z.boolean(),
        timing: z.boolean(),
        blockers: z.array(z.string()),
        confidence: z.enum(['high', 'medium', 'low'])
      }).optional(),
      isFeasible: z.boolean().optional(),
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
          status: 'cancelled',
          updated_at: new Date().toISOString()
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
      feasibility: z.object({
        financial: z.boolean(),
        technical: z.boolean(),
        timing: z.boolean(),
        blockers: z.array(z.string()),
        confidence: z.enum(['high', 'medium', 'low'])
      }).optional(),
      isFeasible: z.boolean().optional(),
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
      await supabase
        .from('appels_offres')
        .update({
          deadline: ao.deadline,
          raw_json: ao.raw_json,
          rectification_date: new Date().toISOString(),
          rectification_count: (ao._originalAO?.rectification_count || 0) + 1,
          updated_at: new Date().toISOString()
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
// STEP : ANALYSE SÉMANTIQUE D'UN SEUL AO
// ──────────────────────────────────────────────────
const analyzeOneAOSemanticStep = createStep({
  id: 'analyze-one-ao-semantic',
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
      keywordSignals: z.record(z.boolean()).optional(),
      criteresAttribution: z.any().optional(),
      semanticScore: z.number(),
      semanticReason: z.string(),
      procedureType: z.string().nullable(),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    }),
    client: clientSchema
  }),
  execute: async ({ inputData, mastra }) => {
    const { ao, client } = inputData;
    
    console.log(`🔍 Analyse sémantique de l'AO: ${ao.title}`);
    
    // Utilisation de l'agent spécialisé boampSemanticAnalyzer
    const semanticAgent = mastra?.getAgent('boampSemanticAnalyzer');
    if (!semanticAgent) {
      throw new Error('Agent boampSemanticAnalyzer not found');
    }
    
    const procedureContext = ao.raw_json?.procedure_libelle 
      ? `Type de procédure: ${ao.raw_json.procedure_libelle}
         // Procédure ouverte = accessible à tous (+3 points)
         // Procédure restreinte = sur présélection (neutre)
         // Dialogue compétitif = nécessite plus de ressources (-1 point)
         // MPS = procédure allégée (+2 points)`
      : 'Type de procédure non spécifié';

    const analysis = await semanticAgent.generate([
      {
        role: 'user',
        content: `
Profil client:
- Nom: ${client.name}
- Mots-clés métier: ${client.keywords.join(', ')}
- Type de marché: ${client.preferences.typeMarche}
- Description: ${JSON.stringify(client.profile, null, 2)}
- Budget minimum: ${client.criteria.minBudget}€
- Régions cibles: ${client.criteria.regions?.join(', ') || 'Toutes régions'}

Appel d'offres:
- Titre: ${ao.title}
- Description: ${ao.description || 'Non fournie'}
- Mots-clés: ${ao.keywords?.join(', ') || 'Aucun'}
- Acheteur: ${ao.acheteur || 'Non spécifié'}
- Type de marché: ${ao.type_marche || 'Non spécifié'}
- Budget estimé: ${ao.budget_max ? `${ao.budget_max}€` : 'Non spécifié'}
- Région: ${ao.region || 'Non spécifiée'}
- Pré-score mots-clés: ${ao.keywordScore?.toFixed(2) || 'N/A'}
- Signaux détectés: ${(ao as any).keywordSignals ? Object.entries((ao as any).keywordSignals).filter(([_, v]) => v).map(([k]) => k).join(', ') || 'Aucun' : 'N/A'}

${procedureContext}

Question: Sur une échelle de 0 à 10, quelle est la pertinence de cet AO pour ce client ?

Critères d'évaluation:
1. Adéquation métier (secteur, expertise, mots-clés)
2. Budget compatible avec les capacités du client
3. Localisation géographique (priorité aux régions cibles, mais pas éliminatoire)
4. Type de procédure (ouvert = accessible, restreint = compétitif)
5. Signaux faibles détectés par le pré-scoring

Réponds UNIQUEMENT en JSON:
{
  "score": <number 0-10>,
  "reason": "<justification en 1-2 phrases incluant budget et localisation>"
}
        `.trim()
      }
    ]);
    
    const result = JSON.parse(analysis.text);
    
    console.log(`✅ Score sémantique: ${result.score}/10 - ${ao.title}`);
    
    return {
      ao: {
        ...ao,
        semanticScore: result.score,
        semanticReason: result.reason,
        procedureType: ao.raw_json?.procedure_libelle || null
      },
      client
    };
  }
});

// ──────────────────────────────────────────────────
// STEP : ANALYSE FAISABILITÉ D'UN SEUL AO
// ──────────────────────────────────────────────────
const analyzeOneAOFeasibilityStep = createStep({
  id: 'analyze-one-ao-feasibility',
  inputSchema: z.object({
    ao: aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      semanticScore: z.number(),
      semanticReason: z.string(),
      procedureType: z.string().nullable(),
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
      procedureType: z.string().nullable(),
      feasibility: z.object({
        financial: z.boolean(),
        technical: z.boolean(),
        timing: z.boolean(),
        blockers: z.array(z.string()),
        confidence: z.enum(['high', 'medium', 'low'])
      }),
      isFeasible: z.boolean(),
      warnings: z.array(z.string()),
      daysRemaining: z.number(),
      hasCorrectif: z.boolean(),
      isRenewal: z.boolean(),
      _isRectification: z.boolean().optional(),
      _originalAO: z.any().optional(),
      _changes: z.any().optional()
    }),
    client: clientSchema
  }),
  execute: async ({ inputData, mastra }) => {
    const { ao, client } = inputData;
    
    console.log(`🔍 Analyse faisabilité de l'AO: ${ao.title}`);
    
    // Utilisation de l'agent spécialisé boampFeasibilityAnalyzer
    const feasibilityAgent = mastra?.getAgent('boampFeasibilityAnalyzer');
    if (!feasibilityAgent) {
      throw new Error('Agent boampFeasibilityAnalyzer not found');
    }
    
    // Calcul des jours restants
    const daysRemaining = getDaysRemaining(ao.deadline || '');
    
    // Parse les critères depuis le JSON "donnees"
    let criteres = null;
    try {
      if (ao.raw_json?.donnees) {
        const donneesObj = typeof ao.raw_json.donnees === 'string'
          ? JSON.parse(ao.raw_json.donnees)
          : ao.raw_json.donnees;
        criteres = donneesObj?.CONDITION_PARTICIPATION || null;
      }
    } catch (e) {
      console.warn(`Failed to parse donnees for ${ao.source_id}:`, e);
    }
    
    // Warnings et context additionnels
    const warnings: string[] = [];
    let additionalContext = '';
    
    if (ao.raw_json?.annonce_lie) {
      warnings.push("⚠️ Cet AO a fait l'objet d'un correctif");
      additionalContext += `\nAnnonce liée (correctif): ${ao.raw_json.annonce_lie}`;
    }
    
    if (ao.raw_json?.annonces_anterieures) {
      additionalContext += '\nRenouvellement d\'un marché existant - peut être plus facile à gagner si on connaît l\'historique';
      warnings.push("ℹ️ Renouvellement de marché existant");
    }
    
    const analysis = await feasibilityAgent.generate([
      {
        role: 'user',
        content: `
Profil client:
- Nom: ${client.name}
- CA annuel: ${client.financial.revenue}€
- Effectif: ${client.financial.employees} personnes
- Années d'expérience: ${client.financial.yearsInBusiness}
- Références similaires: ${client.technical.references} projets
- Budget minimum ciblé: ${client.criteria.minBudget}€
- Régions d'intervention: ${client.criteria.regions?.join(', ') || 'National'}

Appel d'offres:
- Titre: ${ao.title}
- Budget max: ${ao.budget_max ? `${ao.budget_max}€` : 'Non spécifié'}
- Délai restant: ${daysRemaining} jours

Critères de participation (extraits du BOAMP):
${JSON.stringify(criteres, null, 2)}
${additionalContext}

Questions:
1. Le client respecte-t-il les critères financiers (CA minimum, garanties) ?
2. Le client respecte-t-il les critères techniques (références, certifications, effectif) ?
3. Le délai est-il réaliste pour préparer une réponse de qualité ?

Réponds UNIQUEMENT en JSON:
{
  "financial": <boolean>,
  "technical": <boolean>,
  "timing": <boolean>,
  "blockers": [<liste des blockers si applicable>],
  "confidence": <"high"|"medium"|"low">
}
        `.trim()
      }
    ]);
    
    const feasibility = JSON.parse(analysis.text);
    const isFeasible = feasibility.financial && feasibility.technical && feasibility.timing;
    
    console.log(`✅ Faisabilité: ${isFeasible ? 'OUI' : 'NON'} - ${ao.title}`);
    
    return {
      ao: {
        ...ao,
        feasibility,
        isFeasible,
        warnings,
        daysRemaining,
        hasCorrectif: !!ao.raw_json?.annonce_lie,
        isRenewal: !!ao.raw_json?.annonces_anterieures
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
      feasibility: z.object({
        financial: z.boolean(),
        technical: z.boolean(),
        timing: z.boolean(),
        blockers: z.array(z.string()),
        confidence: z.enum(['high', 'medium', 'low'])
      }),
      isFeasible: z.boolean(),
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
      feasibility: z.object({
        financial: z.boolean(),
        technical: z.boolean(),
        timing: z.boolean(),
        blockers: z.array(z.string()),
        confidence: z.enum(['high', 'medium', 'low'])
      }),
      isFeasible: z.boolean(),
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
    // Toutes les composantes sont normalisées sur l'échelle 0-10
    const score = (
      ao.semanticScore * 0.4 +              // Pertinence: 40% (déjà sur 0-10)
      (ao.keywordScore * 10) * 0.2 +        // Keywords: 20% (0-1 → 0-10)
      (ao.feasibility.confidence === 'high' ? 10 : 
       ao.feasibility.confidence === 'medium' ? 7 : 4) * 0.3 + // Faisabilité: 30% (0-10)
      (1 - Math.min(ao.daysRemaining / 60, 1)) * 10 * 0.1  // Urgence: 10% (0-1 → 0-10)
    );
    
    // Priorisation
    const priority: 'HIGH' | 'MEDIUM' | 'LOW' = 
      score >= 8 ? 'HIGH' :
      score >= 6 ? 'MEDIUM' : 'LOW';
    
    console.log(`✅ Score final: ${score.toFixed(2)}/10 - Priorité: ${priority} - ${ao.title}`);
    
    return {
      ao: {
        ...ao,
        finalScore: score,
        priority
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
      feasibility: z.object({
        financial: z.boolean(),
        technical: z.boolean(),
        timing: z.boolean(),
        blockers: z.array(z.string()),
        confidence: z.enum(['high', 'medium', 'low'])
      }),
      isFeasible: z.boolean(),
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
  .then(analyzeOneAOFeasibilityStep)
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
      feasibility: z.object({
        financial: z.boolean(),
        technical: z.boolean(),
        timing: z.boolean(),
        blockers: z.array(z.string()),
        confidence: z.enum(['high', 'medium', 'low'])
      }).optional(),
      isFeasible: z.boolean().optional(),
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
    // Critère : etat === 'AVIS_ANNULE'
    // Action : Update DB uniquement, STOP du pipeline
    // Coût LLM : 0
    [
      async ({ inputData }) => {
        const isAnnule = inputData.ao.etat === 'AVIS_ANNULE';
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
    // BRANCH 3 : RECTIFICATIF SUBSTANTIEL
    // ────────────────────────────────────────────────────
    // Critère : _isRectification === true && isSubstantial
    // Action : Pipeline LLM complet avec contexte de comparaison
    // Coût LLM : 2 appels (semantic + feasibility)
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
    // Critère : true (default, tous les autres cas)
    // Action : Pipeline LLM complet standard
    // Coût LLM : 2 appels (semantic + feasibility)
    [
      async ({ inputData }) => {
        console.log(`🔀 Branch 4: NOUVEL AO - ${inputData.ao.title}`);
        return true; // Fallback : tous les autres cas
      },
      analyzeAOCompleteWorkflow
    ]
  ])
  .commit();

// ──────────────────────────────────────────────────
// STEP : AGRÉGATION DES RÉSULTATS APRÈS .foreach()
// ──────────────────────────────────────────────────
// Rôle : Mise en forme et tri uniquement (pas d'intelligence)
// Input : Tableau de { ao, client } depuis .foreach()
// Output : Objet structuré avec catégories et stats
const aggregateResultsStep = createStep({
  id: 'aggregate-results',
  inputSchema: z.array(z.object({
    ao: z.any(), // AO enrichi avec tous les scores
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
    client: clientSchema
  }),
  execute: async ({ inputData }) => {
    console.log(`📊 Agrégation de ${inputData.length} AO traités...`);
    
    // ────────────────────────────────────────────────────────────
    // 1. EXTRACTION : Récupérer tous les AO du tableau
    // ────────────────────────────────────────────────────────────
    const allAOs = inputData.map(item => item.ao);
    
    // ────────────────────────────────────────────────────────────
    // 2. RÉCUPÉRATION DU CLIENT (explicite, pas de getStepResult)
    // ────────────────────────────────────────────────────────────
    const client = inputData.length > 0 
      ? inputData[0].client 
      : null;
    
    if (!client) {
      console.warn('⚠️ Aucun AO à agréger, client introuvable');
      throw new Error('No AO to aggregate, cannot retrieve client');
    }
    
    // ────────────────────────────────────────────────────────────
    // 3. SÉPARATION PAR CATÉGORIE (tri simple, pas d'intelligence)
    // ────────────────────────────────────────────────────────────
    const high = allAOs.filter(ao => ao.priority === 'HIGH');
    const medium = allAOs.filter(ao => ao.priority === 'MEDIUM');
    const low = allAOs.filter(ao => ao.priority === 'LOW');
    const cancelled = allAOs.filter(ao => ao.priority === 'CANCELLED');
    
    // ────────────────────────────────────────────────────────────
    // 4. CALCUL DES STATISTIQUES
    // ────────────────────────────────────────────────────────────
    const total = allAOs.length;
    const cancelledCount = cancelled.length;
    const analysed = total - cancelledCount; // AO qui ont été analysés (pas annulés)
    
    // Calcul du nombre d'appels LLM effectués
    // - Branch 1 (CANCELLED) : 0 appel LLM
    // - Branch 2 (rectificatif mineur) : 0 appel LLM (conserve score original)
    // - Branch 3 (rectificatif substantiel) : 2 appels LLM (semantic + feasibility)
    // - Branch 4 (nouvel AO) : 2 appels LLM (semantic + feasibility)
    // 
    // Les AO avec semanticScore défini ont été analysés par LLM
    const aoWithLLMAnalysis = allAOs.filter(ao => 
      ao.semanticScore !== undefined && 
      ao.semanticScore !== null &&
      ao.priority !== 'CANCELLED'
    );
    const llmCalls = aoWithLLMAnalysis.length * 2; // 2 appels par AO (semantic + feasibility)
    
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
    console.log(`   💰 Appels LLM: ${llmCalls} (${aoWithLLMAnalysis.length} AO × 2)`);
    
    // ────────────────────────────────────────────────────────────
    // 6. RETOUR DE L'OBJET STRUCTURÉ
    // ────────────────────────────────────────────────────────────
    return {
      all: allAOs,
      high,
      medium,
      low,
      cancelled,
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
      client
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
    since: z.string().optional()
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
    const { keywordMatched, client } = inputData;
    
    // Chaque élément du tableau contient l'AO ET le client
    // Le client est dupliqué dans chaque élément car Mastra
    // ne partage pas implicitement le contexte entre itérations
    return keywordMatched.map(ao => ({ 
      ao, 
      client 
    }));
  })
  
  // ═══════════════════════════════════════════════════════
  // PHASE 3 : TRAITEMENT INDIVIDUEL PAR AO (LLM)
  // ═══════════════════════════════════════════════════════
  // Chaque AO est traité individuellement par le workflow imbriqué
  // avec un maximum de 10 AO en parallèle pour contrôler le rate limiting
  .foreach(processOneAOWorkflow, { concurrency: 10 })
  
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
  .commit();
