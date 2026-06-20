-- Locks for Cloudflare scheduled email operations.
-- Keeps cron/manual processing idempotent when invocations overlap.

create table if not exists email_cron_locks (
  name text primary key,
  owner text,
  locked_until text not null,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create index if not exists email_cron_locks_locked_until_idx
  on email_cron_locks(locked_until);
