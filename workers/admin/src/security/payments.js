function getClientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For') ||
    request.headers.get('X-Real-IP') ||
    'unknown'
  )
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

export async function enforcePaymentRateLimit(request, env, type) {
  const ip = getClientIp(request)
  const limiter = type === 'create'
    ? env.ADMIN_RATE_LIMIT_PAYMENT_CREATE
    : type === 'download_file'
      ? env.ADMIN_RATE_LIMIT_DOWNLOAD
      : env.ADMIN_RATE_LIMIT_READ
  if (!limiter || typeof limiter.limit !== 'function') throw new Error('rate_limit_unavailable')
  const result = await limiter.limit({ key: `${type}:${ip}` }).catch(() => null)
  if (!result) throw new Error('rate_limit_unavailable')
  if (!result.success) throw new Error('rate_limited')
}
