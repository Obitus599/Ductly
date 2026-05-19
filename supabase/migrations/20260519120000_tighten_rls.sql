-- Tighten Row-Level Security: the original schema shipped with
-- `USING (true)` on several sensitive tables, which means any caller
-- holding the public anon key (exposed in the booking page's HTML)
-- could read every row.
--
-- The app is server-side-only (backend always uses the service role
-- key, which bypasses RLS), so the public policies were never load-
-- bearing — they were a leftover from the initial schema scaffold.
-- Dropping them closes a real data exfiltration path: scraping all
-- customer names, emails, phones, addresses, and bookings via:
--   curl -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>" \
--        "<SUPABASE_URL>/rest/v1/customers?select=*"
--
-- After this migration, the above curl returns [].

DROP POLICY IF EXISTS "Users can view own bookings" ON bookings;
DROP POLICY IF EXISTS "Users can view own customer record" ON customers;
DROP POLICY IF EXISTS "Anyone can view feedback" ON feedback;

-- Policies retained intentionally because they're load-bearing for
-- the (server-side) booking flow:
--   - "Anyone can view active teams"        (teams: drives the booking page)
--   - "Anyone can view active schedules"    (team_schedules: drives slot calc)
--   - "Anyone can create/view/delete booking_locks"  (pre-payment holds)
--   - "Anyone can view slot locks"          (slot availability lookups)
--
-- These could still be tightened (e.g. expose only `id, name` of teams
-- to anon) — that's a follow-up. The critical PII path is closed.
