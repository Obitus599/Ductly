-- ============================================================
-- RLS + lock hardening (2026-07 security audit)
--
-- Closes two ways the PUBLIC anon key (a publishable key, not a secret)
-- could hit the database directly through PostgREST, bypassing the app:
--
--   1. rate_limits was the ONLY table in the schema without RLS enabled.
--      With Supabase's default grants, anon could read every rate-limit
--      key (which embed customer emails/phones on the verify path) and
--      delete rows to wipe every throttle in the product.
--
--   2. booking_locks had `WITH CHECK (true)` INSERT and `USING (true)`
--      DELETE policies for anon. Anon could insert holds directly with an
--      arbitrary far-future expires_at (permanent slot exhaustion) or
--      delete another customer's active hold mid-checkout. The app only
--      ever touches booking_locks through the service-role client, so the
--      anon policies are not load-bearing.
-- ============================================================

-- ── 1. rate_limits: enable RLS, revoke anon/authenticated grants ──────────
-- Service role bypasses RLS, and lib/rate-limit.ts is the only reader (via
-- supabaseAdmin), so the application is unaffected. No policies = no anon
-- access at all.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE rate_limits FROM anon, authenticated;

-- The counter RPC is SECURITY DEFINER-agnostic and only the server should
-- call it. Take it away from the public roles.
REVOKE ALL ON FUNCTION check_rate_limit(TEXT, INT, INT) FROM anon, authenticated;

-- ── 2. booking_locks: drop the permissive anon policies ───────────────────
DROP POLICY IF EXISTS "Anyone can create booking locks" ON booking_locks;
DROP POLICY IF EXISTS "Anyone can view booking locks" ON booking_locks;
DROP POLICY IF EXISTS "Anyone can delete own booking locks" ON booking_locks;

-- Remove any rows that would violate the new bounds before adding them —
-- these are expired holds and any immortal/garbage rows a direct-PostgREST
-- writer may have inserted. booking_locks is ephemeral (10-min TTL), so
-- dropping stale/out-of-bound rows is safe; live sessions re-create theirs.
DELETE FROM booking_locks
WHERE expires_at <= locked_at
   OR expires_at > locked_at + INTERVAL '15 minutes'
   OR slot_start > locked_at + INTERVAL '180 days';

-- Defence in depth for the service-role path too: even a future app bug
-- cannot mint an immortal hold or one absurdly far in the future. The app
-- uses a 10-minute TTL; 15 minutes leaves headroom.
ALTER TABLE booking_locks DROP CONSTRAINT IF EXISTS booking_locks_ttl_bound;
ALTER TABLE booking_locks
  ADD CONSTRAINT booking_locks_ttl_bound
  CHECK (expires_at > locked_at AND expires_at <= locked_at + INTERVAL '15 minutes');

ALTER TABLE booking_locks DROP CONSTRAINT IF EXISTS booking_locks_slot_horizon;
ALTER TABLE booking_locks
  ADD CONSTRAINT booking_locks_slot_horizon
  CHECK (slot_start <= locked_at + INTERVAL '180 days');

-- ── 3. teams: stop exposing crew WhatsApp numbers to anon ─────────────────
-- The app reads teams through the service-role client, so anon SELECT is
-- not needed. The old "Anyone can view active teams" policy returned every
-- column, including whatsapp_number (field-crew personal contact). Replace
-- it with a column-scoped view for any future anon availability need.
DROP POLICY IF EXISTS "Anyone can view active teams" ON teams;

CREATE OR REPLACE VIEW public_teams
  WITH (security_invoker = true)
AS
SELECT id, name, active
FROM teams
WHERE active = true;
