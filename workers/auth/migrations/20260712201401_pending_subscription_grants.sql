-- Pending administrative grants are email-scoped offers, not subscriptions.
-- They become legal subscription rows only after the matching Firebase account is verified.

create table if not exists public.pending_subscription_grants (
  id uuid primary key default gen_random_uuid(),
  normalized_email text not null,
  status text not null default 'pending',
  plan_term text not null,
  legacy_plan text not null,
  tier text not null default 'public',
  duration_mode text not null,
  duration_value integer,
  duration_unit text,
  exact_expiry timestamptz,
  claim_deadline timestamptz not null default (now() + interval '180 days'),
  reason_code text not null,
  reason_note text,
  created_by text not null,
  request_id text not null,
  idempotency_key_hash text not null,
  preview_hash text not null,
  claimed_by_uid text,
  resulting_subscription_id uuid references public.account_subscriptions(id) on delete restrict,
  claimed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pending_subscription_grants_email_chk
    check (normalized_email = lower(btrim(normalized_email)) and position('@' in normalized_email) > 1),
  constraint pending_subscription_grants_status_chk
    check (status in ('pending', 'claimed', 'cancelled', 'expired')),
  constraint pending_subscription_grants_plan_term_chk
    check (plan_term in ('weekly', 'monthly', 'annual', 'lifetime', 'custom')),
  constraint pending_subscription_grants_legacy_plan_chk
    check (legacy_plan in ('monthly', 'yearly')),
  constraint pending_subscription_grants_tier_chk
    check (tier in ('public', 'private')),
  constraint pending_subscription_grants_duration_chk
    check (
      (duration_mode = 'lifetime' and duration_value is null and duration_unit is null and exact_expiry is null)
      or (duration_mode = 'exact' and exact_expiry is not null and duration_value is null and duration_unit is null)
      or (
        duration_mode = 'duration'
        and duration_value between 1 and 1200
        and duration_unit in ('hours', 'days', 'weeks', 'months')
        and exact_expiry is null
      )
    ),
  constraint pending_subscription_grants_claimed_chk
    check (
      (status = 'claimed' and claimed_by_uid is not null and resulting_subscription_id is not null and claimed_at is not null)
      or status <> 'claimed'
    )
);

create unique index if not exists pending_subscription_grants_request_uidx
  on public.pending_subscription_grants(request_id);

create unique index if not exists pending_subscription_grants_idempotency_uidx
  on public.pending_subscription_grants(idempotency_key_hash);

create unique index if not exists pending_subscription_grants_one_pending_email_uidx
  on public.pending_subscription_grants(normalized_email)
  where status = 'pending';

create index if not exists pending_subscription_grants_status_created_idx
  on public.pending_subscription_grants(status, created_at desc);

drop trigger if exists pending_subscription_grants_touch_updated_at on public.pending_subscription_grants;
create trigger pending_subscription_grants_touch_updated_at
  before update on public.pending_subscription_grants
  for each row execute function public.touch_updated_at();

alter table public.pending_subscription_grants enable row level security;
revoke all on table public.pending_subscription_grants from public, anon, authenticated;
grant select, insert, update on table public.pending_subscription_grants to service_role;

