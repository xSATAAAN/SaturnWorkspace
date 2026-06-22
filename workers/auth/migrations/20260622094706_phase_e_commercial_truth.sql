-- Phase E: normalized subscription truth and prepared commercial infrastructure.
-- This migration is additive. It preserves every historical subscription row.

alter table public.account_subscriptions
  add column if not exists lifecycle_state text,
  add column if not exists plan_term text,
  add column if not exists renewal_state text,
  add column if not exists source_type text,
  add column if not exists external_subscription_id text,
  add column if not exists period_start_at timestamptz,
  add column if not exists period_end_at timestamptz,
  add column if not exists trial_starts_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists grace_ends_at timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists is_current boolean not null default false,
  add column if not exists integrity_state text not null default 'ok',
  add column if not exists metadata_version integer not null default 1;

update public.account_subscriptions
set
  lifecycle_state = case
    when status::text = 'suspended' then 'suspended'
    when status::text = 'canceled' then 'cancelled'
    when status::text = 'expired' then 'expired'
    when status::text = 'past_due' then 'past_due'
    when lower(coalesce(metadata ->> 'trialing', 'false')) in ('true', '1', 'yes') then 'trialing'
    when expires_at < now()
      and expires_at < timestamptz '9999-01-01 00:00:00+00' then 'expired'
    else 'active'
  end,
  plan_term = case
    when lower(coalesce(metadata ->> 'is_unlimited', 'false')) in ('true', '1', 'yes')
      or expires_at >= timestamptz '9999-01-01 00:00:00+00' then 'lifetime'
    when metadata ->> 'plan_intent' in ('weekly', 'monthly', 'annual', 'lifetime', 'custom')
      then metadata ->> 'plan_intent'
    when plan::text = 'yearly' then 'annual'
    else 'monthly'
  end,
  renewal_state = case
    when lower(coalesce(metadata ->> 'is_unlimited', 'false')) in ('true', '1', 'yes')
      or expires_at >= timestamptz '9999-01-01 00:00:00+00' then 'not_applicable'
    when lower(coalesce(metadata ->> 'cancel_at_period_end', 'false')) in ('true', '1', 'yes') then 'cancel_at_period_end'
    when nullif(provider_subscription_id, '') is not null then 'auto_renew'
    else 'manual'
  end,
  source_type = case
    when provider = 'manual' then coalesce(nullif(metadata #>> '{manual_grant,source}', ''), 'manual')
    else 'provider'
  end,
  external_subscription_id = provider_subscription_id,
  period_start_at = starts_at,
  period_end_at = case
    when lower(coalesce(metadata ->> 'is_unlimited', 'false')) in ('true', '1', 'yes')
      or expires_at >= timestamptz '9999-01-01 00:00:00+00' then null
    else expires_at
  end,
  trial_starts_at = case
    when pg_input_is_valid(nullif(metadata ->> 'trial_starts_at', ''), 'timestamptz')
      then (metadata ->> 'trial_starts_at')::timestamptz
    else trial_starts_at
  end,
  trial_ends_at = case
    when pg_input_is_valid(nullif(metadata ->> 'trial_ends_at', ''), 'timestamptz')
      then (metadata ->> 'trial_ends_at')::timestamptz
    else trial_ends_at
  end,
  grace_ends_at = case
    when pg_input_is_valid(nullif(metadata ->> 'grace_ends_at', ''), 'timestamptz')
      then (metadata ->> 'grace_ends_at')::timestamptz
    else grace_ends_at
  end,
  cancel_at_period_end = lower(coalesce(metadata ->> 'cancel_at_period_end', 'false')) in ('true', '1', 'yes'),
  is_current = false,
  integrity_state = case
    when nullif(btrim(firebase_user_id), '') is null then 'legacy_identity_unresolved'
    else 'ok'
  end,
  metadata_version = greatest(metadata_version, 1);

with current_candidates as (
  select
    id,
    count(*) over (partition by firebase_user_id) as current_count
  from public.account_subscriptions
  where nullif(btrim(firebase_user_id), '') is not null
    and lifecycle_state in ('trialing', 'active', 'past_due', 'cancel_at_period_end')
    and (
      plan_term = 'lifetime'
      or coalesce(period_end_at, expires_at) > now()
    )
)
update public.account_subscriptions subscriptions
set is_current = true
from current_candidates candidates
where subscriptions.id = candidates.id
  and candidates.current_count = 1;

with conflicts as (
  select firebase_user_id
  from public.account_subscriptions
  where is_current
  group by firebase_user_id
  having count(*) > 1
)
update public.account_subscriptions subscriptions
set integrity_state = 'multiple_current_subscriptions', is_current = false
where subscriptions.firebase_user_id in (select firebase_user_id from conflicts);

alter table public.account_subscriptions
  drop constraint if exists account_subscriptions_lifecycle_state_chk,
  add constraint account_subscriptions_lifecycle_state_chk
    check (lifecycle_state in ('trialing', 'active', 'past_due', 'cancel_at_period_end', 'cancelled', 'expired', 'suspended')) not valid,
  drop constraint if exists account_subscriptions_plan_term_chk,
  add constraint account_subscriptions_plan_term_chk
    check (plan_term in ('weekly', 'monthly', 'annual', 'lifetime', 'custom')) not valid,
  drop constraint if exists account_subscriptions_renewal_state_chk,
  add constraint account_subscriptions_renewal_state_chk
    check (renewal_state in ('not_applicable', 'manual', 'auto_renew', 'cancel_at_period_end')) not valid,
  drop constraint if exists account_subscriptions_integrity_state_chk,
  add constraint account_subscriptions_integrity_state_chk
    check (integrity_state in ('ok', 'legacy_identity_unresolved', 'multiple_current_subscriptions', 'malformed')) not valid,
  drop constraint if exists account_subscriptions_normalized_period_chk,
  add constraint account_subscriptions_normalized_period_chk
    check (period_end_at is null or period_start_at is null or period_end_at > period_start_at) not valid;

alter table public.account_subscriptions validate constraint account_subscriptions_lifecycle_state_chk;
alter table public.account_subscriptions validate constraint account_subscriptions_plan_term_chk;
alter table public.account_subscriptions validate constraint account_subscriptions_renewal_state_chk;
alter table public.account_subscriptions validate constraint account_subscriptions_integrity_state_chk;
alter table public.account_subscriptions validate constraint account_subscriptions_normalized_period_chk;

create unique index if not exists account_subscriptions_one_current_per_uid_uidx
  on public.account_subscriptions(firebase_user_id)
  where is_current and nullif(btrim(firebase_user_id), '') is not null;

create index if not exists account_subscriptions_uid_current_idx
  on public.account_subscriptions(firebase_user_id, is_current, lifecycle_state, period_end_at desc);

create index if not exists account_subscriptions_integrity_state_idx
  on public.account_subscriptions(integrity_state)
  where integrity_state <> 'ok';

create or replace function public.apply_manual_subscription_grant(
  p_target_uid text,
  p_target_email text,
  p_operation text,
  p_plan_term text,
  p_legacy_plan text,
  p_tier text,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_is_lifetime boolean,
  p_metadata jsonb,
  p_feature_payload jsonb default '{}'::jsonb,
  p_hwid text default null,
  p_bound_at timestamptz default null,
  p_current_id uuid default null
)
returns setof public.account_subscriptions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_count integer;
  changed_id uuid;
begin
  if nullif(btrim(p_target_uid), '') is null then
    raise exception 'firebase_uid_required';
  end if;
  if nullif(btrim(p_target_email), '') is null then
    raise exception 'target_email_required';
  end if;
  if p_operation not in ('extend_current', 'replace_current', 'start_from_now', 'restore_remaining_time') then
    raise exception 'invalid_operation';
  end if;
  if p_plan_term not in ('weekly', 'monthly', 'annual', 'lifetime', 'custom') then
    raise exception 'invalid_plan';
  end if;
  if p_legacy_plan not in ('monthly', 'yearly') then
    raise exception 'invalid_legacy_plan';
  end if;
  if p_tier not in ('public', 'private') then
    raise exception 'invalid_tier';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_target_uid, 0));

  select count(*)
  into current_count
  from public.account_subscriptions
  where firebase_user_id = p_target_uid
    and (
      is_current
      or (
        lifecycle_state in ('trialing', 'active', 'past_due', 'cancel_at_period_end')
        and (plan_term = 'lifetime' or coalesce(period_end_at, expires_at) > now())
      )
    );

  if current_count > 1 then
    raise exception 'multiple_current_subscriptions';
  end if;

  if p_operation = 'extend_current' then
    if p_current_id is null or current_count <> 1 then
      raise exception 'current_subscription_required';
    end if;
    update public.account_subscriptions
    set
      user_email = lower(p_target_email),
      plan = p_legacy_plan::public.subscription_plan,
      tier = p_tier::public.license_tier,
      status = 'active',
      lifecycle_state = 'active',
      plan_term = p_plan_term,
      renewal_state = case when p_is_lifetime then 'not_applicable' else 'manual' end,
      source_type = 'admin_manual',
      starts_at = p_starts_at,
      expires_at = p_expires_at,
      period_start_at = p_starts_at,
      period_end_at = case when p_is_lifetime then null else p_expires_at end,
      cancel_at_period_end = false,
      is_current = true,
      integrity_state = 'ok',
      metadata_version = greatest(metadata_version, 1),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      updated_at = now()
    where id = p_current_id
      and firebase_user_id = p_target_uid
    returning id into changed_id;
    if changed_id is null then
      raise exception 'current_subscription_required';
    end if;
  else
    update public.account_subscriptions
    set
      status = 'canceled',
      lifecycle_state = 'cancelled',
      is_current = false,
      period_end_at = case
        when plan_term = 'lifetime' then now()
        else greatest(coalesce(period_start_at, starts_at) + interval '1 second', least(coalesce(period_end_at, expires_at), now()))
      end,
      expires_at = greatest(starts_at + interval '1 second', least(expires_at, now())),
      updated_at = now()
    where firebase_user_id = p_target_uid
      and (
        is_current
        or (
          lifecycle_state in ('trialing', 'active', 'past_due', 'cancel_at_period_end')
          and (plan_term = 'lifetime' or coalesce(period_end_at, expires_at) > now())
        )
      );

    insert into public.account_subscriptions (
      firebase_user_id,
      user_email,
      plan,
      tier,
      status,
      lifecycle_state,
      plan_term,
      renewal_state,
      source_type,
      starts_at,
      expires_at,
      period_start_at,
      period_end_at,
      cancel_at_period_end,
      is_current,
      integrity_state,
      metadata_version,
      hwid,
      bound_at,
      provider,
      provider_customer_id,
      provider_subscription_id,
      external_subscription_id,
      feature_payload,
      metadata
    )
    values (
      p_target_uid,
      lower(p_target_email),
      p_legacy_plan::public.subscription_plan,
      p_tier::public.license_tier,
      'active',
      'active',
      p_plan_term,
      case when p_is_lifetime then 'not_applicable' else 'manual' end,
      'admin_manual',
      p_starts_at,
      p_expires_at,
      p_starts_at,
      case when p_is_lifetime then null else p_expires_at end,
      false,
      true,
      'ok',
      1,
      p_hwid,
      p_bound_at,
      'manual',
      null,
      null,
      null,
      coalesce(p_feature_payload, '{}'::jsonb),
      coalesce(p_metadata, '{}'::jsonb)
    )
    returning id into changed_id;
  end if;

  return query
  select subscriptions.*
  from public.account_subscriptions subscriptions
  where subscriptions.id = changed_id;
