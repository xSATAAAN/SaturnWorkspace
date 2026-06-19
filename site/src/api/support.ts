import { postJson } from './http'

function policyBaseUrl() {
  const configured = String(import.meta.env.VITE_SATURN_POLICY_API_BASE || '').replace(/\/+$/, '')
  if (configured) return configured
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname.toLowerCase()
  if (host === 'api.saturnws.com') return ''
  return 'https://api.saturnws.com'
}

function policyPath(path: string) {
  return `${policyBaseUrl()}${path}`
}

export type WebSupportThread = {
  id: string
  subject: string
  status?: string
  updated_at?: string
  last_message_body?: string | null
  last_message_sender?: string | null
  last_message_at?: string | null
  unread_count?: number
  support_blocked?: boolean | number
}

export type WebSupportMessage = {
  id: string
  thread_id: string
  sender: string
  body: string
  created_at?: string
}

export async function createWebSupportTicket(idToken: string, input: { subject: string; body: string }) {
  return postJson<{ success: boolean; thread_id?: string; error?: string }>(policyPath('/v1/web/support/messages'), {
    id_token: idToken,
    subject: input.subject,
    body: input.body,
  })
}

export async function fetchWebSupportThreads(idToken: string) {
  return postJson<{ success: boolean; threads: WebSupportThread[] }>(policyPath('/v1/web/support/threads'), { id_token: idToken })
}

export async function fetchWebSupportThread(idToken: string, threadId: string) {
  return postJson<{ success: boolean; thread?: WebSupportThread; messages: WebSupportMessage[] }>(policyPath('/v1/web/support/thread'), {
    id_token: idToken,
    thread_id: threadId,
  })
}

export async function replyWebSupportThread(idToken: string, threadId: string, body: string) {
  return postJson<{ success: boolean; error?: string }>(policyPath('/v1/web/support/reply'), {
    id_token: idToken,
    thread_id: threadId,
    body,
  })
}

export async function updateWebSupportStatus(idToken: string, threadId: string, status: 'open' | 'closed') {
  return postJson<{ success: boolean; status?: string; error?: string }>(policyPath('/v1/web/support/status'), {
    id_token: idToken,
    thread_id: threadId,
    status,
  })
}
