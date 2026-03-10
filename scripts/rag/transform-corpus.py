"""
Transforms balthazar_corpus.jsonl:
1. Splits pol_missions_coeur into two focused chunks
2. Condenses all case studies (~500-700 tokens → ~130 tokens each)

Run: python scripts/rag/transform-corpus.py
Then re-index: npx tsx scripts/rag/index-balthazar.ts
"""

import json
import sys

INPUT  = "rag/balthazar_corpus.jsonl"
OUTPUT = "rag/balthazar_corpus.jsonl"

# ─────────────────────────────────────────────────────────
# Replacement definitions
# ─────────────────────────────────────────────────────────

SPLIT_MISSIONS_COEUR = [
    {
        "id": "pol_missions_coeur_strategie_identite",
        "content": (
            "Missions cœur — Stratégie et Identité\n\n"
            "1. Plan stratégique pluriannuel (3-10 ans) : vision, analyse marché/concurrence, scénarios, arbitrages, formalisation. Interlocuteurs : DG, CODIR, CA.\n\n"
            "2. Trajectoires de développement et croissance : développement d'activité, M&A (screening, cadrage stratégique), lancement offres, positionnement concurrentiel. Implique analyses de marché et arbitrages structurants.\n\n"
            "3. Raison d'Être et Société à Mission : diagnostic singularité, formalisation RE, engagements statutaires, Comité de Mission, passage en SàM. Travail approfondi avec top management et parties prenantes.\n\n"
            "4. Stratégie responsable / RSE structurante : feuille de route RSE, ESG dans la stratégie globale, trajectoires climat, alignement CSRD. Cadrage stratégique uniquement — pas de reporting technique réglementaire."
        ),
        "metadata": {
            "type": "mandate_type",
            "secteur": None,
            "decision": "in_scope",
            "source_section": "2.1a",
            "trigger_keywords": ["plan stratégique", "raison d'être", "société à mission", "M&A", "RSE", "développement", "CSRD", "vision", "ambition", "positionnement"]
        },
        "index": "policies"
    },
    {
        "id": "pol_missions_coeur_transformation",
        "content": (
            "Missions cœur — Transformation et Organisation\n\n"
            "1. Stratégie de transformation et modèle opérationnel cible : nouveau modèle opérationnel, réorganisation structurante, refonte gouvernance, clarification rôles et responsabilités, structuration de programme de transformation. "
            "Balthazar définit la cible et le cadre de pilotage — pas l'implémentation IT.\n\n"
            "2. Mobilisation stratégique du top management : séminaires stratégiques CODIR/COMEX, dispositif d'alignement autour d'une ambition, structuration de projet d'entreprise, transformation managériale adossée à une stratégie. "
            "Central si lié à une décision stratégique majeure — pas simple animation ponctuelle."
        ),
        "metadata": {
            "type": "mandate_type",
            "secteur": None,
            "decision": "in_scope",
            "source_section": "2.1b",
            "trigger_keywords": ["transformation organisationnelle", "modèle opérationnel", "gouvernance", "réorganisation", "programme de transformation", "séminaire CODIR", "mobilisation", "conduite du changement", "alignement"]
        },
        "index": "policies"
    }
]

