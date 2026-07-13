create table if not exists public.account_device_bindings (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null references public.account_profiles(firebase_uid) on delete restrict,
  hwid_hash text not null check (hwid_hash ~ '^[0-9a-f]{64}$'),
  device_key text not null check (device_key ~ '^[0-9a-f]{16}$'),
  device_name text,
  platform text,
  os_version text,
  app_version text,
  status text not null default 'active' check (status in ('active', 'replaced', 'revoked')),
  bound_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  released_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_device_bindings_one_active_per_user_idx
  on public.account_device_bindings(firebase_uid)
  where status = 'active';
create index if not exists account_device_bindings_user_history_idx
  on public.account_device_bindings(firebase_uid, created_at desc);

create table if not exists public.account_device_change_requests (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null references public.account_profiles(firebase_uid) on delete restrict,
  current_binding_id uuid references public.account_device_bindings(id) on delete restrict,
  resulting_binding_id uuid references public.account_device_bindings(id) on delete restrict,
  requested_hwid_hash text not null check (requested_hwid_hash ~ '^[0-9a-f]{64}$'),
  requested_device_key text not null check (requested_device_key ~ '^[0-9a-f]{16}$'),
  device_name text,
  platform text,
  os_version text,
  app_version text,
  user_reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text,
  resolution_request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_device_change_one_pending_per_user_idx
  on public.account_device_change_requests(firebase_uid)
  where status = 'pending';
create index if not exists account_device_change_queue_idx
  on public.account_device_change_requests(status, requested_at asc);
create index if not exists account_device_change_user_history_idx
  on public.account_device_change_requests(firebase_uid, created_at desc);
create unique index if not exists account_device_change_resolution_request_idx
  on public.account_device_change_requests(resolution_request_id)
  where resolution_request_id is not null;

create table if not exists public.account_device_events (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null,
  event_type text not null,
  actor_type text not null check (actor_type in ('system', 'user', 'admin')),
  actor_id text,
  binding_id uuid references public.account_device_bindings(id) on delete set null,
  change_request_id uuid references public.account_device_change_requests(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists account_device_events_user_created_idx
  on public.account_device_events(firebase_uid, created_at desc);

alter table public.account_device_bindings enable row level security;
alter table public.account_device_change_requests enable row level security;
alter table public.account_device_events enable row level security;

revoke all on table public.account_device_bindings from public, anon, authenticated;
revoke all on table public.account_device_change_requests from public, anon, authenticated;
revoke all on table public.account_device_events from public, anon, authenticated;
grant select, insert, update on table public.account_device_bindings to service_role;
grant select, insert, update on table public.account_device_change_requests to service_role;
grant select, insert on table public.account_device_events to service_role;

insert into public.account_device_bindings (
  firebase_uid,
  hwid_hash,
  device_key,
  device_name,
  platform,
  os_version,
  app_version,
  status,
  bound_at,
  last_seen_at,
  metadata
)
select
  recent.user_id,
  encode(digest('saturnws-device:' || recent.hwid, 'sha256'), 'hex'),
  left(encode(digest('saturnws-device:' || recent.hwid, 'sha256'), 'hex'), 16),
  nullif(recent.metadata->>'device_name', ''),
  nullif(recent.metadata->>'platform', ''),
  nullif(recent.metadata->>'os_version', ''),
  nullif(recent.metadata->>'app_version', ''),
  'active',
  coalesce(recent.created_at, now()),
  coalesce(recent.last_seen_at, recent.created_at, now()),
  jsonb_build_object('source', 'active_session_backfill')
from (
  select distinct on (sessions.user_id)
    sessions.user_id,
    sessions.hwid,
    sessions.metadata,
    sessions.created_at,
    sessions.last_seen_at
  from public.app_sessions sessions
  join public.account_profiles profiles on profiles.firebase_uid = sessions.user_id
  where sessions.revoked_at is null
    and sessions.expires_at > now()
    and sessions.hwid is not null
    and btrim(sessions.hwid) <> ''
  order by sessions.user_id, coalesce(sessions.last_seen_at, sessions.created_at) desc
) recent
where not exists (
  select 1 from public.account_device_bindings bindings
  where bindings.firebase_uid = recent.user_id and bindings.status = 'active'
);

with revoked as (
  update public.app_sessions sessions
  set revoked_at = coalesce(sessions.revoked_at, now())
  from public.account_device_bindings bindings
  where bindings.firebase_uid = sessions.user_id
    and bindings.status = 'active'
    and sessions.revoked_at is null
    and sessions.expires_at > now()
    and sessions.hwid is not null
    and encode(digest('saturnws-device:' || sessions.hwid, 'sha256'), 'hex') <> bindings.hwid_hash
  returning sessions.user_id
)
insert into public.account_device_events (firebase_uid, event_type, actor_type, actor_id, details)
select user_id, 'legacy_device_sessions_reconciled', 'system', 'device_policy_migration', jsonb_build_object('revoked_session_count', count(*))
from revoked
group by user_id;

create or replace function public.authorize_account_device(
  p_firebase_uid text,
  p_hwid_hash text,
  p_device_name text default null,
  p_platform text default null,
  p_os_version text default null,
  p_app_version text default null
)
returns table (
  decision text,
  binding_id uuid,
  device_key text,
  current_device_name text,
  current_bound_at timestamptz,
  pending_request_id uuid,
  pending_request_status text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  normalized_uid text := btrim(coalesce(p_firebase_uid, ''));
  normalized_hash text := lower(btrim(coalesce(p_hwid_hash, '')));
  active_binding public.account_device_bindings%rowtype;
  pending_request public.account_device_change_requests%rowtype;
begin
  if normalized_uid = '' or normalized_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_device_identity';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(normalized_uid, 0));
  select * into active_binding
  from public.account_device_bindings
  where firebase_uid = normalized_uid and status = 'active'
  limit 1
  for update;

  if active_binding.id is null then
    insert into public.account_device_bindings (
      firebase_uid, hwid_hash, device_key, device_name, platform, os_version, app_version
    ) values (
      normalized_uid, normalized_hash, left(normalized_hash, 16), nullif(btrim(p_device_name), ''),
      nullif(btrim(p_platform), ''), nullif(btrim(p_os_version), ''), nullif(btrim(p_app_version), '')
    ) returning * into active_binding;
    insert into public.account_device_events (firebase_uid, event_type, actor_type, actor_id, binding_id, details)
    values (normalized_uid, 'device_bound', 'system', 'auth_worker', active_binding.id, jsonb_build_object('device_key', active_binding.device_key));
    return query select 'authorized'::text, active_binding.id, active_binding.device_key, active_binding.device_name, active_binding.bound_at, null::uuid, null::text;
    return;
  end if;

  if active_binding.hwid_hash = normalized_hash then
    update public.account_device_bindings
    set device_name = coalesce(nullif(btrim(p_device_name), ''), device_name),
        platform = coalesce(nullif(btrim(p_platform), ''), platform),
        os_version = coalesce(nullif(btrim(p_os_version), ''), os_version),
        app_version = coalesce(nullif(btrim(p_app_version), ''), app_version),
        last_seen_at = now(),
        updated_at = now()
    where id = active_binding.id;
    return query select 'authorized'::text, active_binding.id, active_binding.device_key, coalesce(nullif(btrim(p_device_name), ''), active_binding.device_name), active_binding.bound_at, null::uuid, null::text;
    return;
  end if;

  select * into pending_request
  from public.account_device_change_requests
  where firebase_uid = normalized_uid and status = 'pending'
  limit 1;
  insert into public.account_device_events (firebase_uid, event_type, actor_type, actor_id, binding_id, change_request_id, details)
  values (
    normalized_uid,
    'device_link_denied',
    'system',
    'auth_worker',
    active_binding.id,
    pending_request.id,
    jsonb_build_object('current_device_key', active_binding.device_key, 'requested_device_key', left(normalized_hash, 16))
  );
  return query select 'device_change_required'::text, active_binding.id, active_binding.device_key, active_binding.device_name, active_binding.bound_at, pending_request.id, pending_request.status;
end;
$$;

revoke all on function public.authorize_account_device(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.authorize_account_device(text, text, text, text, text, text) to service_role;

create or replace function public.request_account_device_change(
  p_firebase_uid text,
  p_hwid_hash text,
  p_device_name text default null,
  p_platform text default null,
  p_os_version text default null,
  p_app_version text default null,
  p_user_reason text default null
)
returns setof public.account_device_change_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  normalized_uid text := btrim(coalesce(p_firebase_uid, ''));
  normalized_hash text := lower(btrim(coalesce(p_hwid_hash, '')));
  active_binding public.account_device_bindings%rowtype;
  existing_request public.account_device_change_requests%rowtype;
  next_request public.account_device_change_requests%rowtype;
begin
  if normalized_uid = '' or normalized_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_device_identity'; end if;
  perform pg_advisory_xact_lock(hashtextextended(normalized_uid, 0));
  select * into active_binding from public.account_device_bindings
  where firebase_uid = normalized_uid and status = 'active' limit 1 for update;
  if active_binding.id is null or active_binding.hwid_hash = normalized_hash then raise exception 'device_change_not_required'; end if;

  select * into existing_request from public.account_device_change_requests
  where firebase_uid = normalized_uid and status = 'pending' limit 1 for update;
  if existing_request.id is not null and existing_request.requested_hwid_hash = normalized_hash then
    update public.account_device_change_requests
    set user_reason = nullif(btrim(p_user_reason), ''),
        device_name = coalesce(nullif(btrim(p_device_name), ''), device_name),
        platform = coalesce(nullif(btrim(p_platform), ''), platform),
        os_version = coalesce(nullif(btrim(p_os_version), ''), os_version),
        app_version = coalesce(nullif(btrim(p_app_version), ''), app_version),
        updated_at = now()
    where id = existing_request.id returning * into next_request;
    return next next_request;
    return;
  end if;
  if existing_request.id is not null then
    update public.account_device_change_requests
    set status = 'cancelled', resolved_at = now(), resolved_by = normalized_uid,
        resolution_note = 'replaced_by_new_user_request', updated_at = now()
    where id = existing_request.id;
  end if;
  insert into public.account_device_change_requests (
    firebase_uid, current_binding_id, requested_hwid_hash, requested_device_key,
    device_name, platform, os_version, app_version, user_reason
  ) values (
    normalized_uid, active_binding.id, normalized_hash, left(normalized_hash, 16),
    nullif(btrim(p_device_name), ''), nullif(btrim(p_platform), ''), nullif(btrim(p_os_version), ''),
    nullif(btrim(p_app_version), ''), nullif(btrim(p_user_reason), '')
  ) returning * into next_request;
  insert into public.account_device_events (firebase_uid, event_type, actor_type, actor_id, binding_id, change_request_id, details)
  values (normalized_uid, 'device_change_requested', 'user', normalized_uid, active_binding.id, next_request.id, jsonb_build_object('requested_device_key', next_request.requested_device_key));
  return next next_request;
end;
$$;

revoke all on function public.request_account_device_change(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.request_account_device_change(text, text, text, text, text, text, text) to service_role;

create or replace function public.resolve_account_device_change(
  p_request_id uuid,
  p_action text,
  p_actor text,
  p_resolution_note text default null,
  p_expected_updated_at timestamptz default null,
  p_resolution_request_id text default null
)
returns setof public.account_device_change_requests
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  request_row public.account_device_change_requests%rowtype;
  current_binding public.account_device_bindings%rowtype;
  next_binding public.account_device_bindings%rowtype;
  normalized_action text := lower(btrim(coalesce(p_action, '')));
  normalized_request_id text := btrim(coalesce(p_resolution_request_id, ''));
begin
  if normalized_action not in ('approve', 'reject') then raise exception 'invalid_device_change_action'; end if;
  if length(normalized_request_id) < 8 or length(normalized_request_id) > 200 then raise exception 'invalid_request_id'; end if;
  select * into request_row from public.account_device_change_requests where id = p_request_id limit 1;
  if request_row.id is null then raise exception 'device_change_request_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(request_row.firebase_uid, 0));
  select * into request_row from public.account_device_change_requests where id = p_request_id limit 1 for update;
  if request_row.status <> 'pending' then
    if request_row.resolution_request_id = normalized_request_id then
      return next request_row;
      return;
    end if;
    raise exception 'device_change_request_not_pending';
  end if;
  if p_expected_updated_at is not null and request_row.updated_at <> p_expected_updated_at then raise exception 'device_change_request_changed'; end if;

  if normalized_action = 'approve' then
    select * into current_binding from public.account_device_bindings
    where firebase_uid = request_row.firebase_uid and status = 'active' limit 1 for update;
    if current_binding.id is not null then
      update public.account_device_bindings set status = 'replaced', released_at = now(), updated_at = now() where id = current_binding.id;
    end if;
    insert into public.account_device_bindings (
      firebase_uid, hwid_hash, device_key, device_name, platform, os_version, app_version, metadata
    ) values (
      request_row.firebase_uid, request_row.requested_hwid_hash, request_row.requested_device_key,
      request_row.device_name, request_row.platform, request_row.os_version, request_row.app_version,
      jsonb_build_object('source', 'approved_device_change', 'change_request_id', request_row.id)
    ) returning * into next_binding;
    update public.app_sessions set revoked_at = coalesce(revoked_at, now())
    where user_id = request_row.firebase_uid and revoked_at is null;
    update public.device_login_sessions
    set status = 'authorized', authorized_at = now(), updated_at = now()
    where user_id = request_row.firebase_uid
      and status = 'device_change_required'
      and expires_at > now()
      and encode(digest('saturnws-device:' || hwid, 'sha256'), 'hex') = request_row.requested_hwid_hash;
    update public.account_device_change_requests
    set status = 'approved', resulting_binding_id = next_binding.id, resolved_at = now(),
        resolved_by = nullif(btrim(p_actor), ''), resolution_note = nullif(btrim(p_resolution_note), ''),
        resolution_request_id = normalized_request_id, updated_at = now()
    where id = request_row.id returning * into request_row;
    insert into public.account_device_events (firebase_uid, event_type, actor_type, actor_id, binding_id, change_request_id, details)
    values (request_row.firebase_uid, 'device_change_approved', 'admin', nullif(btrim(p_actor), ''), next_binding.id, request_row.id, jsonb_build_object('previous_binding_id', current_binding.id));
  else
    update public.account_device_change_requests
    set status = 'rejected', resolved_at = now(), resolved_by = nullif(btrim(p_actor), ''),
        resolution_note = nullif(btrim(p_resolution_note), ''), resolution_request_id = normalized_request_id, updated_at = now()
    where id = request_row.id returning * into request_row;
    insert into public.account_device_events (firebase_uid, event_type, actor_type, actor_id, binding_id, change_request_id, details)
    values (request_row.firebase_uid, 'device_change_rejected', 'admin', nullif(btrim(p_actor), ''), request_row.current_binding_id, request_row.id, '{}'::jsonb);
    update public.device_login_sessions
    set status = 'device_change_rejected', updated_at = now()
    where user_id = request_row.firebase_uid
      and status = 'device_change_required'
      and expires_at > now()
      and encode(digest('saturnws-device:' || hwid, 'sha256'), 'hex') = request_row.requested_hwid_hash;
  end if;
  return next request_row;
end;
$$;

revoke all on function public.resolve_account_device_change(uuid, text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.resolve_account_device_change(uuid, text, text, text, timestamptz, text) to service_role;

create or replace function public.reset_account_device(
  p_firebase_uid text,
  p_actor text,
  p_reason text default null,
  p_request_id text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  binding_row public.account_device_bindings%rowtype;
  normalized_request_id text := btrim(coalesce(p_request_id, ''));
begin
  if length(normalized_request_id) < 8 or length(normalized_request_id) > 200 then raise exception 'invalid_request_id'; end if;
  perform pg_advisory_xact_lock(hashtextextended(btrim(p_firebase_uid), 0));
  select * into binding_row from public.account_device_bindings
  where firebase_uid = btrim(p_firebase_uid) and status = 'active' limit 1 for update;
  if binding_row.id is null then
    return exists (
      select 1 from public.account_device_events
      where firebase_uid = btrim(p_firebase_uid)
        and event_type = 'device_binding_reset'
        and details->>'request_id' = normalized_request_id
    );
  end if;
  update public.account_device_bindings set status = 'revoked', released_at = now(), updated_at = now() where id = binding_row.id;
  update public.app_sessions set revoked_at = coalesce(revoked_at, now()) where user_id = binding_row.firebase_uid and revoked_at is null;
  update public.account_device_change_requests
  set status = 'cancelled', resolved_at = now(), resolved_by = nullif(btrim(p_actor), ''),
      resolution_note = 'binding_reset', updated_at = now()
  where firebase_uid = binding_row.firebase_uid and status = 'pending';
  insert into public.account_device_events (firebase_uid, event_type, actor_type, actor_id, binding_id, details)
  values (binding_row.firebase_uid, 'device_binding_reset', 'admin', nullif(btrim(p_actor), ''), binding_row.id, jsonb_build_object('reason', nullif(btrim(p_reason), ''), 'request_id', normalized_request_id));
  return true;
end;
$$;

revoke all on function public.reset_account_device(text, text, text, text) from public, anon, authenticated;
grant execute on function public.reset_account_device(text, text, text, text) to service_role;

alter table public.device_login_sessions drop constraint if exists device_login_sessions_status_check;
alter table public.device_login_sessions
  add constraint device_login_sessions_status_check check (
    status in (
      'pending', 'authorized', 'consumed', 'expired', 'device_change_required', 'device_change_rejected',
      'subscription_required', 'subscription_expired', 'subscription_inactive', 'subscription_missing',
      'subscription_hwid_mismatch', 'subscription_user_mismatch', 'subscription_email_mismatch'
    )
  );
