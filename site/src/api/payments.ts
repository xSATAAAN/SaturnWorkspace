import { ApiError } from './http'
import type { Lang } from '../types/content'

export type PaymentPlan = 'weekly' | 'monthly' | 'annual'

export type PlanCatalogItem = {
  id: PaymentPlan
  version: number
  name: string
  description: string
  currency: string
  amount_minor: number
  original_amount_minor?: number | null
  interval: string
  term: PaymentPlan
  trial_days: number
  features: string[]
  localizations?: Record<string, { name?: string; description?: string }>
  visible: boolean
  active: boolean
  purchasable: boolean
  provider_ready: boolean
  checkout_enabled: boolean
}

export type PlanCatalogResponse = {
  success: boolean
  source: 'supabase_commercial_plans'
  plans: PlanCatalogItem[]
  checkout_available: boolean
}

export type CreatePaymentRequest = {
  plan: PaymentPlan
  plan_version?: number
  id_token?: string
  idempotency_key?: string
  customer: {
    email?: string
    phone?: string
    contact?: string
  }
  notes?: string
  locale: Lang
}

export type CreatePaymentResponse = {
  success: boolean
  order_id?: string
  status: 'creating' | 'provider_unavailable' | 'awaiting_payment' | 'confirming' | 'paid' | 'underpaid' | 'overpaid' | 'failed' | 'cancelled' | 'expired' | 'refunded' | 'manual_review'
  hosted_url?: string
  code?: string
  retryable?: boolean
  checkout_available?: boolean
}

function paymentApiUrl(path: string) {
  if (typeof window === 'undefined') return `https://admin-api.saturnws.com${path}`
  const host = window.location.hostname.toLowerCase()
  if (host === 'admin.saturnws.com' || host === 'admin-api.saturnws.com') return path
  return `https://admin-api.saturnws.com${path}`
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : `request_failed_${response.status}`
    throw new ApiError(message, response.status)
  }
  return payload as T
}

export async function fetchPlanCatalog() {
  const response = await fetch(paymentApiUrl('/api/plans/catalog'), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  return readResponse<PlanCatalogResponse>(response)
}

export async function createPaymentIntent(payload: CreatePaymentRequest) {
  const response = await fetch(paymentApiUrl('/api/payments/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })
  return readResponse<CreatePaymentResponse>(response)
}
