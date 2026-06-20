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
  error?: string
  code?: string
  request_id?: string
  retryable?: boolean
  field_errors?: Record<string, string>
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
