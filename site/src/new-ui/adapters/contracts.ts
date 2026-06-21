import type {
  AdminAuditLogItem,
  AdminCrashGroup,
  AdminCrashLog,
  AdminPromoCode,
  AdminReleaseManifest,
  AdminRemoteControls,
  AdminSubscription,
  AdminSupportMessage,
  AdminSupportAuditEvent,
  AdminSupportThread,
  AdminUserDetail,
  AdminEmailStatus,
  ManualGrantExecuteInput,
  ManualGrantPreview,
  ManualGrantPreviewInput,
  ManualGrantResult,
} from '../../api/admin'
import type { AccountProfileProjection, AccountSessionsResult, AccountSubscription, SubscriptionProjection } from '../../api/account'

export type RuntimeMode = 'preview' | 'production'

export type AppUser = {
  id: string
  email: string
  displayName?: string | null
  emailVerified?: boolean
  profile?: AccountProfileProjection | null
}

export type AuthBootstrapStatus =
  | 'initializing'
  | 'unauthenticated'
  | 'authenticating'
  | 'authenticated'
  | 'refreshing'
  | 'signing_out'
  | 'error'

export type EmailVerificationState =
  | 'not_required'
  | 'unverified'
  | 'verification_pending'
  | 'verified'
  | 'verification_expired'
  | 'verification_locked'

export type AccountProfileState =
  | 'missing'
  | 'provisioning'
  | 'ready'
  | 'failed_recoverable'
  | 'disabled'

export type SessionState = 'valid' | 'refresh_required' | 'expired' | 'revoked'

export type AuthState = {
  ready: boolean
  user: AppUser | null
  status?: AuthBootstrapStatus
  emailVerificationState?: EmailVerificationState
  profileState?: AccountProfileState
  sessionState?: SessionState
  error?: string | null
}

export type ReleaseInfo = {
  available: boolean
  version?: string
  channel?: string
  mandatory?: boolean
  filename?: string
  downloadUrl?: string
  sha256?: string
  sizeBytes?: number
  architecture?: string
  notes?: string
  raw?: unknown
}

export type PlanInfo = {
  id: 'weekly' | 'monthly' | 'yearly'
  name: string
  price: string
  originalPrice?: string
  period: string
  description: string
  enabled: boolean
  checkoutEnabled: boolean
}

export type AdminDashboardState = {
  kpis?: Record<string, number | null>
  recentActivity?: unknown[]
}

export type PaymentIntentInput = {
  plan: 'monthly' | 'yearly'
  email?: string
  locale: 'ar' | 'en'
}

export type PaymentIntentResult = {
  success: boolean
  status: 'created' | 'pending' | 'paid' | 'failed'
  orderId?: string
  hostedUrl?: string
  reason?: string
}

export type SignUpWithEmailInput = {
  displayName: string
  email: string
  password: string
  locale: 'ar' | 'en'
  termsAccepted: boolean
  termsVersion?: string
}

export type CustomerSupportThread = {
  id: string
  subject: string
  status?: string
  updatedAt?: string
  lastMessageAt?: string
  lastMessageSender?: string
  unreadCount?: number
}

export type CustomerSupportMessage = {
  id: string
  sender: string
  senderRole?: SupportSenderRole
  body: string
  createdAt?: string
}

export type SupportSenderRole = 'customer' | 'support_agent' | 'internal_note' | 'system' | 'email_inbound'

export type AuthAdapter = {
  subscribe(callback: (state: AuthState) => void): () => void
  signInWithEmail(email: string, password: string): Promise<AppUser>
  signUpWithEmail(input: SignUpWithEmailInput): Promise<AppUser>
  signInWithGoogle(input?: { locale?: 'ar' | 'en'; termsAccepted?: boolean; termsVersion?: string }): Promise<AppUser>
  provisionProfile?(input?: { displayName?: string; locale?: 'ar' | 'en'; termsAccepted?: boolean; termsVersion?: string }): Promise<AppUser>
  sendPasswordReset(email: string): Promise<void>
  requestEmailVerification(email: string): Promise<{ success: boolean; status?: string; expiresAt?: string; error?: string; testCode?: string }>
  verifyEmailCode(email: string, code: string): Promise<{ success: boolean; status?: string; verifiedAt?: string; error?: string }>
  signOut(): Promise<void>
  getIdToken(forceRefresh?: boolean): Promise<string | null>
}

export type AccountAdapter = {
  getSubscription(): Promise<AccountSubscription>
  getSubscriptionProjection?(): Promise<SubscriptionProjection | null>
  updateProfile(input: { displayName: string }): Promise<AppUser>
  sendPasswordReset(): Promise<void>
  listSessions(): Promise<AccountSessionsResult>
  revokeSession(sessionId: string, scope: 'session' | 'device'): Promise<void>
  revokeAllSessions(): Promise<void>
}

export type ReleaseAdapter = {
  getLatest(channel?: 'stable' | 'beta'): Promise<ReleaseInfo>
}

export type PlansAdapter = {
  listPlans(locale: 'ar' | 'en'): Promise<PlanInfo[]>
}

