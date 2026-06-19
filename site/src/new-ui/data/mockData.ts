export const mockPlans = [
  { id: 'monthly', name: 'Monthly', description: 'Backend-supported plan identifier. Commercial values are intentionally omitted.', price: null, features: ['Workspace access', 'Managed releases', 'Support access'] },
  { id: 'yearly', name: 'Yearly', description: 'Backend-supported plan identifier. Commercial values are intentionally omitted.', price: null, features: ['Workspace access', 'Managed releases', 'Support access'] },
] as const

export const mockAccountRows = [
  { id: '1', email: 'account.one@example.com', type: 'AdsPower', status: 'ready', lastUsed: 'Today' },
  { id: '2', email: 'account.two@example.com', type: 'AdsPower', status: 'review', lastUsed: 'Yesterday' },
  { id: '3', email: 'account.three@example.com', type: 'AdsPower', status: 'ready', lastUsed: '3 days ago' },
] as const

export const mockAdminUsers = [
  { id: 'usr_preview_1', email: 'customer.one@example.com', subscription: 'active', access: 'allowed', updated: '2026-06-18' },
  { id: 'usr_preview_2', email: 'customer.two@example.com', subscription: 'expired', access: 'review', updated: '2026-06-17' },
  { id: 'usr_preview_3', email: 'customer.three@example.com', subscription: 'none', access: 'pending', updated: '2026-06-16' },
] as const

export const mockSupportThreads = [
  { id: 'SUP-PREVIEW-1', subject: 'Subscription status review', requester: 'customer.one@example.com', status: 'open', priority: 'normal', updated: '2026-06-18' },
  { id: 'SUP-PREVIEW-2', subject: 'Account access question', requester: 'customer.two@example.com', status: 'waiting', priority: 'normal', updated: '2026-06-17' },
] as const

export const mockAuditRows = [
  { id: 'AUD-1', admin: 'admin@example.com', action: 'subscription.updated', target: 'customer.one@example.com', date: '2026-06-18' },
  { id: 'AUD-2', admin: 'admin@example.com', action: 'release.reviewed', target: 'release-preview', date: '2026-06-17' },
] as const

export const mockPaymentMethods = [
  { id: 'configured-provider', name: 'Configured payment provider', description: 'Provider details are supplied by configuration.' },
  { id: 'manual-review', name: 'Manual review', description: 'Displays a pending state without submitting a live payment.' },
] as const

export const mockNotifications = [
  { id: 'n1', type: 'subscription', titleKey: 'subscriptionReviewNotice', bodyKey: 'subscriptionReviewBody', read: false },
  { id: 'n2', type: 'security', titleKey: 'newSigninNotice', bodyKey: 'newSigninBody', read: true },
  { id: 'n3', type: 'update', titleKey: 'releaseNotice', bodyKey: 'releaseNoticeBody', read: false },
] as const
