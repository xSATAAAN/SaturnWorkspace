import { encodeFilterValue, supabaseJson } from "../services/supabase.js"

const ROLE_PERMISSIONS = Object.freeze({
  super_admin: ["*"],
  support: ["admin:read", "users:read", "support:write", "communications:write", "sessions:revoke"],
  billing: ["admin:read", "users:read", "subscriptions:read", "subscriptions:write", "promotions:write", "commerce:read"],
  release_manager: ["admin:read", "releases:read", "releases:write"],
  security_auditor: ["admin:read", "users:read", "subscriptions:read", "diagnostics:read", "diagnostics:write", "policies:read", "policies:write", "audit:read", "sessions:revoke"],
  read_only: ["admin:read", "users:read", "subscriptions:read", "releases:read", "diagnostics:read", "policies:read", "audit:read"],
})

const ROLE_ALIASES = Object.freeze({
  security: "security_auditor",
  auditor: "security_auditor",
})

function normalizeAdminRole(role) {
  const normalized = String(role || "").trim().toLowerCase()
  return ROLE_ALIASES[normalized] || normalized
}

const REASON_CODES = new Set([
  "admin_action",
  "customer_request",
  "security_review",
  "technical_support",
  "billing_correction",
  "subscription_recovery",
  "policy_enforcement",
  "other",
])

function parseRoleAssignments(env) {
  const raw = String(env.ADMIN_ROLE_ASSIGNMENTS || "").trim()
  if (!raw) return { byEmail: {}, byUid: {}, configured: false }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { byEmail: {}, byUid: {}, configured: false }
    const byEmailSource = parsed.by_email && typeof parsed.by_email === "object" && !Array.isArray(parsed.by_email)
      ? parsed.by_email
      : parsed
    const byUidSource = parsed.by_uid && typeof parsed.by_uid === "object" && !Array.isArray(parsed.by_uid)
      ? parsed.by_uid
      : {}
    const byEmail = Object.fromEntries(
      Object.entries(byEmailSource)
        .filter(([key]) => !["by_email", "by_uid"].includes(String(key).trim().toLowerCase()))
        .map(([email, role]) => [String(email).trim().toLowerCase(), normalizeAdminRole(role)])
        .filter(([email, role]) => email && Object.hasOwn(ROLE_PERMISSIONS, role)),
    )
    const byUid = Object.fromEntries(
      Object.entries(byUidSource)
        .map(([uid, role]) => [String(uid).trim(), normalizeAdminRole(role)])
        .filter(([uid, role]) => uid && Object.hasOwn(ROLE_PERMISSIONS, role)),
    )
    return { byEmail, byUid, configured: Object.keys(byEmail).length > 0 || Object.keys(byUid).length > 0 }
  } catch {
    return { byEmail: {}, byUid: {}, configured: false }
  }
}

export function adminRoleAssignmentsState(env) {
  return parseRoleAssignments(env).configured ? "configured" : "default_super_admin_compatibility"
}

export function adminContext(env, identityOrEmail) {
  const identity = identityOrEmail && typeof identityOrEmail === "object"
    ? identityOrEmail
    : { email: identityOrEmail, uid: null }
  const normalizedEmail = String(identity.email || "").trim().toLowerCase()
  const firebaseUid = String(identity.uid || identity.firebase_uid || "").trim()
  const assignments = parseRoleAssignments(env)
  const role = normalizedEmail === "token-admin"
    ? "super_admin"
    : assignments.byUid[firebaseUid] || assignments.byEmail[normalizedEmail] || (assignments.configured ? "read_only" : "super_admin")
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.read_only
  return { email: normalizedEmail, firebase_uid: firebaseUid || null, role, permissions: [...permissions] }
}

export function requirePermission(context, permission) {
  if (!context || (!context.permissions.includes("*") && !context.permissions.includes(permission))) {
    throw new Error("admin_permission_denied")
  }
  return context
}

function cleanReason(body) {
  const reasonCode = String(body?.reason_code || "").trim().toLowerCase()
  const reasonNote = String(body?.reason_note || "").trim().slice(0, 1000)
  if (!REASON_CODES.has(reasonCode)) throw new Error("invalid_reason_code")
  if (reasonCode === "other" && reasonNote.length < 3) throw new Error("reason_note_required")
  return { reasonCode, reasonNote: reasonNote || null }
}

function cleanRequestId(body) {
  const requestId = String(body?.request_id || "").trim()
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(requestId)) throw new Error("invalid_request_id")
  return requestId
}

function cleanOperationalText(value, max = 160) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
}

function emailSecurityEnabled(env) {
  return String(env.EMAIL_SECURITY_ENABLED || "").trim().toLowerCase() === "true"
}