end;
$$;

revoke all on function public.apply_manual_subscription_grant(
  text, text, text, text, text, text, timestamptz, timestamptz, boolean, jsonb, jsonb, text, timestamptz, uuid
) from public, anon, authenticated;

grant execute on function public.apply_manual_subscription_grant(
  text, text, text, text, text, text, timestamptz, timestamptz, boolean, jsonb, jsonb, text, timestamptz, uuid
) to service_role;

create table if not exists public.commercial_plans (
  plan_id text not null,
  version integer not null,
  display_name text not null,
  localized_content jsonb not null default '{}'::jsonb,
  description text not null default '',
  term text not null,
  billing_interval text not null,
  price_minor bigint not null,
  original_price_minor bigint,
  currency text not null default 'USD',
  active boolean not null default false,
  public_visible boolean not null default false,
  purchasable boolean not null default false,
  provider text,
  provider_price_id text,
  trial_days integer not null default 0,
  features jsonb not null default '[]'::jsonb,
  discount_data jsonb not null default '{}'::jsonb,
  renewal_behavior text not null default 'manual',
  download_entitlement jsonb not null default '{}'::jsonb,
  device_limit integer,
  session_limit integer,
  display_order integer not null default 0,
  effective_from timestamptz,
  effective_to timestamptz,
  config_status text not null default 'provider_missing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, version),
  constraint commercial_plans_term_chk check (term in ('weekly', 'monthly', 'annual', 'lifetime', 'custom')),
  constraint commercial_plans_interval_chk check (billing_interval in ('week', 'month', 'year', 'once', 'custom')),
  constraint commercial_plans_price_chk check (price_minor >= 0 and (original_price_minor is null or original_price_minor >= price_minor)),
  constraint commercial_plans_currency_chk check (currency ~ '^[A-Z]{3}$'),
  constraint commercial_plans_trial_days_chk check (trial_days between 0 and 365),
  constraint commercial_plans_provider_ready_chk check (
    not purchasable
    or (active and public_visible and nullif(btrim(provider), '') is not null and nullif(btrim(provider_price_id), '') is not null)
  )
);

