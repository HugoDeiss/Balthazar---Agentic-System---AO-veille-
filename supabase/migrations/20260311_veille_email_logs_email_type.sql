-- Migration: ajout de email_type et assouplissement de l'unicité sur veille_email_logs
-- À exécuter dans le SQL Editor de Supabase (projet utilisé par Mastra Cloud).

-- 1) Ajouter la colonne email_type si elle n'existe pas déjà
ALTER TABLE veille_email_logs
ADD COLUMN IF NOT EXISTS email_type TEXT;

-- 2) Supprimer l'index UNIQUE existant basé sur (client_id, since, COALESCE(until, since)) si présent
DROP INDEX IF EXISTS idx_veille_email_logs_unique;

-- 3) Recréer un index NON-UNIQUE pour les recherches par client/plage
CREATE INDEX IF NOT EXISTS idx_veille_email_logs_unique
ON veille_email_logs(client_id, since, COALESCE(until, since));

