import { randomBase64Url, randomUserCode, sha256Hex } from "./lib/crypto"
import { allowRateLimit } from "./lib/rateLimit"
import {
  attachSubscriptionToUser,
  createAppSession,
  createDeviceLogin,
  getActiveSubscriptionForUser,
  getAppSessionByHash,
  getDeviceLoginByCode,
  getPendingDeviceLoginByUserCode,
  getSubscriptionById,
  revokeAppSession,
  touchAppSession,
  touchSubscription,
  updateDeviceLogin,
} from "./lib/supabase"
import { isIsoExpired, isValidHwid, normalizeHwid } from "./lib/validators"
import type { Env } from "./types"

function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  })
}

function corsHeaders(env: Env, request?: Request): HeadersInit {
  const origin = String(request?.headers.get("Origin") || "").trim()
  const configured = String(env.ALLOW_ORIGIN || "https://saturnws.com,https://www.saturnws.com,https://admin.saturnws.com")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  const allowOrigin = origin && configured.includes(origin) ? origin : configured[0] || ""
  if (!allowOrigin) return {}
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization,content-type,x-saturn-hwid",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin",
  }
}

function oauthConfigPayload(env: Env): unknown {
  const raw = String(env.GOOGLE_DRIVE_CLIENT_CONFIG_JSON || "").trim()
  if (!raw) throw new Error("oauth_config_not_configured")
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    throw new Error("oauth_config_invalid_json")
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("oauth_config_invalid_payload")
  }
  const root = payload as Record<string, any>
  const config = root.installed || root.web
  if (!config || typeof config !== "object") {
    throw new Error("oauth_config_missing_client")
  }
  for (const key of ["client_id", "client_secret", "auth_uri", "token_uri"]) {
    if (!String(config[key] || "").trim()) {
      throw new Error(`oauth_config_missing_${key}`)
    }
  }
  return payload
}

async function authorizeOAuthConfigRequest(request: Request, env: Env): Promise<boolean> {
  const publicMode = String(env.OAUTH_CONFIG_ALLOW_PUBLIC || "").trim() === "1"
  if (publicMode) return true

  const accessToken = String(env.OAUTH_CONFIG_ACCESS_TOKEN || "").trim()
  const bearer = String(request.headers.get("Authorization") || "").trim()
  if (accessToken && bearer === `Bearer ${accessToken}`) {
    return true
  }

  if (bearer.startsWith("Bearer ")) {
    const hwid = normalizeHwid(request.headers.get("X-SATURN-HWID"))
    if (isValidHwid(hwid)) {
      const resolved = await resolveSessionSubscription(env, bearer.slice("Bearer ".length).trim(), hwid)
      if (!resolved.error) return true
    }
  }

  return false
}

async function handleGoogleDriveOAuthConfig(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown"
  if (!allowRateLimit(`oauth-config:ip:${ip}`, 20, 60_000)) {
    return json({ success: false, error: "rate_limited" }, 429)
  }
  if (!(await authorizeOAuthConfigRequest(request, env))) {
    return json({ success: false, error: "unauthorized" }, 401)
  }
  return json(oauthConfigPayload(env))
}

async function handleVerify(request: Request, env: Env): Promise<Response> {
  return json({ success: false, error: "account_session_required" }, 410)
}

function buildSubscriptionRuntime(row: { [key: string]: any }, status: string): Record<string, unknown> {
  const tier = String(row.tier || "public").trim().toLowerCase() === "private" ? "private" : "public"
  const featurePayload = row.feature_payload && typeof row.feature_payload === "object" ? row.feature_payload : {}
  return {
    success: true,
    status,
    tier,
    subscription_id: row.id,
    license_id: row.id,
    user_id: row.firebase_user_id || row.user_id || null,
    user_email: row.user_email || null,
    plan: row.plan || null,
    expires_at: row.expires_at || null,
    runtime_payload: tier === "private" ? featurePayload : {},
    policy: {
      allow: true,
      allow_offline: true,
      blocked_actions: [],
    },
  }
}

function verificationUrl(env: Env, deviceCode: string): string {
  const base = String(env.DEVICE_LOGIN_URL || "https://saturnws.com/activate").trim()
  const url = new URL(base)
  url.searchParams.set("ticket", deviceCode)
  return url.toString()
}

