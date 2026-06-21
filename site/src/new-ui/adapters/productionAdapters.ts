import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { fetchAccountSessions, fetchAccountSubscription, provisionAccountProfile, revokeAccountSession, revokeAllAccountSessions } from '../../api/account'
import {
  createSubscription,
  executeManualSubscriptionGrant,
  fetchAdminDashboard,
  fetchAdminPreauthState,
  fetchAdminSession,
  fetchAuditLog,
  fetchCrashGroups,
  fetchCrashLogs,
  fetchEmailOperations as fetchAdminEmailOperations,
  fetchPromoCodes,
  fetchRemoteControls,
  fetchSubscriptions,
  fetchSupportMessages,
  fetchSupportThreads,
  fetchUserDetail,
  publishRelease,
  resetSubscriptionHwid,
  sendSupportReply,
  sendAdminTestEmail as sendAdminTestEmailRequest,
  setAdminBearerToken,
  setSupportBlocked,
  processEmailOutbox as processEmailOutboxRequest,
  retryEmailJob as retryEmailJobRequest,
  updateAdminSupportStatus,
  submitAdminPreauth,
  updateRemoteControls,
  uploadReleaseBinary,
  patchSubscriptionStatus,
  previewManualSubscriptionGrant,
  type AdminReleaseManifest,
} from '../../api/admin'
import { createPaymentIntent } from '../../api/payments'
import { requestEmailVerificationCode, verifyEmailVerificationCode } from '../../api/emailVerification'
import {
  createWebSupportTicket,
  fetchWebSupportThread,
  fetchWebSupportThreads,
  replyWebSupportThread,
  updateWebSupportStatus,
} from '../../api/support'
import { firebaseAuth } from '../../lib/firebase'
import { publicCopy } from '../content/publicCopy'
import { getJson } from './apiClient'
import { isProductionFeatureEnabled, productionFeatureFlags } from './productionFeatureFlags'
import type { AccountSubscription } from '../../api/account'
import type { AppAdapters, AppUser, AuthState, PlanInfo, ReleaseInfo, SignUpWithEmailInput, SupportSenderRole } from './contracts'

function userFromFirebase(user: typeof firebaseAuth.currentUser): AppUser {
  if (!user?.email) throw new Error('auth_user_missing_email')
  return {
    id: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
  }
}

function mapFirebaseAuthError(error: unknown): Error {
  const raw = String((error as { code?: string; message?: string })?.code || (error as { message?: string })?.message || error || '').toLowerCase()
  if (raw.includes('email-already-in-use')) return new Error('AUTH_EMAIL_ALREADY_USED')
  if (raw.includes('weak-password')) return new Error('AUTH_WEAK_PASSWORD')
  if (raw.includes('invalid-email')) return new Error('AUTH_INVALID_EMAIL')
  if (raw.includes('too-many-requests')) return new Error('AUTH_TOO_MANY_ATTEMPTS')
  if (raw.includes('account-exists-with-different-credential')) return new Error('AUTH_PROVIDER_COLLISION')
  if (raw.includes('wrong-password') || raw.includes('invalid-credential') || raw.includes('user-not-found')) return new Error('AUTH_INVALID_CREDENTIALS')
  if (raw.includes('network')) return new Error('NETWORK_UNAVAILABLE')
  return error instanceof Error ? error : new Error('REQUEST_FAILED')
}

function supportSenderRole(sender: string | null | undefined): SupportSenderRole {
  const normalized = String(sender || '').trim().toLowerCase()
  if (normalized === 'admin' || normalized === 'support' || normalized === 'support_agent' || normalized === 'agent') return 'support_agent'
  if (normalized === 'internal' || normalized === 'internal_note') return 'internal_note'
  if (normalized === 'system') return 'system'
  return 'customer'
}

type AccountBootstrap = {
  uid: string
  user: AppUser
  account: AccountSubscription
  fetchedAt: number
}

let accountBootstrapCache: AccountBootstrap | null = null
let accountBootstrapInflight: Promise<AccountBootstrap> | null = null

