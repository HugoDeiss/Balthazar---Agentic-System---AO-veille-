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
        "infrastructure", "infrastructures", "tisseo", "atmb",
        // Ajouts recommandés
        "idfm", "île-de-france mobilités", "ile-de-france mobilites",
        "sytral", "tcl lyon", "tisseo mobilites",
        "sncf fret", "sncf voyageurs", "sncf réseau", "sncf reseau",
        "lagardère travel retail", "lagardere travel retail",
        "concession autoroutière", "concessionnaire",
        "opérateur de mobilité", "operateur de mobilite",
        "mobilité urbaine", "mobilite urbaine",
        "intermodalité", "intermodalite",
        "plan de déplacements", "plan de deplacement",
        "parking", "stationnement", "covoiturage",
        "vélo", "velo", "piste cyclable", "trottinette"
      ],
      patterns: [
        /mobilit(é|e)s?/i,
        /transport(s|eur)?/i,
        /logistique/i,
        /ferrovia(ire|ux)/i,
        /concession\s+(autoroutière|autoroutiere)/i,
        /op(é|e)rateur\s+de\s+mobilit(é|e)/i
      ]
    },
    assurance: {
      weight: 3,
      keywords: [
        "assurance", "assureur", "mutuelle", "mutuelles",
        "maif", "groupama", "prévoyance", "protection sociale",
        "carsat", "cpam", "sécurité sociale",
        "gca", "groupement crédit agricole", "groupement credit agricole",
        // Ajouts recommandés
        "santé", "sante", "maladie", "retraite",
        "indemnisation", "sinistre", "prestation",
        "adhérent", "adherent", "sociétaire", "societaire",
        "cotisation", "couverture sociale"
      ],
      patterns: [
        /assuran(ce|tiel)/i,
        /mutuelle/i,
        /pr(é|e)voyan(ce|t)/i,
        /s(é|e)curit(é|e)\s+sociale/i
      ]
    },
    energie: {
      weight: 3,
      keywords: [
        "énergie", "energie", "énergétique", "energetique",
        "edf", "engie", "grt gaz", "grdf", "rte",
        "transition énergétique", "décarbonation", "décarboner",
        "renouvelable", "renouvelables", "solaire", "éolien",
        // Ajouts recommandés
        "gestionnaire réseau", "gestionnaire reseau",
        "réseau électrique", "reseau electrique",
        "gaz naturel", "electricité", "electricite",
        "smart grid", "compteur linky",
        "mix énergétique", "mix energetique",
        "efficacité énergétique", "efficacite energetique",
        "photovoltaïque", "photovoltaique",
        "hydrogène", "hydrogene", "biomasse"
      ],
      patterns: [
        /(é|e)nergi(e|que)/i,
        /d(é|e)carbon/i,
        /renouvelabl/i,
        /r(é|e)seau\s+(é|e)lectrique/i,
        /smart\s+grid/i,
        /mix\s+(é|e)nerg(é|e)tique/i
      ]
    },
    service_public: {
      weight: 3,
      keywords: [
        "service public", "services publics", "opérateur public",
        "établissement public", "collectivité", "collectivités",
        "commune", "métropole", "région", "département",
        "intercommunalité", "epci", "syndicat",
        // Ajouts recommandés
        "administration", "territoriale",
        "conseil régional", "conseil regional",
        "conseil départemental", "conseil departemental",
        "mairie", "préfecture", "prefecture",
        "agence publique", "office public",
        "régie", "regie", "sem", "spl",
        "politique publique"
      ],
      patterns: [
        /service(s)?\s+public/i,
        /op(é|e)rateur\s+public/i,
        /collectivit(é|e)/i,
        /(é|e)tablissement\s+public/i,
        /conseil\s+(r(é|e)gional|d(é|e)partemental)/i
      ]
    },
    entreprise_mission: {
      weight: 4, // ⚠️ Pondération plus forte (cœur métier Balthazar)
      keywords: [
        "entreprise à mission", "société à mission",
        "raison d'être", "raison d'etre",
        "mission sociale", "impact sociétal", "purpose",
        // Ajouts recommandés
        "b corp", "bcorp", "label lucie",
        "entreprise engagée", "entreprise engagee",
        "utilité sociale", "utilite sociale",
        "intérêt général", "interet general",
        "certification mission"
      ],
      patterns: [
        /soci(é|e)t(é|e)\s+(à|a)\s+mission/i,
        /entreprise\s+(à|a)\s+mission/i,
        /raison\s+d['']?(é|e)tre/i,
        /\bb\s*corp\b/i
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
        "feuille de route", "roadmap", "road map",
        // Ajouts recommandés
        "plan d'entreprise", "plan d'action",
        "ambition", "objectifs stratégiques",
        "positionnement", "différenciation",
        "benchmark", "état des lieux",
        "diagnostic", "swot", "analyse concurrentielle",
        "prospective", "scénarios"
      ],
      patterns: [
        /strat(é|e)gi(e|que)/i,
        /business\s+model/i,
        /feuille\s+de\s+route/i,
        /plan\s+strat(é|e)gique/i,
        /objectifs\s+strat(é|e)giques/i
      ]
    },
    transformation: {
      weight: 2,
      keywords: [
        "transformation", "mutation", "évolution",
        "refonte", "modernisation", "restructuration",
        "conduite du changement", "conduite changement",
        "change management", "accompagnement changement",
        // Ajouts recommandés
        "transformation digitale", "transformation numérique",
        "mutation organisationnelle",
        "réorganisation", "reorganisation",
        "agilité", "agilite", "méthode agile",
        "lean", "amélioration continue",
        "innovation organisationnelle"
      ],
      patterns: [
        /transformation/i,
        /conduite\s+(du\s+)?changement/i,
        /change\s+management/i,
        /modernisation/i,
        /transformation\s+(digitale|num(é|e)rique)/i,
        /m(é|e)thode\s+agile/i
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
        "séminaire direction", "séminaire codir",
        // Ajouts recommandés
        "conseil d'administration", "conseil administration",
        "directoire", "comité stratégique",
        "organigramme", "schéma d'organisation",
        "délégation", "delegation",
        "processus décisionnel", "processus decisionnel",
        "séminaire stratégique", "seminaire strategique"
      ],
      patterns: [
        /gouvernance/i,
        /co(m(ex|dir))/i,
        /comit(é|e)\s+(de\s+)?direction/i,
        /engagement\s+collectif/i,
        /conseil\s+d['']?administration/i,
        /processus\s+d(é|e)cisionnel/i
      ]
    },
    rse: {
      weight: 2,
      keywords: [
        "rse", "responsabilité sociétale",
        "développement durable", "esg",
        "transition écologique", "impact environnemental",
        "bilan carbone", "neutralité carbone",
        // Ajouts recommandés
        "iso 26000", "iso 14001",
        "empreinte carbone",
        "reporting extra-financier", "dpef",
        "politique rse",
        "parties prenantes", "stakeholders",
        "diversité", "diversite", "inclusion",
        "handicap", "égalité", "egalite",
        "mécénat", "mecenat", "sponsoring social"
      ],
      patterns: [
        /\brse\b/i,
        /responsabilit(é|e)\s+soci(é|e)tal/i,
        /d(é|e)veloppement\s+durable/i,
        /\besg\b/i,
        /iso\s+(26000|14001)/i,
        /reporting\s+extra-financier/i
      ]
    },
    experience_usager: {
      weight: 2,
      keywords: [
        "expérience usager", "experience usager",
        "expérience client", "relation client",
        "parcours usager", "satisfaction", "service usager",
        // Ajouts recommandés
        "satisfaction client", "nps", "net promoter score",
        "enquête satisfaction", "enquete satisfaction",
        "écoute client", "ecoute client",
        "réclamation", "reclamation",
        "parcours client", "journey", "customer experience",
        "service après-vente", "sav",
        "qualité de service", "qualite de service",
        "accueil", "interface usager"
      ],
      patterns: [
        /exp(é|e)rience\s+(usager|client)/i,
        /relation\s+client/i,
        /parcours\s+usager/i,
        /net\s+promoter\s+score/i,
        /customer\s+experience/i
      ]
    },
    // 4 axes stratégiques Balthazar (NOUVEAU - CRITIQUE)
    strategie_developpement: {
      weight: 2,
      keywords: [
        "stratégie de développement", "trajectoire", "performance pérenne",
        "analyse de marché", "études prospectives", "étude d'opportunités",
        "business plan", "résilience", "robustesse modèle économique",
        "stratégie M&A", "croissance externe", "acquisition",
        "réponse appels d'offres complexes",
        "innovation", "lancement nouvelles activités"
      ],
      patterns: [
        /strat(é|e)gie\s+de\s+d(é|e)veloppement/i,
        /strat(é|e)gie\s+m&a/i,
        /croissance\s+externe/i
      ]
    },
    strategie_transformation: {
      weight: 2,
      keywords: [
        "stratégie de transformation", "co-construction",
        "analyse d'impact", "analyse de risque",
        "roadmap", "programme de transformation",
        "plan de performance", "déclinaison organisationnelle",
        "modèle opérationnel cible", "nouveau modèle opérationnel",
        "agilité", "méthode agile", "lean", "amélioration continue"
      ],
      patterns: [
        /strat(é|e)gie\s+de\s+transformation/i,
        /mod(è|e)le\s+op(é|e)rationnel\s+cible/i
      ]
    },
    strategie_responsable: {
      weight: 2,
      keywords: [
        "stratégie responsable", "impact", "écosystème",
        "feuille de route RSE", "csrd", "reporting extra-financier",
        "raison d'être", "singularité entreprise", "société à mission",
        "robustesse", "parties prenantes", "stakeholders",
        "transition écologique", "convention entreprises climat",
        "cec", "cem"
      ],
      patterns: [
        /strat(é|e)gie\s+responsable/i,
        /feuille\s+de\s+route\s+rse/i,
        /convention\s+entreprises\s+climat/i
      ]
    },
    strategie_mobilisation: {
      weight: 2,
      keywords: [
        "stratégie de mobilisation", "embarquer parties prenantes",
        "dynamique collective", "dynamique puissante",
        "projet d'entreprise", "plan de mobilisation",
        "sécurisation dynamique", "post rachat", "post fusion",
        "référentiel managérial", "transformation managériale",
        "engagement parties prenantes",
        "alignement", "codir", "comex",
        "séminaire stratégique", "séminaire direction"
      ],
      patterns: [
        /strat(é|e)gie\s+de\s+mobilisation/i,
        /projet\s+d['']?entreprise/i,
        /post\s+(rachat|fusion)/i
      ]
    }
  },

  // POSTURE INTERVENTION (pondération 1x - bonus)
  posture: {
    weight: 1,
    keywords: [
      // Existants
      "diagnostic", "audit", "état des lieux", "analyse",
      "atelier", "ateliers", "co-construction", "coconstruction",
      "participatif", "participative", "concertation",
      "accompagnement", "déploiement", "mise en œuvre",
      "mise en oeuvre", "plan d'action", "plan d'actions",
      // Ajouts recommandés
      "atelier participatif",
      "séminaire", "seminaire", "workshop",
      "entretien", "interview",
      "questionnaire", "enquête", "enquete",
      "brainstorming", "ideation",
      "co-design", "co-creation",
      "groupe de travail", "comité de pilotage", "copil",
      "démarche collaborative", "demarche collaborative",
      "facilitation", "animation",
      "formation-action",
      // Méthodologie Balthazar (NOUVEAU - CRITIQUE)
      "co-création",
      "intelligence collective", "réflexion collective",
      "alignement", "aligner parties prenantes",
      "embarquer", "embarquement", "mobilisation",
      "adhésion", "adhérer", "appropriation",
      "séminaire codir", "seminaire codir", "atelier codir",
      "séminaire comex", "seminaire comex", "atelier comex",
      "séminaire direction", "seminaire direction",
      "séminaire stratégique", "seminaire strategique",
      "diagnostic stratégique", "diagnostic strategique",
      "matrice de scénarios", "matrice de scenarios",
      "note d'ambition", "note ambition",
      "récit", "récit stratégique", "recit strategique",
      "feuille de route", "roadmap",
      "plan de transformation", "plan transformation",
      "dispositif de gouvernance", "gouvernance pilotage",
      "rituels managériaux", "rituels manageriaux",
      "singularité", "singularite", "adn entreprise",
      "essentiel", "essence", "territoire singulier",
      "conviction", "vision assumée", "vision assumee",
      "ancrage", "pérennisation", "perennisation",
      "passage à l'action", "passage action",
      "deploiement"
    ],
    patterns: [
      /diagnostic/i,
      /co-?construction/i,
      /atelier(s)?/i,
      /accompagnement/i,
      /(é|e)tat\s+des\s+lieux/i,
      /atelier\s+participatif/i,
      /groupe\s+de\s+travail/i,
      /comit(é|e)\s+de\s+pilotage/i,
      /co-?(construction|design|cr(é|e)ation)/i,
      /s(é|e)minaire\s+(codir|comex|direction|strat(é|e)gique)/i,
      /alignement\s+parties\s+prenantes/i,
      /embarque(r|ment)/i,
      /singularit(é|e)/i,
      /passage\s+(à|a)\s+l.?action/i
    ]
  },

  // RED FLAGS (détection pour signaler, pas pour bloquer)
  red_flags: {
    keywords: [
      // Existants
      "juridique pur", "avocat", "contentieux",
      "amo travaux", "maîtrise d'œuvre", "maîtrise d'oeuvre",
      "opc", "bâtiment", "construction",
      "informatique", "développement logiciel", "infrastructure it",
      "hébergement", "serveur",
      "actuariat", "actuaire",
      "formation catalogue", "organisme de formation",
      "nettoyage", "entretien", "maintenance technique",
      "travaux publics", "génie civil", "genie civil",
      "voirie", "vrd", "chaussée", "chaussee",
      "étude de sol", "etude de sol",
      "maîtrise d'ouvrage déléguée", "mod",
      "btp", "gros œuvre", "gros oeuvre", "second œuvre",
      "marché de fournitures", "fourniture de", "livraison de",
      "location de", "matériel",
      "prestations administratives",
      "reprographie", "impression", "photocopie",
      "télécommunications", "telecommunications",
      "sécurité incendie", "securite incendie",
      "gardiennage", "surveillance",
      "restauration collective",
      "blanchisserie", "pressing",
      // Red flags raffinés (NOUVEAU - CRITIQUE)
      "fourniture matériel", "fourniture de materiel",
      "livraison équipement", "livraison equipement",
      "location véhicule", "location vehicule",
      "maintenance informatique", "maintenance it",
      "hébergement serveurs", "hebergement serveurs",
      "infrastructure technique", "génie logiciel", "genie logiciel",
      "développement applicatif", "developpement applicatif",
      "intégration système", "integration systeme",
      "formation bureautique", "formation technique",
      "formation réglementaire", "formation reglementaire",
      "formation sécurité", "formation securite",
      "catalogue formation",
      "assistance maîtrise ouvrage technique",
      "amo si", "amo système information", "amo systeme information",
      "vabf", "vma", "vsma"
    ],
    patterns: [
      // Existants
      /amo\s+travaux/i,
      /ma(î|i)trise\s+d['']?(œ|o)euvre/i,
      /d(é|e)veloppement\s+logiciel/i,
      /actuari(at|el)/i,
      /formation\s+catalogue/i,
      /march(é|e)\s+de\s+fourniture/i,
      /location\s+de\s+mat(é|e)riel/i,
      /prestation\s+de\s+nettoyage/i,
      /march(é|e)\s+de\s+travaux/i,
      /g(é|e)nie\s+civil/i,
      /travaux\s+publics/i,
      // Red flags raffinés
      /fourniture\s+(de\s+)?mat(é|e)riel/i,
      /livraison\s+(d.)?((é|e)quipement|mat(é|e)riel)/i,
      /maintenance\s+(informatique|technique|it)/i,
      /formation\s+(bureautique|technique|r(é|e)glementaire)/i,
      /amo\s+(si|syst(è|e)me)/i
    ]
  },
  
  // CLIENTS RÉFÉRENCES BALTHAZAR (détection forte pertinence)
  clients_references: [
    "ratp", "sncf", "atmb", "tisseo", "idfm", "sytral",
    "tcl lyon", "lagardère travel retail", "lagardere travel retail",
    "sncf fret", "sncf voyageurs", "sncf réseau", "sncf reseau",
    "maif", "groupama", "carsat",
    "edf", "engie", "grt gaz", "grdf",
    "gca", "groupement crédit agricole", "groupement credit agricole"
  ]
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
 * Trouve les matches avec déduplication optimisée (O(n))
 * Priorise les expressions longues pour éviter double comptage
 */
