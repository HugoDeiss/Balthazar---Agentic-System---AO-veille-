/**
 * Lexique Balthazar - Mots-clés et patterns pour scoring des AO
 * 
 * Basé sur les secteurs cibles et expertises Balthazar Consulting
 */

export const balthazarLexicon = {
  // SECTEURS CIBLES (pondération 3x - critère #1 Balthazar)
  secteurs: {
    mobilite: {
      weight: 3,
      keywords: [
        "mobilité", "mobilités", "transport", "transports",
        "voyageur", "voyageurs", "fret", "logistique",
        "sncf", "ratp", "transdev", "keolis", "ouigo", "getlink",
        "ferroviaire", "ferré", "autoroutier", "autoroute",
        "métro", "tramway", "bus", "multimodal", "gare",
        "infrastructure", "infrastructures", "tisseo", "atmb"
      ],
      patterns: [
        /mobilit(é|e)s?/i,
        /transport(s|eur)?/i,
        /logistique/i,
        /ferrovia(ire|ux)/i
      ]
    },
    assurance: {
      weight: 3,
      keywords: [
        "assurance", "assureur", "mutuelle", "mutuelles",
        "maif", "groupama", "prévoyance", "protection sociale",
        "carsat", "cpam", "sécurité sociale"
      ],
      patterns: [
        /assuran(ce|tiel)/i,
        /mutuelle/i,
        /pr(é|e)voyan(ce|t)/i
      ]
    },
    energie: {
      weight: 3,
      keywords: [
        "énergie", "energie", "énergétique", "energetique",
        "edf", "engie", "grt gaz", "grdf", "rte",
        "transition énergétique", "décarbonation", "décarboner",
        "renouvelable", "renouvelables", "solaire", "éolien"
      ],
      patterns: [
        /(é|e)nergi(e|que)/i,
        /d(é|e)carbon/i,
        /renouvelabl/i
      ]
    },
    service_public: {
      weight: 3,
      keywords: [
        "service public", "services publics", "opérateur public",
        "établissement public", "collectivité", "collectivités",
        "commune", "métropole", "région", "département",
        "intercommunalité", "epci", "syndicat"
      ],
      patterns: [
        /service(s)?\s+public/i,
        /op(é|e)rateur\s+public/i,
        /collectivit(é|e)/i,
        /(é|e)tablissement\s+public/i
      ]
    },
    entreprise_mission: {
      weight: 3,
      keywords: [
        "entreprise à mission", "société à mission",
        "raison d'être", "raison d'etre",
        "mission sociale", "impact sociétal", "purpose"
      ],
      patterns: [
        /soci(é|e)t(é|e)\s+(à|a)\s+mission/i,
        /entreprise\s+(à|a)\s+mission/i,
        /raison\s+d['']?(é|e)tre/i
      ]
    }
  },

  // EXPERTISES MÉTIER (pondération 2x - critère #2 Balthazar)
  expertises: {
    strategie: {
      weight: 2,
      keywords: [
        "stratégie", "strategie", "stratégique", "strategique",
        "plan stratégique", "diagnostic stratégique",
        "business model", "modèle économique",
        "trajectoire", "vision", "orientation",
        "feuille de route", "roadmap", "road map"
      ],
      patterns: [
        /strat(é|e)gi(e|que)/i,
        /business\s+model/i,
        /feuille\s+de\s+route/i,
        /plan\s+strat(é|e)gique/i
      ]
    },
    transformation: {
      weight: 2,
      keywords: [
        "transformation", "mutation", "évolution",
        "refonte", "modernisation", "restructuration",
        "conduite du changement", "conduite changement",
        "change management", "accompagnement changement"
      ],
      patterns: [
        /transformation/i,
        /conduite\s+(du\s+)?changement/i,
        /change\s+management/i,
        /modernisation/i
      ]
    },
    raison_etre: {
      weight: 2,
      keywords: [
        "raison d'être", "raison d'etre", "raison detre",
        "société à mission", "societe a mission",
        "passage en société à mission",
        "mission sociale", "purpose"
      ],
      patterns: [
        /raison\s+d['']?(é|e)tre/i,
        /soci(é|e)t(é|e)\s+(à|a)\s+mission/i,
        /passage\s+en\s+soci(é|e)t(é|e)/i
      ]
    },
    gouvernance: {
      weight: 2,
      keywords: [
        "gouvernance", "codir", "comex", "comité direction",
        "direction générale", "management", "pilotage",
        "organisation", "engagement collectif",
        "séminaire direction", "séminaire codir"
      ],
      patterns: [
        /gouvernance/i,
        /co(m(ex|dir))/i,
        /comit(é|e)\s+(de\s+)?direction/i,
        /engagement\s+collectif/i
      ]
    },
    rse: {
      weight: 2,
      keywords: [
        "rse", "responsabilité sociétale",
        "développement durable", "esg",
        "transition écologique", "impact environnemental",
        "bilan carbone", "neutralité carbone"
      ],
      patterns: [
        /\brse\b/i,
        /responsabilit(é|e)\s+soci(é|e)tal/i,
        /d(é|e)veloppement\s+durable/i,
        /\besg\b/i
      ]
    },
    experience_usager: {
      weight: 2,
      keywords: [
        "expérience usager", "experience usager",
        "expérience client", "relation client",
        "parcours usager", "satisfaction", "service usager"
      ],
      patterns: [
        /exp(é|e)rience\s+(usager|client)/i,
        /relation\s+client/i,
        /parcours\s+usager/i
      ]
    }
  },

  // POSTURE INTERVENTION (pondération 1x - bonus)
  posture: {
    weight: 1,
    keywords: [
      "diagnostic", "audit", "état des lieux", "analyse",
      "atelier", "ateliers", "co-construction", "coconstruction",
      "participatif", "participative", "concertation",
      "accompagnement", "déploiement", "mise en œuvre",
      "mise en oeuvre", "plan d'action", "plan d'actions"
    ],
    patterns: [
      /diagnostic/i,
      /co-?construction/i,
      /atelier(s)?/i,
      /accompagnement/i,
      /(é|e)tat\s+des\s+lieux/i
    ]
  },

  // RED FLAGS ÉLIMINATOIRES (détection pour signaler, pas pour bloquer)
  red_flags: {
    keywords: [
      "juridique pur", "avocat", "contentieux",
      "amo travaux", "maîtrise d'œuvre", "maîtrise d'oeuvre",
      "opc", "bâtiment", "construction",
      "informatique", "développement logiciel", "infrastructure it",
      "hébergement", "serveur",
      "actuariat", "actuaire",
      "formation catalogue", "organisme de formation",
      "nettoyage", "entretien", "maintenance technique"
    ],
    patterns: [
      /amo\s+travaux/i,
      /ma(î|i)trise\s+d['']?(œ|o)euvre/i,
      /d(é|e)veloppement\s+logiciel/i,
      /actuari(at|el)/i,
      /formation\s+catalogue/i
    ]
  }
} as const;

