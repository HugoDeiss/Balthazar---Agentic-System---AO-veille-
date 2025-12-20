import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { boampFetcherTool } from '../tools/boamp-fetcher';
import {
  isRectification,
  findOriginalAO,
  detectSubstantialChanges,
  formatChangesForEmail
} from './rectificatif-utils';

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

/** Ajoute N jours à une date */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Calcule le nombre de jours restants avant une deadline */
function getDaysRemaining(deadline: string): number {
  const deadlineDate = new Date(deadline);
  const today = new Date();
  const diffTime = deadlineDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/** Formate une date en français */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
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
  execute: async ({ inputData, runtimeContext }) => {
    const client = await getClient(inputData.clientId);
    
    // 1️⃣ Fetch BOAMP (filtrage structurel côté API)
    const boampData = await boampFetcherTool.execute!({
      context: {
        since: inputData.since, // Optionnel, default = veille
        typeMarche: client.preferences.typeMarche
        // limit est maintenant par défaut à 500 dans le tool
      },
      runtimeContext
    }) as {
      source: string;
      query: any;
      total_count: number;
      fetched: number;
      records: any[];
    };
    
    console.log(`📥 BOAMP Fetch: ${boampData.records.length} AO récupérés`);
    console.log(`📊 Total disponible: ${boampData.total_count}`);
    console.log(`📅 Date cible: ${boampData.query.since}`);
    
    // 2️⃣ PASSTHROUGH : Tous les AO passent (filtrage métier = IA)
    const prequalified = boampData.records;
    
    console.log(`✅ Collecte: ${prequalified.length} AO transmis à l'analyse`);
    
    return { prequalified, client };
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
// STEP 2b: ANALYSE SÉMANTIQUE (LLM - 1 appel/AO)
// ──────────────────────────────────────────────────
const semanticAnalysisStep = createStep({
  id: 'semantic-analysis',
  inputSchema: z.object({
    keywordMatched: z.array(aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string())
    })),
    client: clientSchema
  }),
  outputSchema: z.object({
    relevant: z.array(aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      semanticScore: z.number(),
      semanticReason: z.string()
    })),
    client: clientSchema
  }),
  execute: async ({ inputData, mastra }) => {
    const { keywordMatched, client } = inputData;
    
    // 🆕 Utilisation de l'agent spécialisé boampSemanticAnalyzer
    const semanticAgent = mastra?.getAgent('boampSemanticAnalyzer');
    if (!semanticAgent) {
      throw new Error('Agent boampSemanticAnalyzer not found');
    }
    
    const semanticAnalyzed = await Promise.all(
      keywordMatched.map(async (ao) => {
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
- Signaux détectés: ${ao.keywordSignals ? Object.entries(ao.keywordSignals).filter(([_, v]) => v).map(([k]) => k).join(', ') || 'Aucun' : 'N/A'}

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
        
        return {
          ...ao,
          semanticScore: result.score,
          semanticReason: result.reason,
          procedureType: ao.raw_json?.procedure_libelle || null
        };
      })
    );
    
    // Garde seulement score ≥ 6
    const relevant = semanticAnalyzed.filter(ao => ao.semanticScore >= 6);
    
    console.log(`✅ Analyse sémantique (boampSemanticAnalyzer): ${relevant.length}/${keywordMatched.length} AO`);
    
    return { relevant, client };
  }
});

// ──────────────────────────────────────────────────
// STEP 3: ANALYSE FAISABILITÉ (LLM - 1 appel/AO)
// ──────────────────────────────────────────────────
const feasibilityAnalysisStep = createStep({
  id: 'feasibility-analysis',
  inputSchema: z.object({
    relevant: z.array(aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string()),
      semanticScore: z.number(),
      semanticReason: z.string()
    })),
    client: clientSchema
  }),
  outputSchema: z.object({
    feasible: z.array(aoSchema.extend({
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
      isFeasible: z.boolean()
    })),
    client: clientSchema
  }),
  execute: async ({ inputData, mastra }) => {
    const { relevant, client } = inputData;
    
    // 🆕 Utilisation de l'agent spécialisé boampFeasibilityAnalyzer
    const feasibilityAgent = mastra?.getAgent('boampFeasibilityAnalyzer');
    if (!feasibilityAgent) {
      throw new Error('Agent boampFeasibilityAnalyzer not found');
    }
    
    const feasibilityAnalyzed = await Promise.all(
      relevant.map(async (ao) => {
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
        
        return {
          ...ao,
          feasibility,
          isFeasible: feasibility.financial && feasibility.technical && feasibility.timing,
          warnings,
          daysRemaining,
          hasCorrectif: !!ao.raw_json?.annonce_lie,
          isRenewal: !!ao.raw_json?.annonces_anterieures
        };
      })
    );
    
    const feasible = feasibilityAnalyzed.filter(ao => ao.isFeasible);
    
    console.log(`✅ Analyse faisabilité (boampFeasibilityAnalyzer): ${feasible.length}/${relevant.length} AO`);
    
    return { feasible, client };
  }
});