async function proxyFirebaseAuthHelper(request: Request, env: Env): Promise<Response> {
  const base = String(env.FIREBASE_AUTH_HELPER_ORIGIN || "").trim() || "https://saturnws-1.firebaseapp.com"
  const url = new URL(request.url)
  const upstream = new URL(base)
  upstream.pathname = url.pathname
  upstream.search = url.search
  const response = await fetch(new Request(upstream.toString(), request))
  const headers = new Headers(response.headers)
  headers.set("Cache-Control", "no-store")
  return new Response(response.body, { status: response.status, headers })
}

function isActiveUsableSubscription(row: any): string {
  if (!row) return "subscription_not_found"
  if (String(row.status || "").toLowerCase() !== "active") return "subscription_inactive"
  if (isIsoExpired(row.expires_at || null)) return "subscription_expired"
  return ""
}

async function verifyFirebaseUser(idToken: string, env: Env): Promise<{ userId: string; email: string }> {
  const apiKey = String(env.FIREBASE_WEB_API_KEY || "").trim()
  if (!apiKey) throw new Error("firebase_not_configured")
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ idToken }),
  })
  if (!res.ok) throw new Error("firebase_token_invalid")
  const payload = await res.json<any>().catch(() => null)
  const user = payload?.users?.[0]
  const userId = String(user?.localId || "").trim()
  const email = String(user?.email || "").trim().toLowerCase()
  const emailVerified = Boolean(user?.emailVerified)
  if (!userId || !email || !emailVerified) throw new Error("firebase_user_not_verified")
  return { userId, email }
}

async function resolveSessionSubscription(
  env: Env,
  sessionToken: string,
  hwid: string,
): Promise<{ session: any; subscription: any; error?: string }> {
  const tokenHash = await sha256Hex(sessionToken)
  const session = await getAppSessionByHash(env, tokenHash)
  if (!session) return { session: null, subscription: null, error: "session_not_found" }
  if (session.revoked_at) return { session, subscription: null, error: "session_revoked" }
  if (session.hwid !== hwid) return { session, subscription: null, error: "session_hwid_mismatch" }
  if (isIsoExpired(session.expires_at)) return { session, subscription: null, error: "session_expired" }
  if (!session.subscription_id) return { session, subscription: null, error: "subscription_missing" }
  const subscription = await getSubscriptionById(env, session.subscription_id)
  const subscriptionError = isActiveUsableSubscription(subscription)
  if (subscriptionError) return { session, subscription, error: subscriptionError }
  if (subscription?.hwid && subscription.hwid !== hwid) return { session, subscription, error: "subscription_hwid_mismatch" }
  return { session, subscription }
}

async function handleDeviceStart(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown"
  if (!allowRateLimit(`device-start:${ip}`, 12, 60_000)) {
    return json({ success: false, error: "rate_limited" }, 429)
  }
  const body = await request.json<any>().catch(() => null)
  const hwid = normalizeHwid(body?.hwid)
  if (!isValidHwid(hwid)) return json({ success: false, error: "invalid_hwid" }, 400)

  const deviceCode = randomBase64Url(32)
  const userCode = randomUserCode()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const row = await createDeviceLogin(env, {
    device_code: deviceCode,
    user_code: userCode,
    hwid,
    expires_at: expiresAt,
    metadata: {
      app_version: body?.app_version || null,
      user_agent: request.headers.get("User-Agent") || null,
      ip,
    },
  })
  return json({
    success: true,
    device_code: row.device_code,
    user_code: row.user_code,
    verification_url: verificationUrl(env, row.device_code),
    expires_at: row.expires_at,
    expires_in: 600,
    interval: 3,
  })
}

