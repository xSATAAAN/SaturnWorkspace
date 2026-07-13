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
const jwtToken = (payload) => `test.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`
const authTime = Math.floor(now / 1000)
const finalizedClaims = { saturn_account_state: 'finalized', saturn_account_version: 1 }
const finalizedCustomAttributes = JSON.stringify(finalizedClaims)
const finalizedToken = (uid, email, extra = {}) => jwtToken({ sub: uid, email, auth_time: authTime, ...finalizedClaims, ...extra })
const rawToken = (uid, email, extra = {}) => jwtToken({ sub: uid, email, auth_time: authTime, ...extra })
const tokenNone = finalizedToken('uid-none', 'none@example.test')
const tokenActive = finalizedToken('uid-active', 'active@example.test')
const tokenExpired = finalizedToken('uid-expired', 'expired@example.test')
const tokenLifetime = finalizedToken('uid-lifetime', 'lifetime@example.test')
const tokenGrace = finalizedToken('uid-grace', 'grace@example.test')
const tokenOther = finalizedToken('uid-other', 'other@example.test')
const tokenPendingEmail = rawToken('uid-pending-email', 'pending@example.test')
const tokenPendingEmailFinalized = finalizedToken('uid-pending-email', 'pending@example.test')
const tokenLegacyRegistration = rawToken('uid-legacy-registration', 'legacy-registration@example.test')
const tokenLegacyRegistrationFinalized = finalizedToken('uid-legacy-registration', 'legacy-registration@example.test')
const tokenGoogleCollision = rawToken('uid-google-collision', 'google-collision@example.test')
const tokenRegistrationFinalized = finalizedToken('uid-registration-finalized', 'new-registration@example.test')
const tokenRegistrationRaw = rawToken('uid-registration-finalized', 'new-registration@example.test')
const tokenDirectBypass = rawToken('uid-direct-bypass', 'direct-bypass@example.test')
const tokenDirectBypassFinalized = finalizedToken('uid-direct-bypass', 'direct-bypass@example.test')
const tokenUnfinalizedProfile = rawToken('uid-unfinalized-profile', 'unfinalized-profile@example.test')
const users = new Map([
  [tokenNone, { localId: 'uid-none', email: 'none@example.test', emailVerified: true, customAttributes: finalizedCustomAttributes }],
  [tokenActive, { localId: 'uid-active', email: 'active@example.test', emailVerified: true, customAttributes: finalizedCustomAttributes }],
  [tokenExpired, { localId: 'uid-expired', email: 'expired@example.test', emailVerified: true, customAttributes: finalizedCustomAttributes }],
  [tokenLifetime, { localId: 'uid-lifetime', email: 'lifetime@example.test', emailVerified: true, customAttributes: finalizedCustomAttributes }],
  [tokenGrace, { localId: 'uid-grace', email: 'grace@example.test', emailVerified: true, customAttributes: finalizedCustomAttributes }],
  [tokenOther, { localId: 'uid-other', email: 'other@example.test', emailVerified: true, customAttributes: finalizedCustomAttributes }],
  [tokenPendingEmail, { localId: 'uid-pending-email', email: 'pending@example.test', emailVerified: false, displayName: 'Pending Provider Name', providerUserInfo: [{ providerId: 'password' }] }],
  [tokenLegacyRegistration, { localId: 'uid-legacy-registration', email: 'legacy-registration@example.test', emailVerified: false, displayName: 'Legacy Before OTP', providerUserInfo: [{ providerId: 'password' }] }],
  [tokenGoogleCollision, { localId: 'uid-google-collision', email: 'google-collision@example.test', emailVerified: true, displayName: 'Google Collision', providerUserInfo: [{ providerId: 'google.com' }] }],
  [tokenUnfinalizedProfile, { localId: 'uid-unfinalized-profile', email: 'unfinalized-profile@example.test', emailVerified: true, displayName: 'Unfinalized Profile', providerUserInfo: [{ providerId: 'password' }] }],
])
const securityEmailToken = 'phase-c-security-email-token'
const securityEmailRequests = []

const recentDeletionToken = finalizedToken('uid-delete', 'delete@example.test', { auth_time: Math.floor(Date.now() / 1000) })
const staleDeletionToken = finalizedToken('uid-stale-delete', 'stale-delete@example.test', { auth_time: Math.floor(Date.now() / 1000) - 3600 })
users.set(recentDeletionToken, { localId: 'uid-delete', email: 'delete@example.test', emailVerified: true, customAttributes: finalizedCustomAttributes })
users.set(staleDeletionToken, { localId: 'uid-stale-delete', email: 'stale-delete@example.test', emailVerified: true, customAttributes: finalizedCustomAttributes })

