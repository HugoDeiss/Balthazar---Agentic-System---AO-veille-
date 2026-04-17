/**
 * Feedback Tools for aoFeedbackAgent
 *
 * 8 tools that power the chat-based feedback loop:
 * getAODetails → searchSimilarKeywords / searchRAGChunks → simulateImpact → proposeCorrection → applyCorrection
 *
 * ## ao_feedback state machine
 *
 * CHAT path (this file — used by aoFeedbackSupervisor / aoCorrectionAgent):
 *   source='chat' | agent_proposed (proposeCorrection) →
 *     applied (applyCorrection, approved=true) | rejected (applyCorrection, approved=false)
 *
 * EMAIL path (feedback-workflow.ts — triggered via Inngest event ao.feedback.submitted):
 *   source='email' | draft (handleFeedbackSubmit) →
 *     agent_proposed (workflow step agent-propose) →
 *     awaiting_confirm (workflow step user-confirm, email sent) →
 *     applied (apply-correction, confirmed) | rejected (apply-correction, refused)
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { insertAndIndexChunk } from '../../utils/rag-indexer';
import { embedQuery, getVectorStore } from './balthazar-rag-tools';
import { balthazarLexicon, normalizeText } from '../../utils/balthazar-keywords';
import { aoFeedbackTuningAgent, feedbackProposalSchema } from '../agents/ao-feedback-tuning-agent';

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
    final_score: z.number().nullable(),
    confidence_decision: z.string().nullable(),
    matched_keywords: z.array(z.string()).nullable(),
    matched_keywords_detail: z.any().nullable(),
    keyword_breakdown: z.any().nullable(),
    semantic_reason: z.string().nullable(),
    rejet_raison: z.string().nullable(),
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
        keyword_score, semantic_score, final_score, confidence_decision,
        matched_keywords, matched_keywords_detail,
        keyword_breakdown, semantic_reason, rejet_raison, human_readable_reason,
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
        source: 'chat',
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

// ─────────────────────────────────────────────────────────────────────────────
// Tool 9 — getKeywordCategory
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, { label: string; description: string }> = {
  // Secteurs
  mobilite: { label: 'Secteur — Mobilité & Transport', description: 'Opérateurs de transport, mobilité urbaine, infrastructure ferroviaire, routière, covoiturage, mobilité douce.' },
  assurance: { label: 'Secteur — Assurance & Protection sociale', description: 'Assureurs, mutuelles, organismes de protection sociale, prévoyance, santé.' },
  energie: { label: 'Secteur — Énergie & Transition énergétique', description: 'Producteurs et gestionnaires d\'énergie, transition énergétique, décarbonation, renouvelables.' },
  service_public: { label: 'Secteur — Service public & Collectivités', description: 'Collectivités territoriales, établissements publics, opérateurs publics.' },
  entreprise_mission: { label: 'Secteur — Entreprise à mission (cœur métier)', description: 'Sociétés à mission, raison d\'être, B Corp, impact sociétal. Pondération renforcée (weight 4).' },
  // Expertises
  strategie: { label: 'Expertise — Stratégie', description: 'Plans stratégiques, business model, feuille de route, diagnostic stratégique.' },
  conseil: { label: 'Expertise — Conseil & Consulting', description: 'Prestations de conseil, cabinet de conseil, conseil en stratégie/transformation/organisation.' },
  transformation: { label: 'Expertise — Transformation', description: 'Conduite du changement, transformation digitale, modernisation, agilité, culture d\'entreprise.' },
  raison_etre: { label: 'Expertise — Raison d\'être', description: 'Passage en société à mission, raison d\'être, purpose.' },
  gouvernance: { label: 'Expertise — Gouvernance & Management', description: 'Codir, Comex, direction générale, gouvernance, organigramme, processus décisionnel.' },
  rse: { label: 'Expertise — RSE & Développement durable', description: 'Responsabilité sociétale, ESG, bilan carbone, transition écologique, CSRD.' },
  experience_usager: { label: 'Expertise — Expérience usager/client', description: 'Parcours usager, satisfaction, relation client, NPS.' },
  strategie_developpement: { label: 'Expertise — Stratégie de développement', description: 'Croissance externe, M&A, innovation, business plan, analyse de marché.' },
  strategie_transformation: { label: 'Expertise — Stratégie de transformation', description: 'Programme de transformation, modèle opérationnel cible, IA stratégique, roadmap.' },
  strategie_responsable: { label: 'Expertise — Stratégie responsable', description: 'CSRD, feuille de route RSE, convention entreprises climat, parties prenantes.' },
  strategie_mobilisation: { label: 'Expertise — Stratégie de mobilisation', description: 'Projet d\'entreprise, mobilisation parties prenantes, séminaires stratégiques, post-fusion.' },
  // Posture
  posture: { label: 'Posture d\'intervention', description: 'Diagnostic, ateliers, co-construction, facilitation, séminaire, accompagnement stratégique.' },
  // Red flags
  red_flags: { label: 'Red flag (signal d\'exclusion)', description: 'Keyword signalant que l\'AO est probablement hors périmètre Balthazar (travaux, IT, formation catalogue, etc.).' },
};

export const getKeywordCategory = createTool({
  id: 'getKeywordCategory',
  description: `Identifie dans quelle catégorie du système de scoring un keyword donné a été classé, et explique pourquoi cette catégorie est pertinente (ou non) pour Balthazar.
Utilise cet outil quand l'utilisateur questionne un keyword spécifique détecté dans un AO.`,
  inputSchema: z.object({
    keyword: z.string().describe('Le mot-clé à analyser (ex: "vélo", "stratégie", "développement durable")'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    keyword: z.string(),
    matches: z.array(z.object({
      category_key: z.string(),
      category_label: z.string(),
      category_description: z.string(),
      weight: z.number(),
      is_red_flag: z.boolean(),
    })),
    summary: z.string(),
  }),
  execute: async ({ context }) => {
    const normalized = normalizeText(context.keyword);
    const matches: Array<{ category_key: string; category_label: string; category_description: string; weight: number; is_red_flag: boolean }> = [];

    // Word-boundary match: queried word must appear as a whole word in the lexicon phrase,
    // not as a substring of another word (e.g. "velo" must NOT match "developpement").
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordBoundaryRe = new RegExp(`\\b${escaped}\\b`);
    const kwMatches = (kw: string): boolean => {
      const kwNorm = normalizeText(kw);
      return kwNorm === normalized || wordBoundaryRe.test(kwNorm) || normalized.includes(kwNorm);
    };

    // Search in secteurs
    for (const [key, config] of Object.entries(balthazarLexicon.secteurs)) {
      const found = config.keywords.some(kwMatches);
      const patternMatch = config.patterns.some(p => p.test(context.keyword));
      if (found || patternMatch) {
        const meta = CATEGORY_LABELS[key] ?? { label: key, description: '' };
        matches.push({ category_key: key, category_label: meta.label, category_description: meta.description, weight: config.weight, is_red_flag: false });
      }
    }

    // Search in expertises
    for (const [key, config] of Object.entries(balthazarLexicon.expertises)) {
      const found = config.keywords.some(kwMatches);
      const patternMatch = config.patterns.some(p => p.test(context.keyword));
      if (found || patternMatch) {
        const meta = CATEGORY_LABELS[key] ?? { label: key, description: '' };
        matches.push({ category_key: key, category_label: meta.label, category_description: meta.description, weight: config.weight, is_red_flag: false });
      }
    }

    // Search in posture
    const postureFound = balthazarLexicon.posture.keywords.some(kwMatches);
    const posturePattern = balthazarLexicon.posture.patterns.some(p => p.test(context.keyword));
    if (postureFound || posturePattern) {
      const meta = CATEGORY_LABELS['posture'] ?? { label: 'posture', description: '' };
      matches.push({ category_key: 'posture', category_label: meta.label, category_description: meta.description, weight: balthazarLexicon.posture.weight, is_red_flag: false });
    }

    // Search in red_flags
    const rfFound = balthazarLexicon.red_flags.keywords.some(kwMatches);
    const rfPattern = balthazarLexicon.red_flags.patterns.some(p => p.test(context.keyword));
    if (rfFound || rfPattern) {
      const meta = CATEGORY_LABELS['red_flags'] ?? { label: 'red_flags', description: '' };
      matches.push({ category_key: 'red_flags', category_label: meta.label, category_description: meta.description, weight: 0, is_red_flag: true });
    }

    const positiveMatches = matches.filter(m => !m.is_red_flag);
    const redFlagMatch = matches.find(m => m.is_red_flag);
    let summary: string;
    if (matches.length === 0) {
      summary = `"${context.keyword}" n'est pas dans le lexique Balthazar. Il a peut-être matché via un pattern regex ou c'est un faux positif à investiguer.`;
    } else if (redFlagMatch && positiveMatches.length === 0) {
      summary = `"${context.keyword}" est un red flag : ${redFlagMatch.category_description} Il signale que l'AO est probablement hors périmètre Balthazar.`;
    } else if (redFlagMatch && positiveMatches.length > 0) {
      const posLine = positiveMatches.map(m => `${m.category_label} (weight: ${m.weight})`).join(', ');
      summary = `"${context.keyword}" est classé dans ${posLine}. Cependant, il est aussi signalé comme red flag potentiel dans certains contextes : ${redFlagMatch.category_description}`;
    } else {
      summary = positiveMatches.map(m => `"${context.keyword}" → ${m.category_label} (weight: ${m.weight}). ${m.category_description}`).join('\n');
    }

    return { found: matches.length > 0, keyword: context.keyword, matches, summary };
  },
});

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

// ─────────────────────────────────────────────────────────────────────────────
// Tool 10 — executeCorrection
// Typed orchestrator: runs the full correction pipeline in one deterministic
// call (searchSimilarKeywords → tuningAgent → simulateImpact → proposeCorrection)
// and returns a typed result to the supervisor. Replaces sub-agent delegation.
// ─────────────────────────────────────────────────────────────────────────────

export const executeCorrection = createTool({
  id: 'executeCorrection',
  description: `Exécute le pipeline complet de correction : diagnostic (tuning agent), simulation d'impact, et enregistrement de la proposition.
Appelle cet outil après avoir collecté les réponses Q1/Q2/Q3 de l'utilisateur.
Retourne un résultat typé avec feedback_id, résumé de la proposition et de la simulation.
Ne demande PAS de confirmation à l'utilisateur — c'est le superviseur qui gère la phase de confirmation via applyCorrection.`,
  inputSchema: z.object({
    source_id: z.string().describe("source_id de l'AO concerné"),
    client_id: z.string().default('balthazar'),
    ao_context: z.string().describe('JSON stringifié des données AO (title, priority, matched_keywords, keyword_breakdown, rejet_raison, etc.)'),
    user_reason: z.string().describe("Message original de l'utilisateur signalant l'erreur"),
    q1_scope: z.string().describe('Réponse Q1 — portée choisie (quelle catégorie exclure)'),
    q2_valid_case: z.string().describe('Réponse Q2 — AO similaire à préserver, ou "aucun"'),
    q3_confirmed_rule: z.string().describe('Réponse Q3 — reformulation confirmée de la règle'),
  }),
  outputSchema: z.object({
    feedback_id: z.string(),
    proposal_summary: z.string(),
    simulation_summary: z.string(),
    correction_type: z.enum(['keyword_red_flag', 'rag_chunk']),
    correction_value: z.string(),
  }),
  execute: async ({ context }) => {
    // Step 1 — Check for duplicate rules
    const { data: existingOverrides } = await supabase
      .from('keyword_overrides')
      .select('value, type, reason')
      .eq('client_id', context.client_id)
      .eq('active', true)
      .ilike('value', `%${context.q3_confirmed_rule.substring(0, 20)}%`);

    const similarRulesContext = existingOverrides?.length
      ? `Règles similaires déjà actives : ${existingOverrides.map(o => `"${o.value}" (${o.type})`).join(', ')}`
      : 'Aucune règle similaire détectée.';

    // Step 2 — Tuning agent: structured diagnosis
    const diagnosisPrompt = `Contexte AO :
${context.ao_context}

Message utilisateur : ${context.user_reason}

Réponses aux questions de clarification :
Q1 (portée) : ${context.q1_scope}
Q2 (cas valide connu) : ${context.q2_valid_case}
Q3 (reformulation confirmée) : ${context.q3_confirmed_rule}

${similarRulesContext}

Propose une correction unique et ciblée.`;

    const diagnosisResult = await aoFeedbackTuningAgent.generate(diagnosisPrompt, {
      output: feedbackProposalSchema,
    });

    const proposal = diagnosisResult.object;

    // Step 3 — Determine the term to simulate
    const term =
      proposal.technical_payload.red_flag_to_add ??
      proposal.technical_payload.chunk_title ??
      context.q3_confirmed_rule;

    // Step 4 — Simulate impact
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data: affectedAOs } = await supabase
      .from('appels_offres')
      .select('source_id, title, priority')
      .gte('analyzed_at', since.toISOString())
      .or(`title.ilike.%${term}%,description.ilike.%${term}%`);

    const affected = affectedAOs ?? [];
    const correctlyExcluded = affected.filter(ao => ao.priority === 'LOW' || ao.priority === null);
    const potentiallyWrong = affected.filter(ao => ao.priority === 'HIGH' || ao.priority === 'MEDIUM');

    const simulationLines: string[] = [`${affected.length} AO(s) affecté(s) sur les 30 derniers jours.`];
    if (correctlyExcluded.length > 0) simulationLines.push(`✅ ${correctlyExcluded.length} correctement exclus (déjà LOW).`);
    if (potentiallyWrong.length > 0) simulationLines.push(`⚠️ ${potentiallyWrong.length} à vérifier (HIGH/MEDIUM) : ${potentiallyWrong.map(a => `"${a.title}"`).join(', ')}.`);
    const simulationSummary = simulationLines.join(' ');

    // Step 5 — Record the proposal (pending confirmation)
    const { data: feedbackRow } = await supabase
      .from('ao_feedback')
      .insert({
        source_id: context.source_id,
        client_id: context.client_id,
        feedback: 'not_relevant',
        reason: context.user_reason,
        correction_type: proposal.correction_type,
        correction_value: term,
        chunk_content: proposal.technical_payload.chunk_content ?? null,
        agent_diagnosis: proposal.diagnosis_fr,
        agent_proposal: proposal.proposal_fr,
        status: 'agent_proposed',
        source: 'chat',
      })
      .select()
      .single();

    const feedbackId = feedbackRow?.id ?? '';
    const proposalSummary = `${proposal.proposal_fr} — ${proposal.impact_fr}`;

    return {
      feedback_id: feedbackId,
      proposal_summary: proposalSummary,
      simulation_summary: simulationSummary,
      correction_type: proposal.correction_type,
      correction_value: term,
    };
  },
});
