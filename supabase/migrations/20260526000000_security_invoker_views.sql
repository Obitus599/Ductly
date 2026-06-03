-- Fix Supabase linter ERROR: security_definer_view
-- (https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view)
--
-- The two views below were created without an explicit security mode,
-- which on this Postgres version defaults to SECURITY DEFINER. That
-- means anon clients hitting the auto-generated REST API at
-- /rest/v1/team_workloads or /rest/v1/feedback_summary would query
-- with the view-creator's privileges and BYPASS the RLS policies we
-- just tightened on `bookings` and `feedback`.
--
-- Recreate both with security_invoker = true so they run as the
-- caller. All actual callers (admin/stats, admin/teams, admin/feedback,
-- scheduling-agent) use the service role client (supabaseAdmin) which
-- bypasses RLS unconditionally, so this is a pure hardening change —
-- no functional impact.

DROP VIEW IF EXISTS team_workloads;
CREATE VIEW team_workloads
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

DROP VIEW IF EXISTS feedback_summary;
CREATE VIEW feedback_summary
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

-- Belt-and-braces: revoke anon access to both views so even if
-- security_invoker is misinterpreted by some Postgres revision, the
-- anon role still cannot reach this data through PostgREST.
REVOKE ALL ON team_workloads FROM anon;
REVOKE ALL ON feedback_summary FROM anon;

-- Keep admin (service_role) + future authenticated-user access intact.
GRANT SELECT ON team_workloads TO authenticated, service_role;
GRANT SELECT ON feedback_summary TO authenticated, service_role;
