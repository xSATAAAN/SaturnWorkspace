import type { AccountProfileRow, AppSessionRow, DeviceLoginRow, Env, SubscriptionRow } from "../types"
import { resolveSubscriptionTruth } from "../../../shared/subscriptions/resolver.js"

function normalizeEmail(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase()
}

function baseUrl(env: Env): string {
  const raw = String(env.SUPABASE_API_URL || env.SUPABASE_URL || "").replace(/\/+$/, "")
  if (!raw) return ""
  return raw.endsWith("/rest/v1") ? raw : `${raw}/rest/v1`
}

function headers(env: Env): HeadersInit {
  return {
    "Content-Type": "application/json",
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  }
}

function isMissingAppSessionsColumnError(error: unknown, columnName: string): boolean {
  const message = String(error || "").trim().toLowerCase()
  if (!message) return false
  return (
    message.includes(`'${columnName}' column`) ||
    message.includes(`"${columnName}"`) ||
    message.includes(`column ${columnName}`) ||
    message.includes(`${columnName} does not exist`)
  )
}

async function supabaseJson<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl(env)}${path}`, {
    ...init,
    headers: {
      ...headers(env),
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message || "")
        : `supabase_${res.status}`
    throw new Error(message || `supabase_${res.status}`)
  }
  return payload as T
}

export async function getSubscriptionById(env: Env, subscriptionId: string): Promise<SubscriptionRow | null> {
  const rows = await supabaseJson<SubscriptionRow[]>(
    env,
    `/account_subscriptions?id=eq.${encodeURIComponent(subscriptionId)}&select=*&limit=1`,
  )
  return rows[0] || null
}

export async function getActiveSubscriptionForUser(env: Env, userId: string, email: string): Promise<SubscriptionRow | null> {
  const rows = await getSubscriptionRowsForUser(env, userId, email)
  const resolution = resolveSubscriptionTruth<SubscriptionRow>(rows, { firebaseUid: userId, email })
  return resolution.currentRow
}

export async function getLatestSubscriptionForUser(env: Env, userId: string, email: string): Promise<SubscriptionRow | null> {
  const rows = await getSubscriptionRowsForUser(env, userId, email)
  const resolution = resolveSubscriptionTruth<SubscriptionRow>(rows, { firebaseUid: userId, email })
  return resolution.currentRow
}

export async function getSubscriptionRowsForUser(env: Env, userId: string, email: string): Promise<SubscriptionRow[]> {
  const filters = [`firebase_user_id.eq.${encodeURIComponent(userId)}`]
  if (email) filters.push(`user_email.ilike.${encodeURIComponent(email)}`)
  const rows = await supabaseJson<SubscriptionRow[]>(
    env,
    `/account_subscriptions?or=(${filters.join(",")})&select=*&order=created_at.desc&limit=100`,
  )
  return Array.isArray(rows) ? rows : []
}

export async function getAccountProfileByFirebaseUid(env: Env, firebaseUid: string): Promise<AccountProfileRow | null> {
  const rows = await supabaseJson<AccountProfileRow[]>(
    env,
    `/account_profiles?firebase_uid=eq.${encodeURIComponent(firebaseUid)}&select=*&limit=1`,
  )
  return rows[0] || null
}

export async function getAccountProfileByEmail(env: Env, email: string): Promise<AccountProfileRow | null> {
  const rows = await supabaseJson<AccountProfileRow[]>(
    env,
    `/account_profiles?normalized_email=eq.${encodeURIComponent(normalizeEmail(email))}&select=*&limit=1`,
  )
  return rows[0] || null
}

export async function upsertAccountProfile(
  env: Env,
  payload: {
    firebase_uid: string
    display_name?: string | null
    normalized_email: string
    email_verified?: boolean
    email_verified_at?: string | null
    verification_source?: "firebase_google" | "saturnws_otp" | "admin" | "legacy_unknown" | string | null
    auth_providers?: string[]
    locale?: string | null
    account_status?: string
    terms_version?: string | null
    terms_accepted_at?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<AccountProfileRow> {
  const firebaseUid = String(payload.firebase_uid || "").trim()
  const normalizedEmail = normalizeEmail(payload.normalized_email)
  if (!firebaseUid || !normalizedEmail) throw new Error("profile_identity_incomplete")

  const existing = await getAccountProfileByFirebaseUid(env, firebaseUid)
  const byEmail = existing ? null : await getAccountProfileByEmail(env, normalizedEmail)
  if (byEmail && byEmail.firebase_uid !== firebaseUid) {
    throw new Error("profile_email_already_linked")
  }

  const emailVerified = Boolean(payload.email_verified || existing?.email_verified)
  const verifiedAt = emailVerified
    ? payload.email_verified_at || existing?.email_verified_at || new Date().toISOString()
    : null
  const verificationSource =
    emailVerified
      ? payload.verification_source || existing?.verification_source || "legacy_unknown"
      : null

  const body: Record<string, unknown> = {
    firebase_uid: firebaseUid,
    normalized_email: normalizedEmail,
    display_name: String(payload.display_name || existing?.display_name || "").trim() || null,
    email_verified: emailVerified,
    email_verified_at: verifiedAt,
    verification_source: verificationSource,
    auth_providers: payload.auth_providers || (Array.isArray(existing?.auth_providers) ? existing.auth_providers.map(String) : []),
    locale: String(payload.locale || existing?.locale || "ar").trim().toLowerCase() || "ar",
    account_status: payload.account_status || existing?.account_status || "active",
    terms_version: payload.terms_version ?? existing?.terms_version ?? null,
    terms_accepted_at: payload.terms_accepted_at ?? existing?.terms_accepted_at ?? null,
    metadata: { ...(existing?.metadata || {}), ...(payload.metadata || {}) },
  }

  const path = existing
    ? `/account_profiles?firebase_uid=eq.${encodeURIComponent(firebaseUid)}&select=*`
    : "/account_profiles?select=*"
  const rows = await supabaseJson<AccountProfileRow[]>(env, path, {
    method: existing ? "PATCH" : "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  })
  if (!rows[0]) throw new Error("profile_upsert_empty")
  return rows[0]
}

export async function markAccountProfileEmailVerified(
  env: Env,
  firebaseUid: string | null,
  email: string,
  source: "firebase_google" | "saturnws_otp" | "admin" | "legacy_unknown" = "saturnws_otp",
): Promise<AccountProfileRow | null> {
  const normalizedEmail = normalizeEmail(email)
  const filters = firebaseUid
    ? `firebase_uid=eq.${encodeURIComponent(firebaseUid)}`
    : `normalized_email=eq.${encodeURIComponent(normalizedEmail)}`
  const rows = await supabaseJson<AccountProfileRow[]>(env, `/account_profiles?${filters}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ email_verified: true, email_verified_at: new Date().toISOString(), verification_source: source }),
  })
  return rows[0] || null
}

