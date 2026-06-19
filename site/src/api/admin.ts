import { ApiError } from './http'

function adminBaseUrl() {
  if (typeof window === 'undefined') return '/api/admin'
  const host = window.location.hostname.toLowerCase()
  if (host === 'admin.saturnws.com' || host === 'admin-api.saturnws.com') return '/api/admin'
  return 'https://admin.saturnws.com/api/admin'
}

function compactAdminError(message: unknown, status: number, path: string) {
  const text = String(message || '').trim()
  const lower = text.toLowerCase()
  if (lower.startsWith('<!doctype') || lower.startsWith('<html') || lower.includes('site not found')) {
    return `admin_upstream_html_${status}:${path}`
  }
  return text || `request_failed_${status}:${path}`
}
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
  bound_at?: string | null
  last_seen_at?: string | null
  expires_at: string
  metadata?: Record<string, unknown> | null
  created_at: string
}

export type AdminAccessRequest = {
  id: string
  user_id?: string | null
  user_email?: string | null
  hwid?: string | null
  status: string
  created_at?: string | null
  authorized_at?: string | null
  consumed_at?: string | null
  expires_at?: string | null
  request_count: number
  last_event_at?: string | null
  has_subscription: boolean
  subscription_status?: string | null
  subscription_expires_at?: string | null
  subscription_id?: string | null
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
  rollout_percent?: number
  minimum_supported_version?: string | null
  force_update_deadline?: string | null
  created_at: string
}

export type AdminCrashLog = {
  id: string
  happened_at: string
  user_id?: string | null
  subscription_id?: string | null
  license_id?: string | null
  hwid?: string | null
  device_name?: string | null
  windows_version?: string | null
  cpu?: string | null
  gpu?: string | null
  ram_gb?: number | null
  error_type: string
  message?: string | null
  stack_trace: string
  app_version?: string | null
  tool_channel?: string | null
  fingerprint?: string | null
  raw_payload?: {
    auth?: {
      source?: string | null
      firebase_user_id?: string | null
      user_email?: string | null
      warning?: string | null
    } | null
    request?: {
      ip?: string | null
      user_agent?: string | null
      colo?: string | null
      country?: string | null
    } | null
    [key: string]: unknown
  } | null
}

export type AdminCrashGroup = {
  fingerprint: string
  count: number
  first_seen_at: string
  last_seen_at: string
  error_type: string
  message?: string | null
  affected_hwids: string[]
  affected_users: string[]
  latest: AdminCrashLog
}

export type AdminAuditLogItem = {
  id?: string
  action?: string
  type?: string
  entity?: string
  entity_id?: string | null
  admin_email?: string | null
  actor?: string | null
  payload?: unknown
  happened_at?: string
  at?: string
}

export type AdminSupportThread = {
  id: string
  subject: string
  status?: string
  email?: string | null
  install_id?: string | null
  device_id?: string | null
  app_version?: string | null
  app_build_id?: string | null
  channel?: string | null
  platform?: string | null
  created_at?: string
  updated_at?: string
  last_message_body?: string | null
  last_message_sender?: string | null
  last_message_at?: string | null
  unread_count?: number
  support_blocked?: boolean | number
}

export type AdminSupportMessage = {
  id: string
  thread_id: string
  sender: 'user' | 'admin' | 'system' | 'internal' | string
  body: string
  created_at?: string
}

