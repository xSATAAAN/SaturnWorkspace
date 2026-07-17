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
    if subscription_row.is_current is not true then raise exception 'historical_subscription_cannot_be_reactivated'; end if;
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
