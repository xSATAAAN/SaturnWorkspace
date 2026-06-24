export type EmailLocale = "en" | "ar"
export type EmailCategory = "account" | "auth" | "billing" | "support" | "release" | "policy" | "security" | "system" | "admin"
export type EmailIntegrationStatus = "linked" | "prepared" | "disabled" | "backend_missing"
export type SenderIdentityKey = "general" | "security" | "billing" | "support" | "account"

export interface EmailCatalogItem {
  event_type: string
  template_key: string
  template_version: number
  category: EmailCategory
  sender_identity: SenderIdentityKey
  title_en: string
  title_ar: string
  description_en: string
  description_ar: string
  default_subject_en: string
  default_subject_ar: string
  integration_status: EmailIntegrationStatus
  user_can_disable: boolean
  retry_allowed: boolean
  essential: boolean
  requires_backend_event: boolean
  admin_test_allowed: boolean
}

export interface SenderIdentity {
  key: SenderIdentityKey
  from: string
  reply_to?: string
}

export interface RenderedEmail {
  event_type: string
  template_key: string
  template_version: number
  locale: EmailLocale
  subject: string
  html: string
  text: string
  sender: SenderIdentity
}

type TemplateData = Record<string, unknown>

export const EMAIL_SENDER_IDENTITIES: Record<SenderIdentityKey, SenderIdentity> = {
  general: { key: "general", from: "SaturnWS <no-reply@mail.saturnws.com>" },
  security: { key: "security", from: "SaturnWS Security <security@mail.saturnws.com>", reply_to: "security@saturnws.com" },
  billing: { key: "billing", from: "SaturnWS Billing <billing@mail.saturnws.com>", reply_to: "billing@saturnws.com" },
  support: { key: "support", from: "SaturnWS Support <support@mail.saturnws.com>", reply_to: "support@saturnws.com" },
  account: { key: "account", from: "SaturnWS <hello@mail.saturnws.com>", reply_to: "hello@saturnws.com" },
}

function item(input: Omit<EmailCatalogItem, "template_version"> & { template_version?: number }): EmailCatalogItem {
  return { template_version: input.template_version ?? 1, ...input }
}

