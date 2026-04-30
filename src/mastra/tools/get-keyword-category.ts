import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { balthazarLexicon, normalizeText } from '../../utils/balthazar-keywords';

const CATEGORY_LABELS: Record<string, { label: string; description: string }> = {
  mobilite: { label: 'Secteur — Mobilité & Transport', description: 'Opérateurs de transport, mobilité urbaine, infrastructure ferroviaire, routière, covoiturage, mobilité douce.' },
  assurance: { label: 'Secteur — Assurance & Protection sociale', description: 'Assureurs, mutuelles, organismes de protection sociale, prévoyance, santé.' },
  energie: { label: 'Secteur — Énergie & Transition énergétique', description: 'Producteurs et gestionnaires d\'énergie, transition énergétique, décarbonation, renouvelables.' },
  service_public: { label: 'Secteur — Service public & Collectivités', description: 'Collectivités territoriales, établissements publics, opérateurs publics.' },
  entreprise_mission: { label: 'Secteur — Entreprise à mission (cœur métier)', description: 'Sociétés à mission, raison d\'être, B Corp, impact sociétal. Pondération renforcée (weight 4).' },
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
  posture: { label: 'Posture d\'intervention', description: 'Diagnostic, ateliers, co-construction, facilitation, séminaire, accompagnement stratégique.' },
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
  execute: async ({ keyword }) => {
    const normalized = normalizeText(keyword);
    const matches: Array<{ category_key: string; category_label: string; category_description: string; weight: number; is_red_flag: boolean }> = [];

    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordBoundaryRe = new RegExp(`\\b${escaped}\\b`);
    const kwMatches = (kw: string): boolean => {
      const kwNorm = normalizeText(kw);
      return kwNorm === normalized || wordBoundaryRe.test(kwNorm) || normalized.includes(kwNorm);
    };

    for (const [key, config] of Object.entries(balthazarLexicon.secteurs)) {
      const found = config.keywords.some(kwMatches);
      const patternMatch = config.patterns.some(p => p.test(keyword));
      if (found || patternMatch) {
        const meta = CATEGORY_LABELS[key] ?? { label: key, description: '' };
        matches.push({ category_key: key, category_label: meta.label, category_description: meta.description, weight: config.weight, is_red_flag: false });
      }
    }

    for (const [key, config] of Object.entries(balthazarLexicon.expertises)) {
      const found = config.keywords.some(kwMatches);
      const patternMatch = config.patterns.some(p => p.test(keyword));
      if (found || patternMatch) {
        const meta = CATEGORY_LABELS[key] ?? { label: key, description: '' };
        matches.push({ category_key: key, category_label: meta.label, category_description: meta.description, weight: config.weight, is_red_flag: false });
      }
    }

    const postureFound = balthazarLexicon.posture.keywords.some(kwMatches);
    const posturePattern = balthazarLexicon.posture.patterns.some(p => p.test(keyword));
    if (postureFound || posturePattern) {
      const meta = CATEGORY_LABELS['posture'] ?? { label: 'posture', description: '' };
      matches.push({ category_key: 'posture', category_label: meta.label, category_description: meta.description, weight: balthazarLexicon.posture.weight, is_red_flag: false });
    }

    const rfFound = balthazarLexicon.red_flags.keywords.some(kwMatches);
    const rfPattern = balthazarLexicon.red_flags.patterns.some(p => p.test(keyword));
    if (rfFound || rfPattern) {
      const meta = CATEGORY_LABELS['red_flags'] ?? { label: 'red_flags', description: '' };
      matches.push({ category_key: 'red_flags', category_label: meta.label, category_description: meta.description, weight: 0, is_red_flag: true });
    }

    const positiveMatches = matches.filter(m => !m.is_red_flag);
    const redFlagMatch = matches.find(m => m.is_red_flag);
    let summary: string;
    if (matches.length === 0) {
      summary = `"${keyword}" n'est pas dans le lexique Balthazar. Il a peut-être matché via un pattern regex ou c'est un faux positif à investiguer.`;
    } else if (redFlagMatch && positiveMatches.length === 0) {
      summary = `"${keyword}" est un red flag : ${redFlagMatch.category_description} Il signale que l'AO est probablement hors périmètre Balthazar.`;
    } else if (redFlagMatch && positiveMatches.length > 0) {
      const posLine = positiveMatches.map(m => `${m.category_label} (weight: ${m.weight})`).join(', ');
      summary = `"${keyword}" est classé dans ${posLine}. Cependant, il est aussi signalé comme red flag potentiel dans certains contextes : ${redFlagMatch.category_description}`;
    } else {
      summary = positiveMatches.map(m => `"${keyword}" → ${m.category_label} (weight: ${m.weight}). ${m.category_description}`).join('\n');
    }

    return { found: matches.length > 0, keyword: keyword, matches, summary };
  },
});
