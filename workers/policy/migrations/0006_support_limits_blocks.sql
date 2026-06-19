CREATE TABLE IF NOT EXISTS support_message_blocks (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT,
  install_id TEXT,
  device_id TEXT,
  reason TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_support_blocks_active_user ON support_message_blocks(active, user_id);
CREATE INDEX IF NOT EXISTS idx_support_blocks_active_email ON support_message_blocks(active, email);
CREATE INDEX IF NOT EXISTS idx_support_blocks_active_install ON support_message_blocks(active, install_id);
CREATE INDEX IF NOT EXISTS idx_support_blocks_active_device ON support_message_blocks(active, device_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_sender_created ON support_messages(sender, created_at);
