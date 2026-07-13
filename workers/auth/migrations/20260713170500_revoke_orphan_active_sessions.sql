with revoked as (
  update public.app_sessions sessions
  set revoked_at = coalesce(sessions.revoked_at, now())
  where sessions.revoked_at is null
    and sessions.expires_at > now()
    and sessions.user_id is not null
    and btrim(sessions.user_id) <> ''
    and not exists (
      select 1
      from public.account_profiles profiles
      where profiles.firebase_uid = sessions.user_id
    )
  returning sessions.user_id
)
insert into public.account_device_events (firebase_uid, event_type, actor_type, actor_id, details)
select
  user_id,
  'orphan_sessions_revoked',
  'system',
  'device_policy_reconciliation',
  jsonb_build_object('revoked_session_count', count(*))
from revoked
group by user_id;
