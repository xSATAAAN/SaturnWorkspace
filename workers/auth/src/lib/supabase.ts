import type { AppSessionRow, DeviceLoginRow, Env, SubscriptionRow } from "../types"

function normalizeEmail(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase()
}

function isExpiredIso(value: string | null | undefined): boolean {
  const ts = Date.parse(String(value || ""))
  return Number.isFinite(ts) ? ts <= Date.now() : false
}

function isUsableSubscription(row: SubscriptionRow | null | undefined): boolean {
  return Boolean(row) && String(row?.status || "").trim().toLowerCase() === "active" && !isExpiredIso(row?.expires_at)
}

function scoreSubscription(row: SubscriptionRow, userId: string, email: string): string {
  const active = isUsableSubscription(row) ? "1" : "0"
  const exactUser = String(row.firebase_user_id || "").trim() === String(userId || "").trim() ? "1" : "0"
  const exactEmail = normalizeEmail(row.user_email) === normalizeEmail(email) ? "1" : "0"
  const lifetime = Date.parse(String(row.expires_at || "")) >= Date.parse("9999-01-01T00:00:00Z") ? "1" : "0"
  return [
    active,
    exactUser,
    exactEmail,
    lifetime,
    String(row.updated_at || ""),
    String(row.expires_at || ""),
    String(row.created_at || ""),
  ].join("|")
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
  const filters = [`firebase_user_id.eq.${encodeURIComponent(userId)}`]
  if (email) filters.push(`user_email.ilike.${encodeURIComponent(email)}`)
  const rows = await supabaseJson<SubscriptionRow[]>(
    env,
    `/account_subscriptions?or=(${filters.join(",")})&status=eq.active&select=*&order=created_at.desc&limit=20`,
  )
  if (!Array.isArray(rows) || !rows.length) return null
  return [...rows].sort((left, right) =>
    scoreSubscription(right, userId, email).localeCompare(scoreSubscription(left, userId, email)),
  )[0] || null
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
    subscription_id: string
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
