-- ============================================================
-- Tabby (BNPL) payment support
--
-- Ductly accepts card payments via Stripe and, optionally, Buy-Now-Pay-
-- Later via Tabby. Both create the SAME pending booking; the provider
-- that ultimately confirms it is recorded here so the confirm/dispatch
-- path, refunds, and reporting can tell them apart.
--
--   payment_provider  — 'stripe' (default, back-compatible) or 'tabby'
--   tabby_payment_id  — Tabby's payment.id, stored at session-create so
--                       the return handler + webhook can locate the
--                       booking. Stripe keeps using payment_intent_id.
-- ============================================================
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS tabby_payment_id TEXT;

-- Constrain to known providers (guard against typos in inserts).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_payment_provider_chk'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_payment_provider_chk
      CHECK (payment_provider IN ('stripe', 'tabby'));
  END IF;
END $$;

-- Look up a booking by its Tabby payment id on redirect/webhook.
CREATE INDEX IF NOT EXISTS idx_bookings_tabby_payment_id
  ON bookings (tabby_payment_id)
  WHERE tabby_payment_id IS NOT NULL;
