-- Admin-controlled time blackouts: lets ops mark a team (or all teams)
-- as unavailable for an arbitrary time range. The slot-availability
-- query and the admin booking-create endpoint both subtract these.

CREATE TABLE IF NOT EXISTS schedule_blackouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,  -- NULL = blackout applies to ALL teams (e.g. public holiday)
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  created_by TEXT,                                       -- admin email (for audit)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_schedule_blackouts_range
  ON schedule_blackouts (starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_schedule_blackouts_team
  ON schedule_blackouts (team_id);

ALTER TABLE schedule_blackouts ENABLE ROW LEVEL SECURITY;
-- service_role bypasses RLS (used by the API). No public policies.
