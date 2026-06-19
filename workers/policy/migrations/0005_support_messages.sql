CREATE TABLE IF NOT EXISTS support_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT,
  install_id TEXT,
  device_id TEXT,
  app_version TEXT,
  app_build_id TEXT,
  channel TEXT,
  platform TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  user_last_read_at TEXT,
  admin_last_read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(thread_id) REFERENCES support_threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_support_threads_updated_at ON support_threads(updated_at);
CREATE INDEX IF NOT EXISTS idx_support_threads_email ON support_threads(email);
CREATE INDEX IF NOT EXISTS idx_support_threads_user_id ON support_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_thread ON support_messages(thread_id, datetime(created_at));