export type PaymentsAdapter = {
  createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult>
  isCheckoutEnabled(): boolean
}

export type SupportAdapter = {
  isCustomerWebSupportEnabled(): boolean
  createTicket(input: { subject: string; body: string }): Promise<{ success: boolean; threadId?: string; error?: string }>
  listThreads(): Promise<CustomerSupportThread[]>
  getThread(threadId: string): Promise<{ thread?: CustomerSupportThread; messages: CustomerSupportMessage[] }>
  replyThread(threadId: string, body: string): Promise<{ success: boolean; error?: string }>
  setThreadStatus(threadId: string, status: 'open' | 'closed'): Promise<{ success: boolean; status?: string; error?: string }>
}

export type AccountNotification = {
  id: string
  type: string
  title: string
  body: string
  titleAr?: string
  bodyAr?: string
  linkedResourceType?: string
  linkedResourceId?: string
  portalStatus: string
  emailStatus: string
  readAt?: string
  createdAt: string
}

export type NotificationPage = {
  items: AccountNotification[]
  unreadCount: number
  nextCursor?: string
}

export type NotificationsAdapter = {
  list(input?: { cursor?: string; limit?: number }): Promise<NotificationPage>
  markRead(notificationId: string): Promise<void>
  markAllRead(): Promise<number>
  archive(notificationId: string): Promise<void>
}

export type AdminAdapter = {
  getPreauthState(): Promise<{ authenticated: boolean }>
  submitPreauth(input: { username: string; password: string }): Promise<{ authenticated: boolean }>
  signInWithGoogle(): Promise<AppUser>
  getSession(): Promise<{ email: string }>
  getDashboard(): Promise<AdminDashboardState>
  listSubscriptions(input?: { search?: string }): Promise<AdminSubscription[]>
  createSubscription(input: {
    user_email: string
    firebase_user_id?: string
    plan: 'monthly' | 'yearly'
    tier: 'public' | 'private'
    expires_at?: string
    is_unlimited?: boolean
  }): Promise<AdminSubscription>
  previewManualGrant(input: ManualGrantPreviewInput): Promise<ManualGrantPreview>
  executeManualGrant(input: ManualGrantExecuteInput): Promise<ManualGrantResult>
  updateSubscriptionStatus(id: string, status: AdminSubscription['status']): Promise<AdminSubscription>
  resetHwid(id: string): Promise<AdminSubscription>
  listPromoCodes(): Promise<AdminPromoCode[]>
  listReleases(): Promise<AdminReleaseManifest[]>
  uploadRelease(input: { file: File; version: string; channel: string; artifactType?: 'portable' | 'installed' }): Promise<unknown>
  publishRelease(input: {
    version: string
    channel: string
    notes: string
    mandatory: boolean
    updateMode: 'optional' | 'force' | 'required' | 'silent'
    targetScope?: 'all' | 'selected'
    targetUserEmails?: string[]
  }): Promise<AdminReleaseManifest>
  getRemoteControls(channel?: string): Promise<AdminRemoteControls>
  updateRemoteControls(input: AdminRemoteControls & { channel: string }): Promise<AdminRemoteControls>
  listSupportThreads(): Promise<AdminSupportThread[]>
  listSupportMessages(threadId: string): Promise<AdminSupportMessage[]>
  listSupportAudit(threadId: string): Promise<AdminSupportAuditEvent[]>
  sendSupportReply(threadId: string, body: string, options?: { internal?: boolean; emailRequested?: boolean }): Promise<void>
  updateSupportStatus(threadId: string, status: string, reason?: string): Promise<void>
  updateSupportPriority(threadId: string, priority: 'low' | 'normal' | 'high' | 'urgent'): Promise<void>
  setSupportBlocked(threadId: string, blocked: boolean, reason?: string): Promise<{ blocked: boolean; status?: string }>
  getEmailOperations(): Promise<AdminEmailStatus>
  processEmailOutbox(): Promise<{ processed: number; sent: number; skipped: number }>
  retryEmailJob(jobId: string): Promise<{ processed?: number; sent?: number; skipped?: number }>
  sendAdminTestEmail(input: { recipient: string; emailType?: string; locale?: 'ar' | 'en'; subject?: string; message?: string }): Promise<void>
  listCrashLogs(): Promise<AdminCrashLog[]>
  listCrashGroups(): Promise<AdminCrashGroup[]>
  listAuditLog(): Promise<AdminAuditLogItem[]>
  getUserDetail(userKey: string): Promise<AdminUserDetail>
}

export type ContentAdapter = {
  getLegalPage(page: string, locale: 'ar' | 'en'): Promise<{ title: string; body: string }>
}

export type AppAdapters = {
  mode: RuntimeMode
  auth: AuthAdapter
  account: AccountAdapter
  releases: ReleaseAdapter
  plans: PlansAdapter
  payments: PaymentsAdapter
  support: SupportAdapter
  notifications: NotificationsAdapter
  admin: AdminAdapter
  content: ContentAdapter
}
