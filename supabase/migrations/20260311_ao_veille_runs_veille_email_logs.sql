-- ============================================
-- Migration: ao_veille_runs + veille_email_logs
-- À exécuter dans le SQL Editor Supabase
-- ============================================

-- Prérequis: la fonction update_updated_at_column doit exister (définie dans supabase-setup.sql)
-- Si elle n'existe pas, décommenter et exécuter d'abord :
/*
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
*/

-- ============================================
-- TABLE AO_VEILLE_RUNS (IDEMPOTENCE & OBSERVABILITÉ)
-- ============================================

CREATE TABLE IF NOT EXISTS ao_veille_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id),
  since DATE NOT NULL,
  until DATE,
  source TEXT NOT NULL DEFAULT 'github',
  external_run_id TEXT,
  status TEXT NOT NULL DEFAULT 'started',
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ao_veille_runs_unique
ON ao_veille_runs(client_id, since, COALESCE(until, since), source);

CREATE INDEX IF NOT EXISTS idx_ao_veille_runs_client_date
ON ao_veille_runs(client_id, since DESC);

ALTER TABLE public.ao_veille_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ao_veille_runs_select" ON public.ao_veille_runs;
DROP POLICY IF EXISTS "ao_veille_runs_insert" ON public.ao_veille_runs;
DROP POLICY IF EXISTS "ao_veille_runs_update" ON public.ao_veille_runs;
DROP POLICY IF EXISTS "ao_veille_runs_delete" ON public.ao_veille_runs;

CREATE POLICY "ao_veille_runs_select" ON public.ao_veille_runs FOR SELECT
  USING (((select auth.jwt()) ->> 'role') = 'service_role' OR (select auth.role()) = 'authenticated');

CREATE POLICY "ao_veille_runs_insert" ON public.ao_veille_runs FOR INSERT
  WITH CHECK (((select auth.jwt()) ->> 'role') = 'service_role');

CREATE POLICY "ao_veille_runs_update" ON public.ao_veille_runs FOR UPDATE
  USING (((select auth.jwt()) ->> 'role') = 'service_role')
  WITH CHECK (((select auth.jwt()) ->> 'role') = 'service_role');

CREATE POLICY "ao_veille_runs_delete" ON public.ao_veille_runs FOR DELETE
  USING (((select auth.jwt()) ->> 'role') = 'service_role');

DROP TRIGGER IF EXISTS update_ao_veille_runs_updated_at ON ao_veille_runs;
CREATE TRIGGER update_ao_veille_runs_updated_at
  BEFORE UPDATE ON ao_veille_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABLE VEILLE_EMAIL_LOGS (ANTI-DUPLICATION EMAILS)
-- ============================================

CREATE TABLE IF NOT EXISTS veille_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id),
  since DATE NOT NULL,
  until DATE,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'sent',
  message_id_resend TEXT,
  payload_hash TEXT,
  run_id UUID REFERENCES ao_veille_runs(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_veille_email_logs_unique
ON veille_email_logs(client_id, since, COALESCE(until, since))
WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_veille_email_logs_client_date
ON veille_email_logs(client_id, since DESC);

ALTER TABLE public.veille_email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "veille_email_logs_select" ON public.veille_email_logs;
DROP POLICY IF EXISTS "veille_email_logs_insert" ON public.veille_email_logs;
DROP POLICY IF EXISTS "veille_email_logs_delete" ON public.veille_email_logs;

CREATE POLICY "veille_email_logs_select" ON public.veille_email_logs FOR SELECT
  USING (((select auth.jwt()) ->> 'role') = 'service_role' OR (select auth.role()) = 'authenticated');

CREATE POLICY "veille_email_logs_insert" ON public.veille_email_logs FOR INSERT
  WITH CHECK (((select auth.jwt()) ->> 'role') = 'service_role');

CREATE POLICY "veille_email_logs_delete" ON public.veille_email_logs FOR DELETE
  USING (((select auth.jwt()) ->> 'role') = 'service_role');
