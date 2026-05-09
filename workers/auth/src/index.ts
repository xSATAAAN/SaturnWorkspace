import { generateLicenseKey, hmacSha256Hex, randomBase64Url, randomUserCode, sha256Hex, timingSafeEqualHex } from "./lib/crypto"
import { allowRateLimit } from "./lib/rateLimit"
import {
  attachLicenseToUser,
  bindLicenseHwid,
  createAppSession,
  createDeviceLogin,
  createLicense,
  getActiveLicenseForUser,
  getAppSessionByHash,
  getDeviceLoginByCode,
  getLicenseById,
  getLicenseByKey,
  getLicenseByOrder,
  getPendingDeviceLoginByUserCode,
  revokeAppSession,
  touchAppSession,
  touchVerify,
  updateDeviceLogin,
} from "./lib/supabase"
import { isLicenseExpired, isValidHwid, isValidLicenseKey, normalizeHwid } from "./lib/validators"
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
    "Access-Control-Allow-Headers": "authorization,content-type,x-saturn-hwid,x-saturn-license-key",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin",
  }
}

async function handleEnotWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.ENOT_WEBHOOK_SECRET) {
    return json({ success: false, error: "payment_provider_disabled" }, 404)
  }
  const signatureHeaderName = String(env.ENOT_SIGNATURE_HEADER || "x-enot-signature").toLowerCase()
  const bodyText = await request.text()
  const providedSignature = request.headers.get(signatureHeaderName) || request.headers.get(signatureHeaderName.toUpperCase()) || ""
  const expected = await hmacSha256Hex(env.ENOT_WEBHOOK_SECRET, bodyText)
  if (!timingSafeEqualHex(providedSignature, expected)) {
    return json({ success: false, error: "invalid_signature" }, 401)
  }

  let payload: any
  try {
    payload = JSON.parse(bodyText)
  } catch {
    return json({ success: false, error: "invalid_json" }, 400)
  }

  const status = String(payload?.status || payload?.payment_status || "").toLowerCase()
  if (!["success", "paid", "completed"].includes(status)) {
    return json({ success: true, ignored: true })
  }

  const orderId = String(payload?.order_id || payload?.invoice_id || payload?.id || "").trim()
  const userEmail = String(payload?.email || payload?.customer_email || "").trim() || null
  if (orderId) {
    const existing = await getLicenseByOrder(env, "enot", orderId)
    if (existing) {
      return json({ success: true, license_key: existing.license_key, duplicate: true })
    }
  }

  const licenseKey = generateLicenseKey()
  const expiryIso = payload?.expiry_date ? new Date(payload.expiry_date).toISOString() : null
  const row = await createLicense(env, {
    license_key: licenseKey,
    user_email: userEmail,
    status: "active",
    hwid: null,
    expiry_date: expiryIso,
    provider: "enot",
    order_id: orderId || null,
  })
  return json({ success: true, license_key: row.license_key })
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
      const resolved = await resolveSessionLicense(env, bearer.slice("Bearer ".length).trim(), hwid)
      if (!resolved.error) return true
    }
  }

  const licenseKey = String(request.headers.get("X-SATURN-License-Key") || "").trim().toUpperCase()
  const hwid = normalizeHwid(request.headers.get("X-SATURN-HWID"))
  if (!isValidLicenseKey(licenseKey) || !isValidHwid(hwid)) {
    return false
  }

  const row = await getLicenseByKey(env, licenseKey)
  if (!row) return false
  if (String(row.status || "").toLowerCase() !== "active") return false
  if (isLicenseExpired(row.expires_at || row.expiry_date || null)) return false
  if (row.hwid && row.hwid !== hwid) return false
  return true
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
  const ip = request.headers.get("CF-Connecting-IP") || "unknown"
  const limit = Number.parseInt(String(env.VERIFY_RATE_LIMIT_PER_MIN || "40"), 10) || 40
  if (!allowRateLimit(`verify:ip:${ip}`, limit, 60_000)) {
    return json({ success: false, error: "rate_limited" }, 429)
  }

  const body = await request.json<any>().catch(() => null)
  const licenseKey = String(body?.license_key || "").trim().toUpperCase()
  const hwid = normalizeHwid(body?.hwid)
  if (!isValidLicenseKey(licenseKey) || !isValidHwid(hwid)) {
    return json({ success: false, error: "invalid_payload" }, 400)
  }
  if (!allowRateLimit(`verify:license:${licenseKey}`, limit, 60_000)) {
    return json({ success: false, error: "rate_limited" }, 429)
  }

  const row = await getLicenseByKey(env, licenseKey)
  if (!row) return json({ success: false, error: "license_not_valid" }, 401)
  if (String(row.status || "").toLowerCase() !== "active") {
    return json({ success: false, error: "license_inactive" }, 403)
  }
  if (isLicenseExpired(row.expires_at || row.expiry_date || null)) {
    return json({ success: false, error: "license_expired" }, 403)
  }

  if (!row.hwid) {
    const bound = await bindLicenseHwid(env, row.id, hwid)
    if (!bound) return json({ success: false, error: "bind_failed_retry" }, 409)
    return json(buildLicenseRuntime(row, "activated"))
  }

  if (row.hwid !== hwid) {
    return json({ success: false, error: "hwid_mismatch" }, 403)
  }

  await touchVerify(env, row.id)
  return json(buildLicenseRuntime(row, "verified"))
}

