-- Phase F: additive operational controls for the admin plane.
-- Existing customer rows are not rewritten by this migration.

create table if not exists public.admin_operation_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  operation text not null,
  target_type text not null,
  target_id text not null,
  actor_email text not null,
  actor_role text not null default 'super_admin',
  reason_code text not null,
  reason_note text,
  expected_version text,
  status text not null default 'processing',
  result jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint admin_operation_requests_status_chk check (status in ('processing', 'completed', 'failed')),
  constraint admin_operation_requests_reason_chk check (reason_code in (
    'admin_action', 'customer_request', 'security_review', 'technical_support',
    'billing_correction', 'subscription_recovery', 'policy_enforcement', 'other'
  )),
  constraint admin_operation_requests_other_note_chk check (reason_code <> 'other' or length(btrim(coalesce(reason_note, ''))) >= 3)
);

create index if not exists admin_operation_requests_target_idx
  on public.admin_operation_requests(target_type, target_id, created_at desc);

create table if not exists public.subscription_recovery_ledger (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null,
  subscription_id uuid references public.account_subscriptions(id) on delete restrict,
  evidence_type text not null,
  evidence_reference text not null,
  remaining_seconds bigint not null,
  snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'available',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  consumed_at timestamptz,
  consumed_by text,
  operation_request_id text,
  constraint subscription_recovery_ledger_seconds_chk check (remaining_seconds > 0),
  constraint subscription_recovery_ledger_status_chk check (status in ('available', 'consumed', 'expired', 'revoked'))
);

create unique index if not exists subscription_recovery_ledger_evidence_uidx
  on public.subscription_recovery_ledger(firebase_uid, evidence_type, evidence_reference);

create index if not exists subscription_recovery_ledger_available_idx
  on public.subscription_recovery_ledger(firebase_uid, created_at desc)
  where status = 'available';

create table if not exists public.admin_crash_group_state (
  fingerprint text primary key,
  status text not null default 'open',
  assignee text,
  note text,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  constraint admin_crash_group_state_status_chk check (status in ('open', 'investigating', 'resolved', 'ignored')),
  constraint admin_crash_group_state_fingerprint_chk check (length(fingerprint) between 16 and 128)
);

alter table public.admin_operation_requests enable row level security;
alter table public.subscription_recovery_ledger enable row level security;
alter table public.admin_crash_group_state enable row level security;

revoke all on table public.admin_operation_requests from public, anon, authenticated;
revoke all on table public.subscription_recovery_ledger from public, anon, authenticated;
revoke all on table public.admin_crash_group_state from public, anon, authenticated;

grant select, insert, update on table public.admin_operation_requests to service_role;
grant select, insert, update on table public.subscription_recovery_ledger to service_role;
grant select, insert, update on table public.admin_crash_group_state to service_role;

create or replace function public.admin_begin_operation(
  p_request_id text,
  p_operation text,
  p_target_type text,
  p_target_id text,
  p_actor_email text,
  p_actor_role text,
  p_reason_code text,
  p_reason_note text,
  p_expected_version text default null
)
returns public.admin_operation_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  operation_row public.admin_operation_requests;
begin
  if length(btrim(coalesce(p_request_id, ''))) < 8 then raise exception 'invalid_request_id'; end if;
  if length(btrim(coalesce(p_actor_email, ''))) < 3 then raise exception 'invalid_actor'; end if;
  if p_reason_code not in (
    'admin_action', 'customer_request', 'security_review', 'technical_support',
    'billing_correction', 'subscription_recovery', 'policy_enforcement', 'other'
  ) then raise exception 'invalid_reason_code'; end if;
  if p_reason_code = 'other' and length(btrim(coalesce(p_reason_note, ''))) < 3 then
    raise exception 'reason_note_required';
  end if;

  insert into public.admin_operation_requests (
    request_id, operation, target_type, target_id, actor_email, actor_role,
    reason_code, reason_note, expected_version
  ) values (
    btrim(p_request_id), btrim(p_operation), btrim(p_target_type), btrim(p_target_id),
    lower(btrim(p_actor_email)), btrim(coalesce(p_actor_role, 'super_admin')),
    p_reason_code, nullif(btrim(coalesce(p_reason_note, '')), ''), p_expected_version
  )
  on conflict (request_id) do nothing
  returning * into operation_row;

  if operation_row.id is null then
    select * into operation_row
    from public.admin_operation_requests
    where request_id = btrim(p_request_id);
    if operation_row.operation <> btrim(p_operation)
      or operation_row.target_type <> btrim(p_target_type)
      or operation_row.target_id <> btrim(p_target_id) then
      raise exception 'idempotency_conflict';
    end if;
  end if;
  return operation_row;
