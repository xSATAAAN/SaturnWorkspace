import { ApiError } from '../../api/http'
import { userSafeErrorMessage } from './errorContract'

export async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    method: init.method || 'GET',
    headers: new Headers(init.headers || {}),
  })
  return readJsonResponse<T>(response)
}

export async function postJson<T>(url: string, body: unknown, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {})
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, {
    ...init,
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  return readJsonResponse<T>(response)
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const raw = await response.text()
  let payload: unknown
  try {
    payload = raw ? JSON.parse(raw) : undefined
  } catch {
    payload = undefined
  }
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : raw || `request_failed_${response.status}`
    const retryAfterHeader = Number(response.headers.get('Retry-After') || '')
    const retryAfterPayload =
      typeof payload === 'object' && payload !== null && 'retry_after_seconds' in payload
        ? Number((payload as { retry_after_seconds?: unknown }).retry_after_seconds)
        : NaN
    const retryAfterSeconds =
      Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader
        : Number.isFinite(retryAfterPayload) && retryAfterPayload > 0
          ? retryAfterPayload
          : undefined
    throw new ApiError(userSafeErrorMessage(message, response.status), response.status, payload, retryAfterSeconds)
  }
  return payload as T
}
