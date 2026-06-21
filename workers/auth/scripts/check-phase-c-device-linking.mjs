import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

const ROOT = process.cwd()
const BUILD_DIR = path.resolve(ROOT, '.phase-c-test-build')
if (!BUILD_DIR.startsWith(`${path.resolve(ROOT)}${path.sep}`)) throw new Error('unsafe_test_build_path')
fs.rmSync(BUILD_DIR, { recursive: true, force: true })
fs.mkdirSync(BUILD_DIR, { recursive: true })
const bundlePath = path.join(BUILD_DIR, 'auth-worker.mjs')

await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/index.ts')],
  outfile: bundlePath,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
})

const now = Date.now()
const future = (days) => new Date(now + days * 86400000).toISOString()
const past = (days) => new Date(now - days * 86400000).toISOString()
const users = new Map([
  ['token-none', { localId: 'uid-none', email: 'none@example.test', emailVerified: true }],
  ['token-active', { localId: 'uid-active', email: 'active@example.test', emailVerified: true }],
  ['token-expired', { localId: 'uid-expired', email: 'expired@example.test', emailVerified: true }],
  ['token-lifetime', { localId: 'uid-lifetime', email: 'lifetime@example.test', emailVerified: true }],
  ['token-grace', { localId: 'uid-grace', email: 'grace@example.test', emailVerified: true }],
  ['token-other', { localId: 'uid-other', email: 'other@example.test', emailVerified: true }],
])

const db = {
  account_profiles: [],
  account_subscriptions: [
    { id: 'sub-active', firebase_user_id: 'uid-active', user_email: 'active@example.test', plan: 'monthly', tier: 'public', status: 'active', hwid: null, starts_at: past(2), expires_at: future(28), feature_payload: {}, metadata: {}, created_at: past(2), updated_at: past(1) },
    { id: 'sub-expired', firebase_user_id: 'uid-expired', user_email: 'expired@example.test', plan: 'monthly', tier: 'public', status: 'expired', hwid: null, starts_at: past(40), expires_at: past(10), feature_payload: {}, metadata: {}, created_at: past(40), updated_at: past(10) },
    { id: 'sub-lifetime', firebase_user_id: 'uid-lifetime', user_email: 'lifetime@example.test', plan: 'yearly', tier: 'public', status: 'active', hwid: null, starts_at: past(2), expires_at: '9999-12-31T23:59:59.000Z', feature_payload: {}, metadata: { is_unlimited: true }, created_at: past(2), updated_at: past(1) },
    { id: 'sub-grace', firebase_user_id: 'uid-grace', user_email: 'grace@example.test', plan: 'monthly', tier: 'public', status: 'past_due', hwid: null, starts_at: past(32), expires_at: future(3), feature_payload: {}, metadata: {}, created_at: past(32), updated_at: past(1) },
  ],
  device_login_sessions: [],
  app_sessions: [],
  account_email_verifications: [],
  account_email_verification_audit: [],
}

let sequence = 0
const nextId = (prefix) => `${prefix}-${++sequence}`
const clone = (value) => JSON.parse(JSON.stringify(value))

function matches(row, params) {
  for (const [key, raw] of params.entries()) {
    if (['select', 'order', 'limit', 'or'].includes(key)) continue
    const [operator, ...rest] = raw.split('.')
    const expected = rest.join('.')
    if (operator === 'eq' && String(row[key] ?? '') !== expected) return false
    if (operator === 'ilike' && String(row[key] ?? '').toLowerCase() !== expected.toLowerCase()) return false
    if (operator === 'is' && expected === 'null' && row[key] != null) return false
  }
  const or = params.get('or')
  if (or) {
    const clauses = or.replace(/^\(|\)$/g, '').split(',')
    if (!clauses.some((clause) => {
      const [field, operator, ...rest] = clause.split('.')
      const expected = rest.join('.')
      if (operator === 'eq') return String(row[field] ?? '') === expected
      if (operator === 'ilike') return String(row[field] ?? '').toLowerCase() === expected.toLowerCase()
      return false
    })) return false
  }
  return true
}

