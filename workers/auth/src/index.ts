import { hmacSha256Hex, randomBase64Url, randomUserCode, sha256Hex, timingSafeEqualHex } from "./lib/crypto"
import { allowRateLimit } from "./lib/rateLimit"
import { desktopEntitlementFromProjection, resolveSubscriptionTruth } from "../../shared/subscriptions/resolver.js"
import {
  createAppSession,
  createDeviceLogin,
  createEmailVerification,
  authorizePendingDeviceLoginRow,
  claimAuthorizedDeviceLogin,
  getAccountProfileByFirebaseUid,
  getAppSessionByHash,
  getAppSessionByIdForUser,
  getDeviceLoginByCode,
  getLatestEmailVerification,
  getPendingDeviceLoginByUserCode,
  getSubscriptionRowsForUser,
  insertEmailVerificationAudit,
  listAppSessionsForUser,
  markAccountProfileEmailVerified,
  updateAccountProfileStatus,
  getAccountDeletionRequest,
  createAccountDeletionRequest,
  cancelAccountDeletionRequest,
  revokeAppSession,
  revokeAppSessionByIdForUser,
  revokeAppSessionsForDevice,
  revokeAppSessionsForUser,
  rotateAppSessionToken,
  touchAppSession,
  upsertAccountProfile,
  updateDeviceLogin,
  updateEmailVerification,
} from "./lib/supabase"
import { isIsoExpired, isValidHwid, normalizeHwid } from "./lib/validators"
import type { AccountProfileRow, AppSessionRow, Env, SubscriptionRow } from "./types"

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

type AccountConnectionState = "signed_out" | "link_pending" | "linked" | "session_expired" | "revoked" | "offline" | "error"
type DesktopEntitlementState = "unknown" | "no_subscription" | "active" | "trial" | "grace" | "expired" | "suspended" | "lifetime"
type SubscriptionResolution = ReturnType<typeof resolveSubscriptionTruth<SubscriptionRow>>

function appSessionTtlMs(env: Env): number {
  const configuredDays = Number(String(env.APP_SESSION_TTL_DAYS || "30").trim())
  const days = Math.max(1, Math.min(Number.isFinite(configuredDays) ? configuredDays : 30, 90))
  return days * 24 * 60 * 60 * 1000
}

function entitlementAllowsPaidAccess(state: DesktopEntitlementState): boolean {
  return state === "active" || state === "trial" || state === "grace" || state === "lifetime"
}

function resolveRowsForUser(rows: SubscriptionRow[], userId: string, email: string): SubscriptionResolution {
  return resolveSubscriptionTruth<SubscriptionRow>(rows, { firebaseUid: userId, email })
}

async function resolveUserSubscription(env: Env, userId: string, email: string): Promise<SubscriptionResolution> {
  const rows = await getSubscriptionRowsForUser(env, userId, email)
  return resolveRowsForUser(rows, userId, email)
}

