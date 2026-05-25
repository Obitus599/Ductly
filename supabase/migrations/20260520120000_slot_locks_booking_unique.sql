-- Enforce one slot_lock per booking. Combined with the conditional
-- assignment in scheduling-agent.ts (only update team_id WHERE
-- team_id IS NULL), this closes the race between the Stripe webhook
-- agent and admin team-reassignment writes.

-- Defensive: clean up any existing duplicate slot_locks per booking
-- (keep the most recently created). Without this the unique
-- constraint would fail to add.
DELETE FROM slot_locks WHERE id NOT IN (
  SELECT DISTINCT ON (booking_id) id
  FROM slot_locks
  ORDER BY booking_id, created_at DESC
);

ALTER TABLE slot_locks
  ADD CONSTRAINT slot_locks_booking_id_unique UNIQUE (booking_id);
