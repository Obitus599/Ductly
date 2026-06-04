-- ============================================================
-- Customer contact verification codes (#7)
--
-- OTP codes for verifying a customer's email + phone on the public
-- booking page before payment. Codes are stored HASHED (HMAC-SHA256
-- with VERIFY_CODE_SECRET) — never in plaintext. Rows auto-expire via
-- expires_at and are consumed (consumed_at) on a correct match.
--
-- RLS enabled with NO policies → only the service role (which bypasses
-- RLS) can touch this table. Anon/authenticated clients cannot read
-- codes or enumerate identifiers. PII (email/phone) lives here only
-- transiently; a cleanup job can purge consumed/expired rows.
-- ============================================================
CREATE TABLE IF NOT EXISTS verification_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier TEXT NOT NULL,                 -- normalized email or E.164-ish phone
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  code_hash TEXT NOT NULL,                  -- HMAC-SHA256(code, VERIFY_CODE_SECRET)
  attempts INTEGER NOT NULL DEFAULT 0,      -- wrong-guess counter (capped)
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,                  -- set when the correct code is entered
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Latest-code-first lookup for a given identifier+channel.
CREATE INDEX IF NOT EXISTS idx_verification_codes_lookup
  ON verification_codes (identifier, channel, created_at DESC);

-- "Is this contact verified recently?" lookup for the checkout gate.
CREATE INDEX IF NOT EXISTS idx_verification_codes_consumed
  ON verification_codes (identifier, channel, consumed_at);

ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;
