-- Align the desktop auth worker with the website/admin license schema.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_plan') then
    create type public.subscription_plan as enum ('monthly', 'yearly');
  end if;
  if not exists (select 1 from pg_type where typname = 'license_tier') then
    create type public.license_tier as enum ('public', 'private');
  end if;
  if not exists (select 1 from pg_type where typname = 'license_status') then
    create type public.license_status as enum ('active', 'suspended', 'revoked', 'expired');
  end if;
end $$;

alter table public.licenses
  add column if not exists user_id uuid,
  add column if not exists firebase_user_id text,
  add column if not exists user_email text,
  add column if not exists plan public.subscription_plan not null default 'monthly',
  add column if not exists tier public.license_tier not null default 'public',
  add column if not exists status public.license_status not null default 'active',
  add column if not exists hwid text,
  add column if not exists bound_at timestamptz,
  add column if not exists starts_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_ip inet,
  add column if not exists source_promo_code text,
  add column if not exists feature_payload jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'licenses'
      and column_name = 'expiry_date'
  ) then
    execute 'update public.licenses set expires_at = coalesce(expires_at, expiry_date) where expires_at is null';
  end if;
end $$;

create index if not exists licenses_user_id_idx on public.licenses(user_id);
create index if not exists licenses_firebase_user_id_idx on public.licenses(firebase_user_id);
create index if not exists licenses_status_idx on public.licenses(status);
create index if not exists licenses_tier_idx on public.licenses(tier);
create index if not exists licenses_hwid_idx on public.licenses(hwid);
create index if not exists licenses_expires_at_idx on public.licenses(expires_at);
