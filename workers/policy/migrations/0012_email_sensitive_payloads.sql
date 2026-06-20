-- Phase B auth email hardening: encrypted payload for short-lived OTP material.
-- The raw OTP must not be stored in html_body, text_body, template_data_json, logs, or admin APIs.

ALTER TABLE email_jobs ADD COLUMN sensitive_payload_ciphertext TEXT;
ALTER TABLE email_jobs ADD COLUMN sensitive_payload_expires_at TEXT;
ALTER TABLE email_jobs ADD COLUMN sensitive_payload_purged_at TEXT;

CREATE INDEX IF NOT EXISTS idx_email_jobs_sensitive_payload_expires
  ON email_jobs(sensitive_payload_expires_at)
  WHERE sensitive_payload_ciphertext IS NOT NULL;
