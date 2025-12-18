/**
 * Exemple d'utilisation du boampAgent
 * 
 * Ce fichier montre comment utiliser le boampAgent pour analyser
 * des appels d'offres BOAMP.
 */

import { analyzeAO, analyzeSemanticRelevance, analyzeFeasibility, analyzeCompetitiveness } from './boamp-agent';

// ──────────────────────────────────────────────────
// DONNÉES DE TEST
// ──────────────────────────────────────────────────

/** Exemple de profil client */
const exampleClient = {
  id: 'client-001',
  name: 'Digital Solutions SARL',
  email: 'contact@digitalsolutions.fr',
  preferences: {
    typeMarche: 'SERVICES' as const
  },
  criteria: {
    minBudget: 50000,
    regions: ['75', '92', '93', '94']  // Île-de-France
  },
  keywords: [
    'développement web',
    'application mobile',
    'cloud',
    'api',
    'react',
    'nodejs'
  ],
  profile: {
    description: 'Société spécialisée dans le développement d\'applications web et mobile',
    sectors: ['Administration publique', 'Santé', 'Éducation'],
    technologies: ['React', 'Node.js', 'AWS', 'PostgreSQL'],
    certifications: ['ISO 9001', 'RGPD']
  },
  financial: {
    revenue: 1200000,      // 1.2M€ de CA
    employees: 15,         // 15 employés
    yearsInBusiness: 7     // 7 ans d'expérience
  },
  technical: {
    references: 12         // 12 projets similaires
  }
};

/** Exemple d'appel d'offres BOAMP */
const exampleAO = {
  source: 'BOAMP',
  source_id: '25-12345',
  title: 'Développement d\'une plateforme web de gestion des services publics',
  description: 'La mairie de Paris recherche un prestataire pour développer une plateforme web permettant aux citoyens de gérer leurs démarches administratives en ligne. La solution devra inclure un espace citoyen, un back-office pour les agents, et des API pour l\'intégration avec les systèmes existants.',
  keywords: ['développement web', 'plateforme', 'services publics', 'api'],
  acheteur: 'Mairie de Paris',
  acheteur_email: 'marches@paris.fr',
  budget_min: null,
  budget_max: 250000,
  deadline: '2026-02-15',
  publication_date: '2025-12-18',
  type_marche: 'SERVICES',
  region: '75',
  url_ao: 'https://www.boamp.fr/avis/25-12345',
  procedure_libelle: 'Procédure ouverte',
  criteres: {
    prix: 40,
    valeur_technique: 60
  },
  raw_json: {
    donnees: JSON.stringify({
      CONDITION_PARTICIPATION: {
        CA_MIN: 500000,
        EFFECTIF_MIN: 10,
        REFERENCES_MIN: 5,
        CERTIFICATIONS: ['ISO 9001']
      },
      OBJET: {
        OBJET_COMPLET: 'Développement d\'une plateforme web de gestion des services publics incluant espace citoyen, back-office agents, et API d\'intégration'
      }
    }),
    procedure_libelle: 'Procédure ouverte',
    criteres: {
      prix: 40,
      valeur_technique: 60
    }
  }
};

/** Exemple d'AO non faisable (critères trop stricts) */
const exampleAONotFeasible = {
  source: 'BOAMP',
  source_id: '25-67890',
  title: 'Refonte du système d\'information national de la santé',
  description: 'Projet de grande envergure pour la refonte complète du SI national de la santé. Nécessite une expérience significative sur des projets similaires.',
  keywords: ['système d\'information', 'santé', 'grande envergure'],
  acheteur: 'Ministère de la Santé',
  acheteur_email: 'marches@sante.gouv.fr',
  budget_min: null,
  budget_max: 5000000,
  deadline: '2026-01-10',
  publication_date: '2025-12-18',
  type_marche: 'SERVICES',
  region: '75',
  url_ao: 'https://www.boamp.fr/avis/25-67890',
  procedure_libelle: 'Procédure restreinte',
  criteres: null,
  raw_json: {
    donnees: JSON.stringify({
      CONDITION_PARTICIPATION: {
        CA_MIN: 10000000,      // 10M€ minimum (trop élevé)
        EFFECTIF_MIN: 100,     // 100 employés minimum (trop élevé)
        REFERENCES_MIN: 20,    // 20 références (trop élevé)
        CERTIFICATIONS: ['ISO 27001', 'HDS']  // Certifications manquantes
      }
    }),
    procedure_libelle: 'Procédure restreinte'
  }
};