end;
$$;

create or replace function public.admin_account_lifecycle_transition(
  p_firebase_uid text,
  p_action text,
  p_reason_code text,
  p_reason_note text,
  p_actor_email text,
  p_actor_role text,
  p_request_id text,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  profile_row public.account_profiles;
  operation_row public.admin_operation_requests;
  next_status text;
  result_payload jsonb;
begin
  if nullif(btrim(p_firebase_uid), '') is null then raise exception 'firebase_uid_required'; end if;
  if p_action not in ('suspend', 'reactivate', 'mark_pending_deletion') then raise exception 'invalid_account_action'; end if;
  perform pg_advisory_xact_lock(hashtextextended('account:' || p_firebase_uid, 0));

  operation_row := public.admin_begin_operation(
    p_request_id, 'account.' || p_action, 'account', p_firebase_uid,
    p_actor_email, p_actor_role, p_reason_code, p_reason_note,
    case when p_expected_updated_at is null then null else p_expected_updated_at::text end
  );
  if operation_row.status = 'completed' then return operation_row.result; end if;
  if operation_row.status = 'failed' then raise exception 'operation_previously_failed'; end if;

  select * into profile_row from public.account_profiles
  where firebase_uid = p_firebase_uid for update;
  if profile_row.id is null then raise exception 'account_not_found'; end if;
  if p_expected_updated_at is not null and profile_row.updated_at <> p_expected_updated_at then
    raise exception 'stale_account_state';
  end if;
  if profile_row.account_status = 'deleted' then raise exception 'deleted_account_immutable'; end if;

  next_status := case p_action
    when 'suspend' then 'suspended'
    when 'reactivate' then 'active'
    when 'mark_pending_deletion' then 'pending_deletion'
  end;
  if profile_row.account_status = next_status then
    result_payload := jsonb_build_object('account', to_jsonb(profile_row), 'idempotent', true, 'request_id', p_request_id);
  else
    if p_action = 'reactivate' and profile_row.account_status not in ('suspended', 'pending_deletion') then
      raise exception 'invalid_account_transition';
    end if;
    if p_action = 'suspend' and profile_row.account_status not in ('active', 'pending_deletion') then
      raise exception 'invalid_account_transition';
    end if;

    update public.account_profiles
    set account_status = next_status,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_admin_transition', jsonb_build_object(
            'request_id', p_request_id, 'action', p_action, 'actor', lower(p_actor_email), 'at', now()
          )
        ),
        updated_at = now()
    where firebase_uid = p_firebase_uid
    returning * into profile_row;

    if next_status in ('suspended', 'pending_deletion') then
      update public.app_sessions set revoked_at = coalesce(revoked_at, now())
      where user_id = p_firebase_uid and revoked_at is null;
      update public.device_login_sessions set status = 'expired'
      where user_id = p_firebase_uid and status in ('pending', 'authorized');
    end if;
    result_payload := jsonb_build_object('account', to_jsonb(profile_row), 'idempotent', false, 'request_id', p_request_id);
  end if;

  insert into public.admin_activity (action, entity, entity_id, payload, admin_email)
  values ('account.' || p_action, 'account_profile', p_firebase_uid,
    jsonb_build_object('request_id', p_request_id, 'reason_code', p_reason_code, 'reason_note', p_reason_note, 'resulting_status', next_status),
    lower(p_actor_email));
  update public.admin_operation_requests set status='completed', result=result_payload, completed_at=now()
  where request_id=p_request_id;
  return result_payload;
