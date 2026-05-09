-- Account-owned subscriptions replace public activation codes.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_plan') then
    create type public.subscription_plan as enum ('monthly', 'yearly');
  end if;
  if not exists (select 1 from pg_type where typname = 'license_tier') then
    create type public.license_tier as enum ('public', 'private');
  end if;
  if not exists (select 1 from pg_type where typname = 'account_subscription_status') then
    create type public.account_subscription_status as enum ('active', 'past_due', 'canceled', 'expired', 'suspended');
  end if;
end $$;

create table if not exists public.account_subscriptions (
  id uuid primary key default gen_random_uuid(),
  firebase_user_id text,
  user_email text not null,
  plan public.subscription_plan not null default 'monthly',
  tier public.license_tier not null default 'public',
  status public.account_subscription_status not null default 'active',
  hwid text,
  bound_at timestamptz,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  provider text not null default 'manual',
  provider_customer_id text,
  provider_subscription_id text,
  source_promo_code text,
  feature_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_subscriptions_dates_chk check (expires_at > starts_at)
);

create index if not exists account_subscriptions_firebase_user_id_idx
  on public.account_subscriptions(firebase_user_id);

create index if not exists account_subscriptions_user_email_idx
  on public.account_subscriptions(lower(user_email));

create index if not exists account_subscriptions_status_idx
  on public.account_subscriptions(status);

create index if not exists account_subscriptions_tier_idx
  on public.account_subscriptions(tier);

create index if not exists account_subscriptions_hwid_idx
  on public.account_subscriptions(hwid);

create index if not exists account_subscriptions_expires_at_idx
  on public.account_subscriptions(expires_at);

create unique index if not exists account_subscriptions_provider_subscription_uidx
  on public.account_subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;

drop trigger if exists account_subscriptions_touch_updated_at on public.account_subscriptions;
create trigger account_subscriptions_touch_updated_at
before update on public.account_subscriptions
for each row execute function public.touch_updated_at();

alter table public.device_login_sessions
  add column if not exists subscription_id uuid references public.account_subscriptions(id) on delete set null;

create index if not exists device_login_sessions_subscription_id_idx
  on public.device_login_sessions(subscription_id);

alter table public.app_sessions
  add column if not exists subscription_id uuid references public.account_subscriptions(id) on delete cascade;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_sessions'
      and column_name = 'license_id'
      and is_nullable = 'NO'
  ) then
    alter table public.app_sessions alter column license_id drop not null;
  end if;
end $$;

create index if not exists app_sessions_subscription_id_idx
  on public.app_sessions(subscription_id);

do $$
begin
  if to_regclass('public.crash_logs') is not null then
    alter table public.crash_logs
      add column if not exists subscription_id uuid references public.account_subscriptions(id) on delete set null;
    create index if not exists crash_logs_subscription_id_idx
      on public.crash_logs(subscription_id);
  end if;

  if to_regclass('public.tamper_alerts') is not null then
    alter table public.tamper_alerts
      add column if not exists subscription_id uuid references public.account_subscriptions(id) on delete set null;
    create index if not exists tamper_alerts_subscription_id_idx
      on public.tamper_alerts(subscription_id);
  end if;

  if to_regclass('public.purchase_events') is not null then
    alter table public.purchase_events
      add column if not exists subscription_id uuid references public.account_subscriptions(id) on delete set null;
    create index if not exists purchase_events_subscription_id_idx
      on public.purchase_events(subscription_id);
  end if;
end $$;
