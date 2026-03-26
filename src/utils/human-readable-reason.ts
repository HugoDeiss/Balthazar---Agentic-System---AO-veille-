/**
 * Build a human-readable explanation of why an AO was kept or discarded.
 */
export function buildHumanReadableReason(ao: any): string {
  if (ao._skipLLM) {
    const score = ao.keywordDetails?.score ?? '?';
    return `Écarté automatiquement — score mots-clés insuffisant (${score}/100)`;
  }

  if (ao.semanticDetails?.decision_gate === 'REJECT') {
    return `Écarté : ${ao.semanticDetails.rejet_raison}`;
  }

  if (ao.priority === 'HIGH') {
    const score = ao.semanticDetails?.score_semantique_global ?? '?';
    return `Retenu — forte adéquation (score ${score}/10)`;
  }

  if (ao.priority === 'MEDIUM') {
    const score = ao.semanticDetails?.score_semantique_global ?? '?';
    return `Retenu avec réserves (score ${score}/10)`;
  }

  return ao.semanticReason ?? 'Analyse disponible';
}
