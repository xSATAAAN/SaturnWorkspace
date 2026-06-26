export class ApiError extends Error {
  status: number
  payload?: unknown
  retryAfterSeconds?: number

  constructor(message: string, status: number, payload?: unknown, retryAfterSeconds?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export async function postJson<TResponse>(url: string, body: unknown): Promise<TResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = undefined
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `request_failed_${response.status}`
    const retryAfterSeconds = Number(response.headers.get('Retry-After') || '')
    throw new ApiError(message, response.status, payload, Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : undefined)
  }

  return payload as TResponse
}
