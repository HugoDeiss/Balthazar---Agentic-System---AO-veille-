-- ============================================
-- SETUP SUPABASE POUR AO VEILLE
-- ============================================
-- À exécuter dans le SQL Editor de Supabase

-- ============================================
-- 1. TABLE CLIENTS
-- ============================================
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  
  -- Préférences
  preferences JSONB DEFAULT '{}'::jsonb,
  -- Exemple: {"typeMarche": "SERVICES"}
  
  -- Critères de sélection
  criteria JSONB DEFAULT '{}'::jsonb,
  -- Exemple: {"minBudget": 50000, "regions": ["Île-de-France"]}
  
  -- Mots-clés métier
  keywords TEXT[] DEFAULT '{}',
  -- Exemple: ["développement", "logiciel", "web", "application"]
  
  -- Profil entreprise
  profile JSONB DEFAULT '{}'::jsonb,
  -- Exemple: {"description": "Cabinet de conseil...", "secteurs": [...]}
  
  -- Données financières
  financial JSONB DEFAULT '{}'::jsonb,
  -- Exemple: {"revenue": 5000000, "employees": 50, "yearsInBusiness": 10}
  
  -- Données techniques
  technical JSONB DEFAULT '{}'::jsonb,
  -- Exemple: {"references": 25, "certifications": ["ISO 9001"]}
  
  -- Métadonnées
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 2. TABLE APPELS_OFFRES
-- ============================================
CREATE TABLE IF NOT EXISTS appels_offres (
  id SERIAL PRIMARY KEY,
  
  -- Identifiants
  source TEXT NOT NULL,              -- Ex: "BOAMP"
  source_id TEXT NOT NULL UNIQUE,    -- ID unique de la source
  
  -- Contenu de base
  title TEXT NOT NULL,
  description TEXT,
  keywords TEXT[],
  
  -- Acheteur
  acheteur TEXT,
  acheteur_email TEXT,
  acheteur_tel TEXT,
  
  -- Budget & Dates
  budget_min NUMERIC,
  budget_max NUMERIC,
  deadline TIMESTAMP WITHOUT TIME ZONE,
  publication_date TIMESTAMP WITHOUT TIME ZONE,
  
  -- Classification
  type_marche TEXT,                  -- Ex: "SERVICES", "FOURNITURES", "TRAVAUX"
  region TEXT,
  url_ao TEXT,
  
  -- ============================================
  -- SCORES D'ANALYSE
  -- ============================================
  
  -- Analyse keywords (gratuit)
  keyword_score NUMERIC,             -- 0-1
  matched_keywords TEXT[],
  
  -- Analyse sémantique (LLM)
  semantic_score NUMERIC,            -- 0-10
  semantic_reason TEXT,
  
  -- Analyse faisabilité (LLM)
  feasibility JSONB,
  -- Exemple: {
  --   "financial": true,
  --   "technical": true,
  --   "timing": true,
  --   "blockers": [],
  --   "confidence": "high"
  -- }
  
  -- Score final
  final_score NUMERIC,               -- 0-10
  priority TEXT,                     -- "HIGH", "MEDIUM", "LOW", "CANCELLED"
  
  -- ============================================
  -- CONTEXT ENRICHI
  -- ============================================
  
  procedure_type TEXT,               -- Ex: "Procédure ouverte"
  has_correctif BOOLEAN DEFAULT FALSE,
  is_renewal BOOLEAN DEFAULT FALSE,
  warnings TEXT[],
  criteres_attribution JSONB,
  
  -- ============================================
  -- MÉTADONNÉES
  -- ============================================
  
  client_id TEXT REFERENCES clients(id),
  raw_json JSONB,                    -- JSON brut de la source
  status TEXT DEFAULT 'analyzed',    -- "analyzed", "ingested", "cancelled", "sent", "archived"
  analyzed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  
  -- ============================================
  -- GESTION DES RECTIFICATIFS
  -- ============================================
  
  is_rectified BOOLEAN DEFAULT FALSE,
  rectification_date TIMESTAMP WITH TIME ZONE,
  rectification_count INTEGER DEFAULT 0 CHECK (rectification_count >= 0),
  rectification_changes JSONB,       -- Détails des changements détectés
  
  -- ============================================
  -- HISTORIQUE D'ANALYSE
  -- ============================================
  
  analysis_history JSONB DEFAULT '[]'::jsonb CHECK (jsonb_typeof(analysis_history) = 'array'::text),
  -- Format: [{"date": "2025-01-20T10:00:00Z", "semantic_score": 8.5, "feasibility": {...}, ...}]
  
  -- ============================================
  -- IDENTIFIANTS BOAMP SUPPLEMENTAIRES
  -- ============================================
  
  boamp_id TEXT,                     -- ID BOAMP original (si différent de source_id)
  normalized_id TEXT,                -- ID normalisé pour déduplication avancée
  annonce_lie TEXT,                  -- ID de l'annonce originale (pour rectificatifs)
  
  -- ============================================
  -- ÉTAT BOAMP
  -- ============================================
  
  etat TEXT,                         -- État BOAMP original (AVIS_ANNULE, INITIAL, etc.)
  
  -- ============================================
  -- DÉDUPLICATION CROSS-PLATFORM
  -- ============================================
  
  uuid_procedure UUID,               -- UUID universel de la procédure (contractfolderid BOAMP / Identifiant de la procédure MarchesOnline)
  siret TEXT,                        -- SIRET de l'acheteur (disponible dans MarchesOnline)
  dedup_key TEXT,                    -- Clé composite normalisée : title|deadline|acheteur (pour déduplication niveau 2)
  siret_deadline_key TEXT            -- Clé composite : siret|deadline (pour déduplication niveau 3)
);

