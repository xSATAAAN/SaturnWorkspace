const LIFECYCLES = new Set([
  "trialing",
  "active",
  "past_due",
  "cancel_at_period_end",
  "cancelled",
  "expired",
  "suspended",
])

const PLAN_TERMS = new Set(["weekly", "monthly", "annual", "lifetime", "custom"])
const RENEWAL_STATES = new Set(["not_applicable", "manual", "auto_renew", "cancel_at_period_end"])
const CURRENT_LIFECYCLES = new Set(["trialing", "active", "past_due", "cancel_at_period_end"])
const LIFETIME_THRESHOLD = Date.parse("9999-01-01T00:00:00Z")

function text(value) {
  return String(value ?? "").trim()
}

function metadata(row) {
  return row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {}
}

function timestamp(value) {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? parsed : null
}

function boolean(value) {
  return value === true || text(value).toLowerCase() === "true"
}

function isLifetime(row) {
  const meta = metadata(row)
  const explicit = text(row?.plan_term || meta.plan_term || meta.plan_intent).toLowerCase()
  const expiry = timestamp(row?.period_end_at || row?.expires_at)
  return explicit === "lifetime" || boolean(row?.is_lifetime) || boolean(meta.is_unlimited) || (expiry !== null && expiry >= LIFETIME_THRESHOLD)
}

export function subscriptionPlanTerm(row) {
  if (!row) return null
  if (isLifetime(row)) return "lifetime"
  const meta = metadata(row)
  const raw = text(row.plan_term || meta.plan_term || meta.plan_intent || row.plan).toLowerCase()
  if (raw === "yearly" || raw === "annual") return "annual"
  if (raw === "manual") return "custom"
  return PLAN_TERMS.has(raw) ? raw : "custom"
}

export function subscriptionLifecycle(row, now = new Date()) {
  if (!row) return null
  const nowMs = now instanceof Date ? now.getTime() : timestamp(now) ?? Date.now()
  const startsAt = timestamp(row.period_start_at || row.starts_at)
  const endsAt = timestamp(row.period_end_at || row.expires_at)
  if (startsAt !== null && startsAt > nowMs) return null

  const rawNormalized = text(row.lifecycle_state).toLowerCase()
  const rawStatus = text(row.status).toLowerCase()
  const raw = rawNormalized || rawStatus
  const normalized = raw === "trial" ? "trialing" : raw === "canceled" ? "cancelled" : raw
  if (rawNormalized && !LIFECYCLES.has(normalized)) return "integrity_conflict"
  if (normalized === "suspended") return "suspended"
  if (normalized === "cancelled") return "cancelled"
  if (!isLifetime(row) && endsAt !== null && endsAt <= nowMs) return "expired"
  if (boolean(row.cancel_at_period_end) || boolean(metadata(row).cancel_at_period_end) || normalized === "cancel_at_period_end") {
    return "cancel_at_period_end"
  }
  if (normalized === "trialing") return "trialing"
  if (normalized === "past_due") return "past_due"
  if (normalized === "expired") return "expired"
  if (normalized === "active") return "active"
  return "integrity_conflict"
}

export function subscriptionRenewalState(row) {
  if (!row || subscriptionPlanTerm(row) === "lifetime") return "not_applicable"
  const meta = metadata(row)
  const explicit = text(row.renewal_state || meta.renewal_state).toLowerCase()
  if (RENEWAL_STATES.has(explicit)) return explicit
  if (boolean(row.cancel_at_period_end) || boolean(meta.cancel_at_period_end)) return "cancel_at_period_end"
  if (boolean(meta.auto_renew) || text(row.provider_subscription_id)) return "auto_renew"
  return "manual"
}

function entitlementFor(row, lifecycle, now = new Date()) {
  if (!row || !lifecycle) return "no_subscription"
  if (lifecycle === "integrity_conflict") return "integrity_conflict"
  if (lifecycle === "suspended") return "suspended"
  if (lifecycle === "expired" || lifecycle === "cancelled") return "expired"
  if (lifecycle === "past_due") {
    const nowMs = now instanceof Date ? now.getTime() : timestamp(now) ?? Date.now()
    const graceEndsAt = timestamp(row.grace_ends_at || metadata(row).grace_ends_at)
    return graceEndsAt !== null && graceEndsAt > nowMs ? "grace_period" : "payment_required"
  }
  return "entitled"
}

