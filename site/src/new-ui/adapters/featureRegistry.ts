export type FeatureIntegrationState = 'implemented' | 'ui-complete' | 'integration-pending' | 'backend-required' | 'decision-required' | 'excluded'

export type FeatureFlag = {
  id: string
  state: FeatureIntegrationState
  developmentOnly: boolean
  enabledInPreview: boolean
}

export const featureFlags = {
  pricing: { id: 'pricing', state: 'decision-required', developmentOnly: true, enabledInPreview: true },
  checkout: { id: 'checkout', state: 'decision-required', developmentOnly: true, enabledInPreview: true },
  emailVerificationOtp: { id: 'email-verification-otp', state: 'backend-required', developmentOnly: true, enabledInPreview: true },
  passwordResetOtp: { id: 'password-reset-otp', state: 'backend-required', developmentOnly: true, enabledInPreview: true },
  invoices: { id: 'invoices', state: 'backend-required', developmentOnly: true, enabledInPreview: true },
  notificationPreferences: { id: 'notification-preferences', state: 'backend-required', developmentOnly: true, enabledInPreview: true },
  dataExport: { id: 'data-export', state: 'backend-required', developmentOnly: true, enabledInPreview: true },
  allSessionRevoke: { id: 'all-session-revoke', state: 'backend-required', developmentOnly: true, enabledInPreview: true },
  customerWebSupport: { id: 'customer-web-support', state: 'integration-pending', developmentOnly: true, enabledInPreview: true },
  publicDownload: { id: 'public-download', state: 'integration-pending', developmentOnly: true, enabledInPreview: true },
  inviteAdmin: { id: 'invite-admin', state: 'decision-required', developmentOnly: true, enabledInPreview: true },
  tamperDetails: { id: 'tamper-details', state: 'backend-required', developmentOnly: true, enabledInPreview: true },
} satisfies Record<string, FeatureFlag>

export const currentContracts = {
  accountSubscription: 'POST https://auth.saturnws.com/account/subscription',
  createPayment: 'POST /api/payments/create',
  paymentStatus: 'GET /api/payments/:orderId',
  adminDashboard: 'GET /api/admin/dashboard',
  accessRequests: 'GET /api/admin/access-requests',
  userDetail: 'GET /api/admin/users/:userKey',
  subscriptions: 'GET/POST/PATCH /api/admin/subscriptions',
  resetHwid: 'POST /api/admin/subscriptions/:id/reset-hwid',
  promoCodes: 'GET/POST /api/admin/promo-codes',
  releases: 'POST /api/admin/upload and /api/admin/publish',
  support: '/api/admin/policy/support*',
  diagnostics: 'GET /api/admin/crash-logs and /api/admin/crash-groups',
  audit: 'GET /api/admin/audit-log',
  remoteConfig: 'GET/POST /api/admin/remote-config',
} as const