exception when others then
  update public.admin_operation_requests set status='failed', error_code=sqlstate, completed_at=now()
  where request_id=p_request_id and status='processing';
  raise;
end;
$$;

create or replace function public.admin_subscription_transition(
  p_subscription_id uuid,
  p_action text,
  p_reason_code text,
  p_reason_note text,
  p_actor_email text,
  p_actor_role text,
  p_request_id text,
  p_expected_updated_at timestamptz default null,
  p_new_expiry timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  subscription_row public.account_subscriptions;
  operation_row public.admin_operation_requests;
  result_payload jsonb;
begin
  if p_action not in ('suspend', 'resume', 'cancel_at_period_end', 'cancel_now', 'end_trial', 'correct_expiry', 'revoke_entitlement') then
    raise exception 'invalid_subscription_action';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('subscription:' || p_subscription_id::text, 0));
  operation_row := public.admin_begin_operation(
    p_request_id, 'subscription.' || p_action, 'subscription', p_subscription_id::text,
    p_actor_email, p_actor_role, p_reason_code, p_reason_note,
    case when p_expected_updated_at is null then null else p_expected_updated_at::text end
  );
  if operation_row.status = 'completed' then return operation_row.result; end if;
  if operation_row.status = 'failed' then raise exception 'operation_previously_failed'; end if;

  select * into subscription_row from public.account_subscriptions
  where id = p_subscription_id for update;
  if subscription_row.id is null then raise exception 'subscription_not_found'; end if;
  if subscription_row.firebase_user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('subscription-user:' || subscription_row.firebase_user_id, 0));
  end if;
  if p_expected_updated_at is not null and subscription_row.updated_at <> p_expected_updated_at then
    raise exception 'stale_subscription_state';
  end if;
  if subscription_row.integrity_state <> 'ok' then raise exception 'subscription_integrity_conflict'; end if;

  if p_action in ('suspend', 'revoke_entitlement') then
    if subscription_row.lifecycle_state in ('cancelled', 'expired') then raise exception 'invalid_subscription_transition'; end if;
    update public.account_subscriptions
    set status='suspended', lifecycle_state='suspended', is_current=false, updated_at=now()
    where id=p_subscription_id returning * into subscription_row;
  elsif p_action = 'resume' then
    if subscription_row.lifecycle_state <> 'suspended' then raise exception 'invalid_subscription_transition'; end if;
    if exists (
      select 1
      from public.account_subscriptions current_subscription
      where current_subscription.firebase_user_id = subscription_row.firebase_user_id
        and current_subscription.id <> subscription_row.id
        and current_subscription.is_current = true
    ) then
      raise exception 'subscription_integrity_conflict';
    end if;
    if subscription_row.plan_term <> 'lifetime' and coalesce(subscription_row.period_end_at, subscription_row.expires_at) <= now() then
      raise exception 'subscription_expired';
    end if;
    update public.account_subscriptions
    set status='active', lifecycle_state='active', is_current=true, updated_at=now()
    where id=p_subscription_id returning * into subscription_row;
  elsif p_action = 'cancel_at_period_end' then
    if subscription_row.lifecycle_state not in ('trialing','active','past_due') then raise exception 'invalid_subscription_transition'; end if;
    if subscription_row.plan_term = 'lifetime' then raise exception 'lifetime_cannot_cancel_at_period_end'; end if;
    update public.account_subscriptions
    set lifecycle_state='cancel_at_period_end', renewal_state='cancel_at_period_end', cancel_at_period_end=true, updated_at=now()
    where id=p_subscription_id returning * into subscription_row;
  elsif p_action = 'cancel_now' then
    update public.account_subscriptions
    set status='canceled', lifecycle_state='cancelled', renewal_state='not_applicable', cancel_at_period_end=false,
        is_current=false,
        period_end_at=case when plan_term='lifetime' then null else greatest(coalesce(period_start_at, starts_at) + interval '1 second', now()) end,
        expires_at=greatest(starts_at + interval '1 second', now()), updated_at=now()
    where id=p_subscription_id returning * into subscription_row;
  elsif p_action = 'end_trial' then
    if subscription_row.lifecycle_state <> 'trialing' then raise exception 'invalid_subscription_transition'; end if;
    update public.account_subscriptions
    set status='active', lifecycle_state='active', trial_ends_at=least(coalesce(trial_ends_at, now()), now()), updated_at=now()
    where id=p_subscription_id returning * into subscription_row;
  elsif p_action = 'correct_expiry' then
    if p_new_expiry is null or p_new_expiry <= subscription_row.starts_at then raise exception 'invalid_new_expiry'; end if;
    if subscription_row.plan_term = 'lifetime' then raise exception 'lifetime_has_no_expiry'; end if;
    update public.account_subscriptions
    set expires_at=p_new_expiry, period_end_at=p_new_expiry,
        lifecycle_state=case when p_new_expiry > now() then 'active' else 'expired' end,
        status=case when p_new_expiry > now() then 'active'::public.account_subscription_status else 'expired'::public.account_subscription_status end,
        is_current=(p_new_expiry > now()), updated_at=now()
    where id=p_subscription_id returning * into subscription_row;
  end if;

  if subscription_row.firebase_user_id is not null and subscription_row.lifecycle_state in ('suspended','cancelled','expired') then
    update public.app_sessions set revoked_at=coalesce(revoked_at, now())
    where user_id=subscription_row.firebase_user_id and revoked_at is null;
  end if;
  result_payload := jsonb_build_object('subscription', to_jsonb(subscription_row), 'request_id', p_request_id);
  insert into public.admin_activity (action, entity, entity_id, payload, admin_email)
  values ('subscription.' || p_action, 'account_subscription', p_subscription_id::text,
    jsonb_build_object('request_id', p_request_id, 'reason_code', p_reason_code, 'reason_note', p_reason_note), lower(p_actor_email));
  update public.admin_operation_requests set status='completed', result=result_payload, completed_at=now()
  where request_id=p_request_id;
  return result_payload;
