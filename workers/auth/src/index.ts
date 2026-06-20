import { hmacSha256Hex, randomBase64Url, randomUserCode, sha256Hex, timingSafeEqualHex } from "./lib/crypto"
import { allowRateLimit } from "./lib/rateLimit"
import {
  attachSubscriptionToUser,
  createAppSession,
  createDeviceLogin,
  createEmailVerification,
  getAccountProfileByFirebaseUid,
  getActiveSubscriptionForUser,
  getAppSessionByHash,
  getDeviceLoginByCode,
  getLatestSubscriptionForUser,
  getLatestEmailVerification,
  getPendingDeviceLoginByUserCode,
  getSubscriptionById,
  insertEmailVerificationAudit,
  markAccountProfileEmailVerified,
  revokeAppSession,
  revokeActiveAppSessionsForSubscription,
  touchAppSession,
  touchSubscription,
  upsertAccountProfile,
  updateAppSessionExpiry,
  updateAppSessionSubscription,
  updateDeviceLogin,
  updateEmailVerification,
} from "./lib/supabase"
import { isIsoExpired, isValidHwid, normalizeHwid } from "./lib/validators"
import type { AccountProfileRow, Env, SubscriptionRow } from "./types"

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

function requestId(request: Request): string {
  return request.headers.get("CF-Ray") || crypto.randomUUID()
}

function errorJson(
  request: Request,
  code: string,
  status = 400,
  retryable = false,
  fieldErrors?: Record<string, string>,
): Response {
  return json({
    success: false,
    error: code,
    code,
    request_id: requestId(request),
    retryable,
    ...(fieldErrors ? { field_errors: fieldErrors } : {}),
  }, status)
}

