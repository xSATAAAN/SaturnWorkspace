create extension if not exists pgcrypto;

create table if not exists public.account_profiles (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null unique,
  display_name text,
  normalized_email text not null,
  email_verified boolean not null default false,
  email_verified_at timestamptz,
  verification_source text,
  auth_providers jsonb not null default '[]'::jsonb,
  locale text not null default 'ar',
  account_status text not null default 'active',
  terms_version text,
  terms_accepted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_profiles_email_chk check (position('@' in normalized_email) > 1),
  constraint account_profiles_status_chk check (account_status in ('active', 'suspended', 'pending_deletion', 'deleted')),
  constraint account_profiles_locale_chk check (locale in ('ar', 'en')),
  constraint account_profiles_verification_source_chk check (
    verification_source is null or verification_source in ('firebase_google', 'saturnws_otp', 'admin', 'legacy_unknown')
  )
);

alter table public.account_profiles
  add column if not exists email_verified_at timestamptz;

alter table public.account_profiles
  add column if not exists verification_source text;

create unique index if not exists account_profiles_normalized_email_uidx
  on public.account_profiles (normalized_email);

create index if not exists account_profiles_status_idx
  on public.account_profiles (account_status);

drop trigger if exists account_profiles_touch_updated_at on public.account_profiles;
create trigger account_profiles_touch_updated_at
  before update on public.account_profiles
  for each row execute function public.touch_updated_at();

alter table public.account_profiles enable row level security;

revoke all on table public.account_profiles from anon, authenticated;

grant all on table public.account_profiles to service_role;
