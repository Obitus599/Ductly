-- Cancellation & rescheduling support.
-- Run this in the Supabase SQL Editor.

-- Management token for customer self-service (no login required)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS manage_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT CHECK (cancelled_by IN ('customer', 'admin')),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_id TEXT,
  ADD COLUMN IF NOT EXISTS refund_status TEXT CHECK (refund_status IN ('pending', 'succeeded', 'failed')),
  ADD COLUMN IF NOT EXISTS rescheduled_from TIMESTAMPTZ;

-- Index for token lookups
CREATE INDEX IF NOT EXISTS idx_bookings_manage_token ON bookings(manage_token);

-- Update status CHECK to include rescheduled
-- (Drop and recreate since ALTER CHECK isn't supported)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show', 'payment_failed', 'expired', 'rescheduled'));