function findMatchesWithDeduplication(
  fullText: string,
  keywords: readonly string[] | string[],
  patterns: readonly RegExp[] | RegExp[]
): string[] {
  // Trier par longueur décroissante (expressions longues en premier)
  const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);
  const matchedKeywords = new Set<string>();
  const coveredRanges: Array<[number, number]> = []; // [start, end]
  
  // 1. Keywords (expressions longues d'abord)
  for (const keyword of sortedKeywords) {
    const normalizedKw = normalizeText(keyword);
    let searchIndex = 0;
    
    while (true) {
      const index = fullText.indexOf(normalizedKw, searchIndex);
      if (index === -1) break;
      
      const start = index;
      const end = index + normalizedKw.length;
      
      // Vérifier si cette plage est déjà couverte
      const isCovered = coveredRanges.some(
        ([coveredStart, coveredEnd]) => 
          start >= coveredStart && end <= coveredEnd
      );
      
      if (!isCovered) {
        matchedKeywords.add(keyword);
        coveredRanges.push([start, end]);
        break; // 1 seule occurrence par keyword suffit
      }
      
      searchIndex = index + 1;
    }
  }
  
  // 2. Patterns (après keywords)
  for (const pattern of patterns) {
    const matches = fullText.match(new RegExp(pattern, 'gi'));
    if (matches) {
      for (const match of matches) {
        const normalizedMatch = normalizeText(match);
        const index = fullText.indexOf(normalizedMatch);
        if (index !== -1) {
          const start = index;
          const end = index + normalizedMatch.length;
          
          const isCovered = coveredRanges.some(
            ([coveredStart, coveredEnd]) => 
              start >= coveredStart && end <= coveredEnd
          );
          
          if (!isCovered) {
            matchedKeywords.add(match);
            coveredRanges.push([start, end]);
          }
        }
      }
    }
  }
  
  return Array.from(matchedKeywords);
}