export async function updateAccountProfileStatus(
  env: Env,
  firebaseUid: string,
  accountStatus: "active" | "pending_deletion" | "suspended" | "deleted" | string,
): Promise<AccountProfileRow | null> {
  const rows = await supabaseJson<AccountProfileRow[]>(env, `/account_profiles?firebase_uid=eq.${encodeURIComponent(firebaseUid)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ account_status: accountStatus }),
  })
  return rows[0] || null
}

export async function getAccountDeletionRequest(env: Env, firebaseUid: string): Promise<Record<string, any> | null> {
  const rows = await supabaseJson<Record<string, any>[]>(env, `/account_deletion_requests?firebase_uid=eq.${encodeURIComponent(firebaseUid)}&status=in.(pending_deletion,deletion_due,on_hold)&select=id,status,requested_at,cooling_off_until,due_at,cancelled_at,held_at&order=created_at.desc&limit=1`)
  return rows[0] || null
}

export async function createAccountDeletionRequest(env: Env, input: { firebaseUid: string; requestId: string; reason?: string | null; coolingOffUntil: string; dueAt: string }): Promise<Record<string, any>> {
  const rows = await supabaseJson<Record<string, any>[]>(env, '/account_deletion_requests?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      firebase_uid: input.firebaseUid,
      request_id: input.requestId,
      status: 'pending_deletion',
      requested_at: new Date().toISOString(),
      cooling_off_until: input.coolingOffUntil,
      due_at: input.dueAt,
      user_reason: String(input.reason || '').trim().slice(0, 500) || null,
      inventory_snapshot: { contract_version: 1, purge_mode: 'dry_run_only' },
    }),
  })
  if (!rows[0]) throw new Error('deletion_request_create_failed')
  return rows[0]
}

export async function cancelAccountDeletionRequest(env: Env, firebaseUid: string): Promise<Record<string, any> | null> {
  const rows = await supabaseJson<Record<string, any>[]>(env, `/account_deletion_requests?firebase_uid=eq.${encodeURIComponent(firebaseUid)}&status=eq.pending_deletion&select=*`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'deletion_cancelled', cancelled_at: new Date().toISOString() }),
  })
  return rows[0] || null
}

export async function attachSubscriptionToUser(
  env: Env,
  subscriptionId: string,
  payload: { userId: string; email: string; hwid: string },
): Promise<SubscriptionRow> {
  const now = new Date().toISOString()
  const rows = await supabaseJson<SubscriptionRow[]>(
    env,
    `/account_subscriptions?id=eq.${encodeURIComponent(subscriptionId)}&select=*`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        firebase_user_id: payload.userId,
        user_email: payload.email,
        hwid: payload.hwid,
        bound_at: now,
        last_seen_at: now,
        updated_at: now,
      }),
    },
  )
  if (!rows[0]) throw new Error("subscription_update_empty")
  return rows[0]
}

export async function touchSubscription(env: Env, subscriptionId: string): Promise<void> {
  await supabaseJson<unknown>(env, `/account_subscriptions?id=eq.${encodeURIComponent(subscriptionId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  })
}

export async function createDeviceLogin(
  env: Env,
  payload: {
    device_code: string
    user_code: string
    hwid: string
    expires_at: string
    metadata?: Record<string, unknown>
  },
): Promise<DeviceLoginRow> {
  const rows = await supabaseJson<DeviceLoginRow[]>(env, "/device_login_sessions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...payload, status: "pending", metadata: payload.metadata || {} }),
  })
  if (!rows[0]) throw new Error("device_login_insert_empty")
  return rows[0]
}

