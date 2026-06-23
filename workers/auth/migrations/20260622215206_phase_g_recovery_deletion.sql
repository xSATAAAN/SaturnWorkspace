alter table public.subscription_recovery_ledger
  add column if not exists source_type text,
  add column if not exists source_reference text,
  add column if not exists original_period_start timestamptz,
  add column if not exists original_period_end timestamptz,
  add column if not exists lost_duration_seconds bigint,
  add column if not exists created_by text,
  add column if not exists creation_reason text,
  add column if not exists integrity_hash text,
  add column if not exists consumed_by text,
  add column if not exists recovery_operation_id uuid;

update public.subscription_recovery_ledger
set
  source_type = coalesce(source_type, evidence_type),
  source_reference = coalesce(source_reference, evidence_reference),
  lost_duration_seconds = coalesce(lost_duration_seconds, remaining_seconds),
  created_by = coalesce(created_by, 'legacy_migration'),
  creation_reason = coalesce(creation_reason, 'Legacy recovery evidence')
where source_type is null
   or source_reference is null
   or lost_duration_seconds is null
   or created_by is null
   or creation_reason is null;

create index if not exists subscription_recovery_integrity_idx
  on public.subscription_recovery_ledger(firebase_uid, integrity_hash)
  where integrity_hash is not null;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null,
  status text not null default 'pending_deletion',
  request_id text not null unique,
  requested_at timestamptz not null default now(),
  cooling_off_until timestamptz not null,
  due_at timestamptz not null,
  cancelled_at timestamptz,
  held_at timestamptz,
  held_by text,
  hold_reason text,
  user_reason text,
  inventory_snapshot jsonb not null default '{}'::jsonb,
  last_preview_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_deletion_status_chk check (status in ('pending_deletion','deletion_cancelled','deletion_due','on_hold')),
  constraint account_deletion_dates_chk check (due_at >= cooling_off_until and cooling_off_until >= requested_at)
);

create unique index if not exists account_deletion_one_open_uidx
  on public.account_deletion_requests(firebase_uid)
  where status in ('pending_deletion','deletion_due','on_hold');
create index if not exists account_deletion_due_idx
  on public.account_deletion_requests(status, due_at);

alter table public.account_deletion_requests enable row level security;
revoke all on table public.account_deletion_requests from public, anon, authenticated;
grant select, insert, update on table public.account_deletion_requests to service_role;

create or replace function public.touch_account_deletion_request_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists account_deletion_request_touch on public.account_deletion_requests;
create trigger account_deletion_request_touch
before update on public.account_deletion_requests
for each row execute function public.touch_account_deletion_request_updated_at();

revoke all on function public.touch_account_deletion_request_updated_at() from public, anon, authenticated;
grant execute on function public.touch_account_deletion_request_updated_at() to service_role;
