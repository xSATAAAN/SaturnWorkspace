const PAYMENT_ORDER_TTL_MS = 1000 * 60 * 60 * 24
import { encodeFilterValue, supabaseJson } from "./supabase.js"

function money(plan, field) {
  const amount = Number(plan?.[field])
  return Number.isFinite(amount) ? amount : null
}

function isPublicPurchasablePlan(plan) {
  return Boolean(
    plan &&
      plan.active &&
      plan.public_visible &&
      plan.purchasable &&
      String(plan.provider || "").trim() &&
      String(plan.provider_price_id || "").trim(),
  )
}

function paymentProviderConfigured(env, provider) {
  const normalized = String(provider || "").trim().toLowerCase()
  if (!normalized) return false
  if (normalized === "stripe") return Boolean(String(env.STRIPE_SECRET_KEY || "").trim())
  if (normalized === "nowpayments") return Boolean(String(env.NOWPAYMENTS_API_KEY || "").trim())
  return false
}

function isPublicVisiblePlan(plan) {
  return Boolean(plan && plan.active && plan.public_visible)
}

export function toPublicPlan(plan, env = {}) {
  const currency = String(plan.currency || "USD").toUpperCase()
  const amount = money(plan, "price_minor")
  const original = money(plan, "original_price_minor")
  const providerReady = paymentProviderConfigured(env, plan.provider)
  const checkoutEnabled = isPublicPurchasablePlan(plan) && providerReady
  return {
    id: String(plan.plan_id || ""),
    version: Number(plan.version || 1),
    name: String(plan.display_name || plan.plan_id || ""),
    description: String(plan.description || ""),
    currency,
    amount_minor: amount,
    original_amount_minor: original,
    interval: String(plan.billing_interval || plan.term || ""),
    term: String(plan.term || ""),
    trial_days: Number(plan.trial_days || 0),
    features: Array.isArray(plan.features) ? plan.features : [],
    localizations: plan.localized_content && typeof plan.localized_content === "object" ? plan.localized_content : {},
    visible: Boolean(plan.public_visible),
    active: Boolean(plan.active),
    purchasable: Boolean(plan.purchasable),
    provider_ready: providerReady,
    checkout_enabled: checkoutEnabled,
  }
}

export async function listCommercialPlans(env, { publicOnly = false } = {}) {
  const rows = await supabaseJson(
    env,
    "/commercial_plans?select=*&order=display_order.asc,plan_id.asc,version.desc&limit=100",
  )
  const plans = Array.isArray(rows) ? rows : []
  const filtered = publicOnly ? plans.filter(isPublicVisiblePlan) : plans
  return filtered.map((plan) => toPublicPlan(plan, env))
}

export async function getPlanConfig(env, planId, version = null) {
  const filters = [`plan_id=eq.${encodeFilterValue(planId)}`]
  if (version) filters.push(`version=eq.${encodeFilterValue(version)}`)
  const rows = await supabaseJson(
    env,
    `/commercial_plans?${filters.join("&")}&select=*&order=version.desc&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] || null : null
}

export async function createOrder(env, payload) {
  const plan = await getPlanConfig(env, payload.plan, payload.plan_version)
  if (!plan || !isPublicPurchasablePlan(plan)) {
    throw new Error("plan_not_purchasable")
  }
  const idempotencyHash = String(payload.idempotency_key_hash || "").trim()
  if (!idempotencyHash) throw new Error("missing_idempotency_key")
  const existing = await supabaseJson(
    env,
    `/commercial_orders?idempotency_key_hash=eq.${encodeFilterValue(idempotencyHash)}&select=*&limit=1`,
  )
  if (Array.isArray(existing) && existing[0]) return existing[0]
  if (!paymentProviderConfigured(env, plan.provider)) {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + PAYMENT_ORDER_TTL_MS).toISOString()
    const rows = await supabaseJson(env, "/commercial_orders?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        firebase_uid: payload.firebase_user_id,
        user_email: payload.customer?.email || null,
        plan_id: plan.plan_id,
        plan_version: plan.version,
        status: "provider_unavailable",
        currency: plan.currency || "USD",
        amount_minor: plan.price_minor,
        provider: plan.provider || null,
        idempotency_key_hash: idempotencyHash,
        expires_at: expiresAt,
        metadata: {
          reason: "payment_provider_unavailable",
          locale: payload.locale || "en",
        },
      }),
    })
    const order = rows?.[0] || null
    if (!order) throw new Error("order_create_failed")
    return order
  }
  throw new Error("payment_provider_not_implemented")
}

export async function getOrder(env, orderId) {
  const rows = await supabaseJson(
    env,
    `/commercial_orders?id=eq.${encodeFilterValue(orderId)}&select=*&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] || null : null
}

export function toPublicOrder(order) {
  return {
    success: true,
    order_id: String(order.id || ""),
    status: String(order.status || ""),
    plan: String(order.plan_id || ""),
    hosted_url: String(order.hosted_url || ""),
    created_at: String(order.created_at || ""),
    expires_at: String(order.expires_at || ""),
  }
}