create index if not exists commercial_plans_public_catalog_idx
  on public.commercial_plans(active, public_visible, purchasable, display_order, plan_id, version desc);

create table if not exists public.commercial_orders (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null,
  user_email text,
  plan_id text not null,
  plan_version integer not null,
  status text not null,
  currency text not null,
  amount_minor bigint not null,
  provider text,
  provider_order_id text,
  hosted_url text,
  idempotency_key_hash text not null,
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_orders_plan_fk foreign key (plan_id, plan_version)
    references public.commercial_plans(plan_id, version),
  constraint commercial_orders_status_chk check (status in (
    'creating', 'provider_unavailable', 'awaiting_payment', 'confirming', 'paid', 'underpaid',
    'overpaid', 'expired', 'failed', 'cancelled', 'refunded', 'manual_review'
  )),
  constraint commercial_orders_amount_chk check (amount_minor >= 0),
  constraint commercial_orders_currency_chk check (currency ~ '^[A-Z]{3}$')
);

create unique index if not exists commercial_orders_idempotency_uidx
  on public.commercial_orders(idempotency_key_hash);

create unique index if not exists commercial_orders_provider_order_uidx
  on public.commercial_orders(provider, provider_order_id)
  where provider_order_id is not null;

create index if not exists commercial_orders_customer_created_idx
  on public.commercial_orders(firebase_uid, created_at desc);

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.commercial_orders(id) on delete restrict,
  provider text not null,
  provider_payment_id text,
  status text not null,
  requested_amount_minor bigint not null,
  received_amount_minor bigint,
  currency text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_attempts_amount_chk check (requested_amount_minor >= 0 and (received_amount_minor is null or received_amount_minor >= 0)),
  constraint payment_attempts_currency_chk check (currency ~ '^[A-Z]{3}$')
);

