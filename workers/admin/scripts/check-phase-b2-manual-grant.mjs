import assert from 'node:assert/strict'
import worker from '../src/index.js'

const now = Date.now()
const iso = (offsetMs) => new Date(now + offsetMs).toISOString()
const rows = [
  {
    id: 'sub-active-1',
    firebase_user_id: 'uid-active',
    user_email: 'active@example.com',
    plan: 'monthly',
    tier: 'public',
    status: 'active',
    starts_at: iso(-7 * 86400e3),
    expires_at: iso(5 * 86400e3),
    provider: 'manual',
    metadata: {},
    feature_payload: {},
    created_at: iso(-7 * 86400e3),
    updated_at: iso(-86400e3),
  },
  {
    id: 'sub-expired-1',
    firebase_user_id: 'uid-expired',
    user_email: 'expired@example.com',
    plan: 'monthly',
    tier: 'public',
    status: 'expired',
    starts_at: iso(-30 * 86400e3),
    expires_at: iso(-2 * 86400e3),
    provider: 'manual',
    metadata: {},
    feature_payload: {},
    created_at: iso(-30 * 86400e3),
    updated_at: iso(-2 * 86400e3),
  },
  {
    id: 'sub-dupe-1',
    firebase_user_id: 'uid-dupe',
    user_email: 'dupe@example.com',
    plan: 'monthly',
    tier: 'public',
    status: 'active',
    starts_at: iso(-5 * 86400e3),
    expires_at: iso(3 * 86400e3),
    provider: 'manual',
    metadata: {},
    feature_payload: {},
    created_at: iso(-5 * 86400e3),
    updated_at: iso(-2 * 86400e3),
  },
  {
    id: 'sub-dupe-2',
    firebase_user_id: 'uid-dupe',
    user_email: 'dupe@example.com',
    plan: 'monthly',
    tier: 'public',
    status: 'active',
    starts_at: iso(-4 * 86400e3),
    expires_at: iso(4 * 86400e3),
    provider: 'manual',
    metadata: {},
    feature_payload: {},
    created_at: iso(-4 * 86400e3),
    updated_at: iso(-1 * 86400e3),
  },
]
const activity = []
const paymentWrites = []
const bucket = new Map()
const profiles = [
  { firebase_user_id: 'uid-active', normalized_email: 'active@example.com', display_name: 'Active user', account_status: 'active', updated_at: iso(-86400e3) },
  { firebase_user_id: 'uid-expired', normalized_email: 'expired@example.com', display_name: 'Expired user', account_status: 'active', updated_at: iso(-86400e3) },
  { firebase_user_id: 'uid-dupe', normalized_email: 'dupe@example.com', display_name: 'Duplicate user', account_status: 'active', updated_at: iso(-86400e3) },
  { firebase_user_id: 'uid-new', normalized_email: 'new@example.com', display_name: 'New user', account_status: 'active', updated_at: iso(-86400e3) },
]

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url)
  const table = url.pathname.split('/').pop()
  const method = String(init.method || 'GET').toUpperCase()
  if (method === 'GET' && table === 'account_profiles') {
    const query = decodeURIComponent(url.search)
    return Response.json(profiles.filter((profile) =>
      query.includes(profile.firebase_user_id) || query.includes(profile.normalized_email),
    ))
  }
  if (method === 'GET' && table === 'account_subscriptions') {
    const query = decodeURIComponent(url.search)
    if (query.includes('uid-active')) return Response.json(rows.filter((row) => row.firebase_user_id === 'uid-active'))
    if (query.includes('uid-expired')) return Response.json(rows.filter((row) => row.firebase_user_id === 'uid-expired'))
    if (query.includes('uid-dupe')) return Response.json(rows.filter((row) => row.firebase_user_id === 'uid-dupe'))
    if (query.includes('new@example.com')) return Response.json([])
    return Response.json(rows)
  }
  if (method === 'GET' && table === 'device_login_sessions') return Response.json([])
  if (method === 'PATCH' && table === 'account_subscriptions') {
    const body = JSON.parse(init.body || '{}')
    const id = /id=eq\.([^&]+)/.exec(url.search)?.[1]
    const row = rows.find((item) => item.id === decodeURIComponent(id || ''))
    if (!row) return Response.json({ error: 'not_found' }, { status: 404 })
    Object.assign(row, body)
    return Response.json([row])
  }
  if (method === 'POST' && table === 'account_subscriptions') {
    const body = JSON.parse(init.body || '{}')
    const row = { id: `sub-created-${rows.length + 1}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body }
    rows.push(row)
    return Response.json([row])
  }
  if (method === 'POST' && table === 'apply_manual_subscription_grant') {
    const body = JSON.parse(init.body || '{}')
    const current = rows.find((item) => item.id === body.p_current_id)
    const row = current || {
      id: `sub-created-${rows.length + 1}`,
      created_at: new Date().toISOString(),
      firebase_user_id: body.p_target_uid,
      user_email: body.p_target_email,
    }
    Object.assign(row, {
      plan: body.p_legacy_plan,
      plan_term: body.p_plan_term,
      tier: body.p_tier,
      status: 'active',
      lifecycle_state: 'active',
      starts_at: body.p_starts_at,
      expires_at: body.p_expires_at,
      period_start_at: body.p_starts_at,
      period_end_at: body.p_expires_at,
      metadata: body.p_metadata,
      feature_payload: body.p_feature_payload,
      updated_at: new Date().toISOString(),
    })
    if (!current) rows.push(row)
    return Response.json([row])
  }
  if (method === 'POST' && table === 'admin_activity') {
    activity.push(JSON.parse(init.body || '{}'))
    return Response.json([])
  }
  if (['orders', 'payment_events', 'invoices'].includes(table || '')) {
    paymentWrites.push({ table, method })
    return Response.json([])
  }
  return Response.json([])
}

const env = {
  ADMIN_API_TOKEN: 'test-admin-token',
  SUPABASE_URL: 'https://mock.supabase.local',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
  OTA_BUCKET: {
    async get(key) {
      const value = bucket.get(key)
      return value ? { json: async () => JSON.parse(value) } : null
    },
    async put(key, value) {
      bucket.set(key, value)
    },
  },
}

async function post(path, body) {
  const response = await worker.fetch(new Request(`https://admin.saturnws.com${path}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-admin-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), env)
  const payload = await response.json()
  return { status: response.status, payload }
}

async function expectError(body, expected) {
  const result = await post('/api/admin/subscriptions/manual-grant/preview', body)
  assert.ok(result.status >= 400)
  assert.match(result.payload.error, expected)
}

const base = {
  target_firebase_uid: 'uid-active',
  target_email: 'active@example.com',
  operation_type: 'extend_current',
  plan: 'monthly',
  duration_mode: 'duration',
  duration_value: 5,
  duration_unit: 'days',
}

const preview5Days = await post('/api/admin/subscriptions/manual-grant/preview', base)
assert.equal(preview5Days.status, 200)
assert.equal(preview5Days.payload.preview.blocked, false)
assert.equal(preview5Days.payload.preview.proposed_state.operation, 'extend_current')
assert.equal(preview5Days.payload.preview.proposed_state.db_plan, 'monthly')
assert.ok(Date.parse(preview5Days.payload.preview.proposed_state.expires_at) > Date.parse(rows[0].expires_at))

for (const [value, unit] of [[1, 'hours'], [3, 'weeks'], [2, 'months']]) {
  const result = await post('/api/admin/subscriptions/manual-grant/preview', { ...base, duration_value: value, duration_unit: unit })
  assert.equal(result.status, 200)
  assert.equal(result.payload.preview.requested_operation.duration_unit, unit)
}

const exact = await post('/api/admin/subscriptions/manual-grant/preview', {
  ...base,
  duration_mode: 'exact',
  exact_expiry: iso(10 * 86400e3),
  timezone: 'Africa/Cairo',
})
assert.equal(exact.status, 200)
assert.equal(exact.payload.preview.requested_operation.timezone, 'Africa/Cairo')

const newUser = await post('/api/admin/subscriptions/manual-grant/preview', {
  target_firebase_uid: 'uid-new',
  target_email: 'new@example.com',
  operation_type: 'start_from_now',
  plan: 'weekly',
  duration_mode: 'duration',
  duration_value: 1,
  duration_unit: 'weeks',
})
assert.equal(newUser.status, 200)
assert.equal(newUser.payload.preview.current_subscription, null)

const duplicate = await post('/api/admin/subscriptions/manual-grant/preview', {
  ...base,
  target_firebase_uid: 'uid-dupe',
  target_email: 'dupe@example.com',
})
assert.equal(duplicate.status, 200)
assert.equal(duplicate.payload.preview.blocked, true)
assert.ok(duplicate.payload.preview.warnings.includes('multiple_usable_subscriptions'))

await expectError({ ...base, duration_value: 0 }, /invalid_duration/)
await expectError({ ...base, duration_value: -1 }, /invalid_duration/)
await expectError({ ...base, duration_mode: 'exact', exact_expiry: iso(-86400e3) }, /past_expiry/)

const missingReason = await post('/api/admin/subscriptions/manual-grant/execute', {
  ...base,
  idempotency_key: 'idem-active-1',
  preview_hash: preview5Days.payload.preview.preview_hash,
})
assert.ok(missingReason.status >= 400)
assert.match(missingReason.payload.error, /missing_reason/)

const executeReason = 'Manual acceptance test grant'
const executePreview = await post('/api/admin/subscriptions/manual-grant/preview', {
  ...base,
  reason: executeReason,
})
assert.equal(executePreview.status, 200)

const executePayload = {
  ...base,
  reason: executeReason,
  idempotency_key: 'idem-active-1',
  preview_hash: executePreview.payload.preview.preview_hash,
}
const executed = await post('/api/admin/subscriptions/manual-grant/execute', executePayload)
assert.equal(executed.status, 200, JSON.stringify(executed.payload))
assert.equal(executed.payload.success, true)
assert.equal(executed.payload.item.id, 'sub-active-1')
assert.ok(activity.some((row) => row.action === 'subscription_manual_grant'))

const replay = await post('/api/admin/subscriptions/manual-grant/execute', executePayload)
assert.equal(replay.status, 200)
assert.equal(replay.payload.idempotent_replay, true)

assert.equal(paymentWrites.length, 0, 'manual grant must not create payment/order/invoice rows')
console.log('Phase B.2 manual grant checks passed.')