async function mockFetch(input, init = {}) {
  const request = input instanceof Request ? input : new Request(input, init)
  const url = new URL(request.url)
  if (url.hostname === 'identitytoolkit.googleapis.com') {
    const body = await request.json().catch(() => ({}))
    if (url.pathname.endsWith('/accounts:lookup')) {
      const user = users.get(String(body.idToken || ''))
      return user ? Response.json({ users: [user] }) : Response.json({ error: { message: 'INVALID_ID_TOKEN' } }, { status: 401 })
    }
    return Response.json({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }, { status: 401 })
  }
  if (url.hostname !== 'supabase.test') throw new Error(`unexpected_fetch:${url}`)
  const table = url.pathname.split('/').filter(Boolean).at(-1)
  const rows = db[table]
  if (!Array.isArray(rows)) return Response.json({ message: `unknown_table:${table}` }, { status: 404 })
  const method = request.method.toUpperCase()
  if (method === 'GET') return Response.json(clone(rows.filter((row) => matches(row, url.searchParams))))
  if (method === 'POST') {
    const body = await request.json()
    const inserted = { id: body.id || nextId(table), created_at: body.created_at || new Date().toISOString(), last_seen_at: body.last_seen_at ?? null, revoked_at: body.revoked_at ?? null, ...body }
    rows.push(inserted)
    return Response.json([clone(inserted)], { status: 201 })
  }
  if (method === 'PATCH') {
    const patch = await request.json()
    const changed = []
    for (const row of rows) {
      if (!matches(row, url.searchParams)) continue
      Object.assign(row, patch)
      changed.push(clone(row))
    }
    return Response.json(changed)
  }
  return Response.json({ message: 'method_not_supported' }, { status: 405 })
}

globalThis.fetch = mockFetch
const worker = (await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`)).default
const env = {
  SUPABASE_API_URL: 'https://supabase.test/rest/v1',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
  FIREBASE_WEB_API_KEY: 'test-firebase-key',
  DEVICE_LOGIN_URL: 'https://saturnws.com/account/signin',
  APP_ENV: 'test',
  APP_SESSION_TTL_DAYS: '30',
}

async function call(pathname, body, token) {
  const request = new Request(`https://auth.test${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
  })
  const response = await worker.fetch(request, env)
  return { status: response.status, body: await response.json() }
}

async function start(hwid, deviceName = 'QA Device') {
  const result = await call('/device/start', { hwid, app_version: '1.0.7-beta', device_name: deviceName, platform: 'Windows', os_version: 'Windows 11' })
  assert.equal(result.status, 200)
  assert.equal(result.body.success, true)
  return result.body
}

async function link(token, hwid) {
  const pending = await start(hwid)
  const complete = await call('/device/complete', { id_token: token, device_code: pending.device_code })
  assert.equal(complete.status, 200)
  assert.equal(complete.body.connection_state, 'linked')
  const poll = await call('/device/poll', { device_code: pending.device_code, hwid })
  assert.equal(poll.status, 200)
  assert.equal(poll.body.connection_state, 'linked')
  assert.ok(String(poll.body.session_token || '').startsWith('stk_'))
  return { pending, complete: complete.body, session: poll.body }
}

const noSubscription = await link('token-none', 'a'.repeat(32))
assert.equal(noSubscription.complete.entitlement_state, 'no_subscription')
assert.equal(noSubscription.session.entitlement_state, 'no_subscription')
assert.equal(noSubscription.session.subscription, null)

const wrongCode = await call('/device/complete', { id_token: 'token-none', device_code: 'missing-device-code' })
assert.equal(wrongCode.status, 404)
assert.equal(wrongCode.body.error, 'device_code_not_found')

const replayComplete = await call('/device/complete', { id_token: 'token-none', device_code: noSubscription.pending.device_code })
assert.equal(replayComplete.status, 409)
assert.equal(replayComplete.body.error, 'device_code_already_used')
const replayPoll = await call('/device/poll', { device_code: noSubscription.pending.device_code, hwid: 'a'.repeat(32) })
assert.equal(replayPoll.status, 409)

