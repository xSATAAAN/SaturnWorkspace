import { enforceBrowserOrigin, enforcePaymentRateLimit } from '../security/payments.js'
import { parseCreatePaymentRequest } from '../validation/payments.js'

const PLAN_LABELS = {
  monthly: 'Monthly license',
  yearly: 'Yearly license',
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

export async function handleCreatePayment(request, env) {
  enforceBrowserOrigin(request, env)
  enforcePaymentRateLimit(request, 'create')
  const payload = await parseCreatePaymentRequest(request)
  const orderId = makeManualOrderId()
  return {
    success: true,
    order_id: orderId,
    status: 'created',
    fallback_telegram_message: buildFallbackMessage(orderId, payload),
  }
}

export async function handleGetPaymentStatus(request, orderId, env) {
  enforcePaymentRateLimit(request, 'status')
  const normalizedOrderId = String(orderId || '').trim()
  if (!normalizedOrderId) throw new Error('missing_order_id')
  return {
    success: true,
    order_id: normalizedOrderId,
    status: 'created',
    gateway: 'manual',
  }
}
