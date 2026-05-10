-- Admin controls for OTA rollout, crash grouping, and audit trail.

alter table if exists public.crash_logs
  add column if not exists fingerprint text;

create index if not exists crash_logs_fingerprint_idx
  on public.crash_logs(fingerprint);

alter table if exists public.ota_updates
  add column if not exists rollout_percent integer not null default 100 check (rollout_percent >= 0 and rollout_percent <= 100),
  add column if not exists minimum_supported_version text,
  add column if not exists force_update_deadline timestamptz,
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by text,
  add column if not exists disabled_reason text;

alter table if exists public.admin_activity
  add column if not exists admin_email text,
  add column if not exists ip_address inet,
  add column if not exists user_agent text;

create index if not exists admin_activity_admin_email_idx
  on public.admin_activity(lower(admin_email));

alter table if exists public.licenses enable row level security;
alter table if exists public.account_subscriptions enable row level security;
alter table if exists public.promo_codes enable row level security;
alter table if exists public.ota_updates enable row level security;
alter table if exists public.crash_logs enable row level security;
alter table if exists public.tamper_alerts enable row level security;
alter table if exists public.purchase_events enable row level security;
alter table if exists public.admin_activity enable row level security;
alter table if exists public.device_login_sessions enable row level security;
alter table if exists public.app_sessions enable row level security;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
