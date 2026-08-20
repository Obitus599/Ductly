-- ============================================================
-- Newsletter popup — collect UAE mobile alongside email
--
-- The popup now asks for an email AND a UAE mobile (E.164). The value is
-- normalized server-side (lib/phone-uae) before storage, so this column
-- holds "+9715XXXXXXXX". Nullable so pre-existing rows and any legacy
-- email-only signups remain valid.
-- ============================================================

ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS phone TEXT;