async function handleDeviceComplete(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const ticket = String(body?.ticket || body?.device_code || "").trim()
  const userCode = String(body?.user_code || body?.code || "").trim().toUpperCase()
  const idToken = String(body?.id_token || "").trim()
  if ((!ticket && !userCode) || !idToken) return json({ success: false, error: "missing_device_login_fields" }, 400)

  const firebaseUser = await verifyFirebaseUser(idToken, env)
  const pending = ticket ? await getDeviceLoginByCode(env, ticket) : await getPendingDeviceLoginByUserCode(env, userCode)
  if (!pending) return json({ success: false, error: "device_code_not_found" }, 404)
  if (isIsoExpired(pending.expires_at)) {
    await updateDeviceLogin(env, pending.id, { status: "expired" })
    return json({ success: false, error: "device_code_expired" }, 410)
  }

  const subscription = await getActiveSubscriptionForUser(env, firebaseUser.userId, firebaseUser.email)
  const subscriptionError = isActiveUsableSubscription(subscription)
  if (subscriptionError || !subscription) {
    const error = subscriptionError === "subscription_not_found" ? "subscription_required" : subscriptionError
    await updateDeviceLogin(env, pending.id, {
      status: error,
      user_id: firebaseUser.userId,
      user_email: firebaseUser.email,
    })
    return json({ success: false, error }, 403)
  }

  const subscriptionUserId = String(subscription.firebase_user_id || "").trim()
  const subscriptionEmail = String(subscription.user_email || "").trim().toLowerCase()
  if (subscriptionUserId && subscriptionUserId !== firebaseUser.userId) {
    await updateDeviceLogin(env, pending.id, {
      status: "subscription_user_mismatch",
      user_id: firebaseUser.userId,
      user_email: firebaseUser.email,
      subscription_id: subscription.id,
    })
    return json({ success: false, error: "subscription_user_mismatch" }, 403)
  }
  if (subscriptionEmail && subscriptionEmail !== firebaseUser.email) {
    await updateDeviceLogin(env, pending.id, {
      status: "subscription_email_mismatch",
      user_id: firebaseUser.userId,
      user_email: firebaseUser.email,
      subscription_id: subscription.id,
    })
    return json({ success: false, error: "subscription_email_mismatch" }, 403)
  }
  if (subscription.hwid && subscription.hwid !== pending.hwid) {
    await updateDeviceLogin(env, pending.id, {
      status: "subscription_hwid_mismatch",
      user_id: firebaseUser.userId,
      user_email: firebaseUser.email,
      subscription_id: subscription.id,
    })
    return json({ success: false, error: "subscription_hwid_mismatch" }, 403)
  }

  const attached = await attachSubscriptionToUser(env, subscription.id, {
    userId: firebaseUser.userId,
    email: firebaseUser.email,
    hwid: pending.hwid,
  })
  await updateDeviceLogin(env, pending.id, {
    status: "authorized",
    user_id: firebaseUser.userId,
    user_email: firebaseUser.email,
    subscription_id: attached.id,
    license_id: null,
    authorized_at: new Date().toISOString(),
  })
  const runtime = buildSubscriptionRuntime(attached, "authorized")
  return json({
    success: true,
    status: "authorized",
    user_email: firebaseUser.email,
    subscription: runtime,
    license: runtime,
  })
}

