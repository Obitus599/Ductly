-- Add notification tracking columns to prevent duplicate sends from n8n.

-- Track when reminders were sent (prevents duplicate 24h/1h reminders)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent_at  timestamptz;

-- Track when no-show follow-up was sent
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS noshow_notified_at timestamptz;

-- Track when feedback request was sent
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS feedback_requested_at timestamptz;

-- Index for the n8n polling queries
CREATE INDEX IF NOT EXISTS idx_bookings_status_slot_start
  ON bookings (status, slot_start);
