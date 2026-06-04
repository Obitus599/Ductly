-- ============================================================
-- FTA VAT tax invoices (#8)
--
-- One invoice per booking, issued after service. Amounts are SNAPSHOTTED
-- from the booking's price columns (fils) so the invoice is immutable
-- and never recomputes. invoice_number is gap-free sequential — an FTA
-- requirement — guaranteed by allocating the number and inserting the
-- row inside ONE transaction (create_invoice_for_booking), so any
-- failure rolls back the counter increment too. No gaps, ever.
--
-- RLS enabled with no policies → service role only.
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  seq BIGINT NOT NULL UNIQUE,
  invoice_number TEXT NOT NULL UNIQUE,
  net_fils INTEGER NOT NULL,
  vat_fils INTEGER NOT NULL,
  total_fils INTEGER NOT NULL,
  vat_rate NUMERIC(5,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'aed',
  supplier_trn TEXT,                -- TRN snapshot at issue time
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_booking ON invoices(booking_id);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Single-row gap-free counter.
CREATE TABLE IF NOT EXISTS invoice_sequence (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_value BIGINT NOT NULL DEFAULT 0
);
INSERT INTO invoice_sequence (id, last_value) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
ALTER TABLE invoice_sequence ENABLE ROW LEVEL SECURITY;

-- Idempotent, atomic, gap-free invoice creation for a booking.
-- Returns the existing invoice if one already exists.
CREATE OR REPLACE FUNCTION create_invoice_for_booking(
  p_booking_id UUID,
  p_supplier_trn TEXT
)
RETURNS invoices
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing invoices;
  v_booking bookings;
  v_seq BIGINT;
  v_number TEXT;
  v_result invoices;
BEGIN
  SELECT * INTO v_existing FROM invoices WHERE booking_id = p_booking_id;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found: %', p_booking_id;
  END IF;
  IF v_booking.price_total_fils IS NULL THEN
    RAISE EXCEPTION 'booking % has no price snapshot', p_booking_id;
  END IF;

  -- Row-lock the counter and increment atomically.
  UPDATE invoice_sequence SET last_value = last_value + 1 WHERE id = 1
    RETURNING last_value INTO v_seq;
  v_number := 'INV-' || lpad(v_seq::text, 6, '0');

  INSERT INTO invoices (
    booking_id, seq, invoice_number,
    net_fils, vat_fils, total_fils, vat_rate, currency, supplier_trn
  )
  VALUES (
    p_booking_id, v_seq, v_number,
    v_booking.price_net_fils, v_booking.price_vat_fils, v_booking.price_total_fils,
    v_booking.vat_rate, COALESCE(v_booking.currency, 'aed'), p_supplier_trn
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;
