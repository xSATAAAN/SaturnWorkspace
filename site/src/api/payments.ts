import { postJson } from './http'
import type { Lang } from '../types/content'

export type PaymentPlan = 'monthly' | 'six_months'

export type CreatePaymentRequest = {
  plan: PaymentPlan
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
  order_id: string
  status: 'created' | 'pending' | 'paid' | 'failed'
  hosted_url?: string
  fallback_telegram_message?: string
}

export async function createPaymentIntent(payload: CreatePaymentRequest) {
  return postJson<CreatePaymentResponse>('/api/payments/create', payload)
}
