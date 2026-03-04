/**
 * evals/balthazar-real-cases.ts
 *
 * Evaluation harness for 42 real labeled AO cases from historical BOAMP data.
 * Identical scorer logic and metrics as balthazar-scope-pack.ts.
 *
 * Source: eval_cases_labeled.json
 * Ground truth: decision_expected + priority_expected (ignore ia_correct)
 * Categories: clear_reject, terminological_trap, keyword_miss, clear_pass, borderline, client_historique
 *
 * Metrics:
 *   - decision_accuracy  : % correct PASS/REJECT
 *   - priority_accuracy  : % correct recommandation level
 *   - rag_grounded       : % with rag_sources.length >= 1
 *   - policy_cited       : % where at least one policy_expected chunk appears in rag_sources
 *
 * Usage:
 *   LIBSQL_URL=file:rag/vector.db npx tsx evals/balthazar-real-cases.ts
 *   LIBSQL_URL=file:rag/vector.db npx tsx evals/balthazar-real-cases.ts --verbose
 *   LIBSQL_URL=file:rag/vector.db npx tsx evals/balthazar-real-cases.ts --id=eval_023
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { analyzeSemanticRelevance } from '../src/mastra/agents/boamp-semantic-analyzer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RawEvalCase {
  id: string;
  sheet: string;
  ao: string;
  url: string;
  raison_ia: string;
  bzs: string;
  decision_expected: 'PASS' | 'REJECT';
  priority_expected: 'non_pertinent' | 'haute' | 'moyenne' | 'basse';
  ia_correct: boolean | 'partial' | null;
  ia_reason_correct: boolean | null;
  category: 'clear_reject' | 'terminological_trap' | 'keyword_miss' | 'clear_pass' | 'borderline' | 'client_historique';
  policy_expected: string[];
  gap: string | null;
  notes: string;
}

interface EvalResult {
  id: string;
  category: string;
  ao_title: string;
  expected_decision: string;
  actual_decision: string | undefined;
  expected_recommandation: string;
  actual_recommandation: string | undefined;
  decision_correct: boolean;
  priority_correct: boolean;
  rag_grounded: boolean;
  policy_cited: boolean;
  confidence: string | undefined;
  rag_sources: string[];
  score: number | undefined;
  has_gap: boolean;
  old_ia_correct: boolean | 'partial' | null;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_MAP: Record<string, string> = {
  non_pertinent: 'NON_PERTINENT',
  haute: 'HAUTE_PRIORITE',
  moyenne: 'MOYENNE_PRIORITE',
  basse: 'BASSE_PRIORITE',
};

// ─────────────────────────────────────────────────────────────────────────────
// Eval Runner
// ─────────────────────────────────────────────────────────────────────────────

async function runEval(rawCase: RawEvalCase, verbose = false): Promise<EvalResult> {
  const { id, ao, decision_expected, priority_expected, category, policy_expected, gap, ia_correct } = rawCase;
  const expected_recommandation = PRIORITY_MAP[priority_expected] ?? 'NON_PERTINENT';

  if (verbose) {
    console.log(`\n[${id}] ${ao.slice(0, 65)}...`);
  }

  try {
    const result = await analyzeSemanticRelevance(
      {
        // Pass full AO string as title. Pass it as acheteur too so gpt-4o can extract
        // the organisation name when calling client-history-lookup (fuzzy matching).
        title: ao,
        acheteur: ao,
        description: undefined,
        keywords: [],
      },
      undefined // No pre-scoring
    );

    const details = result.details;
    const actual_decision = details?.decision_gate;
    const actual_recommandation = details?.recommandation;
    const rag_sources = details?.rag_sources ?? [];
    const confidence = details?.confidence_decision;

    const decision_correct = actual_decision === decision_expected;
    const priority_correct = actual_recommandation === expected_recommandation;
    const rag_grounded = rag_sources.length >= 1;
    // At least one expected policy must appear in rag_sources
    const policy_cited = policy_expected.length === 0
      || policy_expected.some(p => rag_sources.includes(p));

    if (verbose) {
      const rejet = details?.rejet_raison ? `\n  → Rejet: ${details.rejet_raison}` : '';
      console.log(`[analyzeSemanticRelevance] ${ao.slice(0, 60)}`);
      console.log(`  → Score: ${result.score}/10`);
      console.log(`  → Decision: ${actual_decision} | ${actual_recommandation}`);
      console.log(`  → Confidence: ${confidence}`);
      console.log(`  → RAG sources: ${rag_sources.join(', ') || 'none'}${rejet}`);
      console.log(`  Expected: ${decision_expected} / ${expected_recommandation}`);
      console.log(`  Actual:   ${actual_decision} / ${actual_recommandation}`);
      console.log(`  Decision: ${decision_correct ? '✅' : '❌'} | Priority: ${priority_correct ? '✅' : '❌'}`);
      console.log(`  RAG grounded: ${rag_grounded ? '✅' : '❌'} | Policy cited: ${policy_cited ? '✅' : '❌'}`);
      console.log(`  Sources: [${rag_sources.join(', ')}]`);
      console.log(`  Confidence: ${confidence} | Score: ${result.score}`);
      if (rawCase.gap) console.log(`  Gap: ${rawCase.gap}`);
    }

    return {
      id,
      category,
      ao_title: ao.slice(0, 70),
      expected_decision: decision_expected,
      actual_decision,
      expected_recommandation,
      actual_recommandation,
      decision_correct,
      priority_correct,
      rag_grounded,
      policy_cited,
      confidence,
      rag_sources,
      score: result.score,
      has_gap: gap !== null,
      old_ia_correct: ia_correct,
    };

  } catch (err: any) {
    console.error(`  [ERROR] ${id}: ${err.message}`);
    return {
      id,
      category,
      ao_title: ao.slice(0, 70),
      expected_decision: decision_expected,
      actual_decision: undefined,
      expected_recommandation,
      actual_recommandation: undefined,
      decision_correct: false,
      priority_correct: false,
      rag_grounded: false,
      policy_cited: false,
      confidence: undefined,
      rag_sources: [],
      score: undefined,
      has_gap: gap !== null,
      old_ia_correct: ia_correct,
      error: err.message,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

function printReport(results: EvalResult[]) {
  const total = results.length;
  const decisionCorrect = results.filter(r => r.decision_correct).length;
  const priorityCorrect = results.filter(r => r.priority_correct).length;
  const ragGrounded = results.filter(r => r.rag_grounded).length;
  const policyCited = results.filter(r => r.policy_cited).length;
  const errors = results.filter(r => r.error).length;

  console.log('\n' + '═'.repeat(65));
  console.log('BALTHAZAR RAG EVAL — REAL CASES (42)');
  console.log('═'.repeat(65));
  console.log(`Total cases:       ${total}`);
  console.log(`Errors:            ${errors}`);
  console.log(`Decision accuracy: ${decisionCorrect}/${total} = ${((decisionCorrect / total) * 100).toFixed(1)}%`);
  console.log(`Priority accuracy: ${priorityCorrect}/${total} = ${((priorityCorrect / total) * 100).toFixed(1)}%`);
  console.log(`RAG grounded:      ${ragGrounded}/${total} = ${((ragGrounded / total) * 100).toFixed(1)}%`);
  console.log(`Policy cited:      ${policyCited}/${total} = ${((policyCited / total) * 100).toFixed(1)}%`);

  // Per-category breakdown (decision_accuracy focus)
  const categories = [
    'clear_reject', 'clear_pass', 'terminological_trap', 'keyword_miss', 'borderline', 'client_historique',
  ];
  console.log('\n── Decision accuracy by category ──');
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    if (catResults.length === 0) continue;
    const catDecision = catResults.filter(r => r.decision_correct).length;
    const catPriority = catResults.filter(r => r.priority_correct).length;
    console.log(`  ${cat.padEnd(22)}: ${catDecision}/${catResults.length} decision | ${catPriority}/${catResults.length} priority`);
  }

  // Priority accuracy by expected level (with bias analysis)
  const priorityLevels = ['HAUTE_PRIORITE', 'MOYENNE_PRIORITE', 'BASSE_PRIORITE', 'NON_PERTINENT'] as const;
  console.log('\n── Priority accuracy by level ──');
  let totalBiasUp = 0, totalBiasDown = 0;
  for (const level of priorityLevels) {
    const levelResults = results.filter(r => r.expected_recommandation === level);
    if (levelResults.length === 0) continue;
    const correct = levelResults.filter(r => r.priority_correct).length;
    const higherThan = (a: string, b: string) =>
      priorityLevels.indexOf(a as typeof priorityLevels[number]) <
      priorityLevels.indexOf(b as typeof priorityLevels[number]);
    const biasUp = levelResults.filter(r =>
      !r.priority_correct && r.actual_recommandation && higherThan(r.actual_recommandation, level)
    ).length;
    const biasDown = levelResults.filter(r =>
      !r.priority_correct && r.actual_recommandation && higherThan(level, r.actual_recommandation)
    ).length;
    totalBiasUp += biasUp;
    totalBiasDown += biasDown;
    const biasStr = (biasUp > 0 || biasDown > 0) ? ` (↑ surclassé:${biasUp} ↓ sous-classé:${biasDown})` : '';
    console.log(`  ${level.padEnd(20)}: ${correct}/${levelResults.length}${biasStr}`);
  }
  console.log(`  Biais global → surclassement: ${totalBiasUp} | sous-classement: ${totalBiasDown}`);

  // Gap coverage — how many documented gaps are now correctly handled
  const gapCases = results.filter(r => r.has_gap);
  const gapCorrect = gapCases.filter(r => r.decision_correct).length;
  if (gapCases.length > 0) {
    console.log(`\n── Gap coverage (${gapCases.length} cases with documented gaps) ──`);
    console.log(`  Correct: ${gapCorrect}/${gapCases.length} = ${((gapCorrect / gapCases.length) * 100).toFixed(1)}%`);
    for (const g of gapCases.filter(r => !r.decision_correct)) {
      console.log(`  ❌ [${g.id}] ${g.ao_title}`);
    }
  }

  // Comparison with old IA — where new system outperforms
  const oldWrong = results.filter(r => r.old_ia_correct === false);
  const newCorrectOldWrong = oldWrong.filter(r => r.decision_correct).length;
  if (oldWrong.length > 0) {
    console.log(`\n── New system vs old IA (${oldWrong.length} cases where old IA was wrong) ──`);
    console.log(`  New system correct: ${newCorrectOldWrong}/${oldWrong.length} = ${((newCorrectOldWrong / oldWrong.length) * 100).toFixed(1)}%`);
  }

  // Priority failures (decision correct, priority wrong)
  const priorityFailures = results.filter(r => r.decision_correct && !r.priority_correct);
  if (priorityFailures.length > 0) {
    console.log('\n── Priority failures (decision ✅, priority ❌) ──');
    for (const f of priorityFailures) {
      console.log(`  [${f.id}] Expected ${f.expected_recommandation} → got ${f.actual_recommandation ?? 'ERROR'}`);
    }
  }

  // Decision failures
  const failures = results.filter(r => !r.decision_correct);
  if (failures.length > 0) {
    console.log('\n── Decision failures ──');
    for (const f of failures) {
      const oldFlag = f.old_ia_correct === false ? ' [old IA also wrong]' : '';
      console.log(`  [${f.id}] Expected ${f.expected_decision}/${f.expected_recommandation}, got ${f.actual_decision ?? 'ERROR'}/${f.actual_recommandation ?? 'ERROR'}${oldFlag}`);
      console.log(`         ${f.ao_title}`);
      console.log(`         Sources: [${f.rag_sources.join(', ')}]`);
    }
  }

  console.log('═'.repeat(65));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const verbose = process.argv.includes('--verbose');
  const filterArg = process.argv.find(a => a.startsWith('--id='))?.replace('--id=', '');
  const categoryArg = process.argv.find(a => a.startsWith('--category='))?.replace('--category=', '');

  const rawCases: RawEvalCase[] = JSON.parse(
    readFileSync(join(__dirname, '../eval_cases_labeled.json'), 'utf-8')
  );

  const casesToRun = filterArg
    ? rawCases.filter(c => c.id === filterArg)
    : categoryArg
      ? rawCases.filter(c => categoryArg.split(',').includes(c.category))
      : rawCases;

  if (casesToRun.length === 0) {
    console.error(`No eval cases found matching filter: ${filterArg}`);
    process.exit(1);
  }

  console.log(`🧪 Running ${casesToRun.length} real eval cases (gpt-4o)...`);
  if (filterArg) console.log(`   (filtered to: ${filterArg})`);

  const results: EvalResult[] = [];

  for (const rawCase of casesToRun) {
    const result = await runEval(rawCase, verbose);
    results.push(result);
    // gpt-4o: 30k TPM limit — 20s between cases prevents rate limit errors
    if (casesToRun.indexOf(rawCase) < casesToRun.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 20000));
    }
  }

  printReport(results);
}

main().catch(err => {
  console.error('❌ Eval failed:', err);
  process.exit(1);
});
