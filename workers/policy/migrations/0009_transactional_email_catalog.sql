-- Transactional email catalog and scheduling layer.
-- Extends 0008 email operations without replacing the existing outbox/webhook tables.

create table if not exists email_catalog (
  event_type text primary key,
  template_key text not null,
  template_version integer not null default 1,
  category text not null,
  sender_identity text not null,
  title_en text not null,
  title_ar text not null,
  description_en text not null,
  description_ar text not null,
  integration_status text not null,
  user_can_disable integer not null default 0,
  retry_allowed integer not null default 1,
  essential integer not null default 0,
  requires_backend_event integer not null default 0,
  admin_test_allowed integer not null default 0,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists notification_preferences (
  id text primary key,
  user_id text,
  email text,
  category text,
  event_type text,
  enabled integer not null default 1,
  source text not null default 'user',
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  check (user_id is not null or email is not null),
  check (category is not null or event_type is not null)
);

create unique index if not exists notification_preferences_event_uidx
  on notification_preferences(coalesce(user_id, ''), coalesce(email, ''), coalesce(event_type, ''), coalesce(category, ''));

create index if not exists notification_preferences_email_idx on notification_preferences(lower(email));
create index if not exists notification_preferences_user_idx on notification_preferences(user_id);

create table if not exists notification_schedule (
  id text primary key,
  event_type text not null,
  recipient text not null,
  linked_user_id text,
  linked_ticket_id text,
  payload_json text not null default '{}',
  idempotency_key text,
  status text not null default 'scheduled',
  scheduled_for text not null,
  attempts integer not null default 0,
  locked_until text,
  processed_at text,
  last_error text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create unique index if not exists notification_schedule_idempotency_uidx
  on notification_schedule(idempotency_key)
  where idempotency_key is not null;

create index if not exists notification_schedule_due_idx
  on notification_schedule(status, scheduled_for, locked_until);

create index if not exists notification_schedule_recipient_idx
  on notification_schedule(lower(recipient));

create table if not exists notification_deliveries (
  id text primary key,
  schedule_id text,
  email_job_id text,
  event_type text not null,
  recipient text not null,
  status text not null,
  created_at text not null default (datetime('now'))
);

create index if not exists notification_deliveries_schedule_idx on notification_deliveries(schedule_id);
create index if not exists notification_deliveries_job_idx on notification_deliveries(email_job_id);

create table if not exists email_domain_events (
  id text primary key,
  source text not null,
  event_type text not null,
  entity_type text,
  entity_id text,
  idempotency_key text,
  payload_json text not null default '{}',
  status text not null default 'recorded',
  created_at text not null default (datetime('now')),
  processed_at text
);

create unique index if not exists email_domain_events_idempotency_uidx
  on email_domain_events(idempotency_key)
  where idempotency_key is not null;

create index if not exists email_domain_events_type_idx on email_domain_events(event_type, created_at);

alter table email_jobs add column catalog_event_type text;
alter table email_jobs add column template_key text;
alter table email_jobs add column template_version integer;
alter table email_jobs add column email_category text;
alter table email_jobs add column scheduled_notification_id text;

create index if not exists email_jobs_catalog_event_idx on email_jobs(catalog_event_type);
create index if not exists email_jobs_category_idx on email_jobs(email_category);
create index if not exists email_jobs_scheduled_notification_idx on email_jobs(scheduled_notification_id);

insert or ignore into email_catalog
  (event_type, template_key, template_version, category, sender_identity, title_en, title_ar, description_en, description_ar, integration_status, user_can_disable, retry_allowed, essential, requires_backend_event, admin_test_allowed)
values
  ('support.ticket_created', 'support_ticket_created', 1, 'support', 'support', 'Support ticket confirmation', 'تأكيد استلام تذكرة الدعم', 'Confirms that a customer support ticket was received.', 'تأكيد استلام رسالة الدعم من المستخدم.', 'linked', 0, 1, 1, 0, 1),
  ('support.admin_replied', 'support_admin_replied', 1, 'support', 'support', 'Admin support reply', 'رد الإدارة على تذكرة الدعم', 'Sends the admin reply to the customer.', 'يرسل رد الإدارة للمستخدم.', 'linked', 0, 1, 1, 0, 1),
  ('support.status_changed', 'support_status_changed', 1, 'support', 'support', 'Support ticket status changed', 'تحديث حالة تذكرة الدعم', 'Notifies the customer when a support ticket changes status.', 'إشعار المستخدم عند تغيير حالة التذكرة.', 'linked', 1, 1, 0, 0, 1),
  ('support.inbound_received', 'support_inbound_received', 1, 'support', 'support', 'Inbound support reply received', 'استقبال رد بريدي على الدعم', 'Tracks inbound replies received through Resend.', 'تتبع الردود الواردة عبر البريد.', 'linked', 0, 0, 1, 0, 0),
  ('admin.email_test', 'admin_email_test', 1, 'admin', 'general', 'Admin test email', 'رسالة اختبار من الإدارة', 'Operational test email.', 'رسالة اختبار تشغيلية.', 'linked', 0, 1, 1, 0, 1),
  ('account.welcome', 'account_welcome', 1, 'account', 'account', 'Welcome email', 'رسالة الترحيب', 'Prepared welcome email for newly activated accounts.', 'رسالة ترحيب جاهزة للحسابات التي يتم تفعيلها.', 'prepared', 1, 1, 0, 1, 1),
  ('auth.email_verification_requested', 'auth_email_verification', 1, 'auth', 'security', 'Email verification code', 'رمز تأكيد البريد الإلكتروني', 'Prepared for Auth Worker email verification.', 'جاهزة لتأكيد البريد عند ربطها بالمصادقة.', 'prepared', 0, 1, 1, 1, 1),
  ('auth.password_reset_requested', 'auth_password_reset', 1, 'auth', 'security', 'Password reset', 'إعادة تعيين كلمة المرور', 'Prepared for server-side password reset.', 'جاهزة لمسار إعادة تعيين كلمة المرور.', 'prepared', 0, 1, 1, 1, 1),
  ('security.new_login', 'security_new_login', 1, 'security', 'security', 'New login alert', 'تنبيه تسجيل دخول جديد', 'Prepared security alert for new device or unusual login events.', 'تنبيه أمني جاهز لتسجيل الدخول من جهاز جديد.', 'prepared', 0, 1, 1, 1, 1),
  ('billing.payment_succeeded', 'billing_payment_succeeded', 1, 'billing', 'billing', 'Payment succeeded', 'نجاح عملية الدفع', 'Prepared billing receipt email. Disabled until a live payment provider is approved.', 'رسالة إيصال دفع جاهزة وغير مفعلة قبل اعتماد مزود الدفع.', 'disabled', 0, 1, 1, 1, 1),
  ('billing.payment_failed', 'billing_payment_failed', 1, 'billing', 'billing', 'Payment failed', 'فشل عملية الدفع', 'Prepared for payment provider webhooks.', 'جاهزة لأحداث مزود الدفع عند اعتماده.', 'disabled', 0, 1, 1, 1, 1),
  ('billing.subscription_expiring', 'billing_subscription_expiring', 1, 'billing', 'billing', 'Subscription expiring', 'قرب انتهاء الاشتراك', 'Scheduled reminder before subscription expiry.', 'تذكير مجدول قبل انتهاء الاشتراك.', 'prepared', 1, 1, 0, 1, 1),
  ('billing.subscription_expired', 'billing_subscription_expired', 1, 'billing', 'billing', 'Subscription expired', 'انتهاء الاشتراك', 'Prepared account email when a subscription becomes inactive.', 'رسالة جاهزة عند انتهاء الاشتراك.', 'prepared', 0, 1, 1, 1, 1),
  ('release.update_available', 'release_update_available', 1, 'release', 'general', 'Update available', 'تحديث جديد متاح', 'Prepared release notification.', 'إشعار تحديث جاهز.', 'prepared', 1, 1, 0, 1, 1),
  ('release.mandatory_update', 'release_mandatory_update', 1, 'release', 'general', 'Mandatory update notice', 'تنبيه تحديث إجباري', 'Prepared notice for mandatory update campaigns.', 'تنبيه جاهز لحملات التحديث الإجباري.', 'prepared', 0, 1, 1, 1, 1),
  ('policy.kill_switch_notice', 'policy_kill_switch_notice', 1, 'policy', 'security', 'Service lock notice', 'تنبيه إيقاف الخدمة', 'Prepared for policy-level service lock notices.', 'تنبيه جاهز لحالات إيقاف الخدمة.', 'prepared', 0, 1, 1, 1, 1);
