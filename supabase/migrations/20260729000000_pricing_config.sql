-- ============================================================
-- Configurable pricing — admin-editable rates per plan
--
-- Before this migration, plan rates were compile-time constants in
-- src/lib/pricing.ts. Now they live here and the app reads them at
-- runtime with a short-lived in-memory cache, falling back to the
-- hardcoded defaults below only when the DB is unreachable.
-- ============================================================

CREATE TABLE pricing_config (
  plan_key   TEXT PRIMARY KEY,
  rate       INTEGER NOT NULL CHECK (rate > 0 AND rate <= 100000),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

INSERT INTO pricing_config (plan_key, rate) VALUES
  ('essential', 349),
  ('signature', 549),
  ('elite', 649);
