import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temp = await mkdtemp(path.join(tmpdir(), 'saturnws-phase-g-alerts-'))
const bundle = path.join(temp, 'worker.mjs')
const adminToken = 'phase-g-local-admin-token-2026'
let failSend = false
const sentMessages = []

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
    EMAIL_INBOUND_ENABLED: 'false',
    EMAIL_SUPPORT_ENABLED: 'true',
    EMAIL_AUTH_ENABLED: 'false',
    EMAIL_BILLING_ENABLED: 'false',
    EMAIL_RELEASE_ENABLED: 'false',
    EMAIL_SECURITY_ENABLED: 'false',
    EMAIL_ADMIN_ALERTS_ENABLED: 'true',
    EMAIL_SCHEDULER_ENABLED: 'true',
    EMAIL_ADMIN_ALERT_RECIPIENTS: 'admin-alert@example.test',
    EMAIL_FROM_SUPPORT: 'SaturnWS Support <support@mail.saturnws.com>',
    EMAIL_FROM_GENERAL: 'SaturnWS <support@mail.saturnws.com>',
    EMAIL_REPLY_DOMAIN: 'mail.saturnws.com',
    APP_PUBLIC_URL: 'https://saturnws.com',
    RESEND_SEND_API_KEY: 'local-send-key',
    RESEND_RECEIVE_API_KEY: 'local-receive-key',
    RESEND_WEBHOOK_SECRET: `whsec_${Buffer.alloc(32, 7).toString('base64')}`,
    EMAIL_SENSITIVE_PAYLOAD_KEY_B64: Buffer.alloc(32, 11).toString('base64'),
    RESEND_API_BASE: 'https://resend.local',
  },
  serviceBindings: {
    AUTH_SERVICE: async () => Response.json({ success: false, error: 'not_used' }, { status: 401 }),
    RESEND_SERVICE: async (request) => {
      const url = new URL(request.url)
      if (request.method === 'POST' && url.pathname === '/emails') {
        const input = await request.json().catch(() => ({}))
        if (failSend || String(input.to || '').includes('send-fail')) {
          return Response.json({ message: 'provider unavailable' }, { status: 503 })
        }
        sentMessages.push(input)
        return Response.json({ id: `provider-${sentMessages.length}` })
      }
      return Response.json({ message: 'not found' }, { status: 404 })
    },
  },
})

try {
  const db = await mf.getD1Database('DB')
  const migrationDir = path.join(root, 'migrations')
  for (const name of (await readdir(migrationDir)).filter((item) => item.endsWith('.sql')).sort()) {
    const sql = (await readFile(path.join(migrationDir, name), 'utf8'))
      .replace(/^\s*--.*$/gm, '')
      .replace(/\r?\n/g, ' ')
    await db.exec(sql)
  }

  const adminPost = async (pathname, body) => {
    const response = await mf.dispatchFetch(`https://api.saturnws.com${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(body),
    })
    return { response, body: await response.json() }
  }

  const invalidWebhook = async () => mf.dispatchFetch('https://api.saturnws.com/api/webhooks/resend', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'svix-id': 'evt-invalid-signature',
      'svix-timestamp': String(Math.floor(Date.now() / 1000)),
      'svix-signature': 'v1,invalid-signature',
    },
    body: '{}',
  })

  const firstInvalid = await invalidWebhook()
  assert.equal(firstInvalid.status, 401)
  const secondInvalid = await invalidWebhook()
  assert.equal(secondInvalid.status, 401)
  const tamperAlerts = await db.prepare("SELECT * FROM email_jobs WHERE email_type = 'admin.tamper_detected'").all()
  assert.equal(tamperAlerts.results.length, 1, 'repeated webhook tamper signal should dedupe inside the cooldown bucket')
  assert.equal(tamperAlerts.results[0].recipient, 'admin-alert@example.test')
  assert.equal(tamperAlerts.results[0].status, 'queued')
  assert.equal(JSON.stringify(tamperAlerts.results[0]).includes('local-send-key'), false)

  const processedTamper = await adminPost('/v1/admin/email/process', {})
  assert.equal(processedTamper.response.status, 200)
  const tamperSent = await db.prepare("SELECT status, provider_message_id FROM email_jobs WHERE email_type = 'admin.tamper_detected'").first()
  assert.equal(tamperSent.status, 'sent')
  assert.ok(tamperSent.provider_message_id)

  const failingTest = await adminPost('/v1/admin/email/test', {
    recipient: 'send-fail@example.test',
    email_type: 'admin.email_test',
    message: 'Provider failure path',
  })
  assert.equal(failingTest.response.status, 200)
  await db.prepare("UPDATE email_jobs SET attempt_count = max_attempts - 1, next_attempt_at = datetime('now') WHERE id = ?1")
    .bind(failingTest.body.job_id)
    .run()
  failSend = true
  await adminPost('/v1/admin/email/process', {})
  failSend = false
  const failedJob = await db.prepare('SELECT status FROM email_jobs WHERE id = ?1').bind(failingTest.body.job_id).first()
  assert.equal(failedJob.status, 'failed')
  const finalFailureAlerts = await db.prepare("SELECT * FROM email_jobs WHERE email_type = 'admin.email_queue_final_failure'").all()
  assert.equal(finalFailureAlerts.results.length, 1)
  assert.equal(finalFailureAlerts.results[0].status, 'queued')

  await db.prepare("UPDATE email_jobs SET attempt_count = max_attempts - 1, next_attempt_at = datetime('now') WHERE id = ?1")
    .bind(finalFailureAlerts.results[0].id)
    .run()
  failSend = true
  await adminPost('/v1/admin/email/process', {})
  failSend = false
  const recursiveFailureAlerts = await db.prepare("SELECT COUNT(*) AS count FROM email_jobs WHERE email_type = 'admin.email_queue_final_failure'").first()
  assert.equal(Number(recursiveFailureAlerts.count), 1, 'final-failure admin alert must not recursively alert on its own final failure')

  const source = await readFile(path.join(root, 'src', 'index.ts'), 'utf8')
  for (const eventType of [
    'admin.email_queue_final_failure',
    'admin.webhook_repeated_failure',
    'admin.email_cleanup_failure',
    'admin.storage_config_failure',
    'admin.schema_mismatch',
    'admin.readiness_degraded',
    'admin.tamper_detected',
  ]) {
    assert.ok(source.includes(`"${eventType}"`), `missing producer source for ${eventType}`)
  }

  console.log('Phase G admin alert checks passed.')
} finally {
  await mf.dispose()
  await rm(temp, { recursive: true, force: true })
}