function clearAccountBootstrap() {
  accountBootstrapCache = null
  accountBootstrapInflight = null
}

function currentPerformanceNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

async function refreshAuthenticatedAccountState(forceRefresh = true): Promise<void> {
  const user = firebaseAuth.currentUser
  if (!user?.email) return
  const baseUser = userFromFirebase(user)
  publishAuthState({
    ready: false,
    user: baseUser,
    status: 'refreshing',
    profileState: 'provisioning',
    emailVerificationState: 'verification_pending',
    sessionState: 'refresh_required',
    error: null,
  })
  try {
    const account = await loadAccountBootstrap(forceRefresh)
    const profile = account.user.profile || null
    publishAuthState({
      ready: true,
      user: account.user,
      status: 'authenticated',
      profileState: profile?.account_status === 'suspended' ? 'disabled' : profile ? 'ready' : 'missing',
      emailVerificationState: profile?.email_verified ? 'verified' : 'unverified',
      sessionState: 'valid',
      error: null,
    })
  } catch (error) {
    publishAuthState({
      ready: true,
      user: baseUser,
      status: 'authenticated',
      profileState: 'failed_recoverable',
      emailVerificationState: 'unverified',
      sessionState: 'refresh_required',
      error: String(error instanceof Error ? error.message : error || 'PROFILE_PROVISIONING_FAILED'),
    })
  }
}

async function loadAccountBootstrap(forceRefresh = false): Promise<AccountBootstrap> {
  const user = firebaseAuth.currentUser
  if (!user?.email) throw new Error('not_authenticated')
  const uid = user.uid
  if (!forceRefresh && accountBootstrapCache?.uid === uid) return accountBootstrapCache
  if (!forceRefresh && accountBootstrapInflight) return accountBootstrapInflight
  const startedAt = currentPerformanceNow()
  accountBootstrapInflight = user.getIdToken(false)
    .then((token) => fetchAccountSubscription(token))
    .then((account) => {
      const profile = account.user?.profile || null
      const bootstrapped: AccountBootstrap = {
        uid,
        account,
        user: { ...userFromFirebase(user), profile, emailVerified: Boolean(profile?.email_verified) },
        fetchedAt: Date.now(),
      }
      accountBootstrapCache = bootstrapped
      if (typeof console !== 'undefined' && typeof console.info === 'function') {
        console.info('saturnws:account_bootstrap', { duration_ms: Math.round(currentPerformanceNow() - startedAt), source: 'network' })
      }
      return bootstrapped
    })
    .finally(() => {
      accountBootstrapInflight = null
    })
  return accountBootstrapInflight
}

async function provisionCurrentFirebaseUser(input: {
  displayName?: string
  locale?: 'ar' | 'en'
  termsAccepted?: boolean
  termsVersion?: string
} = {}): Promise<AppUser> {
  const user = firebaseAuth.currentUser
  if (!user) throw new Error('not_authenticated')
  if (input.displayName !== undefined && input.displayName.trim() !== (user.displayName || '')) {
    await updateProfile(user, { displayName: input.displayName.trim() || null })
  }
  const token = await user.getIdToken(false)
  const provisioned = await provisionAccountProfile(token, {
    displayName: input.displayName ?? user.displayName ?? undefined,
    locale: input.locale,
    termsAccepted: input.termsAccepted,
    termsVersion: input.termsVersion,
    termsAcceptedAt: input.termsAccepted ? new Date().toISOString() : undefined,
  })
  if (!provisioned.success || !provisioned.profile) throw new Error(provisioned.error || 'PROFILE_PROVISIONING_FAILED')
  clearAccountBootstrap()
  return { ...userFromFirebase(user), profile: provisioned.profile, emailVerified: Boolean(provisioned.profile.email_verified) }
}

const authSubscribers = new Set<(state: AuthState) => void>()
let authUnsubscribe: (() => void) | null = null
let currentAuthState: AuthState = {
  ready: false,
  user: null,
  status: 'initializing',
  profileState: 'missing',
  emailVerificationState: 'not_required',
  sessionState: 'refresh_required',
  error: null,
}