/**
 * Calcule le score d'une catégorie avec scoring logarithmique gradué
 * Coefficient 3.5 pour graduation douce (ajustement recommandé)
 */
function calculateCategoryScore(
  matches: string[],
  weight: number,
  maxScore: number
): number {
  const uniqueMatches = [...new Set(matches)];
  const matchCount = uniqueMatches.length;
  
  if (matchCount === 0) return 0;
  
  // Scoring logarithmique : récompense diversité mais avec graduation douce
  // log(n+1) × weight × 3.5 (coefficient ajusté)
  const baseScore = Math.log(matchCount + 1) * weight * 3.5;
  const categoryScore = Math.min(maxScore, Math.round(baseScore));
  
  return categoryScore;
}

/**
 * Calcule la confidence basée sur axes critiques (secteur + expertise)
 * Seuils optimisés pour réduire faux négatifs
 */
function calculateConfidence(
  secteurScore: number,
  expertiseScore: number,
  postureScore: number,
  secteurMatches: CategoryMatch[],
  expertiseMatches: CategoryMatch[]
): 'HIGH' | 'MEDIUM' | 'LOW' {
  const criticalAxesScore = secteurScore + expertiseScore; // Max 85pts
  const hasSecteurMatch = secteurMatches.length > 0;
  const hasExpertiseMatch = expertiseMatches.length > 0;
  const hasBothCriticalAxes = hasSecteurMatch && hasExpertiseMatch;
  
  // HIGH : les 2 axes critiques matchés AVEC bon score
  if (hasBothCriticalAxes && criticalAxesScore >= 40) {
    return 'HIGH';
  }
  
  // HIGH : score très élevé sur 1 axe critique (expertise très forte)
  if (secteurScore >= 30 || expertiseScore >= 30) {
    return 'HIGH';
  }
  
  // MEDIUM : au moins 1 axe critique avec score décent
  if ((hasSecteurMatch && secteurScore >= 15) || 
      (hasExpertiseMatch && expertiseScore >= 15)) {
    return 'MEDIUM';
  }
  
  // MEDIUM : score combiné modéré
  if (criticalAxesScore >= 25) {
    return 'MEDIUM';
  }
  
  // LOW : reste
  return 'LOW';
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
    secteur_score: number;    // Max 50 points (augmenté pour entreprise_mission)
    expertise_score: number;  // Max 40 points
    posture_score: number;    // Max 15 points
  };
  allMatches: string[];        // Tous les keywords matchés (pour compatibilité)
}

