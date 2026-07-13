const AUTH_BASE = 'https://auth.saturnws.com'

export type AccountSubscription = {
  success: boolean
  user?: {
    id: string
    email: string
    profile?: AccountProfileProjection | null
  }
  current_subscription?: AccountSubscriptionRuntime | null
  subscription?: AccountSubscriptionRuntime | null
  entitlement?: SubscriptionProjection['entitlement']
  subscription_history_summary?: {
    total: number
    current_usable_count: number
    historical_expired_count: number
    latest_expired_at: string | null
    legacy_email_candidates: number
    uid_mismatch_candidates: number
  }
  subscription_projection?: SubscriptionProjection
  status?: string
  error?: string
}

export type AccountSubscriptionRuntime = {
  status: string
  tier?: string
  subscription_id?: string
  user_email?: string
  plan?: string
  expires_at?: string | null
  runtime_payload?: Record<string, unknown>
  lifecycle?: string | null
  entitlement?: string | null
  plan_term?: string | null
  renewal_state?: string | null
}

export type AccountProfileProjection = {
  user_id: string | null
  firebase_uid: string
  display_name: string | null
  normalized_email: string
  email_verified: boolean
  email_verified_at: string | null
  verification_source: string | null
  auth_providers: unknown[]
  locale: string
  account_status: string
  terms_version: string | null
  terms_accepted_at: string | null
  created_at: string | null
  updated_at: string | null
}

export type SubscriptionProjection = {
  existence: 'none' | 'present'
  lifecycle: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'suspended' | null
  plan_term: 'weekly' | 'monthly' | 'annual' | 'lifetime' | 'custom' | null
  renewal_state: 'not_applicable' | 'manual' | 'auto_renew' | 'cancel_at_period_end'
  entitlement: 'no_subscription' | 'entitled' | 'grace_period' | 'payment_required' | 'expired' | 'suspended' | 'policy_blocked'
  subscription_id: string | null
  plan: string | null
  tier: string | null
  expires_at: string | null
  source: string
}

export type AccountProvisionResult = {
  success: boolean
  profile?: AccountProfileProjection
  profile_state?: string
  email_verification_state?: string
  token_refresh_required?: boolean
  error?: string
  code?: string
  request_id?: string
  retryable?: boolean
  field_errors?: Record<string, string>
}

export type AccountSession = {
  id: string
  device_key: string
  device_name: string
  platform: string | null
  os_version: string | null
  app_version: string | null
  status: 'active' | 'expired' | 'revoked'
  created_at: string
  last_activity_at: string
  expires_at: string
  revoked_at: string | null
}

export type AccountDevice = {
  device_key: string
  device_name: string
  platform: string | null
  os_version: string | null
  active_sessions: number
  total_sessions: number
  last_activity_at: string
}

export type AccountDeviceBinding = {
  id: string
  device_key: string
  device_name: string | null
  platform: string | null
  os_version: string | null
  app_version: string | null
  status: 'active' | 'replaced' | 'revoked' | string
  bound_at: string
  last_seen_at: string
  released_at: string | null
  created_at: string
  updated_at: string
}

export type AccountDeviceChangeRequest = {
  id: string
  current_binding_id: string | null
  resulting_binding_id: string | null
  requested_device_key: string
  device_name: string | null
  platform: string | null
  os_version: string | null
  app_version: string | null
  user_reason: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | string
  requested_at: string
  resolved_at: string | null
  resolution_note: string | null
  created_at: string
  updated_at: string
}

export type AccountDeviceEvent = {
  id: string
  event_type: string
  actor_type: 'system' | 'user' | 'admin' | string
  binding_id: string | null
  change_request_id: string | null
  details: Record<string, unknown>
  created_at: string
}

export type AccountSessionsResult = {
  success: boolean
  sessions: AccountSession[]
  devices: AccountDevice[]
  device_binding: AccountDeviceBinding | null
  device_change_requests: AccountDeviceChangeRequest[]
  device_events: AccountDeviceEvent[]
}

export type AccountDeletionRequest = {
  id: string
  status: 'pending_deletion' | 'deletion_cancelled' | 'deletion_due' | 'on_hold' | string
  requested_at: string
  cooling_off_until: string
  due_at: string
  held_at?: string | null
  cancelled_at?: string | null
}

export type AccountDeletionState = {
  state: 'none' | 'pending_deletion' | 'deletion_cancelled' | 'deletion_due' | 'on_hold' | string
  request: AccountDeletionRequest | null
  purge_available: boolean
  purge_mode: string
}

export type AccountDeletionStatusResult = {
  success: boolean
  account_status?: string
  deletion: AccountDeletionState
}

