-- Rate limit table and atomic check function for serverless environments.
-- Run this in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INT NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

-- Atomic rate-limit check: increments counter and returns whether request is allowed.
-- Uses a fixed window (truncated to window_secs intervals).
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key TEXT,
  p_limit INT,
  p_window_secs INT
) RETURNS BOOLEAN AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INT;
BEGIN
  -- Truncate current time to the window boundary
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_secs) * p_window_secs
  );

  -- Upsert: increment counter or insert new row
  INSERT INTO rate_limits (key, window_start, request_count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  -- Clean up old windows (older than 2x the window to avoid buildup)
  DELETE FROM rate_limits
  WHERE key = p_key
    AND window_start < v_window_start - (p_window_secs || ' seconds')::INTERVAL;

  RETURN v_count <= p_limit;
END;
$$ LANGUAGE plpgsql;