/**
 * Normalise un texte pour matching robuste
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')                    // Décomposer accents
    .replace(/[\u0300-\u036f]/g, '')    // Supprimer accents
    .replace(/['']/g, "'")              // Normaliser apostrophes
    .replace(/\s+/g, ' ')               // Normaliser espaces
    .trim();
}

/**
 * Résultat d'une analyse de match par catégorie
 */
export interface CategoryMatch {
  category: string;
  keywords: string[];
  score: number;
}

/**
 * Résultat complet du scoring keywords amélioré
 */
export interface KeywordScoreResult {
  score: number;                    // Score 0-100 (compatible avec 0-10 via /10)
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  secteur_matches: CategoryMatch[];
  expertise_matches: CategoryMatch[];
  posture_matches: string[];
  red_flags_detected: string[];
  breakdown: {
    secteur_score: number;    // Max 45 points
    expertise_score: number;  // Max 40 points
    posture_score: number;    // Max 15 points
  };
  allMatches: string[];        // Tous les keywords matchés (pour compatibilité)
}

/**
 * Calcule le score keywords amélioré pour un AO
 */
export function calculateKeywordScore(
  title: string,
  description: string | undefined,
  keywords: string[] | undefined,
  acheteur: string | undefined
): KeywordScoreResult {
  // 1. Construire texte analysable (depuis aoSchema réel)
  const fullText = normalizeText([
    title,
    description || '',
    keywords?.join(' ') || '',
    acheteur || ''
  ].join(' '));

  // 2. VÉRIFIER RED FLAGS (signal mais pas bloquant)
  const redFlagsDetected: string[] = [];
  
  for (const keyword of balthazarLexicon.red_flags.keywords) {
    if (fullText.includes(normalizeText(keyword))) {
      redFlagsDetected.push(keyword);
    }
  }
  
  for (const pattern of balthazarLexicon.red_flags.patterns) {
    const match = fullText.match(pattern);
    if (match) {
      redFlagsDetected.push(match[0]);
    }
  }

  // 3. MATCHING SECTEURS (max 45 points = 5 secteurs × 9 points max chacun)
  const secteurMatches: CategoryMatch[] = [];
  let secteurScore = 0;
  
  for (const [category, config] of Object.entries(balthazarLexicon.secteurs)) {
    const matches: string[] = [];
    
    // Match keywords
    for (const keyword of config.keywords) {
      if (fullText.includes(normalizeText(keyword))) {
        matches.push(keyword);
      }
    }
    
    // Match patterns
    for (const pattern of config.patterns) {
      const patternMatches = fullText.match(pattern);
      if (patternMatches) {
        matches.push(...patternMatches);
      }
    }
    
    if (matches.length > 0) {
      // Score = min(3 matches, max) × weight × 3 (plafonné 9 par catégorie)
      const uniqueMatches = [...new Set(matches)];
      const matchCount = Math.min(uniqueMatches.length, 3); // Max 3 matches comptent
      const categoryScore = Math.min(9, matchCount * config.weight * 3);
      secteurScore += categoryScore;
      
      secteurMatches.push({
        category,
        keywords: uniqueMatches,
        score: categoryScore
      });
    }
  }
  
  secteurScore = Math.min(45, secteurScore); // Plafond 45

  // 4. MATCHING EXPERTISES (max 40 points = 6 expertises × ~7 points max)
  const expertiseMatches: CategoryMatch[] = [];
  let expertiseScore = 0;
  
  for (const [category, config] of Object.entries(balthazarLexicon.expertises)) {
    const matches: string[] = [];
    
    for (const keyword of config.keywords) {
      if (fullText.includes(normalizeText(keyword))) {
        matches.push(keyword);
      }
    }
    
    for (const pattern of config.patterns) {
      const patternMatches = fullText.match(pattern);
      if (patternMatches) {
        matches.push(...patternMatches);
      }
    }
    
    if (matches.length > 0) {
      const uniqueMatches = [...new Set(matches)];
      const matchCount = Math.min(uniqueMatches.length, 3); // Max 3 matches comptent
      const categoryScore = Math.min(10, matchCount * config.weight * 3);
      expertiseScore += categoryScore;
      
      expertiseMatches.push({
        category,
        keywords: uniqueMatches,
        score: categoryScore
      });
    }
  }
  
  expertiseScore = Math.min(40, expertiseScore); // Plafond 40

  // 5. MATCHING POSTURE (max 15 points - bonus)
  const postureMatches: string[] = [];
  let postureScore = 0;
  
  for (const keyword of balthazarLexicon.posture.keywords) {
    if (fullText.includes(normalizeText(keyword))) {
      postureMatches.push(keyword);
    }
  }
  
  for (const pattern of balthazarLexicon.posture.patterns) {
    const matches = fullText.match(pattern);
    if (matches) {
      postureMatches.push(...matches);
    }
  }
  
  if (postureMatches.length > 0) {
    const uniqueMatches = [...new Set(postureMatches)];
    const matchCount = Math.min(uniqueMatches.length, 5); // Max 5 matches comptent
    postureScore = Math.min(15, matchCount * balthazarLexicon.posture.weight * 3);
  }

  // 6. CALCUL SCORE FINAL (0-100)
  const finalScore = Math.round(secteurScore + expertiseScore + postureScore);
  
  // 7. DÉTERMINER CONFIDENCE (basé sur score, pas sur nombre de catégories)
  const confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 
    finalScore >= 60 ? 'HIGH' :
    finalScore >= 30 ? 'MEDIUM' : 'LOW';

  // 8. Tous les matches pour compatibilité
  const allMatches = [
    ...secteurMatches.flatMap(m => m.keywords),
    ...expertiseMatches.flatMap(m => m.keywords),
    ...postureMatches
  ];

  return {
    score: finalScore,
    confidence,
    secteur_matches: secteurMatches,
    expertise_matches: expertiseMatches,
    posture_matches: [...new Set(postureMatches)],
    red_flags_detected: redFlagsDetected,
    breakdown: {
      secteur_score: secteurScore,
      expertise_score: expertiseScore,
      posture_score: postureScore
    },
    allMatches: [...new Set(allMatches)]
  };
}