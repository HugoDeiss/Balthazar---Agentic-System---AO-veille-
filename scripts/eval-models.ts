/**
 * scripts/eval-models.ts
 *
 * Évaluation comparative de 3 modèles OpenAI sur un échantillon d'AOs réels.
 * Compare : decision_gate, recommandation, score, tokens consommés, coût estimé.
 *
 * Usage:
 *   npx tsx scripts/eval-models.ts
 *   npx tsx scripts/eval-models.ts --limit 6   # nombre d'AOs à tester (défaut: 8)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  createBoampSemanticAnalyzer,
  balthazarSemanticAnalysisSchema,
  DEFAULT_FALLBACK_ANALYSIS,
  type BalthazarSemanticAnalysis,
} from '../src/mastra/agents/boamp-semantic-analyzer';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const MODELS = [
  {
    id: 'gpt-4o',
    label: 'gpt-4o (baseline)',
    // Source: platform.openai.com/docs/pricing — standard pricing
    priceInputPer1M: 2.50,
    priceOutputPer1M: 10.00,
    tpmTier1: 30_000,
  },
  {
    id: 'gpt-4.1-mini',
    label: 'gpt-4.1-mini',
    priceInputPer1M: 0.40,
    priceOutputPer1M: 1.60,
    tpmTier1: 200_000,
  },
  {
    id: 'gpt-5-mini',
    label: 'gpt-5-mini',
    priceInputPer1M: 0.25,
    priceOutputPer1M: 2.00,
    tpmTier1: 500_000,
  },
] as const;

// Délai entre appels LLM (ms) — évite les 429 TPM pendant l'eval
const DELAY_BETWEEN_CALLS_MS = 5_000;
// Délai entre modèles (ms) — laisse le TPM se stabiliser
const DELAY_BETWEEN_MODELS_MS = 30_000;

const AO_LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '') || 8;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface AORow {
  source_id: string;
  title: string;
  acheteur: string | null;
  description: string | null;
  keywords: string[] | null;
  keyword_score: number | null;
  keyword_breakdown: Record<string, unknown> | null;
  decision_gate: string | null;   // résultat gpt-4o en prod (référence)
  priority: string | null;
  llm_skipped: boolean | null;
}

interface ModelResult {
  modelId: string;
  decision_gate: 'PASS' | 'REJECT' | 'ERROR';
  recommandation: string;
  score: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
  error?: string;
}

interface EvalRow {
  source_id: string;
  title: string;
  prodDecision: string;   // ce que gpt-4o a décidé en production
  results: ModelResult[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL et SUPABASE_SERVICE_KEY requis dans .env');
  return createClient(url, key);
}

async function fetchEvalAOs(limit: number): Promise<AORow[]> {
  const supabase = getSupabase();

  // Chercher un mix PASS + REJECT parmi les AOs réellement analysés par le LLM
  const half = Math.ceil(limit / 2);

  const [passResult, rejectResult] = await Promise.all([
    supabase
      .from('appels_offres')
      .select('source_id, title, acheteur, description, keywords, keyword_score, keyword_breakdown, decision_gate, priority, llm_skipped')
      .eq('status', 'analyzed')
      .eq('llm_skipped', false)
      .eq('decision_gate', 'PASS')
      .not('description', 'is', null)
      .order('analyzed_at', { ascending: false })
      .limit(half),
    supabase
      .from('appels_offres')
      .select('source_id, title, acheteur, description, keywords, keyword_score, keyword_breakdown, decision_gate, priority, llm_skipped')
      .eq('status', 'analyzed')
      .eq('llm_skipped', false)
      .eq('decision_gate', 'REJECT')
      .not('description', 'is', null)
      .order('analyzed_at', { ascending: false })
      .limit(limit - half),
  ]);

  if (passResult.error) throw new Error(`Supabase PASS query: ${passResult.error.message}`);
  if (rejectResult.error) throw new Error(`Supabase REJECT query: ${rejectResult.error.message}`);

  const aos = [...(passResult.data ?? []), ...(rejectResult.data ?? [])] as AORow[];
  console.log(`📦 ${aos.length} AOs récupérés (${passResult.data?.length ?? 0} PASS + ${rejectResult.data?.length ?? 0} REJECT)`);
  return aos;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYSE AVEC UN MODÈLE DONNÉ
// ─────────────────────────────────────────────────────────────────────────────

async function analyzeWithModel(
  ao: AORow,
  modelId: string,
): Promise<ModelResult> {
  const agent = createBoampSemanticAnalyzer(modelId);

  const keywordScore = {
    adjustedScore: ao.keyword_score ?? 0,
    score: ao.keyword_score ?? 0,
    confidence: (ao.keyword_breakdown as any)?.confidence ?? 'UNKNOWN',
    secteur_matches: (ao.keyword_breakdown as any)?.secteur_matches ?? [],
    expertise_matches: (ao.keyword_breakdown as any)?.expertise_matches ?? [],
    red_flags_detected: (ao.keyword_breakdown as any)?.red_flags_detected ?? [],
  };

  const prompt = buildPrompt(ao, keywordScore);
  const t0 = Date.now();

  try {
    const response = await agent.generate(prompt, {
      structuredOutput: {
        schema: balthazarSemanticAnalysisSchema,
        errorStrategy: 'fallback',
        fallbackValue: DEFAULT_FALLBACK_ANALYSIS,
      },
    });

    const analysis = ((await response.object) ?? DEFAULT_FALLBACK_ANALYSIS) as BalthazarSemanticAnalysis;
    const usage = (response as any).usage;
    const promptTokens = usage?.promptTokens ?? 0;
    const completionTokens = usage?.completionTokens ?? 0;
    const totalTokens = usage?.totalTokens ?? (promptTokens + completionTokens);

    const model = MODELS.find(m => m.id === modelId)!;
    const costUsd =
      (promptTokens / 1_000_000) * model.priceInputPer1M +
      (completionTokens / 1_000_000) * model.priceOutputPer1M;

    return {
      modelId,
      decision_gate: analysis.decision_gate as 'PASS' | 'REJECT',
      recommandation: analysis.recommandation,
      score: analysis.score_semantique_global,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      modelId,
      decision_gate: 'ERROR',
      recommandation: 'N/A',
      score: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      durationMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function buildPrompt(ao: AORow, keywordScore: Record<string, unknown>): string {
  return `## AO À ANALYSER

Titre: ${ao.title}
Organisme: ${ao.acheteur ?? 'Non communiqué'}
Description: ${ao.description ?? 'Non disponible'}
Keywords: ${ao.keywords?.join(', ') ?? 'Aucun'}

Pré-scoring keywords: ${(keywordScore.adjustedScore as number) ?? 0}/100
Confidence keywords: ${(keywordScore.confidence as string) ?? 'UNKNOWN'}
Secteurs détectés: ${((keywordScore.secteur_matches as any[]) ?? []).map((m: any) => m.category).join(', ') || 'aucun'}
Expertises détectées: ${((keywordScore.expertise_matches as any[]) ?? []).map((m: any) => m.category).join(', ') || 'aucune'}
Red flags keywords: ${((keywordScore.red_flags_detected as string[]) ?? []).join(', ') || 'aucun'}

Analyse cet AO selon tes instructions. Commence par \`client-history-lookup\`.`;
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// RAPPORT
// ─────────────────────────────────────────────────────────────────────────────

function printReport(rows: EvalRow[]) {
  console.log('\n' + '═'.repeat(100));
  console.log('RÉSULTATS DE L\'ÉVALUATION COMPARATIVE DES MODÈLES');
  console.log('═'.repeat(100));

  for (const row of rows) {
    const title = row.title.slice(0, 60) + (row.title.length > 60 ? '…' : '');
    console.log(`\n📄 ${title}`);
    console.log(`   source_id: ${row.source_id} | prod (gpt-4o): ${row.prodDecision}`);

    const header = '   ' + ['Modèle'.padEnd(18), 'Gate'.padEnd(8), 'Recommandation'.padEnd(22), 'Score'.padEnd(7), 'Tokens'.padEnd(10), 'Coût $'.padEnd(10), 'Durée'.padEnd(8), 'Accord prod?'].join(' | ');
    console.log(header);
    console.log('   ' + '-'.repeat(97));

    for (const r of row.results) {
      const agree = r.decision_gate === row.prodDecision ? '✅' : r.decision_gate === 'ERROR' ? '⚠️ ERROR' : '❌ DIFF';
      const cols = [
        r.modelId.padEnd(18),
        r.decision_gate.padEnd(8),
        r.recommandation.padEnd(22),
        `${r.score.toFixed(1)}/10`.padEnd(7),
        String(r.totalTokens).padEnd(10),
        `$${r.costUsd.toFixed(4)}`.padEnd(10),
        `${(r.durationMs / 1000).toFixed(1)}s`.padEnd(8),
        agree,
      ];
      console.log('   ' + cols.join(' | ') + (r.error ? ` | ${r.error.slice(0, 60)}` : ''));
    }
  }

  // Résumé par modèle
  console.log('\n' + '═'.repeat(100));
  console.log('RÉSUMÉ PAR MODÈLE');
  console.log('═'.repeat(100));

  for (const model of MODELS) {
    const allResults = rows.flatMap(r => r.results.filter(res => res.modelId === model.id));
    const errors = allResults.filter(r => r.decision_gate === 'ERROR').length;
    const agreements = rows.filter(row => {
      const r = row.results.find(res => res.modelId === model.id);
      return r && r.decision_gate !== 'ERROR' && r.decision_gate === row.prodDecision;
    }).length;
    const totalAOs = rows.length;
    const totalTokens = allResults.reduce((s, r) => s + r.totalTokens, 0);
    const totalCost = allResults.reduce((s, r) => s + r.costUsd, 0);
    const avgDuration = allResults.length > 0
      ? allResults.reduce((s, r) => s + r.durationMs, 0) / allResults.length / 1000
      : 0;

    console.log(`\n${model.label}`);
    console.log(`  TPM Tier 1    : ${model.tpmTier1.toLocaleString()}`);
    console.log(`  Accord prod   : ${agreements}/${totalAOs - errors} (${errors} erreurs)`);
    console.log(`  Total tokens  : ${totalTokens.toLocaleString()} (moy. ${Math.round(totalTokens / Math.max(totalAOs - errors, 1)).toLocaleString()} / AO)`);
    console.log(`  Coût total    : $${totalCost.toFixed(4)} (moy. $${(totalCost / Math.max(totalAOs - errors, 1)).toFixed(4)} / AO)`);
    console.log(`  Durée moy.    : ${avgDuration.toFixed(1)}s / AO`);
    console.log(`  Prix input    : $${model.priceInputPer1M}/1M tokens (⚠️ à vérifier pour gpt-5-mini)`);
  }

  console.log('\n' + '═'.repeat(100));
  console.log('⚠️  Les prix gpt-5-mini sont estimés — vérifier sur platform.openai.com/docs/pricing');
  console.log('═'.repeat(100) + '\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🚀 Eval modèles — ${AO_LIMIT} AOs × ${MODELS.length} modèles`);
  console.log(`   Modèles: ${MODELS.map(m => m.id).join(', ')}\n`);

  const aos = await fetchEvalAOs(AO_LIMIT);
  if (aos.length === 0) {
    console.error('❌ Aucun AO trouvé en base — vérifie que des AOs sont analysés (status=analyzed, llm_skipped=false)');
    process.exit(1);
  }

  const evalRows: EvalRow[] = aos.map(ao => ({
    source_id: ao.source_id,
    title: ao.title,
    prodDecision: ao.decision_gate ?? 'UNKNOWN',
    results: [],
  }));

  // Exécuter modèle par modèle, AO par AO (séquentiel pour éviter TPM)
  for (let mi = 0; mi < MODELS.length; mi++) {
    const model = MODELS[mi];
    console.log(`\n🔵 Modèle ${mi + 1}/${MODELS.length}: ${model.label}`);

    if (mi > 0) {
      console.log(`   ⏳ Pause ${DELAY_BETWEEN_MODELS_MS / 1000}s entre modèles...`);
      await sleep(DELAY_BETWEEN_MODELS_MS);
    }

    for (let ai = 0; ai < aos.length; ai++) {
      const ao = aos[ai];
      console.log(`   [${ai + 1}/${aos.length}] ${ao.title.slice(0, 60)}…`);

      const result = await analyzeWithModel(ao, model.id);
      evalRows[ai].results.push(result);

      const status = result.decision_gate === 'ERROR'
        ? `⚠️  ERROR: ${result.error?.slice(0, 50)}`
        : `${result.decision_gate} | ${result.recommandation} | score=${result.score.toFixed(1)} | ${result.totalTokens} tokens | $${result.costUsd.toFixed(4)}`;
      console.log(`       → ${status} (${(result.durationMs / 1000).toFixed(1)}s)`);

      if (ai < aos.length - 1) await sleep(DELAY_BETWEEN_CALLS_MS);
    }
  }

  printReport(evalRows);
}

main().catch(err => {
  console.error('❌ Erreur fatale:', err);
  process.exit(1);
});
