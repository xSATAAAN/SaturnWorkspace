CREATE TABLE IF NOT EXISTS release_catalog (
  version TEXT PRIMARY KEY,
  channel TEXT NOT NULL DEFAULT 'beta',
  release_type TEXT NOT NULL DEFAULT 'internal',
  visibility TEXT NOT NULL DEFAULT 'internal',
  artifact_kind TEXT NOT NULL DEFAULT 'installed_zip',
  source TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO release_catalog (
  version,
  channel,
  release_type,
  visibility,
  artifact_kind,
  source,
  notes
) VALUES
  ('1.0.0-beta', 'beta', 'public_beta', 'public', 'full_setup', 'setup', 'First public beta baseline.'),
  ('1.0.8-beta', 'beta', 'internal_test', 'archived', 'installed_zip', 'r2', 'Internal pre-public test build.'),
  ('1.0.12-beta-test16', 'beta', 'internal_test', 'archived', 'installed_zip', 'r2', 'Internal OTA test build.'),
  ('1.0.12-beta-test17', 'beta', 'internal_test', 'archived', 'installed_zip', 'r2', 'Internal OTA test build.'),
  ('1.0.12-beta-test18', 'beta', 'internal_test', 'archived', 'installed_zip', 'r2', 'Internal OTA test build.');
