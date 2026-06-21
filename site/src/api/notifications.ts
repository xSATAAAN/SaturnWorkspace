import { postJson } from '../new-ui/adapters/apiClient'

function policyBaseUrl() {
  const configured = String(import.meta.env.VITE_SATURN_POLICY_API_BASE || '').replace(/\/+$/, '')
  if (configured) return configured
  if (typeof window === 'undefined') return ''
  return window.location.hostname.toLowerCase() === 'api.saturnws.com' ? '' : 'https://api.saturnws.com'
}

function policyPath(path: string) {
  return `${policyBaseUrl()}${path}`
}

function authInit(idToken: string): RequestInit {
  return { headers: { Authorization: `Bearer ${idToken}` } }
}

export type PortalNotification = {
  id: string
  type: string
  title: string
  body: string
  title_ar?: string | null
  body_ar?: string | null
  linked_resource_type?: string | null
  linked_resource_id?: string | null
  payload_json?: string | null
  portal_status: string
  email_status: string
  read_at?: string | null
  created_at: string
  updated_at?: string
}

export type PortalNotificationPage = {
  success: boolean
  items: PortalNotification[]
  unread_count: number
  next_cursor?: string | null
}

export function fetchPortalNotifications(idToken: string, input: { cursor?: string | null; limit?: number } = {}) {
  return postJson<PortalNotificationPage>(policyPath('/v1/web/notifications/list'), {
    id_token: idToken,
    cursor: input.cursor || undefined,
    limit: input.limit || 20,
  }, authInit(idToken))
}

export function markPortalNotificationRead(idToken: string, notificationId: string) {
  return postJson<{ success: boolean }>(policyPath('/v1/web/notifications/read'), {
    id_token: idToken,
    notification_id: notificationId,
  }, authInit(idToken))
}

export function markAllPortalNotificationsRead(idToken: string) {
  return postJson<{ success: boolean; updated: number }>(policyPath('/v1/web/notifications/read-all'), {
    id_token: idToken,
  }, authInit(idToken))
}

export function archivePortalNotification(idToken: string, notificationId: string) {
  return postJson<{ success: boolean }>(policyPath('/v1/web/notifications/archive'), {
    id_token: idToken,
    notification_id: notificationId,
  }, authInit(idToken))
}