function buildLicenseRuntime(row: { [key: string]: any }, status: string): Record<string, unknown> {
  const tier = String(row.tier || "public").trim().toLowerCase() === "private" ? "private" : "public"
  const featurePayload = row.feature_payload && typeof row.feature_payload === "object" ? row.feature_payload : {}
  return {
    success: true,
    status,
    tier,
    license_id: row.id,
    user_id: row.firebase_user_id || row.user_id || null,
    expires_at: row.expires_at || row.expiry_date || null,
    runtime_payload: tier === "private" ? featurePayload : {},
    policy: {
      allow: true,
      allow_offline: true,
      blocked_actions: [],
    },
  }
}

function verificationUrl(env: Env, userCode: string): string {
  const base = String(env.DEVICE_LOGIN_URL || "https://saturnws.com/activate").trim()
  const url = new URL(base)
  url.searchParams.set("code", userCode)
  return url.toString()
}

function isActiveUsableLicense(row: any): string {
  if (!row) return "license_not_found"
  if (String(row.status || "").toLowerCase() !== "active") return "license_inactive"
  if (isLicenseExpired(row.expires_at || row.expiry_date || null)) return "license_expired"
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

async function resolveSessionLicense(env: Env, sessionToken: string, hwid: string): Promise<{ session: any; license: any; error?: string }> {
  const tokenHash = await sha256Hex(sessionToken)
  const session = await getAppSessionByHash(env, tokenHash)
  if (!session) return { session: null, license: null, error: "session_not_found" }
  if (session.revoked_at) return { session, license: null, error: "session_revoked" }
  if (session.hwid !== hwid) return { session, license: null, error: "session_hwid_mismatch" }
  if (isLicenseExpired(session.expires_at)) return { session, license: null, error: "session_expired" }
  const license = await getLicenseById(env, session.license_id)
  const licenseError = isActiveUsableLicense(license)
  if (licenseError) return { session, license, error: licenseError }
  if (license?.hwid && license.hwid !== hwid) return { session, license, error: "license_hwid_mismatch" }
  return { session, license }
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
    verification_url: verificationUrl(env, row.user_code),
    expires_at: row.expires_at,
    expires_in: 600,
    interval: 3,
  })
}

