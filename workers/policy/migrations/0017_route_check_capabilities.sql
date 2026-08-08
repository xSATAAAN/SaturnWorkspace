-- Migration number: 0017
CREATE TABLE IF NOT EXISTS route_check_capabilities (
  token_hash TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  browser_secret_hash TEXT NOT NULL,
  desktop_secret_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_route_check_capabilities_expiry
  ON route_check_capabilities(expires_at, consumed_at);
