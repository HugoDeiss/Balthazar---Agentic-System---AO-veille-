import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { boampFetcherTool } from '../tools/boamp-fetcher';

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
// STEP 1: COLLECTE + PRÉ-QUALIFICATION (gratuit)
// ──────────────────────────────────────────────────
const fetchAndPrequalifyStep = createStep({
  id: 'fetch-and-prequalify',
  inputSchema: z.object({
    clientId: z.string(),
    since: z.string()
  }),
  outputSchema: z.object({
    prequalified: z.array(aoSchema),
    client: clientSchema
  }),
  execute: async ({ inputData, runtimeContext }) => {
    const client = await getClient(inputData.clientId);
    
    // 1️⃣ Fetch BOAMP
    const boampData = await boampFetcherTool.execute!({
      context: {
        since: inputData.since,
        typeMarche: client.preferences.typeMarche,
        limit: 100
      },
      runtimeContext
    }) as {
      source: string;
      query: any;
      total_count: number;
      fetched: number;
      records: any[];
    };
    
    // 2️⃣ Pré-qualification (rules-based)
    const prequalified = boampData.records.filter((ao: any) => {
      return (
        // Éviter les AO annulés
        ao.etat !== 'AVIS_ANNULE' &&
        
        // Vérifier pas d'attribution (sécurité)
        ao.titulaire === null &&
        
        // Budget
        (ao.budget_max || 0) >= client.criteria.minBudget &&
        
        // Deadline
        new Date(ao.deadline) > addDays(new Date(), 7) &&
        
        // Région (optionnel)
        (!client.criteria.regions || 
        client.criteria.regions.includes(ao.region))
      );
    });
    
    console.log(`✅ Pré-qualification: ${prequalified.length}/${boampData.records.length} AO`);
    
    return { prequalified, client };
  }
});

