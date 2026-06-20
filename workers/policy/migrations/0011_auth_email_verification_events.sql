-- Phase B production rollout: canonical auth email verification events.
-- This is additive and keeps the legacy event alias out of the public enqueue contract.

insert into email_catalog
  (event_type, template_key, template_version, category, sender_identity, title_en, title_ar, description_en, description_ar, integration_status, user_can_disable, retry_allowed, essential, requires_backend_event, admin_test_allowed, updated_at)
values
  ('auth.email_verification', 'auth_email_verification', 1, 'auth', 'security', 'Email verification code', 'رمز تأكيد البريد الإلكتروني', 'Server-side email verification code for SaturnWS account signup.', 'رمز تحقق يتم إرساله من خادم SaturnWS لتأكيد البريد الإلكتروني.', 'linked', 0, 1, 1, 1, 0, datetime('now')),
  ('auth.verification_resend', 'auth_email_verification', 1, 'auth', 'security', 'Resent email verification code', 'إعادة إرسال رمز تأكيد البريد الإلكتروني', 'Server-side resend of a SaturnWS email verification code.', 'إعادة إرسال رمز تأكيد البريد الإلكتروني من خادم SaturnWS.', 'linked', 0, 1, 1, 1, 0, datetime('now'))
on conflict(event_type) do update set
  template_key = excluded.template_key,
  template_version = excluded.template_version,
  category = excluded.category,
  sender_identity = excluded.sender_identity,
  title_en = excluded.title_en,
  title_ar = excluded.title_ar,
  description_en = excluded.description_en,
  description_ar = excluded.description_ar,
  integration_status = excluded.integration_status,
  user_can_disable = excluded.user_can_disable,
  retry_allowed = excluded.retry_allowed,
  essential = excluded.essential,
  requires_backend_event = excluded.requires_backend_event,
  admin_test_allowed = excluded.admin_test_allowed,
  updated_at = datetime('now');
