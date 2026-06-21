-- Phase C: account connection sessions remain valid independently of subscription lifecycle.

alter table public.app_sessions
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.app_sessions
  drop constraint if exists app_sessions_subscription_id_fkey;

alter table public.app_sessions
  add constraint app_sessions_subscription_id_fkey
  foreign key (subscription_id)
  references public.account_subscriptions(id)
  on delete set null
  not valid;

alter table public.app_sessions
  validate constraint app_sessions_subscription_id_fkey;