export const EMAIL_CATALOG: Record<string, EmailCatalogItem> = {
  "support.ticket_created": item({
    event_type: "support.ticket_created",
    template_key: "support_ticket_created",
    category: "support",
    sender_identity: "support",
    title_en: "Support ticket confirmation",
    title_ar: "تأكيد استلام تذكرة الدعم",
    description_en: "Confirms that a customer support ticket was received.",
    description_ar: "تأكيد استلام رسالة الدعم من المستخدم.",
    default_subject_en: "We received your support request",
    default_subject_ar: "تم استلام تذكرة الدعم",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: false,
    admin_test_allowed: true,
  }),
  "support.admin_replied": item({
    event_type: "support.admin_replied",
    template_key: "support_admin_replied",
    category: "support",
    sender_identity: "support",
    title_en: "Admin support reply",
    title_ar: "رد الإدارة على تذكرة الدعم",
    description_en: "Sends the admin reply to the customer and keeps email replies attached to the ticket.",
    description_ar: "يرسل رد الإدارة للمستخدم مع استمرار ربط الردود بنفس التذكرة.",
    default_subject_en: "New reply on your support ticket",
    default_subject_ar: "رد جديد على تذكرة الدعم",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: false,
    admin_test_allowed: true,
  }),
  "support.status_changed": item({
    event_type: "support.status_changed",
    template_key: "support_status_changed",
    category: "support",
    sender_identity: "support",
    title_en: "Support ticket status changed",
    title_ar: "تحديث حالة تذكرة الدعم",
    description_en: "Notifies the customer when a support ticket is resolved, closed, or reopened.",
    description_ar: "إشعار المستخدم عند تغيير حالة التذكرة.",
    default_subject_en: "Support ticket status updated",
    default_subject_ar: "تم تحديث حالة تذكرة الدعم",
    integration_status: "linked",
    user_can_disable: true,
    retry_allowed: true,
    essential: false,
    requires_backend_event: false,
    admin_test_allowed: true,
  }),
  "support.inbound_received": item({
    event_type: "support.inbound_received",
    template_key: "support_inbound_received",
    category: "support",
    sender_identity: "support",
    title_en: "Inbound support reply received",
    title_ar: "استقبال رد بريدي على الدعم",
    description_en: "Tracks inbound replies received through Resend Receiving. It does not send an outbound email.",
    description_ar: "تتبع الردود الواردة عبر البريد دون إرسال رسالة جديدة.",
    default_subject_en: "Inbound support reply received",
    default_subject_ar: "تم استلام رد بريدي على الدعم",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: false,
    essential: true,
    requires_backend_event: false,
    admin_test_allowed: false,
  }),
  "admin.email_test": item({
    event_type: "admin.email_test",
    template_key: "admin_email_test",
    category: "admin",
    sender_identity: "general",
    title_en: "Admin test email",
    title_ar: "رسالة اختبار من الإدارة",
    description_en: "Operational test message sent manually from Email Operations.",
    description_ar: "رسالة اختبار تشغيلية من لوحة عمليات البريد.",
    default_subject_en: "SaturnWS email operations test",
    default_subject_ar: "اختبار منظومة البريد في SaturnWS",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: false,
    admin_test_allowed: true,
  }),
  "account.welcome": item({
    event_type: "account.welcome",
    template_key: "account_welcome",
    category: "account",
    sender_identity: "account",
    title_en: "Welcome email",
    title_ar: "رسالة الترحيب",
    description_en: "Prepared welcome email for newly activated accounts.",
    description_ar: "رسالة ترحيب جاهزة للحسابات التي يتم تفعيلها.",
    default_subject_en: "Welcome to Saturn Workspace",
    default_subject_ar: "مرحبًا بك في Saturn Workspace",
    integration_status: "prepared",
    user_can_disable: true,
    retry_allowed: true,
    essential: false,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "auth.email_verification": item({
    event_type: "auth.email_verification",
    template_key: "auth_email_verification",
    category: "auth",
    sender_identity: "security",
    title_en: "Email verification code",
    title_ar: "رمز تأكيد البريد الإلكتروني",
    description_en: "Sends a server-side SaturnWS email verification code.",
    description_ar: "ترسل رمز تأكيد البريد من مسار المصادقة التشغيلي في SaturnWS.",
    default_subject_en: "Your SaturnWS verification code",
    default_subject_ar: "رمز تأكيد SaturnWS",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "auth.verification_resend": item({
    event_type: "auth.verification_resend",
    template_key: "auth_email_verification",
    category: "auth",
    sender_identity: "security",
    title_en: "Resent email verification code",
    title_ar: "إعادة إرسال رمز تأكيد البريد الإلكتروني",
    description_en: "Server-side resend of a SaturnWS email verification code.",
    description_ar: "إعادة إرسال رمز تأكيد البريد من خادم SaturnWS.",
    default_subject_en: "Your SaturnWS verification code",
    default_subject_ar: "رمز تأكيد SaturnWS",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "auth.password_reset_requested": item({
    event_type: "auth.password_reset_requested",
    template_key: "auth_password_reset",
    category: "auth",
    sender_identity: "security",
    title_en: "Password reset",
    title_ar: "إعادة تعيين كلمة المرور",
    description_en: "Prepared for a server-side password reset flow. Current Firebase reset remains separate.",
    description_ar: "جاهزة لمسار إعادة تعيين كلمة المرور من السيرفر عند اعتماده.",
    default_subject_en: "Reset your SaturnWS password",
    default_subject_ar: "إعادة تعيين كلمة مرور SaturnWS",
    integration_status: "prepared",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "security.new_login": item({
    event_type: "security.new_login",
    template_key: "security_new_login",
    category: "security",
    sender_identity: "security",
    title_en: "New login alert",
    title_ar: "تنبيه تسجيل دخول جديد",
    description_en: "Notifies the account owner after a desktop device is linked.",
    description_ar: "تنبيه لصاحب الحساب بعد ربط جهاز سطح مكتب.",
    default_subject_en: "New SaturnWS login",
    default_subject_ar: "تسجيل دخول جديد إلى SaturnWS",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "security.session_revoked": item({
    event_type: "security.session_revoked",
    template_key: "security_session_revoked",
    category: "security",
    sender_identity: "security",
    title_en: "Session ended",
    title_ar: "تم إنهاء جلسة",
    description_en: "Notifies the account owner when a signed-in session is revoked.",
    description_ar: "تنبيه لصاحب الحساب عند إنهاء جلسة مسجلة.",
    default_subject_en: "A SaturnWS session was ended",
    default_subject_ar: "تم إنهاء جلسة في SaturnWS",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "security.device_revoked": item({
    event_type: "security.device_revoked",
    template_key: "security_device_revoked",
    category: "security",
    sender_identity: "security",
    title_en: "Device access revoked",
    title_ar: "تم إلغاء وصول جهاز",
    description_en: "Notifies the account owner when a linked device is revoked.",
    description_ar: "تنبيه لصاحب الحساب عند إلغاء وصول جهاز مرتبط.",
    default_subject_en: "A SaturnWS device was revoked",
    default_subject_ar: "تم إلغاء وصول جهاز في SaturnWS",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "security.all_sessions_revoked": item({
    event_type: "security.all_sessions_revoked",
    template_key: "security_all_sessions_revoked",
    category: "security",
    sender_identity: "security",
    title_en: "All sessions ended",
    title_ar: "تم إنهاء كل الجلسات",
    description_en: "Notifies the account owner when all account sessions are revoked.",
    description_ar: "تنبيه لصاحب الحساب عند إنهاء كل جلسات الحساب.",
    default_subject_en: "All SaturnWS sessions were ended",
    default_subject_ar: "تم إنهاء كل جلسات SaturnWS",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "account.deletion_requested": item({
    event_type: "account.deletion_requested",
    template_key: "account_deletion_requested",
    category: "security",
    sender_identity: "security",
    title_en: "Account deletion requested",
    title_ar: "تم طلب حذف الحساب",
    description_en: "Confirms that an account deletion request was created.",
    description_ar: "تأكيد إنشاء طلب حذف الحساب.",
    default_subject_en: "SaturnWS account deletion request",
    default_subject_ar: "طلب حذف حساب SaturnWS",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "account.deletion_cancelled": item({
    event_type: "account.deletion_cancelled",
    template_key: "account_deletion_cancelled",
    category: "security",
    sender_identity: "security",
    title_en: "Account deletion cancelled",
    title_ar: "تم إلغاء حذف الحساب",
    description_en: "Confirms that a pending account deletion request was cancelled.",
    description_ar: "تأكيد إلغاء طلب حذف حساب معلّق.",
    default_subject_en: "SaturnWS account deletion was cancelled",
    default_subject_ar: "تم إلغاء حذف حساب SaturnWS",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "account.suspended": item({
    event_type: "account.suspended",
    template_key: "account_suspended",
    category: "security",
    sender_identity: "security",
    title_en: "Account suspended",
    title_ar: "تم إيقاف الحساب",
    description_en: "Notifies the account owner when account access is suspended.",
    description_ar: "تنبيه لصاحب الحساب عند إيقاف الوصول للحساب.",
    default_subject_en: "SaturnWS account access was suspended",
    default_subject_ar: "تم إيقاف الوصول إلى حساب SaturnWS",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "account.reactivated": item({
    event_type: "account.reactivated",
    template_key: "account_reactivated",
    category: "security",
    sender_identity: "security",
    title_en: "Account reactivated",
    title_ar: "تمت إعادة تفعيل الحساب",
    description_en: "Notifies the account owner when account access is restored.",
    description_ar: "تنبيه لصاحب الحساب عند استعادة الوصول للحساب.",
    default_subject_en: "SaturnWS account access was restored",
    default_subject_ar: "تمت استعادة الوصول إلى حساب SaturnWS",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "admin.email_queue_final_failure": item({
    event_type: "admin.email_queue_final_failure",
    template_key: "admin_email_queue_final_failure",
    category: "admin",
    sender_identity: "general",
    title_en: "Email delivery needs attention",
    title_ar: "تسليم بريد يحتاج متابعة",
    description_en: "Alerts administrators when an email job reaches final failure after retries.",
    description_ar: "تنبيه للإدارة عند فشل رسالة بريد نهائيًا بعد المحاولات.",
    default_subject_en: "SaturnWS email delivery failed",
    default_subject_ar: "فشل تسليم بريد من SaturnWS",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "admin.webhook_repeated_failure": item({
    event_type: "admin.webhook_repeated_failure",
    template_key: "admin_webhook_repeated_failure",
    category: "admin",
    sender_identity: "general",
    title_en: "Webhook verification needs attention",
    title_ar: "التحقق من Webhook يحتاج متابعة",
    description_en: "Alerts administrators when webhook verification failures repeat within a cooldown window.",
    description_ar: "تنبيه للإدارة عند تكرار فشل التحقق من Webhook داخل فترة تهدئة.",
    default_subject_en: "SaturnWS webhook verification needs attention",
    default_subject_ar: "التحقق من Webhook في SaturnWS يحتاج متابعة",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "admin.email_cleanup_failure": item({
    event_type: "admin.email_cleanup_failure",
    template_key: "admin_email_cleanup_failure",
    category: "admin",
    sender_identity: "general",
    title_en: "Scheduled email cleanup needs attention",
    title_ar: "تنظيف البريد المجدول يحتاج متابعة",
    description_en: "Alerts administrators when scheduled email cleanup fails after the scheduler starts.",
    description_ar: "تنبيه للإدارة عند فشل تنظيف البريد المجدول بعد بدء المجدول.",
    default_subject_en: "SaturnWS scheduled cleanup needs attention",
    default_subject_ar: "تنظيف البريد المجدول في SaturnWS يحتاج متابعة",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "admin.storage_config_failure": item({
    event_type: "admin.storage_config_failure",
    template_key: "admin_storage_config_failure",
    category: "admin",
    sender_identity: "general",
    title_en: "Storage configuration needs attention",
    title_ar: "إعداد التخزين يحتاج متابعة",
    description_en: "Alerts administrators when a required storage binding is unavailable for an operational cleanup path.",
    description_ar: "تنبيه للإدارة عند غياب ربط تخزين مطلوب لمسار تنظيف تشغيلي.",
    default_subject_en: "SaturnWS storage configuration needs attention",
    default_subject_ar: "إعداد التخزين في SaturnWS يحتاج متابعة",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "admin.schema_mismatch": item({
    event_type: "admin.schema_mismatch",
    template_key: "admin_schema_mismatch",
    category: "admin",
    sender_identity: "general",
    title_en: "Operational schema needs attention",
    title_ar: "مخطط التشغيل يحتاج متابعة",
    description_en: "Alerts administrators when a runtime schema check finds a missing operational column or table.",
    description_ar: "تنبيه للإدارة عند اكتشاف نقص في جدول أو عمود تشغيلي أثناء الفحص.",
    default_subject_en: "SaturnWS schema check needs attention",
    default_subject_ar: "فحص مخطط SaturnWS يحتاج متابعة",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "admin.readiness_degraded": item({
    event_type: "admin.readiness_degraded",
    template_key: "admin_readiness_degraded",
    category: "admin",
    sender_identity: "general",
    title_en: "Operational readiness needs attention",
    title_ar: "جاهزية التشغيل تحتاج متابعة",
    description_en: "Alerts administrators when a critical operational readiness check degrades.",
    description_ar: "تنبيه للإدارة عند تراجع فحص جاهزية تشغيلي مهم.",
    default_subject_en: "SaturnWS readiness needs attention",
    default_subject_ar: "جاهزية SaturnWS تحتاج متابعة",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "admin.tamper_detected": item({
    event_type: "admin.tamper_detected",
    template_key: "admin_tamper_detected",
    category: "admin",
    sender_identity: "general",
    title_en: "Security signal needs review",
    title_ar: "إشارة أمان تحتاج مراجعة",
    description_en: "Alerts administrators when a high-severity tamper or replay signal is detected.",
    description_ar: "تنبيه للإدارة عند رصد إشارة عبث أو إعادة تشغيل عالية الخطورة.",
    default_subject_en: "SaturnWS security signal needs review",
    default_subject_ar: "إشارة أمان في SaturnWS تحتاج مراجعة",
    integration_status: "linked",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "billing.payment_succeeded": item({
    event_type: "billing.payment_succeeded",
    template_key: "billing_payment_succeeded",
    category: "billing",
    sender_identity: "billing",
    title_en: "Payment succeeded",
    title_ar: "نجاح عملية الدفع",
    description_en: "Prepared billing receipt email. Disabled until a live payment provider is approved.",
    description_ar: "رسالة إيصال دفع جاهزة، لكنها غير مفعلة قبل اعتماد مزود الدفع.",
    default_subject_en: "SaturnWS payment confirmation",
    default_subject_ar: "تأكيد دفع SaturnWS",
    integration_status: "disabled",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "billing.payment_failed": item({
    event_type: "billing.payment_failed",
    template_key: "billing_payment_failed",
    category: "billing",
    sender_identity: "billing",
    title_en: "Payment failed",
    title_ar: "فشل عملية الدفع",
    description_en: "Prepared for payment provider webhooks. Disabled until billing provider is live.",
    description_ar: "جاهزة لأحداث مزود الدفع عند اعتماده.",
    default_subject_en: "SaturnWS payment failed",
    default_subject_ar: "فشل دفع SaturnWS",
    integration_status: "disabled",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "billing.subscription_expiring": item({
    event_type: "billing.subscription_expiring",
    template_key: "billing_subscription_expiring",
    category: "billing",
    sender_identity: "billing",
    title_en: "Subscription expiring",
    title_ar: "قرب انتهاء الاشتراك",
    description_en: "Scheduled reminder before subscription expiry. Requires subscription event scheduling.",
    description_ar: "تذكير مجدول قبل انتهاء الاشتراك عند ربط جدولة الاشتراكات.",
    default_subject_en: "Your SaturnWS subscription is expiring soon",
    default_subject_ar: "اشتراك SaturnWS سينتهي قريبًا",
    integration_status: "prepared",
    user_can_disable: true,
    retry_allowed: true,
    essential: false,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "billing.subscription_expired": item({
    event_type: "billing.subscription_expired",
    template_key: "billing_subscription_expired",
    category: "billing",
    sender_identity: "billing",
    title_en: "Subscription expired",
    title_ar: "انتهاء الاشتراك",
    description_en: "Prepared account email when a subscription becomes inactive.",
    description_ar: "رسالة جاهزة عند انتهاء الاشتراك.",
    default_subject_en: "Your SaturnWS subscription has expired",
    default_subject_ar: "انتهى اشتراك SaturnWS",
    integration_status: "prepared",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "release.update_available": item({
    event_type: "release.update_available",
    template_key: "release_update_available",
    category: "release",
    sender_identity: "general",
    title_en: "Update available",
    title_ar: "تحديث جديد متاح",
    description_en: "Prepared release notification for customer-facing update announcements.",
    description_ar: "إشعار تحديث جاهز للتنبيهات المهمة عن الإصدارات.",
    default_subject_en: "SaturnWS update available",
    default_subject_ar: "تحديث SaturnWS متاح",
    integration_status: "prepared",
    user_can_disable: true,
    retry_allowed: true,
    essential: false,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "release.mandatory_update": item({
    event_type: "release.mandatory_update",
    template_key: "release_mandatory_update",
    category: "release",
    sender_identity: "general",
    title_en: "Mandatory update notice",
    title_ar: "تنبيه تحديث إجباري",
    description_en: "Prepared notice for mandatory update campaigns.",
    description_ar: "تنبيه جاهز لحملات التحديث الإجباري.",
    default_subject_en: "Important SaturnWS update required",
    default_subject_ar: "تحديث SaturnWS إجباري",
    integration_status: "prepared",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
  "policy.kill_switch_notice": item({
    event_type: "policy.kill_switch_notice",
    template_key: "policy_kill_switch_notice",
    category: "policy",
    sender_identity: "security",
    title_en: "Service lock notice",
    title_ar: "تنبيه إيقاف الخدمة",
    description_en: "Prepared for policy-level service lock notices. Must be manually scheduled by admins.",
    description_ar: "تنبيه جاهز لحالات إيقاف الخدمة من السياسة العامة.",
    default_subject_en: "SaturnWS service notice",
    default_subject_ar: "تنبيه خدمة SaturnWS",
    integration_status: "prepared",
    user_can_disable: false,
    retry_allowed: true,
    essential: true,
    requires_backend_event: true,
    admin_test_allowed: false,
  }),
}

export const EMAIL_EVENT_ALIASES: Record<string, string> = {
  support_ticket_confirmation: "support.ticket_created",
  support_admin_reply: "support.admin_replied",
  support_open: "support.status_changed",
  support_closed: "support.status_changed",
  support_resolved: "support.status_changed",
  admin_test: "admin.email_test",
  "auth.email_verification_requested": "auth.email_verification",
}

export const RESEND_KNOWN_EVENTS = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.received",
  "email.scheduled",
  "email.suppressed",
])

export function resolveEmailEventType(raw: unknown): string {
  const normalized = String(raw || "").trim().toLowerCase().replace(/_/g, "_")
  if (!normalized) return ""
  if (EMAIL_CATALOG[normalized]) return normalized
  return EMAIL_EVENT_ALIASES[normalized] || ""
}

export function emailCatalogList(): EmailCatalogItem[] {
  return Object.values(EMAIL_CATALOG).sort((left, right) => {
    const category = left.category.localeCompare(right.category)
    return category || left.event_type.localeCompare(right.event_type)
  })
}

export function senderForEvent(eventType: string, replyToOverride?: string | null): SenderIdentity {
  const catalog = EMAIL_CATALOG[eventType] || EMAIL_CATALOG["admin.email_test"]
  const base = EMAIL_SENDER_IDENTITIES[catalog.sender_identity] || EMAIL_SENDER_IDENTITIES.general
  return replyToOverride ? { ...base, reply_to: replyToOverride } : base
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function value(data: TemplateData, key: string, fallback = ""): string {
  const raw = data[key]
  return raw === null || raw === undefined || raw === "" ? fallback : String(raw)
}

function clampHeader(value: string, max = 220): string {
  const text = value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim()
  return text.length > max ? text.slice(0, max).trim() : text
}

function normalizeLocale(locale: unknown): EmailLocale {
  return String(locale || "").toLowerCase().startsWith("ar") ? "ar" : "en"
}

function paragraph(lines: string[]): string {
  return lines.filter(Boolean).map((line) => `<p style="margin:0 0 14px">${escapeHtml(line)}</p>`).join("")
}

function cta(label: string, href: string): string {
  if (!href) return ""
  return `<p style="margin:22px 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;border-radius:999px;padding:11px 18px;font-weight:700">${escapeHtml(label)}</a></p>`
}

function layout(input: { locale: EmailLocale; title: string; bodyHtml: string; footer?: string }): string {
  const isAr = input.locale === "ar"
  const dir = isAr ? "rtl" : "ltr"
  const align = isAr ? "right" : "left"
  const footer =
    input.footer ||
    (isAr
      ? "هذه رسالة تشغيلية من Saturn Workspace. إذا لم تتوقع هذه الرسالة، يمكنك تجاهلها أو التواصل مع الدعم."
      : "This is an operational message from Saturn Workspace. If you did not expect it, you can ignore it or contact support.")
  return `<!doctype html><html lang="${input.locale}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head><body style="margin:0;background:#f6f7f9;color:#111827;font-family:Arial,Tahoma,sans-serif;text-align:${align}"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7f9;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" dir="${dir}" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;text-align:${align}"><tr><td style="padding:22px 24px;border-bottom:1px solid #e5e7eb"><strong style="font-size:18px">Saturn Workspace</strong></td></tr><tr><td style="padding:24px;line-height:1.7;font-size:15px"><h1 style="margin:0 0 16px;font-size:22px;line-height:1.35">${escapeHtml(input.title)}</h1>${input.bodyHtml}</td></tr><tr><td style="padding:18px 24px;background:#f9fafb;color:#6b7280;font-size:12px;line-height:1.7">${escapeHtml(footer)}</td></tr></table></td></tr></table></body></html>`
}

function supportBody(eventType: string, data: TemplateData, locale: EmailLocale): { title: string; bodyHtml: string; text: string } {
  const ticket = value(data, "ticket_number", value(data, "ticket_id", "SAT-0000"))
  const ticketUrl = value(data, "ticket_url")
  const subject = value(data, "support_subject", value(data, "subject", ticket))
  const message = value(data, "message")
  const status = value(data, "status")
  if (eventType === "support.ticket_created") {
    const title = locale === "ar" ? `تم استلام تذكرتك ${ticket}` : `We received your ticket ${ticket}`
    const lines =
      locale === "ar"
        ? ["استلمنا طلب الدعم الخاص بك وسنرد عليه من داخل البوابة.", `رقم التذكرة: ${ticket}`, `الموضوع: ${subject}`]
        : ["We received your support request and will reply from the customer portal.", `Ticket: ${ticket}`, `Subject: ${subject}`]
    return { title, bodyHtml: paragraph(lines) + cta(locale === "ar" ? "فتح التذكرة" : "Open ticket", ticketUrl), text: lines.concat(ticketUrl ? [ticketUrl] : []).join("\n") }
  }
  if (eventType === "support.admin_replied") {
    const title = locale === "ar" ? `رد جديد على تذكرتك ${ticket}` : `New reply on your ticket ${ticket}`
    const lines =
      locale === "ar"
        ? [`رقم التذكرة: ${ticket}`, message || "يوجد رد جديد من فريق الدعم."]
        : [`Ticket: ${ticket}`, message || "There is a new reply from support."]
    const quote = `<div style="border-${locale === "ar" ? "right" : "left"}:3px solid #111827;background:#f9fafb;padding:12px 14px;margin:14px 0">${escapeHtml(message || "").replace(/\n/g, "<br>")}</div>`
    return { title, bodyHtml: paragraph([lines[0]]) + quote + cta(locale === "ar" ? "فتح التذكرة" : "Open ticket", ticketUrl), text: lines.concat(ticketUrl ? [ticketUrl] : []).join("\n") }
  }
  const title = locale === "ar" ? `تحديث حالة التذكرة ${ticket}` : `Ticket ${ticket} status updated`
  const lines =
    locale === "ar"
      ? [`رقم التذكرة: ${ticket}`, `الحالة: ${status || "updated"}`]
      : [`Ticket: ${ticket}`, `Status: ${status || "updated"}`]
  return { title, bodyHtml: paragraph(lines) + cta(locale === "ar" ? "فتح التذكرة" : "Open ticket", ticketUrl), text: lines.concat(ticketUrl ? [ticketUrl] : []).join("\n") }
}

function securityBody(eventType: string, data: TemplateData, locale: EmailLocale): { title: string; bodyHtml: string; text: string } {
  const actionUrl = value(data, "action_url", value(data, "url"))
  const deviceName = value(data, "device_name")
  const platform = value(data, "platform")
  const occurredAt = value(data, "occurred_at", value(data, "created_at"))
  const adminReason = value(data, "reason")
  const coolingOffUntil = value(data, "cooling_off_until")
  const label = locale === "ar" ? "فتح الحساب" : "Open account"

  if (eventType === "security.new_login") {
    const title = locale === "ar" ? "تم ربط جهاز جديد" : "New device linked"
    const lines =
      locale === "ar"
        ? [
            "تم ربط جهاز جديد بحسابك في Saturn Workspace.",
            deviceName ? `الجهاز: ${deviceName}` : "",
            platform ? `النظام: ${platform}` : "",
            occurredAt ? `الوقت: ${occurredAt}` : "",
            "إذا لم تكن أنت من قام بذلك، أنهِ الجلسات من حسابك وتواصل مع الدعم.",
          ]
        : [
            "A new device was linked to your Saturn Workspace account.",
            deviceName ? `Device: ${deviceName}` : "",
            platform ? `Platform: ${platform}` : "",
            occurredAt ? `Time: ${occurredAt}` : "",
            "If this was not you, end active sessions from your account and contact support.",
          ]
    return { title, bodyHtml: paragraph(lines) + cta(label, actionUrl), text: lines.filter(Boolean).concat(actionUrl ? [actionUrl] : []).join("\n") }
  }

  if (eventType === "security.session_revoked" || eventType === "security.device_revoked" || eventType === "security.all_sessions_revoked") {
    const title =
      locale === "ar"
        ? eventType === "security.device_revoked"
          ? "تم إلغاء وصول جهاز"
          : eventType === "security.all_sessions_revoked"
            ? "تم إنهاء كل الجلسات"
            : "تم إنهاء جلسة"
        : eventType === "security.device_revoked"
          ? "Device access revoked"
          : eventType === "security.all_sessions_revoked"
            ? "All sessions ended"
            : "Session ended"
    const lines =
      locale === "ar"
        ? [
            title + ".",
            deviceName ? `الجهاز: ${deviceName}` : "",
            occurredAt ? `الوقت: ${occurredAt}` : "",
            "إذا لم تكن تتوقع هذا الإجراء، راجع جلسات حسابك.",
          ]
        : [
            `${title}.`,
            deviceName ? `Device: ${deviceName}` : "",
            occurredAt ? `Time: ${occurredAt}` : "",
            "If you did not expect this action, review your account sessions.",
          ]
    return { title, bodyHtml: paragraph(lines) + cta(label, actionUrl), text: lines.filter(Boolean).concat(actionUrl ? [actionUrl] : []).join("\n") }
  }

  if (eventType === "account.deletion_requested") {
    const title = locale === "ar" ? "تم طلب حذف الحساب" : "Account deletion requested"
    const lines =
      locale === "ar"
        ? [
            "تم إنشاء طلب حذف لحسابك في Saturn Workspace.",
            coolingOffUntil ? `يمكن إلغاء الطلب قبل: ${coolingOffUntil}` : "",
            "لن يتم تنفيذ الحذف النهائي قبل انتهاء فترة المراجعة.",
          ]
        : [
            "An account deletion request was created for your Saturn Workspace account.",
            coolingOffUntil ? `You can cancel it before: ${coolingOffUntil}` : "",
            "Final deletion will not run before the review period ends.",
          ]
    return { title, bodyHtml: paragraph(lines) + cta(label, actionUrl), text: lines.filter(Boolean).concat(actionUrl ? [actionUrl] : []).join("\n") }
  }

  if (eventType === "account.deletion_cancelled") {
    const title = locale === "ar" ? "تم إلغاء حذف الحساب" : "Account deletion cancelled"
    const lines =
      locale === "ar"
        ? ["تم إلغاء طلب حذف حسابك. يمكنك استخدام حسابك مرة أخرى إذا كان نشطًا."]
        : ["Your account deletion request was cancelled. You can continue using the account if it is active."]
    return { title, bodyHtml: paragraph(lines) + cta(label, actionUrl), text: lines.filter(Boolean).concat(actionUrl ? [actionUrl] : []).join("\n") }
  }

  if (eventType === "account.suspended" || eventType === "account.reactivated") {
    const suspended = eventType === "account.suspended"
    const title = locale === "ar" ? (suspended ? "تم إيقاف الحساب" : "تمت إعادة تفعيل الحساب") : suspended ? "Account suspended" : "Account reactivated"
    const lines =
      locale === "ar"
        ? [
            suspended ? "تم إيقاف الوصول إلى حسابك." : "تمت استعادة الوصول إلى حسابك.",
            adminReason ? `السبب: ${adminReason}` : "",
            suspended ? "إذا كنت تحتاج مساعدة، تواصل مع الدعم." : "",
          ]
        : [
            suspended ? "Access to your account was suspended." : "Access to your account was restored.",
            adminReason ? `Reason: ${adminReason}` : "",
            suspended ? "Contact support if you need help." : "",
          ]
    return { title, bodyHtml: paragraph(lines) + cta(label, actionUrl), text: lines.filter(Boolean).concat(actionUrl ? [actionUrl] : []).join("\n") }
  }

  return genericBody(eventType, data, locale)
}

function adminAlertBody(eventType: string, data: TemplateData, locale: EmailLocale): { title: string; bodyHtml: string; text: string } {
  const catalog = EMAIL_CATALOG[eventType] || EMAIL_CATALOG["admin.email_queue_final_failure"]
  const actionUrl = value(data, "action_url", value(data, "url"))
  const reference = value(data, "reference_id", value(data, "job_id"))
  const failedEvent = value(data, "failed_event_type", value(data, "email_type"))
  const lastError = value(data, "last_error")
  const summary = value(data, "summary")
  const severity = value(data, "severity")
  const destinationLabel = value(data, "destination_label", locale === "ar" ? "فتح لوحة المتابعة" : "Open admin view")
  const title = value(data, "alert_title", locale === "ar" ? catalog.default_subject_ar : catalog.default_subject_en)
  const lines =
    locale === "ar"
      ? [
          summary || "يوجد تنبيه تشغيلي يحتاج مراجعة.",
          severity ? `الأولوية: ${severity}` : "",
          reference ? `المرجع: ${reference}` : "",
          failedEvent ? `النوع: ${failedEvent}` : "",
          lastError ? `آخر خطأ: ${lastError}` : "",
        ]
      : [
          summary || "An operational alert needs review.",
          severity ? `Severity: ${severity}` : "",
          reference ? `Reference: ${reference}` : "",
          failedEvent ? `Type: ${failedEvent}` : "",
          lastError ? `Last error: ${lastError}` : "",
        ]
  return { title, bodyHtml: paragraph(lines) + cta(destinationLabel, actionUrl), text: lines.filter(Boolean).concat(actionUrl ? [actionUrl] : []).join("\n") }
}

function genericBody(eventType: string, data: TemplateData, locale: EmailLocale): { title: string; bodyHtml: string; text: string } {
  const catalog = EMAIL_CATALOG[eventType] || EMAIL_CATALOG["admin.email_test"]
  const title = locale === "ar" ? catalog.default_subject_ar : catalog.default_subject_en
  const code = value(data, "code")
  const actionUrl = value(data, "action_url", value(data, "url"))
  const amount = value(data, "amount")
  const plan = value(data, "plan")
  const expiresAt = value(data, "expires_at")
  const message = value(data, "message")
  const bodyLines = locale === "ar"
    ? [
        message || catalog.description_ar,
        code ? `الرمز: ${code}` : "",
        amount ? `المبلغ: ${amount}` : "",
        plan ? `الخطة: ${plan}` : "",
        expiresAt ? `ينتهي في: ${expiresAt}` : "",
      ]
    : [
        message || catalog.description_en,
        code ? `Code: ${code}` : "",
        amount ? `Amount: ${amount}` : "",
        plan ? `Plan: ${plan}` : "",
        expiresAt ? `Expires at: ${expiresAt}` : "",
      ]
  const label = locale === "ar" ? "فتح Saturn Workspace" : "Open Saturn Workspace"
  return { title, bodyHtml: paragraph(bodyLines) + cta(label, actionUrl), text: bodyLines.filter(Boolean).concat(actionUrl ? [actionUrl] : []).join("\n") }
}

export function renderTransactionalEmail(eventTypeInput: string, data: TemplateData = {}, localeInput?: unknown, replyToOverride?: string | null): RenderedEmail {
  const eventType = resolveEmailEventType(eventTypeInput) || "admin.email_test"
  const catalog = EMAIL_CATALOG[eventType]
  const locale = normalizeLocale(localeInput || data.locale)
  const body = eventType.startsWith("support.")
    ? supportBody(eventType, data, locale)
    : eventType.startsWith("security.") || eventType.startsWith("account.")
      ? securityBody(eventType, data, locale)
      : eventType.startsWith("admin.") && eventType !== "admin.email_test"
        ? adminAlertBody(eventType, data, locale)
        : genericBody(eventType, data, locale)
  const subjectOverride = value(data, "subject")
  const subject = clampHeader(subjectOverride || body.title || (locale === "ar" ? catalog.default_subject_ar : catalog.default_subject_en))
  const sender = senderForEvent(eventType, replyToOverride)
  return {
    event_type: eventType,
    template_key: catalog.template_key,
    template_version: catalog.template_version,
    locale,
    subject,
    html: layout({ locale, title: subject, bodyHtml: body.bodyHtml }),
    text: `Saturn Workspace\n\n${body.text}`,
    sender,
  }
}

export function sampleTemplateData(eventType: string): TemplateData {
  const now = new Date().toISOString()
  return {
    subject: EMAIL_CATALOG[eventType]?.default_subject_en || "SaturnWS email operations test",
    message: "This is a SaturnWS operational email preview.",
    ticket_number: "SAT-2026-000001",
    ticket_id: "sample-thread",
    ticket_url: "https://saturnws.com/account?section=support&thread=sample-thread",
    support_subject: "Support request",
    status: "resolved",
    code: "123456",
    amount: "$35.00",
    plan: "Monthly",
    expires_at: now,
    occurred_at: now,
    cooling_off_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    device_name: "Desktop device",
    platform: "Windows",
    reference_id: "sample-job",
    failed_event_type: "support.admin_replied",
    last_error: "provider_timeout",
    reason: "Security review",
    action_url: "https://saturnws.com/account",
    generated_at: now,
  }
}
