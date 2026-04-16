-- Migration: add source column to ao_feedback
-- Distinguishes between 'chat' (applyCorrection tool) and 'email' (feedbackWorkflow HITL)
-- so corrections can be traced back to their origin.

ALTER TABLE ao_feedback
  ADD COLUMN IF NOT EXISTS source TEXT
    CHECK (source IN ('chat', 'email', 'unknown'))
    DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS idx_ao_feedback_source_status
  ON ao_feedback(source, status);