/**
 * Interface pour résultat avec bonus/malus
 */
export interface EnhancedKeywordScoreResult extends KeywordScoreResult {
  bonusDetails: string[];
  adjustedScore: number;
}

/**
 * Détermine si l'analyse LLM doit être skippée
 * Gère les cas limites (HIGH confidence même avec score < 30)
 */
export function shouldSkipLLM(scoreResult: KeywordScoreResult): {
  skip: boolean;
  reason?: string;
  priority: 'SKIP' | 'LOW' | 'MEDIUM' | 'HIGH';
} {
  const { score, confidence, red_flags_detected, breakdown } = scoreResult;
  
  // Cas 1 : Score très faible → skip toujours
  if (score < 20) {
    return { skip: true, reason: 'score_trop_faible', priority: 'SKIP' };
  }
  
  // Cas 2 : Red flags critiques → pénaliser mais pas bloquer systématiquement
  let adjustedScore = score;
  if (red_flags_detected.length > 0) {
    adjustedScore = Math.max(0, score - 30);
    if (adjustedScore < 15) {
      return { skip: true, reason: 'red_flags_critiques', priority: 'SKIP' };
    }
  }
  
  // Cas 3 : Score faible MAIS confidence élevée → analyser quand même !
  if (score >= 20 && score < 30) {
    if (confidence === 'HIGH') {
      // Exception : HIGH confidence = secteur + expertise matchés
      // → Analyser avec LLM malgré score faible (peut-être posture manquante)
      return { skip: false, priority: 'MEDIUM' };
    }
    return { skip: true, reason: 'score_faible', priority: 'LOW' };
  }
  
  // Cas 4 : Score 30-40 avec LOW confidence → skip pour économiser
  if (score >= 30 && score < 40 && confidence === 'LOW') {
    return { skip: true, reason: 'confidence_faible', priority: 'LOW' };
  }
  
  // Cas 5 : Score ≥30 → analyser avec LLM
  if (score >= 30) {
    const priority = 
      (score >= 60 || confidence === 'HIGH') ? 'HIGH' :
      (score >= 40 || confidence === 'MEDIUM') ? 'MEDIUM' : 'LOW';
    return { skip: false, priority };
  }
  
  // Fallback
  return { skip: true, reason: 'default', priority: 'SKIP' };
}