// ──────────────────────────────────────────────────
// EXEMPLES D'UTILISATION
// ──────────────────────────────────────────────────

/**
 * Exemple 1 : Analyse sémantique uniquement
 */
export async function example1_semanticAnalysis() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('EXEMPLE 1 : Analyse Sémantique');
  console.log('═══════════════════════════════════════════════════\n');

  const result = await analyzeSemanticRelevance(exampleAO, exampleClient);

  console.log(`📊 Score de pertinence : ${result.score}/10`);
  console.log(`💬 Justification : ${result.reason}`);
}

/**
 * Exemple 2 : Analyse de faisabilité uniquement
 */
export async function example2_feasibilityAnalysis() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('EXEMPLE 2 : Analyse de Faisabilité');
  console.log('═══════════════════════════════════════════════════\n');

  const result = await analyzeFeasibility(exampleAO, exampleClient);

  console.log(`💰 Critères financiers : ${result.financial ? '✅' : '❌'}`);
  console.log(`🔧 Critères techniques : ${result.technical ? '✅' : '❌'}`);
  console.log(`⏰ Délai suffisant : ${result.timing ? '✅' : '❌'}`);
  console.log(`📅 Jours restants : ${result.daysRemaining} jours`);
  console.log(`🎯 Confiance : ${result.confidence}`);

  if (result.blockers && result.blockers.length > 0) {
    console.log(`\n⚠️  Blockers identifiés :`);
    result.blockers.forEach((blocker: string) => {
      console.log(`   - ${blocker}`);
    });
  }

  if (result.warnings && result.warnings.length > 0) {
    console.log(`\n⚡ Avertissements :`);
    result.warnings.forEach((warning: string) => {
      console.log(`   ${warning}`);
    });
  }
}

/**
 * Exemple 3 : Analyse de compétitivité
 */
export async function example3_competitivenessAnalysis() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('EXEMPLE 3 : Analyse de Compétitivité');
  console.log('═══════════════════════════════════════════════════\n');

  // D'abord, obtenir les analyses préalables
  const semanticResult = await analyzeSemanticRelevance(exampleAO, exampleClient);
  const feasibilityResult = await analyzeFeasibility(exampleAO, exampleClient);

  // Puis analyser la compétitivité
  const result = await analyzeCompetitiveness(
    exampleAO,
    exampleClient,
    semanticResult.score,
    feasibilityResult
  );

  console.log(`🏆 Score de compétitivité : ${result.competitiveness_score}/10`);
  console.log(`📋 Recommandation : ${result.recommendation}`);

  console.log(`\n💪 Points forts :`);
  result.strengths.forEach((strength: string) => {
    console.log(`   ✓ ${strength}`);
  });

  console.log(`\n⚠️  Points faibles :`);
  result.weaknesses.forEach((weakness: string) => {
    console.log(`   • ${weakness}`);
  });

  console.log(`\n💡 Conseil stratégique :`);
  console.log(`   ${result.strategic_advice}`);
}

/**
 * Exemple 4 : Analyse complète (recommandé)
 */
export async function example4_fullAnalysis() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('EXEMPLE 4 : Analyse Complète');
  console.log('═══════════════════════════════════════════════════\n');

  const report = await analyzeAO(exampleAO, exampleClient);

  console.log(`📄 Appel d'offres : ${report.ao_title}`);
  console.log(`👤 Client : ${report.client_name}`);
  console.log(`📅 Analysé le : ${new Date(report.analyzed_at).toLocaleString('fr-FR')}`);

  console.log(`\n📊 PERTINENCE SÉMANTIQUE`);
  console.log(`   Score : ${report.semantic_analysis.score}/10`);
  console.log(`   Raison : ${report.semantic_analysis.reason}`);

  console.log(`\n✅ FAISABILITÉ`);
  console.log(`   Financier : ${report.feasibility_analysis.financial ? '✅' : '❌'}`);
  console.log(`   Technique : ${report.feasibility_analysis.technical ? '✅' : '❌'}`);
  console.log(`   Timing : ${report.feasibility_analysis.timing ? '✅' : '❌'}`);
  console.log(`   Confiance : ${report.feasibility_analysis.confidence}`);

  if (report.competitiveness_analysis) {
    console.log(`\n🏆 COMPÉTITIVITÉ`);
    console.log(`   Score : ${report.competitiveness_analysis.competitiveness_score}/10`);
    console.log(`   Recommandation : ${report.competitiveness_analysis.recommendation}`);
    console.log(`   Conseil : ${report.competitiveness_analysis.strategic_advice}`);
  }

  console.log(`\n🎯 RECOMMANDATION FINALE : ${report.final_recommendation}`);
}

