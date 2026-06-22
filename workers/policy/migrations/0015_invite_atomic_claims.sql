CREATE TABLE IF NOT EXISTS invite_code_claims (
  invite_code_id TEXT NOT NULL,
  claim_type TEXT NOT NULL CHECK (claim_type IN ('user', 'device')),
  claim_value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (invite_code_id, claim_type, claim_value),
  FOREIGN KEY (invite_code_id) REFERENCES invite_codes(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_invite_code_claims_created
  ON invite_code_claims(invite_code_id, created_at DESC);
