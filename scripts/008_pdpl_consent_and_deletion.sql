-- 008: PDPL compliance — consent record + soft-delete (right to be forgotten).
-- Run this in Supabase SQL Editor.

-- Capture consent at booking time (UAE PDPL requirement)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_version  TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at       TIMESTAMPTZ;

-- Admin filtering on "active customers" excludes deleted rows
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON customers(deleted_at);
