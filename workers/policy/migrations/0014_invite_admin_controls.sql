ALTER TABLE invite_codes ADD COLUMN scope_json TEXT;
ALTER TABLE invite_codes ADD COLUMN restrictions_json TEXT;
ALTER TABLE invite_codes ADD COLUMN creation_request_id TEXT;
ALTER TABLE invite_codes ADD COLUMN created_by TEXT;
ALTER TABLE invite_codes ADD COLUMN revoked_at TEXT;
ALTER TABLE invite_codes ADD COLUMN revoked_by TEXT;
ALTER TABLE invite_codes ADD COLUMN revoke_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invite_codes_creation_request
  ON invite_codes(creation_request_id)
  WHERE creation_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invite_codes_status_updated
  ON invite_codes(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_invite_validations_invite_created
  ON invite_code_validations(invite_code_id, created_at DESC);