function normalizedCurrent(row, lifecycle, now) {
  if (!row) return null
  const planTerm = subscriptionPlanTerm(row)
  const renewal = subscriptionRenewalState(row)
  return {
    subscription_id: text(row.id) || null,
    plan: planTerm,
    plan_term: planTerm,
    lifecycle,
    status: lifecycle,
    renewal_state: renewal,
    entitlement: entitlementFor(row, lifecycle, now),
    starts_at: row.period_start_at || row.starts_at || null,
    expires_at: planTerm === "lifetime" ? null : row.period_end_at || row.expires_at || null,
    trial_starts_at: row.trial_starts_at || null,
    trial_ends_at: row.trial_ends_at || null,
    grace_ends_at: row.grace_ends_at || null,
    cancel_at_period_end: renewal === "cancel_at_period_end",
    tier: row.tier || null,
    source: "supabase_account_subscriptions",
  }
}

function noSubscriptionProjection() {
  return {
    existence: "none",
    lifecycle: null,
    plan_term: null,
    renewal_state: "not_applicable",
    entitlement: "no_subscription",
    current_subscription: null,
    subscription_id: null,
    plan: null,
    status: null,
    starts_at: null,
    expires_at: null,
    source: "supabase_account_subscriptions",
  }
}

function integrityProjection() {
  return {
    ...noSubscriptionProjection(),
    existence: "present",
    lifecycle: "integrity_conflict",
    status: "integrity_conflict",
    entitlement: "integrity_conflict",
  }
}

export function resolveSubscriptionTruth(rows, identity, options = {}) {
  const allRows = Array.isArray(rows) ? rows.filter(Boolean) : []
  const firebaseUid = text(identity?.firebaseUid || identity?.firebase_uid || identity?.userId)
  const normalizedEmail = text(identity?.email).toLowerCase()
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now())
  const owned = firebaseUid ? allRows.filter((row) => text(row.firebase_user_id) === firebaseUid) : []
  const legacyEmailRows = normalizedEmail
    ? allRows.filter((row) => !text(row.firebase_user_id) && text(row.user_email).toLowerCase() === normalizedEmail)
    : []
  const mismatchedEmailRows = normalizedEmail
    ? allRows.filter((row) => text(row.firebase_user_id) && text(row.firebase_user_id) !== firebaseUid && text(row.user_email).toLowerCase() === normalizedEmail)
    : []

  const evaluated = owned.map((row) => ({ row, lifecycle: subscriptionLifecycle(row, now) }))
  const malformed = evaluated.filter((item) => item.lifecycle === "integrity_conflict")
  const currentCandidates = evaluated.filter((item) => item.lifecycle && CURRENT_LIFECYCLES.has(item.lifecycle))
  const historical = evaluated.filter((item) => !item.lifecycle || !CURRENT_LIFECYCLES.has(item.lifecycle))

  const conflict = malformed.length > 0 || currentCandidates.length > 1
  const selected = conflict ? null : currentCandidates[0] || null
  const current = selected ? normalizedCurrent(selected.row, selected.lifecycle, now) : null
  const projection = conflict
    ? integrityProjection()
    : current
      ? {
          existence: "present",
          lifecycle: current.lifecycle,
          plan_term: current.plan_term,
          renewal_state: current.renewal_state,
          entitlement: current.entitlement,
          current_subscription: current,
          subscription_id: current.subscription_id,
          plan: current.plan,
          status: current.status,
          starts_at: current.starts_at,
          expires_at: current.expires_at,
          source: current.source,
        }
      : noSubscriptionProjection()

  return {
    currentRow: selected?.row || null,
    current,
    projection,
    history: historical.map(({ row, lifecycle }) => ({
      subscription_id: text(row.id) || null,
      lifecycle,
      plan_term: subscriptionPlanTerm(row),
      starts_at: row.period_start_at || row.starts_at || null,
      expires_at: subscriptionPlanTerm(row) === "lifetime" ? null : row.period_end_at || row.expires_at || null,
    })),
    diagnostics: {
      integrity: conflict ? "conflict" : "ok",
      code: malformed.length ? "malformed_current_subscription" : currentCandidates.length > 1 ? "multiple_current_subscriptions" : null,
      authoritative_rows: owned.length,
      current_usable_count: currentCandidates.length,
      historical_count: historical.length,
      legacy_email_candidates: legacyEmailRows.length,
      uid_mismatch_candidates: mismatchedEmailRows.length,
      malformed_rows: malformed.length,
    },
  }
}

export function desktopEntitlementFromProjection(projection) {
  if (!projection) return "unknown"
  if (projection.entitlement === "no_subscription") return "no_subscription"
  if (projection.entitlement === "integrity_conflict" || projection.entitlement === "policy_blocked") return "suspended"
  if (projection.entitlement === "suspended") return "suspended"
  if (projection.entitlement === "expired" || projection.entitlement === "payment_required") return "expired"
  if (projection.entitlement === "grace_period") return "grace"
  if (projection.lifecycle === "trialing") return "trial"
  if (projection.plan_term === "lifetime") return "lifetime"
  return projection.entitlement === "entitled" ? "active" : "unknown"
}
