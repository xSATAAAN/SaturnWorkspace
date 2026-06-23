import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temp = await mkdtemp(path.join(tmpdir(), 'saturnws-phase-d-'))
const bundle = path.join(temp, 'worker.mjs')
const adminToken = 'phase-d-local-admin-token-2026'
const authEmailToken = 'phase-d-local-auth-email-token-2026'
const webhookKey = Buffer.alloc(32, 7)
const webhookSecret = `whsec_${webhookKey.toString('base64')}`
const userByToken = new Map([
  ['token-a', { id: 'firebase-user-a', email: 'user-a@example.test' }],
  ['token-b', { id: 'firebase-user-b', email: 'user-b@example.test' }],
  ['token-c', { id: 'firebase-user-c', email: 'user-c@example.test' }],
])
const receivedMessages = new Map()
let failReceiveOnce = true
let failSend = false

await build({
  entryPoints: [path.join(root, 'src', 'index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: bundle,
  logLevel: 'silent',
})

const mf = new Miniflare({
  modules: true,
  scriptPath: bundle,
  compatibilityDate: '2026-05-28',
  d1Databases: ['DB'],
  r2Buckets: ['SUPPORT_ATTACHMENTS'],
  bindings: {
    POLICY_SIGNING_SEED_B64: Buffer.alloc(32, 3).toString('base64'),
    ADMIN_TOKEN_SHA256: createHash('sha256').update(adminToken).digest('hex'),
    EMAIL_OUTBOUND_ENABLED: 'true',
    EMAIL_INBOUND_ENABLED: 'true',
    EMAIL_SUPPORT_ENABLED: 'true',
    EMAIL_AUTH_ENABLED: 'true',
    EMAIL_BILLING_ENABLED: 'false',
    EMAIL_RELEASE_ENABLED: 'false',
    EMAIL_SECURITY_ENABLED: 'false',
    EMAIL_SCHEDULER_ENABLED: 'true',
    EMAIL_FROM_SUPPORT: 'SaturnWS Support <support@mail.saturnws.com>',
    EMAIL_REPLY_DOMAIN: 'mail.saturnws.com',
    APP_PUBLIC_URL: 'https://saturnws.com',
    RESEND_SEND_API_KEY: 'local-send-key',
    RESEND_RECEIVE_API_KEY: 'local-receive-key',
    RESEND_WEBHOOK_SECRET: webhookSecret,
    AUTH_EMAIL_ENQUEUE_TOKEN: authEmailToken,
    EMAIL_SENSITIVE_PAYLOAD_KEY_B64: Buffer.alloc(32, 11).toString('base64'),
    RESEND_API_BASE: 'https://resend.local',
  },
  serviceBindings: {
    AUTH_SERVICE: async (request) => {
      const input = await request.json().catch(() => ({}))
      const user = userByToken.get(String(input.id_token || ''))
      return Response.json(user ? { success: true, user } : { success: false, error: 'unauthorized' }, { status: user ? 200 : 401 })
    },
    RESEND_SERVICE: async (request) => {
      const url = new URL(request.url)
      if (request.method === 'POST' && url.pathname === '/emails') {
        const input = await request.json().catch(() => ({}))
        if (failSend || String(input.to || '').includes('send-fail')) return Response.json({ message: 'provider unavailable' }, { status: 503 })
        return Response.json({ id: `provider-${createHash('sha1').update(String(input.subject || Date.now())).digest('hex').slice(0, 12)}` })
      }
      const emailId = decodeURIComponent(url.pathname.split('/').pop() || '')
      if (emailId === 'provider-fail' && failReceiveOnce) {
        failReceiveOnce = false
        return Response.json({ message: 'temporary failure' }, { status: 503 })
      }
      const message = receivedMessages.get(emailId)
      return message ? Response.json(message) : Response.json({ message: 'not found' }, { status: 404 })
    },
  },
})

try {
  const db = await mf.getD1Database('DB')
  const migrationDir = path.join(root, 'migrations')
  for (const name of (await readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort()) {
    const sql = (await readFile(path.join(migrationDir, name), 'utf8'))
      .replace(/^\s*--.*$/gm, '')
      .replace(/\r?\n/g, ' ')
    await db.exec(sql)
  }

  const post = async (pathname, body, token = 'token-a', headers = {}) => {
    const response = await mf.dispatchFetch(`https://api.saturnws.com${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...headers },
      body: JSON.stringify({ id_token: token, ...body }),
    })
    return { response, body: await response.json() }
  }
  const adminPost = async (pathname, body) => {
    const response = await mf.dispatchFetch(`https://api.saturnws.com${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(body),
    })
    return { response, body: await response.json() }
  }
  const adminGet = async (pathname) => {
    const response = await mf.dispatchFetch(`https://api.saturnws.com${pathname}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    return { response, body: await response.json() }
  }

  const verificationCode = '482731'
  const authEnqueueResponse = await mf.dispatchFetch('https://api.saturnws.com/v1/internal/email/auth/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authEmailToken}` },
    body: JSON.stringify({
      event_type: 'auth.email_verification',
      idempotency_key: 'auth-email-verification:fixture:1',
      verification_request_id: 'fixture-verification-1',
      user_id: 'firebase-user-a',
      purpose: 'email_verification',
      recipient: 'user-a@example.test',
      locale: 'en',
      payload: { code: verificationCode, expires_at: new Date(Date.now() + 600_000).toISOString() },
    }),
  })
  assert.equal(authEnqueueResponse.status, 200)
  const authEnqueueBody = await authEnqueueResponse.json()
  const queuedAuthJob = await db.prepare('SELECT * FROM email_jobs WHERE id = ?1').bind(authEnqueueBody.job_id).first()
  assert.equal(queuedAuthJob.status, 'queued')
  assert.ok(queuedAuthJob.sensitive_payload_ciphertext)
  assert.ok(!JSON.stringify(queuedAuthJob).includes(verificationCode), 'OTP must not be exposed outside encrypted payload')
  await adminPost('/v1/admin/email/process', {})
  const sentAuthJob = await db.prepare('SELECT status, sensitive_payload_ciphertext, sensitive_payload_purged_at FROM email_jobs WHERE id = ?1').bind(authEnqueueBody.job_id).first()
  assert.equal(sentAuthJob.status, 'sent')
  assert.equal(sentAuthJob.sensitive_payload_ciphertext, null)
  assert.ok(sentAuthJob.sensitive_payload_purged_at)

  const createKey = 'ticket:create:a'
  const attachmentForm = new FormData()
  attachmentForm.set('file', new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], 'evidence.png', { type: 'image/png' }))
  const encodedAttachment = new Request('https://local.test', { method: 'POST', body: attachmentForm })
  const attachmentResponse = await mf.dispatchFetch('https://api.saturnws.com/v1/web/support/attachments', { method: 'POST', headers: { Authorization: 'Bearer token-a', 'Content-Type': encodedAttachment.headers.get('Content-Type') }, body: await encodedAttachment.arrayBuffer() })
  const attachmentPayload = await attachmentResponse.json()
  assert.equal(attachmentResponse.status, 200, JSON.stringify(attachmentPayload))
  const created = await post('/v1/web/support/messages', { subject: 'Account help', body: 'Please review my account.', idempotency_key: createKey, attachment_ids: [attachmentPayload.attachment.id] }, 'token-a', { 'Idempotency-Key': createKey })
  assert.equal(created.response.status, 200)
  assert.ok(created.body.thread_id)
  const attachmentThread = await post('/v1/web/support/thread', { thread_id: created.body.thread_id }, 'token-a')
  assert.equal(attachmentThread.body.messages[0].attachments.length, 1)
  const attachmentDownload = await mf.dispatchFetch(`https://api.saturnws.com/v1/web/support/attachments/${attachmentPayload.attachment.id}`, { headers: { Authorization: 'Bearer token-a' } })
  assert.equal(attachmentDownload.status, 200)
  assert.match(attachmentDownload.headers.get('content-disposition') || '', /attachment;/)
  const foreignAttachmentDownload = await mf.dispatchFetch(`https://api.saturnws.com/v1/web/support/attachments/${attachmentPayload.attachment.id}`, { headers: { Authorization: 'Bearer token-b' } })
  assert.equal(foreignAttachmentDownload.status, 404)
  const orphanForm = new FormData()
  orphanForm.set('file', new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], 'orphan.png', { type: 'image/png' }))
  const encodedOrphan = new Request('https://local.test', { method: 'POST', body: orphanForm })
  const orphanResponse = await mf.dispatchFetch('https://api.saturnws.com/v1/web/support/attachments', { method: 'POST', headers: { Authorization: 'Bearer token-a', 'Content-Type': encodedOrphan.headers.get('Content-Type') }, body: await encodedOrphan.arrayBuffer() })
  assert.equal(orphanResponse.status, 200)
  const orphanPayload = await orphanResponse.json()
  await db.prepare("UPDATE support_attachments SET created_at = datetime('now', '-2 days') WHERE id = ?1").bind(orphanPayload.attachment.id).run()
  const cleanupRun = await adminPost('/v1/admin/email/process', {})
  assert.equal(cleanupRun.body.processed.cleanup.attachmentsDeleted, 1)
  const orphanRow = await db.prepare('SELECT status, deleted_at FROM support_attachments WHERE id = ?1').bind(orphanPayload.attachment.id).first()
  assert.equal(orphanRow.status, 'deleted')
  assert.ok(orphanRow.deleted_at)
  const duplicateCreate = await post('/v1/web/support/messages', { subject: 'Account help', body: 'Please review my account.', idempotency_key: createKey })
  assert.equal(duplicateCreate.body.thread_id, created.body.thread_id)
  assert.equal(duplicateCreate.body.duplicate, true)

  const owned = await post('/v1/web/support/thread', { thread_id: created.body.thread_id })
  assert.equal(owned.response.status, 200)
  assert.equal(owned.body.messages.length, 1)
  const forbidden = await post('/v1/web/support/thread', { thread_id: created.body.thread_id }, 'token-b')
  assert.equal(forbidden.response.status, 404)

  const replyKey = 'ticket:reply:a:1'
  await post('/v1/web/support/reply', { thread_id: created.body.thread_id, body: 'Additional detail.', idempotency_key: replyKey })
  const duplicateReply = await post('/v1/web/support/reply', { thread_id: created.body.thread_id, body: 'Additional detail.', idempotency_key: replyKey })
  assert.equal(duplicateReply.body.duplicate, true)

  const adminReplyKey = 'ticket:admin-reply:a:1'
  const adminReply = await adminPost('/v1/admin/support/reply', { thread_id: created.body.thread_id, body: 'We are reviewing this.', email_requested: true, idempotency_key: adminReplyKey })
  assert.equal(adminReply.response.status, 200)
  assert.equal(adminReply.body.delivery_mode, 'portal_and_email')
  const duplicateAdminReply = await adminPost('/v1/admin/support/reply', { thread_id: created.body.thread_id, body: 'We are reviewing this.', email_requested: true, idempotency_key: adminReplyKey })
  assert.equal(duplicateAdminReply.body.duplicate, true)
  await adminPost('/v1/admin/support/reply', { thread_id: created.body.thread_id, body: 'Internal context.', internal_note: true, email_requested: true, idempotency_key: 'ticket:note:a:1' })
  const customerThread = await post('/v1/web/support/thread', { thread_id: created.body.thread_id })
  assert.equal(customerThread.body.messages.some((message) => message.sender_role === 'internal_note'), false)

  const notifications = await post('/v1/web/notifications/list', { limit: 20 })
  assert.equal(notifications.response.status, 200)
  assert.equal(notifications.body.unread_count, 1)
  assert.equal(notifications.body.items.filter((item) => item.type === 'support_reply').length, 1)
  const otherNotifications = await post('/v1/web/notifications/list', { limit: 20 }, 'token-b')
  assert.equal(otherNotifications.body.items.length, 0)
  await post('/v1/web/notifications/read', { notification_id: notifications.body.items[0].id })
  const readState = await post('/v1/web/notifications/list', { limit: 20 })
  assert.equal(readState.body.unread_count, 0)
  assert.equal(readState.body.items[0].read_at !== null, true)
  await post('/v1/web/notifications/read-all', {})

  await adminPost('/v1/admin/support/status', { thread_id: created.body.thread_id, status: 'closed', idempotency_key: 'ticket:status:a:closed' })
  const closedReply = await post('/v1/web/support/reply', { thread_id: created.body.thread_id, body: 'Should be blocked until reopen.', idempotency_key: 'ticket:reply:a:closed' })
  assert.equal(closedReply.response.status, 409)
  const reopened = await post('/v1/web/support/status', { thread_id: created.body.thread_id, status: 'open' })
  assert.equal(reopened.body.status, 'reopened')

  await adminPost('/v1/admin/support/block', { thread_id: created.body.thread_id, blocked: true, reason: 'test' })
  const blockedReply = await post('/v1/web/support/reply', { thread_id: created.body.thread_id, body: 'Blocked.', idempotency_key: 'ticket:reply:a:blocked' })
  assert.equal(blockedReply.response.status, 403)
  await adminPost('/v1/admin/support/block', { thread_id: created.body.thread_id, blocked: false })

  for (let index = 0; index < 5; index += 1) {
    const result = await post('/v1/web/support/messages', { subject: `Rate ${index}`, body: 'Rate test', idempotency_key: `rate:c:${index}` }, 'token-c')
    assert.equal(result.response.status, 200)
  }
  const limited = await post('/v1/web/support/messages', { subject: 'Rate exceeded', body: 'Rate test', idempotency_key: 'rate:c:6' }, 'token-c')
  assert.equal(limited.response.status, 429)

  const emailJob = await db.prepare("SELECT reply_to, provider_message_id FROM email_jobs WHERE linked_ticket_id = ?1 AND email_type = 'support.admin_replied' ORDER BY created_at DESC LIMIT 1").bind(created.body.thread_id).first()
  assert.ok(emailJob?.reply_to)
  const inboundAddress = String(emailJob.reply_to)
  receivedMessages.set('received-valid', { id: 'received-valid', from: 'user-a@example.test', to: [inboundAddress], subject: 'Re: Account help', text: 'Reply from email.\n\nOn an earlier date, support wrote:\nquoted text' })
  const webhook = async (eventId, emailId, extraData = {}) => {
    const payload = JSON.stringify({ type: 'email.received', data: { email_id: emailId, ...extraData } })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = createHmac('sha256', webhookKey).update(`${eventId}.${timestamp}.${payload}`).digest('base64')
    const response = await mf.dispatchFetch('https://api.saturnws.com/api/webhooks/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'svix-id': eventId, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` },
      body: payload,
    })
    return { response, body: await response.json() }
  }
  const invalidWebhook = await mf.dispatchFetch('https://api.saturnws.com/api/webhooks/resend', { method: 'POST', body: '{}' })
  assert.equal(invalidWebhook.status, 401)
  const inbound = await webhook('evt-inbound-valid', 'received-valid')
  assert.equal(inbound.response.status, 200)
  assert.equal(inbound.body.status, 'processed')
  const duplicateInbound = await webhook('evt-inbound-valid', 'received-valid')
  assert.equal(duplicateInbound.body.duplicate, true)
  const inboundMessageCount = await db.prepare("SELECT COUNT(*) AS count FROM support_messages WHERE idempotency_key = 'inbound:evt-inbound-valid'").first()
  assert.equal(Number(inboundMessageCount.count), 1)

  receivedMessages.set('received-unknown-token', { id: 'received-unknown-token', from: 'user-a@example.test', to: ['reply+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@mail.saturnws.com'], subject: 'Unknown', text: 'Unknown token' })
  assert.equal((await webhook('evt-unknown-token', 'received-unknown-token')).body.reason, 'reply_token_not_found')

  const replyTokenValue = /reply\+([a-f0-9]+)@/i.exec(inboundAddress)?.[1]
  assert.ok(replyTokenValue)
  const replyTokenHash = createHash('sha256').update(replyTokenValue).digest('hex')
  await db.prepare("UPDATE support_reply_tokens SET expires_at = datetime('now', '-1 minute') WHERE token_hash = ?1").bind(replyTokenHash).run()
  receivedMessages.set('received-expired-token', { id: 'received-expired-token', from: 'user-a@example.test', to: [inboundAddress], subject: 'Expired', text: 'Expired token' })
  assert.equal((await webhook('evt-expired-token', 'received-expired-token')).body.reason, 'reply_token_expired')
  await db.prepare("UPDATE support_reply_tokens SET expires_at = datetime('now', '+1 day'), active = 0, revoked_at = datetime('now') WHERE token_hash = ?1").bind(replyTokenHash).run()
  receivedMessages.set('received-revoked-token', { id: 'received-revoked-token', from: 'user-a@example.test', to: [inboundAddress], subject: 'Revoked', text: 'Revoked token' })
  assert.equal((await webhook('evt-revoked-token', 'received-revoked-token')).body.reason, 'reply_token_revoked')
  await db.prepare("UPDATE support_reply_tokens SET active = 1, revoked_at = NULL WHERE token_hash = ?1").bind(replyTokenHash).run()

  receivedMessages.set('received-wrong-sender', { id: 'received-wrong-sender', from: 'attacker@example.test', to: [inboundAddress], subject: 'Re', text: 'Wrong sender' })
  assert.equal((await webhook('evt-wrong-sender', 'received-wrong-sender')).body.reason, 'sender_mismatch')
  receivedMessages.set('received-auto', { id: 'received-auto', from: 'user-a@example.test', to: [inboundAddress], subject: 'Auto reply', text: 'Automated', headers: { 'auto-submitted': 'auto-replied' } })
  assert.equal((await webhook('evt-auto-reply', 'received-auto')).body.reason, 'automated_reply_rejected')
  receivedMessages.set('provider-fail', { id: 'provider-fail', from: 'user-a@example.test', to: [inboundAddress], subject: 'Retry', text: 'Retry success' })
  const failedRetrieve = await webhook('evt-provider-retry', 'provider-fail')
  assert.equal(failedRetrieve.response.status, 503)
  const retriedRetrieve = await webhook('evt-provider-retry', 'provider-fail')
  assert.equal(retriedRetrieve.response.status, 200)
  assert.equal(retriedRetrieve.body.status, 'processed')

  await adminPost('/v1/admin/support/status', { thread_id: created.body.thread_id, status: 'closed', idempotency_key: 'ticket:status:a:closed-email' })
  receivedMessages.set('received-closed-ticket', { id: 'received-closed-ticket', from: 'user-a@example.test', to: [inboundAddress], subject: 'Reopen by email', text: 'Please reopen this ticket.' })
  const reopenedByEmail = await webhook('evt-closed-ticket', 'received-closed-ticket')
  assert.equal(reopenedByEmail.body.status, 'processed')
  assert.equal((await db.prepare('SELECT status FROM support_threads WHERE id = ?1').bind(created.body.thread_id).first()).status, 'reopened')

  await adminPost('/v1/admin/support/block', { thread_id: created.body.thread_id, blocked: true, reason: 'inbound-test' })
  receivedMessages.set('received-blocked', { id: 'received-blocked', from: 'user-a@example.test', to: [inboundAddress], subject: 'Blocked', text: 'Blocked inbound.' })
  assert.equal((await webhook('evt-blocked-inbound', 'received-blocked')).body.reason, 'support_blocked')
  await adminPost('/v1/admin/support/block', { thread_id: created.body.thread_id, blocked: false })

  const sentEventPayload = JSON.stringify({ type: 'email.delivered', data: { email_id: emailJob.provider_message_id, to: ['user-a@example.test'] } })
  const sentEventId = 'evt-delivered'
  const sentTimestamp = String(Math.floor(Date.now() / 1000))
  const sentSignature = createHmac('sha256', webhookKey).update(`${sentEventId}.${sentTimestamp}.${sentEventPayload}`).digest('base64')
  const deliveredResponse = await mf.dispatchFetch('https://api.saturnws.com/api/webhooks/resend', { method: 'POST', headers: { 'svix-id': sentEventId, 'svix-timestamp': sentTimestamp, 'svix-signature': `v1,${sentSignature}` }, body: sentEventPayload })
  assert.equal(deliveredResponse.status, 200)
  assert.equal((await db.prepare('SELECT status FROM email_jobs WHERE provider_message_id = ?1').bind(emailJob.provider_message_id).first()).status, 'delivered')

  await db.prepare("INSERT INTO email_cron_locks (name, owner, locked_until, created_at, updated_at) VALUES ('email-operations', 'other', datetime('now', '+5 minutes'), datetime('now'), datetime('now')) ON CONFLICT(name) DO UPDATE SET owner = 'other', locked_until = datetime('now', '+5 minutes'), updated_at = datetime('now')").run()
  const locked = await adminPost('/v1/admin/email/process', {})
  assert.equal(locked.body.processed.skipped, true)
  await db.prepare("UPDATE email_cron_locks SET owner = NULL, locked_until = datetime('now', '-1 second') WHERE name = 'email-operations'").run()

  const failedTest = await adminPost('/v1/admin/email/test', { recipient: 'send-fail@example.test', email_type: 'admin.email_test', message: 'Failure path' })
  assert.equal(failedTest.response.status, 200)
  const failedJobId = failedTest.body.job_id
  let failedJob = await db.prepare('SELECT status, attempt_count FROM email_jobs WHERE id = ?1').bind(failedJobId).first()
  assert.equal(failedJob.status, 'queued')
  assert.equal(Number(failedJob.attempt_count), 1)
  await db.prepare("UPDATE email_jobs SET attempt_count = max_attempts - 1, next_attempt_at = datetime('now') WHERE id = ?1").bind(failedJobId).run()
  await adminPost('/v1/admin/email/process', {})
  failedJob = await db.prepare('SELECT status FROM email_jobs WHERE id = ?1').bind(failedJobId).first()
  assert.equal(failedJob.status, 'failed')
  const retriedJob = await adminPost('/v1/admin/email/retry', { job_id: failedJobId })
  assert.equal(retriedJob.response.status, 200)
  assert.equal((await db.prepare('SELECT status FROM email_jobs WHERE id = ?1').bind(failedJobId).first()).status, 'queued')

  const bounceTest = await adminPost('/v1/admin/email/test', { recipient: 'bounce@example.test', email_type: 'admin.email_test', message: 'Bounce path' })
  const bounceJob = await db.prepare('SELECT provider_message_id FROM email_jobs WHERE id = ?1').bind(bounceTest.body.job_id).first()
  const bouncePayload = JSON.stringify({ type: 'email.bounced', data: { email_id: bounceJob.provider_message_id, to: ['bounce@example.test'], reason: 'mailbox rejected' } })
  const bounceEventId = 'evt-bounced'
  const bounceTimestamp = String(Math.floor(Date.now() / 1000))
  const bounceSignature = createHmac('sha256', webhookKey).update(`${bounceEventId}.${bounceTimestamp}.${bouncePayload}`).digest('base64')
  const bounceResponse = await mf.dispatchFetch('https://api.saturnws.com/api/webhooks/resend', { method: 'POST', headers: { 'svix-id': bounceEventId, 'svix-timestamp': bounceTimestamp, 'svix-signature': `v1,${bounceSignature}` }, body: bouncePayload })
  assert.equal(bounceResponse.status, 200)
  assert.equal((await db.prepare("SELECT status FROM email_recipient_flags WHERE email = 'bounce@example.test'").first()).status, 'bounced')
  const duplicateBounce = await mf.dispatchFetch('https://api.saturnws.com/api/webhooks/resend', { method: 'POST', headers: { 'svix-id': bounceEventId, 'svix-timestamp': bounceTimestamp, 'svix-signature': `v1,${bounceSignature}` }, body: bouncePayload })
  assert.equal((await duplicateBounce.json()).duplicate, true)
  await adminPost('/v1/admin/email/test', { recipient: 'bounce@example.test', email_type: 'admin.email_test', message: 'Suppressed path' })
  assert.equal((await db.prepare("SELECT status FROM email_jobs WHERE recipient = 'bounce@example.test' ORDER BY created_at DESC, rowid DESC LIMIT 1").first()).status, 'suppressed')

  const audit = await adminGet(`/v1/admin/support/messages?thread_id=${encodeURIComponent(created.body.thread_id)}`)
  assert.equal(audit.response.status, 200)
  assert.ok(audit.body.audit.some((event) => event.event_type === 'support_reply'))
  assert.ok(audit.body.audit.some((event) => event.event_type === 'inbound_email_processed'))

  console.log('Phase D support, notification, webhook, idempotency, ownership, rate-limit, and lock checks passed.')
} finally {
  await mf.dispose()
  await rm(temp, { recursive: true, force: true })
}