// ──────────────────────────────────────────────────
// STEP 2a: MATCHING MOTS-CLÉS (gratuit)
// ──────────────────────────────────────────────────
const keywordMatchingStep = createStep({
  id: 'keyword-matching',
  inputSchema: z.object({
    prequalified: z.array(aoSchema),
    client: clientSchema
  }),
  outputSchema: z.object({
    keywordMatched: z.array(aoSchema.extend({
      keywordScore: z.number(),
      matchedKeywords: z.array(z.string())
    })),
    client: clientSchema
  }),
  execute: async ({ inputData }) => {
    const { prequalified, client } = inputData;
    
    const keywordMatched = prequalified.map(ao => {
      const aoKeywords = [
        ...(ao.keywords || []),
        ao.title.toLowerCase(),
        ao.description?.toLowerCase() || ''
      ].join(' ');
      
      // Compte combien de keywords client matchent
      const matchCount = client.keywords.filter(kw => 
        aoKeywords.includes(kw.toLowerCase())
      ).length;
      
      const keywordScore = matchCount / client.keywords.length;
      
      // Analyse des critères d'attribution pour scorer la compétitivité
      // Ex: "60% qualité technique, 40% prix"
      const criteres = ao.raw_json?.criteres || null;
      
      return {
        ...ao,
        keywordScore,
        matchedKeywords: client.keywords.filter(kw => 
          aoKeywords.includes(kw.toLowerCase())
        ),
        criteresAttribution: criteres
      };
    })
    .filter(ao => ao.keywordScore >= 0.3) // Seuil 30%
    .sort((a, b) => b.keywordScore - a.keywordScore);
    
    console.log(`✅ Keyword matching: ${keywordMatched.length}/${prequalified.length} AO`);
    
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
    
    const balthazarAgent = mastra?.getAgent('balthazar');
    if (!balthazarAgent) {
      throw new Error('Agent balthazar not found');
    }
    
    const semanticAnalyzed = await Promise.all(
      keywordMatched.map(async (ao) => {
        // Context procédure pour le LLM
        const procedureContext = `
          Type de procédure: ${ao.raw_json?.procedure_libelle || 'Non spécifié'}
          // AO ouvert = accessible à tous
          // AO restreint = sur présélection
          // Dialogue compétitif = négociation
        `;
        
        const analysis = await balthazarAgent.generate([
          {
            role: 'user',
            content: `
              Profil client:
              ${JSON.stringify(client.profile, null, 2)}
              
              Appel d'offres:
              - Titre: ${ao.title}
              - Description: ${ao.description}
              - Mots-clés: ${ao.keywords?.join(', ')}
              - Acheteur: ${ao.acheteur}
              
              Context procédure:
              ${procedureContext}
              
              Question: Sur une échelle de 0 à 10, quelle est la pertinence de cet AO pour ce client ?
              Prends en compte le type de procédure (un AO ouvert est plus accessible qu'un AO restreint).
              
              Réponds UNIQUEMENT en JSON:
              {
                "score": <number 0-10>,
                "reason": "<justification en 1-2 phrases>"
              }
            `
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
    
    console.log(`✅ Analyse sémantique: ${relevant.length}/${keywordMatched.length} AO`);
    
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
    
    const balthazarAgent = mastra?.getAgent('balthazar');
    if (!balthazarAgent) {
      throw new Error('Agent balthazar not found');
    }
    
    const feasibilityAnalyzed = await Promise.all(
      relevant.map(async (ao) => {
        // Parse les critères depuis le JSON "donnees" (gestion d'erreur robuste)
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
        
        // Vérifier si l'AO a été modifié (correctif publié)
        if (ao.raw_json?.annonce_lie) {
          warnings.push("⚠️ Cet AO a fait l'objet d'un correctif");
          additionalContext += `\nAnnonce liée (correctif): ${ao.raw_json.annonce_lie}`;
        }
        
        // Identifier les renouvellements de marché
        if (ao.raw_json?.annonces_anterieures) {
          additionalContext += '\nRenouvellement d\'un marché existant - peut être plus facile à gagner si on connaît l\'historique';
          warnings.push("ℹ️ Renouvellement de marché existant");
        }
        
        const analysis = await balthazarAgent.generate([
          {
            role: 'user',
            content: `
              Profil client:
              - CA annuel: ${client.financial.revenue}€
              - Effectif: ${client.financial.employees} personnes
              - Années d'expérience: ${client.financial.yearsInBusiness}
              - Références similaires: ${client.technical.references} projets
              
              Critères AO:
              ${JSON.stringify(criteres, null, 2)}
              
              Délai restant: ${getDaysRemaining(ao.deadline || '')} jours
              ${additionalContext}
              
              Questions:
              1. Le client respecte-t-il les critères financiers ?
              2. Le client respecte-t-il les critères techniques ?
              3. Le délai est-il réaliste pour préparer une réponse ?
              
              Réponds UNIQUEMENT en JSON:
              {
                "financial": <boolean>,
                "technical": <boolean>,
                "timing": <boolean>,
                "blockers": [<liste des blockers si applicable>],
                "confidence": <"high"|"medium"|"low">
              }
            `
          }
        ]);
        
        const feasibility = JSON.parse(analysis.text);
        
        return {
          ...ao,
          feasibility,
          isFeasible: feasibility.financial && feasibility.technical && feasibility.timing,
          warnings,
          hasCorrectif: !!ao.raw_json?.annonce_lie,
          isRenewal: !!ao.raw_json?.annonces_anterieures
        };
      })
    );
    
    const feasible = feasibilityAnalyzed.filter(ao => ao.isFeasible);
    
    console.log(`✅ Analyse faisabilité: ${feasible.length}/${relevant.length} AO`);
    
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
    since: z.string()
  }),
  outputSchema: z.object({
    saved: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number()
  })
})
  .then(fetchAndPrequalifyStep)
  .then(keywordMatchingStep)
  .then(semanticAnalysisStep)
  .then(feasibilityAnalysisStep)
  .then(scoringStep)
  .then(saveResultsStep)
  .commit();
