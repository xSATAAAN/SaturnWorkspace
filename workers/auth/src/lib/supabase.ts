import type { AppSessionRow, DeviceLoginRow, Env, SubscriptionRow } from "../types"

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
    `/account_subscriptions?or=(${filters.join(",")})&status=eq.active&select=*&order=expires_at.desc&limit=1`,
  )
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
    subscription_id: string
    hwid: string
    expires_at: string
  },
): Promise<AppSessionRow> {
  const rows = await supabaseJson<AppSessionRow[]>(env, "/app_sessions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...payload, license_id: null }),
  })
  if (!rows[0]) throw new Error("app_session_insert_empty")
  return rows[0]
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

export async function revokeAppSession(env: Env, tokenHash: string): Promise<void> {
  await supabaseJson<unknown>(env, `/app_sessions?session_token_hash=eq.${encodeURIComponent(tokenHash)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  })
}
