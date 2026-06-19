CREATE TABLE IF NOT EXISTS invite_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invite_code_validations (
  id TEXT PRIMARY KEY,
  invite_code_id TEXT,
  user_id TEXT,
  email TEXT,
  install_id TEXT,
  device_id TEXT,
  app_version TEXT,
  channel TEXT,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invite_code_id) REFERENCES invite_codes(id)
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_hash ON invite_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_invite_validations_created ON invite_code_validations(created_at);
CREATE INDEX IF NOT EXISTS idx_invite_validations_user ON invite_code_validations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invite_validations_device ON invite_code_validations(device_id, created_at);