async function enqueueAccountLifecycleEmail(env, preview, requestId) {
  if (!emailSecurityEnabled(env)) return { queued: false, skipped: "security_email_disabled" }
  const url = String(env.ADMIN_EMAIL_ENQUEUE_URL || "").trim()
  const token = String(env.ADMIN_EMAIL_ENQUEUE_TOKEN || "").trim()
  const email = String(preview?.target?.email || "").trim().toLowerCase()
  if (!url || !token) return { queued: false, skipped: "security_email_not_configured" }
  if (!email || !email.includes("@")) return { queued: false, skipped: "recipient_missing" }

  const eventType = preview.action === "suspend"
    ? "account.suspended"
    : preview.action === "reactivate"
      ? "account.reactivated"
      : ""
  if (!eventType) return { queued: false, skipped: "event_not_required" }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      event_type: eventType,
      idempotency_key: `admin-account-lifecycle:${eventType}:${preview.target.firebase_uid}:${requestId}`,
      user_id: preview.target.firebase_uid,
      recipient: email,
      locale: "ar",
      payload: {
        reason: cleanOperationalText(preview.reason_note || preview.reason_code || "admin_action", 240),
        action_url: "https://saturnws.com/account",
      },
    }),
  })
  if (!response.ok) return { queued: false, skipped: `security_email_enqueue_${response.status}` }
  const payload = await response.json().catch(() => ({}))
  return { queued: Boolean(payload?.job_id), skipped: payload?.job_id ? undefined : "security_email_suppressed" }
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

async function loadProfile(env, firebaseUid) {
  const rows = await supabaseJson(
    env,
    `/account_profiles?select=firebase_uid,display_name,normalized_email,email_verified,email_verified_at,verification_source,auth_providers,locale,account_status,created_at,updated_at&firebase_uid=eq.${encodeFilterValue(firebaseUid)}&limit=1`,
  )
  const profile = Array.isArray(rows) ? rows[0] : null
  if (!profile) throw new Error("account_not_found")
  return profile
}

async function loadSubscription(env, subscriptionId) {
  const rows = await supabaseJson(
    env,
    `/account_subscriptions?select=*&id=eq.${encodeFilterValue(subscriptionId)}&limit=1`,
  )
  const subscription = Array.isArray(rows) ? rows[0] : null
  if (!subscription) throw new Error("subscription_not_found")
  return subscription
}

function accountNextState(current, action) {
  if (current === "deleted") throw new Error("deleted_account_immutable")
  if (action === "suspend") {
    if (!["active", "pending_deletion", "suspended"].includes(current)) throw new Error("invalid_account_transition")
    return "suspended"
  }
  if (action === "reactivate") {
    if (!["suspended", "pending_deletion", "active"].includes(current)) throw new Error("invalid_account_transition")
    return "active"
  }
  if (action === "mark_pending_deletion") return "pending_deletion"
  throw new Error("invalid_account_action")
}

export async function previewAccountLifecycle(env, context, firebaseUid, body) {
  requirePermission(context, "users:write")
  const profile = await loadProfile(env, firebaseUid)
  const action = String(body?.action || "").trim()
  const { reasonCode, reasonNote } = cleanReason(body)
  const resultingStatus = accountNextState(profile.account_status, action)
  const payload = {
    target: { firebase_uid: profile.firebase_uid, display_name: profile.display_name, email: profile.normalized_email },
    action,
    current_status: profile.account_status,
    resulting_status: resultingStatus,
    sessions_will_be_revoked: ["suspended", "pending_deletion"].includes(resultingStatus),
    reason_code: reasonCode,
    reason_note: reasonNote,
    expected_updated_at: profile.updated_at,
  }
  return { ...payload, preview_hash: await sha256(stableJson(payload)) }
}

export async function executeAccountLifecycle(env, context, firebaseUid, body) {
  requirePermission(context, "users:write")
  const requestId = cleanRequestId(body)
  const preview = await previewAccountLifecycle(env, context, firebaseUid, body)
  if (String(body?.preview_hash || "") !== preview.preview_hash) throw new Error("preview_changed")
  const result = await supabaseJson(env, "/rpc/admin_account_lifecycle_transition", {
    method: "POST",
    body: JSON.stringify({
      p_firebase_uid: firebaseUid,
      p_action: preview.action,
      p_reason_code: preview.reason_code,
      p_reason_note: preview.reason_note,
      p_actor_email: context.email,
      p_actor_role: context.role,
      p_request_id: requestId,
      p_expected_updated_at: preview.expected_updated_at,
    }),
  })
  await enqueueAccountLifecycleEmail(env, preview, requestId).catch(() => null)
  return result
}

