import { postJson } from '../new-ui/adapters/apiClient'

function authApiBase(): string {
  const configured = String(import.meta.env.VITE_SATURN_AUTH_API_BASE || '').replace(/\/+$/, '')
  if (configured) return configured
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    if (host === 'auth.saturnws.com') return ''
  }
  return 'https://auth.saturnws.com'
}

export type EmailVerificationRequestResult = {
  success: boolean
  status?: string
  registration_id?: string
  email?: string
  expires_at?: string
  resend_after_seconds?: number
  retry_after_seconds?: number
  error?: string
  test_code?: string
}

export type EmailVerificationVerifyResult = {
  success: boolean
  status?: string
  registration_id?: string
  email?: string
  verified_at?: string
  finalization_token?: string
  finalization_expires_at?: string
  retry_after_seconds?: number
  error?: string
}

export type EmailRegistrationFinalizeResult = {
  success: boolean
  status?: string
  email?: string
  error?: string
}

export type EmailVerificationStatusResult = {
  success: boolean
  status?: string
  verified?: boolean
  expires_at?: string | null
  attempts?: number
  error?: string
}

export type EmailVerificationCancelResult = {
  success: boolean
  status?: string
  error?: string
}

export type EmailVerificationRequestInput = {
  displayName?: string
  locale?: 'ar' | 'en'
  termsAccepted?: boolean
  termsVersion?: string
  termsAcceptedAt?: string
}

export async function startEmailRegistration(input: EmailVerificationRequestInput & { email: string }): Promise<EmailVerificationRequestResult> {
  return postJson<EmailVerificationRequestResult>(`${authApiBase()}/email-verification/start`, {
    email: input.email,
    display_name: input.displayName,
    locale: input.locale,
    terms_accepted: input.termsAccepted,
    terms_version: input.termsVersion,
    terms_accepted_at: input.termsAcceptedAt,
  })
}

export async function requestEmailVerificationCode(idToken: string, email: string, input: EmailVerificationRequestInput = {}): Promise<EmailVerificationRequestResult> {
  return postJson<EmailVerificationRequestResult>(`${authApiBase()}/email-verification/request`, {
    id_token: idToken,
    email,
    display_name: input.displayName,
    locale: input.locale,
    terms_accepted: input.termsAccepted,
    terms_version: input.termsVersion,
    terms_accepted_at: input.termsAcceptedAt,
  }, { headers: { Authorization: `Bearer ${idToken}` } })
}

export async function verifyEmailVerificationCode(idToken: string, email: string, code: string): Promise<EmailVerificationVerifyResult> {
  return postJson<EmailVerificationVerifyResult>(`${authApiBase()}/email-verification/verify`, {
    id_token: idToken,
    email,
    code,
  }, { headers: { Authorization: `Bearer ${idToken}` } })
}

export async function fetchEmailVerificationStatus(idToken: string, email: string): Promise<EmailVerificationStatusResult> {
  return postJson<EmailVerificationStatusResult>(`${authApiBase()}/email-verification/status`, {
    id_token: idToken,
    email,
  }, { headers: { Authorization: `Bearer ${idToken}` } })
}

export async function verifyEmailRegistrationCode(input: { registrationId: string; email: string; code: string }): Promise<EmailVerificationVerifyResult> {
  return postJson<EmailVerificationVerifyResult>(`${authApiBase()}/email-verification/verify`, {
    registration_id: input.registrationId,
    email: input.email,
    code: input.code,
  })
}

export async function finalizeEmailRegistration(input: { registrationId: string; email: string; finalizationToken: string; password: string }): Promise<EmailRegistrationFinalizeResult> {
  return postJson<EmailRegistrationFinalizeResult>(`${authApiBase()}/email-verification/finalize`, {
    registration_id: input.registrationId,
    email: input.email,
    finalization_token: input.finalizationToken,
    password: input.password,
  })
}

export async function cancelEmailVerificationCode(idToken: string, email: string): Promise<EmailVerificationCancelResult> {
  return postJson<EmailVerificationCancelResult>(`${authApiBase()}/email-verification/cancel`, {
    id_token: idToken,
    email,
  }, { headers: { Authorization: `Bearer ${idToken}` } })
}

export async function cancelEmailRegistrationCode(input: { registrationId: string; email: string }): Promise<EmailVerificationCancelResult> {
  return postJson<EmailVerificationCancelResult>(`${authApiBase()}/email-verification/cancel`, {
    registration_id: input.registrationId,
    email: input.email,
  })
}
