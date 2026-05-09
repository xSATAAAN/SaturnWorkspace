type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export function allowRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (current.count >= limit) return false
  current.count += 1
  return true
}