async function handleDeviceComplete(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const userCode = String(body?.user_code || body?.code || "").trim().toUpperCase()
  const idToken = String(body?.id_token || "").trim()
  const licenseKey = String(body?.license_key || "").trim().toUpperCase()
  if (!userCode || !idToken) return json({ success: false, error: "missing_device_login_fields" }, 400)

  const firebaseUser = await verifyFirebaseUser(idToken, env)
  const pending = await getPendingDeviceLoginByUserCode(env, userCode)
  if (!pending) return json({ success: false, error: "device_code_not_found" }, 404)
  if (isLicenseExpired(pending.expires_at)) {
    await updateDeviceLogin(env, pending.id, { status: "expired" })
    return json({ success: false, error: "device_code_expired" }, 410)
  }

  const license = licenseKey
    ? await getLicenseByKey(env, licenseKey)
    : await getActiveLicenseForUser(env, firebaseUser.userId, firebaseUser.email)
  const licenseError = isActiveUsableLicense(license)
  if (licenseError) return json({ success: false, error: licenseKey ? licenseError : "license_required" }, 403)
  if (!license) return json({ success: false, error: "license_required" }, 403)

  const licenseUserId = String(license.firebase_user_id || "").trim()
  const licenseEmail = String(license.user_email || "").trim().toLowerCase()
  if (licenseUserId && licenseUserId !== firebaseUser.userId) {
    return json({ success: false, error: "license_user_mismatch" }, 403)
  }
  if (licenseEmail && licenseEmail !== firebaseUser.email) {
    return json({ success: false, error: "license_email_mismatch" }, 403)
  }
  if (license.hwid && license.hwid !== pending.hwid) {
    return json({ success: false, error: "license_hwid_mismatch" }, 403)
  }

  const attached = await attachLicenseToUser(env, license.id, {
    userId: firebaseUser.userId,
    email: firebaseUser.email,
    hwid: pending.hwid,
  })
  await updateDeviceLogin(env, pending.id, {
    status: "authorized",
    user_id: firebaseUser.userId,
    user_email: firebaseUser.email,
    license_id: attached.id,
    license_key: attached.license_key,
    authorized_at: new Date().toISOString(),
  })
  return json({
    success: true,
    status: "authorized",
    user_email: firebaseUser.email,
    license: buildLicenseRuntime(attached, "authorized"),
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
  if (isLicenseExpired(row.expires_at)) {
    await updateDeviceLogin(env, row.id, { status: "expired" })
    return json({ success: false, error: "device_code_expired" }, 410)
  }
  if (row.status === "pending") return json({ success: true, status: "pending" })
  if (row.status !== "authorized") return json({ success: false, status: row.status, error: `device_${row.status}` }, 409)
  if (!row.license_id || !row.user_id) return json({ success: false, error: "device_authorization_incomplete" }, 409)

  const license = await getLicenseById(env, row.license_id)
  const licenseError = isActiveUsableLicense(license)
  if (licenseError || !license) return json({ success: false, error: licenseError || "license_not_found" }, 403)
  const sessionToken = `stk_${randomBase64Url(32)}`
  const tokenHash = await sha256Hex(sessionToken)
  const sessionExpiresAt = String(license.expires_at || license.expiry_date || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
  await createAppSession(env, {
    session_token_hash: tokenHash,
    user_id: row.user_id,
    user_email: row.user_email,
    license_id: license.id,
    hwid,
    expires_at: sessionExpiresAt,
  })
  await updateDeviceLogin(env, row.id, { status: "consumed", consumed_at: new Date().toISOString() })
  return json({
    success: true,
    status: "authorized",
    session_token: sessionToken,
    user_email: row.user_email,
    license: buildLicenseRuntime(license, "verified"),
  })
}

async function handleSessionVerify(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const sessionToken = String(body?.session_token || "").trim()
  const hwid = normalizeHwid(body?.hwid)
  if (!sessionToken || !isValidHwid(hwid)) return json({ success: false, error: "invalid_payload" }, 400)
  const resolved = await resolveSessionLicense(env, sessionToken, hwid)
  if (resolved.error || !resolved.session || !resolved.license) {
    return json({ success: false, error: resolved.error || "session_invalid" }, 401)
  }
  await touchAppSession(env, resolved.session.id)
  await touchVerify(env, resolved.license.id)
  return json({
    ...buildLicenseRuntime(resolved.license, "verified"),
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

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    const cors = corsHeaders(env, request)

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors })
    }

    try {
      if (request.method === "POST" && url.pathname === "/webhook/enot") {
        const res = await handleEnotWebhook(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
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
      if (request.method === "GET" && url.pathname === "/oauth/google-drive-config") {
        const res = await handleGoogleDriveOAuthConfig(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ success: true, service: "license-worker", at: Date.now() }, 200, cors)
      }
      return json({ success: false, error: "not_found" }, 404, cors)
    } catch (err: any) {
      return json({ success: false, error: "internal_error", detail: String(err?.message || err || "error") }, 500, cors)
    }
  },
} satisfies ExportedHandler<Env>