function normalizeApiPath(pathname: string): string {
  if (pathname === "/auth") return "/health"
  if (pathname.startsWith("/auth/")) return pathname.slice("/auth".length) || "/"
  return pathname
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
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {}
  return {
    success: true,
    status,
    tier,
    subscription_id: row.id,
    license_id: row.id,
    user_id: row.firebase_user_id || row.user_id || null,
    user_email: row.user_email || null,
    display_name: metadata.display_name || null,
    avatar_url: metadata.avatar_url || null,
    auth_provider: metadata.auth_provider || null,
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
  const base = String(env.DEVICE_LOGIN_URL || "https://saturnws.com/account/signin").trim()
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

async function verifyFirebaseUser(
  idToken: string,
  env: Env,
): Promise<{
  userId: string
  email: string
  emailVerified: boolean
  displayName: string | null
  photoUrl: string | null
  authProvider: string | null
  authProviders: string[]
}> {
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
  const displayName = String(user?.displayName || "").trim() || null
  const photoUrl = String(user?.photoUrl || "").trim() || null
  const providerUserInfo = Array.isArray(user?.providerUserInfo) ? user.providerUserInfo : []
  const providerIds = providerUserInfo
    .map((item: any) => String(item?.providerId || "").trim().toLowerCase())
    .filter(Boolean)
  const providerId = String(providerIds[0] || user?.providerId || "").trim().toLowerCase()
  const authProvider =
    providerId === "google.com" ? "google" : providerId === "password" ? "password" : providerId || null
  if (!userId || !email) throw new Error("firebase_user_not_verified")
  const authProviders = providerIds
    .map((item: string) => item === "google.com" ? "google" : item === "password" ? "password" : item)
    .filter(Boolean)
  return { userId, email, emailVerified: Boolean(user?.emailVerified), displayName, photoUrl, authProvider, authProviders }
}

function normalizeLocale(value: unknown, env: Env): "ar" | "en" {
  const raw = String(value || env.PROFILE_DEFAULT_LOCALE || "ar").trim().toLowerCase()
  return raw === "en" ? "en" : "ar"
}

function normalizeTermsVersion(value: unknown, env: Env): string | null {
  return String(value || env.ACCOUNT_TERMS_VERSION || "").trim() || null
}

function profileProjection(profile: AccountProfileRow | null, firebaseUser: Awaited<ReturnType<typeof verifyFirebaseUser>>) {
  return {
    user_id: profile?.id || null,
    firebase_uid: firebaseUser.userId,
    display_name: profile?.display_name || firebaseUser.displayName || null,
    normalized_email: profile?.normalized_email || firebaseUser.email,
    email_verified: Boolean(profile?.email_verified),
    email_verified_at: profile?.email_verified_at || null,
    verification_source: profile?.verification_source || null,
    auth_providers: Array.isArray(profile?.auth_providers) ? profile?.auth_providers : firebaseUser.authProviders,
    locale: profile?.locale || "ar",
    account_status: profile?.account_status || "active",
    terms_version: profile?.terms_version || null,
    terms_accepted_at: profile?.terms_accepted_at || null,
    created_at: profile?.created_at || null,
    updated_at: profile?.updated_at || null,
  }
}

async function provisionProfile(
  env: Env,
  firebaseUser: Awaited<ReturnType<typeof verifyFirebaseUser>>,
  input: {
    displayName?: string | null
    locale?: string | null
    termsAccepted?: boolean
    termsVersion?: string | null
    termsAcceptedAt?: string | null
    metadata?: Record<string, unknown>
  } = {},
): Promise<AccountProfileRow> {
  const existing = await getAccountProfileByFirebaseUid(env, firebaseUser.userId).catch(() => null)
  const acceptedTerms = Boolean(input.termsAccepted || existing?.terms_accepted_at)
  const termsVersion = normalizeTermsVersion(input.termsVersion || existing?.terms_version, env)
  const termsAcceptedAt = acceptedTerms ? String(input.termsAcceptedAt || existing?.terms_accepted_at || new Date().toISOString()) : null
  const verifiedByFirebaseGoogle = Boolean(
    firebaseUser.emailVerified && (firebaseUser.authProviders.includes("google") || firebaseUser.authProvider === "google"),
  )
  return upsertAccountProfile(env, {
    firebase_uid: firebaseUser.userId,
    normalized_email: firebaseUser.email,
    display_name: input.displayName || firebaseUser.displayName || existing?.display_name || null,
    email_verified: Boolean(verifiedByFirebaseGoogle || existing?.email_verified),
    email_verified_at: verifiedByFirebaseGoogle ? existing?.email_verified_at || new Date().toISOString() : existing?.email_verified_at || null,
    verification_source: verifiedByFirebaseGoogle ? "firebase_google" : existing?.verification_source || null,
    auth_providers: firebaseUser.authProviders.length ? firebaseUser.authProviders : firebaseUser.authProvider ? [firebaseUser.authProvider] : [],
    locale: normalizeLocale(input.locale || existing?.locale, env),
    account_status: existing?.account_status || "active",
    terms_version: termsVersion,
    terms_accepted_at: termsAcceptedAt,
    metadata: {
      ...(input.metadata || {}),
      auth_provider: firebaseUser.authProvider || null,
      photo_url: firebaseUser.photoUrl || null,
    },
  })
}

function subscriptionLifecycle(row: SubscriptionRow | null): "trialing" | "active" | "past_due" | "cancelled" | "expired" | "suspended" | null {
  if (!row) return null
  const status = String(row.status || "").trim().toLowerCase()
  if (status === "suspended") return "suspended"
  if (status === "past_due") return "past_due"
  if (status === "trialing" || status === "trial") return "trialing"
  if (status === "canceled" || status === "cancelled") return "cancelled"
  if (status === "expired" || isIsoExpired(row.expires_at || null)) return "expired"
  if (status === "active") return "active"
  return "expired"
}

function planTerm(row: SubscriptionRow | null): "weekly" | "monthly" | "annual" | "lifetime" | "custom" | null {
  if (!row) return null
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {}
  const expiresAt = Date.parse(String(row.expires_at || ""))
  if (Boolean((metadata as Record<string, unknown>).is_unlimited) || (Number.isFinite(expiresAt) && expiresAt >= Date.parse("9999-01-01T00:00:00Z"))) {
    return "lifetime"
  }
  const plan = String(row.plan || "").trim().toLowerCase()
  if (plan === "weekly") return "weekly"
  if (plan === "monthly") return "monthly"
  if (plan === "yearly" || plan === "annual") return "annual"
  return "custom"
}

function renewalState(row: SubscriptionRow | null): "not_applicable" | "manual" | "auto_renew" | "cancel_at_period_end" {
  if (!row || planTerm(row) === "lifetime") return "not_applicable"
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {}
  if (metadata.cancel_at_period_end) return "cancel_at_period_end"
  if (metadata.auto_renew || row.provider_subscription_id) return "auto_renew"
  return "manual"
}

function entitlementResult(row: SubscriptionRow | null): "no_subscription" | "entitled" | "grace_period" | "payment_required" | "expired" | "suspended" | "policy_blocked" {
  const lifecycle = subscriptionLifecycle(row)
  if (!row || !lifecycle) return "no_subscription"
  if (lifecycle === "suspended") return "suspended"
  if (lifecycle === "past_due") return "payment_required"
  if (lifecycle === "expired" || lifecycle === "cancelled") return "expired"
  return "entitled"
}

function subscriptionProjection(row: SubscriptionRow | null) {
  return {
    existence: row ? "present" : "none",
    lifecycle: subscriptionLifecycle(row),
    plan_term: planTerm(row),
    renewal_state: renewalState(row),
    entitlement: entitlementResult(row),
    subscription_id: row?.id || null,
    plan: row?.plan || null,
    tier: row?.tier || null,
    expires_at: row?.expires_at || null,
    source: "supabase_account_subscriptions",
  }
}

function randomOtpCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  let value = 0
  for (const byte of bytes) value = (value << 8) + byte
  return String(Math.abs(value) % 1_000_000).padStart(6, "0")
}

function emailVerificationTtlMs(env: Env): number {
  const minutes = Number(String(env.EMAIL_VERIFICATION_CODE_TTL_MINUTES || "15").trim())
  return Math.max(5, Math.min(Number.isFinite(minutes) ? minutes : 15, 60)) * 60_000
}

function emailVerificationTestMode(env: Env): boolean {
  return String(env.APP_ENV || "").trim().toLowerCase() !== "production"
}

function emailVerificationPepper(env: Env): string {
  const pepper = String(env.EMAIL_VERIFICATION_PEPPER || "").trim()
  if (pepper) return pepper
  if (emailVerificationTestMode(env)) return "saturnws-local-email-verification-test-pepper"
  throw new Error("email_verification_not_configured")
}

async function hashEmailCode(env: Env, email: string, code: string): Promise<string> {
  return hmacSha256Hex(emailVerificationPepper(env), `${String(email || "").trim().toLowerCase()}:${String(code || "").trim()}`)
}

async function deliverEmailVerificationCode(
  env: Env,
  input: {
    email: string
    code: string
    expiresAt: string
    displayName?: string | null
    request: Request
    verificationId: string
    idempotencyKey: string
    resend?: boolean
  },
): Promise<{ transport: "test" | "email_operations" }> {
  if (emailVerificationTestMode(env) && String(env.EMAIL_VERIFICATION_TEST_TRANSPORT || "").trim() === "response") {
    return { transport: "test" }
  }
  if (String(env.EMAIL_AUTH_ENABLED || "").trim().toLowerCase() !== "true") {
    throw new Error("verification_delivery_disabled")
  }
  const url = String(env.AUTH_EMAIL_ENQUEUE_URL || "").trim()
  const token = String(env.AUTH_EMAIL_ENQUEUE_TOKEN || "").trim()
  if (!url || !token) throw new Error("verification_delivery_not_configured")
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
      "X-Request-Id": requestId(input.request),
    },
    body: JSON.stringify({
      event_type: input.resend ? "auth.verification_resend" : "auth.email_verification",
      idempotency_key: input.idempotencyKey,
      verification_request_id: input.verificationId,
      recipient: input.email,
      locale: "ar",
      payload: {
        code: input.code,
        display_name: input.displayName || null,
        expires_at: input.expiresAt,
      },
    }),
  })
  if (!response.ok) throw new Error(`verification_delivery_failed_${response.status}`)
  return { transport: "email_operations" }
}

