import { enforceBrowserOrigin, enforcePaymentRateLimit } from '../security/payments.js'
import { createOrder, getOrder, toPublicOrder } from '../services/orders.js'
import { parseCreatePaymentRequest } from '../validation/payments.js'

const PLAN_LABELS = {
  monthly: 'Monthly subscription',
  yearly: 'Yearly subscription',
}

function makeManualOrderId() {
  const nonce = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
  const stamp = Date.now().toString(16).slice(-8).toUpperCase()
  return `SATURN-${stamp}-${nonce}`
}

function buildFallbackMessage(orderId, payload) {
  const lines = [
    `Saturn Workspace manual order`,
    `Order: ${orderId}`,
    `Plan: ${PLAN_LABELS[payload.plan] || payload.plan}`,
  ]
  if (payload.customer?.email) lines.push(`Email: ${payload.customer.email}`)
  if (payload.customer?.phone) lines.push(`Phone: ${payload.customer.phone}`)
  if (payload.notes) lines.push(`Notes: ${payload.notes}`)
  lines.push('Payment gateway is not enabled yet. Please confirm payment method with support.')
  return lines.join('\n')
}

async function verifyFirebaseCustomer(idToken, env) {
  const token = String(idToken || '').trim()
  if (!token) return null
  const webApiKey = String(env.FIREBASE_WEB_API_KEY || '').trim()
  if (!webApiKey) throw new Error('firebase_not_configured')
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(webApiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ idToken: token }),
  })
  if (!response.ok) throw new Error('firebase_token_invalid')
  const payload = await response.json().catch(() => null)
  const user = payload?.users?.[0]
  const userId = String(user?.localId || '').trim()
  const email = String(user?.email || '').trim().toLowerCase()
  const emailVerified = Boolean(user?.emailVerified)
  if (!userId || !email || !emailVerified) throw new Error('firebase_user_not_verified')
  return { user_id: userId, email }
}

export async function handleCreatePayment(request, env) {
  enforceBrowserOrigin(request, env)
  enforcePaymentRateLimit(request, 'create')
  const payload = await parseCreatePaymentRequest(request)
  const firebaseUser = await verifyFirebaseCustomer(payload.id_token, env)
  const customer = {
    ...payload.customer,
    email: firebaseUser?.email || payload.customer?.email || '',
  }
  const order = await createOrder(env, {
    ...payload,
    customer,
    firebase_user_id: firebaseUser?.user_id || '',
  }).catch(() => null)
  const orderId = order?.order_id || makeManualOrderId()
  return {
    success: true,
    order_id: orderId,
    status: 'created',
    fallback_telegram_message: buildFallbackMessage(orderId, { ...payload, customer }),
  }
}

export async function handleGetPaymentStatus(request, orderId, env) {
  enforcePaymentRateLimit(request, 'status')
  const normalizedOrderId = String(orderId || '').trim()
  if (!normalizedOrderId) throw new Error('missing_order_id')
  const order = await getOrder(env, normalizedOrderId).catch(() => null)
  if (order) return toPublicOrder(order)
  return {
    success: true,
    order_id: normalizedOrderId,
    status: 'created',
    gateway: 'manual',
  }
}
