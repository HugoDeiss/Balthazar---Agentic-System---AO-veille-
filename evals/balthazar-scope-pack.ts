/**
 * evals/balthazar-scope-pack.ts
 *
 * Evaluation harness for the Balthazar RAG semantic analyzer.
 * 30 labeled AOs covering: clear PASS, clear REJECT, borderline, terminological traps, historical clients.
 *
 * Metrics to measure:
 * - decision_accuracy: % correct decision_gate (PASS/REJECT)
 * - priority_accuracy: % correct recommandation level
 * - rag_grounded: % with rag_sources.length >= 1
 * - hallucination_proxy: % where rejet_raison cites a real chunk_id
 *
 * Usage:
 *   npx tsx evals/balthazar-scope-pack.ts
 *   npx tsx evals/balthazar-scope-pack.ts --verbose
 */

import { config } from 'dotenv';
import { analyzeSemanticRelevance } from '../src/mastra/agents/boamp-semantic-analyzer';

config();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface EvalCase {
  id: string;
  category: 'clear_pass' | 'clear_reject' | 'borderline' | 'terminological_trap' | 'historical_client';
  ao: {
    title: string;
    acheteur: string;
    description: string;
    keywords?: string[];
  };
  expected: {
    decision_gate: 'PASS' | 'REJECT';
    recommandation: 'HAUTE_PRIORITE' | 'MOYENNE_PRIORITE' | 'BASSE_PRIORITE' | 'NON_PERTINENT';
    rationale: string; // Why this label — used for human review
    must_cite_policy?: string; // chunk_id that MUST appear in rag_sources
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eval Dataset (30 cases)
// ─────────────────────────────────────────────────────────────────────────────

const EVAL_CASES: EvalCase[] = [
  // ── CLEAR PASS ──────────────────────────────────────────────────────────────
  {
    id: 'eval_01',
    category: 'clear_pass',
    ao: {
      title: 'Accompagnement à l\'élaboration du plan stratégique 2025-2030',
      acheteur: 'SNCF Voyageurs',
      description: 'Mission de définition du plan stratégique pluriannuel 2025-2030 pour SNCF Voyageurs. Travail avec le CODIR et le Conseil d\'administration. Diagnostic stratégique, construction de scénarios, formalisation des priorités.',
    },
    expected: {
      decision_gate: 'PASS',
      recommandation: 'HAUTE_PRIORITE',
      rationale: 'Client historique + plan stratégique + CODIR/CA = archétype Balthazar',
      must_cite_policy: 'pol_missions_coeur',
    },
  },
  {
    id: 'eval_02',
    category: 'clear_pass',
    ao: {
      title: 'Définition de la raison d\'être et accompagnement vers le statut de Société à Mission',
      acheteur: 'Mutuelle Groupama',
      description: 'Accompagnement Groupama dans la formalisation de sa raison d\'être et le passage en Société à Mission (loi PACTE). Travail avec Comité Exécutif, Directeurs métiers, Conseil d\'administration.',
    },
    expected: {
      decision_gate: 'PASS',
      recommandation: 'HAUTE_PRIORITE',
      rationale: 'Client historique assurance + mission signature Balthazar (raison d\'être + SàM)',
      must_cite_policy: 'pol_missions_coeur',
    },
  },
  {
    id: 'eval_03',
    category: 'clear_pass',
    ao: {
      title: 'Mission de transformation organisationnelle et refonte de gouvernance',
      acheteur: 'Enedis',
      description: 'Accompagnement de la Direction Générale d\'Enedis dans la refonte de son modèle organisationnel et la clarification des circuits décisionnels. Travail en CODIR étendu.',
    },
    expected: {
      decision_gate: 'PASS',
      recommandation: 'HAUTE_PRIORITE',
      rationale: 'Client historique énergie + transformation org + gouvernance + CODIR',
      must_cite_policy: 'pol_missions_coeur',
    },
  },
  {
    id: 'eval_04',
    category: 'clear_pass',
    ao: {
      title: 'Stratégie de développement et analyse de marché M&A horizon 2030',
      acheteur: 'Transdev',
      description: 'Définition de la stratégie de développement externe, screening de cibles M&A, construction de business cases et priorisation d\'acquisitions. COMEX.',
    },
    expected: {
      decision_gate: 'PASS',
      recommandation: 'HAUTE_PRIORITE',
      rationale: 'Client historique + M&A + COMEX = mission stratégie de développement',
      must_cite_policy: 'pol_missions_coeur',
    },
  },
  {
    id: 'eval_05',
    category: 'clear_pass',
    ao: {
      title: 'Feuille de route RSE intégrée et trajectoire CSRD',
      acheteur: 'Compagnie Nationale du Rhône',
      description: 'Élaboration d\'une feuille de route RSE intégrée à la stratégie globale. Définition de la trajectoire climatique. Alignement des dirigeants. Mission portée par la Direction Générale.',
    },
    expected: {
      decision_gate: 'PASS',
      recommandation: 'HAUTE_PRIORITE',
      rationale: 'Client historique énergie + RSE stratégique intégré + DG',
      must_cite_policy: 'pol_missions_conditionnelles',
    },
  },

  // ── CLEAR REJECT ─────────────────────────────────────────────────────────────
  {
    id: 'eval_06',
    category: 'clear_reject',
    ao: {
      title: 'Formation bureautique Word, Excel, PowerPoint',
      acheteur: 'Mairie de Lyon',
      description: 'Formation aux outils bureautiques Microsoft Office pour 80 agents administratifs. Durée 6 mois.',
    },
    expected: {
      decision_gate: 'REJECT',
      recommandation: 'NON_PERTINENT',
      rationale: 'Formation catalogue — exclusion formelle absolue',
      must_cite_policy: 'pol_exclusions_formelles',
    },
  },
  {
    id: 'eval_07',
    category: 'clear_reject',
    ao: {
      title: 'Déploiement d\'un ERP RH et intégration SI paie',
      acheteur: 'Région Île-de-France',
      description: 'Paramétrage et déploiement d\'un ERP RH, intégration avec le système de paie existant, migration des données, formation utilisateurs.',
    },
    expected: {
      decision_gate: 'REJECT',
      recommandation: 'NON_PERTINENT',
      rationale: 'Implémentation IT / ERP — exclusion formelle',
      must_cite_policy: 'pol_exclusions_formelles',
    },
  },
  {
    id: 'eval_08',
    category: 'clear_reject',
    ao: {
      title: 'Marché de travaux de rénovation du réseau ferroviaire',
      acheteur: 'SNCF Réseau',
      description: 'Travaux de rénovation des voies ferrées sur l\'axe Lyon-Marseille. Maîtrise d\'œuvre technique.',
    },
    expected: {
      decision_gate: 'REJECT',
      recommandation: 'NON_PERTINENT',
      rationale: 'Marché de travaux / maîtrise d\'œuvre technique — exclusion formelle',
      must_cite_policy: 'pol_exclusions_formelles',
    },
  },
  {
    id: 'eval_09',
    category: 'clear_reject',
    ao: {
      title: 'Prestation d\'assurance des risques statutaires pour collectivité',
      acheteur: 'Centre de Gestion 26',
      description: 'Contrat d\'assurance couvrant les risques statutaires des agents des collectivités affiliées au Centre de Gestion de la Drôme.',
    },
    expected: {
      decision_gate: 'REJECT',
      recommandation: 'NON_PERTINENT',
      rationale: 'Achat de contrat d\'assurance (police) — non secteur assurantiel stratégique',
      must_cite_policy: 'pol_secteur_assurance',
    },
  },
  {
    id: 'eval_10',
    category: 'clear_reject',
    ao: {
      title: 'Expertise actuarielle et bilan technique de prévoyance',
      acheteur: 'AG2R La Mondiale',
      description: 'Mission d\'expertise actuarielle pour l\'évaluation des engagements de prévoyance et le calcul des provisions techniques réglementaires.',
    },
    expected: {
      decision_gate: 'REJECT',
      recommandation: 'NON_PERTINENT',
      rationale: 'Expertise actuarielle — exclusion formelle absolue même si client historique',
      must_cite_policy: 'pol_exclusions_formelles',
    },
  },
  {
    id: 'eval_11',
    category: 'clear_reject',
    ao: {
      title: 'Transport scolaire adapté pour élèves en situation de handicap',
      acheteur: 'Département des Hauts-de-Seine',
      description: 'Organisation et prestation de transport scolaire adapté pour élèves ULIS et SEGPA, véhicules légers de moins de 9 places.',
    },
    expected: {
      decision_gate: 'REJECT',
      recommandation: 'NON_PERTINENT',
      rationale: 'Transport scolaire = exploitation opérationnelle pure — règle disambiguation mobilité',
      must_cite_policy: 'pol_disambiguation_mobilite_exclusions',
    },
  },

  // ── BORDERLINE ────────────────────────────────────────────────────────────────
  {
    id: 'eval_12',
    category: 'borderline',
    ao: {
      title: 'Appui méthodologique, logistique et stratégique aux douze Conseils Territoriaux de Santé de la région Auvergne Rhône-Alpes',
      acheteur: 'ARS Auvergne-Rhône-Alpes',
      description: 'Mission d\'appui aux Conseils Territoriaux de Santé pour l\'animation et la structuration des démarches de santé. Dimension participative et stratégique.',
    },
    expected: {
      decision_gate: 'PASS',
      recommandation: 'BASSE_PRIORITE',
      rationale: 'Secteur pertinent mais mission d\'animation non directement stratégique pour Balthazar',
      must_cite_policy: 'pol_missions_conditionnelles',
    },
  },
  {
    id: 'eval_13',
    category: 'terminological_trap',
    ao: {
      title: 'Accompagnement stratégique et opérationnel du Projet Alimentaire Territorial 2025-2028',
      acheteur: 'Région Occitanie',
      description: 'Mission d\'accompagnement du PAT régional. Coordination des acteurs, animation des filières, suivi opérationnel.',
    },
    expected: {
      decision_gate: 'REJECT',
      recommandation: 'NON_PERTINENT',
      rationale: 'PAT explicitement hors scope selon pol_secteur_public_hors_scope — pas une transformation structurante d\'opérateur',
      must_cite_policy: 'pol_secteur_public_hors_scope',
    },
  },
  {
    id: 'eval_14',
    category: 'borderline',
    ao: {
      title: 'Mission de conduite du changement pour déploiement CRM',
      acheteur: 'Engie',
      description: 'Accompagnement de la conduite du changement dans le cadre du déploiement d\'un nouvel outil CRM. Formation et communication. Direction commerciale.',
    },
    expected: {
      decision_gate: 'PASS',
      recommandation: 'BASSE_PRIORITE',
      rationale: 'Client historique énergie + conduite du changement MAIS lié à déploiement IT outil — tension règle',
      must_cite_policy: 'pol_missions_conditionnelles',
    },
  },
  {
    id: 'eval_15',
    category: 'borderline',
    ao: {
      title: 'AMO stratégique programme de transformation des processus',
      acheteur: 'RATP',
      description: 'Assistance à maîtrise d\'ouvrage dans le cadre d\'un programme de transformation des processus internes. Pilotage et coordination du programme. CODIR impliqué.',
    },
    expected: {
      decision_gate: 'PASS',
      recommandation: 'MOYENNE_PRIORITE',
      rationale: 'Client historique + AMO avec dimension stratégique + CODIR = acceptable sous conditions',
      must_cite_policy: 'pol_disambiguation_amo',
    },
  },
  {
    id: 'eval_16',
    category: 'borderline',
    ao: {
      title: 'Séminaire stratégique direction et team building annuel',
      acheteur: 'GRT Gaz',
      description: 'Organisation et animation du séminaire annuel de direction. Programme incluant des temps de cohésion (activities outdoor) et des ateliers sur les enjeux 2026.',
    },
    expected: {
      decision_gate: 'PASS',
      recommandation: 'BASSE_PRIORITE',
      rationale: 'Client historique énergie mais séminaire mélange team building + enjeux stratégiques — règle conditionnelle séminaires',
      must_cite_policy: 'pol_missions_conditionnelles',
    },
  },

  // ── TERMINOLOGICAL TRAPS ─────────────────────────────────────────────────────
  {
    id: 'eval_17',
    category: 'terminological_trap',
    ao: {
      title: 'Mise en Cohérence Stratégique et Opérationnelle de la Politique de l\'Habitat',
      acheteur: 'Métropole de Lyon',
      description: 'Mission d\'analyse et de cohérence de la politique habitat. Diagnostic, définition d\'objectifs, plan d\'actions.',
    },
    expected: {
      decision_gate: 'REJECT',
      recommandation: 'NON_PERTINENT',
      rationale: 'Politique de l\'habitat explicitement hors scope selon pol_secteur_public_hors_scope — piège terminologique "stratégique"',
      must_cite_policy: 'pol_secteur_public_hors_scope',
    },
  },
  {
    id: 'eval_18',
    category: 'terminological_trap',
    ao: {
      title: 'Transformation culturelle de l\'utilisation des nouveaux espaces (CARSAT Centre Ouest)',
      acheteur: 'CARSAT Centre Ouest',
      description: 'Accompagnement du changement suite au déménagement dans de nouveaux locaux. Transformation des pratiques de travail, animation, cohésion.',
    },
    expected: {
      decision_gate: 'PASS',
      recommandation: 'BASSE_PRIORITE',
      rationale: 'CLIENT HISTORIQUE (CARSAT Centre Ouest) → toujours analyser. Mission périphérique mais relation à préserver.',
      must_cite_policy: 'pol_clients_historiques_regle',
    },
  },
  {
    id: 'eval_19',
    category: 'terminological_trap',
    ao: {
      title: 'Prestation de conseil en organisation et accompagnement au changement (phase Candidature)',
      acheteur: 'Service Eau du Grand Paris',
      description: 'Prestation de conseil en organisation et accompagnement au changement pour accompagner la transformation du service eau dans le cadre de la phase Candidature.',
    },
    expected: {
      decision_gate: 'PASS',
      recommandation: 'MOYENNE_PRIORITE',
      rationale: '"Conseil en organisation + changement" = mission Balthazar; secteur secondaire mais pertinent',
      must_cite_policy: 'pol_missions_coeur',
    },
  },
  {
    id: 'eval_20',
    category: 'terminological_trap',
    ao: {
      title: 'Nomination du commissaire aux comptes de Tisséo Ingénierie',
      acheteur: 'Tisséo Ingénierie',
      description: 'Marché de commissariat aux comptes pour la nomination d\'un commissaire aux comptes au sens de l\'article L.821-40 du Code de Commerce.',
    },
    expected: {
      decision_gate: 'REJECT',
      recommandation: 'NON_PERTINENT',
      rationale: 'CLIENT HISTORIQUE mais mission audit juridique/comptable — exclusion formelle. Flag "hors périmètre mais client historique".',
      must_cite_policy: 'pol_exclusions_formelles',
    },
  },
  {
    id: 'eval_21',
    category: 'terminological_trap',
    ao: {
      title: 'Assurance qualité et certification ISO 9001 du processus de production',
      acheteur: 'Opérateur ferroviaire régional',
      description: 'Mission d\'accompagnement à la mise en place d\'une démarche assurance qualité et certification ISO 9001.',
    },
    expected: {
      decision_gate: 'REJECT',
      recommandation: 'NON_PERTINENT',
      rationale: '"Assurance" ici = assurance qualité (démarche qualité), pas secteur assurantiel — piège terminologique',
      must_cite_policy: 'pol_secteur_assurance',
    },
  },
  {
    id: 'eval_22',
    category: 'terminological_trap',
    ao: {
      title: 'Transformation digitale — migration vers le cloud et nouveau SI RH',
      acheteur: 'Île-de-France Mobilités',
      description: 'Pilotage du projet de transformation digitale incluant migration cloud, déploiement nouveau SI RH, et conduite du changement associée.',
    },
    expected: {
      decision_gate: 'REJECT',
      recommandation: 'NON_PERTINENT',
      rationale: '"Transformation digitale" ici = migration IT / SI — exclusion formelle malgré le client',
      must_cite_policy: 'pol_disambiguation_transformation',
    },
  },
  {
    id: 'eval_23',
    category: 'terminological_trap',
    ao: {
      title: 'Notation financière et rating extra-financier',
      acheteur: 'SYTRAL Mobilités',
      description: 'Mission de notation financière de SYTRAL et de son programme d\'emprunt par une agence internationale de notation.',
    },
    expected: {
      decision_gate: 'REJECT',
      recommandation: 'NON_PERTINENT',
      rationale: 'Expertise financière réglementée / notation — exclusion formelle. SYTRAL est prospect mais mission hors périmètre.',
      must_cite_policy: 'pol_exclusions_formelles',
    },
  },

  // ── HISTORICAL CLIENTS ────────────────────────────────────────────────────────
  {
    id: 'eval_24',
    category: 'historical_client',
    ao: {
      title: 'Maintenance des centrales photovoltaïques du Conseil Départemental du Tarn',
      acheteur: 'Conseil Départemental du Tarn',
      description: 'Marché de maintenance préventive et corrective des centrales photovoltaïques installées sur les bâtiments départementaux.',
    },
    expected: {
      decision_gate: 'REJECT',
      recommandation: 'NON_PERTINENT',
      rationale: 'Non client historique + maintenance technique pure — exclusion formelle',
      must_cite_policy: 'pol_exclusions_formelles',
    },
  },
  {
    id: 'eval_25',
    category: 'historical_client',
    ao: {
      title: 'Déploiement de la Raison d\'Être à l\'ensemble des équipes',
      acheteur: 'CARSAT Normandie',
      description: 'Mission d\'accompagnement du déploiement de la Raison d\'Être de la CARSAT Normandie auprès de l\'ensemble des collaborateurs (1009 agents). Phases pilotes et déploiement large.',
    },
    expected: {
      decision_gate: 'PASS',
      recommandation: 'HAUTE_PRIORITE',
      rationale: 'Client historique + déploiement Raison d\'Être = mission signature (cas cs_carsat_deploiement_re)',
      must_cite_policy: 'pol_missions_coeur',
    },
  },
  {
    id: 'eval_26',
    category: 'historical_client',
    ao: {
      title: 'Fourniture et installation de mobilier de bureau',
      acheteur: 'RATP',
      description: 'Marché de fourniture et installation de mobilier de bureau pour les locaux administratifs de la RATP.',
    },
    expected: {
      decision_gate: 'REJECT',
      recommandation: 'NON_PERTINENT',
      rationale: 'Client historique MAIS marché de fourniture — exclusion formelle. Doit flag "hors périmètre mais client historique".',
      must_cite_policy: 'pol_exclusions_formelles',
    },
  },
  {
    id: 'eval_27',
    category: 'historical_client',
    ao: {
      title: 'Mission de conseil en stratégie de croissance externe et M&A',
      acheteur: 'EDF',
      description: 'Définition de la stratégie de croissance externe, screening de cibles d\'acquisition dans les énergies renouvelables, priorisation et cadrage des due diligences. Direction Exécutive.',
    },
    expected: {
      decision_gate: 'PASS',
      recommandation: 'HAUTE_PRIORITE',
      rationale: 'Client historique énergie + M&A + Direction Exécutive = archétype Balthazar',
      must_cite_policy: 'pol_missions_coeur',
    },
  },
  {
    id: 'eval_28',
    category: 'historical_client',
    ao: {
      title: 'Audit organisationnel et analyse des risques psychosociaux',
      acheteur: 'MAIF',
      description: 'Audit organisationnel complet avec focus sur les risques psychosociaux, suivi d\'un plan d\'actions RPS. Directions RH et opérationnelles.',
    },
    expected: {
      decision_gate: 'PASS',
      recommandation: 'MOYENNE_PRIORITE',
      rationale: 'Client historique assurance + audit organisationnel avec dimension RH — acceptable, pas cœur métier',
      must_cite_policy: 'pol_clients_historiques_regle',
    },
  },

  // ── ADDITIONAL CASES ─────────────────────────────────────────────────────────
  {
    id: 'eval_29',
    category: 'borderline',
    ao: {
      title: 'Vision d\'avenir 2040 : mission de réflexion prospective et stratégique',
      acheteur: 'Saint-Louis Agglomération',
      description: 'Mission de réflexion prospective et stratégique pour l\'élaboration du projet de territoire "Vision d\'avenir 2040". Accompagnement des élus et parties prenantes.',
    },
    expected: {
      decision_gate: 'PASS',
      recommandation: 'MOYENNE_PRIORITE',
      rationale: 'Étude prospective stratégique + projet territoire = potentiellement in scope si débouche sur décisions',
      must_cite_policy: 'pol_missions_conditionnelles',
    },
  },
  {
    id: 'eval_30',
    category: 'clear_pass',
    ao: {
      title: 'Programme de transformation managériale adossée au projet d\'entreprise',
      acheteur: 'Getlink',
      description: 'Accompagnement d\'un programme de transformation managériale pour déployer le projet d\'entreprise Getlink. Référentiel managérial, dispositif d\'alignement, séminaires COMEX et déploiement.',
    },
    expected: {
      decision_gate: 'PASS',
      recommandation: 'HAUTE_PRIORITE',
      rationale: 'Client historique + transformation managériale + projet d\'entreprise + COMEX = archétype Balthazar',
      must_cite_policy: 'pol_missions_coeur',
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Eval Runner
// ─────────────────────────────────────────────────────────────────────────────

interface EvalResult {
  id: string;
  category: string;
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
  error?: string;
}

async function runEval(evalCase: EvalCase, verbose = false): Promise<EvalResult> {
  const { id, ao, expected } = evalCase;

  if (verbose) {
    console.log(`\n[${id}] ${ao.title.slice(0, 60)}...`);
  }

  try {
    const result = await analyzeSemanticRelevance(
      {
        title: ao.title,
        acheteur: ao.acheteur,
        description: ao.description,
        keywords: ao.keywords,
      },
      undefined // No pre-scoring in eval
    );

    const details = result.details;

    const actual_decision = details?.decision_gate;
    const actual_recommandation = details?.recommandation;
    const rag_sources = details?.rag_sources ?? [];
    const confidence = details?.confidence_decision;

    const decision_correct = actual_decision === expected.decision_gate;
    const priority_correct = actual_recommandation === expected.recommandation;
    const rag_grounded = rag_sources.length >= 1;
    const policy_cited = !expected.must_cite_policy
      || rag_sources.includes(expected.must_cite_policy);

    if (verbose) {
      console.log(`  Expected: ${expected.decision_gate} / ${expected.recommandation}`);
      console.log(`  Actual:   ${actual_decision} / ${actual_recommandation}`);
      console.log(`  Decision: ${decision_correct ? '✅' : '❌'} | Priority: ${priority_correct ? '✅' : '❌'}`);
      console.log(`  RAG grounded: ${rag_grounded ? '✅' : '❌'} | Policy cited: ${policy_cited ? '✅' : '❌'}`);
      console.log(`  Sources: [${rag_sources.join(', ')}]`);
      console.log(`  Confidence: ${confidence} | Score: ${result.score}`);
    }

    return {
      id,
      category: evalCase.category,
      expected_decision: expected.decision_gate,
      actual_decision,
      expected_recommandation: expected.recommandation,
      actual_recommandation,
      decision_correct,
      priority_correct,
      rag_grounded,
      policy_cited,
      confidence,
      rag_sources,
      score: result.score,
    };

  } catch (err: any) {
    console.error(`  [ERROR] ${id}: ${err.message}`);
    return {
      id,
      category: evalCase.category,
      expected_decision: expected.decision_gate,
      actual_decision: undefined,
      expected_recommandation: expected.recommandation,
      actual_recommandation: undefined,
      decision_correct: false,
      priority_correct: false,
      rag_grounded: false,
      policy_cited: false,
      confidence: undefined,
      rag_sources: [],
      score: undefined,
      error: err.message,
    };
  }
}

function printReport(results: EvalResult[]) {
  const total = results.length;
  const decisionCorrect = results.filter(r => r.decision_correct).length;
  const priorityCorrect = results.filter(r => r.priority_correct).length;
  const ragGrounded = results.filter(r => r.rag_grounded).length;
  const policyCited = results.filter(r => r.policy_cited).length;
  const errors = results.filter(r => r.error).length;

  console.log('\n' + '═'.repeat(60));
  console.log('BALTHAZAR RAG EVAL RESULTS');
  console.log('═'.repeat(60));
  console.log(`Total cases:       ${total}`);
  console.log(`Errors:            ${errors}`);
  console.log(`Decision accuracy: ${decisionCorrect}/${total} = ${((decisionCorrect / total) * 100).toFixed(1)}%`);
  console.log(`Priority accuracy: ${priorityCorrect}/${total} = ${((priorityCorrect / total) * 100).toFixed(1)}%`);
  console.log(`RAG grounded:      ${ragGrounded}/${total} = ${((ragGrounded / total) * 100).toFixed(1)}%`);
  console.log(`Policy cited:      ${policyCited}/${total} = ${((policyCited / total) * 100).toFixed(1)}%`);

  // Per-category breakdown
  const categories = [...new Set(results.map(r => r.category))];
  console.log('\n── Per category ──');
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    const catDecision = catResults.filter(r => r.decision_correct).length;
    const catPriority = catResults.filter(r => r.priority_correct).length;
    console.log(`  ${cat}: ${catDecision}/${catResults.length} decision | ${catPriority}/${catResults.length} priority`);
  }

  // Priority accuracy breakdown by expected level
  const priorityLevels = ['HAUTE_PRIORITE', 'MOYENNE_PRIORITE', 'BASSE_PRIORITE', 'NON_PERTINENT'] as const;
  console.log('\n── Priority accuracy by level ──');
  let totalBiasUp = 0, totalBiasDown = 0;
  for (const level of priorityLevels) {
    const levelResults = results.filter(r => r.expected_recommandation === level);
    if (levelResults.length === 0) continue;
    const correct = levelResults.filter(r => r.priority_correct).length;
    // Analyse bias: agent said higher vs lower than expected
    const higherThan = (a: string, b: string) => priorityLevels.indexOf(a as any) < priorityLevels.indexOf(b as any);
    const biasUp = levelResults.filter(r => !r.priority_correct && r.actual_recommandation && higherThan(r.actual_recommandation, level)).length;
    const biasDown = levelResults.filter(r => !r.priority_correct && r.actual_recommandation && higherThan(level, r.actual_recommandation)).length;
    totalBiasUp += biasUp;
    totalBiasDown += biasDown;
    const biasStr = biasUp > 0 || biasDown > 0 ? ` (↑ surclassé:${biasUp} ↓ sous-classé:${biasDown})` : '';
    console.log(`  ${level.padEnd(20)}: ${correct}/${levelResults.length}${biasStr}`);
  }
  console.log(`  Biais global → surclassement: ${totalBiasUp} | sous-classement: ${totalBiasDown}`);

  // Priority failures detail
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
      console.log(`  [${f.id}] Expected ${f.expected_decision}/${f.expected_recommandation}, got ${f.actual_decision ?? 'ERROR'}/${f.actual_recommandation ?? 'ERROR'}`);
      console.log(`         Sources: [${f.rag_sources.join(', ')}]`);
    }
  }

  console.log('═'.repeat(60));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const verbose = process.argv.includes('--verbose');
  const filter = process.argv.find(a => a.startsWith('--id='))?.replace('--id=', '');

  const casesToRun = filter
    ? EVAL_CASES.filter(c => c.id === filter)
    : EVAL_CASES;

  if (casesToRun.length === 0) {
    console.error(`No eval cases found matching filter: ${filter}`);
    process.exit(1);
  }

  console.log(`🧪 Running ${casesToRun.length} eval cases...`);
  if (filter) console.log(`   (filtered to: ${filter})`);

  const results: EvalResult[] = [];

  // Sequential to avoid rate limits
  for (const evalCase of casesToRun) {
    const result = await runEval(evalCase, verbose);
    results.push(result);
    // Delay to avoid TPM rate limit (gpt-4o: 30k TPM requires ~20s between cases)
    await new Promise(resolve => setTimeout(resolve, 20000));
  }

  printReport(results);
}

main().catch(err => {
  console.error('❌ Eval failed:', err);
  process.exit(1);
});
