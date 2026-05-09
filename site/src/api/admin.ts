import { ApiError } from './http'

const ADMIN_BASE = '/api/admin'
const ADMIN_FIREBASE_TOKEN_KEY = 'st_admin_firebase_token'
let inMemoryBearerToken = ''

export type AdminSubscription = {
  id: string
  firebase_user_id?: string | null
  user_email?: string | null
  plan: 'monthly' | 'yearly'
  tier: 'public' | 'private'
  status: 'active' | 'past_due' | 'canceled' | 'expired' | 'suspended'
  hwid?: string | null
  expires_at: string
  created_at: string
}

export type AdminPromoCode = {
  id: string
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  is_private_tier_trigger: boolean
  is_active: boolean
  max_uses?: number | null
  used_count?: number
  expires_at?: string | null
}

export type AdminOtaUpdate = {
  id: string
  version: string
  channel: string
  release_notes: string
  download_url: string
  is_mandatory: boolean
  is_published: boolean
  created_at: string
}

export type AdminCrashLog = {
  id: string
  happened_at: string
  user_id?: string | null
  windows_version?: string | null
  cpu?: string | null
  gpu?: string | null
  ram_gb?: number | null
  error_type: string
  stack_trace: string
}

function getAdminToken() {
  if (inMemoryBearerToken) return inMemoryBearerToken
  return window.sessionStorage.getItem(ADMIN_FIREBASE_TOKEN_KEY) || ''
}

export function setAdminBearerToken(token: string | null) {
  inMemoryBearerToken = token?.trim() || ''
  if (inMemoryBearerToken) {
    window.sessionStorage.setItem(ADMIN_FIREBASE_TOKEN_KEY, inMemoryBearerToken)
    return
  }
  window.sessionStorage.removeItem(ADMIN_FIREBASE_TOKEN_KEY)
}

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {})
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json')
  const token = getAdminToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${ADMIN_BASE}${path}`, { ...init, headers, credentials: 'same-origin' })
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
    throw new ApiError(message, response.status)
  }
  return payload as T
}

export async function fetchAdminPreauthState() {
  return adminFetch<{ success: boolean; authenticated: boolean }>('/preauth/state')
}

export async function submitAdminPreauth(payload: { username: string; password: string }) {
  return adminFetch<{ success: boolean; authenticated: boolean }>('/preauth', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function clearAdminPreauth() {
  return adminFetch<{ success: boolean }>('/preauth/logout', {
    method: 'POST',
  })
}

export async function fetchAdminDashboard() {
  return adminFetch<{ success: boolean; kpis?: Record<string, number | null>; recent_activity?: unknown[] }>('/dashboard')
}

export async function fetchSubscriptions() {
  return adminFetch<{ success: boolean; items: AdminSubscription[] }>('/subscriptions?limit=100')
}

export async function createSubscription(payload: {
  user_email: string
  plan: 'monthly' | 'yearly'
  tier: 'public' | 'private'
  expires_at: string
}) {
  return adminFetch<{ success: boolean; item: AdminSubscription }>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function patchSubscriptionStatus(id: string, status: AdminSubscription['status']) {
  return adminFetch<{ success: boolean; item: AdminSubscription }>(`/subscriptions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function fetchPromoCodes() {
  return adminFetch<{ success: boolean; items: AdminPromoCode[] }>('/promo-codes?limit=100')
}

export async function createPromoCode(payload: {
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  is_private_tier_trigger: boolean
  max_uses?: number
  expires_at?: string
}) {
  return adminFetch<{ success: boolean; item: AdminPromoCode }>('/promo-codes', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchOtaUpdates() {
  return adminFetch<{ success: boolean; items: AdminOtaUpdate[] }>('/ota-updates?limit=100')
}

export async function createOtaUpdate(payload: {
  version: string
  channel: string
  release_notes: string
  download_url: string
  is_mandatory: boolean
  is_published?: boolean
}) {
  return adminFetch<{ success: boolean; item: AdminOtaUpdate }>('/ota-updates', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchCrashLogs() {
  return adminFetch<{ success: boolean; items: AdminCrashLog[] }>('/crash-logs?limit=100')
}

