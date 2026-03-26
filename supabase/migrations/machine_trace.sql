-- Brique 1: Machine trace columns on appels_offres
ALTER TABLE appels_offres
  ADD COLUMN IF NOT EXISTS keyword_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS matched_keywords_detail JSONB,
  ADD COLUMN IF NOT EXISTS llm_skipped BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS llm_skip_reason TEXT,
  ADD COLUMN IF NOT EXISTS rag_sources_detail JSONB,
  ADD COLUMN IF NOT EXISTS decision_gate TEXT,
  ADD COLUMN IF NOT EXISTS confidence_decision TEXT,
  ADD COLUMN IF NOT EXISTS rejet_raison TEXT,
  ADD COLUMN IF NOT EXISTS human_readable_reason TEXT;

-- Brique 2: Status column on ao_feedback
ALTER TABLE ao_feedback
  ADD COLUMN IF NOT EXISTS status TEXT
    CHECK (status IN ('draft', 'agent_proposed', 'awaiting_confirm', 'applied', 'rejected'))
    DEFAULT 'draft';

-- Brique 2: Agent diagnosis/proposal columns on ao_feedback
ALTER TABLE ao_feedback
  ADD COLUMN IF NOT EXISTS agent_diagnosis TEXT,
  ADD COLUMN IF NOT EXISTS agent_proposal TEXT,
  ADD COLUMN IF NOT EXISTS correction_type TEXT,
  ADD COLUMN IF NOT EXISTS correction_value TEXT,
  ADD COLUMN IF NOT EXISTS chunk_content TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Brique 4: keyword_overrides table
CREATE TABLE IF NOT EXISTS keyword_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id TEXT NOT NULL DEFAULT 'balthazar',
  type TEXT CHECK (type IN ('red_flag', 'required_keyword')) NOT NULL,
  value TEXT NOT NULL,
  reason TEXT,
  feedback_id UUID REFERENCES ao_feedback(id),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keyword_overrides_client_active ON keyword_overrides(client_id, active);