-- ============================================
-- 3. INDEX POUR PERFORMANCE
-- ============================================

-- Index sur client_id pour les recherches par client
CREATE INDEX IF NOT EXISTS idx_appels_offres_client_id 
ON appels_offres(client_id);

-- Index sur analyzed_at pour les recherches par date
CREATE INDEX IF NOT EXISTS idx_appels_offres_analyzed_at 
ON appels_offres(analyzed_at DESC);

-- Index sur priority pour filtrer par priorité
CREATE INDEX IF NOT EXISTS idx_appels_offres_priority 
ON appels_offres(priority);

-- Index sur deadline pour les AO à venir
CREATE INDEX IF NOT EXISTS idx_appels_offres_deadline 
ON appels_offres(deadline);

-- Index composite pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_appels_offres_client_priority_date 
ON appels_offres(client_id, priority, analyzed_at DESC);

-- Index sur annonce_lie pour recherche rapide de l'AO original (rectificatifs)
CREATE INDEX IF NOT EXISTS idx_appels_offres_annonce_lie 
ON appels_offres(annonce_lie) 
WHERE annonce_lie IS NOT NULL;

-- Index sur etat pour les requêtes fréquentes sur les annulations
CREATE INDEX IF NOT EXISTS idx_appels_offres_etat 
ON appels_offres(etat)
WHERE etat IS NOT NULL;

-- ============================================
-- INDEX POUR DÉDUPLICATION CROSS-PLATFORM
-- ============================================

-- Index unique sur uuid_procedure (niveau 1 de déduplication - 99% de fiabilité)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ao_uuid_procedure
ON appels_offres(uuid_procedure)
WHERE uuid_procedure IS NOT NULL;

-- Index sur dedup_key (niveau 2 de déduplication - 95% de fiabilité)
CREATE INDEX IF NOT EXISTS idx_ao_dedup_key
ON appels_offres(dedup_key)
WHERE dedup_key IS NOT NULL;

-- Index sur siret_deadline_key (niveau 3 de déduplication - 80% de fiabilité)
CREATE INDEX IF NOT EXISTS idx_ao_siret_deadline
ON appels_offres(siret_deadline_key)
WHERE siret_deadline_key IS NOT NULL;