function buildSubscriptionRuntime(
  resolutionOrRow: SubscriptionResolution | SubscriptionRow | null,
  status: string,
  user: { userId?: string | null; email?: string | null; displayName?: string | null; photoUrl?: string | null; authProvider?: string | null } = {},
): Record<string, unknown> {
  const resolution = resolutionOrRow && "projection" in resolutionOrRow
    ? resolutionOrRow as SubscriptionResolution
    : resolveRowsForUser(resolutionOrRow ? [resolutionOrRow as SubscriptionRow] : [], String(user.userId || ""), String(user.email || ""))
  const row = resolution.currentRow
  const projection = resolution.projection
  const projectionRecord = projection as Record<string, any>
  const tier = row ? (String(row.tier || "public").trim().toLowerCase() === "private" ? "private" : "public") : null
  const featurePayload = row?.feature_payload && typeof row.feature_payload === "object" ? row.feature_payload : {}
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {}
  const entitlementState = desktopEntitlementFromProjection(projection) as DesktopEntitlementState
  return {
    success: true,
    status,
    connection_state: "linked" satisfies AccountConnectionState,
    entitlement_state: entitlementState,
    entitlement: projection,
    tier,
    subscription_id: projectionRecord.subscription_id || null,
    license_id: projectionRecord.subscription_id || null,
    user_id: user.userId || row?.firebase_user_id || null,
    user_email: user.email || row?.user_email || null,
    display_name: user.displayName || metadata.display_name || null,
    avatar_url: user.photoUrl || metadata.avatar_url || null,
    auth_provider: user.authProvider || metadata.auth_provider || null,
    plan: projectionRecord.plan || null,
    expires_at: projectionRecord.expires_at || null,
    runtime_payload: tier === "private" ? featurePayload : {},
    policy: {
      allow: entitlementAllowsPaidAccess(entitlementState),
      allow_offline: entitlementAllowsPaidAccess(entitlementState),
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
  const status = String(row.status || "").trim().toLowerCase()
  const expiresAt = Date.parse(String(row.expires_at || ""))
  const lifetime = Number.isFinite(expiresAt) && expiresAt >= Date.parse("9999-01-01T00:00:00Z")
  if (status === "suspended") return "subscription_inactive"
  if ((status === "expired" || isIsoExpired(row.expires_at || null)) && !lifetime) return "subscription_expired"
  if (!["active", "trialing", "trial", "past_due", "cancelled", "canceled"].includes(status)) return "subscription_inactive"
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
    userId?: string | null
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
      user_id: input.userId || null,
      purpose: "email_verification",
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

function cleanOperationalText(value: unknown, max = 160): string {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
}

function accountPortalUrl(env: Env): string {
  const raw = String(env.DEVICE_LOGIN_URL || "https://saturnws.com/account/signin").trim()
  try {
    const parsed = new URL(raw)
    return `${parsed.origin}/account`
  } catch {
    return "https://saturnws.com/account"
  }
}

async function enqueueSecurityEmail(
  env: Env,
  input: {
    eventType: string
    idempotencyKey: string
    recipient?: string | null
    userId?: string | null
    locale?: string | null
    payload?: Record<string, unknown>
  },
): Promise<{ queued: boolean; skipped?: string }> {
  if (String(env.EMAIL_SECURITY_ENABLED || "").trim().toLowerCase() !== "true") return { queued: false, skipped: "security_email_disabled" }
  const url = String(env.AUTH_EMAIL_ENQUEUE_URL || "").trim()
  const token = String(env.AUTH_EMAIL_ENQUEUE_TOKEN || "").trim()
  const recipient = String(input.recipient || "").trim().toLowerCase()
  const eventType = cleanOperationalText(input.eventType, 120)
  const idempotencyKey = cleanOperationalText(input.idempotencyKey, 220)
  if (!url || !token) return { queued: false, skipped: "security_email_not_configured" }
  if (!recipient || !recipient.includes("@") || !eventType || !idempotencyKey) return { queued: false, skipped: "security_email_invalid_input" }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      event_type: eventType,
      idempotency_key: idempotencyKey,
      user_id: input.userId || null,
      recipient,
      locale: String(input.locale || "ar").toLowerCase().startsWith("en") ? "en" : "ar",
      payload: {
        ...(input.payload || {}),
        action_url: accountPortalUrl(env),
        occurred_at: new Date().toISOString(),
      },
    }),
  })
  if (!response.ok) return { queued: false, skipped: `security_email_enqueue_${response.status}` }
  const payload = (await response.json().catch(() => ({}))) as { job_id?: string | null }
  return { queued: Boolean(payload.job_id), skipped: payload.job_id ? undefined : "security_email_suppressed" }
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

function emailVerificationResolveError(request: Request, error: unknown): Response | null {
  const code = String(error instanceof Error ? error.message : error || "").trim()
  if (code === "email_required") {
    return errorJson(request, "EMAIL_REQUIRED", 400, false, { email: "required" })
  }
  if (code === "auth_required" || code === "firebase_token_invalid") {
    return errorJson(request, "AUTH_SESSION_EXPIRED", 401, true)
  }
  if (code === "firebase_not_configured") {
    return errorJson(request, "AUTH_PROVIDER_UNAVAILABLE", 503, true)
  }
  return null
}

