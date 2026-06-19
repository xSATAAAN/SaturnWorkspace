export type AppErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_SESSION_EXPIRED'
  | 'EMAIL_CODE_INVALID'
  | 'EMAIL_CODE_EXPIRED'
  | 'EMAIL_RESEND_LIMITED'
  | 'SUBSCRIPTION_INACTIVE'
  | 'DOWNLOAD_NOT_ENTITLED'
  | 'SUPPORT_TICKET_FORBIDDEN'
  | 'ADMIN_PERMISSION_REQUIRED'
  | 'NETWORK_UNAVAILABLE'
  | 'REQUEST_FAILED'

const rawToCode: Record<string, AppErrorCode> = {
  invalid_credentials: 'AUTH_INVALID_CREDENTIALS',
  auth_invalid_credentials: 'AUTH_INVALID_CREDENTIALS',
  not_authenticated: 'AUTH_SESSION_EXPIRED',
  unauthorized: 'AUTH_SESSION_EXPIRED',
  email_code_invalid: 'EMAIL_CODE_INVALID',
  email_code_expired: 'EMAIL_CODE_EXPIRED',
  email_resend_limited: 'EMAIL_RESEND_LIMITED',
  subscription_inactive: 'SUBSCRIPTION_INACTIVE',
  subscription_expired: 'SUBSCRIPTION_INACTIVE',
  download_not_entitled: 'DOWNLOAD_NOT_ENTITLED',
  thread_not_found: 'SUPPORT_TICKET_FORBIDDEN',
  support_blocked: 'SUPPORT_TICKET_FORBIDDEN',
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
    case 'AUTH_INVALID_CREDENTIALS':
      return 'AUTH_INVALID_CREDENTIALS'
    case 'AUTH_SESSION_EXPIRED':
      return 'AUTH_SESSION_EXPIRED'
    case 'SUBSCRIPTION_INACTIVE':
      return 'SUBSCRIPTION_INACTIVE'
    case 'DOWNLOAD_NOT_ENTITLED':
      return 'DOWNLOAD_NOT_ENTITLED'
    case 'SUPPORT_TICKET_FORBIDDEN':
      return 'SUPPORT_TICKET_FORBIDDEN'
    case 'ADMIN_PERMISSION_REQUIRED':
      return 'ADMIN_PERMISSION_REQUIRED'
    case 'NETWORK_UNAVAILABLE':
      return 'NETWORK_UNAVAILABLE'
    default:
      return 'REQUEST_FAILED'
  }
}