export async function fetchAccountSubscription(idToken: string) {
  const response = await fetch(`${AUTH_BASE}/account/subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ id_token: idToken }),
  })
  const payload = (await response.json().catch(() => null)) as AccountSubscription | null
  if (!response.ok) {
    throw new Error(payload?.error || `account_request_failed_${response.status}`)
  }
  return payload || { success: false, error: 'empty_response' }
}

export async function provisionAccountProfile(
  idToken: string,
  input: {
    displayName?: string
    locale?: 'ar' | 'en'
    termsAccepted?: boolean
    termsVersion?: string
    termsAcceptedAt?: string
  } = {},
): Promise<AccountProvisionResult> {
  const response = await fetch(`${AUTH_BASE}/account/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      id_token: idToken,
      display_name: input.displayName,
      locale: input.locale,
      terms_accepted: input.termsAccepted,
      terms_version: input.termsVersion,
      terms_accepted_at: input.termsAcceptedAt,
    }),
  })
  const payload = (await response.json().catch(() => null)) as AccountProvisionResult | null
  if (!response.ok) {
    throw new Error(payload?.error || payload?.code || `account_provision_failed_${response.status}`)
  }
  return payload || { success: false, error: 'empty_response' }
}

export async function fetchAccountSessions(idToken: string): Promise<AccountSessionsResult> {
  const response = await fetch(`${AUTH_BASE}/account/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({}),
  })
  const payload = (await response.json().catch(() => null)) as AccountSessionsResult & { error?: string } | null
  if (!response.ok || !payload?.success) throw new Error(payload?.error || `account_sessions_failed_${response.status}`)
  return {
    success: true,
    sessions: payload.sessions || [],
    devices: payload.devices || [],
    device_binding: payload.device_binding || null,
    device_change_requests: payload.device_change_requests || [],
    device_events: payload.device_events || [],
  }
}

export async function requestAccountDeviceChange(
  idToken: string,
  deviceCode: string,
  reason?: string,
): Promise<AccountDeviceChangeRequest> {
  const response = await fetch(`${AUTH_BASE}/account/device-change/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ device_code: deviceCode, reason: reason || '' }),
  })
  const payload = (await response.json().catch(() => null)) as { success?: boolean; request?: AccountDeviceChangeRequest; error?: string } | null
  if (!response.ok || !payload?.success || !payload.request) {
    throw new Error(payload?.error || `device_change_request_failed_${response.status}`)
  }
  return payload.request
}

export async function revokeAccountSession(idToken: string, sessionId: string, scope: 'session' | 'device'): Promise<void> {
  const response = await fetch(`${AUTH_BASE}/account/sessions/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ session_id: sessionId, scope }),
  })
  const payload = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null
  if (!response.ok || !payload?.success) throw new Error(payload?.error || `account_session_revoke_failed_${response.status}`)
}

export async function revokeAllAccountSessions(idToken: string): Promise<void> {
  const response = await fetch(`${AUTH_BASE}/account/sessions/revoke-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({}),
  })
  const payload = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null
  if (!response.ok || !payload?.success) throw new Error(payload?.error || `account_sessions_revoke_failed_${response.status}`)
}

export async function fetchAccountDeletionStatus(idToken: string): Promise<AccountDeletionStatusResult> {
  const response = await fetch(`${AUTH_BASE}/account/deletion/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({}),
  })
  const payload = (await response.json().catch(() => null)) as (AccountDeletionStatusResult & { error?: string }) | null
  if (!response.ok || !payload?.success) throw new Error(payload?.error || `account_deletion_status_failed_${response.status}`)
  return payload
}

export async function requestAccountDeletion(idToken: string, reason?: string): Promise<AccountDeletionStatusResult> {
  const response = await fetch(`${AUTH_BASE}/account/deletion/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ reason: reason || '' }),
  })
  const payload = (await response.json().catch(() => null)) as (AccountDeletionStatusResult & { error?: string; code?: string }) | null
  if (!response.ok || !payload?.success) throw new Error(payload?.error || payload?.code || `account_deletion_request_failed_${response.status}`)
  return payload
}

export async function cancelAccountDeletion(idToken: string): Promise<AccountDeletionStatusResult> {
  const response = await fetch(`${AUTH_BASE}/account/deletion/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({}),
  })
  const payload = (await response.json().catch(() => null)) as (AccountDeletionStatusResult & { error?: string }) | null
  if (!response.ok || !payload?.success) throw new Error(payload?.error || `account_deletion_cancel_failed_${response.status}`)
  return payload
}