async function handleEmailVerificationRequest(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const user = await resolveEmailVerificationUser(request, env, body).catch((error) => {
    const response = emailVerificationResolveError(request, error)
    if (response) return response
    throw error
  })
  if (user instanceof Response) return user
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
        userId: user.userId,
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
      userId: user.userId,
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
  const user = await resolveEmailVerificationUser(request, env, body).catch((error) => {
    const response = emailVerificationResolveError(request, error)
    if (response) return response
    throw error
  })
  if (user instanceof Response) return user
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
  const user = await resolveEmailVerificationUser(request, env, body).catch((error) => {
    const response = emailVerificationResolveError(request, error)
    if (response) return response
    throw error
  })
  if (user instanceof Response) return user
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
    emailVerified?: boolean
    displayName?: string | null
    photoUrl?: string | null
    authProvider?: string | null
    authProviders?: string[]
  },
): Promise<{ success: true; subscription: SubscriptionRow | null; subscriptionResolution: SubscriptionResolution; runtime: Record<string, unknown> } | { success: false; error: string; status: number }> {
  if (String(pending?.status || "").trim().toLowerCase() !== "pending") {
    return { success: false, error: "device_code_already_used", status: 409 }
  }

  const profile = await provisionProfile(env, {
    userId: firebaseUser.userId,
    email: firebaseUser.email,
    emailVerified: Boolean(firebaseUser.emailVerified),
    displayName: firebaseUser.displayName || null,
    photoUrl: firebaseUser.photoUrl || null,
    authProvider: firebaseUser.authProvider || null,
    authProviders: firebaseUser.authProviders?.length ? firebaseUser.authProviders : firebaseUser.authProvider ? [firebaseUser.authProvider] : [],
  })
  if (["suspended", "pending_deletion", "deleted"].includes(String(profile.account_status || "").trim().toLowerCase())) {
    return { success: false, error: "account_disabled", status: 403 }
  }

  const subscriptionResolution = await resolveUserSubscription(env, firebaseUser.userId, firebaseUser.email)
  const subscription = subscriptionResolution.currentRow
  const authorized = await authorizePendingDeviceLoginRow(env, pending.id, {
    user_id: firebaseUser.userId,
    user_email: firebaseUser.email,
    subscription_id: subscription?.id || null,
    license_id: null,
    authorized_at: new Date().toISOString(),
    metadata: {
      ...(typeof pending?.metadata === "object" && pending?.metadata ? pending.metadata : {}),
      display_name: firebaseUser.displayName || null,
      avatar_url: firebaseUser.photoUrl || null,
      auth_provider: firebaseUser.authProvider || null,
    },
  })
  if (!authorized) return { success: false, error: "device_code_already_used", status: 409 }
  const runtime = buildSubscriptionRuntime(subscriptionResolution, "authorized", firebaseUser)
  return { success: true, subscription, subscriptionResolution, runtime }
}

