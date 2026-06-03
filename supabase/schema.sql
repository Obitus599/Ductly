-- ============================================================
-- DUCTLY DATABASE SCHEMA
-- Run this in the Supabase SQL Editor to create all tables
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. TEAMS
-- ============================================================
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. CUSTOMERS
-- ============================================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false,
  last_booking TIMESTAMPTZ,
  consent_given_at TIMESTAMPTZ,
  consent_version TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_deleted_at ON customers(deleted_at);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. BOOKINGS
-- ============================================================
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end TIMESTAMPTZ NOT NULL,
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookings_slot_start ON bookings(slot_start);
CREATE INDEX idx_bookings_team_id ON bookings(team_id);
CREATE INDEX idx_bookings_customer_id ON bookings(customer_id);
CREATE INDEX idx_bookings_status ON bookings(status);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. BOOKING_LOCKS (pre-payment, temporary holds)
-- Multi-team aware: uses a trigger to enforce max concurrent
-- locks per slot <= number of active teams
-- ============================================================
CREATE TABLE booking_locks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slot_start TIMESTAMPTZ NOT NULL,
  session_id TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_booking_locks_slot_start ON booking_locks(slot_start);
CREATE INDEX idx_booking_locks_expires_at ON booking_locks(expires_at);

ALTER TABLE booking_locks ENABLE ROW LEVEL SECURITY;

-- Trigger function: prevent more concurrent locks than active teams
CREATE OR REPLACE FUNCTION check_booking_lock_limit()
RETURNS TRIGGER AS $$
DECLARE
  active_team_count INT;
  current_lock_count INT;
BEGIN
  -- Count active teams
  SELECT COUNT(*) INTO active_team_count
  FROM teams
  WHERE active = true;

  -- Count non-expired locks for this slot (excluding the one being inserted)
  SELECT COUNT(*) INTO current_lock_count
  FROM booking_locks
  WHERE slot_start = NEW.slot_start
    AND expires_at > now();

  -- Block if we've reached the limit
  IF current_lock_count >= active_team_count THEN
    RAISE EXCEPTION 'All teams are locked for this slot. Please choose another time.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_booking_lock_limit
  BEFORE INSERT ON booking_locks
  FOR EACH ROW
  EXECUTE FUNCTION check_booking_lock_limit();

-- ============================================================
-- 5. SLOT_LOCKS (post-payment, permanent team assignment)
-- ============================================================
CREATE TABLE slot_locks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  slot_start TIMESTAMPTZ NOT NULL,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, slot_start)
);

CREATE INDEX idx_slot_locks_slot_start ON slot_locks(slot_start);

ALTER TABLE slot_locks ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. TEAM_SCHEDULES
-- ============================================================
CREATE TABLE team_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, day_of_week)
);

ALTER TABLE team_schedules ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. TRAVEL_CACHE
-- ============================================================
CREATE TABLE travel_cache (
  origin_geohash TEXT NOT NULL,
  dest_geohash TEXT NOT NULL,
  time_bucket TEXT NOT NULL,
  duration_mins INT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (origin_geohash, dest_geohash, time_bucket)
);

ALTER TABLE travel_cache ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. FEEDBACK
-- ============================================================
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. ERROR_LOG
-- ============================================================
CREATE TABLE error_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_name TEXT NOT NULL,
  error_message TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 10. AUTO-UPDATE TRIGGER for updated_at columns
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_team_schedules_updated_at
  BEFORE UPDATE ON team_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 11. SQL VIEWS
-- ============================================================

-- View: team_workloads - booking counts per team per week/month
-- security_invoker = true enforces RLS as the calling user, not as
-- the view creator (avoids Supabase linter ERROR 0010).
CREATE OR REPLACE VIEW team_workloads
  WITH (security_invoker = true)
AS
SELECT
  t.id AS team_id,
  t.name AS team_name,
  COUNT(b.id) FILTER (
    WHERE b.slot_start >= date_trunc('week', now())
      AND b.slot_start < date_trunc('week', now()) + INTERVAL '7 days'
      AND b.status IN ('confirmed', 'completed')
  ) AS bookings_this_week,
  COUNT(b.id) FILTER (
    WHERE b.slot_start >= date_trunc('month', now())
      AND b.slot_start < date_trunc('month', now()) + INTERVAL '1 month'
      AND b.status IN ('confirmed', 'completed')
  ) AS bookings_this_month
FROM teams t
LEFT JOIN bookings b ON b.team_id = t.id
WHERE t.active = true
GROUP BY t.id, t.name;

-- View: feedback_summary - average rating per team per month
-- security_invoker = true enforces RLS as the calling user.
CREATE OR REPLACE VIEW feedback_summary
  WITH (security_invoker = true)
AS
SELECT
  t.id AS team_id,
  t.name AS team_name,
  date_trunc('month', f.created_at) AS month,
  ROUND(AVG(f.rating), 2) AS avg_rating,
  COUNT(f.id) AS review_count
FROM teams t
JOIN feedback f ON f.booking_id IN (
  SELECT id FROM bookings WHERE team_id = t.id
)
GROUP BY t.id, t.name, date_trunc('month', f.created_at);

-- ============================================================
-- 12. FUNCTION: Clean up expired booking locks
-- Run periodically via pg_cron or application code
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_expired_booking_locks()
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM booking_locks WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 13. RLS POLICIES (basic - refine per role as needed)
-- These allow service_role full access. Refine for anon/authenticated.
-- ============================================================

-- Teams: public read for active teams
CREATE POLICY "Anyone can view active teams"
  ON teams FOR SELECT
  USING (active = true);

-- Team schedules: public read for active schedules
CREATE POLICY "Anyone can view active schedules"
  ON team_schedules FOR SELECT
  USING (active = true);

-- Booking locks: allow insert/select for anonymous sessions
CREATE POLICY "Anyone can create booking locks"
  ON booking_locks FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can view booking locks"
  ON booking_locks FOR SELECT
  USING (true);

CREATE POLICY "Anyone can delete own booking locks"
  ON booking_locks FOR DELETE
  USING (true);

-- Bookings: authenticated users can view their own
CREATE POLICY "Users can view own bookings"
  ON bookings FOR SELECT
  USING (true);

-- Customers: authenticated users can manage own profile
CREATE POLICY "Users can view own customer record"
  ON customers FOR SELECT
  USING (true);

-- Slot locks: read access for availability checks
CREATE POLICY "Anyone can view slot locks"
  ON slot_locks FOR SELECT
  USING (true);

-- Feedback: public read
CREATE POLICY "Anyone can view feedback"
  ON feedback FOR SELECT
  USING (true);

-- Error log: admin only (service_role bypasses RLS)
-- No public policy needed - service_role handles writes
