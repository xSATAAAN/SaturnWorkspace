UPDATE global_policy
SET minimum_supported_version = '',
    mandatory_update_enabled = 0,
    kill_switch_enabled = 0,
    update_mode = 'optional',
    updated_at = datetime('now')
WHERE id = 'global';

INSERT OR IGNORE INTO users (id, email, status, role, plan_id)
VALUES
  ('test-mandatory-user', 'policy-mandatory@saturnws.test', 'active', 'user', 'pro'),
  ('test-kill-user', 'policy-kill@saturnws.test', 'active', 'user', 'pro');

INSERT OR IGNORE INTO subscriptions (id, user_id, plan_id, status, expires_at)
VALUES
  ('sub-test-mandatory', 'test-mandatory-user', 'pro', 'active', '2099-01-01T00:00:00.000Z'),
  ('sub-test-kill', 'test-kill-user', 'pro', 'active', '2099-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO policy_overrides (id, scope, subject, decision, reason, sticky)
VALUES
  ('override-test-mandatory-user', 'user', 'test-mandatory-user', 'mandatory_update', 'staging mandatory update fixture', 1),
  ('override-test-kill-user', 'user', 'test-kill-user', 'global_kill_switch', 'staging kill switch fixture', 1);
