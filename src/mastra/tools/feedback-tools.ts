/**
 * Feedback Tools for aoFeedbackAgent
 *
 * 6 tools that power the chat-based feedback loop:
 * getAODetails → searchSimilarKeywords / searchRAGChunks → simulateImpact → proposeCorrection → applyCorrection
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { insertAndIndexChunk } from '../../utils/rag-indexer';
import { embedQuery, getVectorStore } from './balthazar-rag-tools';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool 1 — getAODetails
// ─────────────────────────────────────────────────────────────────────────────

export const getAODetails = createTool({
  id: 'getAODetails',
  description:
    "Récupère les détails complets d'un AO et sa trace d'analyse depuis Supabase. Utilise cet outil en premier pour comprendre pourquoi l'AO a reçu cette priorité.",
  inputSchema: z.object({
    source_id: z.string().describe("Identifiant unique de l'AO (ex: 26-30368)"),
  }),
  outputSchema: z.object({
    title: z.string().nullable(),
    description: z.string().nullable(),
    acheteur: z.string().nullable(),
    priority: z.string().nullable(),
    keyword_score: z.number().nullable(),
    semantic_score: z.number().nullable(),
    matched_keywords: z.array(z.string()).nullable(),
    keyword_breakdown: z.any().nullable(),
    semantic_reason: z.string().nullable(),
    human_readable_reason: z.string().nullable(),
    rag_sources_detail: z.any().nullable(),
    decision_gate: z.string().nullable(),
    llm_skipped: z.boolean().nullable(),
    llm_skip_reason: z.string().nullable(),
  }),
  execute: async ({ context }) => {
    const { data } = await supabase
      .from('appels_offres')
      .select(`
        title, description, acheteur, priority,
        keyword_score, semantic_score, matched_keywords,
        keyword_breakdown, semantic_reason, human_readable_reason,
        rag_sources_detail, decision_gate, llm_skipped, llm_skip_reason
      `)
      .eq('source_id', context.source_id)
      .single();

    return data ?? {};
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool 2 — searchSimilarKeywords
// ─────────────────────────────────────────────────────────────────────────────

export const searchSimilarKeywords = createTool({
  id: 'searchSimilarKeywords',
  description:
    'Vérifie si un keyword ou une règle similaire existe déjà dans les overrides actifs ou les red flags statiques. Utilise cet outil avant de proposer une correction pour éviter les doublons.',
  inputSchema: z.object({
    term: z.string().describe('Terme à rechercher (ex: transport scolaire, accompagnement RH)'),
    client_id: z.string().default('balthazar'),
  }),
  outputSchema: z.object({
    existing_overrides: z.array(
      z.object({
        value: z.string(),
        type: z.string(),
        reason: z.string().nullable(),
      }),
    ),
    has_conflict: z.boolean(),
    conflict_detail: z.string().nullable(),
  }),
  execute: async ({ context }) => {
    const { data } = await supabase
      .from('keyword_overrides')
      .select('value, type, reason')
      .eq('client_id', context.client_id)
      .eq('active', true)
      .ilike('value', `%${context.term}%`);

    const overrides = data ?? [];

    return {
      existing_overrides: overrides,
      has_conflict: overrides.length > 0,
      conflict_detail:
        overrides.length > 0
          ? `Règle similaire déjà active : "${overrides[0].value}" (${overrides[0].type})`
          : null,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool 3 — searchRAGChunks (policies index, same mechanism as balthazarPoliciesQueryTool)
// ─────────────────────────────────────────────────────────────────────────────

const policiesFilterTypeEnum = z.enum([
  'sector_definition',
  'mandate_type',
  'exclusion_rule',
  'conditional_rule',
  'priority_rule',
  'disambiguation_rule',
]);

export const searchRAGChunks = createTool({
  id: 'searchRAGChunks',
  description:
    "Recherche sémantique dans le corpus RAG policies (pgvector, index « policies »). À utiliser avant de proposer un nouveau chunk pour vérifier les règles ou formulations déjà présentes et éviter les doublons.",
  inputSchema: z.object({
    query: z.string().describe('Requête sémantique (sujet de la règle, mots-clés, contexte métier)'),
    filter_type: policiesFilterTypeEnum
      .optional()
      .nullable()
      .describe(
        'Filtre optionnel sur metadata.type (même schéma que l’index policies). Omettre pour chercher dans tout le corpus.',
      ),
    topK: z
      .number()
      .optional()
      .default(5)
      .describe('Nombre de chunks à retourner (défaut 5)'),
  }),
  execute: async ({ context }) => {
    const { query, filter_type, topK } = context;

    try {
      const queryVector = await embedQuery(query);
      const store = getVectorStore();

      const results = await store.query({
        indexName: 'policies',
        queryVector,
        topK,
        filter: filter_type ? { type: { $eq: filter_type } } : undefined,
        includeVector: false,
      });

      const chunks = results.map(r => ({
        chunk_id: (r.metadata?.chunk_id as string) || r.id,
        score: r.score ?? 0,
        text: (r.metadata?.text as string) || '',
        metadata: r.metadata || {},
      }));

      return {
        status: 'ok' as const,
        query,
        chunks,
        count: chunks.length,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[searchRAGChunks] store.query failed:', message);
      return {
        status: 'error' as const,
        query,
        error: message,
        chunks: [] as Array<{
          chunk_id: string;
          score: number;
          text: string;
          metadata: Record<string, unknown>;
        }>,
        count: 0,
      };
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool 4 — proposeCorrection
// ─────────────────────────────────────────────────────────────────────────────

export const proposeCorrection = createTool({
  id: 'proposeCorrection',
  description:
    "Enregistre une proposition de correction dans la base de données. Utilise cet outil après avoir diagnostiqué le problème et formulé une correction précise. La correction ne sera PAS appliquée tant que l'utilisateur n'a pas confirmé.",
  inputSchema: z.object({
    source_id: z.string(),
    client_id: z.string().default('balthazar'),
    correction_type: z
      .enum(['keyword_red_flag', 'rag_chunk'])
      .describe(
        'keyword_red_flag: ajouter un red flag qui exclura les AOs similaires. rag_chunk: ajouter une règle métier dans le corpus RAG.',
      ),
    value: z
      .string()
      .describe(
        'Pour keyword_red_flag: le terme exact à exclure. Pour rag_chunk: le titre du nouveau chunk.',
      ),
    chunk_content: z
      .string()
      .optional()
      .describe('Contenu du chunk RAG (uniquement pour correction_type=rag_chunk)'),
    diagnosis_fr: z.string().describe("Explication en français de pourquoi l'AO a passé le filtre"),
    proposal_fr: z.string().describe('Description en français de ce qui sera modifié'),
    impact_fr: z.string().describe("Impact attendu en une phrase (ex: à partir de demain, les AOs sur X seront exclus)"),
    user_reason: z.string().describe("Raison fournie par l'utilisateur"),
  }),
  outputSchema: z.object({
    feedback_id: z.string(),
    proposal_summary: z.string(),
  }),
  execute: async ({ context }) => {
    const { data } = await supabase
      .from('ao_feedback')
      .insert({
        source_id: context.source_id,
        client_id: context.client_id,
        feedback: 'not_relevant',
        reason: context.user_reason,
        correction_type: context.correction_type,
        correction_value: context.value,
        chunk_content: context.chunk_content ?? null,
        agent_diagnosis: context.diagnosis_fr,
        agent_proposal: context.proposal_fr,
        status: 'agent_proposed',
      })
      .select()
      .single();

    return {
      feedback_id: data?.id ?? '',
      proposal_summary: `${context.proposal_fr} — ${context.impact_fr}`,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool 5 — simulateImpact
// ─────────────────────────────────────────────────────────────────────────────

export const simulateImpact = createTool({
  id: 'simulateImpact',
  description: `Simule l'impact d'un nouveau red flag sur les AOs récents.
Appelle cet outil APRÈS les questions de clarification et AVANT proposeCorrection.
Retourne deux catégories : AOs correctement exclus (LOW) et AOs potentiellement exclus à tort (HIGH/MEDIUM).
Présente le résultat à l'utilisateur avant de continuer.`,
  inputSchema: z.object({
    term: z.string().describe("Terme à tester comme red flag (ex: 'stratégie achats')"),
    days_back: z.number().default(30).describe('Fenêtre temporelle en jours (défaut: 30)'),
  }),
  outputSchema: z.object({
    total_affected: z.number(),
    correctly_excluded: z.array(z.object({
      source_id: z.string(),
      title: z.string(),
      priority: z.string().nullable(),
      reason: z.string(),
    })),
    potentially_wrong: z.array(z.object({
      source_id: z.string(),
      title: z.string(),
      priority: z.string().nullable(),
      reason: z.string(),
    })),
    summary: z.string(),
  }),
  execute: async ({ context }) => {
    const since = new Date();
    since.setDate(since.getDate() - context.days_back);

    const { data } = await supabase
      .from('appels_offres')
      .select('source_id, title, priority')
      .gte('analyzed_at', since.toISOString())
      .or(`title.ilike.%${context.term}%,description.ilike.%${context.term}%`);

    const affected = data ?? [];

    const correctly_excluded = affected
      .filter(ao => ao.priority === 'LOW' || ao.priority === null)
      .map(ao => ({
        source_id: ao.source_id,
        title: ao.title,
        priority: ao.priority,
        reason: "AO déjà classé LOW — l'exclusion ne change rien de visible",
      }));

    const potentially_wrong = affected
      .filter(ao => ao.priority === 'HIGH' || ao.priority === 'MEDIUM')
      .map(ao => ({
        source_id: ao.source_id,
        title: ao.title,
        priority: ao.priority,
        reason: `AO classé ${ao.priority} — à vérifier avant de confirmer l'exclusion`,
      }));

    const summaryLines: string[] = [`${affected.length} AO(s) affecté(s) sur les ${context.days_back} derniers jours.`];
    if (correctly_excluded.length > 0) {
      summaryLines.push(`✅ ${correctly_excluded.length} correctement exclus (déjà LOW).`);
    }
    if (potentially_wrong.length > 0) {
      summaryLines.push(`⚠️ ${potentially_wrong.length} à vérifier (HIGH/MEDIUM) : ${potentially_wrong.map(a => `"${a.title}"`).join(', ')}.`);
    }

    return {
      total_affected: affected.length,
      correctly_excluded,
      potentially_wrong,
      summary: summaryLines.join(' '),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool 6 — applyCorrection
// ─────────────────────────────────────────────────────────────────────────────

export const applyCorrection = createTool({
  id: 'applyCorrection',
  description:
    "Applique une correction après confirmation explicite de l'utilisateur. Ne jamais appeler cet outil sans que l'utilisateur ait dit oui, confirme, ou un équivalent explicite.",
  inputSchema: z.object({
    feedback_id: z.string().describe('ID du feedback retourné par proposeCorrection'),
    approved: z.boolean().describe("true si l'utilisateur a confirmé, false si refus"),
  }),
  outputSchema: z.object({
    applied: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    if (!context.approved) {
      await supabase
        .from('ao_feedback')
        .update({ status: 'rejected' })
        .eq('id', context.feedback_id);

      return { applied: false, message: 'Correction refusée. Aucun changement effectué.' };
    }

    const { data: feedback } = await supabase
      .from('ao_feedback')
      .select('*')
      .eq('id', context.feedback_id)
      .single();

    if (!feedback) {
      return { applied: false, message: 'Feedback introuvable.' };
    }

    if (feedback.correction_type === 'keyword_red_flag') {
      await supabase.from('keyword_overrides').insert({
        client_id: feedback.client_id,
        type: 'red_flag',
        value: feedback.correction_value,
        reason: feedback.reason,
        feedback_id: feedback.id,
        active: true,
      });
    }

    if (feedback.correction_type === 'rag_chunk') {
      await insertAndIndexChunk({
        indexName: 'policies',
        text: feedback.chunk_content ?? feedback.agent_proposal,
        metadata: {
          chunk_id: `feedback_${feedback.id}`,
          chunk_type: 'user_feedback',
          source_id: feedback.source_id,
          client_id: feedback.client_id,
          title: feedback.correction_value,
        },
      });
    }

    await supabase
      .from('ao_feedback')
      .update({ status: 'applied', processed_at: new Date().toISOString() })
      .eq('id', context.feedback_id);

    return {
      applied: true,
      message: "✅ Correction appliquée. Elle sera active dès le prochain run d'analyse (demain matin à 6h).",
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool 7 — deactivateOverride
// ─────────────────────────────────────────────────────────────────────────────

export const deactivateOverride = createTool({
  id: 'deactivateOverride',
  description: `Désactive un keyword override existant dans keyword_overrides.
Utilise cet outil quand l'utilisateur signale qu'une règle précédemment ajoutée exclut des AOs qui devraient passer.
La règle est désactivée (active=false) mais conservée pour l'audit.`,
  inputSchema: z.object({
    override_id: z.string().optional().describe("UUID de l'override à désactiver"),
    value: z.string().optional().describe("Valeur du keyword à désactiver si pas d'ID"),
    client_id: z.string().default('balthazar'),
    reason: z.string().describe('Pourquoi on désactive cette règle'),
  }),
  outputSchema: z.object({
    deactivated: z.boolean(),
    message: z.string(),
    affected_rule: z.object({
      value: z.string(),
      type: z.string(),
    }).nullable(),
  }),
  execute: async ({ context }) => {
    if (!context.override_id && !context.value) {
      return { deactivated: false, message: 'Fournir override_id ou value.', affected_rule: null };
    }

    let query = supabase
      .from('keyword_overrides')
      .update({ active: false })
      .eq('client_id', context.client_id)
      .eq('active', true);

    if (context.override_id) {
      query = query.eq('id', context.override_id);
    } else {
      query = query.ilike('value', `%${context.value}%`);
    }

    const { data, error } = await query.select().single();

    if (error || !data) {
      return { deactivated: false, message: 'Override non trouvé ou déjà inactif.', affected_rule: null };
    }

    return {
      deactivated: true,
      message: `Règle "${data.value}" désactivée. Elle ne s'appliquera plus dès le prochain run.`,
      affected_rule: { value: data.value, type: data.type },
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool 8 — listActiveOverrides
// ─────────────────────────────────────────────────────────────────────────────

export const listActiveOverrides = createTool({
  id: 'listActiveOverrides',
  description: `Liste toutes les règles de filtrage actives (keyword overrides).
Utilise cet outil quand l'utilisateur demande à voir les règles existantes,
ou quand tu suspectes qu'une règle précédente cause des effets de bord.`,
  inputSchema: z.object({
    client_id: z.string().default('balthazar'),
    type: z.enum(['red_flag', 'required_keyword', 'all']).default('all'),
  }),
  outputSchema: z.object({
    overrides: z.array(z.object({
      id: z.string(),
      type: z.string(),
      value: z.string(),
      reason: z.string().nullable(),
      created_at: z.string(),
    })),
    total: z.number(),
    summary: z.string(),
  }),
  execute: async ({ context }) => {
    let query = supabase
      .from('keyword_overrides')
      .select('id, type, value, reason, created_at')
      .eq('client_id', context.client_id)
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (context.type !== 'all') {
      query = query.eq('type', context.type);
    }

    const { data } = await query;
    const overrides = data ?? [];

    const summary = overrides.length === 0
      ? 'Aucune règle personnalisée active pour le moment.'
      : overrides.map((o, i) =>
          `${i + 1}. [${o.type}] "${o.value}" — ${o.reason ?? 'aucune raison documentée'}`
        ).join('\n');

    return {
      overrides,
      total: overrides.length,
      summary: `${overrides.length} règle(s) active(s) :\n${summary}`,
    };
  },
});