const db = {
  account_profiles: [
    { id: 'profile-none', firebase_uid: 'uid-none', normalized_email: 'none@example.test', display_name: 'No Subscription', email_verified: true, email_verified_at: past(10), verification_source: 'saturnws_otp', auth_providers: ['password'], locale: 'en', account_status: 'active', terms_version: '2026-06', terms_accepted_at: past(10), metadata: {}, created_at: past(10), updated_at: past(10) },
    { id: 'profile-active', firebase_uid: 'uid-active', normalized_email: 'active@example.test', display_name: 'Active User', email_verified: true, email_verified_at: past(10), verification_source: 'saturnws_otp', auth_providers: ['password'], locale: 'en', account_status: 'active', terms_version: '2026-06', terms_accepted_at: past(10), metadata: {}, created_at: past(10), updated_at: past(10) },
    { id: 'profile-expired', firebase_uid: 'uid-expired', normalized_email: 'expired@example.test', display_name: 'Expired User', email_verified: true, email_verified_at: past(10), verification_source: 'saturnws_otp', auth_providers: ['password'], locale: 'en', account_status: 'active', terms_version: '2026-06', terms_accepted_at: past(10), metadata: {}, created_at: past(10), updated_at: past(10) },
    { id: 'profile-lifetime', firebase_uid: 'uid-lifetime', normalized_email: 'lifetime@example.test', display_name: 'Lifetime User', email_verified: true, email_verified_at: past(10), verification_source: 'saturnws_otp', auth_providers: ['password'], locale: 'en', account_status: 'active', terms_version: '2026-06', terms_accepted_at: past(10), metadata: {}, created_at: past(10), updated_at: past(10) },
    { id: 'profile-grace', firebase_uid: 'uid-grace', normalized_email: 'grace@example.test', display_name: 'Grace User', email_verified: true, email_verified_at: past(10), verification_source: 'saturnws_otp', auth_providers: ['password'], locale: 'en', account_status: 'active', terms_version: '2026-06', terms_accepted_at: past(10), metadata: {}, created_at: past(10), updated_at: past(10) },
    { id: 'profile-other', firebase_uid: 'uid-other', normalized_email: 'other@example.test', display_name: 'Other User', email_verified: true, email_verified_at: past(10), verification_source: 'saturnws_otp', auth_providers: ['password'], locale: 'en', account_status: 'active', terms_version: '2026-06', terms_accepted_at: past(10), metadata: {}, created_at: past(10), updated_at: past(10) },
    { id: 'profile-delete', firebase_uid: 'uid-delete', normalized_email: 'delete@example.test', display_name: 'Delete User', email_verified: true, email_verified_at: past(10), verification_source: 'saturnws_otp', auth_providers: ['password'], locale: 'en', account_status: 'active', terms_version: '2026-06', terms_accepted_at: past(10), metadata: {}, created_at: past(10), updated_at: past(10) },
    { id: 'profile-stale-delete', firebase_uid: 'uid-stale-delete', normalized_email: 'stale-delete@example.test', display_name: 'Stale Delete User', email_verified: true, email_verified_at: past(10), verification_source: 'saturnws_otp', auth_providers: ['password'], locale: 'en', account_status: 'active', terms_version: '2026-06', terms_accepted_at: past(10), metadata: {}, created_at: past(10), updated_at: past(10) },
    { id: 'profile-unfinalized', firebase_uid: 'uid-unfinalized-profile', normalized_email: 'unfinalized-profile@example.test', display_name: 'Unfinalized Profile', email_verified: true, email_verified_at: past(10), verification_source: null, auth_providers: ['password'], locale: 'en', account_status: 'active', terms_version: '2026-06', terms_accepted_at: past(10), metadata: {}, created_at: past(10), updated_at: past(10) },
  ],
  account_subscriptions: [
    { id: 'sub-active', firebase_user_id: 'uid-active', user_email: 'active@example.test', plan: 'monthly', tier: 'public', status: 'active', hwid: null, starts_at: past(2), expires_at: future(28), feature_payload: {}, metadata: {}, created_at: past(2), updated_at: past(1) },
    { id: 'sub-expired', firebase_user_id: 'uid-expired', user_email: 'expired@example.test', plan: 'monthly', tier: 'public', status: 'expired', hwid: null, starts_at: past(40), expires_at: past(10), feature_payload: {}, metadata: {}, created_at: past(40), updated_at: past(10) },
    { id: 'sub-lifetime', firebase_user_id: 'uid-lifetime', user_email: 'lifetime@example.test', plan: 'yearly', tier: 'public', status: 'active', hwid: null, starts_at: past(2), expires_at: '9999-12-31T23:59:59.000Z', feature_payload: {}, metadata: { is_unlimited: true }, created_at: past(2), updated_at: past(1) },
    { id: 'sub-grace', firebase_user_id: 'uid-grace', user_email: 'grace@example.test', plan: 'monthly', tier: 'public', status: 'past_due', hwid: null, starts_at: past(32), expires_at: future(3), grace_ends_at: future(3), feature_payload: {}, metadata: {}, created_at: past(32), updated_at: past(1) },
  ],
  device_login_sessions: [],
  app_sessions: [],
  account_device_bindings: [],
  account_device_change_requests: [],
  account_device_events: [],
  account_email_verifications: [],
  account_email_verification_audit: [],
  account_deletion_requests: [],
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
    if (operator === 'in') {
      const allowed = expected.replace(/^\(|\)$/g, '').split(',').map((item) => item.trim())
      if (!allowed.includes(String(row[key] ?? ''))) return false
    }
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
      if (Array.isArray(body.email)) {
        const wanted = body.email.map((email) => String(email || '').trim().toLowerCase())
        const matched = [...users.values()].filter((user) => wanted.includes(String(user.email || '').trim().toLowerCase()))
        return Response.json({ users: matched })
      }
      const user = users.get(String(body.idToken || ''))
      return user ? Response.json({ users: [user] }) : Response.json({ error: { message: 'INVALID_ID_TOKEN' } }, { status: 401 })
    }
    if (url.pathname.endsWith('/accounts:update') && request.method.toUpperCase() === 'POST') {
      const entry = [...users.entries()].find(([, user]) => String(user.localId || '') === String(body.localId || ''))
      if (!entry) return Response.json({ error: { message: 'EMAIL_NOT_FOUND' } }, { status: 404 })
      const [token, user] = entry
      const updated = {
        ...user,
        email: String(body.email || user.email || '').trim().toLowerCase(),
        displayName: body.displayName || user.displayName || null,
        emailVerified: Boolean(body.emailVerified || user.emailVerified),
        disabled: body.disableUser === undefined ? Boolean(user.disabled) : Boolean(body.disableUser),
        customAttributes: body.customAttributes === undefined ? user.customAttributes : String(body.customAttributes || ''),
        validSince: body.validSince === undefined ? user.validSince : String(body.validSince || ''),
        providerUserInfo: Array.isArray(user.providerUserInfo) && user.providerUserInfo.length ? user.providerUserInfo : [{ providerId: 'password' }],
      }
      users.set(token, updated)
      return Response.json({ localId: updated.localId, email: updated.email, displayName: updated.displayName, emailVerified: updated.emailVerified, disabled: updated.disabled, customAttributes: updated.customAttributes, providerUserInfo: updated.providerUserInfo })
    }
    if (url.pathname.endsWith('/accounts') && request.method.toUpperCase() === 'POST') {
      const email = String(body.email || '').trim().toLowerCase()
      if ([...users.values()].some((user) => String(user.email || '').toLowerCase() === email)) {
        return Response.json({ error: { message: 'EMAIL_EXISTS' } }, { status: 409 })
      }
      const localId = 'uid-registration-finalized'
      const user = {
        localId,
        email,
        emailVerified: true,
        displayName: body.displayName || null,
        providerUserInfo: [{ providerId: 'password' }],
      }
      users.set(tokenRegistrationFinalized, { ...user, customAttributes: String(body.customAttributes || ''), disabled: Boolean(body.disableUser) })
      return Response.json({ localId, email, displayName: user.displayName })
    }
    return Response.json({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }, { status: 401 })
  }
  if (url.hostname === 'policy-email.test') {
    assert.equal(request.headers.get('authorization'), `Bearer ${securityEmailToken}`)
    const body = await request.json().catch(() => ({}))
    securityEmailRequests.push(body)
    return Response.json({ success: true, status: 'queued', job_id: `job-${securityEmailRequests.length}` })
  }
  if (url.hostname !== 'supabase.test') throw new Error(`unexpected_fetch:${url}`)
  const table = url.pathname.split('/').filter(Boolean).at(-1)
  if (table === 'authorize_account_device' && request.method.toUpperCase() === 'POST') {
    const body = await request.json()
    const activeBinding = db.account_device_bindings.find((row) => row.firebase_uid === body.p_firebase_uid && row.status === 'active')
    if (!activeBinding) {
      const timestamp = new Date().toISOString()
      const inserted = {
        id: nextId('device-binding'),
        firebase_uid: body.p_firebase_uid,
        hwid_hash: body.p_hwid_hash,
        device_key: body.p_hwid_hash.slice(0, 16),
        device_name: body.p_device_name,
        platform: body.p_platform,
        os_version: body.p_os_version,
        app_version: body.p_app_version,
        status: 'active',
        bound_at: timestamp,
        last_seen_at: timestamp,
        released_at: null,
        created_at: timestamp,
        updated_at: timestamp,
      }
      db.account_device_bindings.push(inserted)
      return Response.json([{
        decision: 'authorized',
        binding_id: inserted.id,
        device_key: inserted.device_key,
        current_device_name: inserted.device_name,
        current_bound_at: inserted.bound_at,
        pending_request_id: null,
        pending_request_status: null,
      }])
    }
    if (activeBinding.hwid_hash === body.p_hwid_hash) {
      activeBinding.last_seen_at = new Date().toISOString()
      activeBinding.updated_at = activeBinding.last_seen_at
      return Response.json([{
        decision: 'authorized',
        binding_id: activeBinding.id,
        device_key: activeBinding.device_key,
        current_device_name: activeBinding.device_name,
        current_bound_at: activeBinding.bound_at,
        pending_request_id: null,
        pending_request_status: null,
      }])
    }
    const pendingRequest = db.account_device_change_requests.find((row) => row.firebase_uid === body.p_firebase_uid && row.status === 'pending')
    return Response.json([{
      decision: 'device_change_required',
      binding_id: activeBinding.id,
      device_key: activeBinding.device_key,
      current_device_name: activeBinding.device_name,
      current_bound_at: activeBinding.bound_at,
      pending_request_id: pendingRequest?.id || null,
      pending_request_status: pendingRequest?.status || null,
    }])
  }
  if (table === 'request_account_device_change' && request.method.toUpperCase() === 'POST') {
    const body = await request.json()
    const activeBinding = db.account_device_bindings.find((row) => row.firebase_uid === body.p_firebase_uid && row.status === 'active')
    if (!activeBinding || activeBinding.hwid_hash === body.p_hwid_hash) {
      return Response.json({ message: 'device_change_not_required' }, { status: 409 })
    }
    const timestamp = new Date().toISOString()
    let pendingRequest = db.account_device_change_requests.find((row) => row.firebase_uid === body.p_firebase_uid && row.status === 'pending')
    if (!pendingRequest) {
      pendingRequest = {
        id: nextId('device-change'),
        firebase_uid: body.p_firebase_uid,
        current_binding_id: activeBinding.id,
        resulting_binding_id: null,
        requested_hwid_hash: body.p_hwid_hash,
        requested_device_key: body.p_hwid_hash.slice(0, 16),
        status: 'pending',
        requested_at: timestamp,
        resolved_at: null,
        resolved_by: null,
        resolution_note: null,
        created_at: timestamp,
        updated_at: timestamp,
      }
      db.account_device_change_requests.push(pendingRequest)
    }
    Object.assign(pendingRequest, {
      requested_hwid_hash: body.p_hwid_hash,
      requested_device_key: body.p_hwid_hash.slice(0, 16),
      device_name: body.p_device_name,
      platform: body.p_platform,
      os_version: body.p_os_version,
      app_version: body.p_app_version,
      user_reason: body.p_user_reason,
      updated_at: timestamp,
    })
    return Response.json([clone(pendingRequest)])
  }
  const rows = db[table]
  if (!Array.isArray(rows)) return Response.json({ message: `unknown_table:${table}` }, { status: 404 })
  const method = request.method.toUpperCase()
  if (method === 'GET') {
    const filtered = rows.filter((row) => matches(row, url.searchParams))
    const safeDeviceTables = new Set(['account_device_bindings', 'account_device_change_requests', 'account_device_events'])
    const selectedFields = String(url.searchParams.get('select') || '').split(',').map((field) => field.trim()).filter(Boolean)
    if (safeDeviceTables.has(table) && selectedFields.length) {
      return Response.json(clone(filtered.map((row) => Object.fromEntries(selectedFields.map((field) => [field, row[field]])))))
    }
    return Response.json(clone(filtered))
  }
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
const allowAllRateLimit = { async limit() { return { success: true } } }
const env = {
  AUTH_RATE_LIMIT_STANDARD: allowAllRateLimit,
  AUTH_RATE_LIMIT_SENSITIVE: allowAllRateLimit,
  AUTH_RATE_LIMIT_DEVICE: allowAllRateLimit,
  SUPABASE_API_URL: 'https://supabase.test/rest/v1',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
  FIREBASE_WEB_API_KEY: 'test-firebase-key',
  FIREBASE_PROJECT_ID: 'saturnws-test',
  FIREBASE_SERVICE_ACCOUNT_JSON: 'test-service-account',
  DEVICE_LOGIN_URL: 'https://saturnws.com/account/signin',
  APP_ENV: 'test',
  APP_SESSION_TTL_DAYS: '30',
  EMAIL_SECURITY_ENABLED: 'true',
  EMAIL_VERIFICATION_TEST_TRANSPORT: 'response',
  AUTH_EMAIL_ENQUEUE_URL: 'https://policy-email.test/v1/internal/email/auth/enqueue',
  AUTH_EMAIL_ENQUEUE_TOKEN: securityEmailToken,
  AUTH_ORPHAN_PASSWORD_RETENTION_HOURS: '1',
  AUTH_ORPHAN_PASSWORD_ALERT_THRESHOLD: '1',
  AUTH_ORPHAN_ADMIN_ALERT_RECIPIENT: 'admin-alerts@example.test',
}

