export type AppErrorCode =
  | 'AUTH_EMAIL_ALREADY_USED'
  | 'AUTH_WEAK_PASSWORD'
  | 'AUTH_INVALID_EMAIL'
  | 'AUTH_TOO_MANY_ATTEMPTS'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_SESSION_EXPIRED'
  | 'EMAIL_VERIFICATION_REQUIRED'
  | 'PROFILE_PROVISIONING_FAILED'
  | 'VERIFICATION_CODE_INVALID'
  | 'VERIFICATION_CODE_EXPIRED'
  | 'VERIFICATION_RATE_LIMITED'
  | 'VERIFICATION_DELIVERY_DISABLED'
  | 'VERIFICATION_DELIVERY_NOT_CONFIGURED'
  | 'VERIFICATION_DELIVERY_FAILED'
  | 'SUBSCRIPTION_INACTIVE'
  | 'DOWNLOAD_NOT_ENTITLED'
  | 'SUPPORT_TICKET_FORBIDDEN'
  | 'SUPPORT_RATE_LIMITED'
  | 'ADMIN_PERMISSION_REQUIRED'
  | 'NETWORK_UNAVAILABLE'
  | 'REQUEST_FAILED'

const rawToCode: Record<string, AppErrorCode> = {
  auth_email_already_used: 'AUTH_EMAIL_ALREADY_USED',
  auth_weak_password: 'AUTH_WEAK_PASSWORD',
  auth_invalid_email: 'AUTH_INVALID_EMAIL',
  auth_too_many_attempts: 'AUTH_TOO_MANY_ATTEMPTS',
  profile_provisioning_failed: 'PROFILE_PROVISIONING_FAILED',
  profile_terms_required: 'PROFILE_PROVISIONING_FAILED',
  email_verification_required: 'EMAIL_VERIFICATION_REQUIRED',
  verification_code_invalid: 'VERIFICATION_CODE_INVALID',
  verification_code_expired: 'VERIFICATION_CODE_EXPIRED',
  verification_rate_limited: 'VERIFICATION_RATE_LIMITED',
  verification_delivery_disabled: 'VERIFICATION_DELIVERY_DISABLED',
  verification_delivery_not_configured: 'VERIFICATION_DELIVERY_NOT_CONFIGURED',
  verification_delivery_failed: 'VERIFICATION_DELIVERY_FAILED',
  invalid_credentials: 'AUTH_INVALID_CREDENTIALS',
  auth_invalid_credentials: 'AUTH_INVALID_CREDENTIALS',
  not_authenticated: 'AUTH_SESSION_EXPIRED',
  unauthorized: 'AUTH_SESSION_EXPIRED',
  email_code_invalid: 'VERIFICATION_CODE_INVALID',
  email_code_expired: 'VERIFICATION_CODE_EXPIRED',
  email_resend_limited: 'VERIFICATION_RATE_LIMITED',
  subscription_inactive: 'SUBSCRIPTION_INACTIVE',
  subscription_expired: 'SUBSCRIPTION_INACTIVE',
  download_not_entitled: 'DOWNLOAD_NOT_ENTITLED',
  thread_not_found: 'SUPPORT_TICKET_FORBIDDEN',
  support_blocked: 'SUPPORT_TICKET_FORBIDDEN',
  support_rate_limited: 'SUPPORT_RATE_LIMITED',
  missing_id_token: 'AUTH_SESSION_EXPIRED',
  identity_incomplete: 'AUTH_SESSION_EXPIRED',
  admin_permission_required: 'ADMIN_PERMISSION_REQUIRED',
}

export function normalizeAppErrorCode(raw: unknown, status?: number): AppErrorCode {
  const key = String(raw || '').trim().toLowerCase()
  if (rawToCode[key]) return rawToCode[key]
  if (status === 401) return 'AUTH_SESSION_EXPIRED'
  if (status === 403) return 'ADMIN_PERMISSION_REQUIRED'
  if (!key || key.includes('failed to fetch') || key.includes('network')) return 'NETWORK_UNAVAILABLE'
  return 'REQUEST_FAILED'
}

export function userSafeErrorMessage(raw: unknown, status?: number): string {
  const code = normalizeAppErrorCode(raw, status)
  switch (code) {
    case 'AUTH_EMAIL_ALREADY_USED':
    case 'AUTH_WEAK_PASSWORD':
    case 'AUTH_INVALID_EMAIL':
    case 'AUTH_TOO_MANY_ATTEMPTS':
    case 'PROFILE_PROVISIONING_FAILED':
    case 'VERIFICATION_CODE_INVALID':
    case 'VERIFICATION_CODE_EXPIRED':
    case 'VERIFICATION_RATE_LIMITED':
    case 'VERIFICATION_DELIVERY_DISABLED':
    case 'VERIFICATION_DELIVERY_NOT_CONFIGURED':
    case 'VERIFICATION_DELIVERY_FAILED':
      return code
    case 'AUTH_INVALID_CREDENTIALS':
      return 'AUTH_INVALID_CREDENTIALS'
    case 'AUTH_SESSION_EXPIRED':
      return 'AUTH_SESSION_EXPIRED'
    case 'EMAIL_VERIFICATION_REQUIRED':
      return 'EMAIL_VERIFICATION_REQUIRED'
    case 'SUBSCRIPTION_INACTIVE':
      return 'SUBSCRIPTION_INACTIVE'
    case 'DOWNLOAD_NOT_ENTITLED':
      return 'DOWNLOAD_NOT_ENTITLED'
    case 'SUPPORT_TICKET_FORBIDDEN':
      return 'SUPPORT_TICKET_FORBIDDEN'
    case 'SUPPORT_RATE_LIMITED':
      return 'SUPPORT_RATE_LIMITED'
    case 'ADMIN_PERMISSION_REQUIRED':
      return 'ADMIN_PERMISSION_REQUIRED'
    case 'NETWORK_UNAVAILABLE':
      return 'NETWORK_UNAVAILABLE'
    default:
      return 'REQUEST_FAILED'
  }
}