/**
 * Exemple 5 : Analyse d'un AO non faisable
 */
export async function example5_notFeasibleAO() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('EXEMPLE 5 : AO Non Faisable');
  console.log('═══════════════════════════════════════════════════\n');

  const report = await analyzeAO(exampleAONotFeasible, exampleClient);

  console.log(`📄 Appel d'offres : ${report.ao_title}`);
  console.log(`👤 Client : ${report.client_name}`);

  console.log(`\n✅ FAISABILITÉ`);
  console.log(`   Financier : ${report.feasibility_analysis.financial ? '✅' : '❌'}`);
  console.log(`   Technique : ${report.feasibility_analysis.technical ? '✅' : '❌'}`);
  console.log(`   Timing : ${report.feasibility_analysis.timing ? '✅' : '❌'}`);

  if (report.feasibility_analysis.blockers && report.feasibility_analysis.blockers.length > 0) {
    console.log(`\n⚠️  Blockers :`);
    report.feasibility_analysis.blockers.forEach((blocker: string) => {
      console.log(`   - ${blocker}`);
    });
  }

  console.log(`\n🎯 RECOMMANDATION FINALE : ${report.final_recommendation}`);
  console.log(`\n💬 Note : L'analyse de compétitivité n'est pas effectuée pour les AO non faisables.`);
}

/**
 * Exemple 6 : Analyse batch de plusieurs AO
 */
export async function example6_batchAnalysis() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('EXEMPLE 6 : Analyse Batch (Plusieurs AO)');
  console.log('═══════════════════════════════════════════════════\n');

  const aos = [exampleAO, exampleAONotFeasible];

  const reports = await Promise.all(
    aos.map(ao => analyzeAO(ao, exampleClient))
  );

  console.log(`📊 Résumé de l'analyse de ${reports.length} AO :\n`);

  reports.forEach((report, index) => {
    console.log(`${index + 1}. ${report.ao_title}`);
    console.log(`   Pertinence : ${report.semantic_analysis.score}/10`);
    console.log(`   Faisable : ${report.is_feasible ? 'OUI' : 'NON'}`);
    console.log(`   Recommandation : ${report.final_recommendation}`);
    console.log('');
  });

  const goCount = reports.filter(r => r.final_recommendation === 'GO').length;
  const maybeCount = reports.filter(r => r.final_recommendation === 'MAYBE').length;
  const noGoCount = reports.filter(r => r.final_recommendation === 'NO-GO').length;

  console.log(`\n📈 Statistiques :`);
  console.log(`   ✅ GO : ${goCount}`);
  console.log(`   ⚠️  MAYBE : ${maybeCount}`);
  console.log(`   ❌ NO-GO : ${noGoCount}`);
}

// ──────────────────────────────────────────────────
// FONCTION PRINCIPALE
// ──────────────────────────────────────────────────

/**
 * Exécute tous les exemples
 */
export async function runAllExamples() {
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║   EXEMPLES D\'UTILISATION DU BOAMP AGENT          ║');
  console.log('╚═══════════════════════════════════════════════════╝');

  try {
    await example1_semanticAnalysis();
    await example2_feasibilityAnalysis();
    await example3_competitivenessAnalysis();
    await example4_fullAnalysis();
    await example5_notFeasibleAO();
    await example6_batchAnalysis();

    console.log('\n✅ Tous les exemples ont été exécutés avec succès !\n');
  } catch (error) {
    console.error('\n❌ Erreur lors de l\'exécution des exemples :', error);
  }
}

// Exécuter si le fichier est lancé directement
if (require.main === module) {
  runAllExamples();
}

