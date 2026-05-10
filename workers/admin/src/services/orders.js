const ORDER_PREFIX = 'payments/orders/'
const ORDER_TTL_MS = 1000 * 60 * 60 * 24 * 3

const PLAN_CATALOG = {
  monthly: {
    code: 'monthly',
    display_name: 'Monthly Subscription',
    amount_cents: 2000,
    currency: 'USD',
  },
  yearly: {
    code: 'yearly',
    display_name: 'Yearly Subscription (promotional)',
    amount_cents: 12000,
    currency: 'USD',
  },
}

function orderKey(orderId) {
  return `${ORDER_PREFIX}${orderId}.json`
}

function makeOrderId() {
  const nonce = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
  const stamp = Date.now().toString(16).slice(-8).toUpperCase()
  return `STK-${stamp}-${nonce}`
}

export function getPlanConfig(plan) {
  const code = plan === 'six_months' ? 'yearly' : plan
  return PLAN_CATALOG[code] || null
}

export async function createOrder(env, payload) {
  const orderId = makeOrderId()
  const now = Date.now()
  const record = {
    order_id: orderId,
    status: 'created',
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + ORDER_TTL_MS).toISOString(),
    plan: payload.plan,
    locale: payload.locale || 'en',
    firebase_user_id: payload.firebase_user_id || '',
    user_email: payload.customer?.email || '',
    customer: {
      email: payload.customer?.email || '',
      phone: payload.customer?.phone || '',
      contact: payload.customer?.contact || '',
    },
    notes: payload.notes || '',
    pricing: getPlanConfig(payload.plan),
    provider: {
      name: 'manual',
      hosted_url: '',
      provider_payment_id: '',
    },
    history: [
      {
        at: new Date(now).toISOString(),
        event: 'created',
      },
    ],
  }
  await env.OTA_BUCKET.put(orderKey(orderId), JSON.stringify(record, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  })
  return record
}

export async function getOrder(env, orderId) {
  const obj = await env.OTA_BUCKET.get(orderKey(orderId))
  if (!obj) return null
  return obj.json()
}

export async function saveOrder(env, record, nextEvent) {
  const history = Array.isArray(record.history) ? record.history : []
  if (nextEvent) history.push(nextEvent)
  const nextRecord = { ...record, history }
  await env.OTA_BUCKET.put(orderKey(record.order_id), JSON.stringify(nextRecord, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  })
  return nextRecord
}

export function toPublicOrder(order) {
  return {
    success: true,
    order_id: String(order.order_id || ''),
    status: String(order.status || 'created'),
    plan: String(order.plan || ''),
    hosted_url: String(order.provider?.hosted_url || ''),
    created_at: String(order.created_at || ''),
    expires_at: String(order.expires_at || ''),
  }
}
