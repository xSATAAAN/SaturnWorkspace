CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  role TEXT NOT NULL DEFAULT 'user',
  plan_id TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS installs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  device_id TEXT,
  install_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_seen_app_version TEXT,
  channel TEXT,
  platform TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS policy_overrides (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  subject TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  blocked_actions_json TEXT,
  features_json TEXT,
  limits_json TEXT,
  expires_at TEXT,
  sticky INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS disabled_versions (
  version TEXT PRIMARY KEY,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS global_policy (
  id TEXT PRIMARY KEY,
  kill_switch_enabled INTEGER NOT NULL DEFAULT 0,
  mandatory_update_enabled INTEGER NOT NULL DEFAULT 0,
  minimum_supported_version TEXT,
  update_mode TEXT NOT NULL DEFAULT 'optional',
  blocked_actions_json TEXT,
  features_json TEXT,
  limits_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plan_features (
  plan_id TEXT PRIMARY KEY,
  features_json TEXT,
  blocked_actions_json TEXT,
  limits_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS policy_audit (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT,
  install_id TEXT,
  device_id TEXT,
  app_version TEXT,
  channel TEXT,
  requested_action TEXT,
  decision TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_installs_user ON installs(user_id);
CREATE INDEX IF NOT EXISTS idx_policy_overrides_lookup ON policy_overrides(scope, subject);
CREATE INDEX IF NOT EXISTS idx_policy_audit_created_at ON policy_audit(created_at);

INSERT OR IGNORE INTO global_policy (
  id,
  kill_switch_enabled,
  mandatory_update_enabled,
  minimum_supported_version,
  update_mode,
  blocked_actions_json,
  features_json,
  limits_json
) VALUES (
  'global',
  0,
  0,
  '',
  'optional',
  '[]',
  '{}',
  '{}'
);

INSERT OR IGNORE INTO plan_features (plan_id, features_json, blocked_actions_json, limits_json)
VALUES
  ('default', '{"sessions":true,"updates":true,"adspower":true,"cloud_sync":false}', '[]', '{"sessions_per_day":100}'),
  ('starter', '{"sessions":true,"updates":true,"adspower":false,"cloud_sync":false}', '["adspower_write"]', '{"sessions_per_day":20}'),
  ('pro', '{"sessions":true,"updates":true,"adspower":true,"cloud_sync":true}', '[]', '{"sessions_per_day":500}');