async function auditEmailVerification(
  env: Env,
  input: {
    verificationId?: string | null
    firebaseUserId?: string | null
    email?: string | null
    action: string
    result: string
    request: Request
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  await insertEmailVerificationAudit(env, {
    verification_id: input.verificationId || null,
    firebase_user_id: input.firebaseUserId || null,
    email: input.email || null,
    action: input.action,
    result: input.result,
    requester_ip: input.request.headers.get("CF-Connecting-IP") || "unknown",
    user_agent: input.request.headers.get("User-Agent") || "",
    metadata: input.metadata || {},
  }).catch(() => undefined)
}

async function resolveEmailVerificationUser(
  request: Request,
  env: Env,
  body: Record<string, any> | null,
): Promise<{ userId: string | null; email: string; displayName?: string | null }> {
  const idToken = String(body?.id_token || "").trim()
  if (idToken) {
    const user = await verifyFirebaseUser(idToken, env)
    return { userId: user.userId, email: user.email, displayName: user.displayName }
  }
  if (emailVerificationTestMode(env) && String(env.EMAIL_VERIFICATION_ALLOW_UNAUTHENTICATED_TEST || "").trim() === "1") {
    const email = String(body?.email || "").trim().toLowerCase()
    if (!email || !email.includes("@")) throw new Error("email_required")
    return { userId: null, email }
  }
  throw new Error("auth_required")
}

async function handleEmailVerificationRequest(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const user = await resolveEmailVerificationUser(request, env, body)
  const canReturnTestCode = emailVerificationTestMode(env) && String(env.EMAIL_VERIFICATION_TEST_TRANSPORT || "").trim() === "response"
  if (!canReturnTestCode && String(env.EMAIL_AUTH_ENABLED || "").trim().toLowerCase() !== "true") {
    await auditEmailVerification(env, { firebaseUserId: user.userId, email: user.email, action: "request", result: "delivery_disabled", request })
    return errorJson(request, "VERIFICATION_DELIVERY_DISABLED", 503, true)
  }
  const ip = request.headers.get("CF-Connecting-IP") || "unknown"
  if (!allowRateLimit(`email-verification:ip:${ip}`, 20, 60_000) || !allowRateLimit(`email-verification:email:${user.email}`, 5, 60_000)) {
    return errorJson(request, "VERIFICATION_RATE_LIMITED", 429, true)
  }

  const now = Date.now()
  const expiresAt = new Date(now + emailVerificationTtlMs(env)).toISOString()
  const code = randomOtpCode()
  const codeHash = await hashEmailCode(env, user.email, code)
  const existing = await getLatestEmailVerification(env, {
    email: user.email,
    firebaseUserId: user.userId,
    purpose: "email_verification",
    status: "pending",
  })

  if (existing) {
    const lastSent = Date.parse(String(existing.last_sent_at || existing.created_at || ""))
    if (Number.isFinite(lastSent) && now - lastSent < 45_000) {
      await auditEmailVerification(env, { verificationId: existing.id, firebaseUserId: user.userId, email: user.email, action: "request", result: "rate_limited", request })
      return errorJson(request, "VERIFICATION_RATE_LIMITED", 429, true)
    }
    if (Number(existing.resend_count || 0) >= Number(existing.max_resends || 5)) {
      await updateEmailVerification(env, existing.id, { status: "blocked" }).catch(() => undefined)
      await auditEmailVerification(env, { verificationId: existing.id, firebaseUserId: user.userId, email: user.email, action: "request", result: "blocked", request })
      return errorJson(request, "VERIFICATION_RATE_LIMITED", 429, true)
    }
    const updated = await updateEmailVerification(env, existing.id, {
      code_hash: codeHash,
      attempts: 0,
      resend_count: Number(existing.resend_count || 0) + 1,
      expires_at: expiresAt,
      last_sent_at: new Date(now).toISOString(),
      status: "pending",
      firebase_user_id: user.userId,
      metadata: { transport: emailVerificationTestMode(env) ? "test" : "provider_pending" },
    })
    try {
      const delivery = await deliverEmailVerificationCode(env, {
        email: user.email,
        code,
        expiresAt,
        displayName: user.displayName,
        request,
        verificationId: updated.id,
        idempotencyKey: `auth-email-verification:${updated.id}:${Number(updated.resend_count || 0)}`,
        resend: true,
      })
      await updateEmailVerification(env, updated.id, { metadata: { ...(updated.metadata || {}), transport: delivery.transport } }).catch(() => undefined)
    } catch (error) {
      await updateEmailVerification(env, updated.id, { status: "delivery_failed", metadata: { ...(updated.metadata || {}), delivery_error: String(error instanceof Error ? error.message : error || "delivery_failed") } }).catch(() => undefined)
      await auditEmailVerification(env, { verificationId: updated.id, firebaseUserId: user.userId, email: user.email, action: "request", result: "delivery_failed", request })
      return errorJson(request, String(error instanceof Error && error.message === "verification_delivery_not_configured" ? "VERIFICATION_DELIVERY_NOT_CONFIGURED" : "VERIFICATION_DELIVERY_FAILED"), 502, true)
    }
    await auditEmailVerification(env, { verificationId: updated.id, firebaseUserId: user.userId, email: user.email, action: "request", result: "sent", request })
    return json({
      success: true,
      status: "sent",
      expires_at: updated.expires_at,
      ...(emailVerificationTestMode(env) && String(env.EMAIL_VERIFICATION_TEST_TRANSPORT || "").trim() === "response" ? { test_code: code } : {}),
    })
  }

  const created = await createEmailVerification(env, {
    firebase_user_id: user.userId,
    email: user.email,
    code_hash: codeHash,
    purpose: "email_verification",
    status: "pending",
    expires_at: expiresAt,
    requester_ip: ip,
    user_agent: request.headers.get("User-Agent") || "",
    metadata: { transport: emailVerificationTestMode(env) ? "test" : "provider_pending" },
  })
  try {
    const delivery = await deliverEmailVerificationCode(env, {
      email: user.email,
      code,
      expiresAt,
      displayName: user.displayName,
      request,
      verificationId: created.id,
      idempotencyKey: `auth-email-verification:${created.id}:0`,
    })
    await updateEmailVerification(env, created.id, { metadata: { ...(created.metadata || {}), transport: delivery.transport } }).catch(() => undefined)
  } catch (error) {
    await updateEmailVerification(env, created.id, { status: "delivery_failed", metadata: { ...(created.metadata || {}), delivery_error: String(error instanceof Error ? error.message : error || "delivery_failed") } }).catch(() => undefined)
    await auditEmailVerification(env, { verificationId: created.id, firebaseUserId: user.userId, email: user.email, action: "request", result: "delivery_failed", request })
    return errorJson(request, String(error instanceof Error && error.message === "verification_delivery_not_configured" ? "VERIFICATION_DELIVERY_NOT_CONFIGURED" : "VERIFICATION_DELIVERY_FAILED"), 502, true)
  }
  await auditEmailVerification(env, { verificationId: created.id, firebaseUserId: user.userId, email: user.email, action: "request", result: "sent", request })
  return json({
    success: true,
    status: "sent",
    expires_at: created.expires_at,
    ...(emailVerificationTestMode(env) && String(env.EMAIL_VERIFICATION_TEST_TRANSPORT || "").trim() === "response" ? { test_code: code } : {}),
  })
}

async function handleEmailVerificationVerify(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const user = await resolveEmailVerificationUser(request, env, body)
  const code = String(body?.code || "").replace(/\D/g, "").slice(0, 6)
  if (code.length !== 6) return errorJson(request, "VERIFICATION_CODE_INVALID", 400)
  const row = await getLatestEmailVerification(env, {
    email: user.email,
    firebaseUserId: user.userId,
    purpose: "email_verification",
    status: "pending",
  })
  if (!row) return errorJson(request, "VERIFICATION_CODE_INVALID", 404)
  if (Date.parse(String(row.expires_at || "")) <= Date.now()) {
    await updateEmailVerification(env, row.id, { status: "expired" }).catch(() => undefined)
    await auditEmailVerification(env, { verificationId: row.id, firebaseUserId: user.userId, email: user.email, action: "verify", result: "expired", request })
    return errorJson(request, "VERIFICATION_CODE_EXPIRED", 410)
  }
  if (Number(row.attempts || 0) >= Number(row.max_attempts || 6)) {
    await updateEmailVerification(env, row.id, { status: "blocked" }).catch(() => undefined)
    await auditEmailVerification(env, { verificationId: row.id, firebaseUserId: user.userId, email: user.email, action: "verify", result: "blocked", request })
    return errorJson(request, "VERIFICATION_RATE_LIMITED", 429, true)
  }
  const expected = String(row.code_hash || "")
  const actual = await hashEmailCode(env, user.email, code)
  if (!timingSafeEqualHex(expected, actual)) {
    const attempts = Number(row.attempts || 0) + 1
    await updateEmailVerification(env, row.id, { attempts, status: attempts >= Number(row.max_attempts || 6) ? "blocked" : "pending" }).catch(() => undefined)
    await auditEmailVerification(env, { verificationId: row.id, firebaseUserId: user.userId, email: user.email, action: "verify", result: "invalid", request })
    return errorJson(request, "VERIFICATION_CODE_INVALID", 400)
  }
  const verifiedAt = new Date().toISOString()
  await updateEmailVerification(env, row.id, { status: "verified", verified_at: verifiedAt, consumed_at: verifiedAt })
  await markAccountProfileEmailVerified(env, user.userId, user.email, "saturnws_otp").catch(() => undefined)
  await auditEmailVerification(env, { verificationId: row.id, firebaseUserId: user.userId, email: user.email, action: "verify", result: "verified", request })
  return json({ success: true, status: "verified", verified_at: verifiedAt })
}

async function handleEmailVerificationStatus(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const user = await resolveEmailVerificationUser(request, env, body)
  const row = await getLatestEmailVerification(env, { email: user.email, firebaseUserId: user.userId, purpose: "email_verification" })
  return json({
    success: true,
    status: row?.status || "unverified",
    verified: row?.status === "verified",
    expires_at: row?.expires_at || null,
    attempts: row?.attempts || 0,
  })
}

function mapFirebasePasswordError(message: string): string {
  const code = String(message || "").trim().toUpperCase()
  switch (code) {
    case "EMAIL_EXISTS":
      return "email_already_exists"
    case "EMAIL_NOT_FOUND":
    case "INVALID_PASSWORD":
    case "INVALID_LOGIN_CREDENTIALS":
    case "INVALID_EMAIL":
      return "invalid_credentials"
    case "USER_DISABLED":
      return "account_disabled"
    case "TOO_MANY_ATTEMPTS_TRY_LATER":
      return "rate_limited"
    case "OPERATION_NOT_ALLOWED":
      return "password_auth_disabled"
    case "WEAK_PASSWORD : PASSWORD SHOULD BE AT LEAST 6 CHARACTERS":
    case "WEAK_PASSWORD":
      return "weak_password"
    default:
      return "firebase_password_auth_failed"
  }
}

async function authenticateFirebasePassword(
  env: Env,
  email: string,
  password: string,
  mode: "login" | "signup",
): Promise<{ userId: string; email: string }> {
  const apiKey = String(env.FIREBASE_WEB_API_KEY || "").trim()
  if (!apiKey) throw new Error("firebase_not_configured")

  const endpoint =
    mode === "signup"
      ? "https://identitytoolkit.googleapis.com/v1/accounts:signUp"
      : "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
  const response = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      email: String(email || "").trim().toLowerCase(),
      password: String(password || ""),
      returnSecureToken: true,
    }),
  })
  const payload = await response.json<any>().catch(() => null)
  if (!response.ok) {
    throw new Error(mapFirebasePasswordError(String(payload?.error?.message || "")))
  }
  const userId = String(payload?.localId || "").trim()
  const normalizedEmail = String(payload?.email || email || "").trim().toLowerCase()
  if (!userId || !normalizedEmail) {
    throw new Error("firebase_password_auth_failed")
  }
  return { userId, email: normalizedEmail }
}

