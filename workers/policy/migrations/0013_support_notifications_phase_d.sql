-- Phase D: canonical support lifecycle, idempotent messages, audit trail, and portal notifications.
-- All changes are additive; legacy sender/status values remain readable through the Worker normalization contract.

ALTER TABLE support_threads ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE support_threads ADD COLUMN assigned_admin_id TEXT;
ALTER TABLE support_threads ADD COLUMN last_customer_reply_at TEXT;
ALTER TABLE support_threads ADD COLUMN last_support_reply_at TEXT;
ALTER TABLE support_threads ADD COLUMN closed_at TEXT;
ALTER TABLE support_threads ADD COLUMN reopened_at TEXT;
ALTER TABLE support_threads ADD COLUMN blocked_at TEXT;
ALTER TABLE support_threads ADD COLUMN status_before_block TEXT;

UPDATE support_threads
SET last_customer_reply_at = (
      SELECT MAX(created_at)
      FROM support_messages
      WHERE thread_id = support_threads.id AND sender = 'user'
    ),
    last_support_reply_at = (
      SELECT MAX(created_at)
      FROM support_messages
      WHERE thread_id = support_threads.id AND sender = 'admin'
    ),
    closed_at = CASE WHEN status IN ('closed', 'resolved') THEN updated_at ELSE NULL END;

ALTER TABLE support_messages ADD COLUMN sender_role TEXT NOT NULL DEFAULT 'customer';
ALTER TABLE support_messages ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'portal_only';
ALTER TABLE support_messages ADD COLUMN idempotency_key TEXT;
ALTER TABLE support_messages ADD COLUMN source TEXT NOT NULL DEFAULT 'portal';
ALTER TABLE support_messages ADD COLUMN provider_message_id TEXT;

UPDATE support_messages
SET sender_role = CASE sender
      WHEN 'user' THEN 'customer'
      WHEN 'admin' THEN 'support_agent'
      WHEN 'internal' THEN 'internal_note'
      WHEN 'system' THEN 'system'
      ELSE sender_role
    END,
    source = CASE WHEN sender = 'user' THEN 'portal' ELSE source END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_messages_idempotency
  ON support_messages(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_threads_status_activity
  ON support_threads(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_support_threads_user_activity
  ON support_threads(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_support_messages_role_created
  ON support_messages(sender_role, created_at);

ALTER TABLE support_reply_tokens ADD COLUMN expires_at TEXT;
UPDATE support_reply_tokens
SET expires_at = datetime(created_at, '+90 days')
WHERE expires_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_support_reply_tokens_expiry
  ON support_reply_tokens(active, expires_at);

CREATE TABLE IF NOT EXISTS support_audit_events (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  actor_id TEXT,
  message_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(thread_id) REFERENCES support_threads(id) ON DELETE CASCADE,
  FOREIGN KEY(message_id) REFERENCES support_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_support_audit_thread_created
  ON support_audit_events(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_audit_type_created
  ON support_audit_events(event_type, created_at);

CREATE TABLE IF NOT EXISTS portal_notifications (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  title_ar TEXT,
  body_ar TEXT,
  linked_resource_type TEXT,
  linked_resource_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  portal_status TEXT NOT NULL DEFAULT 'delivered',
  email_status TEXT NOT NULL DEFAULT 'not_requested',
  email_job_id TEXT,
  read_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(email_job_id) REFERENCES email_jobs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_portal_notifications_user_created
  ON portal_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_notifications_user_unread
  ON portal_notifications(user_id, read_at, archived_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_notifications_resource
  ON portal_notifications(linked_resource_type, linked_resource_id);
