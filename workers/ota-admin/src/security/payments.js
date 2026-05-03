const RATE_WINDOW_MS = 60_000
const MAX_CREATE_PER_WINDOW = 25
const MAX_STATUS_PER_WINDOW = 80
const WEBHOOK_REPLAY_WINDOW_MS = 1000 * 60 * 10

const rateBuckets = new Map()
const webhookReplayCache = new Map()

function getClientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For') ||
    request.headers.get('X-Real-IP') ||
    'unknown'
  )
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqualString(a, b) {
  const left = String(a || '')
  const right = String(b || '')
  if (!left || !right || left.length !== right.length) return false
  let mismatch = 0
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i)
  }
  return mismatch === 0
}

function cleanupRateBucket(now) {
  for (const [key, value] of rateBuckets.entries()) {
    if (now - value.startedAt > RATE_WINDOW_MS) {
      rateBuckets.delete(key)
    }
  }
}

function cleanupReplayCache(now) {
  for (const [key, value] of webhookReplayCache.entries()) {
    if (now - value > WEBHOOK_REPLAY_WINDOW_MS) {
      webhookReplayCache.delete(key)
    }
  }
}

export function enforceBrowserOrigin(request, env) {
  const allowedOrigin = String(env.PAYMENTS_ALLOWED_ORIGIN || '').trim()
  if (!allowedOrigin) return
  const origin = String(request.headers.get('Origin') || '').trim()
  if (!origin || origin !== allowedOrigin) {
    throw new Error('forbidden_origin')
  }
}

export function enforcePaymentRateLimit(request, type) {
  const now = Date.now()
  cleanupRateBucket(now)
  const ip = getClientIp(request)
  const bucketKey = `${type}:${ip}`
  const max = type === 'create' ? MAX_CREATE_PER_WINDOW : MAX_STATUS_PER_WINDOW
  const current = rateBuckets.get(bucketKey)
  if (!current || now - current.startedAt > RATE_WINDOW_MS) {
    rateBuckets.set(bucketKey, { startedAt: now, count: 1 })
    return
  }
  current.count += 1
  if (current.count > max) {
    throw new Error('rate_limited')
  }
}

export async function verifyWebhookSignature(request, rawBody, env) {
  const secret = String(env.ENOT_WEBHOOK_SECRET || '').trim()
  if (!secret) {
    throw new Error('missing_webhook_secret')
  }
  const sent = String(request.headers.get('x-enot-signature') || request.headers.get('x-signature') || '').trim()
  if (!sent) {
    throw new Error('missing_webhook_signature')
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expectedHex = toHex(digest)
  const expectedSha256 = `sha256=${expectedHex}`
  if (!timingSafeEqualString(sent, expectedHex) && !timingSafeEqualString(sent, expectedSha256)) {
    throw new Error('invalid_webhook_signature')
  }
}

export function enforceWebhookReplay(payload) {
  const now = Date.now()
  cleanupReplayCache(now)
  const eventId = String(payload?.event_id || payload?.id || '').trim()
  const orderId = String(payload?.order_id || payload?.orderId || '').trim()
  const paymentId = String(payload?.payment_id || payload?.paymentId || '').trim()
  const status = String(payload?.status || '').trim()
  const replayKey = eventId || `${orderId}:${paymentId}:${status}`
  if (!replayKey) throw new Error('invalid_webhook_payload')
  if (webhookReplayCache.has(replayKey)) throw new Error('duplicate_webhook')
  webhookReplayCache.set(replayKey, now)
}
