import { hmacSha256Hex, randomBase64Url, randomUserCode, sha256Hex, timingSafeEqualHex } from "./lib/crypto"
import { allowRateLimit } from "./lib/rateLimit"
import { desktopEntitlementFromProjection, resolveSubscriptionTruth } from "../../shared/subscriptions/resolver.js"
import {
  createAppSession,
  createDeviceLogin,
  createEmailVerification,
  authorizePendingDeviceLoginRow,
  authorizeAccountDevice,
  claimAuthorizedDeviceLogin,
  getAccountProfileByEmail,
  getAccountProfileByFirebaseUid,
  getAppSessionByHash,
  getAppSessionByIdForUser,
  getDeviceLoginByCode,
  getEmailVerificationById,
  getLatestEmailVerification,
  getPendingDeviceLoginByUserCode,
  getSubscriptionRowsForUser,
  getAccountDeviceState,
  isAccountDeviceBindingCurrent,
  listSubscriptionEmailCandidates,
  requestAccountDeviceChange,
  insertEmailVerificationAudit,
  listAppSessionsForUser,
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

async function requireSubscriptionEmailSourceToken(request: Request, env: Env): Promise<boolean> {
  const supplied = /^Bearer\s+(.+)$/i.exec(String(request.headers.get("Authorization") || "").trim())?.[1] || ""
  const configured = String(env.AUTH_EMAIL_ENQUEUE_TOKEN || "").trim()
  if (!supplied || !configured) return false
  return timingSafeEqualHex(await sha256Hex(supplied), await sha256Hex(configured))
}

async function handleSubscriptionEmailCandidates(request: Request, env: Env): Promise<Response> {
  if (!(await requireSubscriptionEmailSourceToken(request, env))) return errorJson(request, "UNAUTHORIZED", 401)
  const url = new URL(request.url)
  const offsetRaw = Number(url.searchParams.get("offset") || 0)
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.min(Math.trunc(offsetRaw), 5000)) : 0
  const now = Date.now()
  const result = await listSubscriptionEmailCandidates(env, {
    from: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date(now + 8 * 24 * 60 * 60 * 1000).toISOString(),
    offset,
    limit: 200,
  })
  return json({ success: true, ...result })
}

function errorJson(
  request: Request,
  code: string,
  status = 400,
  retryable = false,
  fieldErrors?: Record<string, string>,
  extra?: Record<string, unknown>,
  extraHeaders?: HeadersInit,
): Response {
  return json({
    success: false,
    error: code,
    code,
    request_id: requestId(request),
    retryable,
    ...(fieldErrors ? { field_errors: fieldErrors } : {}),
    ...(extra || {}),
  }, status, extraHeaders)
}

function verificationRateLimited(request: Request, retryAfterSeconds = 60): Response {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds))
  return errorJson(
    request,
    "VERIFICATION_RATE_LIMITED",
    429,
    true,
    undefined,
    { retry_after_seconds: seconds },
    { "Retry-After": String(seconds) },
  )
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
  if (!(await allowRateLimit(env.AUTH_RATE_LIMIT_STANDARD, `oauth-config:ip:${ip}`))) {
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

const SATURN_ACCOUNT_STATE_CLAIM = "saturn_account_state"
const SATURN_ACCOUNT_VERSION_CLAIM = "saturn_account_version"
const SATURN_FINALIZED_STATE = "finalized"
const SATURN_ACCOUNT_VERSION = 1

type VerifiedFirebaseUser = {
  userId: string
  email: string
  emailVerified: boolean
  displayName: string | null
  photoUrl: string | null
  authProvider: string | null
  authProviders: string[]
  disabled: boolean
  tokenClaims: Record<string, any>
  accountClaims: Record<string, any>
  authTime: number | null
  createdAtMs: number | null
}

function parseJsonObject(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>
  if (typeof value !== "string" || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function isSaturnFinalizedClaim(claims: Record<string, any> | null | undefined): boolean {
  if (!claims) return false
  return (
    String(claims[SATURN_ACCOUNT_STATE_CLAIM] || "").trim() === SATURN_FINALIZED_STATE &&
    Number(claims[SATURN_ACCOUNT_VERSION_CLAIM] || 0) >= SATURN_ACCOUNT_VERSION
  )
}

function finalizedClaimPayload(): Record<string, unknown> {
  return {
    [SATURN_ACCOUNT_STATE_CLAIM]: SATURN_FINALIZED_STATE,
    [SATURN_ACCOUNT_VERSION_CLAIM]: SATURN_ACCOUNT_VERSION,
  }
}

function profileMetadata(profile: AccountProfileRow | null | undefined): Record<string, any> {
  return profile?.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
    ? profile.metadata as Record<string, any>
    : {}
}

function profileCredentialEpoch(profile: AccountProfileRow | null | undefined): number | null {
  const metadata = profileMetadata(profile)
  const finalization = metadataObject(metadata.finalization)
  const epoch = Number(finalization.credential_epoch || 0)
  return Number.isFinite(epoch) && epoch > 0 ? Math.floor(epoch) : null
}

function finalizedProfileMetadata(input: { finalizedAt: string; credentialEpoch?: number | null; source: string; version?: number }): Record<string, unknown> {
  return {
    finalization: {
      state: SATURN_FINALIZED_STATE,
      version: input.version || SATURN_ACCOUNT_VERSION,
      finalized_at: input.finalizedAt,
      credential_epoch: input.credentialEpoch || null,
      source: input.source,
    },
  }
}

function mergeFinalizedProfileMetadata(
  metadata: Record<string, unknown> | null | undefined,
  input: { finalizedAt: string; credentialEpoch?: number | null; source: string; version?: number },
): Record<string, unknown> {
  return {
    ...(metadata || {}),
    ...finalizedProfileMetadata(input),
  }
}

function isFinalizedProfile(profile: AccountProfileRow | null | undefined, firebaseUser: VerifiedFirebaseUser): boolean {
  if (!profile) return false
  if (String(profile.firebase_uid || "").trim() !== firebaseUser.userId) return false
  if (String(profile.normalized_email || "").trim().toLowerCase() !== firebaseUser.email) return false
  if (!profile.email_verified) return false
  const source = String(profile.verification_source || "").trim()
  return ["saturnws_otp", "firebase_google", "admin", "legacy_unknown"].includes(source)
}

function accountLifecycleBlock(profile: AccountProfileRow, options: { allowPendingDeletion?: boolean } = {}): string {
  const status = String(profile.account_status || "").trim().toLowerCase()
  if (["suspended", "deleted"].includes(status)) return "ACCOUNT_DISABLED"
  if (status === "pending_deletion" && !options.allowPendingDeletion) return "ACCOUNT_DISABLED"
  return ""
}

const orphanSignalWindows = new Map<string, { count: number; alerted: boolean }>()

function isPasswordOnlyFirebaseUser(firebaseUser: VerifiedFirebaseUser): boolean {
  const providers = new Set((firebaseUser.authProviders || []).map((item) => String(item || "").trim().toLowerCase()))
  return providers.has("password") && !providers.has("google") && !providers.has("google.com")
}

function orphanRetentionMs(env: Env): number {
  const hours = Number(String(env.AUTH_ORPHAN_PASSWORD_RETENTION_HOURS || "24").trim())
  return Math.max(1, Math.min(Number.isFinite(hours) ? hours : 24, 168)) * 60 * 60 * 1000
}

function orphanAlertThreshold(env: Env): number {
  const value = Number(String(env.AUTH_ORPHAN_PASSWORD_ALERT_THRESHOLD || "5").trim())
  return Math.max(1, Math.min(Number.isFinite(value) ? value : 5, 100))
}

async function hasActivePendingRegistration(env: Env, email: string): Promise<boolean> {
  const pending = await getLatestEmailVerification(env, { email, purpose: "registration", status: "pending" }).catch(() => null)
  if (pending && Date.parse(String(pending.expires_at || "")) > Date.now()) return true
  const verified = await getLatestEmailVerification(env, { email, purpose: "registration", status: "verified" }).catch(() => null)
  if (!verified) return false
  const registration = registrationFromRow(verified)
  const finalizationExpiresAt = Date.parse(String(registration.finalization_token_expires_at || ""))
  return Number.isFinite(finalizationExpiresAt) && finalizationExpiresAt > Date.now()
}

async function enqueueOrphanAdminAlert(
  env: Env,
  input: { opaqueRef: string; count: number; disabled: boolean; reason: string },
): Promise<void> {
  const url = String(env.AUTH_EMAIL_ENQUEUE_URL || "").trim()
  const token = String(env.AUTH_EMAIL_ENQUEUE_TOKEN || "").trim()
  const recipient = String(env.AUTH_ORPHAN_ADMIN_ALERT_RECIPIENT || "").trim()
  if (!url || !token || !recipient || !recipient.includes("@")) return
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      event_type: "admin.auth_orphan_quarantine",
      idempotency_key: `auth-orphan-quarantine:${new Date().toISOString().slice(0, 13)}:${input.opaqueRef}`,
      recipient,
      locale: "en",
      payload: {
        reference_id: input.opaqueRef,
        severity: input.disabled ? "critical" : "warning",
        summary: input.disabled
          ? "A stale password-only Firebase identity without Saturn finalization was quarantined."
          : `Password-only Firebase identities without Saturn finalization crossed the configured threshold (${input.count}).`,
        failed_event_type: input.reason,
        action_url: "https://admin.saturnws.com/diagnostics",
        destination_label: "Open diagnostics",
      },
    }),
  }).catch(() => null)
}

