-- ============================================
-- MIGRATION: Ajout colonnes déduplication cross-platform
-- ============================================
-- Date: 2025-01-XX
-- Description: Ajoute les colonnes nécessaires pour la déduplication
--              entre BOAMP et MarchesOnline via UUID universel

-- ═══════════════════════════════════════════════════════════
-- 1. AJOUT DES COLONNES
-- ═══════════════════════════════════════════════════════════

ALTER TABLE appels_offres
ADD COLUMN IF NOT EXISTS uuid_procedure UUID,
ADD COLUMN IF NOT EXISTS siret TEXT,
ADD COLUMN IF NOT EXISTS dedup_key TEXT,
ADD COLUMN IF NOT EXISTS siret_deadline_key TEXT;

-- ═══════════════════════════════════════════════════════════
-- 2. CRÉATION DES INDEX
-- ═══════════════════════════════════════════════════════════

-- Index UUID (prioritaire pour déduplication niveau 1)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ao_uuid_procedure 
ON appels_offres(uuid_procedure) 
WHERE uuid_procedure IS NOT NULL;

-- Index composite (fallback pour déduplication niveau 2)
CREATE INDEX IF NOT EXISTS idx_ao_dedup_key 
ON appels_offres(dedup_key)
WHERE dedup_key IS NOT NULL;

-- Index SIRET + deadline (fallback pour déduplication niveau 3)
CREATE INDEX IF NOT EXISTS idx_ao_siret_deadline 
ON appels_offres(siret_deadline_key)
WHERE siret_deadline_key IS NOT NULL;

-- ═══════════════════════════════════════════════════════════
-- 3. MIGRATION DES DONNÉES EXISTANTES
-- ═══════════════════════════════════════════════════════════

-- Calculer dedup_key pour AO existants (basé sur titre + deadline + acheteur)
UPDATE appels_offres
SET 
  dedup_key = LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                COALESCE(title, '') || '|' || 
                COALESCE(deadline::text, '') || '|' || 
                COALESCE(acheteur, ''),
                '[àáâãäå]', 'a', 'gi'
              ),
              '[éèêë]', 'e', 'gi'
            ),
            '[íìîï]', 'i', 'gi'
          ),
          '[óòôõö]', 'o', 'gi'
        ),
        '[úùûü]', 'u', 'gi'
      ),
      '[^a-z0-9| ]', ' ', 'gi'
    )
  ),
  siret_deadline_key = CASE 
    WHEN siret IS NOT NULL AND deadline IS NOT NULL 
    THEN siret || '|' || deadline::text
    ELSE NULL
  END
WHERE dedup_key IS NULL;

-- ═══════════════════════════════════════════════════════════
-- 4. COMMENTAIRES
-- ═══════════════════════════════════════════════════════════

COMMENT ON COLUMN appels_offres.uuid_procedure IS 'UUID universel de la procédure (contractfolderid BOAMP = Identifiant procédure MarchesOnline)';
COMMENT ON COLUMN appels_offres.siret IS 'SIRET de l''acheteur (14 chiffres)';
COMMENT ON COLUMN appels_offres.dedup_key IS 'Clé composite normalisée pour déduplication (titre|deadline|acheteur)';
COMMENT ON COLUMN appels_offres.siret_deadline_key IS 'Clé SIRET + deadline pour déduplication niveau 3';

-- ═══════════════════════════════════════════════════════════
-- 5. VÉRIFICATION
-- ═══════════════════════════════════════════════════════════

-- Vérifier que les colonnes ont été créées
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'appels_offres'
  AND column_name IN ('uuid_procedure', 'siret', 'dedup_key', 'siret_deadline_key')
ORDER BY column_name;

-- Vérifier que les index ont été créés
SELECT 
  indexname, 
  indexdef
FROM pg_indexes
WHERE tablename = 'appels_offres'
  AND indexname LIKE 'idx_ao_%'
ORDER BY indexname;
