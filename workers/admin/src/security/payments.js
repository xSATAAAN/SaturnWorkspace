const RATE_WINDOW_MS = 60_000
const MAX_CREATE_PER_WINDOW = 25
const MAX_STATUS_PER_WINDOW = 80
const MAX_DOWNLOADS_PER_WINDOW = 20

const rateBuckets = new Map()

function getClientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For') ||
    request.headers.get('X-Real-IP') ||
    'unknown'
  )
}

function cleanupRateBucket(now) {
  for (const [key, value] of rateBuckets.entries()) {
    if (now - value.startedAt > RATE_WINDOW_MS) {
      rateBuckets.delete(key)
    }
  }
}

export function enforceBrowserOrigin(request, env) {
  const configuredOrigins = String(env.PAYMENTS_ALLOWED_ORIGIN || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const allowedOrigins = new Set([
    'https://saturnws.com',
    'https://www.saturnws.com',
    ...configuredOrigins,
  ])
  const origin = String(request.headers.get('Origin') || '').trim()
  if (!origin || !allowedOrigins.has(origin)) {
    throw new Error('forbidden_origin')
  }
}

export function enforcePaymentRateLimit(request, type) {
  const now = Date.now()
  cleanupRateBucket(now)
  const ip = getClientIp(request)
  const bucketKey = `${type}:${ip}`
  const max = type === 'create'
    ? MAX_CREATE_PER_WINDOW
    : type === 'download_file'
      ? MAX_DOWNLOADS_PER_WINDOW
      : MAX_STATUS_PER_WINDOW
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
