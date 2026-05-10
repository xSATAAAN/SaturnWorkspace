alter table public.device_login_sessions
  drop constraint if exists device_login_sessions_status_check;

alter table public.device_login_sessions
  add constraint device_login_sessions_status_check
  check (
    status in (
      'pending',
      'authorized',
      'consumed',
      'expired',
      'subscription_required',
      'subscription_expired',
      'subscription_inactive',
      'subscription_missing',
      'subscription_hwid_mismatch',
      'subscription_user_mismatch',
      'subscription_email_mismatch'
    )
  );
