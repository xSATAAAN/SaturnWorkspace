export interface Env {
  AUTH_RATE_LIMIT_STANDARD?: { limit(input: { key: string }): Promise<{ success: boolean }> }
  AUTH_RATE_LIMIT_SENSITIVE?: { limit(input: { key: string }): Promise<{ success: boolean }> }
  AUTH_RATE_LIMIT_DEVICE?: { limit(input: { key: string }): Promise<{ success: boolean }> }
  SUPABASE_API_URL?: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY: string
  GOOGLE_DRIVE_CLIENT_CONFIG_JSON?: string
  OAUTH_CONFIG_ACCESS_TOKEN?: string
  OAUTH_CONFIG_ALLOW_PUBLIC?: string
  FIREBASE_WEB_API_KEY?: string
  FIREBASE_PROJECT_ID?: string
  FIREBASE_SERVICE_ACCOUNT_JSON?: string
  FIREBASE_AUTH_HELPER_ORIGIN?: string
  DEVICE_LOGIN_URL?: string
  EMAIL_VERIFICATION_PEPPER?: string
  EMAIL_VERIFICATION_TEST_TRANSPORT?: string
  EMAIL_VERIFICATION_CODE_TTL_MINUTES?: string
  EMAIL_VERIFICATION_ALLOW_UNAUTHENTICATED_TEST?: string
  EMAIL_AUTH_ENABLED?: string
  EMAIL_SECURITY_ENABLED?: string
  AUTH_EMAIL_ENQUEUE_URL?: string
  AUTH_EMAIL_ENQUEUE_TOKEN?: string
  AUTH_ORPHAN_PASSWORD_RETENTION_HOURS?: string
  AUTH_ORPHAN_PASSWORD_ALERT_THRESHOLD?: string
  AUTH_ORPHAN_ADMIN_ALERT_RECIPIENT?: string
  POLICY_SERVICE?: { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> }
  ACCOUNT_TERMS_VERSION?: string
  PROFILE_DEFAULT_LOCALE?: string
  APP_SESSION_TTL_DAYS?: string
  ACCOUNT_DELETION_COOLING_OFF_DAYS?: string
  ALLOW_ORIGIN?: string
  APP_ENV?: string
}

export interface AccountProfileRow {
  id: string
  firebase_uid: string
  display_name: string | null
  normalized_email: string
  email_verified: boolean
  email_verified_at: string | null
  verification_source: "firebase_google" | "saturnws_otp" | "admin" | "legacy_unknown" | string | null
  auth_providers: unknown[] | null
  locale: string | null
  account_status: "active" | "suspended" | "pending_deletion" | "deleted" | string
  terms_version: string | null
  terms_accepted_at: string | null
  created_at: string
  updated_at: string | null
  metadata?: Record<string, unknown> | null
}

export interface SubscriptionRow {
  id: string
  firebase_user_id?: string | null
  user_email: string
  plan: "monthly" | "yearly" | string
  tier?: string | null
  status: "active" | "past_due" | "canceled" | "expired" | "suspended" | string
  lifecycle_state?: "trialing" | "active" | "past_due" | "cancel_at_period_end" | "cancelled" | "expired" | "suspended" | string | null
  plan_term?: "weekly" | "monthly" | "annual" | "lifetime" | "custom" | string | null
  renewal_state?: "not_applicable" | "manual" | "auto_renew" | "cancel_at_period_end" | string | null
  source_type?: string | null
  period_start_at?: string | null
  period_end_at?: string | null
  trial_starts_at?: string | null
  trial_ends_at?: string | null
  grace_ends_at?: string | null
  cancel_at_period_end?: boolean | null
  is_current?: boolean | null
  integrity_state?: string | null
  metadata_version?: number | null
  hwid: string | null
  bound_at?: string | null
  starts_at: string
  expires_at: string
  last_seen_at?: string | null
  provider?: string | null
  provider_customer_id?: string | null
  provider_subscription_id?: string | null
  source_promo_code?: string | null
  feature_payload?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string | null
}

export interface DeviceLoginRow {
  id: string
  device_code: string
  user_code: string
  hwid: string
  status: "pending" | "authorized" | "consumed" | "expired" | string
  user_id: string | null
  user_email: string | null
  license_id: string | null
  subscription_id?: string | null
  expires_at: string
  authorized_at: string | null
  consumed_at: string | null
  metadata?: Record<string, unknown> | null
}

export interface AppSessionRow {
  id: string
  session_token_hash: string
  user_id: string
  user_email: string | null
  metadata?: Record<string, unknown> | null
  license_id?: string | null
  subscription_id: string | null
  hwid: string
  expires_at: string
  revoked_at: string | null
  created_at: string
  last_seen_at: string | null
}
