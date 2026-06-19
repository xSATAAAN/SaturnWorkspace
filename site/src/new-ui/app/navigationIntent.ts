import type { AppRoute } from './routes'

export type AuthIntent = {
  returnTo?: string
  plan?: 'weekly' | 'monthly' | 'yearly'
  checkout?: boolean
}

const PLAN_IDS = new Set(['weekly', 'monthly', 'yearly'])

export function currentInternalLocation() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export function createAuthRoute(page: 'signin' | 'signup', intent: AuthIntent = {}): AppRoute {
  const params = new URLSearchParams()
  if (intent.returnTo?.startsWith('/')) params.set('returnTo', intent.returnTo)
  if (intent.plan && PLAN_IDS.has(intent.plan)) params.set('plan', intent.plan)
  if (intent.checkout) params.set('checkout', '1')
  const query = params.toString()
  return { surface: 'auth', page, state: query ? `?${query}` : undefined }
}

export function readAuthIntent(state?: string): AuthIntent {
  const params = new URLSearchParams(state?.startsWith('?') ? state.slice(1) : state || '')
  const returnTo = params.get('returnTo') || undefined
  const rawPlan = params.get('plan') || ''
  return {
    returnTo: returnTo?.startsWith('/') ? returnTo : undefined,
    plan: PLAN_IDS.has(rawPlan) ? rawPlan as AuthIntent['plan'] : undefined,
    checkout: params.get('checkout') === '1',
  }
}

export function createPricingReturnState(plan: AuthIntent['plan']) {
  const params = new URLSearchParams()
  if (plan) params.set('checkout', plan)
  return params.toString() ? `?${params.toString()}` : undefined
}

export function readCheckoutPlan(state?: string): AuthIntent['plan'] {
  const params = new URLSearchParams(state?.startsWith('?') ? state.slice(1) : state || '')
  const plan = params.get('checkout') || ''
  return PLAN_IDS.has(plan) ? plan as AuthIntent['plan'] : undefined
}
