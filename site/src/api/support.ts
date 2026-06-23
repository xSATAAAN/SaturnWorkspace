import { postJson } from '../new-ui/adapters/apiClient'

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

function authHeaders(idToken: string): RequestInit {
  return {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  }
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
  attachments?: WebSupportAttachment[]
}

export type WebSupportAttachment = {
  id: string
  filename: string
  mime_type: string
  size_bytes: number
  status: string
  created_at?: string
  download_url: string
}

export async function createWebSupportTicket(idToken: string, input: { subject: string; body: string; idempotencyKey: string; attachmentIds?: string[] }) {
  return postJson<{ success: boolean; thread_id?: string; error?: string }>(policyPath('/v1/web/support/messages'), {
    id_token: idToken,
    subject: input.subject,
    body: input.body,
    idempotency_key: input.idempotencyKey,
    attachment_ids: input.attachmentIds || [],
  }, {
    ...authHeaders(idToken),
    headers: { Authorization: `Bearer ${idToken}`, 'Idempotency-Key': input.idempotencyKey },
  })
}

export async function fetchWebSupportThreads(idToken: string) {
  return postJson<{ success: boolean; threads: WebSupportThread[] }>(policyPath('/v1/web/support/threads'), { id_token: idToken }, authHeaders(idToken))
}

export async function fetchWebSupportThread(idToken: string, threadId: string) {
  return postJson<{ success: boolean; thread?: WebSupportThread; messages: WebSupportMessage[] }>(policyPath('/v1/web/support/thread'), {
    id_token: idToken,
    thread_id: threadId,
  }, authHeaders(idToken))
}

export async function replyWebSupportThread(idToken: string, threadId: string, body: string, idempotencyKey: string, attachmentIds: string[] = []) {
  return postJson<{ success: boolean; error?: string }>(policyPath('/v1/web/support/reply'), {
    id_token: idToken,
    thread_id: threadId,
    body,
    idempotency_key: idempotencyKey,
    attachment_ids: attachmentIds,
  }, {
    ...authHeaders(idToken),
    headers: { Authorization: `Bearer ${idToken}`, 'Idempotency-Key': idempotencyKey },
  })
}

async function readSupportResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as T & { error?: string } | null
  if (!response.ok || !payload) throw new Error(payload?.error || `support_request_failed_${response.status}`)
  return payload
}

export async function uploadWebSupportAttachment(idToken: string, file: File, threadId?: string) {
  const form = new FormData()
  form.set('file', file)
  if (threadId) form.set('thread_id', threadId)
  const response = await fetch(policyPath('/v1/web/support/attachments'), { method: 'POST', headers: { Authorization: `Bearer ${idToken}` }, body: form })
  return readSupportResponse<{ success: boolean; attachment: WebSupportAttachment }>(response)
}

export async function removeWebSupportAttachment(idToken: string, attachmentId: string) {
  const response = await fetch(policyPath(`/v1/web/support/attachments/${encodeURIComponent(attachmentId)}`), { method: 'DELETE', headers: { Authorization: `Bearer ${idToken}` } })
  return readSupportResponse<{ success: boolean }>(response)
}

export async function downloadWebSupportAttachment(idToken: string, attachment: WebSupportAttachment) {
  const response = await fetch(policyPath(`/v1/web/support/attachments/${encodeURIComponent(attachment.id)}`), { headers: { Authorization: `Bearer ${idToken}` } })
  if (!response.ok) throw new Error(`support_attachment_download_failed_${response.status}`)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = attachment.filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export async function updateWebSupportStatus(idToken: string, threadId: string, status: 'open' | 'closed') {
  return postJson<{ success: boolean; status?: string; error?: string }>(policyPath('/v1/web/support/status'), {
    id_token: idToken,
    thread_id: threadId,
    status,
  }, authHeaders(idToken))
}
