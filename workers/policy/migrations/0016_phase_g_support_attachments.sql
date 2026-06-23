-- Migration number: 0016
CREATE TABLE IF NOT EXISTS support_attachments (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  message_id TEXT,
  owner_user_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  uploader_role TEXT NOT NULL DEFAULT 'customer',
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  failure_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY(thread_id) REFERENCES support_threads(id) ON DELETE CASCADE,
  FOREIGN KEY(message_id) REFERENCES support_messages(id) ON DELETE SET NULL,
  CHECK(uploader_role IN ('customer', 'support_agent', 'email_inbound')),
  CHECK(status IN ('pending', 'complete', 'failed', 'deleted')),
  CHECK(size_bytes > 0 AND size_bytes <= 5242880),
  CHECK(mime_type IN ('image/png', 'image/jpeg', 'application/pdf', 'text/plain'))
);

CREATE INDEX IF NOT EXISTS idx_support_attachments_thread
  ON support_attachments(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_attachments_message
  ON support_attachments(message_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_attachments_owner_pending
  ON support_attachments(owner_user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_support_attachments_orphans
  ON support_attachments(status, created_at)
  WHERE message_id IS NULL;
