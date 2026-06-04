-- ============================================================
-- Non-negative price guardrails (audit: DB finding)
--
-- The booking price snapshot + invoice amount columns were bare INTEGERs
-- with no CHECK, so a negative/inconsistent amount could flow into an
-- immutable FTA tax invoice. Prices are computed server-side today, but
-- a DB guardrail makes a negative amount impossible. Idempotent.
-- ============================================================
ALTER TABLE bookings
  ADD CONSTRAINT chk_bookings_price_net_nonneg   CHECK (price_net_fils   IS NULL OR price_net_fils   >= 0) NOT VALID,
  ADD CONSTRAINT chk_bookings_price_vat_nonneg   CHECK (price_vat_fils   IS NULL OR price_vat_fils   >= 0) NOT VALID,
  ADD CONSTRAINT chk_bookings_price_total_nonneg CHECK (price_total_fils IS NULL OR price_total_fils >= 0) NOT VALID;

ALTER TABLE invoices
  ADD CONSTRAINT chk_invoices_amounts_nonneg
  CHECK (net_fils >= 0 AND vat_fils >= 0 AND total_fils >= 0) NOT VALID;

-- Validate existing rows separately so the ADD doesn't long-lock the table.
ALTER TABLE bookings VALIDATE CONSTRAINT chk_bookings_price_net_nonneg;
ALTER TABLE bookings VALIDATE CONSTRAINT chk_bookings_price_vat_nonneg;
ALTER TABLE bookings VALIDATE CONSTRAINT chk_bookings_price_total_nonneg;
ALTER TABLE invoices VALIDATE CONSTRAINT chk_invoices_amounts_nonneg;
