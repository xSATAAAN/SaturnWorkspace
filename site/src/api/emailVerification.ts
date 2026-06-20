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
  expires_at?: string
  error?: string
  test_code?: string
}

export type EmailVerificationVerifyResult = {
  success: boolean
  status?: string
  verified_at?: string
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

export async function requestEmailVerificationCode(idToken: string, email: string): Promise<EmailVerificationRequestResult> {
  return postJson<EmailVerificationRequestResult>(`${authApiBase()}/email-verification/request`, {
    id_token: idToken,
    email,
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
