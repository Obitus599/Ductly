-- ============================================================
-- Launch marketing discount code — DUCTLY50 (50% off)
--
-- Replaces the popup "mint a unique code per claim" flow. The popup is
-- now newsletter-only (no code emailed); this single static code is
-- promoted in marketing and entered at checkout. Unlimited uses, no
-- expiry — the admin can flip `active` off to retire it.
--
-- Idempotent: no-op if the code already exists.
-- ============================================================

INSERT INTO discount_codes (code, discount_percent, active, max_uses)
VALUES ('DUCTLY50', 50, true, NULL)
ON CONFLICT (code) DO NOTHING;