let requestCounter = 0

async function call(pathname, body, token, requestEnv = env) {
  requestCounter += 1
  const request = new Request(`https://auth.test${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `198.51.100.${(requestCounter % 250) + 1}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
  })
  const response = await worker.fetch(request, requestEnv)
  return { status: response.status, body: await response.json() }
}

async function callGet(pathname, token, hwid, requestEnv = env) {
  requestCounter += 1
  const request = new Request(`https://auth.test${pathname}`, {
    method: 'GET',
    headers: {
      'CF-Connecting-IP': `198.51.100.${(requestCounter % 250) + 1}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(hwid ? { 'X-SATURN-HWID': hwid } : {}),
    },
  })
  const response = await worker.fetch(request, requestEnv)
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

const noSubscription = await link(tokenNone, 'a'.repeat(32))
assert.equal(noSubscription.complete.entitlement_state, 'no_subscription')
assert.equal(noSubscription.session.entitlement_state, 'no_subscription')
assert.equal(noSubscription.session.subscription, null)

const gmailCapabilityUnauthorized = await callGet('/oauth/google-gmail-status')
assert.equal(gmailCapabilityUnauthorized.status, 401)
assert.equal(gmailCapabilityUnauthorized.body.error, 'unauthorized')
const gmailCapabilityDisabled = await callGet(
  '/oauth/google-gmail-status',
  noSubscription.session.session_token,
  'a'.repeat(32),
)
assert.equal(gmailCapabilityDisabled.status, 200)
assert.equal(gmailCapabilityDisabled.body.enabled, false)
assert.equal(gmailCapabilityDisabled.body.scope, 'gmail.readonly')
assert.equal(gmailCapabilityDisabled.body.reason, 'google_verification_required')
const gmailCapabilityEnabled = await callGet(
  '/oauth/google-gmail-status',
  noSubscription.session.session_token,
  'a'.repeat(32),
  { ...env, GMAIL_READONLY_OAUTH_ENABLED: 'true' },
)
assert.equal(gmailCapabilityEnabled.status, 200)
assert.equal(gmailCapabilityEnabled.body.enabled, true)
assert.equal(gmailCapabilityEnabled.body.reason, '')

const registrationStart = await call('/email-verification/start', {
  email: 'new-registration@example.test',
  display_name: 'New Registration',
  locale: 'en',
  terms_accepted: true,
  terms_version: '2026-06',
})
assert.equal(registrationStart.status, 200)
assert.equal(registrationStart.body.status, 'sent')
assert.ok(registrationStart.body.registration_id)
assert.equal(String(registrationStart.body.test_code || '').length, 6)
assert.equal([...users.values()].some((user) => user.email === 'new-registration@example.test'), false, 'pending registration must not create a Firebase password identity before OTP')
assert.equal(db.account_profiles.some((row) => row.normalized_email === 'new-registration@example.test'), false, 'pending registration must not create a canonical profile before OTP')
const pendingRegistrationRow = db.account_email_verifications.find((row) => row.id === registrationStart.body.registration_id)
assert.equal(pendingRegistrationRow?.firebase_user_id, null)
assert.equal(pendingRegistrationRow?.purpose, 'registration')

const unavailableBeforeFinalize = await call('/account/subscription', {}, tokenRegistrationFinalized)
assert.notEqual(unavailableBeforeFinalize.status, 200, 'protected account API must not accept a registration token before server finalization creates Firebase identity')

const wrongRegistrationOtp = await call('/email-verification/verify', {
  registration_id: registrationStart.body.registration_id,
  email: 'new-registration@example.test',
  code: '000000',
})
assert.equal(wrongRegistrationOtp.status, 400)
assert.equal(wrongRegistrationOtp.body.error, 'VERIFICATION_CODE_INVALID')
assert.equal([...users.values()].some((user) => user.email === 'new-registration@example.test'), false, 'wrong OTP must not create a Firebase identity')

pendingRegistrationRow.last_sent_at = past(1)
const registrationResend = await call('/email-verification/start', {
  email: 'new-registration@example.test',
  display_name: 'New Registration',
  locale: 'en',
  terms_accepted: true,
  terms_version: '2026-06',
})
assert.equal(registrationResend.status, 200)
assert.equal(registrationResend.body.registration_id, registrationStart.body.registration_id)
assert.notEqual(registrationResend.body.test_code, registrationStart.body.test_code)
const oldRegistrationOtp = await call('/email-verification/verify', {
  registration_id: registrationStart.body.registration_id,
  email: 'new-registration@example.test',
  code: registrationStart.body.test_code,
})
assert.equal(oldRegistrationOtp.status, 400, 'resend must invalidate the previous registration OTP')

const registrationVerified = await call('/email-verification/verify', {
  registration_id: registrationResend.body.registration_id,
  email: 'new-registration@example.test',
  code: registrationResend.body.test_code,
})
assert.equal(registrationVerified.status, 200)
assert.equal(registrationVerified.body.status, 'verified')
assert.ok(registrationVerified.body.finalization_token)
assert.equal([...users.values()].some((user) => user.email === 'new-registration@example.test'), false, 'OTP verification alone must not create Firebase identity')
assert.equal(db.account_profiles.some((row) => row.normalized_email === 'new-registration@example.test'), false, 'OTP verification alone must not create canonical profile')

const weakRegistrationFinalize = await call('/email-verification/finalize', {
  registration_id: registrationVerified.body.registration_id,
  email: 'new-registration@example.test',
  finalization_token: registrationVerified.body.finalization_token,
  password: '123',
})
assert.equal(weakRegistrationFinalize.status, 400)
assert.equal(weakRegistrationFinalize.body.error, 'AUTH_WEAK_PASSWORD')
assert.equal([...users.values()].some((user) => user.email === 'new-registration@example.test'), false, 'weak password finalization must not create Firebase identity')

const mismatchedProjectFinalize = await call('/email-verification/finalize', {
  registration_id: registrationVerified.body.registration_id,
  email: 'new-registration@example.test',
  finalization_token: registrationVerified.body.finalization_token,
  password: 'strong-password-123',
}, undefined, {
  ...env,
  FIREBASE_PROJECT_ID: 'different-project',
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: 'saturn-auth-finalizer@example.test',
    private_key: 'dummy-private-key',
    project_id: 'saturnws-test',
  }),
})
assert.equal(mismatchedProjectFinalize.status, 503)
assert.equal(mismatchedProjectFinalize.body.error, 'AUTH_PROVIDER_SERVER_CREATE_NOT_CONFIGURED')
assert.equal([...users.values()].some((user) => user.email === 'new-registration@example.test'), false, 'project mismatch must fail before Firebase identity creation')
assert.equal(db.account_profiles.some((row) => row.normalized_email === 'new-registration@example.test'), false, 'project mismatch must fail before canonical profile creation')

const registrationFinalized = await call('/email-verification/finalize', {
  registration_id: registrationVerified.body.registration_id,
  email: 'new-registration@example.test',
  finalization_token: registrationVerified.body.finalization_token,
  password: 'strong-password-123',
})
assert.equal(registrationFinalized.status, 200)
assert.equal(registrationFinalized.body.status, 'finalized')
assert.ok(users.get(tokenRegistrationFinalized), 'Firebase identity must be created after OTP finalization')
const finalizedProfile = db.account_profiles.find((row) => row.firebase_uid === 'uid-registration-finalized')
assert.equal(finalizedProfile?.normalized_email, 'new-registration@example.test')
assert.equal(finalizedProfile?.display_name, 'New Registration')
assert.equal(finalizedProfile?.verification_source, 'saturnws_otp')
assert.equal(finalizedProfile?.email_verified, true)
assert.equal(db.account_profiles.filter((row) => row.firebase_uid === 'uid-registration-finalized').length, 1)
assert.equal(db.account_email_verifications.find((row) => row.id === registrationVerified.body.registration_id)?.status, 'consumed')

const registrationFinalizeReplay = await call('/email-verification/finalize', {
  registration_id: registrationVerified.body.registration_id,
  email: 'new-registration@example.test',
  finalization_token: registrationVerified.body.finalization_token,
  password: 'strong-password-123',
})
assert.equal(registrationFinalizeReplay.status, 200)
assert.equal(registrationFinalizeReplay.body.idempotent, true)
assert.equal(db.account_profiles.filter((row) => row.firebase_uid === 'uid-registration-finalized').length, 1, 'registration finalization replay must not duplicate profile')

const registrationFinalizeWrongReplay = await call('/email-verification/finalize', {
  registration_id: registrationVerified.body.registration_id,
  email: 'new-registration@example.test',
  finalization_token: 'wrong-finalization-token',
  password: 'strong-password-123',
})
assert.equal(registrationFinalizeWrongReplay.status, 400)
assert.equal(registrationFinalizeWrongReplay.body.error, 'VERIFICATION_CODE_INVALID')
assert.equal(db.account_profiles.filter((row) => row.firebase_uid === 'uid-registration-finalized').length, 1, 'invalid finalization replay must not duplicate profile')

const finalizedSubscription = await call('/account/subscription', { id_token: tokenRegistrationFinalized }, tokenRegistrationFinalized)
assert.equal(finalizedSubscription.status, 200)
assert.equal(finalizedSubscription.body.user.profile.display_name, 'New Registration')
const finalizedLinked = await link(tokenRegistrationFinalized, '6'.repeat(32))
assert.equal(finalizedLinked.session.entitlement_state, 'no_subscription')

const legacyRegistrationStart = await call('/email-verification/start', {
  email: 'legacy-registration@example.test',
  display_name: 'Legacy Reconciled',
  locale: 'en',
  terms_accepted: true,
  terms_version: '2026-06',
})
assert.equal(legacyRegistrationStart.status, 200)
assert.equal(db.account_profiles.some((row) => row.firebase_uid === 'uid-legacy-registration'), false, 'legacy provider identity must not have a profile before OTP')
const legacyRegistrationVerified = await call('/email-verification/verify', {
  registration_id: legacyRegistrationStart.body.registration_id,
  email: 'legacy-registration@example.test',
  code: legacyRegistrationStart.body.test_code,
})
assert.equal(legacyRegistrationVerified.status, 200)
const legacyRegistrationFinalized = await call('/email-verification/finalize', {
  registration_id: legacyRegistrationVerified.body.registration_id,
  email: 'legacy-registration@example.test',
  finalization_token: legacyRegistrationVerified.body.finalization_token,
  password: 'legacy-new-password-123',
})
assert.equal(legacyRegistrationFinalized.status, 200)
assert.equal(legacyRegistrationFinalized.body.status, 'finalized')
assert.equal(users.get(tokenLegacyRegistration)?.emailVerified, true, 'legacy provider identity must be verified only after OTP finalization')
users.set(tokenLegacyRegistrationFinalized, users.get(tokenLegacyRegistration))
const legacyProfile = db.account_profiles.find((row) => row.firebase_uid === 'uid-legacy-registration')
assert.equal(legacyProfile?.normalized_email, 'legacy-registration@example.test')
assert.equal(legacyProfile?.display_name, 'Legacy Reconciled')
assert.equal(legacyProfile?.verification_source, 'saturnws_otp')
assert.equal(db.account_profiles.filter((row) => row.normalized_email === 'legacy-registration@example.test').length, 1, 'legacy provider reconciliation must not duplicate profiles')
const legacyLinked = await link(tokenLegacyRegistrationFinalized, '7'.repeat(32))
assert.equal(legacyLinked.session.entitlement_state, 'no_subscription')

const googleCollisionStart = await call('/email-verification/start', {
  email: 'google-collision@example.test',
  display_name: 'Collision Attempt',
  locale: 'en',
  terms_accepted: true,
  terms_version: '2026-06',
})
assert.equal(googleCollisionStart.status, 200)
const googleCollisionVerified = await call('/email-verification/verify', {
  registration_id: googleCollisionStart.body.registration_id,
  email: 'google-collision@example.test',
  code: googleCollisionStart.body.test_code,
})
assert.equal(googleCollisionVerified.status, 200)
const googleCollisionFinalized = await call('/email-verification/finalize', {
  registration_id: googleCollisionVerified.body.registration_id,
  email: 'google-collision@example.test',
  finalization_token: googleCollisionVerified.body.finalization_token,
  password: 'collision-password-123',
})
assert.equal(googleCollisionFinalized.status, 409)
assert.equal(googleCollisionFinalized.body.error, 'AUTH_EMAIL_ALREADY_USED')
assert.equal(db.account_profiles.some((row) => row.firebase_uid === 'uid-google-collision'), false, 'Google-only provider collision must not auto-link password or create a profile')

users.set(tokenDirectBypass, { localId: 'uid-direct-bypass', email: 'direct-bypass@example.test', emailVerified: true, createdAt: String(now - 2 * 60 * 60 * 1000), providerUserInfo: [{ providerId: 'password' }] })
const directBypassSubscription = await call('/account/subscription', { id_token: tokenDirectBypass }, tokenDirectBypass)
assert.equal(directBypassSubscription.status, 403, 'raw direct Firebase identity must not access protected subscription')
assert.equal(directBypassSubscription.body.error, 'EMAIL_VERIFICATION_REQUIRED')
assert.equal(db.account_profiles.some((row) => row.firebase_uid === 'uid-direct-bypass'), false, 'raw direct Firebase identity must not auto-create a Saturn profile')
assert.equal(users.get(tokenDirectBypass)?.disabled, true, 'stale raw direct Firebase identity must be quarantined')
const directBypassDevice = await start('9'.repeat(32))
const directBypassComplete = await call('/device/complete', { id_token: tokenDirectBypass, device_code: directBypassDevice.device_code })
assert.equal(directBypassComplete.status, 403)
assert.equal(db.app_sessions.some((row) => row.user_id === 'uid-direct-bypass'), false, 'raw direct Firebase identity must not receive a desktop session')
const directBypassStart = await call('/email-verification/start', {
  email: 'direct-bypass@example.test',
  display_name: 'Direct Bypass Reconciled',
  locale: 'en',
  terms_accepted: true,
  terms_version: '2026-06',
})
assert.equal(directBypassStart.status, 200)
const directBypassVerified = await call('/email-verification/verify', {
  registration_id: directBypassStart.body.registration_id,
  email: 'direct-bypass@example.test',
  code: directBypassStart.body.test_code,
})
assert.equal(directBypassVerified.status, 200)
const directBypassFinalized = await call('/email-verification/finalize', {
  registration_id: directBypassVerified.body.registration_id,
  email: 'direct-bypass@example.test',
  finalization_token: directBypassVerified.body.finalization_token,
  password: 'direct-bypass-password-123',
})
assert.equal(directBypassFinalized.status, 200)
assert.equal(directBypassFinalized.body.status, 'finalized')
assert.equal(users.get(tokenDirectBypass)?.disabled, false, 'OTP reconciliation must re-enable the quarantined Firebase identity')
const oldBypassTokenAfterFinalize = await call('/account/subscription', { id_token: tokenDirectBypass }, tokenDirectBypass)
assert.equal(oldBypassTokenAfterFinalize.status, 409, 'old pre-finalization token must remain rejected after reconciliation')
assert.equal(oldBypassTokenAfterFinalize.body.error, 'ACCOUNT_TOKEN_REFRESH_REQUIRED')
users.set(tokenDirectBypassFinalized, users.get(tokenDirectBypass))
const freshBypassTokenAfterFinalize = await call('/account/subscription', { id_token: tokenDirectBypassFinalized }, tokenDirectBypassFinalized)
assert.equal(freshBypassTokenAfterFinalize.status, 200)
const directBypassProfiles = db.account_profiles.filter((row) => row.normalized_email === 'direct-bypass@example.test')
assert.equal(directBypassProfiles.length, 1, 'direct Firebase identity reconciliation must create exactly one canonical profile')
assert.equal(directBypassProfiles[0].firebase_uid, 'uid-direct-bypass')
assert.equal(new Set([...users.values()].filter((user) => user.email === 'direct-bypass@example.test').map((user) => user.localId)).size, 1, 'direct Firebase identity reconciliation must keep one Firebase UID')

const pendingBeforeSubscription = await call('/account/subscription', { id_token: tokenPendingEmail }, tokenPendingEmail)
assert.equal(pendingBeforeSubscription.status, 403)
assert.equal(pendingBeforeSubscription.body.error, 'EMAIL_VERIFICATION_REQUIRED')
assert.equal(db.account_profiles.some((row) => row.firebase_uid === 'uid-pending-email'), false, 'unverified email/password auth must not auto-provision a profile')

const pendingBeforeIdentity = await call('/account/identity', { id_token: tokenPendingEmail }, tokenPendingEmail)
assert.equal(pendingBeforeIdentity.status, 403)
assert.equal(pendingBeforeIdentity.body.error, 'EMAIL_VERIFICATION_REQUIRED')
assert.equal(db.account_profiles.some((row) => row.firebase_uid === 'uid-pending-email'), false, 'unverified email/password auth must not auto-provision through account identity')

const pendingBeforeProvision = await call('/account/provision', {
  id_token: tokenPendingEmail,
  locale: 'en',
  terms_accepted: true,
  terms_version: '2026-06',
}, tokenPendingEmail)
assert.equal(pendingBeforeProvision.status, 403)
assert.equal(pendingBeforeProvision.body.error, 'EMAIL_VERIFICATION_REQUIRED')
assert.equal(db.account_profiles.some((row) => row.firebase_uid === 'uid-pending-email'), false, 'unverified email/password auth must not manually provision before OTP')

const unfinalizedProfileProvision = await call('/account/provision', {
  id_token: tokenUnfinalizedProfile,
  locale: 'en',
  terms_accepted: true,
  terms_version: '2026-06',
}, tokenUnfinalizedProfile)
assert.equal(unfinalizedProfileProvision.status, 403)
assert.equal(unfinalizedProfileProvision.body.error, 'EMAIL_VERIFICATION_REQUIRED')
assert.equal(db.account_profiles.filter((row) => row.firebase_uid === 'uid-unfinalized-profile').length, 1, 'explicit provision must not finalize or duplicate a legacy verified-but-unfinalized password profile')

const pendingDevice = await start('7'.repeat(32))
const pendingDeviceComplete = await call('/device/complete', { id_token: tokenPendingEmail, device_code: pendingDevice.device_code })
assert.equal(pendingDeviceComplete.status, 403)
assert.equal(pendingDeviceComplete.body.error, 'email_verification_required')
assert.equal(db.app_sessions.some((row) => row.user_id === 'uid-pending-email'), false, 'unverified email/password auth must not issue a desktop session')

const verificationRequest = await call('/email-verification/request', {
  id_token: tokenPendingEmail,
  email: 'pending@example.test',
  display_name: 'Pending Saturn Name',
  locale: 'en',
  terms_accepted: true,
  terms_version: '2026-06',
}, tokenPendingEmail)
assert.equal(verificationRequest.status, 200)
assert.equal(verificationRequest.body.status, 'sent')
assert.equal(String(verificationRequest.body.test_code || '').length, 6)
const verificationCancel = await call('/email-verification/cancel', {
  id_token: tokenPendingEmail,
  email: 'pending@example.test',
}, tokenPendingEmail)
assert.equal(verificationCancel.status, 200)
assert.equal(verificationCancel.body.status, 'superseded')
const supersededVerification = await call('/email-verification/verify', {
  id_token: tokenPendingEmail,
  email: 'pending@example.test',
  code: verificationRequest.body.test_code,
}, tokenPendingEmail)
assert.equal(supersededVerification.status, 404)
assert.equal(supersededVerification.body.error, 'VERIFICATION_CODE_INVALID')
const verificationRequestAfterCancel = await call('/email-verification/request', {
  id_token: tokenPendingEmail,
  email: 'pending@example.test',
  display_name: 'Pending Saturn Name',
  locale: 'en',
  terms_accepted: true,
  terms_version: '2026-06',
}, tokenPendingEmail)
assert.equal(verificationRequestAfterCancel.status, 200)
assert.equal(verificationRequestAfterCancel.body.status, 'sent')
assert.equal(String(verificationRequestAfterCancel.body.test_code || '').length, 6)
const verificationComplete = await call('/email-verification/verify', {
  id_token: tokenPendingEmail,
  email: 'pending@example.test',
  code: verificationRequestAfterCancel.body.test_code,
}, tokenPendingEmail)
assert.equal(verificationComplete.status, 200)
assert.equal(verificationComplete.body.status, 'verified')
const pendingProfile = db.account_profiles.find((row) => row.firebase_uid === 'uid-pending-email')
assert.equal(pendingProfile?.email_verified, true)
assert.equal(pendingProfile?.display_name, 'Pending Saturn Name')
assert.equal(pendingProfile?.verification_source, 'saturnws_otp')
const pendingOldTokenAfterOtp = await call('/account/subscription', { id_token: tokenPendingEmail }, tokenPendingEmail)
assert.equal(pendingOldTokenAfterOtp.status, 409)
assert.equal(pendingOldTokenAfterOtp.body.error, 'ACCOUNT_TOKEN_REFRESH_REQUIRED')
users.set(tokenPendingEmailFinalized, users.get(tokenPendingEmail))
const pendingAfterSubscription = await call('/account/subscription', { id_token: tokenPendingEmailFinalized }, tokenPendingEmailFinalized)
assert.equal(pendingAfterSubscription.status, 200)
assert.equal(pendingAfterSubscription.body.user.profile.email_verified, true)
assert.equal(pendingAfterSubscription.body.user.profile.display_name, 'Pending Saturn Name')
const pendingAfterIdentity = await call('/account/identity', { id_token: tokenPendingEmailFinalized }, tokenPendingEmailFinalized)
assert.equal(pendingAfterIdentity.status, 200)
assert.equal(pendingAfterIdentity.body.user.profile.email_verified, true)
assert.equal(pendingAfterIdentity.body.user.profile.display_name, 'Pending Saturn Name')
const pendingLinkedAfterOtp = await link(tokenPendingEmailFinalized, '8'.repeat(32))
assert.equal(pendingLinkedAfterOtp.session.entitlement_state, 'no_subscription')

const wrongCode = await call('/device/complete', { id_token: tokenNone, device_code: 'missing-device-code' })
assert.equal(wrongCode.status, 404)
assert.equal(wrongCode.body.error, 'device_code_not_found')

const passwordSignupPending = await start('0'.repeat(32))
const passwordSignupBlocked = await call('/device/password-complete', {
  device_code: passwordSignupPending.device_code,
  email: 'desktop-signup@example.test',
  password: 'strong-password-123',
  mode: 'signup',
})
assert.equal(passwordSignupBlocked.status, 409)
assert.equal(passwordSignupBlocked.body.error, 'registration_requires_otp')
assert.equal([...users.values()].some((user) => user.email === 'desktop-signup@example.test'), false, 'desktop password-complete must not create Firebase users in signup mode')

const replayComplete = await call('/device/complete', { id_token: tokenNone, device_code: noSubscription.pending.device_code })
assert.equal(replayComplete.status, 409)
assert.equal(replayComplete.body.error, 'device_code_already_used')
const replayPoll = await call('/device/poll', { device_code: noSubscription.pending.device_code, hwid: 'a'.repeat(32) })
assert.equal(replayPoll.status, 409)

const wrongDevicePending = await start('e'.repeat(32))
await call('/device/complete', { id_token: tokenActive, device_code: wrongDevicePending.device_code })
const wrongDevice = await call('/device/poll', { device_code: wrongDevicePending.device_code, hwid: 'c'.repeat(32) })
assert.equal(wrongDevice.status, 403)
assert.equal(wrongDevice.body.error, 'device_hwid_mismatch')

const expiredPending = await start('d'.repeat(32))
db.device_login_sessions.find((row) => row.device_code === expiredPending.device_code).expires_at = past(1)
const expiredCode = await call('/device/complete', { id_token: tokenActive, device_code: expiredPending.device_code })
assert.equal(expiredCode.status, 410)
assert.equal(expiredCode.body.error, 'device_code_expired')

const active = await link(tokenActive, 'e'.repeat(32))
assert.equal(active.session.entitlement_state, 'active')
const expired = await link(tokenExpired, 'f'.repeat(32))
assert.equal(expired.session.entitlement_state, 'no_subscription')
assert.equal(expired.session.subscription, null)
const lifetime = await link(tokenLifetime, '1'.repeat(32))
assert.equal(lifetime.session.entitlement_state, 'lifetime')
const grace = await link(tokenGrace, '3'.repeat(32))
assert.equal(grace.session.entitlement_state, 'grace')
assert.equal(grace.session.subscription.policy.allow, true)

const secondActiveDevice = await start('2'.repeat(32), 'Replacement QA Device')
const secondActiveComplete = await call('/device/complete', { id_token: tokenActive, device_code: secondActiveDevice.device_code })
assert.equal(secondActiveComplete.status, 409)
assert.equal(secondActiveComplete.body.error, 'device_change_required')
assert.equal(secondActiveComplete.body.request_status, null)
const deviceChangeRequest = await call('/account/device-change/request', {
  device_code: secondActiveDevice.device_code,
  reason: 'Replacing my workstation',
}, tokenActive)
assert.equal(deviceChangeRequest.status, 200)
assert.equal(deviceChangeRequest.body.request.status, 'pending')
assert.equal(deviceChangeRequest.body.request.device_name, 'Replacement QA Device')
const activeRows = db.app_sessions.filter((row) => row.user_id === 'uid-active' && !row.revoked_at)
assert.ok(activeRows.length >= 1)
assert.equal(activeRows.some((row) => row.hwid === '2'.repeat(32)), false, 'a second device must not receive a desktop session before approval')

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

const sessions = await call('/account/sessions', {}, tokenActive)
assert.equal(sessions.status, 200)
assert.equal(sessions.body.devices.length, 1)
assert.equal(sessions.body.device_binding.status, 'active')
assert.equal(sessions.body.device_change_requests.length, 1)
assert.equal(sessions.body.device_change_requests[0].status, 'pending')
assert.equal('requested_hwid_hash' in sessions.body.device_change_requests[0], false)
assert.ok(sessions.body.sessions.every((item) => !('session_token' in item) && !('hwid' in item)))
const unauthorizedSessions = await call('/account/sessions', {}, 'invalid-token')
assert.equal(unauthorizedSessions.status, 401)
assert.equal(unauthorizedSessions.body.error, 'AUTH_SESSION_EXPIRED')

const ownedSession = sessions.body.sessions.find((item) => item.status === 'active')
const unauthorizedRevoke = await call('/account/sessions/revoke', { session_id: ownedSession.id, scope: 'session' }, tokenOther)
assert.equal(unauthorizedRevoke.status, 404)
const revoke = await call('/account/sessions/revoke', { session_id: ownedSession.id, scope: 'session' }, tokenActive)
assert.equal(revoke.status, 200)

await link(tokenActive, 'e'.repeat(32))
const remainingActiveSession = db.app_sessions.find((row) => row.user_id === 'uid-active' && !row.revoked_at)
assert.ok(remainingActiveSession)
const revokeDevice = await call('/account/sessions/revoke', { session_id: remainingActiveSession.id, scope: 'device' }, tokenActive)
assert.equal(revokeDevice.status, 200)
assert.equal(
  db.app_sessions.filter((row) => row.user_id === 'uid-active' && row.hwid === remainingActiveSession.hwid && !row.revoked_at).length,
  0,
)

await link(tokenActive, 'e'.repeat(32))
const revokeAll = await call('/account/sessions/revoke-all', {}, tokenActive)
assert.equal(revokeAll.status, 200)
assert.equal(db.app_sessions.filter((row) => row.user_id === 'uid-active' && !row.revoked_at).length, 0)

const deletionProvision = await call('/account/provision', { id_token: recentDeletionToken, terms_accepted: true }, recentDeletionToken)
assert.equal(deletionProvision.status, 200)
const deletionSession = await link(recentDeletionToken, '4'.repeat(32))
assert.ok(db.app_sessions.some((row) => row.user_id === 'uid-delete' && !row.revoked_at))
const deletionInitial = await call('/account/deletion/status', {}, recentDeletionToken)
assert.equal(deletionInitial.status, 200)
assert.equal(deletionInitial.body.deletion.state, 'none')
assert.equal(deletionInitial.body.deletion.purge_available, false)
const staleDeletion = await call('/account/deletion/request', { reason: 'cleanup' }, staleDeletionToken)
assert.equal(staleDeletion.status, 401)
assert.equal(staleDeletion.body.error, 'RECENT_AUTH_REQUIRED')
const deletionRequest = await call('/account/deletion/request', { reason: 'cleanup' }, recentDeletionToken)
assert.equal(deletionRequest.status, 200)
assert.equal(deletionRequest.body.deletion.state, 'pending_deletion')
assert.equal(deletionRequest.body.deletion.purge_available, false)
assert.equal(db.account_profiles.find((row) => row.firebase_uid === 'uid-delete').account_status, 'pending_deletion')
assert.equal(db.app_sessions.filter((row) => row.user_id === 'uid-delete' && !row.revoked_at).length, 0)
const deletionAgain = await call('/account/deletion/request', {}, recentDeletionToken)
assert.equal(deletionAgain.status, 200)
assert.equal(deletionAgain.body.idempotent, true)
const deletionCancel = await call('/account/deletion/cancel', {}, recentDeletionToken)
assert.equal(deletionCancel.status, 200)
assert.equal(deletionCancel.body.deletion.state, 'deletion_cancelled')
assert.equal(db.account_profiles.find((row) => row.firebase_uid === 'uid-delete').account_status, 'active')
const deletionAfterCancel = await call('/account/deletion/status', {}, recentDeletionToken)
assert.equal(deletionAfterCancel.status, 200)
assert.equal(deletionAfterCancel.body.deletion.state, 'none')

const securityEvents = securityEmailRequests.map((item) => item.event_type)
for (const requiredEvent of [
  'security.new_login',
  'security.session_revoked',
  'security.device_revoked',
  'security.all_sessions_revoked',
  'account.deletion_requested',
  'account.deletion_cancelled',
]) {
  assert.ok(securityEvents.includes(requiredEvent), `missing security email event: ${requiredEvent}`)
}
const securityKeys = securityEmailRequests.map((item) => item.idempotency_key)
assert.equal(securityKeys.length, new Set(securityKeys).size, 'security email idempotency keys must be deterministic and unique per committed event')
const securityPayloadText = JSON.stringify(securityEmailRequests)
assert.equal(securityPayloadText.includes('stk_'), false, 'security email payload must not include app session tokens')
assert.equal(securityPayloadText.includes('session_token'), false, 'security email payload must not include session token fields')
assert.equal(securityPayloadText.includes('device_code'), false, 'security email payload must not include device codes')

const deniedRateLimit = { async limit() { return { success: false } } }
const deniedDeviceStart = await call('/device/start', { hwid: '7'.repeat(32) }, undefined, { ...env, AUTH_RATE_LIMIT_DEVICE: deniedRateLimit })
assert.equal(deniedDeviceStart.status, 429, 'distributed rate limiter denial must fail closed')
const missingDeviceLimiterEnv = { ...env }
delete missingDeviceLimiterEnv.AUTH_RATE_LIMIT_DEVICE
const missingLimiterDeviceStart = await call('/device/start', { hwid: '6'.repeat(32) }, undefined, missingDeviceLimiterEnv)
assert.equal(missingLimiterDeviceStart.status, 429, 'missing distributed rate limiter binding must fail closed')

const source = fs.readFileSync(path.join(ROOT, 'src/index.ts'), 'utf8')
for (const forbidden of ['console.log(sessionToken)', 'console.error(sessionToken)', 'session_token: sessionToken, error']) {
  assert.equal(source.includes(forbidden), false, `secret logging guard: ${forbidden}`)
}
assert.match(source, /\/internal\/subscription-email-candidates/, 'subscription lifecycle email source route must exist')
assert.match(source, /requireSubscriptionEmailSourceToken/, 'subscription lifecycle email source must require internal authentication')
const supabaseSource = fs.readFileSync(path.join(ROOT, 'src/lib/supabase.ts'), 'utf8')
assert.match(supabaseSource, /is_current=eq\.true/, 'subscription email candidates must use current subscription rows')
assert.match(supabaseSource, /integrity_state=eq\.ok/, 'subscription email candidates must fail closed on integrity conflicts')
assert.match(supabaseSource, /account_profiles\?select=firebase_uid,normalized_email,locale,account_status/, 'subscription email recipients must come from canonical account profiles')

fs.rmSync(BUILD_DIR, { recursive: true, force: true })
console.log('Phase C Auth Worker behavior checks passed.')
