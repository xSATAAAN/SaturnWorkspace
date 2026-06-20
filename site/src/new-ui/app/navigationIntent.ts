import type { AppRoute } from './routes'

export type AuthIntent = {
  returnTo?: string
  plan?: 'weekly' | 'monthly' | 'yearly'
  checkout?: boolean
}

const PLAN_IDS = new Set(['weekly', 'monthly', 'yearly'])
const RETURN_TO_PREFIX_ALLOWLIST = [
  '/account',
  '/account/support',
  '/account/downloads',
  '/account/subscription',
  '/account/settings',
  '/account/security',
  '/account/notifications',
  '/pricing',
  '/download',
  '/downloads',
  '/support',
  '/contact',
]

function safeReturnTo(value?: string | null): string | undefined {
  const candidate = String(value || '').trim()
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return undefined
  try {
    const parsed = new URL(candidate, 'https://saturnws.com')
    if (parsed.origin !== 'https://saturnws.com') return undefined
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`
    const path = parsed.pathname.replace(/\/+$/, '') || '/'
    return RETURN_TO_PREFIX_ALLOWLIST.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) ? normalized : undefined
  } catch {
    return undefined
  }
}

export function currentInternalLocation() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export function createAuthRoute(page: 'signin' | 'signup', intent: AuthIntent = {}): AppRoute {
  const params = new URLSearchParams()
  const returnTo = safeReturnTo(intent.returnTo)
  if (returnTo) params.set('returnTo', returnTo)
  if (intent.plan && PLAN_IDS.has(intent.plan)) params.set('plan', intent.plan)
  if (intent.checkout) params.set('checkout', '1')
  const query = params.toString()
  return { surface: 'auth', page, state: query ? `?${query}` : undefined }
}

export function readAuthIntent(state?: string): AuthIntent {
  const params = new URLSearchParams(state?.startsWith('?') ? state.slice(1) : state || '')
  const returnTo = safeReturnTo(params.get('returnTo'))
  const rawPlan = params.get('plan') || ''
  return {
    returnTo,
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
