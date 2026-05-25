-- Add is_test_data flag to bookings + customers so test-mode Stripe
-- bookings don't pollute production analytics or trigger real
-- customer notifications.
--
-- Source of truth: Stripe event.livemode. When false, the booking is
-- marked is_test_data=true and excluded from default analytics queries.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for the common "exclude test data" filter on bookings.
-- Partial index keeps it small — only the rare test rows are indexed.
CREATE INDEX IF NOT EXISTS idx_bookings_is_test_data
  ON bookings (is_test_data) WHERE is_test_data = TRUE;
