export async function createEnotInvoice(env, order) {
  const apiKey = String(env.ENOT_API_KEY || '').trim()
  const merchantId = String(env.ENOT_MERCHANT_ID || '').trim()
  const endpoint = String(env.ENOT_CREATE_URL || '').trim() || 'https://api.enot.io/v1/payment/create'
  const successBaseUrl = String(env.ENOT_SUCCESS_URL || '').trim()
  const failBaseUrl = String(env.ENOT_FAIL_URL || '').trim()

  if (!apiKey || !merchantId) {
    return {
      success: false,
      fallbackMessage: `Order ${order.order_id} (${order.plan}) is created. Continue manually with support for payment confirmation.`,
    }
  }

  const body = {
    merchant_id: merchantId,
    amount: Number(order.pricing?.amount_egp || 0) / 100,
    currency: String(order.pricing?.currency || 'EGP'),
    order_id: order.order_id,
    description: `SATAN Toolkit ${order.pricing?.display_name || order.plan}`,
    success_url: successBaseUrl || undefined,
    fail_url: failBaseUrl || undefined,
    customer: {
      email: order.customer?.email || undefined,
      phone: order.customer?.phone || undefined,
    },
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new Error('enot_create_failed')
  }

  const hostedUrl = String(payload?.hosted_url || payload?.payment_url || payload?.url || '').trim()
  const providerPaymentId = String(payload?.payment_id || payload?.id || '').trim()

  return {
    success: true,
    hostedUrl,
    providerPaymentId,
    raw: payload,
  }
}
