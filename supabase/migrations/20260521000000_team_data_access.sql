-- PDPL audit log: every time we share customer PII with a team (via
-- WhatsApp dispatch, admin email, manual relay), we write a row here.
-- Required for UAE PDPL data subject access requests — when a customer
-- asks "who saw my data?", we can answer from this table.
--
-- Kept lightweight on purpose: shared_fields is a string array of which
-- PII categories went out, channel identifies the relay path.

CREATE TABLE IF NOT EXISTS team_data_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  shared_fields TEXT[] NOT NULL,
  channel TEXT NOT NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_data_access_booking
  ON team_data_access (booking_id);

CREATE INDEX IF NOT EXISTS idx_team_data_access_team_time
  ON team_data_access (team_id, accessed_at DESC);

ALTER TABLE team_data_access ENABLE ROW LEVEL SECURITY;

-- No anon access. Only service role can read/write this audit log.
-- Admin reads via the service-role-backed admin API.
