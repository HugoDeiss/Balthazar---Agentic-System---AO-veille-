/**
 * scripts/test-keyword-gate.ts
 *
 * Vérifie que le gate keywords (shouldSkipLLM) bloque correctement
 * les AOs hors périmètre avant tout appel LLM/RAG.
 *
 * Aucun appel OpenAI — test instantané et gratuit.
 *
 * Usage:
 *   npx tsx scripts/test-keyword-gate.ts
 */

import {
  calculateKeywordScore,
  calculateEnhancedKeywordScore,
  shouldSkipLLM,
} from '../src/utils/balthazar-keywords';

// ─────────────────────────────────────────────────────────────────────────────
// Cas de test
// ─────────────────────────────────────────────────────────────────────────────

const cases: Array<{ title: string; expected: 'SKIP' | 'LLM'; note?: string }> = [
  // ── AOs du mail de Pablo — doivent tous sortir SKIP ──────────────────────
  {
    title: "Réalisation des évaluations psychologiques préalables à la délivrance de l'agrément accueillant familial adultes personnes âgées",
    expected: 'SKIP',
    note: 'Mail Pablo — évaluations psychologiques',
  },
  {
    title: 'Prestations de collecte, de transport et de traitement des déchets, encombrants et des dépots sauvages sur le territoire de Bordeaux Métropole',
    expected: 'SKIP',
    note: 'Mail Pablo — déchets',
  },
  {
    title: 'Convention de participation risque santé',
    expected: 'SKIP',
    note: 'Mail Pablo — risque santé',
  },
  {
    title: "Mission AMO relative aux études de réhabilitation des ponts à caisson en béton précontraint d'Aramon et de Vallabrègues",
    expected: 'SKIP',
    note: 'Mail Pablo — AMO ponts',
  },
  {
    title: "Mise en oeuvre et exploitation d'un service de covoiturage planifié avec incitation financière SYTRAL Mobilités",
    expected: 'SKIP',
    note: 'Mail Pablo — covoiturage DSP exploitation',
  },
  {
    title: "PRESTATIONS DE COLLECTE, DE TRANSPORT ET DE TRAITEMENT DES DECHETS, ENCOMBRANTS ET DES DEPOTS SAUVAGES SUR LE TERRITOIRE DE BORDEAUX METROPOLE",
    expected: 'SKIP',
    note: 'Mail Pablo — déchets (majuscules)',
  },
  {
    title: 'PRESTATION DE SERVICES DE TRANSPORT, FRET, TRANSIT INTERNATIONAUX ET DE TRANSPORT EXPRESS POUR LE COMPTE DU CENTRE HOSPITALIER UNIVERSITAIRE DE GUYANE',
    expected: 'SKIP',
    note: 'Mail Pablo — fret/transport hospitalier',
  },
  // ── AOs pertinents Balthazar — doivent sortir LLM ────────────────────────
  {
    title: 'Accompagnement stratégique plan de transformation SNCF Voyageurs',
    expected: 'LLM',
    note: 'Pertinent — transformation opérateur mobilité',
  },
  {
    title: 'Mission de conseil en organisation pour opérateur de mobilité',
    expected: 'LLM',
    note: 'Pertinent — conseil organisation mobilité',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

console.log('\n══════════════════════════════════════════════════════════');
console.log('  TEST KEYWORD GATE — shouldSkipLLM');
console.log('══════════════════════════════════════════════════════════\n');

for (const c of cases) {
  const base = calculateKeywordScore(c.title, undefined, undefined, undefined);
  const enhanced = calculateEnhancedKeywordScore({ title: c.title }, base);
  const decision = shouldSkipLLM(enhanced);
  const result: 'SKIP' | 'LLM' = decision.skip ? 'SKIP' : 'LLM';
  const ok = result === c.expected;

  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push(c.title.slice(0, 70));
  }

  const icon = ok ? '✅' : '❌';
  const flag = !ok ? '  ⚠️  INATTENDU' : '';
  console.log(`${icon} [${result}] ${c.title.slice(0, 70)}${flag}`);
  console.log(
    `     score=${enhanced.score}/100  adjustedScore=${enhanced.adjustedScore}/100  conf=${enhanced.confidence}  reason=${decision.reason ?? '-'}`
  );
  if (c.note) console.log(`     note: ${c.note}`);
  console.log();
}

// ─────────────────────────────────────────────────────────────────────────────
// Résumé
// ─────────────────────────────────────────────────────────────────────────────

console.log('══════════════════════════════════════════════════════════');
console.log(`  Résultat : ${passed}/${cases.length} correct(s)  |  ${failed} échec(s)`);
if (failures.length > 0) {
  console.log('\n  ❌ Cas en échec (seuils à revoir dans shouldSkipLLM) :');
  failures.forEach(f => console.log(`     - ${f}`));
}
console.log('══════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