export async function getDeviceLoginByCode(env: Env, deviceCode: string): Promise<DeviceLoginRow | null> {
  const rows = await supabaseJson<DeviceLoginRow[]>(
    env,
    `/device_login_sessions?device_code=eq.${encodeURIComponent(deviceCode)}&select=*&limit=1`,
  )
  return rows[0] || null
}

export async function getPendingDeviceLoginByUserCode(env: Env, userCode: string): Promise<DeviceLoginRow | null> {
  const rows = await supabaseJson<DeviceLoginRow[]>(
    env,
    `/device_login_sessions?user_code=eq.${encodeURIComponent(userCode)}&status=eq.pending&select=*&limit=1`,
  )
  return rows[0] || null
}

export async function updateDeviceLogin(
  env: Env,
  id: string,
  patch: Record<string, unknown>,
): Promise<DeviceLoginRow> {
  const rows = await supabaseJson<DeviceLoginRow[]>(
    env,
    `/device_login_sessions?id=eq.${encodeURIComponent(id)}&select=*`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    },
  )
  if (!rows[0]) throw new Error("device_login_update_empty")
  return rows[0]
}

export async function createAppSession(
  env: Env,
  payload: {
    session_token_hash: string
    user_id: string
    user_email: string | null
    subscription_id: string | null
    hwid: string
    expires_at: string
    metadata?: Record<string, unknown>
  },
): Promise<AppSessionRow> {
  try {
    const rows = await supabaseJson<AppSessionRow[]>(env, "/app_sessions", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...payload, license_id: null, metadata: payload.metadata || {} }),
    })
    if (!rows[0]) throw new Error("app_session_insert_empty")
    return rows[0]
  } catch (error) {
    const missingSubscriptionId = isMissingAppSessionsColumnError(error, "subscription_id")
    const missingMetadata = isMissingAppSessionsColumnError(error, "metadata")
    const mentionsLicenseNull =
      String(error || "").trim().toLowerCase().includes("license_id") &&
      String(error || "").trim().toLowerCase().includes("null")

    if (!missingSubscriptionId && !missingMetadata && !mentionsLicenseNull) {
      throw error
    }

    if (missingMetadata && !missingSubscriptionId && !mentionsLicenseNull) {
      const rows = await supabaseJson<AppSessionRow[]>(env, "/app_sessions", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          session_token_hash: payload.session_token_hash,
          user_id: payload.user_id,
          user_email: payload.user_email,
          subscription_id: payload.subscription_id,
          license_id: null,
          hwid: payload.hwid,
          expires_at: payload.expires_at,
        }),
      })
      if (!rows[0]) throw new Error("app_session_insert_empty")
      return rows[0]
    }

    if (!payload.subscription_id) {
      throw new Error("app_session_schema_outdated")
    }

    const legacyRows = await supabaseJson<AppSessionRow[]>(env, "/app_sessions", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        session_token_hash: payload.session_token_hash,
        user_id: payload.user_id,
        user_email: payload.user_email,
        license_id: payload.subscription_id,
        hwid: payload.hwid,
        expires_at: payload.expires_at,
      }),
    })
    if (!legacyRows[0]) throw new Error("app_session_insert_empty")
    return legacyRows[0]
  }
}