exception when others then
  update public.admin_operation_requests set status='failed', error_code=sqlstate, completed_at=now()
  where request_id=p_request_id and status='processing';
  raise;
end;
$$;

create or replace function public.admin_revoke_account_access(
  p_firebase_uid text,
  p_scope text,
  p_target_id text,
  p_reason_code text,
  p_reason_note text,
  p_actor_email text,
  p_actor_role text,
  p_request_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  operation_row public.admin_operation_requests;
  target_hwid text;
  sessions_revoked integer := 0;
  device_requests_revoked integer := 0;
  result_payload jsonb;
begin
  if p_scope not in ('session', 'device', 'all') then raise exception 'invalid_revoke_scope'; end if;
  perform pg_advisory_xact_lock(hashtextextended('access:' || p_firebase_uid, 0));
  operation_row := public.admin_begin_operation(
    p_request_id, 'access.revoke_' || p_scope, 'account', p_firebase_uid,
    p_actor_email, p_actor_role, p_reason_code, p_reason_note, null
  );
  if operation_row.status = 'completed' then return operation_row.result; end if;
  if operation_row.status = 'failed' then raise exception 'operation_previously_failed'; end if;

  if p_scope = 'session' then
    update public.app_sessions set revoked_at=coalesce(revoked_at, now())
    where id::text=p_target_id and user_id=p_firebase_uid and revoked_at is null;
    get diagnostics sessions_revoked = row_count;
    if sessions_revoked = 0 then raise exception 'session_not_found'; end if;
  elsif p_scope = 'device' then
    select hwid into target_hwid from public.app_sessions
    where id::text=p_target_id and user_id=p_firebase_uid;
    if target_hwid is null then target_hwid := nullif(btrim(p_target_id), ''); end if;
    if target_hwid is null then raise exception 'device_not_found'; end if;
    update public.app_sessions set revoked_at=coalesce(revoked_at, now())
    where user_id=p_firebase_uid and hwid=target_hwid and revoked_at is null;
    get diagnostics sessions_revoked = row_count;
    update public.device_login_sessions set status='expired'
    where user_id=p_firebase_uid and hwid=target_hwid and status in ('pending','authorized');
    get diagnostics device_requests_revoked = row_count;
  else
    update public.app_sessions set revoked_at=coalesce(revoked_at, now())
    where user_id=p_firebase_uid and revoked_at is null;
    get diagnostics sessions_revoked = row_count;
    update public.device_login_sessions set status='expired'
    where user_id=p_firebase_uid and status in ('pending','authorized');
    get diagnostics device_requests_revoked = row_count;
  end if;

  result_payload := jsonb_build_object(
    'request_id', p_request_id, 'scope', p_scope,
    'sessions_revoked', sessions_revoked, 'device_requests_revoked', device_requests_revoked
  );
  insert into public.admin_activity (action, entity, entity_id, payload, admin_email)
  values ('access.revoke_' || p_scope, 'account_profile', p_firebase_uid,
    result_payload || jsonb_build_object('reason_code', p_reason_code, 'reason_note', p_reason_note), lower(p_actor_email));
  update public.admin_operation_requests set status='completed', result=result_payload, completed_at=now()
  where request_id=p_request_id;
  return result_payload;
exception when others then
  update public.admin_operation_requests set status='failed', error_code=sqlstate, completed_at=now()
  where request_id=p_request_id and status='processing';
  raise;
end;
$$;

create or replace function public.admin_restore_subscription_time(
  p_evidence_id uuid,
  p_target_uid text,
  p_target_email text,
  p_plan_term text,
  p_legacy_plan text,
  p_tier text,
  p_metadata jsonb,
  p_feature_payload jsonb,
  p_hwid text,
  p_bound_at timestamptz,
  p_current_id uuid,
  p_actor_email text,
  p_request_id text
)
returns setof public.account_subscriptions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  evidence_row public.subscription_recovery_ledger;
  restored_row public.account_subscriptions;
  restore_start timestamptz := now();
  restore_expiry timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('recovery:' || p_target_uid, 0));
  select * into evidence_row
  from public.subscription_recovery_ledger
  where id=p_evidence_id and firebase_uid=p_target_uid
  for update;
  if evidence_row.id is null then raise exception 'recovery_evidence_unavailable'; end if;
  if evidence_row.status <> 'available' then raise exception 'recovery_evidence_already_used'; end if;
  if evidence_row.expires_at is not null and evidence_row.expires_at <= now() then raise exception 'recovery_evidence_expired'; end if;
  restore_expiry := restore_start + make_interval(secs => evidence_row.remaining_seconds::double precision);

  select * into restored_row
  from public.apply_manual_subscription_grant(
    p_target_uid, p_target_email, 'restore_remaining_time', p_plan_term, p_legacy_plan, p_tier,
    restore_start, restore_expiry, false,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('recovery_evidence_id', p_evidence_id, 'recovery_request_id', p_request_id),
    coalesce(p_feature_payload, '{}'::jsonb), p_hwid, p_bound_at, p_current_id
  ) limit 1;

  update public.subscription_recovery_ledger
  set status='consumed', consumed_at=now(), consumed_by=lower(p_actor_email), operation_request_id=p_request_id
  where id=p_evidence_id;
  return next restored_row;
end;
$$;

revoke all on function public.admin_begin_operation(text,text,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.admin_account_lifecycle_transition(text,text,text,text,text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.admin_subscription_transition(uuid,text,text,text,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.admin_revoke_account_access(text,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.admin_restore_subscription_time(uuid,text,text,text,text,text,jsonb,jsonb,text,timestamptz,uuid,text,text) from public, anon, authenticated;

grant execute on function public.admin_begin_operation(text,text,text,text,text,text,text,text,text) to service_role;
grant execute on function public.admin_account_lifecycle_transition(text,text,text,text,text,text,text,timestamptz) to service_role;
grant execute on function public.admin_subscription_transition(uuid,text,text,text,text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.admin_revoke_account_access(text,text,text,text,text,text,text,text) to service_role;
grant execute on function public.admin_restore_subscription_time(uuid,text,text,text,text,text,jsonb,jsonb,text,timestamptz,uuid,text,text) to service_role;
