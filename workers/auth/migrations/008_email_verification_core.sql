-- Round 3A local/staging migration only.
-- Email verification core: stores hashes only, never raw verification codes.

create extension if not exists pgcrypto;

create table if not exists public.account_email_verifications (
  id uuid primary key default gen_random_uuid(),
  firebase_user_id text,
  email text not null,
  code_hash text not null,
  purpose text not null default 'email_verification',
  status text not null default 'pending',
  attempts integer not null default 0,
  resend_count integer not null default 0,
  max_attempts integer not null default 6,
  max_resends integer not null default 5,
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  last_sent_at timestamptz not null default now(),
  requester_ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint account_email_verifications_status_chk check (status in ('pending', 'verified', 'expired', 'blocked', 'consumed', 'delivery_failed'))
);

create index if not exists account_email_verifications_email_idx
  on public.account_email_verifications(lower(email));

create index if not exists account_email_verifications_firebase_user_id_idx
  on public.account_email_verifications(firebase_user_id);

create index if not exists account_email_verifications_status_expires_idx
  on public.account_email_verifications(status, expires_at);

drop trigger if exists account_email_verifications_touch_updated_at on public.account_email_verifications;
create trigger account_email_verifications_touch_updated_at
before update on public.account_email_verifications
for each row execute function public.touch_updated_at();

create table if not exists public.account_email_verification_audit (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid references public.account_email_verifications(id) on delete set null,
  firebase_user_id text,
  email text,
  action text not null,
  result text not null,
  requester_ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists account_email_verification_audit_email_idx
  on public.account_email_verification_audit(lower(email));

create index if not exists account_email_verification_audit_created_at_idx
  on public.account_email_verification_audit(created_at);

alter table public.account_email_verifications enable row level security;
alter table public.account_email_verification_audit enable row level security;

revoke all on table public.account_email_verifications from anon, authenticated;
revoke all on table public.account_email_verification_audit from anon, authenticated;

grant all on table public.account_email_verifications to service_role;
grant all on table public.account_email_verification_audit to service_role;