export async function authorizePendingDeviceLoginRow(
  env: Env,
  id: string,
  patch: Record<string, unknown>,
): Promise<DeviceLoginRow | null> {
  const rows = await supabaseJson<DeviceLoginRow[]>(
    env,
    `/device_login_sessions?id=eq.${encodeURIComponent(id)}&status=eq.pending&select=*`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...patch, status: "authorized" }),
    },
  )
  return rows[0] || null
}

export async function claimAuthorizedDeviceLogin(env: Env, id: string): Promise<DeviceLoginRow | null> {
  const claimedAt = new Date().toISOString()
  const rows = await supabaseJson<DeviceLoginRow[]>(
    env,
    `/device_login_sessions?id=eq.${encodeURIComponent(id)}&status=eq.authorized&consumed_at=is.null&select=*`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ consumed_at: claimedAt }),
    },
  )
  return rows[0] || null
}

export async function revokeActiveAppSessionsForSubscription(env: Env, subscriptionId: string): Promise<void> {
  try {
    await supabaseJson<unknown>(
      env,
      `/app_sessions?subscription_id=eq.${encodeURIComponent(subscriptionId)}&revoked_at=is.null`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ revoked_at: new Date().toISOString() }),
      },
    )
  } catch (error) {
    if (!isMissingAppSessionsColumnError(error, "subscription_id")) {
      throw error
    }
    await supabaseJson<unknown>(
      env,
      `/app_sessions?license_id=eq.${encodeURIComponent(subscriptionId)}&revoked_at=is.null`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ revoked_at: new Date().toISOString() }),
      },
    )
  }
}

export async function getAppSessionByHash(env: Env, tokenHash: string): Promise<AppSessionRow | null> {
  const rows = await supabaseJson<AppSessionRow[]>(
    env,
    `/app_sessions?session_token_hash=eq.${encodeURIComponent(tokenHash)}&select=*&limit=1`,
  )
  return rows[0] || null
}

export async function touchAppSession(env: Env, sessionId: string): Promise<void> {
  await supabaseJson<unknown>(env, `/app_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
  })
}

export async function getAppSessionByIdForUser(
  env: Env,
  sessionId: string,
  firebaseUserId: string,
): Promise<AppSessionRow | null> {
  const rows = await supabaseJson<AppSessionRow[]>(
    env,
    `/app_sessions?id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${encodeURIComponent(firebaseUserId)}&select=*&limit=1`,
  )
  return rows[0] || null
}

export async function listAppSessionsForUser(env: Env, firebaseUserId: string): Promise<AppSessionRow[]> {
  const rows = await supabaseJson<AppSessionRow[]>(
    env,
    `/app_sessions?user_id=eq.${encodeURIComponent(firebaseUserId)}&select=*&order=last_seen_at.desc.nullslast,created_at.desc&limit=100`,
  )
  return Array.isArray(rows) ? rows : []
}

export async function revokeAppSessionByIdForUser(
  env: Env,
  sessionId: string,
  firebaseUserId: string,
): Promise<AppSessionRow | null> {
  const rows = await supabaseJson<AppSessionRow[]>(
    env,
    `/app_sessions?id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${encodeURIComponent(firebaseUserId)}&revoked_at=is.null&select=*`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    },
  )
  return rows[0] || null
}

export async function revokeAppSessionsForUser(env: Env, firebaseUserId: string): Promise<void> {
  await supabaseJson<unknown>(
    env,
    `/app_sessions?user_id=eq.${encodeURIComponent(firebaseUserId)}&revoked_at=is.null`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    },
  )
}

export async function revokeAppSessionsForDevice(
  env: Env,
  firebaseUserId: string,
  hwid: string,
): Promise<void> {
  await supabaseJson<unknown>(
    env,
    `/app_sessions?user_id=eq.${encodeURIComponent(firebaseUserId)}&hwid=eq.${encodeURIComponent(hwid)}&revoked_at=is.null`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    },
  )
}

export async function rotateAppSessionToken(
  env: Env,
  sessionId: string,
  currentTokenHash: string,
  nextTokenHash: string,
  expiresAt: string,
): Promise<AppSessionRow | null> {
  const rows = await supabaseJson<AppSessionRow[]>(
    env,
    `/app_sessions?id=eq.${encodeURIComponent(sessionId)}&session_token_hash=eq.${encodeURIComponent(currentTokenHash)}&revoked_at=is.null&select=*`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        session_token_hash: nextTokenHash,
        expires_at: expiresAt,
        last_seen_at: new Date().toISOString(),
      }),
    },
  )
  return rows[0] || null
}

export async function updateAppSessionExpiry(env: Env, sessionId: string, expiresAt: string): Promise<void> {
  await supabaseJson<unknown>(env, `/app_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ expires_at: expiresAt, last_seen_at: new Date().toISOString() }),
  })
}