function publishAuthState(state: AuthState) {
  currentAuthState = state
  authSubscribers.forEach((subscriber) => subscriber(state))
}

function ensureAuthListener() {
  if (authUnsubscribe) return
  authUnsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
    if (!user?.email) {
      publishAuthState({
        ready: true,
        user: null,
        status: 'unauthenticated',
        profileState: 'missing',
        emailVerificationState: 'not_required',
        sessionState: 'expired',
        error: null,
      })
      clearAccountBootstrap()
      return
    }
    const baseUser = userFromFirebase(user)
    publishAuthState({
      ready: false,
      user: baseUser,
      status: 'refreshing',
      profileState: 'provisioning',
      emailVerificationState: 'verification_pending',
      sessionState: 'refresh_required',
      error: null,
    })
    refreshAuthenticatedAccountState(false)
  })
}

function latestReleaseUrl(channel: 'stable' | 'beta') {
  if (typeof window === 'undefined') return `/api/updates/latest.json?channel=${encodeURIComponent(channel)}`
  const host = window.location.hostname.toLowerCase()
  if (host === 'admin-api.saturnws.com') return `/api/updates/latest.json?channel=${encodeURIComponent(channel)}`
  return `/updates/latest.json?channel=${encodeURIComponent(channel)}`
}

function normalizeRelease(payload: Record<string, unknown>): ReleaseInfo {
  const channels = payload.channels && typeof payload.channels === 'object' ? payload.channels as Record<string, Record<string, unknown>> : {}
  const selected = channels.beta || payload
  const artifacts = selected.artifacts && typeof selected.artifacts === 'object' ? selected.artifacts as Record<string, Record<string, unknown>> : {}
  const installed = artifacts.installed || {}
  const portable = artifacts.portable || {}
  const primaryArtifact = installed.url || installed.filename ? installed : portable
  const filename = String(selected.filename || primaryArtifact.filename || payload.filename || '')
  const sizeBytes = Number(selected.size_bytes || primaryArtifact.size_bytes || primaryArtifact.size || 0)
  const architecture = /\b(x64|win64|64-bit|amd64)\b/i.test(filename)
    ? 'Windows 64-bit'
    : /\b(x86|win32|32-bit)\b/i.test(filename)
      ? 'Windows 32-bit'
      : ''
  return {
    available: Boolean(selected.available ?? payload.available),
    version: String(selected.version || payload.version || ''),
    channel: String(selected.channel || 'beta'),
    mandatory: Boolean(selected.mandatory ?? payload.mandatory),
    filename,
    downloadUrl: String(selected.download_url || selected.url || primaryArtifact.url || payload.download_url || ''),
    sha256: String(selected.download_sha256 || primaryArtifact.sha256 || payload.download_sha256 || ''),
    sizeBytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : undefined,
    architecture: architecture || undefined,
    notes: String(selected.notes || payload.notes || ''),
    raw: payload,
  }
}

function listStaticPlans(locale: 'ar' | 'en'): PlanInfo[] {
  const copy = publicCopy[locale]
  const checkoutEnabled = isProductionFeatureEnabled('payments') && isProductionFeatureEnabled('publicCheckout')
  return [
    { id: 'weekly', name: copy.weeklyName, price: copy.weeklyPrice, originalPrice: copy.weeklyOriginalPrice, period: copy.weeklyPeriod, description: copy.weeklyBody, enabled: true, checkoutEnabled: false },
    { id: 'monthly', name: copy.monthlyName, price: copy.monthlyPrice, originalPrice: copy.monthlyOriginalPrice, period: copy.monthlyPeriod, description: copy.monthlyBody, enabled: true, checkoutEnabled },
    { id: 'yearly', name: copy.annualName, price: copy.annualPrice, originalPrice: copy.annualOriginalPrice, period: copy.annualPeriod, description: copy.annualBody, enabled: true, checkoutEnabled },
  ]
}

