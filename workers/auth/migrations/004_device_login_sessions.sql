-- Device login flow used by the desktop startup gate.

create extension if not exists pgcrypto;

create table if not exists public.device_login_sessions (
  id uuid primary key default gen_random_uuid(),
  device_code text not null unique,
  user_code text not null unique,
  hwid text not null,
  status text not null default 'pending' check (status in ('pending', 'authorized', 'consumed', 'expired')),
  user_id text,
  user_email text,
  license_id uuid references public.licenses(id) on delete set null,
  license_key text,
  expires_at timestamptz not null,
  authorized_at timestamptz,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists device_login_sessions_user_code_idx
  on public.device_login_sessions(user_code, status);

create index if not exists device_login_sessions_device_code_idx
  on public.device_login_sessions(device_code);

create index if not exists device_login_sessions_expires_at_idx
  on public.device_login_sessions(expires_at);

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token_hash text not null unique,
  user_id text not null,
  user_email text,
  license_id uuid not null references public.licenses(id) on delete cascade,
  hwid text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create index if not exists app_sessions_token_hash_idx on public.app_sessions(session_token_hash);
create index if not exists app_sessions_user_id_idx on public.app_sessions(user_id);
create index if not exists app_sessions_license_id_idx on public.app_sessions(license_id);
create index if not exists app_sessions_hwid_idx on public.app_sessions(hwid);
create index if not exists app_sessions_expires_at_idx on public.app_sessions(expires_at);