export type AdminEmailJob = {
  id: string
  email_type: string
  catalog_event_type?: string | null
  template_key?: string | null
  template_version?: number | null
  email_category?: string | null
  recipient: string
  sender?: string | null
  subject: string
  linked_user_id?: string | null
  linked_ticket_id?: string | null
  status: string
  attempt_count?: number
  max_attempts?: number
  provider_message_id?: string | null
  last_error?: string | null
  last_attempt_at?: string | null
  sent_at?: string | null
  delivered_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type AdminInboundEmailMessage = {
  id: string
  provider_email_id?: string | null
  thread_id?: string | null
  sender_email?: string | null
  recipient_email?: string | null
  subject?: string | null
  status: string
  rejection_reason?: string | null
  received_at?: string | null
  processed_at?: string | null
  created_at?: string | null
}

export type AdminEmailCatalogItem = {
  event_type: string
  template_key: string
  template_version: number
  category: string
  sender_identity: string
  title_en: string
  title_ar: string
  description_en: string
  description_ar: string
  default_subject_en?: string
  default_subject_ar?: string
  integration_status: 'linked' | 'prepared' | 'disabled' | 'backend_missing'
  user_can_disable: boolean
  retry_allowed: boolean
  essential: boolean
  requires_backend_event: boolean
  admin_test_allowed: boolean
}

export type AdminEmailProviderEvent = {
  id: string
  event_type: string
  provider_message_id?: string | null
  email_job_id?: string | null
  processed_at?: string | null
  created_at?: string | null
}

export type AdminEmailRecipientFlag = {
  email: string
  status: string
  reason?: string | null
  provider_message_id?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type AdminScheduledEmail = {
  id: string
  event_type: string
  recipient: string
  status: string
  scheduled_for: string
  attempts?: number | null
  last_error?: string | null
  linked_user_id?: string | null
  linked_ticket_id?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type AdminEmailStatus = {
  success: boolean
  generated_at?: string
  config: {
    outbound_enabled: boolean
    inbound_enabled: boolean
    scheduler_enabled?: boolean
    category_flags?: Record<string, boolean>
    has_resend_api_key: boolean
    has_resend_webhook_secret: boolean
    from: string
    sender_identities?: Record<string, string>
    reply_domain: string
    webhook_path: string
  }
  metrics?: {
    catalog_total?: number
    catalog_linked?: number
    catalog_prepared?: number
    catalog_disabled?: number
    latest_event_at?: string | null
  }
  catalog?: AdminEmailCatalogItem[]
  counts: Array<{ status: string; count: number }>
  jobs: AdminEmailJob[]
  inbound: AdminInboundEmailMessage[]
  provider_events?: AdminEmailProviderEvent[]
  recipient_flags?: AdminEmailRecipientFlag[]
  scheduled?: AdminScheduledEmail[]
}

export type AdminRemoteControls = {
  rollout_percent?: number
  minimum_supported_version?: string
  force_update_deadline?: string
  remote_config?: {
    update_mode?: 'optional' | 'force' | 'required' | 'silent'
    kill_switch_enabled?: boolean
    kill_switch_message?: string
    feature_flags?: Record<string, unknown>
    announcements?: Array<{
      id?: string
      title?: string
      body?: string
      severity?: 'info' | 'warning' | 'critical'
      starts_at?: string
      ends_at?: string
    }>
  }
}

export type AdminUserDetail = {
  success: boolean
  item: AdminSubscription | null
  sessions: Array<Record<string, unknown>>
  crashes: AdminCrashLog[]
  login_requests: Array<Record<string, unknown>>
  devices: Array<Record<string, unknown>>
  last_crash?: AdminCrashLog | null
  request?: {
    user_id?: string | null
    user_email?: string | null
    hwid?: string | null
    status?: string | null
    last_event_at?: string | null
    expires_at?: string | null
  } | null
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
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (!headers.has('Content-Type') && init.body && !isFormData) headers.set('Content-Type', 'application/json')
  const token = getAdminToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${adminBaseUrl()}${path}`, { ...init, headers, credentials: 'same-origin' })
  const raw = await response.text()
  let payload: unknown
  try {
    payload = raw ? JSON.parse(raw) : undefined
  } catch {
    payload = undefined
  }
  if (!response.ok) {
    const rawMessage =
      typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : raw || `request_failed_${response.status}`
    const message = compactAdminError(rawMessage, response.status, path)
    throw new ApiError(message, response.status)
  }
  if (payload === undefined && raw) throw new ApiError(compactAdminError(raw, response.status, path), response.status)
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

export async function fetchAdminSession() {
  return adminFetch<{ success: boolean; email: string }>('/session')
}

export async function fetchAdminDashboard() {
  return adminFetch<{ success: boolean; kpis?: Record<string, number | null>; recent_activity?: unknown[] }>('/dashboard')
}

export async function fetchSubscriptions(params: { search?: string; page?: number; limit?: number } = {}) {
  const query = new URLSearchParams()
  query.set('limit', String(params.limit ?? 100))
  if (params.page) query.set('page', String(params.page))
  if (params.search) query.set('search', params.search)
  return adminFetch<{ success: boolean; items: AdminSubscription[]; page?: number; limit?: number }>(`/subscriptions?${query}`)
}

export async function createSubscription(payload: {
  user_email: string
  firebase_user_id?: string
  hwid?: string
  plan: 'monthly' | 'yearly'
  tier: 'public' | 'private'
  expires_at?: string
  is_unlimited?: boolean
}) {
  return adminFetch<{ success: boolean; item: AdminSubscription; auto_authorized_requests?: number }>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchAccessRequests(params: { search?: string; limit?: number } = {}) {
  const query = new URLSearchParams()
  query.set('limit', String(params.limit ?? 100))
  if (params.search) query.set('search', params.search)
  return adminFetch<{ success: boolean; items: AdminAccessRequest[] }>(`/access-requests?${query}`)
}

export async function patchSubscriptionStatus(id: string, status: AdminSubscription['status']) {
  return adminFetch<{ success: boolean; item: AdminSubscription }>(`/subscriptions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function resetSubscriptionHwid(id: string, revokeSessions = true) {
  return adminFetch<{ success: boolean; item: AdminSubscription }>(`/subscriptions/${encodeURIComponent(id)}/reset-hwid`, {
    method: 'POST',
    body: JSON.stringify({ revoke_sessions: revokeSessions }),
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

export type AdminReleaseUpload = {
  key: string
  channel: string
  version: string
  filename: string
  size: number
  sha256: string
  uploaded_at: string
  uploaded_by: string
  package_type?: 'portable_exe' | 'installed_zip'
}

export type AdminReleaseManifest = {
  version: string
  available: boolean
  mandatory: boolean
  download_url: string
  download_sha256?: string
  filename: string
  notes: string
  channels?: Record<string, Partial<AdminReleaseManifest>>
  manifest_signature?: string
  history_reset_at?: string
}

export async function uploadReleaseBinary(payload: {
  file: File
  version: string
  channel: string
  artifact_type?: 'portable' | 'installed'
}) {
  const form = new FormData()
  form.set('file', payload.file)
  form.set('version', payload.version)
  form.set('channel', payload.channel)
  if (payload.artifact_type) form.set('artifact_type', payload.artifact_type)
  return adminFetch<{ success: boolean; release: AdminReleaseUpload; artifact_type: 'portable' | 'installed' }>('/upload', {
    method: 'POST',
    body: form,
  })
}

export async function publishRelease(payload: {
  version: string
  channel: string
  notes: string
  mandatory: boolean
  update_mode: 'optional' | 'force' | 'required' | 'silent'
  rollout_percent?: number
  minimum_supported_version?: string
  force_update_deadline?: string
  target_scope?: 'all' | 'selected'
  target_user_ids?: string[]
  target_user_emails?: string[]
  target_install_ids?: string[]
  target_device_ids?: string[]
  target_hwids?: string[]
}) {
  return adminFetch<{ success: boolean; targeted?: boolean; target_count?: number; manifest: AdminReleaseManifest }>('/publish', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function rollbackRelease(payload: { version: string; channel: string }) {
  return adminFetch<{ success: boolean; manifest: AdminReleaseManifest }>('/rollback', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function disableRelease(payload: { channel: string; reason?: string }) {
  return adminFetch<{ success: boolean; manifest: AdminReleaseManifest }>('/releases/disable', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function resetOtaBaseline(payload: { channel: string; version?: string }) {
  return adminFetch<{ success: boolean; manifest: AdminReleaseManifest }>('/reset-baseline', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchRemoteControls(channel = 'beta') {
  return adminFetch<{ success: boolean; channel: string; controls: AdminRemoteControls; manifest: AdminReleaseManifest }>(
    `/remote-config?channel=${encodeURIComponent(channel)}`,
  )
}

export async function updateRemoteControls(payload: AdminRemoteControls & { channel: string }) {
  return adminFetch<{ success: boolean; controls: AdminRemoteControls; manifest: AdminReleaseManifest }>('/remote-config', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchCrashLogs(params: { search?: string; page?: number; limit?: number } = {}) {
  const query = new URLSearchParams()
  query.set('limit', String(params.limit ?? 100))
  if (params.page) query.set('page', String(params.page))
  if (params.search) query.set('search', params.search)
  return adminFetch<{ success: boolean; items: AdminCrashLog[]; page?: number; limit?: number }>(`/crash-logs?${query}`)
}

export async function fetchCrashGroups() {
  return adminFetch<{ success: boolean; items: AdminCrashGroup[] }>('/crash-groups?groups=100')
}

export async function fetchAuditLog() {
  return adminFetch<{ success: boolean; items: AdminAuditLogItem[] }>('/audit-log?limit=100')
}

export async function fetchSupportThreads() {
  return adminFetch<{ success: boolean; threads: AdminSupportThread[] }>('/policy/support')
}

export async function fetchSupportMessages(threadId: string) {
  return adminFetch<{ success: boolean; thread?: AdminSupportThread; messages: AdminSupportMessage[] }>(
    `/policy/support/messages?thread_id=${encodeURIComponent(threadId)}`,
  )
}

export async function sendSupportReply(payload: { thread_id: string; body: string; internal_note?: boolean; email_requested?: boolean }) {
  return adminFetch<{ success: boolean }>('/policy/support/reply', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateAdminSupportStatus(payload: { thread_id: string; status: string; reason?: string }) {
  return adminFetch<{ success: boolean; status?: string }>('/policy/support/status', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function setSupportBlocked(payload: { thread_id: string; blocked: boolean; reason?: string }) {
  return adminFetch<{ success: boolean; blocked?: boolean }>('/policy/support/block', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchEmailOperations() {
  return adminFetch<AdminEmailStatus>('/policy/email/status')
}

export async function retryEmailJob(jobId: string) {
  return adminFetch<{ success: boolean; processed?: { processed: number; sent: number; skipped: number } }>('/policy/email/retry', {
    method: 'POST',
    body: JSON.stringify({ job_id: jobId }),
  })
}

export async function fetchEmailPreview(params: { email_type?: string; locale?: 'en' | 'ar' } = {}) {
  const query = new URLSearchParams()
  if (params.email_type) query.set('email_type', params.email_type)
  if (params.locale) query.set('locale', params.locale)
  return adminFetch<{
    success: boolean
    event: AdminEmailCatalogItem
    sender: { from: string; reply_to?: string }
    preview: { event_type: string; subject: string; html: string; text: string; locale: string; template_key: string; template_version: number }
  }>(`/policy/email/preview?${query}`)
}

export async function sendAdminTestEmail(payload: { recipient: string; subject?: string; message?: string; email_type?: string; locale?: 'en' | 'ar' }) {
  return adminFetch<{ success: boolean; job_id?: string; processed?: { processed: number; sent: number; skipped: number } }>(
    '/policy/email/test',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}

export async function processEmailOutbox() {
  return adminFetch<{ success: boolean; processed: { processed: number; sent: number; skipped: number } }>('/policy/email/process', {
    method: 'POST',
  })
}

export async function fetchUserDetail(userKey: string) {
  return adminFetch<AdminUserDetail>(`/users/${encodeURIComponent(userKey)}`)
}