create unique index if not exists payment_attempts_provider_payment_uidx
  on public.payment_attempts(provider, provider_payment_id)
  where provider_payment_id is not null;

create index if not exists payment_attempts_order_idx
  on public.payment_attempts(order_id, created_at desc);

create table if not exists public.payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  signature_verified boolean not null default false,
  processing_status text not null default 'received',
  order_id uuid references public.commercial_orders(id) on delete set null,
  payload_digest text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  constraint payment_provider_events_status_chk check (processing_status in ('received', 'processed', 'ignored', 'failed', 'manual_review'))
);

create unique index if not exists payment_provider_events_provider_event_uidx
  on public.payment_provider_events(provider, provider_event_id);

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.commercial_orders(id) on delete restrict,
  provider_receipt_id text,
  document_type text not null default 'receipt',
  document_url text,
  issued_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint payment_receipts_type_chk check (document_type in ('receipt', 'invoice'))
);

create unique index if not exists payment_receipts_provider_receipt_uidx
  on public.payment_receipts(provider_receipt_id)
  where provider_receipt_id is not null;

create table if not exists public.subscription_integrity_events (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text,
  subscription_id uuid references public.account_subscriptions(id) on delete set null,
  code text not null,
  severity text not null default 'warning',
  source text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint subscription_integrity_events_severity_chk check (severity in ('info', 'warning', 'critical'))
);

