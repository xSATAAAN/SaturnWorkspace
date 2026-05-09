export interface Env {
  SUPABASE_API_URL?: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY: string
  GOOGLE_DRIVE_CLIENT_CONFIG_JSON?: string
  OAUTH_CONFIG_ACCESS_TOKEN?: string
  OAUTH_CONFIG_ALLOW_PUBLIC?: string
  FIREBASE_WEB_API_KEY?: string
  DEVICE_LOGIN_URL?: string
  VERIFY_RATE_LIMIT_PER_MIN?: string
  ALLOW_ORIGIN?: string
  APP_ENV?: string
}

export interface LicenseRow {
  id: string
  license_key: string
  user_id?: string | null
  firebase_user_id?: string | null
  user_email: string | null
  status: string
  tier?: string | null
  hwid: string | null
  expires_at?: string | null
  expiry_date?: string | null
  feature_payload?: Record<string, unknown> | null
  created_at: string
  updated_at: string | null
  provider: string | null
  order_id: string | null
  last_verify_at?: string | null
  last_seen_at?: string | null
  bound_at?: string | null
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
  license_key: string | null
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
  license_id: string
  hwid: string
  expires_at: string
  revoked_at: string | null
  created_at: string
  last_seen_at: string | null
}