async function handleDevicePoll(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const deviceCode = String(body?.device_code || "").trim()
  const hwid = normalizeHwid(body?.hwid)
  if (!deviceCode || !isValidHwid(hwid)) return json({ success: false, error: "invalid_payload" }, 400)
  const row = await getDeviceLoginByCode(env, deviceCode)
  if (!row) return json({ success: false, error: "device_code_not_found" }, 404)
  if (row.hwid !== hwid) return json({ success: false, error: "device_hwid_mismatch" }, 403)
  if (isIsoExpired(row.expires_at)) {
    await updateDeviceLogin(env, row.id, { status: "expired" })
    return json({ success: false, error: "device_code_expired" }, 410)
  }
  if (row.status === "pending") return json({ success: true, status: "pending" })
  if (row.status !== "authorized") {
    const authFailureStatuses = new Set([
      "subscription_required",
      "subscription_expired",
      "subscription_inactive",
      "subscription_missing",
      "subscription_hwid_mismatch",
      "subscription_user_mismatch",
      "subscription_email_mismatch",
    ])
    const status = String(row.status || "")
    return json(
      { success: false, status, error: authFailureStatuses.has(status) ? status : `device_${status}` },
      authFailureStatuses.has(status) ? 403 : 409,
    )
  }
  if (!row.subscription_id || !row.user_id) return json({ success: false, error: "device_authorization_incomplete" }, 409)

  const subscription = await getSubscriptionById(env, row.subscription_id)
  const subscriptionError = isActiveUsableSubscription(subscription)
  if (subscriptionError || !subscription) return json({ success: false, error: subscriptionError || "subscription_not_found" }, 403)
  const sessionToken = `stk_${randomBase64Url(32)}`
  const tokenHash = await sha256Hex(sessionToken)
  const sessionExpiresAt = String(subscription.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
  await createAppSession(env, {
    session_token_hash: tokenHash,
    user_id: row.user_id,
    user_email: row.user_email,
    subscription_id: subscription.id,
    hwid,
    expires_at: sessionExpiresAt,
  })
  await updateDeviceLogin(env, row.id, { status: "consumed", consumed_at: new Date().toISOString() })
  const runtime = buildSubscriptionRuntime(subscription, "verified")
  return json({
    success: true,
    status: "authorized",
    session_token: sessionToken,
    user_email: row.user_email,
    subscription: runtime,
    license: runtime,
  })
}

async function handleSessionVerify(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const sessionToken = String(body?.session_token || "").trim()
  const hwid = normalizeHwid(body?.hwid)
  if (!sessionToken || !isValidHwid(hwid)) return json({ success: false, error: "invalid_payload" }, 400)
  const resolved = await resolveSessionSubscription(env, sessionToken, hwid)
  if (resolved.error || !resolved.session || !resolved.subscription) {
    return json({ success: false, error: resolved.error || "session_invalid" }, 401)
  }
  await touchAppSession(env, resolved.session.id)
  await touchSubscription(env, resolved.subscription.id)
  return json({
    ...buildSubscriptionRuntime(resolved.subscription, "verified"),
    user_email: resolved.session.user_email,
    session_expires_at: resolved.session.expires_at,
  })
}

async function handleSessionLogout(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const sessionToken = String(body?.session_token || "").trim()
  if (sessionToken) await revokeAppSession(env, await sha256Hex(sessionToken))
  return json({ success: true })
}

async function handleAccountSubscription(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const idToken = String(body?.id_token || "").trim()
  if (!idToken) return json({ success: false, error: "missing_id_token" }, 400)
  const firebaseUser = await verifyFirebaseUser(idToken, env)
  const subscription = await getActiveSubscriptionForUser(env, firebaseUser.userId, firebaseUser.email)
  const subscriptionError = isActiveUsableSubscription(subscription)
  if (!subscription || subscriptionError) {
    return json({
      success: true,
      user: {
        id: firebaseUser.userId,
        email: firebaseUser.email,
      },
      subscription: null,
      status: subscriptionError === "subscription_not_found" ? "subscription_required" : subscriptionError,
    })
  }
  return json({
    success: true,
    user: {
      id: firebaseUser.userId,
      email: firebaseUser.email,
    },
    subscription: buildSubscriptionRuntime(subscription, "verified"),
    status: "active",
  })
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    const cors = corsHeaders(env, request)
    const isFirebaseHelperPath = url.pathname === "/__/firebase/init.json" || url.pathname.startsWith("/__/")

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors })
    }

    try {
      if (isFirebaseHelperPath) {
        return await proxyFirebaseAuthHelper(request, env)
      }
      if (request.method === "POST" && url.pathname === "/verify") {
        const res = await handleVerify(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && url.pathname === "/device/start") {
        const res = await handleDeviceStart(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && url.pathname === "/device/complete") {
        const res = await handleDeviceComplete(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && url.pathname === "/device/poll") {
        const res = await handleDevicePoll(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && url.pathname === "/session/verify") {
        const res = await handleSessionVerify(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && url.pathname === "/session/logout") {
        const res = await handleSessionLogout(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && url.pathname === "/account/subscription") {
        const res = await handleAccountSubscription(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "GET" && url.pathname === "/oauth/google-drive-config") {
        const res = await handleGoogleDriveOAuthConfig(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ success: true, service: "auth-worker", at: Date.now() }, 200, cors)
      }
      return json({ success: false, error: "not_found" }, 404, cors)
    } catch (err: any) {
      return json({ success: false, error: "internal_error", detail: String(err?.message || err || "error") }, 500, cors)
    }
  },
} satisfies ExportedHandler<Env>