function checkoutIdempotencyKey(plan: string, email: string): string {
  const normalizedEmail = email.trim().toLowerCase()
  const storageKey = `saturnws.checkout.idempotency.${plan}.${normalizedEmail || 'anonymous'}`
  if (typeof window === 'undefined') return crypto.randomUUID()
  const existing = window.sessionStorage.getItem(storageKey)
  if (existing) return existing
  const next = crypto.randomUUID()
  window.sessionStorage.setItem(storageKey, next)
  return next
}

export const productionAdapters: AppAdapters = {
  mode: 'production',
  auth: {
    subscribe(callback) {
      ensureAuthListener()
      authSubscribers.add(callback)
      callback(currentAuthState)
      return () => {
        authSubscribers.delete(callback)
      }
    },
    async signInWithEmail(email, password) {
      try {
        const result = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password)
        return userFromFirebase(result.user)
      } catch (error) {
        throw mapFirebaseAuthError(error)
      }
    },
    async signUpWithEmail(input: SignUpWithEmailInput) {
      try {
        const result = await createUserWithEmailAndPassword(firebaseAuth, input.email.trim(), input.password)
        if (input.displayName.trim()) await updateProfile(result.user, { displayName: input.displayName.trim() })
        return provisionCurrentFirebaseUser({
          displayName: input.displayName,
          locale: input.locale,
          termsAccepted: input.termsAccepted,
          termsVersion: input.termsVersion || '2026-06',
        })
      } catch (error) {
        throw mapFirebaseAuthError(error)
      }
    },
    async signInWithGoogle(input = {}) {
      try {
        const result = await signInWithPopup(firebaseAuth, new GoogleAuthProvider())
        const shouldProvisionWithTerms = Boolean(input.termsAccepted)
        if (!shouldProvisionWithTerms) return userFromFirebase(result.user)
        return provisionCurrentFirebaseUser({
          locale: input.locale,
          termsAccepted: input.termsAccepted,
          termsVersion: input.termsVersion || '2026-06',
        })
      } catch (error) {
        throw mapFirebaseAuthError(error)
      }
    },
    async provisionProfile(input = {}) {
      return provisionCurrentFirebaseUser(input)
    },
    async sendPasswordReset(email) {
      await sendPasswordResetEmail(firebaseAuth, email.trim())
    },
    async requestEmailVerification(email) {
      const token = await productionAdapters.auth.getIdToken(false)
      if (!token) return { success: false, error: 'not_authenticated' }
      const result = await requestEmailVerificationCode(token, email.trim())
      return { success: result.success, status: result.status, expiresAt: result.expires_at, error: result.error, testCode: result.test_code }
    },
    async verifyEmailCode(email, code) {
      const token = await productionAdapters.auth.getIdToken(false)
      if (!token) return { success: false, error: 'not_authenticated' }
      const result = await verifyEmailVerificationCode(token, email.trim(), code)
      if (result.success) {
        clearAccountBootstrap()
        await refreshAuthenticatedAccountState(true)
      }
      return { success: result.success, status: result.status, verifiedAt: result.verified_at, error: result.error }
    },
    async signOut() {
      publishAuthState({ ...currentAuthState, status: 'signing_out' })
      setAdminBearerToken(null)
      clearAccountBootstrap()
      await signOut(firebaseAuth)
    },
    async getIdToken(forceRefresh = false) {
      return firebaseAuth.currentUser ? firebaseAuth.currentUser.getIdToken(forceRefresh) : null
    },
  },
  account: {
    async getSubscription() {
      return loadAccountBootstrap(false).then((bootstrap) => bootstrap.account)
    },
    async getSubscriptionProjection() {
      const result = await loadAccountBootstrap(false).then((bootstrap) => bootstrap.account)
      return result.subscription_projection || null
    },
    async updateProfile(input) {
      if (!firebaseAuth.currentUser) throw new Error('not_authenticated')
      await updateProfile(firebaseAuth.currentUser, { displayName: input.displayName.trim() || null })
      clearAccountBootstrap()
      return userFromFirebase(firebaseAuth.currentUser)
    },
    async sendPasswordReset() {
      const email = firebaseAuth.currentUser?.email
      if (!email) throw new Error('not_authenticated')
      await sendPasswordResetEmail(firebaseAuth, email)
    },
    async listSessions() {
      const token = await productionAdapters.auth.getIdToken(false)
      if (!token) throw new Error('not_authenticated')
      return fetchAccountSessions(token)
    },
    async revokeSession(sessionId, scope) {
      const token = await productionAdapters.auth.getIdToken(true)
      if (!token) throw new Error('not_authenticated')
      await revokeAccountSession(token, sessionId, scope)
    },
    async revokeAllSessions() {
      const token = await productionAdapters.auth.getIdToken(true)
      if (!token) throw new Error('not_authenticated')
      await revokeAllAccountSessions(token)
    },
  },
  releases: {
    async getLatest(channel = 'beta') {
      const payload = await getJson<Record<string, unknown>>(latestReleaseUrl(channel))
      return normalizeRelease(payload)
    },
  },
  plans: {
    async listPlans(locale) {
      return listStaticPlans(locale)
    },
  },
  payments: {
    isCheckoutEnabled() {
      return isProductionFeatureEnabled('payments') && isProductionFeatureEnabled('publicCheckout')
    },
    async createIntent(input) {
      if (!this.isCheckoutEnabled()) {
        return { success: false, status: 'failed', reason: productionFeatureFlags.payments.reason || productionFeatureFlags.publicCheckout.reason || 'payment_disabled' }
      }
      const token = await productionAdapters.auth.getIdToken(false).catch(() => null)
      const result = await createPaymentIntent({
        plan: input.plan,
        id_token: token || undefined,
        idempotency_key: checkoutIdempotencyKey(input.plan, input.email || ''),
        customer: { email: input.email },
        locale: input.locale,
      })
      return {
        success: result.success,
        status: result.status,
        orderId: result.order_id,
        hostedUrl: result.hosted_url,
      }
    },
  },
  support: {
    isCustomerWebSupportEnabled() {
      return isProductionFeatureEnabled('customerSupport')
    },
    async createTicket(input) {
      const token = await productionAdapters.auth.getIdToken(false)
      if (!token) return { success: false, error: 'not_authenticated' }
      const result = await createWebSupportTicket(token, input)
      return { success: result.success, threadId: result.thread_id, error: result.error }
    },
    async listThreads() {
      const token = await productionAdapters.auth.getIdToken(false)
      if (!token) throw new Error('not_authenticated')
      const data = await fetchWebSupportThreads(token)
      return (data.threads || []).map((thread) => ({
        id: thread.id,
        subject: thread.subject,
        status: thread.status,
        updatedAt: thread.updated_at || thread.last_message_at || undefined,
        lastMessageAt: thread.last_message_at || undefined,
        lastMessageSender: thread.last_message_sender || undefined,
        unreadCount: thread.unread_count,
      }))
    },
    async getThread(threadId) {
      const token = await productionAdapters.auth.getIdToken(false)
      if (!token) throw new Error('not_authenticated')
      const data = await fetchWebSupportThread(token, threadId)
      return {
        thread: data.thread
          ? {
              id: data.thread.id,
              subject: data.thread.subject,
              status: data.thread.status,
              updatedAt: data.thread.updated_at || data.thread.last_message_at || undefined,
              lastMessageAt: data.thread.last_message_at || undefined,
              lastMessageSender: data.thread.last_message_sender || undefined,
              unreadCount: data.thread.unread_count,
            }
          : undefined,
        messages: (data.messages || []).map((message) => ({
          id: message.id,
          sender: message.sender,
          senderRole: supportSenderRole(message.sender),
          body: message.body,
          createdAt: message.created_at,
        })),
      }
    },
    async replyThread(threadId, body) {
      const token = await productionAdapters.auth.getIdToken(false)
      if (!token) return { success: false, error: 'not_authenticated' }
      return replyWebSupportThread(token, threadId, body)
    },
    async setThreadStatus(threadId, status) {
      const token = await productionAdapters.auth.getIdToken(false)
      if (!token) return { success: false, error: 'not_authenticated' }
      return updateWebSupportStatus(token, threadId, status)
    },
  },
  admin: {
    async getPreauthState() {
      const state = await fetchAdminPreauthState()
      return { authenticated: Boolean(state.authenticated) }
    },
    async submitPreauth(input) {
      const state = await submitAdminPreauth(input)
      return { authenticated: Boolean(state.authenticated) }
    },
    async signInWithGoogle() {
      const user = await productionAdapters.auth.signInWithGoogle()
      const token = await productionAdapters.auth.getIdToken(false)
      setAdminBearerToken(token)
      return user
    },
    async getSession() {
      const session = await fetchAdminSession()
      return { email: session.email }
    },
    async getDashboard() {
      const data = await fetchAdminDashboard()
      return { kpis: data.kpis, recentActivity: data.recent_activity }
    },
    async listSubscriptions(input = {}) {
      const data = await fetchSubscriptions({ search: input.search, limit: 100 })
      return data.items || []
    },
    async createSubscription(input) {
      const data = await createSubscription(input)
      return data.item
    },
    async previewManualGrant(input) {
      const data = await previewManualSubscriptionGrant(input)
      return data.preview
    },
    async executeManualGrant(input) {
      return executeManualSubscriptionGrant(input)
    },
    async updateSubscriptionStatus(id, status) {
      const data = await patchSubscriptionStatus(id, status)
      return data.item
    },
    async resetHwid(id) {
      const data = await resetSubscriptionHwid(id)
      return data.item
    },
    async listPromoCodes() {
      const data = await fetchPromoCodes()
      return data.items || []
    },
    async listReleases() {
      const latest = await productionAdapters.releases.getLatest('beta')
      return [latest.raw as AdminReleaseManifest].filter(Boolean)
    },
    async uploadRelease(input) {
      return uploadReleaseBinary({ file: input.file, version: input.version, channel: input.channel, artifact_type: input.artifactType })
    },
    async publishRelease(input) {
      const data = await publishRelease({
        version: input.version,
        channel: input.channel,
        notes: input.notes,
        mandatory: input.mandatory,
        update_mode: input.updateMode,
        target_scope: input.targetScope,
        target_user_emails: input.targetUserEmails,
      })
      return data.manifest
    },
    async getRemoteControls(channel = 'beta') {
      const data = await fetchRemoteControls(channel)
      return data.controls
    },
    async updateRemoteControls(input) {
      const data = await updateRemoteControls(input)
      return data.controls
    },
    async listSupportThreads() {
      const data = await fetchSupportThreads()
      return data.threads || []
    },
    async listSupportMessages(threadId) {
      const data = await fetchSupportMessages(threadId)
      return data.messages || []
    },
    async sendSupportReply(threadId, body, options = {}) {
      await sendSupportReply({ thread_id: threadId, body, internal_note: options.internal, email_requested: options.emailRequested })
    },
    async updateSupportStatus(threadId, status, reason) {
      await updateAdminSupportStatus({ thread_id: threadId, status, reason })
    },
    async setSupportBlocked(threadId, blocked, reason) {
      await setSupportBlocked({ thread_id: threadId, blocked, reason })
    },
    getEmailOperations() {
      return fetchAdminEmailOperations()
    },
    async processEmailOutbox() {
      const data = await processEmailOutboxRequest()
      return data.processed
    },
    async retryEmailJob(jobId) {
      const data = await retryEmailJobRequest(jobId)
      return data.processed || {}
    },
    async sendAdminTestEmail(input) {
      await sendAdminTestEmailRequest({
        recipient: input.recipient,
        email_type: input.emailType,
        locale: input.locale,
        subject: input.subject,
        message: input.message,
      })
    },
    async listCrashLogs() {
      const data = await fetchCrashLogs({ limit: 100 })
      return data.items || []
    },
    async listCrashGroups() {
      const data = await fetchCrashGroups()
      return data.items || []
    },
    async listAuditLog() {
      const data = await fetchAuditLog()
      return data.items || []
    },
    getUserDetail(userKey) {
      return fetchUserDetail(userKey)
    },
  },
  content: {
    async getLegalPage(page, locale) {
      const copy = publicCopy[locale]
      return {
        title: page,
        body: copy.legalBody,
      }
    },
  },
}
