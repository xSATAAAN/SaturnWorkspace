import { enforceBrowserOrigin, enforcePaymentRateLimit } from "../security/payments.js"
import { verifyFirebaseCustomer } from "../security/firebaseCustomer.js"
import { createOrder, getOrder, listCommercialPlans, toPublicOrder } from "../services/orders.js"
import { parseCreatePaymentRequest } from "../validation/payments.js"

async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value || ""))
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function handleListPlans(request, env) {
  enforceBrowserOrigin(request, env)
  const plans = await listCommercialPlans(env, { publicOnly: true })
  return {
    success: true,
    source: "supabase_commercial_plans",
    plans,
    checkout_available: plans.some((plan) => plan.checkout_enabled),
  }
}

export async function handleCreatePayment(request, env) {
  enforceBrowserOrigin(request, env)
  enforcePaymentRateLimit(request, "create")
  const payload = await parseCreatePaymentRequest(request)
  const firebaseUser = await verifyFirebaseCustomer(payload.id_token, env)
  const idempotencyKey = String(request.headers.get("Idempotency-Key") || payload.idempotency_key || "").trim()
  if (!idempotencyKey) throw new Error("missing_idempotency_key")
  const customer = {
    ...payload.customer,
    email: firebaseUser.email,
  }
  try {
    const order = await createOrder(env, {
      ...payload,
      customer,
      firebase_user_id: firebaseUser.user_id,
      idempotency_key_hash: await sha256Hex(`payment:${firebaseUser.user_id}:${idempotencyKey}`),
    })
    return toPublicOrder(order)
  } catch (error) {
    const code = String(error?.message || error || "payment_unavailable")
    return {
      success: false,
      error: code,
      code,
      retryable: code === "payment_provider_unavailable",
      checkout_available: false,
    }
  }
}

export async function handleGetPaymentStatus(request, orderId, env) {
  enforcePaymentRateLimit(request, "status")
  const normalizedOrderId = String(orderId || "").trim()
  if (!normalizedOrderId) throw new Error("missing_order_id")
  const order = await getOrder(env, normalizedOrderId).catch(() => null)
  if (!order) {
    return {
      success: false,
      error: "order_not_found",
      code: "order_not_found",
    }
  }
  return toPublicOrder(order)
}
