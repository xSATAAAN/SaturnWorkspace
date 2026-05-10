const AUTH_BASE = 'https://auth.saturnws.com'

export type AccountSubscription = {
  success: boolean
  user?: {
    id: string
    email: string
  }
  subscription?: {
    status: string
    tier?: string
    subscription_id?: string
    user_email?: string
    plan?: string
    expires_at?: string
    runtime_payload?: Record<string, unknown>
  } | null
  status?: string
  error?: string
}

export async function fetchAccountSubscription(idToken: string) {
  const response = await fetch(`${AUTH_BASE}/account/subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  })
  const payload = (await response.json().catch(() => null)) as AccountSubscription | null
  if (!response.ok) {
    throw new Error(payload?.error || `account_request_failed_${response.status}`)
  }
  return payload || { success: false, error: 'empty_response' }
}