// ──────────────────────────────────────────────────
// STEP 4: SCORING + PRIORISATION (gratuit)
// ──────────────────────────────────────────────────
const scoringStep = createStep({
  id: 'scoring',
  inputSchema: z.object({
    feasible: z.array(aoSchema.extend({
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
      isFeasible: z.boolean()
    })),
    client: clientSchema
  }),
  outputSchema: z.object({
    scored: z.array(aoSchema.extend({
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
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW'])
    })),
    client: clientSchema
  }),
  execute: async ({ inputData }) => {
    const { feasible, client } = inputData;
    
    const scored = feasible.map(ao => {
      const daysRemaining = getDaysRemaining(ao.deadline || '');
      
      // Calcul score global (0-10)
      const score = (
        ao.semanticScore * 0.4 +              // Pertinence: 40%
        (ao.keywordScore * 10) * 0.2 +        // Keywords: 20%
        (ao.feasibility.confidence === 'high' ? 10 : 
         ao.feasibility.confidence === 'medium' ? 7 : 4) * 0.3 + // Faisabilité: 30%
        (1 - Math.min(daysRemaining / 60, 1)) * 10 * 0.1  // Urgence: 10%
      );
      
      // Priorisation
      const priority: 'HIGH' | 'MEDIUM' | 'LOW' = 
        score >= 8 ? 'HIGH' :
        score >= 6 ? 'MEDIUM' : 'LOW';
      
      return {
        ...ao,
        finalScore: score,
        priority
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
    
    console.log(`✅ Scoring: ${scored.filter(a => a.priority === 'HIGH').length} HIGH, ${scored.filter(a => a.priority === 'MEDIUM').length} MEDIUM`);
    
    return { scored, client };
  }
});

// ──────────────────────────────────────────────────
// STEP 5: SAUVEGARDE RÉSULTATS
// ──────────────────────────────────────────────────
const saveResultsStep = createStep({
  id: 'save-results',
  inputSchema: z.object({
    scored: z.array(z.any()),
    client: clientSchema
  }),
  outputSchema: z.object({
    saved: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number()
  }),
  execute: async ({ inputData }) => {
    const { scored, client } = inputData;
    
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
    
    const high = scored.filter(a => a.priority === 'HIGH').length;
    const medium = scored.filter(a => a.priority === 'MEDIUM').length;
    const low = scored.filter(a => a.priority === 'LOW').length;
    
    console.log(`✅ Sauvegarde: ${scored.length} AO (${high} HIGH, ${medium} MEDIUM, ${low} LOW)`);
    
    return {
      saved: scored.length,
      high,
      medium,
      low
    };
  }
});

// ──────────────────────────────────────────────────
// WORKFLOW
// ──────────────────────────────────────────────────
export const aoVeilleWorkflow = createWorkflow({
  id: 'ao-veille-workflow',
  inputSchema: z.object({
    clientId: z.string(),
    since: z.string().optional()
  }),
  outputSchema: z.object({
    saved: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number()
  })
})
  .then(fetchAndPrequalifyStep)
  .then(handleCancellationsStep)      // 🆕 STEP 1b: Gestion annulations
  .then(detectRectificationStep)      // 🆕 STEP 1c: Détection rectificatifs
  .then(keywordMatchingStep)
  .then(semanticAnalysisStep)
  .then(feasibilityAnalysisStep)
  .then(scoringStep)
  .then(saveResultsStep)
  .commit();
