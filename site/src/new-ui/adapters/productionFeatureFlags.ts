export type ProductionFeatureFlag =
  | 'emailVerification'
  | 'payments'
  | 'publicCheckout'
  | 'customerDownloads'
  | 'customerSupport'
  | 'adminPaymentManagement'

export type ProductionFeatureState = 'api-connected' | 'disabled-production' | 'external-service-required' | 'decision-required'

export type ProductionFeatureFlagConfig = {
  enabled: boolean
  state: ProductionFeatureState
  reason?: string
}

const envFlag = (name: string) => String((import.meta.env as Record<string, string | undefined>)[name] || '').trim() === '1'

export const productionFeatureFlags = {
  emailVerification: {
    enabled: envFlag('VITE_ENABLE_EMAIL_VERIFICATION'),
    state: envFlag('VITE_ENABLE_EMAIL_VERIFICATION') ? 'api-connected' : 'external-service-required',
    reason: envFlag('VITE_ENABLE_EMAIL_VERIFICATION') ? undefined : 'email_provider_not_configured',
  },
  payments: {
    enabled: envFlag('VITE_ENABLE_PAYMENTS'),
    state: envFlag('VITE_ENABLE_PAYMENTS') ? 'api-connected' : 'decision-required',
    reason: envFlag('VITE_ENABLE_PAYMENTS') ? undefined : 'payment_provider_not_configured',
  },
  publicCheckout: {
    enabled: envFlag('VITE_ENABLE_PUBLIC_CHECKOUT'),
    state: envFlag('VITE_ENABLE_PUBLIC_CHECKOUT') ? 'api-connected' : 'disabled-production',
    reason: envFlag('VITE_ENABLE_PUBLIC_CHECKOUT') ? undefined : 'public_checkout_disabled',
  },
  customerDownloads: {
    enabled: true,
    state: 'api-connected',
  },
  customerSupport: {
    enabled: true,
    state: 'api-connected',
  },
  adminPaymentManagement: {
    enabled: false,
    state: 'decision-required',
    reason: 'payment_provider_not_configured',
  },
} satisfies Record<ProductionFeatureFlag, ProductionFeatureFlagConfig>

export function isProductionFeatureEnabled(flag: ProductionFeatureFlag): boolean {
  return productionFeatureFlags[flag].enabled
}
