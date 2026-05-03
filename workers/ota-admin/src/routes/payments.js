import { createEnotInvoice } from '../services/enot.js'
import {
  enforceBrowserOrigin,
  enforcePaymentRateLimit,
  enforceWebhookReplay,
  verifyWebhookSignature,
} from '../security/payments.js'
import { createOrder, getOrder, saveOrder, toPublicOrder } from '../services/orders.js'
import { parseCreatePaymentRequest } from '../validation/payments.js'

export async function handleCreatePayment(request, env) {
  enforceBrowserOrigin(request, env)
  enforcePaymentRateLimit(request, 'create')
  const payload = await parseCreatePaymentRequest(request)
  const order = await createOrder(env, payload)
  const providerResult = await createEnotInvoice(env, order)

  if (providerResult.success && providerResult.hostedUrl) {
    const updatedOrder = await saveOrder(
      env,
      {
        ...order,
        status: 'pending',
        provider: {
          ...order.provider,
          hosted_url: providerResult.hostedUrl,
          provider_payment_id: providerResult.providerPaymentId || '',
          raw_response: providerResult.raw || null,
        },
      },
      { at: new Date().toISOString(), event: 'provider_created' },
    )
    return {
      ...toPublicOrder(updatedOrder),
      hosted_url: updatedOrder.provider.hosted_url,
    }
  }

  const fallbackMessage = providerResult.fallbackMessage || `Order ${order.order_id} created.`
  const updatedOrder = await saveOrder(
    env,
    {
      ...order,
      status: 'pending',
    },
    { at: new Date().toISOString(), event: 'manual_fallback' },
  )
  return {
    ...toPublicOrder(updatedOrder),
    fallback_telegram_message: fallbackMessage,
  }
}

export async function handleGetPaymentStatus(request, orderId, env) {
  enforcePaymentRateLimit(request, 'status')
  const normalizedOrderId = String(orderId || '').trim()
  if (!normalizedOrderId) throw new Error('missing_order_id')
  const order = await getOrder(env, normalizedOrderId)
  if (!order) throw new Error('order_not_found')
  return toPublicOrder(order)
}

export async function handlePaymentWebhook(request, env) {
  const rawBody = await request.text()
  await verifyWebhookSignature(request, rawBody, env)
  let payload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw new Error('invalid_json')
  }
  enforceWebhookReplay(payload)
  const orderId = String(payload?.order_id || payload?.orderId || '').trim()
  if (!orderId) throw new Error('missing_order_id')
  const order = await getOrder(env, orderId)
  if (!order) throw new Error('order_not_found')

  const rawStatus = String(payload?.status || '').toLowerCase()
  const nextStatus = rawStatus === 'paid' || rawStatus === 'success' ? 'paid' : rawStatus === 'failed' ? 'failed' : 'pending'

  await saveOrder(
    env,
    {
      ...order,
      status: nextStatus,
      provider: {
        ...order.provider,
        webhook: payload,
      },
    },
    { at: new Date().toISOString(), event: `webhook_${nextStatus}` },
  )

  return {
    success: true,
    order_id: orderId,
    status: nextStatus,
  }
}
