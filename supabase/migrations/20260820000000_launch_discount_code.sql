-- ============================================================
-- Launch marketing discount code — DUCTLY50 (50% off)
--
-- Replaces the popup "mint a unique code per claim" flow. The popup is
-- now newsletter-only (the code is revealed on the popup success screen,
-- not emailed); this single static code is promoted in marketing and
-- entered at checkout. Expires ~2.5 months (75 days) after seeding — the
-- admin can flip `active` off to retire it earlier.
--
-- Idempotent: re-seeds the code and refreshes its expiry on re-run.
-- ============================================================

INSERT INTO discount_codes (code, discount_percent, active, max_uses, expires_at)
VALUES ('DUCTLY50', 50, true, NULL, now() + INTERVAL '75 days')
ON CONFLICT (code) DO UPDATE SET
  discount_percent = EXCLUDED.discount_percent,
  active = EXCLUDED.active,
  max_uses = EXCLUDED.max_uses,
  expires_at = EXCLUDED.expires_at;