async function issueDesktopSession(
  env: Env,
  pending: any,
  subscription: SubscriptionRow | null,
  subscriptionResolution: SubscriptionResolution | null,
  user: {
    userId: string
    email: string
    displayName?: string | null
    photoUrl?: string | null
    authProvider?: string | null
  },
): Promise<Response> {
  const claimed = await claimAuthorizedDeviceLogin(env, pending.id)
  if (!claimed) return json({ success: false, error: "device_code_already_used" }, 409)
  pending = claimed
  try {
    const sessionToken = `stk_${randomBase64Url(32)}`
    const tokenHash = await sha256Hex(sessionToken)
    const sessionExpiresAt = new Date(Date.now() + appSessionTtlMs(env)).toISOString()
    await createAppSession(env, {
      session_token_hash: tokenHash,
      user_id: user.userId,
      user_email: user.email,
      subscription_id: subscription?.id || null,
      hwid: pending.hwid,
      expires_at: sessionExpiresAt,
      metadata: {
        display_name: user.displayName || null,
        avatar_url: user.photoUrl || null,
        auth_provider: user.authProvider || null,
        device_name: String(pending?.metadata?.device_name || "").trim() || null,
        platform: String(pending?.metadata?.platform || "").trim() || null,
        os_version: String(pending?.metadata?.os_version || "").trim() || null,
        app_version: String(pending?.metadata?.app_version || "").trim() || null,
      },
    })
    await updateDeviceLogin(env, pending.id, {
      status: "consumed",
      subscription_id: subscription?.id || null,
      user_id: user.userId,
      user_email: user.email,
    })
    await enqueueSecurityEmail(env, {
      eventType: "security.new_login",
      idempotencyKey: `security-new-login:${pending.id}`,
      recipient: user.email,
      userId: user.userId,
      payload: {
        device_name: cleanOperationalText(pending?.metadata?.device_name || pending.hwid || "Desktop device", 120),
        platform: cleanOperationalText(pending?.metadata?.platform || "", 80),
        os_version: cleanOperationalText(pending?.metadata?.os_version || "", 80),
        app_version: cleanOperationalText(pending?.metadata?.app_version || "", 80),
      },
    }).catch(() => ({ queued: false }))
    const runtime = buildSubscriptionRuntime(subscriptionResolution || subscription, "verified", user)
    return json({
      success: true,
      status: "authorized",
      session_token: sessionToken,
      user_email: user.email,
      display_name: user.displayName || null,
      avatar_url: user.photoUrl || null,
      auth_provider: user.authProvider || null,
      connection_state: "linked",
      entitlement_state: runtime.entitlement_state,
      entitlement: runtime.entitlement,
      subscription: subscription ? runtime : null,
      license: subscription ? runtime : null,
      session_expires_at: sessionExpiresAt,
    })
  } catch (error: any) {
    await updateDeviceLogin(env, pending.id, {
      status: "authorized",
      consumed_at: null,
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
): Promise<{ session: any; subscription: SubscriptionRow | null; subscriptionResolution: SubscriptionResolution | null; error?: string }> {
  const tokenHash = await sha256Hex(sessionToken)
  const session = await getAppSessionByHash(env, tokenHash)
  if (!session) return { session: null, subscription: null, subscriptionResolution: null, error: "session_not_found" }
  if (session.revoked_at) return { session, subscription: null, subscriptionResolution: null, error: "session_revoked" }
  if (session.hwid !== hwid) return { session, subscription: null, subscriptionResolution: null, error: "session_hwid_mismatch" }
  if (isIsoExpired(session.expires_at)) {
    return { session, subscription: null, subscriptionResolution: null, error: "session_expired" }
  }
  const subscriptionResolution = await resolveUserSubscription(env, String(session.user_id || ""), String(session.user_email || ""))
  return { session, subscription: subscriptionResolution.currentRow, subscriptionResolution }
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
      device_name: String(body?.device_name || "").trim().slice(0, 120) || null,
      platform: String(body?.platform || "").trim().slice(0, 80) || null,
      os_version: String(body?.os_version || "").trim().slice(0, 160) || null,
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
  if (String(pending.status || "").trim().toLowerCase() !== "pending") {
    return json({ success: false, error: "device_code_already_used" }, 409)
  }
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
    connection_state: "linked",
    entitlement_state: authorization.runtime.entitlement_state,
    entitlement: authorization.runtime.entitlement,
    subscription: authorization.subscription ? authorization.runtime : null,
    license: authorization.subscription ? authorization.runtime : null,
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
  if (String(pending.status || "").trim().toLowerCase() !== "pending") {
    return json({ success: false, error: "device_code_already_used" }, 409)
  }
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

  return await issueDesktopSession(env, pending, authorization.subscription, authorization.subscriptionResolution, firebaseUser)
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
    const status = String(row.status || "")
    return json({ success: false, status, error: status === "consumed" ? "device_code_already_used" : `device_${status}` }, 409)
  }
  if (!row.user_id) return json({ success: false, error: "device_authorization_incomplete" }, 409)

  const subscriptionResolution = await resolveUserSubscription(env, String(row.user_id || ""), String(row.user_email || ""))
  return await issueDesktopSession(env, row, subscriptionResolution.currentRow, subscriptionResolution, {
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
  if (resolved.error || !resolved.session) {
    return json({ success: false, error: resolved.error || "session_invalid" }, 401)
  }
  await touchAppSession(env, resolved.session.id)
  const user = {
    userId: String(resolved.session.user_id || ""),
    email: String(resolved.session.user_email || ""),
    displayName: String(resolved.session.metadata?.display_name || "").trim() || null,
    photoUrl: String(resolved.session.metadata?.avatar_url || "").trim() || null,
    authProvider: String(resolved.session.metadata?.auth_provider || "").trim() || null,
  }
  return json({
    ...buildSubscriptionRuntime(resolved.subscriptionResolution || resolved.subscription, "verified", user),
    user_email: resolved.session.user_email,
    display_name: resolved.session.metadata?.display_name || null,
    avatar_url: resolved.session.metadata?.avatar_url || null,
    auth_provider: resolved.session.metadata?.auth_provider || null,
    session_expires_at: resolved.session.expires_at,
  })
}

async function handleSessionRefresh(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const sessionToken = String(body?.session_token || "").trim()
  const hwid = normalizeHwid(body?.hwid)
  if (!sessionToken || !isValidHwid(hwid)) return errorJson(request, "SESSION_REFRESH_INVALID", 400)
  const currentTokenHash = await sha256Hex(sessionToken)
  const session = await getAppSessionByHash(env, currentTokenHash)
  if (!session) return errorJson(request, "SESSION_NOT_FOUND", 401)
  if (session.revoked_at) return errorJson(request, "SESSION_REVOKED", 401)
  if (session.hwid !== hwid) return errorJson(request, "SESSION_DEVICE_MISMATCH", 403)
  if (isIsoExpired(session.expires_at)) return errorJson(request, "SESSION_EXPIRED", 401)

  const nextToken = `stk_${randomBase64Url(32)}`
  const nextTokenHash = await sha256Hex(nextToken)
  const expiresAt = new Date(Date.now() + appSessionTtlMs(env)).toISOString()
  const rotated = await rotateAppSessionToken(env, session.id, currentTokenHash, nextTokenHash, expiresAt)
  if (!rotated) return errorJson(request, "SESSION_REFRESH_CONFLICT", 409, true)
  return json({ success: true, connection_state: "linked", session_token: nextToken, session_expires_at: expiresAt })
}

async function handleSessionLogout(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const sessionToken = String(body?.session_token || "").trim()
  if (sessionToken) await revokeAppSession(env, await sha256Hex(sessionToken))
  return json({ success: true })
}

function firebaseTokenFromRequest(request: Request, body: Record<string, any> | null): string {
  const authorization = String(request.headers.get("Authorization") || "").trim()
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization)?.[1] || ""
  return String(bearer || body?.id_token || "").trim()
}

function decodeJwtPayload(token: string): Record<string, any> | null {
  const part = String(token || "").split(".")[1] || ""
  if (!part) return null
  try {
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

function hasRecentFirebaseAuth(token: string, maxAgeSeconds = 10 * 60): boolean {
  const payload = decodeJwtPayload(token)
  const authTime = Number(payload?.auth_time || 0)
  if (!Number.isFinite(authTime) || authTime <= 0) return false
  return Math.floor(Date.now() / 1000) - authTime <= maxAgeSeconds
}

async function accountSessionProjection(session: AppSessionRow) {
  const metadata = session.metadata && typeof session.metadata === "object" ? session.metadata : {}
  const status = session.revoked_at ? "revoked" : isIsoExpired(session.expires_at) ? "expired" : "active"
  const deviceKey = (await sha256Hex(`saturnws-device:${String(session.hwid || "")}`)).slice(0, 16)
  return {
    id: session.id,
    device_key: deviceKey,
    device_name: String(metadata.device_name || "").trim() || "Saturn Workspace",
    platform: String(metadata.platform || "").trim() || null,
    os_version: String(metadata.os_version || "").trim() || null,
    app_version: String(metadata.app_version || "").trim() || null,
    status,
    created_at: session.created_at,
    last_activity_at: session.last_seen_at || session.created_at,
    expires_at: session.expires_at,
    revoked_at: session.revoked_at,
  }
}

async function handleAccountSessions(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const idToken = firebaseTokenFromRequest(request, body)
  if (!idToken) return errorJson(request, "AUTH_SESSION_EXPIRED", 401, true)
  const firebaseUser = await verifyFirebaseUser(idToken, env)
  const rows = await listAppSessionsForUser(env, firebaseUser.userId)
  const sessions = await Promise.all(rows.map(accountSessionProjection))
  const grouped = new Map<string, { device_key: string; device_name: string; platform: string | null; os_version: string | null; active_sessions: number; total_sessions: number; last_activity_at: string }>()
  for (const session of sessions) {
    const existing = grouped.get(session.device_key)
    if (!existing) {
      grouped.set(session.device_key, {
        device_key: session.device_key,
        device_name: session.device_name,
        platform: session.platform,
        os_version: session.os_version,
        active_sessions: session.status === "active" ? 1 : 0,
        total_sessions: 1,
        last_activity_at: session.last_activity_at,
      })
      continue
    }
    existing.total_sessions += 1
    if (session.status === "active") existing.active_sessions += 1
    if (String(session.last_activity_at || "") > String(existing.last_activity_at || "")) existing.last_activity_at = session.last_activity_at
  }
  return json({ success: true, sessions, devices: [...grouped.values()] })
}

async function handleAccountSessionRevoke(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const idToken = firebaseTokenFromRequest(request, body)
  const sessionId = String(body?.session_id || "").trim()
  const scope = String(body?.scope || "session").trim().toLowerCase()
  if (!idToken) return errorJson(request, "AUTH_SESSION_EXPIRED", 401, true)
  if (!sessionId || !["session", "device"].includes(scope)) return errorJson(request, "SESSION_REVOKE_INVALID", 400)
  const firebaseUser = await verifyFirebaseUser(idToken, env)
  const owned = await getAppSessionByIdForUser(env, sessionId, firebaseUser.userId)
  if (!owned) return errorJson(request, "SESSION_NOT_FOUND", 404)
  if (scope === "device") {
    await revokeAppSessionsForDevice(env, firebaseUser.userId, owned.hwid)
  } else if (!owned.revoked_at) {
    await revokeAppSessionByIdForUser(env, sessionId, firebaseUser.userId)
  }
  await enqueueSecurityEmail(env, {
    eventType: scope === "device" ? "security.device_revoked" : "security.session_revoked",
    idempotencyKey: `security-${scope}-revoked:${firebaseUser.userId}:${sessionId}`,
    recipient: firebaseUser.email,
    userId: firebaseUser.userId,
    payload: {
      device_name: cleanOperationalText((owned.metadata as Record<string, unknown> | null)?.device_name || owned.hwid || "Desktop device", 120),
      platform: cleanOperationalText((owned.metadata as Record<string, unknown> | null)?.platform || "", 80),
    },
  }).catch(() => ({ queued: false }))
  return json({ success: true, revoked_scope: scope })
}

async function handleAccountSessionsRevokeAll(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const idToken = firebaseTokenFromRequest(request, body)
  if (!idToken) return errorJson(request, "AUTH_SESSION_EXPIRED", 401, true)
  const firebaseUser = await verifyFirebaseUser(idToken, env)
  const sessionsBeforeRevoke = await listAppSessionsForUser(env, firebaseUser.userId).catch(() => [] as AppSessionRow[])
  const activeSessionFingerprint = await sha256Hex(
    sessionsBeforeRevoke
      .filter((session) => !session.revoked_at)
      .map((session) => String(session.id || ""))
      .filter(Boolean)
      .sort()
      .join(":") || firebaseUser.userId,
  )
  await revokeAppSessionsForUser(env, firebaseUser.userId)
  await enqueueSecurityEmail(env, {
    eventType: "security.all_sessions_revoked",
    idempotencyKey: `security-all-sessions-revoked:${firebaseUser.userId}:${activeSessionFingerprint}`,
    recipient: firebaseUser.email,
    userId: firebaseUser.userId,
  }).catch(() => ({ queued: false }))
  return json({ success: true, revoked_scope: "all" })
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
  const rows = await getSubscriptionRowsForUser(env, firebaseUser.userId, firebaseUser.email)
  const resolution = resolveRowsForUser(rows, firebaseUser.userId, firebaseUser.email)
  const projection = resolution.projection as Record<string, any>
  const historySummary = {
    total: resolution.diagnostics.authoritative_rows,
    current_usable_count: resolution.diagnostics.current_usable_count,
    historical_count: resolution.diagnostics.historical_count,
    historical_expired_count: resolution.history.filter((item) => String(item.lifecycle || "") === "expired").length,
    latest_expired_at: resolution.history
      .filter((item) => String(item.lifecycle || "") === "expired")
      .map((item) => String(item.expires_at || ""))
      .filter(Boolean)
      .sort()
      .reverse()[0] || null,
    legacy_email_candidates: resolution.diagnostics.legacy_email_candidates,
    uid_mismatch_candidates: resolution.diagnostics.uid_mismatch_candidates,
    integrity: resolution.diagnostics.integrity,
    integrity_code: resolution.diagnostics.code,
  }
  const runtime = resolution.currentRow ? {
    ...buildSubscriptionRuntime(resolution, "verified", firebaseUser),
    lifecycle: projection.lifecycle,
    entitlement: projection.entitlement,
    plan_term: projection.plan_term,
    renewal_state: projection.renewal_state,
  } : null
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
    current_subscription: runtime,
    subscription: runtime,
    subscription_projection: projection,
    entitlement: projection.entitlement,
    subscription_history_summary: historySummary,
    status: runtime ? String(projection.lifecycle || "active") : String(projection.entitlement || "no_subscription"),
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

function accountDeletionProjection(row: Record<string, any> | null) {
  if (!row) {
    return {
      state: "none",
      request: null,
      purge_available: false,
      purge_mode: "not_implemented_without_destructive_approval",
    }
  }
  return {
    state: row.status || "pending_deletion",
    request: {
      id: row.id,
      status: row.status,
      requested_at: row.requested_at,
      cooling_off_until: row.cooling_off_until,
      due_at: row.due_at,
      held_at: row.held_at || null,
      cancelled_at: row.cancelled_at || null,
    },
    purge_available: false,
    purge_mode: "not_implemented_without_destructive_approval",
  }
}

const ACCOUNT_DELETION_SCHEMA_PENDING = "__account_deletion_schema_pending__" as const

function isAccountDeletionSchemaMissing(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error || "")
  return /account_deletion_requests|relation .* does not exist|schema cache|PGRST20|PGRST2/i.test(message)
}

async function handleAccountDeletionStatus(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const idToken = firebaseTokenFromRequest(request, body)
  if (!idToken) return errorJson(request, "AUTH_SESSION_EXPIRED", 401, true)
  const firebaseUser = await verifyFirebaseUser(idToken, env)
  const profile = await getAccountProfileByFirebaseUid(env, firebaseUser.userId).catch(() => null)
  const row = await getAccountDeletionRequest(env, firebaseUser.userId)
  return json({
    success: true,
    account_status: profile?.account_status || "active",
    deletion: accountDeletionProjection(row),
  })
}

async function handleAccountDeletionRequest(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const idToken = firebaseTokenFromRequest(request, body)
  if (!idToken) return errorJson(request, "AUTH_SESSION_EXPIRED", 401, true)
  const firebaseUser = await verifyFirebaseUser(idToken, env)
  if (!hasRecentFirebaseAuth(idToken)) return errorJson(request, "RECENT_AUTH_REQUIRED", 401, true)

  const existing = await getAccountDeletionRequest(env, firebaseUser.userId).catch((error): Record<string, any> | null | typeof ACCOUNT_DELETION_SCHEMA_PENDING => {
    if (isAccountDeletionSchemaMissing(error)) return ACCOUNT_DELETION_SCHEMA_PENDING
    throw error
  })
  if (existing === ACCOUNT_DELETION_SCHEMA_PENDING) return errorJson(request, "ACCOUNT_DELETION_UNAVAILABLE", 503, true)
  if (existing) return json({ success: true, deletion: accountDeletionProjection(existing), idempotent: true })

  const configuredDays = Number(String(env.ACCOUNT_DELETION_COOLING_OFF_DAYS || "7").trim())
  const days = Math.max(1, Math.min(Number.isFinite(configuredDays) ? configuredDays : 7, 30))
  const requestedAt = Date.now()
  const coolingOffUntil = new Date(requestedAt + days * 24 * 60 * 60 * 1000).toISOString()
  const dueAt = coolingOffUntil
  const row = await createAccountDeletionRequest(env, {
    firebaseUid: firebaseUser.userId,
    requestId: `acctdel_${crypto.randomUUID()}`,
    reason: String(body?.reason || "").trim() || null,
    coolingOffUntil,
    dueAt,
  })
  await updateAccountProfileStatus(env, firebaseUser.userId, "pending_deletion").catch(() => undefined)
  await revokeAppSessionsForUser(env, firebaseUser.userId).catch(() => undefined)
  await enqueueSecurityEmail(env, {
    eventType: "account.deletion_requested",
    idempotencyKey: `account-deletion-requested:${row.id}`,
    recipient: firebaseUser.email,
    userId: firebaseUser.userId,
    payload: {
      cooling_off_until: row.cooling_off_until || coolingOffUntil,
    },
  }).catch(() => ({ queued: false }))
  return json({ success: true, deletion: accountDeletionProjection(row) })
}

async function handleAccountDeletionCancel(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const idToken = firebaseTokenFromRequest(request, body)
  if (!idToken) return errorJson(request, "AUTH_SESSION_EXPIRED", 401, true)
  const firebaseUser = await verifyFirebaseUser(idToken, env)
  const row = await cancelAccountDeletionRequest(env, firebaseUser.userId).catch((error): Record<string, any> | null | typeof ACCOUNT_DELETION_SCHEMA_PENDING => {
    if (isAccountDeletionSchemaMissing(error)) return ACCOUNT_DELETION_SCHEMA_PENDING
    throw error
  })
  if (row === ACCOUNT_DELETION_SCHEMA_PENDING) return errorJson(request, "ACCOUNT_DELETION_UNAVAILABLE", 503, true)
  if (row) await updateAccountProfileStatus(env, firebaseUser.userId, "active").catch(() => undefined)
  if (row) {
    await enqueueSecurityEmail(env, {
      eventType: "account.deletion_cancelled",
      idempotencyKey: `account-deletion-cancelled:${row.id}:${row.cancelled_at || "cancelled"}`,
      recipient: firebaseUser.email,
      userId: firebaseUser.userId,
    }).catch(() => ({ queued: false }))
  }
  return json({ success: true, deletion: accountDeletionProjection(row) })
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
      if (request.method === "POST" && apiPath === "/session/refresh") {
        const res = await handleSessionRefresh(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/session/logout") {
        const res = await handleSessionLogout(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/account/sessions") {
        const res = await handleAccountSessions(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/account/sessions/revoke") {
        const res = await handleAccountSessionRevoke(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/account/sessions/revoke-all") {
        const res = await handleAccountSessionsRevokeAll(request, env)
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
      if (request.method === "POST" && apiPath === "/account/deletion/status") {
        const res = await handleAccountDeletionStatus(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/account/deletion/request") {
        const res = await handleAccountDeletionRequest(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/account/deletion/cancel") {
        const res = await handleAccountDeletionCancel(request, env)
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
      const code = String(err?.message || err || "").trim()
      if (code === "firebase_token_invalid" || code === "firebase_user_not_verified") {
        const res = errorJson(request, "AUTH_SESSION_EXPIRED", 401, true)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (code === "firebase_not_configured") {
        const res = errorJson(request, "AUTH_PROVIDER_UNAVAILABLE", 503, true)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      console.error("auth_worker_unhandled_error", {
        message: code || "error",
        stack: String(err?.stack || ""),
      })
      return json({ success: false, error: "internal_error", message: "Internal server error" }, 500, cors)
    }
  },
} satisfies ExportedHandler<Env>