-- ============================================
-- 4. FONCTION DE MISE À JOUR AUTO updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Trigger sur la table clients
DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4b. FONCTION EXTRACT_BOAMP_ID (utilitaire)
-- ============================================
-- Extrait l'ID BOAMP depuis raw_json (idweb, boamp_id ou id)
CREATE OR REPLACE FUNCTION public.extract_boamp_id(raw_json jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  RETURN COALESCE(
    raw_json->>'idweb',
    raw_json->>'boamp_id',
    raw_json->>'id'
  );
END;
$function$;

-- ============================================
-- 4c. ROW LEVEL SECURITY (RLS)
-- ============================================
-- 1 policy per action + (select auth.*) pour initplan (perf)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appels_offres ENABLE ROW LEVEL SECURITY;

-- clients (drop anciennes + nouvelles pour idempotence)
DROP POLICY IF EXISTS "Service role has full access to clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated can read clients" ON public.clients;
DROP POLICY IF EXISTS "clients_select" ON public.clients;
DROP POLICY IF EXISTS "clients_insert" ON public.clients;
DROP POLICY IF EXISTS "clients_update" ON public.clients;
DROP POLICY IF EXISTS "clients_delete" ON public.clients;
CREATE POLICY "clients_select" ON public.clients FOR SELECT
  USING (((select auth.jwt()) ->> 'role') = 'service_role' OR (select auth.role()) = 'authenticated');
CREATE POLICY "clients_insert" ON public.clients FOR INSERT
  WITH CHECK (((select auth.jwt()) ->> 'role') = 'service_role');
CREATE POLICY "clients_update" ON public.clients FOR UPDATE
  USING (((select auth.jwt()) ->> 'role') = 'service_role')
  WITH CHECK (((select auth.jwt()) ->> 'role') = 'service_role');
CREATE POLICY "clients_delete" ON public.clients FOR DELETE
  USING (((select auth.jwt()) ->> 'role') = 'service_role');

-- appels_offres (drop anciennes + nouvelles pour idempotence)
DROP POLICY IF EXISTS "Service role has full access to appels_offres" ON public.appels_offres;
DROP POLICY IF EXISTS "Authenticated can read appels_offres" ON public.appels_offres;
DROP POLICY IF EXISTS "appels_offres_select" ON public.appels_offres;
DROP POLICY IF EXISTS "appels_offres_insert" ON public.appels_offres;
DROP POLICY IF EXISTS "appels_offres_update" ON public.appels_offres;
DROP POLICY IF EXISTS "appels_offres_delete" ON public.appels_offres;
CREATE POLICY "appels_offres_select" ON public.appels_offres FOR SELECT
  USING (((select auth.jwt()) ->> 'role') = 'service_role' OR (select auth.role()) = 'authenticated');
CREATE POLICY "appels_offres_insert" ON public.appels_offres FOR INSERT
  WITH CHECK (((select auth.jwt()) ->> 'role') = 'service_role');
CREATE POLICY "appels_offres_update" ON public.appels_offres FOR UPDATE
  USING (((select auth.jwt()) ->> 'role') = 'service_role')
  WITH CHECK (((select auth.jwt()) ->> 'role') = 'service_role');
CREATE POLICY "appels_offres_delete" ON public.appels_offres FOR DELETE
  USING (((select auth.jwt()) ->> 'role') = 'service_role');

-- ============================================
-- 4d. VUE RECTIFICATIFS_AVEC_ORIGINAL
-- ============================================
-- Vue rectificatifs + AO original (security_invoker = pas de privilege escalation)
DROP VIEW IF EXISTS public.rectificatifs_avec_original;
CREATE VIEW public.rectificatifs_avec_original
WITH (security_invoker = true)
AS
SELECT
  r.id AS rectificatif_id,
  r.source_id AS rectificatif_source_id,
  r.title AS rectificatif_title,
  r.rectification_date,
  r.rectification_changes,
  o.id AS original_id,
  o.source_id AS original_source_id,
  o.title AS original_title,
  o.semantic_score AS original_semantic_score,
  o.priority AS original_priority,
  r.semantic_score AS new_semantic_score,
  r.priority AS new_priority,
  (r.semantic_score - o.semantic_score) AS score_improvement
FROM public.appels_offres r
LEFT JOIN public.appels_offres o ON o.boamp_id = (r.raw_json ->> 'annonce_lie')
WHERE r.is_rectified = true AND r.rectification_date IS NOT NULL
ORDER BY r.rectification_date DESC;

-- ============================================
-- 5. INSÉRER LE CLIENT BALTHAZAR (EXEMPLE)
-- ============================================

INSERT INTO clients (
  id,
  name,
  email,
  preferences,
  criteria,
  keywords,
  profile,
  financial,
  technical
) VALUES (
  'balthazar-client-id',
  'Balthazar Consulting',
  'contact@balthazar-consulting.fr',
  
  -- Préférences
  jsonb_build_object(
    'typeMarche', 'SERVICES'
  ),
  
  -- Critères
  jsonb_build_object(
    'minBudget', 50000,
    'regions', jsonb_build_array('Île-de-France', 'Auvergne-Rhône-Alpes')
  ),
  
  -- Mots-clés métier
  ARRAY[
    'conseil',
    'stratégie',
    'transformation',
    'digitale',
    'numérique',
    'innovation',
    'organisation',
    'management',
    'pilotage',
    'performance'
  ],
  
  -- Profil
  jsonb_build_object(
    'description', 'Cabinet de conseil en stratégie et transformation digitale',
    'secteurs', jsonb_build_array(
      'Secteur public',
      'Collectivités territoriales',
      'Établissements publics'
    ),
    'expertises', jsonb_build_array(
      'Transformation digitale',
      'Conduite du changement',
      'Pilotage de projets',
      'Audit organisationnel'
    )
  ),
  
  -- Financier
  jsonb_build_object(
    'revenue', 5000000,        -- 5M€ de CA
    'employees', 50,            -- 50 employés
    'yearsInBusiness', 10       -- 10 ans d'expérience
  ),
  
  -- Technique
  jsonb_build_object(
    'references', 25,           -- 25 références similaires
    'certifications', jsonb_build_array('ISO 9001', 'Qualiopi')
  )
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  preferences = EXCLUDED.preferences,
  criteria = EXCLUDED.criteria,
  keywords = EXCLUDED.keywords,
  profile = EXCLUDED.profile,
  financial = EXCLUDED.financial,
  technical = EXCLUDED.technical,
  updated_at = NOW();

-- ============================================
-- 6. VÉRIFICATION
-- ============================================

-- Vérifier que le client a bien été créé
SELECT 
  id,
  name,
  email,
  array_length(keywords, 1) as nb_keywords,
  preferences->>'typeMarche' as type_marche,
  (criteria->>'minBudget')::numeric as min_budget
FROM clients
WHERE id = 'balthazar-client-id';

-- Afficher le résultat attendu :
-- id                    | name                  | email                              | nb_keywords | type_marche | min_budget
-- ----------------------|-----------------------|------------------------------------|-------------|-------------|------------
-- balthazar-client-id   | Balthazar Consulting  | contact@balthazar-consulting.fr    | 10          | SERVICES    | 50000

-- ============================================
-- 7. REQUÊTES UTILES POUR LE MONITORING
-- ============================================

-- Voir les derniers AO analysés
-- SELECT 
--   title,
--   priority,
--   final_score,
--   semantic_score,
--   analyzed_at
-- FROM appels_offres
-- WHERE client_id = 'balthazar-client-id'
-- ORDER BY analyzed_at DESC
-- LIMIT 10;

-- Statistiques par jour
-- SELECT 
--   DATE(analyzed_at) as date,
--   COUNT(*) as total,
--   COUNT(*) FILTER (WHERE priority = 'HIGH') as high,
--   COUNT(*) FILTER (WHERE priority = 'MEDIUM') as medium,
--   COUNT(*) FILTER (WHERE priority = 'LOW') as low,
--   AVG(final_score) as avg_score
-- FROM appels_offres
-- WHERE client_id = 'balthazar-client-id'
--   AND analyzed_at >= NOW() - INTERVAL '7 days'
-- GROUP BY DATE(analyzed_at)
-- ORDER BY date DESC;

-- Voir les AO HIGH priorité
-- SELECT 
--   title,
--   final_score,
--   deadline,
--   url_ao
-- FROM appels_offres
-- WHERE client_id = 'balthazar-client-id'
--   AND priority = 'HIGH'
--   AND deadline > NOW()
-- ORDER BY final_score DESC;