export async function updateAppSessionSubscription(
  env: Env,
  sessionId: string,
  subscriptionId: string,
  expiresAt: string,
): Promise<void> {
  const patch = {
    subscription_id: subscriptionId,
    license_id: null,
    expires_at: expiresAt,
    last_seen_at: new Date().toISOString(),
  }
  try {
    await supabaseJson<unknown>(env, `/app_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    })
  } catch (error) {
    if (!isMissingAppSessionsColumnError(error, "subscription_id")) {
      throw error
    }
    await supabaseJson<unknown>(env, `/app_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        license_id: subscriptionId,
        expires_at: expiresAt,
        last_seen_at: new Date().toISOString(),
      }),
    })
  }
}

export async function revokeAppSession(env: Env, tokenHash: string): Promise<void> {
  await supabaseJson<unknown>(env, `/app_sessions?session_token_hash=eq.${encodeURIComponent(tokenHash)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  })
}

export async function getLatestEmailVerification(
  env: Env,
  input: { email: string; firebaseUserId?: string | null; purpose?: string; status?: string },
): Promise<Record<string, any> | null> {
  const email = normalizeEmail(input.email)
  const purpose = String(input.purpose || "email_verification").trim()
  const filters = [`email=eq.${encodeURIComponent(email)}`, `purpose=eq.${encodeURIComponent(purpose)}`]
  if (input.status) filters.push(`status=eq.${encodeURIComponent(input.status)}`)
  if (input.firebaseUserId) filters.push(`firebase_user_id=eq.${encodeURIComponent(input.firebaseUserId)}`)
  const rows = await supabaseJson<Record<string, any>[]>(
    env,
    `/account_email_verifications?${filters.join("&")}&select=*&order=created_at.desc&limit=1`,
  )
  return rows[0] || null
}

export async function getEmailVerificationById(
  env: Env,
  id: string,
): Promise<Record<string, any> | null> {
  const rows = await supabaseJson<Record<string, any>[]>(
    env,
    `/account_email_verifications?id=eq.${encodeURIComponent(String(id || "").trim())}&select=*&limit=1`,
  )
  return rows[0] || null
}

export async function createEmailVerification(
  env: Env,
  payload: Record<string, unknown>,
): Promise<Record<string, any>> {
  const rows = await supabaseJson<Record<string, any>[]>(env, "/account_email_verifications", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  })
  if (!rows[0]) throw new Error("email_verification_insert_empty")
  return rows[0]
}

export async function updateEmailVerification(
  env: Env,
  id: string,
  patch: Record<string, unknown>,
): Promise<Record<string, any>> {
  const rows = await supabaseJson<Record<string, any>[]>(
    env,
    `/account_email_verifications?id=eq.${encodeURIComponent(id)}&select=*`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    },
  )
  if (!rows[0]) throw new Error("email_verification_update_empty")
  return rows[0]
}

export async function insertEmailVerificationAudit(
  env: Env,
  payload: Record<string, unknown>,
): Promise<void> {
  await supabaseJson<unknown>(env, "/account_email_verification_audit", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  })
}
