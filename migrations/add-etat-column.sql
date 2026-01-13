-- Migration: Ajouter la colonne etat à appels_offres
-- Cette colonne stocke l'état BOAMP original (AVIS_ANNULE, INITIAL, etc.)

ALTER TABLE appels_offres
ADD COLUMN IF NOT EXISTS etat TEXT;

-- Index pour les requêtes fréquentes sur les annulations
CREATE INDEX IF NOT EXISTS idx_ao_etat 
ON appels_offres(etat)
WHERE etat IS NOT NULL;

-- Commentaire pour documentation
COMMENT ON COLUMN appels_offres.etat IS 'État BOAMP original (AVIS_ANNULE, INITIAL, etc.)';
