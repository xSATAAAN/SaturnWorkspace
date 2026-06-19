INSERT OR IGNORE INTO users (id, email, status, role, plan_id)
VALUES
  ('test-allow-user', 'policy-allow@saturnws.test', 'active', 'user', 'pro'),
  ('test-disabled-user', 'policy-disabled@saturnws.test', 'disabled', 'user', 'pro'),
  ('test-expired-user', 'policy-expired@saturnws.test', 'active', 'user', 'pro'),
  ('test-starter-user', 'policy-starter@saturnws.test', 'active', 'user', 'starter');

INSERT OR IGNORE INTO subscriptions (id, user_id, plan_id, status, expires_at)
VALUES
  ('sub-test-allow', 'test-allow-user', 'pro', 'active', '2099-01-01T00:00:00.000Z'),
  ('sub-test-disabled', 'test-disabled-user', 'pro', 'active', '2099-01-01T00:00:00.000Z'),
  ('sub-test-expired', 'test-expired-user', 'pro', 'expired', '2024-01-01T00:00:00.000Z'),
  ('sub-test-starter', 'test-starter-user', 'starter', 'active', '2099-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO disabled_versions (version, reason)
VALUES ('0.0.0-disabled-test', 'staging disabled version fixture');

INSERT OR IGNORE INTO policy_overrides (id, scope, subject, decision, reason, sticky)
VALUES ('override-test-disabled-user', 'user', 'test-disabled-user', 'deny_user', 'staging disabled user fixture', 1);
