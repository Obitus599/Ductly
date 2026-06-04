-- ============================================================
-- Harden create_invoice_for_booking guard (#8 review follow-up)
--
-- The original guard only raised on price_total_fils IS NULL, then
-- inserted net_fils/vat_fils into NOT NULL columns. bookings.price_net_fils
-- and price_vat_fils are nullable, so a row with a total but a NULL net or
-- vat would hit a generic constraint violation deep in the transaction
-- instead of an explicit, diagnosable error. Broaden the guard.
--
-- Low severity (the checkout + manual-booking paths always write all
-- three together), purely a diagnosability hardening. CREATE OR REPLACE,
-- so re-applying is safe and idempotent.
-- ============================================================
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
  IF v_booking.price_total_fils IS NULL
     OR v_booking.price_net_fils IS NULL
     OR v_booking.price_vat_fils IS NULL THEN
    RAISE EXCEPTION 'booking % has no complete price snapshot', p_booking_id;
  END IF;

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