CONDENSED_CASE_STUDIES = {
    "cs_atmb_societe_mission": {
        "content": (
            "Client ATMB (concessionnaire autoroutier, mobilité/infrastructure). Mandat: Société à Mission — 8 mois, CODIR+CA. "
            "Contexte: Raison d'Être déjà inscrite aux statuts, mission = mobiliser CODIR et équipes autour des objectifs statutaires, mettre en place le Comité de Mission. "
            "Représentatif: double secteur mobilité+entreprise_mission, travail CODIR+CA, mandat emblématique SàM."
        ),
        "metadata": {
            "type": "case_study", "client": "atmb", "secteur": "mobilite",
            "type_org": "concessionnaire", "mandate_type": "societe_a_mission",
            "niveau_intervention": ["CODIR", "CA"],
            "keywords": ["société à mission", "raison d'être", "comité de mission", "concessionnaire", "mobilité"]
        }
    },
    "cs_carsat_deploiement_re": {
        "content": (
            "Client CARSAT Normandie (organisme sécurité sociale, secteur public). Mandat: déploiement Raison d'Être à large échelle — 8 mois, CODIR+collaborateurs. "
            "Contexte: RE définie, mission = traduction en pratiques métier concrètes pour 1009 collaborateurs. "
            "Représentatif: secteur public/protection sociale, déploiement RE, transformation culturelle à l'échelle."
        ),
        "metadata": {
            "type": "case_study", "client": "carsat_normandie", "secteur": "public",
            "type_org": "organisme_securite_sociale", "mandate_type": "deploiement_raison_etre",
            "niveau_intervention": ["CODIR", "managers", "collaborateurs"],
            "keywords": ["raison d'être", "déploiement", "service public", "sécurité sociale", "transformation culturelle"]
        }
    },
    "cs_tisseo_plan_strat_re": {
        "content": (
            "Client Tisséo Ingénierie (SPL maîtrise d'ouvrage transport, mobilité). Mandat: Plan Stratégique 2025-2028 + Société à Mission — 8 mois, CODIR+CA. Budget 80K€. "
            "Contexte: repositionnement stratégique pour l'après grands projets d'infrastructure. "
            "Représentatif: double mandat plan strat+SàM, acteur mobilité à actionnariat public, CODIR+CA."
        ),
        "metadata": {
            "type": "case_study", "client": "tisseo_ingenierie", "secteur": "mobilite",
            "type_org": "SPL", "mandate_type": ["plan_strategique", "societe_a_mission"],
            "niveau_intervention": ["CODIR", "COMEX", "CA"],
            "keywords": ["plan stratégique", "raison d'être", "société à mission", "transport", "SPL", "repositionnement"]
        }
    },
    "cs_maif_raison_etre": {
        "content": (
            "Client MAIF (mutuelle, assurance). Mandat: formulation Raison d'Être — 1 an, 3 ETP, DG+CODG+CA. "
            "Contexte: mutation sectorielle, réaffirmation singularité du modèle mutualiste. "
            "Représentatif: mandat RE emblématique dans l'assurance, niveau DG+CA, durée et envergure maximales."
        ),
        "metadata": {
            "type": "case_study", "client": "maif", "secteur": "assurance",
            "type_org": "mutuelle", "mandate_type": ["raison_etre", "societe_a_mission"],
            "niveau_intervention": ["DG", "CODG", "CA"],
            "keywords": ["raison d'être", "mutuelle", "assurance", "singularité", "transformation", "société à mission"]
        }
    },
    "cs_ouigo_strategie_distribution": {
        "content": (
            "Client OUIGO España (filiale SNCF, ferroviaire grande vitesse, mobilité). Mandat: stratégie distribution + aide à décision CA — quelques mois, DG+CA. "
            "Contexte: ouverture concurrence Espagne, arbitrage marketplace vs système SNCF, scénarios financiers. "
            "Représentatif: stratégie commerciale structurante avec arbitrage CA, secteur mobilité ferroviaire."
        ),
        "metadata": {
            "type": "case_study", "client": "ouigo_espana", "secteur": "mobilite",
            "type_org": "filiale_operateur_ferroviaire", "mandate_type": ["strategie_distribution", "aide_decision_CA"],
            "niveau_intervention": ["DG", "CA"],
            "keywords": ["distribution", "ferroviaire", "stratégie commerciale", "scénarios", "SNCF", "ouverture concurrence"]
        }
    },
    "cs_sncf_fret_performance": {
        "content": (
            "Client Fret SNCF (filiale opérateur ferroviaire fret, mobilité). Mandat: plan de performance production 2023-2025 — 1 an, CODIR+directions métiers. "
            "Contexte: équilibre économique post-création, plan de relance gouvernemental, revues de performance trimestrielles. "
            "Représentatif: plan performance + transformation économique, CODIR, secteur ferroviaire."
        ),
        "metadata": {
            "type": "case_study", "client": "fret_sncf", "secteur": "mobilite",
            "type_org": "filiale_operateur_ferroviaire", "mandate_type": ["plan_performance", "transformation_operationnelle"],
            "niveau_intervention": ["CODIR", "directions_metiers"],
            "keywords": ["performance", "fret", "plan de performance", "transformation économique", "SNCF", "CODIR"]
        }
    },
    "cs_getlink_screening_rde": {
        "content": (
            "Client Getlink/Eurotunnel (gestionnaire infrastructure Tunnel sous la Manche, mobilité/logistique). Mandat: screening M&A marché Représentants en Douane (RDE) — 2 mois, DG. "
            "Contexte: Brexit, ambition plateforme transport+douane intégrée. "
            "Représentatif: analyse marché et M&A sectorielle, infrastructure stratégique, enjeu international."
        ),
        "metadata": {
            "type": "case_study", "client": "getlink", "secteur": "mobilite",
            "type_org": "operateur_infrastructure_transport", "mandate_type": ["screening_marche", "strategie_MA"],
            "niveau_intervention": ["DG"],
            "keywords": ["Eurotunnel", "Brexit", "M&A", "screening", "logistique internationale", "infrastructure"]
        }
    },
    "cs_transdev_strategie_bidfactory": {
        "content": (
            "Client Transdev France (opérateur transport multimodal, mobilité). Mandat: stratégie France + bid factory réponse AO — quelques mois, DG+CODIR. "
            "Contexte: renforcement capacité commerciale DSP, industrialisation des réponses appels d'offres. "
            "Représentatif: plan stratégique + transformation commerciale + travail CODIR intensif, secteur transport public."
        ),
        "metadata": {
            "type": "case_study", "client": "transdev", "secteur": "mobilite",
            "type_org": "operateur_transport_multimodal", "mandate_type": ["plan_strategique", "transformation_organisationnelle"],
            "niveau_intervention": ["DG", "CODIR"],
            "keywords": ["Transdev", "DSP", "bid factory", "stratégie commerciale", "transport public", "CODIR"]
        }
    },
    "cs_cnr_transformation_organisationnelle": {
        "content": (
            "Client CNR — Compagnie Nationale du Rhône (concessionnaire hydraulique, énergie renouvelable). Mandat: transformation organisationnelle et culturelle — multi-annuel, CODIR+DG. "
            "Contexte: clarification gouvernance, nouveaux rituels managériaux, coaching CODIR dans la durée. "
            "Représentatif: transformation structurelle longue, secteur énergie acteur régulé, coaching CODIR."
        ),
        "metadata": {
            "type": "case_study", "client": "cnr", "secteur": "energie",
            "type_org": "concessionnaire_hydraulique", "mandate_type": ["transformation_organisationnelle", "gouvernance", "coaching_codir"],
            "niveau_intervention": ["CODIR", "DG"],
            "keywords": ["CNR", "énergie", "hydraulique", "transformation organisationnelle", "gouvernance", "coaching CODIR", "acteur régulé"]
        }
    },
    "cs_ratp_programme_perform": {
        "content": (
            "Client Groupe RATP (EPIC transport public, mobilité). Mandat: programme PERFORM — transformation économique à grande échelle — multi-annuel, COMEX. "
            "Contexte: directisation P&L par ligne, acculturation économique 30 000 personnes. "
            "Représentatif: transformation stratégique à très grande échelle, COMEX, conduite du changement massive."
        ),
        "metadata": {
            "type": "case_study", "client": "ratp", "secteur": "mobilite",
            "type_org": "EPIC_transport_public", "mandate_type": ["transformation_strategique", "plan_performance"],
            "niveau_intervention": ["COMEX", "DG"],
            "keywords": ["RATP", "PERFORM", "transformation économique", "P&L", "COMEX", "conduite du changement", "transport public"]
        }
    },
    "cs_ratp_solutions_ville_rao": {
        "content": (
            "Client RATP Solutions Ville (filiale DSP, mobilité). Mandat: stratégie réponse AO complexe + business plan 700M€ en groupement (SPV) — quelques mois, DG+comité engagement. "
            "Contexte: DSP avec partenaires, structuration SPV, alignement groupement. "
            "Représentatif: aide à décision stratégique, arbitrages financiers+gouvernance, fort enjeu commercial."
        ),
        "metadata": {
            "type": "case_study", "client": "ratp_solutions_ville", "secteur": "mobilite",
            "type_org": "filiale_operateur_transport", "mandate_type": ["strategie_reponse_ao", "business_plan"],
            "niveau_intervention": ["DG", "comite_engagement"],
            "keywords": ["RATP Solutions Ville", "DSP", "groupement", "business plan", "SPV", "réponse AO", "700M€"]
        }
    },
}