create or replace function public.claim_pending_subscription_grant(
  p_firebase_uid text,
  p_normalized_email text
)
returns table(grant_id uuid, claim_status text, subscription_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  normalized_uid text := btrim(coalesce(p_firebase_uid, ''));
  normalized_email_value text := lower(btrim(coalesce(p_normalized_email, '')));
  grant_row public.pending_subscription_grants%rowtype;
  profile_verified boolean := false;
  current_count integer := 0;
  starts_at_value timestamptz := now();
  expires_at_value timestamptz;
  subscription_row public.account_subscriptions%rowtype;
begin
  if normalized_uid = '' then
    raise exception 'firebase_uid_required';
  end if;
  if normalized_email_value = '' or position('@' in normalized_email_value) <= 1 then
    raise exception 'valid_email_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(normalized_uid, 0));

  select (email_verified and account_status = 'active')
    into profile_verified
  from public.account_profiles
  where firebase_uid = normalized_uid
    and normalized_email = normalized_email_value
  limit 1;

  if not coalesce(profile_verified, false) then
    return query select null::uuid, 'account_not_verified'::text, null::uuid;
    return;
  end if;

  select * into grant_row
  from public.pending_subscription_grants
  where normalized_email = normalized_email_value
    and status = 'pending'
  order by created_at asc
  for update
  limit 1;

  if not found then
    return;
  end if;

  if grant_row.claim_deadline <= now() then
    update public.pending_subscription_grants
    set status = 'expired'
    where id = grant_row.id;
    return query select grant_row.id, 'expired'::text, null::uuid;
    return;
  end if;

  select count(*) into current_count
  from public.account_subscriptions
  where firebase_user_id = normalized_uid
    and is_current;

  if current_count > 0 then
    return query select grant_row.id, 'current_subscription_exists'::text, null::uuid;
    return;
  end if;

  expires_at_value := case grant_row.duration_mode
    when 'lifetime' then timestamptz '9999-12-31 23:59:59+00'
    when 'exact' then grant_row.exact_expiry
    when 'duration' then case grant_row.duration_unit
      when 'hours' then starts_at_value + make_interval(hours => grant_row.duration_value)
      when 'days' then starts_at_value + make_interval(days => grant_row.duration_value)
      when 'weeks' then starts_at_value + make_interval(days => grant_row.duration_value * 7)
      when 'months' then starts_at_value + make_interval(months => grant_row.duration_value)
    end
  end;

  if expires_at_value is null or expires_at_value <= starts_at_value then
    update public.pending_subscription_grants
    set status = 'expired'
    where id = grant_row.id;
    return query select grant_row.id, 'expired'::text, null::uuid;
    return;
  end if;

  insert into public.account_subscriptions (
    firebase_user_id,
    user_email,
    plan,
    tier,
    status,
    starts_at,
    expires_at,
    provider,
    feature_payload,
    metadata,
    lifecycle_state,
    plan_term,
    renewal_state,
    source_type,
    period_start_at,
    period_end_at,
    cancel_at_period_end,
    is_current,
    integrity_state,
    metadata_version
  ) values (
    normalized_uid,
    normalized_email_value,
    grant_row.legacy_plan::public.subscription_plan,
    grant_row.tier::public.license_tier,
    'active'::public.account_subscription_status,
    starts_at_value,
    expires_at_value,
    'manual',
    '{}'::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'is_unlimited', grant_row.duration_mode = 'lifetime',
      'manual_grant', jsonb_build_object(
        'source', 'pending_admin_grant',
        'pending_grant_id', grant_row.id,
        'request_id', grant_row.request_id,
        'plan_intent', grant_row.plan_term,
        'duration_mode', grant_row.duration_mode,
        'duration_value', grant_row.duration_value,
        'duration_unit', grant_row.duration_unit,
        'reason_code', grant_row.reason_code,
        'reason_note', grant_row.reason_note,
        'created_by', grant_row.created_by,
        'applied_at', starts_at_value
      )
    )),
    'active',
    grant_row.plan_term,
    case when grant_row.duration_mode = 'lifetime' then 'not_applicable' else 'manual' end,
    'pending_admin_grant',
    starts_at_value,
    case when grant_row.duration_mode = 'lifetime' then null else expires_at_value end,
    false,
    true,
    'ok',
    1
  ) returning * into subscription_row;

  update public.pending_subscription_grants
  set
    status = 'claimed',
    claimed_by_uid = normalized_uid,
    resulting_subscription_id = subscription_row.id,
    claimed_at = starts_at_value
  where id = grant_row.id;

  insert into public.admin_activity (action, entity, entity_id, payload, admin_email, happened_at)
  values (
    'pending_subscription_grant_claimed',
    'pending_subscription_grants',
    grant_row.id::text,
    jsonb_build_object(
      'firebase_uid', normalized_uid,
      'subscription_id', subscription_row.id,
      'request_id', grant_row.request_id,
      'result', 'claimed'
    ),
    grant_row.created_by,
    starts_at_value
  );

  return query select grant_row.id, 'claimed'::text, subscription_row.id;
end;
$$;

revoke all on function public.claim_pending_subscription_grant(text, text) from public, anon, authenticated;
grant execute on function public.claim_pending_subscription_grant(text, text) to service_role;

create or replace function public.claim_pending_subscription_grant_from_profile()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.email_verified and new.account_status = 'active' then
    perform public.claim_pending_subscription_grant(new.firebase_uid, new.normalized_email);
  end if;
  return new;
end;
$$;

revoke all on function public.claim_pending_subscription_grant_from_profile() from public, anon, authenticated;
grant execute on function public.claim_pending_subscription_grant_from_profile() to service_role;

drop trigger if exists account_profiles_claim_pending_subscription_grant on public.account_profiles;
create trigger account_profiles_claim_pending_subscription_grant
  after insert or update of email_verified, normalized_email, account_status
  on public.account_profiles
  for each row
  when (new.email_verified and new.account_status = 'active')
  execute function public.claim_pending_subscription_grant_from_profile();