async function authorizePendingDeviceLogin(
  env: Env,
  pending: any,
  firebaseUser: {
    userId: string
    email: string
    displayName?: string | null
    photoUrl?: string | null
    authProvider?: string | null
  },
): Promise<{ success: true; subscription: any; runtime: Record<string, unknown> } | { success: false; error: string; status: number }> {
  const subscription = await getActiveSubscriptionForUser(env, firebaseUser.userId, firebaseUser.email)
  const subscriptionError = isActiveUsableSubscription(subscription)
  if (subscriptionError || !subscription) {
    const error = subscriptionError === "subscription_not_found" ? "subscription_required" : subscriptionError
    await updateDeviceLogin(env, pending.id, {
      status: error,
      user_id: firebaseUser.userId,
      user_email: firebaseUser.email,
      metadata: {
        ...(typeof pending?.metadata === "object" && pending?.metadata ? pending.metadata : {}),
        display_name: firebaseUser.displayName || null,
        avatar_url: firebaseUser.photoUrl || null,
        auth_provider: firebaseUser.authProvider || null,
      },
    })
    return { success: false, error, status: 403 }
  }

  const subscriptionUserId = String(subscription.firebase_user_id || "").trim()
  const subscriptionEmail = String(subscription.user_email || "").trim().toLowerCase()
  if (subscriptionUserId && subscriptionUserId !== firebaseUser.userId) {
    await updateDeviceLogin(env, pending.id, {
      status: "subscription_user_mismatch",
      user_id: firebaseUser.userId,
      user_email: firebaseUser.email,
      subscription_id: subscription.id,
      metadata: {
        ...(typeof pending?.metadata === "object" && pending?.metadata ? pending.metadata : {}),
        display_name: firebaseUser.displayName || null,
        avatar_url: firebaseUser.photoUrl || null,
        auth_provider: firebaseUser.authProvider || null,
      },
    })
    return { success: false, error: "subscription_user_mismatch", status: 403 }
  }
  if (subscriptionEmail && subscriptionEmail !== firebaseUser.email) {
    await updateDeviceLogin(env, pending.id, {
      status: "subscription_email_mismatch",
      user_id: firebaseUser.userId,
      user_email: firebaseUser.email,
      subscription_id: subscription.id,
      metadata: {
        ...(typeof pending?.metadata === "object" && pending?.metadata ? pending.metadata : {}),
        display_name: firebaseUser.displayName || null,
        avatar_url: firebaseUser.photoUrl || null,
        auth_provider: firebaseUser.authProvider || null,
      },
    })
    return { success: false, error: "subscription_email_mismatch", status: 403 }
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
    metadata: {
      ...(typeof pending?.metadata === "object" && pending?.metadata ? pending.metadata : {}),
      display_name: firebaseUser.displayName || null,
      avatar_url: firebaseUser.photoUrl || null,
      auth_provider: firebaseUser.authProvider || null,
    },
  })
  const runtime = buildSubscriptionRuntime(
    {
      ...attached,
      metadata: {
        ...(typeof attached?.metadata === "object" && attached?.metadata ? attached.metadata : {}),
        display_name: firebaseUser.displayName || null,
        avatar_url: firebaseUser.photoUrl || null,
        auth_provider: firebaseUser.authProvider || null,
      },
    },
    "authorized",
  )
  return { success: true, subscription: attached, runtime }
}