/**
 * Calcule le score keywords amélioré avec bonus/malus métier
 */
export function calculateEnhancedKeywordScore(
  ao: { title: string; description?: string; acheteur?: string },
  baseScoreResult: KeywordScoreResult
): EnhancedKeywordScoreResult {
  let finalScore = baseScoreResult.score;
  const bonusDetails: string[] = [];
  
  const fullText = normalizeText([
    ao.title,
    ao.description || '',
    ao.acheteur || ''
  ].join(' '));
  
  // BONUS 1 : Client référence Balthazar (+15 points)
  const clientsReferences = balthazarLexicon.clients_references || [];
  const hasReferenceClient = clientsReferences.some(
    client => fullText.includes(normalizeText(client))
  );
  if (hasReferenceClient) {
    finalScore += 15;
    bonusDetails.push('client_reference_balthazar');
  }
  
  // BONUS 2 : Société à mission / Raison d'être
  const hasRaisonEtreExpertise = baseScoreResult.expertise_matches.some(
    m => m.category === 'raison_etre'
  );
  const hasEntrepriseMissionSecteur = baseScoreResult.secteur_matches.some(
    m => m.category === 'entreprise_mission'
  );
  
  // Si raison d'être en EXPERTISE (forte pertinence) → +10pts
  if (hasRaisonEtreExpertise) {
    finalScore += 10;
    bonusDetails.push('raison_etre_expertise');
  }
  // Si entreprise mission en SECTEUR → +5pts (déjà weight 4, éviter double bonus)
  else if (hasEntrepriseMissionSecteur) {
    finalScore += 5;
    bonusDetails.push('entreprise_mission_secteur');
  }
  
  // BONUS 3 : Niveau CODIR/COMEX explicite (+8 points)
  if (/co(m(ex|dir))/.test(fullText)) {
    finalScore += 8;
    bonusDetails.push('niveau_codir_comex');
  }
  
  // BONUS 4 : Multi-expertises (2+ expertises) (+5 points)
  if (baseScoreResult.expertise_matches.length >= 2) {
    finalScore += 5;
    bonusDetails.push('multi_expertises');
  }
  
  // MALUS 1 : Red flags critiques (-30 points mais pas éliminatoire)
  if (baseScoreResult.red_flags_detected.length > 0) {
    finalScore -= 30;
    bonusDetails.push('red_flags_penalty');
  }
  
  // MALUS 2 : Aucun secteur cible (-15 points)
  if (baseScoreResult.secteur_matches.length === 0) {
    finalScore -= 15;
    bonusDetails.push('no_secteur_target');
  }
  
  finalScore = Math.max(0, Math.min(100, finalScore));
  
  return {
    ...baseScoreResult,
    score: finalScore,
    adjustedScore: finalScore,
    bonusDetails
  };
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

  // 3. MATCHING SECTEURS (max 45 points = 5 secteurs × 15 points max chacun)
  const secteurMatches: CategoryMatch[] = [];
  let secteurScore = 0;
  
  for (const [category, config] of Object.entries(balthazarLexicon.secteurs)) {
    const matches = findMatchesWithDeduplication(
      fullText,
      config.keywords,
      config.patterns
    );
    
    if (matches.length > 0) {
      // Plafond augmenté pour entreprise_mission (weight 4, cœur métier Balthazar)
      const maxCategoryScore = category === 'entreprise_mission' ? 18 : 15;
      const categoryScore = calculateCategoryScore(matches, config.weight, maxCategoryScore);
      secteurScore += categoryScore;
      
      secteurMatches.push({
        category,
        keywords: matches,
        score: categoryScore
      });
    }
  }
  
  secteurScore = Math.min(50, secteurScore); // Plafond 50 (augmenté pour entreprise_mission)

  // 4. MATCHING EXPERTISES (max 40 points = 10 expertises × ~4 points max en moyenne)
  const expertiseMatches: CategoryMatch[] = [];
  let expertiseScore = 0;
  
  for (const [category, config] of Object.entries(balthazarLexicon.expertises)) {
    const matches = findMatchesWithDeduplication(
      fullText,
      config.keywords,
      config.patterns
    );
    
    if (matches.length > 0) {
      const categoryScore = calculateCategoryScore(matches, config.weight, 10);
      expertiseScore += categoryScore;
      
      expertiseMatches.push({
        category,
        keywords: matches,
        score: categoryScore
      });
    }
  }
  
  expertiseScore = Math.min(40, expertiseScore); // Plafond 40

  // 5. MATCHING POSTURE (max 15 points - bonus)
  const postureMatches = findMatchesWithDeduplication(
    fullText,
    balthazarLexicon.posture.keywords,
    balthazarLexicon.posture.patterns
  );
  
  let postureScore = 0;
  if (postureMatches.length > 0) {
    // Utiliser calculateCategoryScore pour cohérence avec secteurs/expertises
    // Scoring logarithmique : graduation douce (1 match = ~2.4pts, 5 matches = ~11.2pts, 10+ matches = 15pts)
    postureScore = calculateCategoryScore(
      postureMatches,
      balthazarLexicon.posture.weight, // 1
      15 // Max 15 points
    );
  }

  // 6. CALCUL SCORE FINAL (0-100)
  const finalScore = Math.round(secteurScore + expertiseScore + postureScore);
  
  // 7. DÉTERMINER CONFIDENCE (basé sur axes critiques)
  const confidence = calculateConfidence(
    secteurScore,
    expertiseScore,
    postureScore,
    secteurMatches,
    expertiseMatches
  );

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