# ─────────────────────────────────────────────────────────
# Transform
# ─────────────────────────────────────────────────────────

def transform(input_path: str, output_path: str):
    output_lines = []

    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                print(f"[WARN] Skipping invalid JSON line: {e}", file=sys.stderr)
                continue

            chunk_id = obj.get("id", "")

            # Split pol_missions_coeur into two chunks
            if chunk_id == "pol_missions_coeur":
                for new_chunk in SPLIT_MISSIONS_COEUR:
                    output_lines.append(json.dumps(new_chunk, ensure_ascii=False))
                print(f"[SPLIT]   pol_missions_coeur → {SPLIT_MISSIONS_COEUR[0]['id']} + {SPLIT_MISSIONS_COEUR[1]['id']}")
                continue

            # Condense case studies
            if chunk_id in CONDENSED_CASE_STUDIES:
                replacement = CONDENSED_CASE_STUDIES[chunk_id]
                obj["content"] = replacement["content"]
                obj["metadata"] = replacement["metadata"]
                # Preserve original index
                output_lines.append(json.dumps(obj, ensure_ascii=False))
                orig_len = len(line)
                new_len = len(output_lines[-1])
                print(f"[CONDENSE] {chunk_id}: {orig_len} → {new_len} chars ({100 - int(new_len/orig_len*100)}% reduction)")
                continue

            # Keep unchanged
            output_lines.append(line)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(output_lines) + "\n")

    print(f"\n✅ Wrote {len(output_lines)} chunks to {output_path}")


if __name__ == "__main__":
    print(f"Transforming {INPUT}...")
    transform(INPUT, OUTPUT)