async function processUnfinalizedPasswordIdentity(
  request: Request,
  env: Env,
  firebaseUser: VerifiedFirebaseUser,
  reason: string,
): Promise<void> {
  if (!isPasswordOnlyFirebaseUser(firebaseUser)) return
  const opaqueRef = (await sha256Hex(`saturnws-orphan:${firebaseUser.userId}`)).slice(0, 18)
  const hasPending = await hasActivePendingRegistration(env, firebaseUser.email)
  const ageMs = firebaseUser.createdAtMs ? Date.now() - firebaseUser.createdAtMs : null
  const stale = !hasPending && ageMs !== null && ageMs >= orphanRetentionMs(env)
  let disabled = false
  if (stale && !firebaseUser.disabled) {
    try {
      await setFirebaseUserDisabled(env, firebaseUser.userId, true)
      disabled = true
    } catch {
      disabled = false
    }
  }
  const windowKey = new Date().toISOString().slice(0, 13)
  const windowState = orphanSignalWindows.get(windowKey) || { count: 0, alerted: false }
  windowState.count += 1
  orphanSignalWindows.set(windowKey, windowState)
  await auditEmailVerification(env, {
    action: "auth_orphan_password_identity",
    result: disabled ? "quarantined" : hasPending ? "pending_registration" : "observed",
    request,
    metadata: {
      orphan_ref: opaqueRef,
      reason,
      pending_registration: hasPending,
      stale,
      disabled,
      age_hours: ageMs === null ? null : Math.max(0, Math.floor(ageMs / 36_000) / 100),
    },
  })
  if (disabled || (!windowState.alerted && windowState.count >= orphanAlertThreshold(env))) {
    windowState.alerted = true
    orphanSignalWindows.set(windowKey, windowState)
    await enqueueOrphanAdminAlert(env, { opaqueRef, count: windowState.count, disabled, reason })
  }
}

async function verifyFirebaseUser(
  idToken: string,
  env: Env,
): Promise<VerifiedFirebaseUser> {
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
  const tokenClaims = decodeJwtPayload(idToken) || {}
  const accountClaims = parseJsonObject(user?.customAttributes)
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
  const authTime = Number(tokenClaims.auth_time || 0)
  const createdAtMs = Number(user?.createdAt || user?.createdAtMs || 0)
  return {
    userId,
    email,
    emailVerified: Boolean(user?.emailVerified),
    displayName,
    photoUrl,
    authProvider,
    authProviders,
    disabled: Boolean(user?.disabled),
    tokenClaims,
    accountClaims,
    authTime: Number.isFinite(authTime) && authTime > 0 ? Math.floor(authTime) : null,
    createdAtMs: Number.isFinite(createdAtMs) && createdAtMs > 0 ? Math.floor(createdAtMs) : null,
  }
}

function normalizeLocale(value: unknown, env: Env): "ar" | "en" {
  const raw = String(value || env.PROFILE_DEFAULT_LOCALE || "ar").trim().toLowerCase()
  return raw === "en" ? "en" : "ar"
}

function normalizeTermsVersion(value: unknown, env: Env): string | null {
  return String(value || env.ACCOUNT_TERMS_VERSION || "").trim() || null
}

function normalizeRegistrationEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase()
}

function isValidRegistrationEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 255
}

function passwordMeetsMinimum(value: string): boolean {
  return String(value || "").length >= 6
}

function registrationMetadataFromBody(body: Record<string, any> | null, env: Env): Record<string, unknown> {
  const displayName = cleanDisplayName(body?.display_name ?? body?.displayName)
  const locale = normalizeLocale(body?.locale, env)
  const termsAccepted = Boolean(body?.terms_accepted || body?.termsAccepted)
  const termsVersion = normalizeTermsVersion(body?.terms_version || body?.termsVersion, env)
  const termsAcceptedAt = termsAccepted
    ? String(body?.terms_accepted_at || body?.termsAcceptedAt || "").trim() || new Date().toISOString()
    : null
  return {
    registration_version: 2,
    display_name: displayName,
    locale,
    terms_accepted: termsAccepted,
    terms_version: termsVersion,
    terms_accepted_at: termsAcceptedAt,
    finalization_state: "pending",
  }
}

function metadataObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(value)))
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = String(pem || "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "")
  if (!b64) throw new Error("firebase_service_account_invalid")
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

let firebaseAccessTokenCache: { token: string; expiresAt: number; subject: string } | null = null

function firebaseServiceAccount(env: Env): { clientEmail: string; privateKey: string; projectId: string } {
  const raw = String(env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim()
  if (!raw) throw new Error("firebase_admin_not_configured")
  if (emailVerificationTestMode(env) && raw === "test-service-account") {
    return { clientEmail: "test-service-account@example.test", privateKey: "test", projectId: String(env.FIREBASE_PROJECT_ID || "saturnws-test") }
  }
  let parsed: Record<string, any>
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("firebase_service_account_invalid")
  }
  const clientEmail = String(parsed.client_email || "").trim()
  const privateKey = String(parsed.private_key || "").replace(/\\n/g, "\n")
  const credentialProjectId = String(parsed.project_id || "").trim()
  const configuredProjectId = String(env.FIREBASE_PROJECT_ID || "").trim()
  if (!clientEmail || !privateKey || !credentialProjectId || !configuredProjectId) throw new Error("firebase_service_account_invalid")
  if (configuredProjectId !== credentialProjectId) throw new Error("firebase_service_account_project_mismatch")
  return { clientEmail, privateKey, projectId: configuredProjectId }
}

async function firebaseAdminAccessToken(env: Env): Promise<{ token: string; projectId: string }> {
  const account = firebaseServiceAccount(env)
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (
    firebaseAccessTokenCache
    && firebaseAccessTokenCache.subject === account.clientEmail
    && firebaseAccessTokenCache.expiresAt - 60_000 > Date.now()
  ) {
    return { token: firebaseAccessTokenCache.token, projectId: account.projectId }
  }
  if (emailVerificationTestMode(env) && account.privateKey === "test") {
    return { token: "test-firebase-admin-access-token", projectId: account.projectId }
  }
  const header = base64UrlEncodeJson({ alg: "RS256", typ: "JWT" })
  const claim = base64UrlEncodeJson({
    iss: account.clientEmail,
    scope: "https://www.googleapis.com/auth/identitytoolkit",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  })
  const signingInput = `${header}.${claim}`
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(account.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput))
  const assertion = `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  })
  const payload = await response.json<any>().catch(() => null)
  if (!response.ok || !payload?.access_token) throw new Error("firebase_admin_token_failed")
  firebaseAccessTokenCache = {
    token: String(payload.access_token),
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 3600) - 60) * 1000,
    subject: account.clientEmail,
  }
  return { token: firebaseAccessTokenCache.token, projectId: account.projectId }
}

async function createFirebasePasswordUserAfterOtp(
  env: Env,
  input: { email: string; password: string; displayName?: string | null },
): Promise<VerifiedFirebaseUser> {
  const apiKey = String(env.FIREBASE_WEB_API_KEY || "").trim()
  if (!apiKey) throw new Error("firebase_not_configured")
  const admin = await firebaseAdminAccessToken(env)
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(admin.projectId)}/accounts?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${admin.token}`,
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      displayName: input.displayName || undefined,
      emailVerified: true,
      disabled: true,
    }),
  })
  const payload = await response.json<any>().catch(() => null)
  if (!response.ok) {
    throw new Error(mapFirebasePasswordError(String(payload?.error?.message || "")))
  }
  const userId = String(payload?.localId || "").trim()
  const email = normalizeRegistrationEmail(payload?.email || input.email)
  if (!userId || !email) throw new Error("firebase_password_auth_failed")
  return {
    userId,
    email,
    emailVerified: true,
    displayName: cleanDisplayName(payload?.displayName || input.displayName),
    photoUrl: String(payload?.photoUrl || "").trim() || null,
    authProvider: "password",
    authProviders: ["password"],
    disabled: true,
    tokenClaims: {},
    accountClaims: {},
    authTime: null,
    createdAtMs: Date.now(),
  }
}

function firebaseUserFromIdentityPayload(user: Record<string, any>, fallbackEmail: string): Awaited<ReturnType<typeof verifyFirebaseUser>> | null {
  const userId = String(user?.localId || "").trim()
  const email = normalizeRegistrationEmail(user?.email || fallbackEmail)
  if (!userId || !email) return null
  const providerUserInfo = Array.isArray(user?.providerUserInfo) ? user.providerUserInfo : []
  const providerIds = providerUserInfo
    .map((item: any) => String(item?.providerId || "").trim().toLowerCase())
    .filter(Boolean)
  const authProviders = providerIds
    .map((item: string) => item === "google.com" ? "google" : item === "password" ? "password" : item)
    .filter(Boolean)
  const providerId = String(providerIds[0] || user?.providerId || "").trim().toLowerCase()
  const authProvider =
    providerId === "google.com" ? "google" : providerId === "password" ? "password" : providerId || authProviders[0] || "password"
  const createdAtMs = Number(user?.createdAt || user?.createdAtMs || 0)
  return {
    userId,
    email,
    emailVerified: Boolean(user?.emailVerified),
    displayName: cleanDisplayName(user?.displayName),
    photoUrl: String(user?.photoUrl || "").trim() || null,
    authProvider,
    authProviders,
    disabled: Boolean(user?.disabled),
    tokenClaims: {},
    accountClaims: parseJsonObject(user?.customAttributes),
    authTime: null,
    createdAtMs: Number.isFinite(createdAtMs) && createdAtMs > 0 ? createdAtMs : null,
  }
}

