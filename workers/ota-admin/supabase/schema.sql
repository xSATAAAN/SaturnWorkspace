-- SATAN Toolkit Legal - Admin/OTA baseline schema
-- Target: Supabase Postgres

create extension if not exists pgcrypto;

create type public.subscription_plan as enum ('monthly', 'yearly');
create type public.license_tier as enum ('public', 'private');
create type public.license_status as enum ('active', 'suspended', 'revoked', 'expired');
create type public.promo_discount_type as enum ('percent', 'fixed');
create type public.alert_severity as enum ('low', 'medium', 'high', 'critical');

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text not null unique,
  user_id uuid,
  firebase_user_id text,
  user_email text,
  plan public.subscription_plan not null,
  tier public.license_tier not null default 'public',
  status public.license_status not null default 'active',
  hwid text,
  bound_at timestamptz,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  last_ip inet,
  source_promo_code text,
  feature_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint licenses_dates_chk check (expires_at > starts_at)
);

create index if not exists licenses_user_id_idx on public.licenses(user_id);
create index if not exists licenses_firebase_user_id_idx on public.licenses(firebase_user_id);
create index if not exists licenses_status_idx on public.licenses(status);
create index if not exists licenses_tier_idx on public.licenses(tier);
create index if not exists licenses_hwid_idx on public.licenses(hwid);
create index if not exists licenses_expires_at_idx on public.licenses(expires_at);

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text,
  discount_type public.promo_discount_type not null,
  discount_value numeric(12, 2) not null check (discount_value >= 0),
  currency text not null default 'USD',
  max_uses integer,
  used_count integer not null default 0 check (used_count >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  is_private_tier_trigger boolean not null default false,
  private_feature_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists promo_codes_active_idx on public.promo_codes(is_active, expires_at);
create index if not exists promo_codes_private_tier_idx on public.promo_codes(is_private_tier_trigger);

create table if not exists public.ota_updates (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  channel text not null default 'stable',
  release_notes text not null default '',
  download_url text not null,
  checksum_sha256 text,
  file_size_bytes bigint,
  is_mandatory boolean not null default false,
  is_published boolean not null default false,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(version, channel)
);

create index if not exists ota_updates_channel_published_idx
  on public.ota_updates(channel, is_published, created_at desc);

create table if not exists public.crash_logs (
  id uuid primary key default gen_random_uuid(),
  happened_at timestamptz not null default now(),
  user_id uuid,
  license_id uuid references public.licenses(id) on delete set null,
  hwid text,
  windows_version text,
  device_name text,
  cpu text,
  ram_gb numeric(8, 2),
  gpu text,
  error_type text not null,
  message text,
  stack_trace text not null,
  app_version text,
  tool_channel text,
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists crash_logs_happened_at_idx on public.crash_logs(happened_at desc);
create index if not exists crash_logs_user_id_idx on public.crash_logs(user_id);
create index if not exists crash_logs_hwid_idx on public.crash_logs(hwid);
create index if not exists crash_logs_error_type_idx on public.crash_logs(error_type);

create table if not exists public.tamper_alerts (
  id uuid primary key default gen_random_uuid(),
  happened_at timestamptz not null default now(),
  user_id uuid,
  license_id uuid references public.licenses(id) on delete set null,
  hwid text,
  severity public.alert_severity not null default 'medium',
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  resolved_by uuid,
  resolved_at timestamptz
);

create index if not exists tamper_alerts_open_idx on public.tamper_alerts(resolved, severity, happened_at desc);

create table if not exists public.purchase_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_email text,
  license_id uuid references public.licenses(id) on delete set null,
  promo_code text,
  plan public.subscription_plan not null,
  amount numeric(12, 2) not null,
  currency text not null default 'USD',
  provider text not null default 'enot',
  provider_order_id text,
  status text not null,
  happened_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists purchase_events_user_idx on public.purchase_events(user_id, happened_at desc);

create table if not exists public.admin_activity (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  happened_at timestamptz not null default now()
);

create index if not exists admin_activity_happened_at_idx on public.admin_activity(happened_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists licenses_touch_updated_at on public.licenses;
create trigger licenses_touch_updated_at
before update on public.licenses
for each row execute function public.touch_updated_at();

drop trigger if exists promo_codes_touch_updated_at on public.promo_codes;
create trigger promo_codes_touch_updated_at
before update on public.promo_codes
for each row execute function public.touch_updated_at();

drop trigger if exists ota_updates_touch_updated_at on public.ota_updates;
create trigger ota_updates_touch_updated_at
before update on public.ota_updates
for each row execute function public.touch_updated_at();

