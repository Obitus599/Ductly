-- ============================================================
-- Concurrency + retention hardening
--
-- Fixes three classes of defect found in the 2026-07 audit:
--
--   1. booking_locks: the per-slot capacity trigger COUNTED then INSERTED
--      with nothing serialising the two steps. Two customers hitting the
--      last free slot at the same instant both saw "0 locks used" and both
--      proceeded — one of them ends up confirmed, charged, and with no
--      team able to serve them.
--
--   2. slot_locks: UNIQUE(team_id, slot_start) only stops two jobs that
--      start at the EXACT same second. A 10:00–11:30 job and a 10:30–12:00
--      job for the same team collide in reality but not in the constraint,
--      so one team could be dispatched to two overlapping addresses.
--
--   3. verification_codes held identifiers (email / phone) forever and its
--      wrong-guess counter was incremented read-then-write, so parallel
--      guesses under-counted against the brute-force cap.
-- ============================================================

-- btree_gist lets a GiST exclusion constraint mix equality (team_id) with
-- range overlap (&&) in one index.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- 1. booking_locks — serialise the capacity check per slot
-- ============================================================
-- The advisory lock is transaction-scoped and keyed on the slot, so
-- concurrent inserts for the SAME slot queue up (and see each other's
-- rows) while inserts for different slots stay fully parallel.
CREATE OR REPLACE FUNCTION check_booking_lock_limit()
RETURNS TRIGGER AS $$
DECLARE
  active_team_count INT;
  current_lock_count INT;
BEGIN
  -- Serialise on this slot. Epoch seconds keeps the key stable regardless
  -- of the session TimeZone setting.
  PERFORM pg_advisory_xact_lock(
    hashtext('booking_locks_slot')::int,
    (extract(epoch FROM NEW.slot_start)::bigint % 2147483647)::int
  );

  SELECT COUNT(*) INTO active_team_count
  FROM teams
  WHERE active = true;

  SELECT COUNT(*) INTO current_lock_count
  FROM booking_locks
  WHERE slot_start = NEW.slot_start
    AND expires_at > now();

  IF current_lock_count >= active_team_count THEN
    RAISE EXCEPTION 'All teams are locked for this slot. Please choose another time.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. slot_locks — reject OVERLAPPING assignments, not just identical starts
-- ============================================================
ALTER TABLE slot_locks
  ADD COLUMN IF NOT EXISTS slot_end TIMESTAMPTZ;

-- Backfill from the owning booking; fall back to a 90-minute default for
-- any orphan row so the NOT NULL below can't fail.
UPDATE slot_locks sl
SET slot_end = COALESCE(
  (SELECT b.slot_end FROM bookings b WHERE b.id = sl.booking_id),
  sl.slot_start + INTERVAL '90 minutes'
)
WHERE sl.slot_end IS NULL;

ALTER TABLE slot_locks
  ALTER COLUMN slot_end SET NOT NULL;

-- Defence in depth: a lock that ends before it starts would make the
-- range empty, and an empty range never overlaps anything — silently
-- disabling the constraint for that row.
ALTER TABLE slot_locks DROP CONSTRAINT IF EXISTS slot_locks_range_valid;
ALTER TABLE slot_locks
  ADD CONSTRAINT slot_locks_range_valid CHECK (slot_end > slot_start);

-- Drop any pre-existing duplicate/overlapping rows before adding the
-- constraint, keeping the earliest-created lock per team.
DELETE FROM slot_locks a
USING slot_locks b
WHERE a.team_id = b.team_id
  AND a.id <> b.id
  AND tstzrange(a.slot_start, a.slot_end, '[)') && tstzrange(b.slot_start, b.slot_end, '[)')
  AND (a.created_at, a.id) > (b.created_at, b.id);

ALTER TABLE slot_locks DROP CONSTRAINT IF EXISTS slot_locks_no_overlap;
ALTER TABLE slot_locks
  ADD CONSTRAINT slot_locks_no_overlap
  EXCLUDE USING gist (
    team_id WITH =,
    tstzrange(slot_start, slot_end, '[)') WITH &&
  );

-- ============================================================
-- 3. verification_codes — atomic attempt counter
-- ============================================================
-- Returns the attempt count AFTER the increment so the caller can react
-- to crossing the cap. UPDATE ... SET x = x + 1 is atomic under the row
-- lock; the previous read-then-write let N parallel guesses all read the
-- same value and write back value+1.
CREATE OR REPLACE FUNCTION increment_verification_attempt(p_id UUID)
RETURNS INT AS $$
DECLARE
  new_attempts INT;
BEGIN
  UPDATE verification_codes
  SET attempts = attempts + 1
  WHERE id = p_id
  RETURNING attempts INTO new_attempts;

  RETURN COALESCE(new_attempts, 0);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. verification_codes — retention
-- ============================================================
-- Identifiers are PII (email / phone). Codes are only useful inside their
-- TTL + lockout window, so anything older is pure liability. Called from
-- the app's periodic cleanup path.
CREATE OR REPLACE FUNCTION cleanup_verification_codes()
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM verification_codes
  WHERE created_at < now() - INTERVAL '24 hours';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. error_log — retention
-- ============================================================
-- error_log rows carry request payloads; 90 days is plenty for triage.
CREATE OR REPLACE FUNCTION cleanup_error_log()
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM error_log
  WHERE created_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