async function updateFirebaseUserAdmin(
  env: Env,
  input: {
    userId: string
    email?: string
    password?: string
    displayName?: string | null
    emailVerified?: boolean
    disabled?: boolean
    customAttributes?: Record<string, unknown>
    revokeRefreshTokens?: boolean
  },
): Promise<Awaited<ReturnType<typeof verifyFirebaseUser>>> {
  const apiKey = String(env.FIREBASE_WEB_API_KEY || "").trim()
  if (!apiKey) throw new Error("firebase_not_configured")
  const admin = await firebaseAdminAccessToken(env)
  const body: Record<string, unknown> = {
    localId: input.userId,
    targetProjectId: admin.projectId,
    returnSecureToken: false,
  }
  if (input.email !== undefined) body.email = input.email
  if (input.password !== undefined) body.password = input.password
  if (input.displayName !== undefined) body.displayName = input.displayName || undefined
  if (input.emailVerified !== undefined) body.emailVerified = input.emailVerified
  if (input.disabled !== undefined) body.disableUser = input.disabled
  if (input.customAttributes) body.customAttributes = JSON.stringify(input.customAttributes)
  if (input.revokeRefreshTokens) body.validSince = String(Math.floor(Date.now() / 1000))
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${admin.token}`,
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json<any>().catch(() => null)
  if (!response.ok) throw new Error(mapFirebasePasswordError(String(payload?.error?.message || "")))
  const merged = {
    ...payload,
    localId: payload?.localId || input.userId,
    email: payload?.email || input.email,
    displayName: payload?.displayName ?? input.displayName,
    emailVerified: payload?.emailVerified ?? input.emailVerified,
    disabled: input.disabled ?? payload?.disabled,
    customAttributes: input.customAttributes ? JSON.stringify(input.customAttributes) : payload?.customAttributes,
  }
  const projected = firebaseUserFromIdentityPayload(merged, String(input.email || payload?.email || ""))
  if (!projected) throw new Error("firebase_password_auth_failed")
  return projected
}

async function setFirebaseUserDisabled(env: Env, userId: string, disabled: boolean): Promise<void> {
  await updateFirebaseUserAdmin(env, { userId, disabled })
}

async function setFirebaseUserFinalizedClaim(
  env: Env,
  userId: string,
  options: { disabled?: boolean; revokeRefreshTokens?: boolean } = {},
): Promise<void> {
  await updateFirebaseUserAdmin(env, {
    userId,
    disabled: options.disabled,
    customAttributes: finalizedClaimPayload(),
    revokeRefreshTokens: options.revokeRefreshTokens,
  })
}

async function lookupFirebaseAccountByEmailAfterOtp(
  env: Env,
  email: string,
): Promise<Awaited<ReturnType<typeof verifyFirebaseUser>> | null> {
  const apiKey = String(env.FIREBASE_WEB_API_KEY || "").trim()
  if (!apiKey) throw new Error("firebase_not_configured")
  const admin = await firebaseAdminAccessToken(env)
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${admin.token}`,
    },
    body: JSON.stringify({ email: [email], targetProjectId: admin.projectId }),
  })
  const payload = await response.json<any>().catch(() => null)
  if (!response.ok) throw new Error(mapFirebasePasswordError(String(payload?.error?.message || "")))
  const users = Array.isArray(payload?.users) ? payload.users : []
  const match = users.find((item: any) => normalizeRegistrationEmail(item?.email) === email) || null
  return match ? firebaseUserFromIdentityPayload(match, email) : null
}

async function updateFirebasePasswordUserAfterOtp(
  env: Env,
  input: { userId: string; email: string; password: string; displayName?: string | null },
): Promise<Awaited<ReturnType<typeof verifyFirebaseUser>>> {
  return updateFirebaseUserAdmin(env, {
    userId: input.userId,
    email: input.email,
    password: input.password,
    displayName: input.displayName,
    emailVerified: true,
    disabled: true,
  })
}

async function reconcileExistingFirebasePasswordUserAfterOtp(
  env: Env,
  input: { email: string; password: string; displayName?: string | null },
): Promise<Awaited<ReturnType<typeof verifyFirebaseUser>>> {
  const existing = await lookupFirebaseAccountByEmailAfterOtp(env, input.email)
  if (!existing) throw new Error("email_already_exists")
  if (!existing.authProviders.includes("password")) throw new Error("provider_collision")
  const wasDisabled = existing.disabled
  await setFirebaseUserDisabled(env, existing.userId, true)
  try {
    return await updateFirebasePasswordUserAfterOtp(env, {
      userId: existing.userId,
      email: input.email,
      password: input.password,
      displayName: input.displayName || existing.displayName,
    })
  } catch (error) {
    await setFirebaseUserDisabled(env, existing.userId, wasDisabled).catch(() => undefined)
    throw error
  }
}

function isTrustedGoogleIdentity(firebaseUser: {
  emailVerified?: boolean
  authProvider?: string | null
  authProviders?: string[]
}): boolean {
  return Boolean(
    firebaseUser.emailVerified &&
      (firebaseUser.authProviders?.includes("google") || firebaseUser.authProvider === "google"),
  )
}

function cleanDisplayName(value: unknown): string | null {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120) || null
}

function pendingRegistrationMetadata(
  body: Record<string, any> | null,
  user: { displayName?: string | null },
  env: Env,
): Record<string, unknown> {
  const hasTermsAccepted = Boolean(body && ("terms_accepted" in body || "termsAccepted" in body))
  const hasTermsVersion = Boolean(body && ("terms_version" in body || "termsVersion" in body))
  const hasTermsAcceptedAt = Boolean(body && ("terms_accepted_at" in body || "termsAcceptedAt" in body))
  const displayName = cleanDisplayName(body?.display_name ?? body?.displayName ?? user.displayName)
  const locale = normalizeLocale(body?.locale, env)
  const termsAccepted = Boolean(body?.terms_accepted || body?.termsAccepted)
  const termsVersion = normalizeTermsVersion(body?.terms_version || body?.termsVersion, env)
  const termsAcceptedAt = termsAccepted
    ? String(body?.terms_accepted_at || body?.termsAcceptedAt || "").trim() || new Date().toISOString()
    : null
  const metadata: Record<string, unknown> = { locale }
  if (displayName) metadata.display_name = displayName
  if (hasTermsAccepted) metadata.terms_accepted = termsAccepted
  if (hasTermsVersion) metadata.terms_version = termsVersion
  if (hasTermsAcceptedAt || termsAccepted) metadata.terms_accepted_at = termsAcceptedAt
  return metadata
}

