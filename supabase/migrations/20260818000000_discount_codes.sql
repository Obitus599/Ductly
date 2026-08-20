-- ============================================================
-- Discount codes — popup signup offer
--
-- Three pieces:
--   1. discount_rules — a singleton campaign row the admin edits
--      (mirrors pricing_config). Seeded with the 50% launch offer.
--   2. discount_codes — unique codes minted per popup claim
--      (e.g. DUCTLY-AB12CD), snapshotting the percent at issue time.
--   3. bookings.discount_code / discount_percent — records which
--      code a paid booking used. The booking's existing financial
--      snapshot (price_net/vat/total_fils) holds the DISCOUNTED
--      amounts, so invoices/reports stay correct with no changes.
--
-- All access is via the service-role client (supabaseAdmin), which
-- bypasses RLS. No anon policies are granted.
-- ============================================================

CREATE TABLE discount_rules (
  id               INT PRIMARY KEY CHECK (id = 1),
  discount_percent INT NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
  active           BOOLEAN NOT NULL DEFAULT true,
  expires_at       TIMESTAMPTZ,
  max_uses         INT CHECK (max_uses IS NULL OR max_uses >= 0),
  used_count       INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE discount_rules ENABLE ROW LEVEL SECURITY;

INSERT INTO discount_rules (id, discount_percent)
VALUES (1, 50);

CREATE TABLE discount_codes (
  code              TEXT PRIMARY KEY,
  discount_percent  INT NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
  active            BOOLEAN NOT NULL DEFAULT true,
  expires_at        TIMESTAMPTZ,
  max_uses          INT CHECK (max_uses IS NULL OR max_uses >= 0),
  used_count        INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  issued_to_email   TEXT,
  issued_to_phone   TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS discount_code TEXT,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC;

-- Atomic usage bump, called on payment confirmation. Guarantees the
-- counter never over-counts under concurrent webhook deliveries.
CREATE OR REPLACE FUNCTION increment_discount_usage(p_code TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE discount_codes
     SET used_count = used_count + 1
   WHERE code = p_code;
END;
$$;