create index if not exists subscription_integrity_events_open_idx
  on public.subscription_integrity_events(created_at desc)
  where resolved_at is null;

create table if not exists public.download_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  channel text not null,
  platform text not null,
  architecture text not null default 'x64',
  object_key text not null,
  filename text not null,
  size_bytes bigint not null,
  sha256 text not null,
  release_notes text not null default '',
  minimum_requirements text not null default '',
  active boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint download_releases_channel_chk check (channel in ('stable', 'beta')),
  constraint download_releases_platform_chk check (platform in ('windows')),
  constraint download_releases_size_chk check (size_bytes >= 0),
  constraint download_releases_sha256_chk check (sha256 ~ '^[a-fA-F0-9]{64}$'),
  constraint download_releases_object_key_chk check (object_key ~ '^customer-downloads/[A-Za-z0-9._/-]+$')
);

create unique index if not exists download_releases_object_key_uidx
  on public.download_releases(object_key);

create index if not exists download_releases_catalog_idx
  on public.download_releases(active, channel, platform, published_at desc);

create table if not exists public.download_access_logs (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.download_releases(id) on delete restrict,
  firebase_uid text not null,
  decision text not null,
  entitlement text not null,
  request_id text,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now(),
  constraint download_access_logs_decision_chk check (decision in ('allowed', 'denied'))
);

create index if not exists download_access_logs_release_created_idx
  on public.download_access_logs(release_id, created_at desc);

create index if not exists download_access_logs_user_created_idx
  on public.download_access_logs(firebase_uid, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'commercial_plans',
    'commercial_orders',
    'payment_attempts',
    'payment_provider_events',
    'payment_receipts',
    'subscription_integrity_events',
    'download_releases',
    'download_access_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;

insert into public.commercial_plans (
  plan_id,
  version,
  display_name,
  localized_content,
  description,
  term,
  billing_interval,
  price_minor,
  original_price_minor,
  currency,
  active,
  public_visible,
  purchasable,
  provider,
  provider_price_id,
  trial_days,
  features,
  discount_data,
  renewal_behavior,
  display_order,
  config_status
)
values
  (
    'weekly', 1, 'Weekly', '{"ar":{"name":"أسبوعي"},"en":{"name":"Weekly"}}'::jsonb,
    '', 'weekly', 'week', 1000, 1500, 'USD', true, false, false, null, null, 0,
    '[]'::jsonb, '{"kind":"temporary_discount"}'::jsonb, 'manual', 10, 'provider_missing'
  ),
  (
    'monthly', 1, 'Monthly', '{"ar":{"name":"شهري"},"en":{"name":"Monthly"}}'::jsonb,
    '', 'monthly', 'month', 3500, 5000, 'USD', true, false, false, null, null, 7,
    '[]'::jsonb, '{"kind":"temporary_discount"}'::jsonb, 'auto_renew', 20, 'provider_missing'
  ),
  (
    'annual', 1, 'Annual', '{"ar":{"name":"سنوي"},"en":{"name":"Annual"}}'::jsonb,
    '', 'annual', 'year', 35000, 60000, 'USD', true, false, false, null, null, 7,
    '[]'::jsonb, '{"kind":"temporary_discount"}'::jsonb, 'auto_renew', 30, 'provider_missing'
  )
on conflict (plan_id, version) do nothing;