function previewSubscriptionResult(subscription, action, newExpiry) {
  const current = subscription.lifecycle_state || subscription.status
  if (subscription.integrity_state && subscription.integrity_state !== "ok") throw new Error("subscription_integrity_conflict")
  if (["suspend", "revoke_entitlement"].includes(action)) return { lifecycle: "suspended", entitlement: "suspended" }
  if (action === "resume") {
    if (current !== "suspended") throw new Error("invalid_subscription_transition")
    return { lifecycle: "active", entitlement: "active" }
  }
  if (action === "cancel_at_period_end") {
    if (subscription.plan_term === "lifetime") throw new Error("lifetime_cannot_cancel_at_period_end")
    if (!["trialing", "active", "past_due"].includes(current)) throw new Error("invalid_subscription_transition")
    return { lifecycle: "cancel_at_period_end", entitlement: "active_until_period_end" }
  }
  if (action === "cancel_now") return { lifecycle: "cancelled", entitlement: "none" }
  if (action === "end_trial") {
    if (current !== "trialing") throw new Error("invalid_subscription_transition")
    return { lifecycle: "active", entitlement: "active" }
  }
  if (action === "correct_expiry") {
    const expiry = Date.parse(String(newExpiry || ""))
    if (!Number.isFinite(expiry) || expiry <= Date.parse(subscription.starts_at)) throw new Error("invalid_new_expiry")
    if (subscription.plan_term === "lifetime") throw new Error("lifetime_has_no_expiry")
    return { lifecycle: expiry > Date.now() ? "active" : "expired", entitlement: expiry > Date.now() ? "active" : "none", expires_at: new Date(expiry).toISOString() }
  }
  throw new Error("invalid_subscription_action")
}

export async function previewSubscriptionTransition(env, context, subscriptionId, body) {
  requirePermission(context, "subscriptions:write")
  const subscription = await loadSubscription(env, subscriptionId)
  const action = String(body?.action || "").trim()
  const { reasonCode, reasonNote } = cleanReason(body)
  const result = previewSubscriptionResult(subscription, action, body?.new_expiry)
  const payload = {
    target: { subscription_id: subscription.id, firebase_uid: subscription.firebase_user_id, email: subscription.user_email },
    action,
    current: { lifecycle: subscription.lifecycle_state || subscription.status, entitlement: subscription.is_current ? "current" : "history", expires_at: subscription.period_end_at || subscription.expires_at },
    resulting: result,
    sessions_will_be_revoked: ["suspended", "cancelled", "expired"].includes(result.lifecycle),
    reason_code: reasonCode,
    reason_note: reasonNote,
    expected_updated_at: subscription.updated_at,
  }
  return { ...payload, preview_hash: await sha256(stableJson(payload)) }
}

export async function executeSubscriptionTransition(env, context, subscriptionId, body) {
  requirePermission(context, "subscriptions:write")
  const requestId = cleanRequestId(body)
  const preview = await previewSubscriptionTransition(env, context, subscriptionId, body)
  if (String(body?.preview_hash || "") !== preview.preview_hash) throw new Error("preview_changed")
  return supabaseJson(env, "/rpc/admin_subscription_transition", {
    method: "POST",
    body: JSON.stringify({
      p_subscription_id: subscriptionId,
      p_action: preview.action,
      p_reason_code: preview.reason_code,
      p_reason_note: preview.reason_note,
      p_actor_email: context.email,
      p_actor_role: context.role,
      p_request_id: requestId,
      p_expected_updated_at: preview.expected_updated_at,
      p_new_expiry: preview.resulting.expires_at || null,
    }),
  })
}

export async function previewAccessRevocation(env, context, firebaseUid, body) {
  requirePermission(context, "sessions:revoke")
  const profile = await loadProfile(env, firebaseUid)
  const scope = String(body?.scope || "").trim()
  const targetId = String(body?.target_id || "").trim()
  if (!['session', 'device', 'all'].includes(scope)) throw new Error("invalid_revoke_scope")
  if (scope !== 'all' && !targetId) throw new Error("missing_revoke_target")
  const { reasonCode, reasonNote } = cleanReason(body)
  const payload = {
    target: { firebase_uid: profile.firebase_uid, display_name: profile.display_name, email: profile.normalized_email },
    scope,
    target_id: scope === 'all' ? null : targetId,
    reason_code: reasonCode,
    reason_note: reasonNote,
  }
  return { ...payload, preview_hash: await sha256(stableJson(payload)) }
}

export async function executeAccessRevocation(env, context, firebaseUid, body) {
  requirePermission(context, "sessions:revoke")
  const requestId = cleanRequestId(body)
  const preview = await previewAccessRevocation(env, context, firebaseUid, body)
  if (String(body?.preview_hash || "") !== preview.preview_hash) throw new Error("preview_changed")
  return supabaseJson(env, "/rpc/admin_revoke_account_access", {
    method: "POST",
    body: JSON.stringify({
      p_firebase_uid: firebaseUid,
      p_scope: preview.scope,
      p_target_id: preview.target_id,
      p_reason_code: preview.reason_code,
      p_reason_note: preview.reason_note,
      p_actor_email: context.email,
      p_actor_role: context.role,
      p_request_id: requestId,
    }),
  })
}

export async function listRecoveryEvidence(env, context, firebaseUid) {
  requirePermission(context, "subscriptions:write")
  const now = encodeFilterValue(new Date().toISOString())
  const rows = await supabaseJson(
    env,
    `/subscription_recovery_ledger?select=id,firebase_uid,subscription_id,evidence_type,evidence_reference,remaining_seconds,status,created_at,expires_at&firebase_uid=eq.${encodeFilterValue(firebaseUid)}&status=eq.available&or=(expires_at.is.null,expires_at.gt.${now})&order=created_at.desc&limit=50`,
  )
  return { items: Array.isArray(rows) ? rows : [] }
}

export const adminRolePermissions = ROLE_PERMISSIONS