const wrongDevicePending = await start('b'.repeat(32))
await call('/device/complete', { id_token: 'token-active', device_code: wrongDevicePending.device_code })
const wrongDevice = await call('/device/poll', { device_code: wrongDevicePending.device_code, hwid: 'c'.repeat(32) })
assert.equal(wrongDevice.status, 403)
assert.equal(wrongDevice.body.error, 'device_hwid_mismatch')

const expiredPending = await start('d'.repeat(32))
db.device_login_sessions.find((row) => row.device_code === expiredPending.device_code).expires_at = past(1)
const expiredCode = await call('/device/complete', { id_token: 'token-active', device_code: expiredPending.device_code })
assert.equal(expiredCode.status, 410)
assert.equal(expiredCode.body.error, 'device_code_expired')

const active = await link('token-active', 'e'.repeat(32))
assert.equal(active.session.entitlement_state, 'active')
const expired = await link('token-expired', 'f'.repeat(32))
assert.equal(expired.session.entitlement_state, 'expired')
const lifetime = await link('token-lifetime', '1'.repeat(32))
assert.equal(lifetime.session.entitlement_state, 'lifetime')
const grace = await link('token-grace', '3'.repeat(32))
assert.equal(grace.session.entitlement_state, 'grace')
assert.equal(grace.session.subscription.policy.allow, true)

const secondActiveDevice = await link('token-active', '2'.repeat(32))
const activeRows = db.app_sessions.filter((row) => row.user_id === 'uid-active' && !row.revoked_at)
assert.equal(activeRows.length, 2, 'linking another device must not revoke unrelated sessions')

const verify = await call('/session/verify', { session_token: active.session.session_token, hwid: 'e'.repeat(32) })
assert.equal(verify.status, 200)
assert.equal(verify.body.connection_state, 'linked')
const wrongVerify = await call('/session/verify', { session_token: active.session.session_token, hwid: '9'.repeat(32) })
assert.equal(wrongVerify.status, 401)
assert.equal(wrongVerify.body.error, 'session_hwid_mismatch')

const refresh = await call('/session/refresh', { session_token: active.session.session_token, hwid: 'e'.repeat(32) })
assert.equal(refresh.status, 200)
assert.ok(String(refresh.body.session_token || '').startsWith('stk_'))
const oldAfterRefresh = await call('/session/verify', { session_token: active.session.session_token, hwid: 'e'.repeat(32) })
assert.equal(oldAfterRefresh.status, 401)
const refreshedVerify = await call('/session/verify', { session_token: refresh.body.session_token, hwid: 'e'.repeat(32) })
assert.equal(refreshedVerify.status, 200)

const sessions = await call('/account/sessions', {}, 'token-active')
assert.equal(sessions.status, 200)
assert.equal(sessions.body.devices.length, 2)
assert.ok(sessions.body.sessions.every((item) => !('session_token' in item) && !('hwid' in item)))
const unauthorizedSessions = await call('/account/sessions', {}, 'invalid-token')
assert.equal(unauthorizedSessions.status, 401)
assert.equal(unauthorizedSessions.body.error, 'AUTH_SESSION_EXPIRED')

const ownedSession = sessions.body.sessions.find((item) => item.status === 'active')
const unauthorizedRevoke = await call('/account/sessions/revoke', { session_id: ownedSession.id, scope: 'session' }, 'token-other')
assert.equal(unauthorizedRevoke.status, 404)
const revoke = await call('/account/sessions/revoke', { session_id: ownedSession.id, scope: 'session' }, 'token-active')
assert.equal(revoke.status, 200)

const revokeAll = await call('/account/sessions/revoke-all', {}, 'token-active')
assert.equal(revokeAll.status, 200)
assert.equal(db.app_sessions.filter((row) => row.user_id === 'uid-active' && !row.revoked_at).length, 0)

const source = fs.readFileSync(path.join(ROOT, 'src/index.ts'), 'utf8')
for (const forbidden of ['console.log(sessionToken)', 'console.error(sessionToken)', 'session_token: sessionToken, error']) {
  assert.equal(source.includes(forbidden), false, `secret logging guard: ${forbidden}`)
}

fs.rmSync(BUILD_DIR, { recursive: true, force: true })
console.log('Phase C Auth Worker behavior checks passed.')
