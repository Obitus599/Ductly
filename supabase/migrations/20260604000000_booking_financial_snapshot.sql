-- ============================================================
-- Booking financial snapshot for FTA VAT invoicing (#8)
--
-- Until now the charged amount lived ONLY in Stripe (checkout
-- metadata + PaymentIntent) — the bookings table had no price. A tax
-- invoice must be generated from the booking itself, so we persist a
-- price snapshot at booking-creation time.
--
-- Prices are quoted NET (VAT-exclusive): the displayed plan price is
-- pre-tax and 5% VAT is added on top. We store net / VAT / total in
-- integer fils (1 AED = 100 fils) plus the rate and currency, so the
-- invoice never has to recompute or trust Stripe.
--
-- plan + thermostats are added defensively with IF NOT EXISTS: the
-- admin manual-booking route already writes them (added out-of-band in
-- the live DB), but the online checkout path did not persist them and
-- the repo migrations never captured the columns.
-- ============================================================
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS plan TEXT,
  ADD COLUMN IF NOT EXISTS thermostats INTEGER,
  ADD COLUMN IF NOT EXISTS price_net_fils INTEGER,
  ADD COLUMN IF NOT EXISTS price_vat_fils INTEGER,
  ADD COLUMN IF NOT EXISTS price_total_fils INTEGER,
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'aed';

COMMENT ON COLUMN bookings.price_net_fils IS 'Pre-tax amount in fils (VAT-exclusive). 1 AED = 100 fils.';
COMMENT ON COLUMN bookings.price_vat_fils IS 'VAT amount in fils (5% of net).';
COMMENT ON COLUMN bookings.price_total_fils IS 'Total charged in fils (net + VAT).';
