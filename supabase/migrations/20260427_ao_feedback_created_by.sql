ALTER TABLE ao_feedback ADD COLUMN IF NOT EXISTS created_by TEXT;

CREATE INDEX IF NOT EXISTS idx_ao_feedback_created_by_status
  ON ao_feedback(created_by, status);
