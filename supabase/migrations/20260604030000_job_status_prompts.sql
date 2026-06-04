-- ============================================================
-- Job-completion prompts (#9)
--
-- WhatsApp quick-reply buttons return only the static button id
-- (job_completed / job_not_completed) — not which booking. So when we
-- send the ductly_job_status prompt to a team we record a row here; on
-- the inbound button reply we match it to the most recent PENDING prompt
-- for that team's WhatsApp number.
--
-- RLS enabled with no policies → service role only.
-- ============================================================
CREATE TABLE IF NOT EXISTS job_status_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  team_whatsapp TEXT NOT NULL,        -- normalized number the prompt was sent to
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'not_completed')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

-- Match an inbound reply to the latest pending prompt for a number.
CREATE INDEX IF NOT EXISTS idx_job_status_prompts_lookup
  ON job_status_prompts (team_whatsapp, status, sent_at DESC);

ALTER TABLE job_status_prompts ENABLE ROW LEVEL SECURITY;