function registrationMetadataFromRow(row: Record<string, any>, env: Env): {
  displayName: string | null
  locale: "ar" | "en"
  termsAccepted: boolean
  termsVersion: string | null
  termsAcceptedAt: string | null
} {
  const metadata = typeof row?.metadata === "object" && row.metadata ? row.metadata : {}
  const registration = typeof metadata.registration === "object" && metadata.registration ? metadata.registration as Record<string, unknown> : {}
  return {
    displayName: cleanDisplayName(registration.display_name),
    locale: normalizeLocale(registration.locale, env),
    termsAccepted: Boolean(registration.terms_accepted),
    termsVersion: normalizeTermsVersion(registration.terms_version, env),
    termsAcceptedAt: String(registration.terms_accepted_at || "").trim() || null,
  }
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
    emailVerified?: boolean
    verificationSource?: "firebase_google" | "saturnws_otp" | "admin" | "legacy_unknown" | string | null
  } = {},
): Promise<AccountProfileRow> {
  const existing = await getAccountProfileByFirebaseUid(env, firebaseUser.userId).catch(() => null)
  const acceptedTerms = Boolean(input.termsAccepted || existing?.terms_accepted_at)
  const termsVersion = normalizeTermsVersion(input.termsVersion || existing?.terms_version, env)
  const termsAcceptedAt = acceptedTerms ? String(input.termsAcceptedAt || existing?.terms_accepted_at || new Date().toISOString()) : null
  const verifiedByFirebaseGoogle = isTrustedGoogleIdentity(firebaseUser)
  const verifiedByInput = Boolean(input.emailVerified && input.verificationSource)
  const verificationSource = verifiedByFirebaseGoogle
    ? "firebase_google"
    : verifiedByInput
      ? input.verificationSource
      : existing?.verification_source || null
  return upsertAccountProfile(env, {
    firebase_uid: firebaseUser.userId,
    normalized_email: firebaseUser.email,
    display_name: input.displayName || firebaseUser.displayName || existing?.display_name || null,
    email_verified: Boolean(verifiedByFirebaseGoogle || verifiedByInput || existing?.email_verified),
    email_verified_at: (verifiedByFirebaseGoogle || verifiedByInput) ? existing?.email_verified_at || new Date().toISOString() : existing?.email_verified_at || null,
    verification_source: verificationSource,
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

async function requireFinalizedAccount(
  request: Request,
  env: Env,
  idToken: string,
  options: { allowPendingDeletion?: boolean } = {},
): Promise<{ firebaseUser: Awaited<ReturnType<typeof verifyFirebaseUser>>; profile: AccountProfileRow } | Response> {
  if (!idToken) return errorJson(request, "AUTH_SESSION_EXPIRED", 401, true)
  const firebaseUser = await verifyFirebaseUser(idToken, env)
  let profile = await getAccountProfileByFirebaseUid(env, firebaseUser.userId).catch(() => null)
  if (profile && !profile.email_verified && isTrustedGoogleIdentity(firebaseUser)) {
    const now = new Date().toISOString()
    profile = await provisionProfile(env, firebaseUser, {
      emailVerified: true,
      verificationSource: "firebase_google",
      metadata: finalizedProfileMetadata({ finalizedAt: now, source: "firebase_google" }),
    }).catch(() => profile)
  }
  if (!profile && isTrustedGoogleIdentity(firebaseUser)) {
    return errorJson(request, "PROFILE_TERMS_REQUIRED", 409, false, { terms: "required" })
  }
  if (!profile?.email_verified && !isTrustedGoogleIdentity(firebaseUser)) {
    await processUnfinalizedPasswordIdentity(request, env, firebaseUser, "profile_missing_or_email_unverified").catch(() => undefined)
    return errorJson(request, "EMAIL_VERIFICATION_REQUIRED", 403, true)
  }
  if (!profile) return errorJson(request, "PROFILE_PROVISIONING_FAILED", 409, true)
  if (!isFinalizedProfile(profile, firebaseUser)) {
    await processUnfinalizedPasswordIdentity(request, env, firebaseUser, "profile_not_finalized").catch(() => undefined)
    return errorJson(request, "EMAIL_VERIFICATION_REQUIRED", 403, true)
  }
  if (firebaseUser.disabled) return errorJson(request, "ACCOUNT_DISABLED", 403, true)
  const lifecycleError = accountLifecycleBlock(profile, options)
  if (lifecycleError) return errorJson(request, lifecycleError, 403, true)
  if (!isSaturnFinalizedClaim(firebaseUser.accountClaims)) {
    try {
      await setFirebaseUserFinalizedClaim(env, firebaseUser.userId)
    } catch {
      return errorJson(request, "ACCOUNT_FINALIZATION_CLAIM_UNAVAILABLE", 503, true)
    }
    return errorJson(request, "ACCOUNT_TOKEN_REFRESH_REQUIRED", 409, true)
  }
  if (!isSaturnFinalizedClaim(firebaseUser.tokenClaims)) {
    return errorJson(request, "ACCOUNT_TOKEN_REFRESH_REQUIRED", 409, true)
  }
  const credentialEpoch = profileCredentialEpoch(profile)
  if (credentialEpoch && (!firebaseUser.authTime || firebaseUser.authTime + 5 < credentialEpoch)) {
    return errorJson(request, "ACCOUNT_REAUTH_REQUIRED", 401, true)
  }
  return { firebaseUser, profile }
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

function emailVerificationTtlMinutes(env: Env): number {
  return Math.round(emailVerificationTtlMs(env) / 60_000)
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
  const deliveryRequest = new Request(url, {
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
        valid_for_minutes: emailVerificationTtlMinutes(env),
      },
    }),
  })
  let response: Response
  try {
    const parsedUrl = new URL(url)
    const policyService = parsedUrl.hostname === "api.saturnws.com" ? env.POLICY_SERVICE : undefined
    response = policyService ? await policyService.fetch(deliveryRequest) : await fetch(deliveryRequest)
  } catch {
    throw new Error("verification_delivery_temporary_failure")
  }
  if (!response.ok) {
    let payload: Record<string, unknown> | null = null
    try {
      const parsed = await response.json()
      payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
    } catch {
      payload = null
    }
    const upstreamError = String(payload?.error || "").trim().toLowerCase()
    if (response.status === 401 || upstreamError === "unauthorized") throw new Error("verification_delivery_configuration_error")
    if (upstreamError === "email_auth_disabled") throw new Error("verification_delivery_disabled")
    if (
      upstreamError === "email_sensitive_payload_key_missing"
      || upstreamError === "email_sensitive_payload_key_invalid"
      || upstreamError === "email_sensitive_payload_schema_missing"
    ) {
      throw new Error("verification_delivery_configuration_error")
    }
    if (response.status >= 500) throw new Error("verification_delivery_temporary_failure")
    throw new Error("verification_delivery_failed")
  }
  return { transport: "email_operations" }
}

function emailVerificationDeliveryFailure(error: unknown): { code: string; status: number } {
  const message = String(error instanceof Error ? error.message : error || "").trim().toLowerCase()
  if (message === "verification_delivery_not_configured") return { code: "VERIFICATION_DELIVERY_NOT_CONFIGURED", status: 503 }
  if (message === "verification_delivery_disabled") return { code: "VERIFICATION_DELIVERY_DISABLED", status: 503 }
  if (message === "verification_delivery_configuration_error") return { code: "VERIFICATION_DELIVERY_CONFIGURATION_ERROR", status: 503 }
  if (message === "verification_delivery_temporary_failure") return { code: "VERIFICATION_DELIVERY_TEMPORARY_FAILURE", status: 503 }
  return { code: "VERIFICATION_DELIVERY_FAILED", status: 502 }
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

async function hashFinalizationToken(env: Env, registrationId: string, token: string): Promise<string> {
  return hmacSha256Hex(emailVerificationPepper(env), `finalize:${String(registrationId || "").trim()}:${String(token || "").trim()}`)
}

function registrationFromRow(row: Record<string, any> | null): Record<string, any> {
  const metadata = metadataObject(row?.metadata)
  return metadataObject(metadata.registration)
}

function registrationResponse(row: Record<string, any>, testCode?: string): Record<string, unknown> {
  return {
    success: true,
    status: "sent",
    registration_id: row.id,
    email: row.email,
    expires_at: row.expires_at,
    resend_after_seconds: 45,
    ...(testCode ? { test_code: testCode } : {}),
  }
}

async function handlePendingRegistrationStart(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const email = normalizeRegistrationEmail(body?.email)
  if (!isValidRegistrationEmail(email)) return errorJson(request, "EMAIL_REQUIRED", 400, false, { email: "required" })
  const registration = registrationMetadataFromBody(body, env)
  if (!cleanDisplayName(registration.display_name)) {
    return errorJson(request, "PROFILE_DISPLAY_NAME_REQUIRED", 400, false, { display_name: "required" })
  }
  if (!registration.terms_accepted) {
    return errorJson(request, "PROFILE_TERMS_REQUIRED", 400, false, { terms: "required" })
  }
  const existingProfile = await getAccountProfileByEmail(env, email).catch(() => null)
  if (existingProfile) {
    await auditEmailVerification(env, { email, action: "registration_start", result: "profile_exists", request })
    return errorJson(request, "AUTH_EMAIL_ALREADY_USED", 409, false)
  }
  const canReturnTestCode = emailVerificationTestMode(env) && String(env.EMAIL_VERIFICATION_TEST_TRANSPORT || "").trim() === "response"
  if (!canReturnTestCode && String(env.EMAIL_AUTH_ENABLED || "").trim().toLowerCase() !== "true") {
    await auditEmailVerification(env, { email, action: "registration_start", result: "delivery_disabled", request })
    return errorJson(request, "VERIFICATION_DELIVERY_DISABLED", 503, true)
  }
  const ip = request.headers.get("CF-Connecting-IP") || "unknown"
  const [registrationIpAllowed, registrationEmailAllowed] = await Promise.all([
    allowRateLimit(env.AUTH_RATE_LIMIT_STANDARD, `registration-start:ip:${ip}`),
    allowRateLimit(env.AUTH_RATE_LIMIT_SENSITIVE, `registration-start:email:${email}`),
  ])
  if (!registrationIpAllowed || !registrationEmailAllowed) {
    return verificationRateLimited(request, 60)
  }

  const now = Date.now()
  const expiresAt = new Date(now + emailVerificationTtlMs(env)).toISOString()
  const code = randomOtpCode()
  const codeHash = await hashEmailCode(env, email, code)
  const existing = await getLatestEmailVerification(env, {
    email,
    purpose: "registration",
    status: "pending",
  })
  if (existing) {
    const lastSent = Date.parse(String(existing.last_sent_at || existing.created_at || ""))
    if (Number.isFinite(lastSent) && now - lastSent < 45_000) {
      await auditEmailVerification(env, { verificationId: existing.id, email, action: "registration_start", result: "rate_limited", request })
      return verificationRateLimited(request, (45_000 - (now - lastSent)) / 1000)
    }
    if (Number(existing.resend_count || 0) >= Number(existing.max_resends || 5)) {
      await updateEmailVerification(env, existing.id, { status: "blocked" }).catch(() => undefined)
      await auditEmailVerification(env, { verificationId: existing.id, email, action: "registration_start", result: "blocked", request })
      const retryAt = Date.parse(String(existing.expires_at || ""))
      return verificationRateLimited(request, Number.isFinite(retryAt) ? (retryAt - now) / 1000 : 300)
    }
    const existingMetadata = metadataObject(existing.metadata)
    const updated = await updateEmailVerification(env, existing.id, {
      code_hash: codeHash,
      attempts: 0,
      resend_count: Number(existing.resend_count || 0) + 1,
      expires_at: expiresAt,
      last_sent_at: new Date(now).toISOString(),
      status: "pending",
      firebase_user_id: null,
      metadata: {
        ...existingMetadata,
        transport: emailVerificationTestMode(env) ? "test" : "provider_pending",
        registration: { ...registrationFromRow(existing), ...registration, finalization_state: "pending" },
      },
    })
    try {
      const delivery = await deliverEmailVerificationCode(env, {
        email,
        userId: null,
        code,
        expiresAt,
        displayName: cleanDisplayName(registration.display_name),
        request,
        verificationId: updated.id,
        idempotencyKey: `auth-registration:${updated.id}:${Number(updated.resend_count || 0)}`,
        resend: true,
      })
      await updateEmailVerification(env, updated.id, { metadata: { ...(updated.metadata || {}), transport: delivery.transport } }).catch(() => undefined)
    } catch (error) {
      await updateEmailVerification(env, updated.id, { status: "delivery_failed", metadata: { ...(updated.metadata || {}), delivery_error: String(error instanceof Error ? error.message : error || "delivery_failed") } }).catch(() => undefined)
      await auditEmailVerification(env, { verificationId: updated.id, email, action: "registration_start", result: "delivery_failed", request })
      const failure = emailVerificationDeliveryFailure(error)
      return errorJson(request, failure.code, failure.status, true)
    }
    await auditEmailVerification(env, { verificationId: updated.id, email, action: "registration_start", result: "sent", request })
    return json(registrationResponse(updated, canReturnTestCode ? code : undefined))
  }

  const created = await createEmailVerification(env, {
    firebase_user_id: null,
    email,
    code_hash: codeHash,
    purpose: "registration",
    status: "pending",
    expires_at: expiresAt,
    requester_ip: ip,
    user_agent: request.headers.get("User-Agent") || "",
    metadata: {
      transport: emailVerificationTestMode(env) ? "test" : "provider_pending",
      registration,
    },
  })
  try {
    const delivery = await deliverEmailVerificationCode(env, {
      email,
      userId: null,
      code,
      expiresAt,
      displayName: cleanDisplayName(registration.display_name),
      request,
      verificationId: created.id,
      idempotencyKey: `auth-registration:${created.id}:0`,
    })
    await updateEmailVerification(env, created.id, { metadata: { ...(created.metadata || {}), transport: delivery.transport } }).catch(() => undefined)
  } catch (error) {
    await updateEmailVerification(env, created.id, { status: "delivery_failed", metadata: { ...(created.metadata || {}), delivery_error: String(error instanceof Error ? error.message : error || "delivery_failed") } }).catch(() => undefined)
    await auditEmailVerification(env, { verificationId: created.id, email, action: "registration_start", result: "delivery_failed", request })
    const failure = emailVerificationDeliveryFailure(error)
    return errorJson(request, failure.code, failure.status, true)
  }
  await auditEmailVerification(env, { verificationId: created.id, email, action: "registration_start", result: "sent", request })
  return json(registrationResponse(created, canReturnTestCode ? code : undefined))
}

async function handlePendingRegistrationVerify(request: Request, env: Env, body: Record<string, any> | null): Promise<Response> {
  const registrationId = String(body?.registration_id || body?.registrationId || "").trim()
  const row = registrationId ? await getEmailVerificationById(env, registrationId) : null
  const code = String(body?.code || "").replace(/\D/g, "").slice(0, 6)
  if (!row || String(row.purpose || "") !== "registration") return errorJson(request, "VERIFICATION_CODE_INVALID", 404)
  if (code.length !== 6) return errorJson(request, "VERIFICATION_CODE_INVALID", 400)
  const suppliedEmail = normalizeRegistrationEmail(body?.email)
  const rowEmail = normalizeRegistrationEmail(row.email)
  if (suppliedEmail && suppliedEmail !== rowEmail) return errorJson(request, "VERIFICATION_CODE_INVALID", 400)
  if (String(row.status || "") !== "pending") return errorJson(request, "VERIFICATION_CODE_INVALID", 409)
  if (Date.parse(String(row.expires_at || "")) <= Date.now()) {
    await updateEmailVerification(env, row.id, { status: "expired" }).catch(() => undefined)
    await auditEmailVerification(env, { verificationId: row.id, email: rowEmail, action: "registration_verify", result: "expired", request })
    return errorJson(request, "VERIFICATION_CODE_EXPIRED", 410)
  }
  if (Number(row.attempts || 0) >= Number(row.max_attempts || 6)) {
    await updateEmailVerification(env, row.id, { status: "blocked" }).catch(() => undefined)
    await auditEmailVerification(env, { verificationId: row.id, email: rowEmail, action: "registration_verify", result: "blocked", request })
    const retryAt = Date.parse(String(row.expires_at || ""))
    return verificationRateLimited(request, Number.isFinite(retryAt) ? (retryAt - Date.now()) / 1000 : 300)
  }
  const actual = await hashEmailCode(env, rowEmail, code)
  if (!timingSafeEqualHex(String(row.code_hash || ""), actual)) {
    const attempts = Number(row.attempts || 0) + 1
    await updateEmailVerification(env, row.id, { attempts, status: attempts >= Number(row.max_attempts || 6) ? "blocked" : "pending" }).catch(() => undefined)
    await auditEmailVerification(env, { verificationId: row.id, email: rowEmail, action: "registration_verify", result: "invalid", request })
    return errorJson(request, "VERIFICATION_CODE_INVALID", 400)
  }
  const verifiedAt = new Date().toISOString()
  const finalizationToken = randomBase64Url(32)
  const finalizationTokenHash = await hashFinalizationToken(env, row.id, finalizationToken)
  const tokenExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
  const metadata = metadataObject(row.metadata)
  const updated = await updateEmailVerification(env, row.id, {
    status: "verified",
    verified_at: verifiedAt,
    metadata: {
      ...metadata,
      registration: {
        ...registrationFromRow(row),
        finalization_state: "verified",
        finalization_token_hash: finalizationTokenHash,
        finalization_token_expires_at: tokenExpiresAt,
      },
    },
  })
  await auditEmailVerification(env, { verificationId: row.id, email: rowEmail, action: "registration_verify", result: "verified", request })
  return json({
    success: true,
    status: "verified",
    registration_id: updated.id,
    email: rowEmail,
    verified_at: verifiedAt,
    finalization_token: finalizationToken,
    finalization_expires_at: tokenExpiresAt,
  })
}

async function handlePendingRegistrationFinalize(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const registrationId = String(body?.registration_id || body?.registrationId || "").trim()
  const finalizationToken = String(body?.finalization_token || body?.finalizationToken || "").trim()
  const password = String(body?.password || "")
  if (!registrationId || !finalizationToken) return errorJson(request, "VERIFICATION_CODE_INVALID", 400)
  if (!passwordMeetsMinimum(password)) return errorJson(request, "AUTH_WEAK_PASSWORD", 400)
  const row = await getEmailVerificationById(env, registrationId)
  if (!row || String(row.purpose || "") !== "registration") return errorJson(request, "VERIFICATION_CODE_INVALID", 404)
  const rowEmail = normalizeRegistrationEmail(row.email)
  const registration = registrationFromRow(row)
  if (String(row.status || "") === "consumed" && registration.finalized_firebase_user_id) {
    const expected = String(registration.finalization_token_hash || "")
    const actual = await hashFinalizationToken(env, row.id, finalizationToken)
    const tokenExpiresAt = Date.parse(String(registration.finalization_token_expires_at || ""))
    if (!expected || !timingSafeEqualHex(expected, actual) || !Number.isFinite(tokenExpiresAt) || tokenExpiresAt <= Date.now()) {
      await auditEmailVerification(env, { verificationId: row.id, email: rowEmail, action: "registration_finalize", result: "invalid_replay", request })
      return errorJson(request, "VERIFICATION_CODE_INVALID", 400)
    }
    return json({ success: true, status: "finalized", email: rowEmail, idempotent: true })
  }
  if (String(row.status || "") !== "verified") return errorJson(request, "VERIFICATION_CODE_INVALID", 409)
  if (Date.parse(String(row.expires_at || "")) <= Date.now()) {
    await updateEmailVerification(env, row.id, { status: "expired" }).catch(() => undefined)
    return errorJson(request, "VERIFICATION_CODE_EXPIRED", 410)
  }
  const tokenExpiresAt = Date.parse(String(registration.finalization_token_expires_at || ""))
  if (!Number.isFinite(tokenExpiresAt) || tokenExpiresAt <= Date.now()) {
    return errorJson(request, "VERIFICATION_CODE_EXPIRED", 410)
  }
  const expected = String(registration.finalization_token_hash || "")
  const actual = await hashFinalizationToken(env, row.id, finalizationToken)
  if (!timingSafeEqualHex(expected, actual)) {
    await auditEmailVerification(env, { verificationId: row.id, email: rowEmail, action: "registration_finalize", result: "invalid_token", request })
    return errorJson(request, "VERIFICATION_CODE_INVALID", 400)
  }
  const existingProfile = await getAccountProfileByEmail(env, rowEmail).catch(() => null)
  const existingProfileMatchesRegistration =
    existingProfile &&
    String(existingProfile.firebase_uid || "").trim() === String(registration.finalized_firebase_user_id || row.firebase_user_id || "").trim()
  if (existingProfile && !existingProfileMatchesRegistration) {
    await updateEmailVerification(env, row.id, { status: "blocked", metadata: { ...metadataObject(row.metadata), registration: { ...registration, finalization_state: "profile_collision" } } }).catch(() => undefined)
    await auditEmailVerification(env, { verificationId: row.id, email: rowEmail, action: "registration_finalize", result: "profile_collision", request })
    return errorJson(request, "AUTH_EMAIL_ALREADY_USED", 409, false)
  }
  await updateEmailVerification(env, row.id, {
    metadata: {
      ...metadataObject(row.metadata),
      registration: { ...registration, finalization_state: "finalizing" },
    },
  }).catch(() => undefined)
  let firebaseUser: Awaited<ReturnType<typeof verifyFirebaseUser>> | null = null
  try {
    firebaseUser = await createFirebasePasswordUserAfterOtp(env, {
      email: rowEmail,
      password,
      displayName: cleanDisplayName(registration.display_name),
    })
  } catch (error) {
    let code = String(error instanceof Error ? error.message : error || "").trim()
    if (code === "email_already_exists") {
      try {
        firebaseUser = await reconcileExistingFirebasePasswordUserAfterOtp(env, {
          email: rowEmail,
          password,
          displayName: cleanDisplayName(registration.display_name),
        })
        await auditEmailVerification(env, { verificationId: row.id, email: rowEmail, action: "registration_finalize", result: "legacy_provider_reconciled", request })
      } catch (reconcileError) {
        code = String(reconcileError instanceof Error ? reconcileError.message : reconcileError || "").trim() || "email_already_exists"
      }
    }
    if (!firebaseUser) {
      const status = code === "email_already_exists" || code === "provider_collision" ? 409 : code === "weak_password" ? 400 : code.startsWith("firebase_") ? 503 : 502
      const publicCode =
        code === "email_already_exists" || code === "provider_collision" ? "AUTH_EMAIL_ALREADY_USED"
        : code === "weak_password" ? "AUTH_WEAK_PASSWORD"
        : code === "firebase_admin_not_configured" || code === "firebase_service_account_invalid" || code === "firebase_service_account_project_mismatch" || code === "firebase_admin_token_failed"
          ? "AUTH_PROVIDER_SERVER_CREATE_NOT_CONFIGURED"
          : "AUTH_PROVIDER_UNAVAILABLE"
      await updateEmailVerification(env, row.id, {
        status: code === "email_already_exists" || code === "provider_collision" ? "blocked" : String(row.status || "verified"),
        metadata: {
          ...metadataObject(row.metadata),
          registration: {
            ...registration,
            finalization_state: code === "email_already_exists" || code === "provider_collision" ? "provider_collision" : "finalization_failed",
            finalization_error: publicCode,
          },
        },
      }).catch(() => undefined)
      await auditEmailVerification(env, { verificationId: row.id, email: rowEmail, action: "registration_finalize", result: publicCode, request })
      return errorJson(request, publicCode, status, true)
    }
  }
  const now = new Date().toISOString()
  const credentialEpoch = Math.floor(Date.now() / 1000)
  await updateEmailVerification(env, row.id, {
    firebase_user_id: firebaseUser.userId,
    metadata: {
      ...metadataObject(row.metadata),
      registration: {
        ...registration,
        finalization_state: "profile_finalizing",
        finalized_at: now,
        finalized_firebase_user_id: firebaseUser.userId,
      },
    },
  }).catch(() => undefined)
  const profile = await provisionProfile(env, firebaseUser, {
    displayName: cleanDisplayName(registration.display_name) || firebaseUser.displayName,
    locale: normalizeLocale(registration.locale, env),
    termsAccepted: Boolean(registration.terms_accepted),
    termsVersion: normalizeTermsVersion(registration.terms_version, env),
    termsAcceptedAt: String(registration.terms_accepted_at || "").trim() || null,
    emailVerified: true,
    verificationSource: "saturnws_otp",
    metadata: mergeFinalizedProfileMetadata(
      { email_verification_id: row.id },
      { finalizedAt: now, credentialEpoch, source: "saturnws_otp" },
    ),
  })
  try {
    await setFirebaseUserFinalizedClaim(env, firebaseUser.userId, { disabled: false, revokeRefreshTokens: true })
  } catch (error) {
    await updateEmailVerification(env, row.id, {
      metadata: {
        ...metadataObject(row.metadata),
        registration: {
          ...registration,
          finalization_state: "claim_failed",
          finalized_at: now,
          finalized_firebase_user_id: firebaseUser.userId,
          finalization_error: "ACCOUNT_FINALIZATION_CLAIM_UNAVAILABLE",
        },
      },
    }).catch(() => undefined)
    await auditEmailVerification(env, { verificationId: row.id, firebaseUserId: firebaseUser.userId, email: rowEmail, action: "registration_finalize", result: "claim_failed", request })
    return errorJson(request, "ACCOUNT_FINALIZATION_CLAIM_UNAVAILABLE", 503, true)
  }
  await updateEmailVerification(env, row.id, {
    status: "consumed",
    firebase_user_id: firebaseUser.userId,
    consumed_at: now,
    metadata: {
      ...metadataObject(row.metadata),
      registration: {
        ...registration,
        finalization_state: "finalized",
        finalized_at: now,
        finalized_firebase_user_id: firebaseUser.userId,
        finalization_token_hash: registration.finalization_token_hash,
      },
    },
  })
  await auditEmailVerification(env, { verificationId: row.id, firebaseUserId: firebaseUser.userId, email: rowEmail, action: "registration_finalize", result: "finalized", request })
  return json({
    success: true,
    status: "finalized",
    email: rowEmail,
    profile: profileProjection(profile, firebaseUser),
  })
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
  const [verificationIpAllowed, verificationEmailAllowed] = await Promise.all([
    allowRateLimit(env.AUTH_RATE_LIMIT_STANDARD, `email-verification:ip:${ip}`),
    allowRateLimit(env.AUTH_RATE_LIMIT_SENSITIVE, `email-verification:email:${user.email}`),
  ])
  if (!verificationIpAllowed || !verificationEmailAllowed) {
    return verificationRateLimited(request, 60)
  }

  const now = Date.now()
  const expiresAt = new Date(now + emailVerificationTtlMs(env)).toISOString()
  const code = randomOtpCode()
  const codeHash = await hashEmailCode(env, user.email, code)
  const registration = pendingRegistrationMetadata(body, user, env)
  const existing = await getLatestEmailVerification(env, {
    email: user.email,
    firebaseUserId: user.userId,
    purpose: "email_verification",
    status: "pending",
  })

  if (existing) {
    const existingMetadata = typeof existing.metadata === "object" && existing.metadata ? existing.metadata : {}
    const existingRegistration = typeof existingMetadata.registration === "object" && existingMetadata.registration ? existingMetadata.registration as Record<string, unknown> : {}
    const lastSent = Date.parse(String(existing.last_sent_at || existing.created_at || ""))
    if (Number.isFinite(lastSent) && now - lastSent < 45_000) {
      await auditEmailVerification(env, { verificationId: existing.id, firebaseUserId: user.userId, email: user.email, action: "request", result: "rate_limited", request })
      return verificationRateLimited(request, (45_000 - (now - lastSent)) / 1000)
    }
    if (Number(existing.resend_count || 0) >= Number(existing.max_resends || 5)) {
      await updateEmailVerification(env, existing.id, { status: "blocked" }).catch(() => undefined)
      await auditEmailVerification(env, { verificationId: existing.id, firebaseUserId: user.userId, email: user.email, action: "request", result: "blocked", request })
      const retryAt = Date.parse(String(existing.expires_at || ""))
      return verificationRateLimited(request, Number.isFinite(retryAt) ? (retryAt - now) / 1000 : 300)
    }
    const updated = await updateEmailVerification(env, existing.id, {
      code_hash: codeHash,
      attempts: 0,
      resend_count: Number(existing.resend_count || 0) + 1,
      expires_at: expiresAt,
      last_sent_at: new Date(now).toISOString(),
      status: "pending",
      firebase_user_id: user.userId,
      metadata: {
        ...existingMetadata,
        transport: emailVerificationTestMode(env) ? "test" : "provider_pending",
        registration: { ...existingRegistration, ...registration },
      },
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
      const failure = emailVerificationDeliveryFailure(error)
      return errorJson(request, failure.code, failure.status, true)
    }
    await auditEmailVerification(env, { verificationId: updated.id, firebaseUserId: user.userId, email: user.email, action: "request", result: "sent", request })
    return json({
      success: true,
      status: "sent",
      expires_at: updated.expires_at,
      resend_after_seconds: 45,
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
    metadata: { transport: emailVerificationTestMode(env) ? "test" : "provider_pending", registration },
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
    const failure = emailVerificationDeliveryFailure(error)
    return errorJson(request, failure.code, failure.status, true)
  }
  await auditEmailVerification(env, { verificationId: created.id, firebaseUserId: user.userId, email: user.email, action: "request", result: "sent", request })
  return json({
    success: true,
    status: "sent",
    expires_at: created.expires_at,
    resend_after_seconds: 45,
    ...(emailVerificationTestMode(env) && String(env.EMAIL_VERIFICATION_TEST_TRANSPORT || "").trim() === "response" ? { test_code: code } : {}),
  })
}

async function handleEmailVerificationVerify(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  if (String(body?.registration_id || body?.registrationId || "").trim()) {
    return handlePendingRegistrationVerify(request, env, body)
  }
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
    const retryAt = Date.parse(String(row.expires_at || ""))
    return verificationRateLimited(request, Number.isFinite(retryAt) ? (retryAt - Date.now()) / 1000 : 300)
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
  const credentialEpoch = Math.floor(Date.now() / 1000)
  await updateEmailVerification(env, row.id, { status: "verified", verified_at: verifiedAt, consumed_at: verifiedAt })
  const registration = registrationMetadataFromRow(row, env)
  if (!user.userId) return errorJson(request, "AUTH_SESSION_EXPIRED", 401, true)
  const verifiedProfileUser: VerifiedFirebaseUser = {
    userId: user.userId || "",
    email: user.email,
    emailVerified: true,
    displayName: registration.displayName || user.displayName || null,
    photoUrl: null,
    authProvider: "password",
    authProviders: ["password"],
    disabled: false,
    tokenClaims: {},
    accountClaims: finalizedClaimPayload(),
    authTime: null,
    createdAtMs: null,
  }
  const profile = await provisionProfile(env, verifiedProfileUser, {
    displayName: registration.displayName || user.displayName || null,
    locale: registration.locale,
    termsAccepted: registration.termsAccepted,
    termsVersion: registration.termsVersion,
    termsAcceptedAt: registration.termsAcceptedAt,
    emailVerified: true,
    verificationSource: "saturnws_otp",
    metadata: mergeFinalizedProfileMetadata(
      { email_verification_id: row.id },
      { finalizedAt: verifiedAt, credentialEpoch, source: "saturnws_otp" },
    ),
  })
  try {
    await updateFirebaseUserAdmin(env, {
      userId: user.userId,
      email: user.email,
      emailVerified: true,
      customAttributes: finalizedClaimPayload(),
      revokeRefreshTokens: true,
    })
  } catch {
    await auditEmailVerification(env, { verificationId: row.id, firebaseUserId: user.userId, email: user.email, action: "verify", result: "claim_failed", request })
    return errorJson(request, "ACCOUNT_FINALIZATION_CLAIM_UNAVAILABLE", 503, true)
  }
  await auditEmailVerification(env, { verificationId: row.id, firebaseUserId: user.userId, email: user.email, action: "verify", result: "verified", request })
  return json({ success: true, status: "verified", verified_at: verifiedAt, profile: profileProjection(profile, verifiedProfileUser), token_refresh_required: true })
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

async function handleEmailVerificationCancel(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const registrationId = String(body?.registration_id || body?.registrationId || "").trim()
  if (registrationId) {
    const row = await getEmailVerificationById(env, registrationId)
    if (!row || String(row.purpose || "") !== "registration") {
      await auditEmailVerification(env, { action: "registration_cancel", result: "not_found", request })
      return json({ success: true, status: "not_found" })
    }
    const suppliedEmail = normalizeRegistrationEmail(body?.email)
    const rowEmail = normalizeRegistrationEmail(row.email)
    if (suppliedEmail && suppliedEmail !== rowEmail) return errorJson(request, "VERIFICATION_CODE_INVALID", 400)
    const now = new Date().toISOString()
    await updateEmailVerification(env, row.id, {
      status: "blocked",
      metadata: {
        ...metadataObject(row.metadata),
        registration: {
          ...registrationFromRow(row),
          finalization_state: "superseded",
          superseded_by: "email_change",
          superseded_at: now,
        },
      },
    }).catch(() => undefined)
    await auditEmailVerification(env, { verificationId: row.id, email: rowEmail, action: "registration_cancel", result: "superseded_by_email_change", request })
    return json({ success: true, status: "superseded" })
  }
  const user = await resolveEmailVerificationUser(request, env, body).catch((error) => {
    const response = emailVerificationResolveError(request, error)
    if (response) return response
    throw error
  })
  if (user instanceof Response) return user
  const row = await getLatestEmailVerification(env, {
    email: user.email,
    firebaseUserId: user.userId,
    purpose: "email_verification",
    status: "pending",
  })
  if (!row) {
    await auditEmailVerification(env, { firebaseUserId: user.userId, email: user.email, action: "cancel", result: "not_found", request })
    return json({ success: true, status: "not_found" })
  }
  const now = new Date().toISOString()
  const metadata = typeof row.metadata === "object" && row.metadata ? row.metadata : {}
  await updateEmailVerification(env, row.id, {
    status: "blocked",
    metadata: {
      ...metadata,
      superseded_by: "email_change",
      superseded_at: now,
    },
  })
  await auditEmailVerification(env, {
    verificationId: row.id,
    firebaseUserId: user.userId,
    email: user.email,
    action: "cancel",
    result: "superseded_by_email_change",
    request,
  })
  return json({ success: true, status: "superseded" })
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
): Promise<VerifiedFirebaseUser> {
  const apiKey = String(env.FIREBASE_WEB_API_KEY || "").trim()
  if (!apiKey) throw new Error("firebase_not_configured")

  const endpoint = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
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
  const idToken = String(payload?.idToken || "").trim()
  if (!userId || !normalizedEmail || !idToken) {
    throw new Error("firebase_password_auth_failed")
  }
  return verifyFirebaseUser(idToken, env)
}

async function authorizePendingDeviceLogin(
  request: Request,
  env: Env,
  pending: any,
  firebaseUser: VerifiedFirebaseUser,
): Promise<{ success: true; subscription: SubscriptionRow | null; subscriptionResolution: SubscriptionResolution; runtime: Record<string, unknown> } | { success: false; error: string; status: number; details?: Record<string, unknown> }> {
  if (String(pending?.status || "").trim().toLowerCase() !== "pending") {
    return { success: false, error: "device_code_already_used", status: 409 }
  }

  let profile = await getAccountProfileByFirebaseUid(env, firebaseUser.userId).catch(() => null)
  if (profile && !profile.email_verified && isTrustedGoogleIdentity(firebaseUser)) {
    const now = new Date().toISOString()
    profile = await provisionProfile(env, firebaseUser, {
      emailVerified: true,
      verificationSource: "firebase_google",
      metadata: finalizedProfileMetadata({ finalizedAt: now, source: "firebase_google" }),
    }).catch(() => profile)
  }
  if (!profile && isTrustedGoogleIdentity(firebaseUser)) {
    return { success: false, error: "profile_terms_required", status: 409 }
  }
  if (!profile?.email_verified && !isTrustedGoogleIdentity(firebaseUser)) {
    await processUnfinalizedPasswordIdentity(request, env, firebaseUser, "device_link_profile_missing_or_email_unverified").catch(() => undefined)
    return { success: false, error: "email_verification_required", status: 403 }
  }
  if (!profile || !isFinalizedProfile(profile, firebaseUser)) {
    await processUnfinalizedPasswordIdentity(request, env, firebaseUser, "device_link_profile_not_finalized").catch(() => undefined)
    return { success: false, error: "email_verification_required", status: 403 }
  }
  if (firebaseUser.disabled) {
    return { success: false, error: "account_disabled", status: 403 }
  }
  const lifecycleError = accountLifecycleBlock(profile)
  if (lifecycleError) {
    return { success: false, error: "account_disabled", status: 403 }
  }
  if (!isSaturnFinalizedClaim(firebaseUser.accountClaims)) {
    try {
      await setFirebaseUserFinalizedClaim(env, firebaseUser.userId)
    } catch {
      return { success: false, error: "account_finalization_claim_unavailable", status: 503 }
    }
    return { success: false, error: "account_token_refresh_required", status: 409 }
  }
  if (!isSaturnFinalizedClaim(firebaseUser.tokenClaims)) {
    return { success: false, error: "account_token_refresh_required", status: 409 }
  }
  const credentialEpoch = profileCredentialEpoch(profile)
  if (credentialEpoch && (!firebaseUser.authTime || firebaseUser.authTime + 5 < credentialEpoch)) {
    return { success: false, error: "account_reauth_required", status: 401 }
  }

  const subscriptionResolution = await resolveUserSubscription(env, firebaseUser.userId, firebaseUser.email)
  const subscription = subscriptionResolution.currentRow
  let deviceAuthorization
  try {
    deviceAuthorization = await authorizeAccountDevice(env, {
      firebaseUid: firebaseUser.userId,
      hwidHash: await sha256Hex(`saturnws-device:${String(pending.hwid || "")}`),
      deviceName: String(pending?.metadata?.device_name || "").trim() || null,
      platform: String(pending?.metadata?.platform || "").trim() || null,
      osVersion: String(pending?.metadata?.os_version || "").trim() || null,
      appVersion: String(pending?.metadata?.app_version || "").trim() || null,
    })
  } catch {
    return { success: false, error: "device_policy_unavailable", status: 503 }
  }
  if (deviceAuthorization.decision !== "authorized") {
    await updateDeviceLogin(env, pending.id, {
      status: "device_change_required",
      user_id: firebaseUser.userId,
      user_email: firebaseUser.email,
      subscription_id: subscription?.id || null,
      metadata: {
        ...(typeof pending?.metadata === "object" && pending?.metadata ? pending.metadata : {}),
        current_device_name: deviceAuthorization.current_device_name || null,
        current_device_key: deviceAuthorization.device_key || null,
        current_bound_at: deviceAuthorization.current_bound_at || null,
        pending_device_change_request_id: deviceAuthorization.pending_request_id || null,
      },
    }).catch(() => undefined)
    return {
      success: false,
      error: "device_change_required",
      status: 409,
      details: {
        device_code: pending.device_code,
        current_device_name: deviceAuthorization.current_device_name || null,
        current_bound_at: deviceAuthorization.current_bound_at || null,
        request_status: deviceAuthorization.pending_request_status || null,
        request_id: deviceAuthorization.pending_request_id || null,
      },
    }
  }
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
  if (!(await allowRateLimit(env.AUTH_RATE_LIMIT_DEVICE, `device-start:${ip}`))) {
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

  const authorization = await authorizePendingDeviceLogin(request, env, pending, firebaseUser)
  if (!authorization.success) {
    return json({ success: false, error: authorization.error, ...(authorization.details || {}) }, authorization.status)
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
  const mode = String(body?.mode || "login").trim().toLowerCase()
  if (!deviceCode || !email || !password) {
    return json({ success: false, error: "missing_password_auth_fields" }, 400)
  }
  if (mode === "signup") {
    return json({ success: false, error: "registration_requires_otp" }, 409)
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

  let firebaseUser: VerifiedFirebaseUser
  try {
    firebaseUser = await authenticateFirebasePassword(env, email, password)
  } catch (error: any) {
    return json({ success: false, error: String(error?.message || "firebase_password_auth_failed") }, 401)
  }

  const authorization = await authorizePendingDeviceLogin(request, env, pending, firebaseUser)
  if (!authorization.success) {
    return json({ success: false, error: authorization.error, ...(authorization.details || {}) }, authorization.status)
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
    const error = status === "consumed" ? "device_code_already_used" : status.startsWith("device_") ? status : `device_${status}`
    return json({ success: false, status, error }, 409)
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
  const currentDevice = await isAccountDeviceBindingCurrent(
    env,
    String(resolved.session.user_id || ""),
    await sha256Hex(`saturnws-device:${hwid}`),
  ).catch(() => false)
  if (!currentDevice) return json({ success: false, error: "session_device_replaced" }, 401)
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
  const currentDevice = await isAccountDeviceBindingCurrent(
    env,
    String(session.user_id || ""),
    await sha256Hex(`saturnws-device:${hwid}`),
  ).catch(() => false)
  if (!currentDevice) return errorJson(request, "SESSION_DEVICE_REPLACED", 401)

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
  const account = await requireFinalizedAccount(request, env, idToken, { allowPendingDeletion: true })
  if (account instanceof Response) return account
  const { firebaseUser } = account
  const rows = await listAppSessionsForUser(env, firebaseUser.userId)
  const deviceState = await getAccountDeviceState(env, firebaseUser.userId).catch(() => ({ binding: null, requests: [], events: [] }))
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
  return json({ success: true, sessions, devices: [...grouped.values()], device_binding: deviceState.binding, device_change_requests: deviceState.requests, device_events: deviceState.events })
}

async function handleAccountDeviceChangeRequest(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const idToken = firebaseTokenFromRequest(request, body)
  const deviceCode = String(body?.device_code || body?.ticket || "").trim()
  const userReason = String(body?.reason || "").trim().slice(0, 500)
  if (!deviceCode) return errorJson(request, "DEVICE_CHANGE_LOGIN_REQUIRED", 400)
  const account = await requireFinalizedAccount(request, env, idToken)
  if (account instanceof Response) return account
  const { firebaseUser } = account
  const login = await getDeviceLoginByCode(env, deviceCode)
  if (!login || login.user_id !== firebaseUser.userId || login.status !== "device_change_required") {
    return errorJson(request, "DEVICE_CHANGE_LOGIN_NOT_FOUND", 404)
  }
  if (isIsoExpired(login.expires_at)) return errorJson(request, "DEVICE_CHANGE_LOGIN_EXPIRED", 410)
  let changeRequest: Record<string, unknown>
  try {
    changeRequest = await requestAccountDeviceChange(env, {
      firebaseUid: firebaseUser.userId,
      hwidHash: await sha256Hex(`saturnws-device:${String(login.hwid || "")}`),
      deviceName: String(login.metadata?.device_name || "").trim() || null,
      platform: String(login.metadata?.platform || "").trim() || null,
      osVersion: String(login.metadata?.os_version || "").trim() || null,
      appVersion: String(login.metadata?.app_version || "").trim() || null,
      userReason: userReason || null,
    })
  } catch (error) {
    const code = String(error instanceof Error ? error.message : error || "")
    if (code.includes("device_change_not_required")) return errorJson(request, "DEVICE_CHANGE_NOT_REQUIRED", 409)
    return errorJson(request, "DEVICE_CHANGE_REQUEST_FAILED", 503, true)
  }
  return json({ success: true, request: changeRequest })
}

async function handleAccountSessionRevoke(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const idToken = firebaseTokenFromRequest(request, body)
  const sessionId = String(body?.session_id || "").trim()
  const scope = String(body?.scope || "session").trim().toLowerCase()
  if (!sessionId || !["session", "device"].includes(scope)) return errorJson(request, "SESSION_REVOKE_INVALID", 400)
  const account = await requireFinalizedAccount(request, env, idToken, { allowPendingDeletion: true })
  if (account instanceof Response) return account
  const { firebaseUser } = account
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
  const account = await requireFinalizedAccount(request, env, idToken, { allowPendingDeletion: true })
  if (account instanceof Response) return account
  const { firebaseUser } = account
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
  const trustedGoogle = isTrustedGoogleIdentity(firebaseUser)
  const termsAccepted = Boolean(body?.terms_accepted || body?.termsAccepted)
  const existing = await getAccountProfileByFirebaseUid(env, firebaseUser.userId).catch(() => null)
  if (!existing?.email_verified && !trustedGoogle) {
    return errorJson(request, "EMAIL_VERIFICATION_REQUIRED", 403, false)
  }
  if (existing && !trustedGoogle && !isFinalizedProfile(existing, firebaseUser)) {
    await processUnfinalizedPasswordIdentity(request, env, firebaseUser, "explicit_provision_not_finalized").catch(() => undefined)
    return errorJson(request, "EMAIL_VERIFICATION_REQUIRED", 403, false)
  }
  if (!existing && !termsAccepted) {
    return errorJson(request, "PROFILE_TERMS_REQUIRED", 400, false, { terms: "required" })
  }
  let profile: AccountProfileRow
  try {
    profile = await provisionProfile(env, firebaseUser, {
      displayName: String(body?.display_name || body?.displayName || "").trim() || null,
      locale: normalizeLocale(body?.locale, env),
      termsAccepted,
      termsVersion: normalizeTermsVersion(body?.terms_version || body?.termsVersion, env),
      termsAcceptedAt: String(body?.terms_accepted_at || body?.termsAcceptedAt || "").trim() || null,
      metadata: trustedGoogle
        ? finalizedProfileMetadata({ finalizedAt: new Date().toISOString(), source: "firebase_google" })
        : undefined,
    })
  } catch (error) {
    if (String(error instanceof Error ? error.message : error || "") === "profile_email_already_linked") {
      return errorJson(request, "AUTH_PROVIDER_COLLISION", 409, false)
    }
    throw error
  }
  let tokenRefreshRequired = false
  if (isFinalizedProfile(profile, firebaseUser) && !isSaturnFinalizedClaim(firebaseUser.accountClaims)) {
    await setFirebaseUserFinalizedClaim(env, firebaseUser.userId)
    tokenRefreshRequired = true
  } else if (!isSaturnFinalizedClaim(firebaseUser.tokenClaims)) {
    tokenRefreshRequired = true
  }
  return json({
    success: true,
    profile: profileProjection(profile, firebaseUser),
    profile_state: profile.account_status === "active" ? "ready" : profile.account_status === "suspended" ? "disabled" : "ready",
    email_verification_state: profile.email_verified ? "verified" : "unverified",
    token_refresh_required: tokenRefreshRequired,
  })
}

async function handleAccountSubscription(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => null)
  const idToken = String(body?.id_token || "").trim()
  if (!idToken) return json({ success: false, error: "missing_id_token" }, 400)
  const account = await requireFinalizedAccount(request, env, idToken)
  if (account instanceof Response) return account
  const { firebaseUser, profile } = account
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
      display_name: profile?.display_name || firebaseUser.displayName || null,
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
  const account = await requireFinalizedAccount(request, env, idToken)
  if (account instanceof Response) return account
  const { firebaseUser, profile } = account
  return json({
    success: true,
    user: {
      id: firebaseUser.userId,
      email: firebaseUser.email,
      display_name: profile?.display_name || firebaseUser.displayName || null,
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
  const account = await requireFinalizedAccount(request, env, idToken, { allowPendingDeletion: true })
  if (account instanceof Response) return account
  const { firebaseUser, profile } = account
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
  const account = await requireFinalizedAccount(request, env, idToken, { allowPendingDeletion: true })
  if (account instanceof Response) return account
  const { firebaseUser } = account
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
  const account = await requireFinalizedAccount(request, env, idToken, { allowPendingDeletion: true })
  if (account instanceof Response) return account
  const { firebaseUser } = account
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
      if (request.method === "GET" && apiPath === "/internal/subscription-email-candidates") {
        return await handleSubscriptionEmailCandidates(request, env)
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
      if (request.method === "POST" && apiPath === "/account/device-change/request") {
        const res = await handleAccountDeviceChangeRequest(request, env)
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
      if (request.method === "POST" && apiPath === "/email-verification/start") {
        const res = await handlePendingRegistrationStart(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/email-verification/verify") {
        const res = await handleEmailVerificationVerify(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/email-verification/finalize") {
        const res = await handlePendingRegistrationFinalize(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/email-verification/status") {
        const res = await handleEmailVerificationStatus(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && apiPath === "/email-verification/cancel") {
        const res = await handleEmailVerificationCancel(request, env)
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
