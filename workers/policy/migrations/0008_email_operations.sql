CREATE TABLE IF NOT EXISTS email_jobs (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  email_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  sender TEXT NOT NULL,
  reply_to TEXT,
  subject TEXT NOT NULL,
  html_body TEXT,
  text_body TEXT,
  template_data_json TEXT,
  headers_json TEXT,
  linked_user_id TEXT,
  linked_ticket_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
  provider_message_id TEXT,
  last_error TEXT,
  last_attempt_at TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_jobs_status_next_attempt ON email_jobs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_email_jobs_ticket ON email_jobs(linked_ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_email_jobs_provider_message ON email_jobs(provider_message_id);

CREATE TABLE IF NOT EXISTS email_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  provider_message_id TEXT,
  email_job_id TEXT,
  payload_json TEXT,
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(email_job_id) REFERENCES email_jobs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_email_events_type_created ON email_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_email_events_message ON email_events(provider_message_id);

CREATE TABLE IF NOT EXISTS support_reply_tokens (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY(thread_id) REFERENCES support_threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_support_reply_tokens_thread ON support_reply_tokens(thread_id, active);

CREATE TABLE IF NOT EXISTS inbound_email_messages (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_email_id TEXT,
  provider_event_id TEXT UNIQUE,
  thread_id TEXT,
  reply_token_id TEXT,
  sender_email TEXT,
  recipient_email TEXT,
  subject TEXT,
  message_id TEXT,
  in_reply_to TEXT,
  references_header TEXT,
  text_body TEXT,
  html_sanitized TEXT,
  attachments_json TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  rejection_reason TEXT,
  received_at TEXT,
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(thread_id) REFERENCES support_threads(id) ON DELETE SET NULL,
  FOREIGN KEY(reply_token_id) REFERENCES support_reply_tokens(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inbound_email_messages_thread ON inbound_email_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inbound_email_messages_sender ON inbound_email_messages(sender_email);
CREATE INDEX IF NOT EXISTS idx_inbound_email_messages_status ON inbound_email_messages(status, created_at);

CREATE TABLE IF NOT EXISTS email_recipient_flags (
  email TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  reason TEXT,
  provider_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