async function issueDesktopSession(
  env: Env,
  pending: any,
  subscription: any,
  user: {
    userId: string
    email: string
    displayName?: string | null
    photoUrl?: string | null
    authProvider?: string | null
  },
): Promise<Response> {
  try {
    const sessionToken = `stk_${randomBase64Url(32)}`
    const tokenHash = await sha256Hex(sessionToken)
    const sessionExpiresAt = String(subscription.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
    await revokeActiveAppSessionsForSubscription(env, subscription.id)
    await createAppSession(env, {
      session_token_hash: tokenHash,
      user_id: user.userId,
      user_email: user.email,
      subscription_id: subscription.id,
      hwid: pending.hwid,
      expires_at: sessionExpiresAt,
      metadata: {
        display_name: user.displayName || null,
        avatar_url: user.photoUrl || null,
        auth_provider: user.authProvider || null,
      },
    })
    await updateDeviceLogin(env, pending.id, {
      status: "consumed",
      consumed_at: new Date().toISOString(),
      subscription_id: subscription.id,
      user_id: user.userId,
      user_email: user.email,
    })
    const runtime = buildSubscriptionRuntime(
      {
        ...subscription,
        metadata: {
          ...(typeof subscription?.metadata === "object" && subscription?.metadata ? subscription.metadata : {}),
          display_name: user.displayName || null,
          avatar_url: user.photoUrl || null,
          auth_provider: user.authProvider || null,
        },
      },
      "verified",
    )
    return json({
      success: true,
      status: "authorized",
      session_token: sessionToken,
      user_email: user.email,
      display_name: user.displayName || null,
      avatar_url: user.photoUrl || null,
      auth_provider: user.authProvider || null,
      subscription: runtime,
      license: runtime,
    })
  } catch (error: any) {
    await updateDeviceLogin(env, pending.id, {
      status: "session_store_failed",
      subscription_id: subscription?.id || pending?.subscription_id || null,
      user_id: user.userId,
      user_email: user.email,
      metadata: {
        ...(typeof pending?.metadata === "object" && pending?.metadata ? pending.metadata : {}),
        session_store_error: String(error?.message || error || "session_store_failed"),
      },
    }).catch(() => undefined)
    return json({ success: false, error: "session_store_failed" }, 500)
  }
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
  const subscriptionId = String(session.subscription_id || session.license_id || "").trim()
  if (!subscriptionId) return { session, subscription: null, error: "subscription_missing" }
  let subscription = await getSubscriptionById(env, subscriptionId)
  let subscriptionError = isActiveUsableSubscription(subscription)
  if (subscriptionError || !subscription) {
    const replacement = await getActiveSubscriptionForUser(
      env,
      String(session.user_id || subscription?.firebase_user_id || ""),
      String(session.user_email || subscription?.user_email || ""),
    )
    const replacementError = isActiveUsableSubscription(replacement)
    if (!replacement || replacementError) {
      return { session, subscription, error: subscriptionError || replacementError || "subscription_not_found" }
    }
    if (replacement.hwid && replacement.hwid !== hwid) {
      return { session, subscription: replacement, error: "subscription_hwid_mismatch" }
    }
    const nextSessionExpiry = String(replacement.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
    await updateAppSessionSubscription(env, session.id, replacement.id, nextSessionExpiry)
    session.subscription_id = replacement.id
    session.license_id = null
    session.expires_at = nextSessionExpiry
    subscription = replacement
    subscriptionError = ""
  }
  if (subscription?.hwid && subscription.hwid !== hwid) return { session, subscription, error: "subscription_hwid_mismatch" }
  if (isIsoExpired(session.expires_at)) {
    const nextSessionExpiry = String(subscription.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
    await updateAppSessionExpiry(env, session.id, nextSessionExpiry)
    session.expires_at = nextSessionExpiry
  }
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

  const authorization = await authorizePendingDeviceLogin(env, pending, firebaseUser)
  if (!authorization.success) {
    return json({ success: false, error: authorization.error }, authorization.status)
  }
  return json({
    success: true,
    status: "authorized",
    user_email: firebaseUser.email,
    display_name: firebaseUser.displayName || null,
    avatar_url: firebaseUser.photoUrl || null,
    auth_provider: firebaseUser.authProvider || null,
    subscription: authorization.runtime,
    license: authorization.runtime,
  })
}

async function handleDevicePasswordComplete(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const deviceCode = String(body?.device_code || "").trim()
  const email = String(body?.email || "").trim().toLowerCase()
  const password = String(body?.password || "")
  const mode = String(body?.mode || "login").trim().toLowerCase() === "signup" ? "signup" : "login"
  if (!deviceCode || !email || !password) {
    return json({ success: false, error: "missing_password_auth_fields" }, 400)
  }
  if (password.length < 6) {
    return json({ success: false, error: "weak_password" }, 400)
  }

  const pending = await getDeviceLoginByCode(env, deviceCode)
  if (!pending) return json({ success: false, error: "device_code_not_found" }, 404)
  if (isIsoExpired(pending.expires_at)) {
    await updateDeviceLogin(env, pending.id, { status: "expired" })
    return json({ success: false, error: "device_code_expired" }, 410)
  }

  let firebaseUser: { userId: string; email: string }
  try {
    firebaseUser = await authenticateFirebasePassword(env, email, password, mode)
  } catch (error: any) {
    return json({ success: false, error: String(error?.message || "firebase_password_auth_failed") }, 401)
  }

  const authorization = await authorizePendingDeviceLogin(env, pending, firebaseUser)
  if (!authorization.success) {
    return json({ success: false, error: authorization.error }, authorization.status)
  }

  return await issueDesktopSession(env, pending, authorization.subscription, firebaseUser)
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
  return await issueDesktopSession(env, row, subscription, {
    userId: String(row.user_id || ""),
    email: String(row.user_email || ""),
    displayName: String(row.metadata?.display_name || row.user_email || "").trim() || null,
    photoUrl: String(row.metadata?.avatar_url || "").trim() || null,
    authProvider: String(row.metadata?.auth_provider || "").trim() || null,
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
    ...buildSubscriptionRuntime(
      {
        ...resolved.subscription,
        metadata: {
          ...(typeof resolved.subscription?.metadata === "object" && resolved.subscription?.metadata
            ? resolved.subscription.metadata
            : {}),
          ...(typeof resolved.session?.metadata === "object" && resolved.session?.metadata ? resolved.session.metadata : {}),
        },
      },
      "verified",
    ),
    user_email: resolved.session.user_email,
    display_name: resolved.session.metadata?.display_name || null,
    avatar_url: resolved.session.metadata?.avatar_url || null,
    auth_provider: resolved.session.metadata?.auth_provider || null,
    session_expires_at: resolved.session.expires_at,
  })
}

async function handleSessionLogout(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const sessionToken = String(body?.session_token || "").trim()
  if (sessionToken) await revokeAppSession(env, await sha256Hex(sessionToken))
  return json({ success: true })
}

async function handleAccountProvision(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const idToken = String(body?.id_token || "").trim()
  if (!idToken) return errorJson(request, "AUTH_SESSION_EXPIRED", 401, true)
  const firebaseUser = await verifyFirebaseUser(idToken, env)
  const termsAccepted = Boolean(body?.terms_accepted || body?.termsAccepted)
  const existing = await getAccountProfileByFirebaseUid(env, firebaseUser.userId).catch(() => null)
  if (!existing && !termsAccepted) {
    return errorJson(request, "PROFILE_TERMS_REQUIRED", 400, false, { terms: "required" })
  }
  const profile = await provisionProfile(env, firebaseUser, {
    displayName: String(body?.display_name || body?.displayName || "").trim() || null,
    locale: normalizeLocale(body?.locale, env),
    termsAccepted,
    termsVersion: normalizeTermsVersion(body?.terms_version || body?.termsVersion, env),
    termsAcceptedAt: String(body?.terms_accepted_at || body?.termsAcceptedAt || "").trim() || null,
  })
  return json({
    success: true,
    profile: profileProjection(profile, firebaseUser),
    profile_state: profile.account_status === "active" ? "ready" : profile.account_status === "suspended" ? "disabled" : "ready",
    email_verification_state: profile.email_verified ? "verified" : "unverified",
  })
}

async function handleAccountSubscription(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const idToken = String(body?.id_token || "").trim()
  if (!idToken) return json({ success: false, error: "missing_id_token" }, 400)
  const firebaseUser = await verifyFirebaseUser(idToken, env)
  const profile = await provisionProfile(env, firebaseUser).catch(() => null)
  const subscription = await getLatestSubscriptionForUser(env, firebaseUser.userId, firebaseUser.email)
  const projection = subscriptionProjection(subscription)
  const subscriptionError = isActiveUsableSubscription(subscription)
  return json({
    success: true,
    user: {
      id: firebaseUser.userId,
      email: firebaseUser.email,
      display_name: firebaseUser.displayName || null,
      avatar_url: firebaseUser.photoUrl || null,
      auth_provider: firebaseUser.authProvider || null,
      profile: profile ? profileProjection(profile, firebaseUser) : null,
    },
    subscription: subscription && !subscriptionError ? {
      ...buildSubscriptionRuntime(subscription, "verified"),
      lifecycle: projection.lifecycle,
      entitlement: projection.entitlement,
      plan_term: projection.plan_term,
      renewal_state: projection.renewal_state,
    } : null,
    subscription_projection: projection,
    status: projection.entitlement === "entitled" ? "active" : projection.entitlement,
  })
}

async function handleAccountIdentity(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const idToken = String(body?.id_token || "").trim()
  if (!idToken) return json({ success: false, error: "missing_id_token" }, 400)
  const firebaseUser = await verifyFirebaseUser(idToken, env)
  const profile = await provisionProfile(env, firebaseUser).catch(() => null)
  return json({
    success: true,
    user: {
      id: firebaseUser.userId,
      email: firebaseUser.email,
      display_name: firebaseUser.displayName || null,
      avatar_url: firebaseUser.photoUrl || null,
      auth_provider: firebaseUser.authProvider || null,
      profile: profile ? profileProjection(profile, firebaseUser) : null,
    },
  })
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    const apiPath = normalizeApiPath(url.pathname)
    const cors = corsHeaders(env, request)
    const isFirebaseHelperPath = url.pathname === "/__/firebase/init.json" || url.pathname.startsWith("/__/")

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors })
    }

    try {
      if (isFirebaseHelperPath) {
        return await proxyFirebaseAuthHelper(request, env)
      }
      if (request.method === "POST" && apiPath === "/verify") {
        const res = await handleVerify(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/device/start") {
        const res = await handleDeviceStart(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/device/complete") {
        const res = await handleDeviceComplete(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/device/password-complete") {
        const res = await handleDevicePasswordComplete(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/device/poll") {
        const res = await handleDevicePoll(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/session/verify") {
        const res = await handleSessionVerify(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/session/logout") {
        const res = await handleSessionLogout(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/account/subscription") {
        const res = await handleAccountSubscription(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/account/provision") {
        const res = await handleAccountProvision(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/account/identity") {
        const res = await handleAccountIdentity(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/email-verification/request") {
        const res = await handleEmailVerificationRequest(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/email-verification/verify") {
        const res = await handleEmailVerificationVerify(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/email-verification/status") {
        const res = await handleEmailVerificationStatus(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "GET" && apiPath === "/oauth/google-drive-config") {
        const res = await handleGoogleDriveOAuthConfig(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "GET" && apiPath === "/health") {
        return json({ success: true, service: "auth-worker", at: Date.now() }, 200, cors)
      }
      return json({ success: false, error: "not_found" }, 404, cors)
    } catch (err: any) {
      console.error("auth_worker_unhandled_error", {
        message: String(err?.message || err || "error"),
        stack: String(err?.stack || ""),
      })
      return json({ success: false, error: "internal_error", message: "Internal server error" }, 500, cors)
    }
  },
} satisfies ExportedHandler<Env>
