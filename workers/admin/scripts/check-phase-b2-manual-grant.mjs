import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
const recoveryRows = []
const pendingGrants = []
const subscriptionEmails = []
const bucket = new Map()
const deviceLoginRows = [{ id: 'login-device-change', user_id: 'uid-active', user_email: 'active@example.com', hwid: 'replacement-hwid', status: 'device_change_required', expires_at: iso(86400e3) }]
const deviceBindings = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', firebase_uid: 'uid-active', device_key: '0123456789abcdef', device_name: 'Current PC', platform: 'Windows', os_version: 'Windows 11', app_version: '1.0.7', status: 'active', bound_at: iso(-7 * 86400e3), last_seen_at: iso(-3600e3), released_at: null, created_at: iso(-7 * 86400e3), updated_at: iso(-3600e3) }]
const deviceChangeRequests = [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', firebase_uid: 'uid-active', current_binding_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', resulting_binding_id: null, requested_hwid_hash: '1'.repeat(64), requested_device_key: '1111111111111111', device_name: 'Replacement PC', platform: 'Windows', os_version: 'Windows 11', app_version: '1.0.7', user_reason: 'New workstation', status: 'pending', requested_at: iso(-1800e3), resolved_at: null, resolved_by: null, resolution_note: null, resolution_request_id: null, created_at: iso(-1800e3), updated_at: iso(-1800e3) }]
const deviceEvents = []
const profiles = [
  { firebase_uid: 'uid-active', normalized_email: 'active@example.com', display_name: 'Active user', locale: 'en', account_status: 'active', updated_at: iso(-86400e3) },
  { firebase_uid: 'uid-expired', normalized_email: 'expired@example.com', display_name: 'Expired user', account_status: 'active', updated_at: iso(-86400e3) },
  { firebase_uid: 'uid-dupe', normalized_email: 'dupe@example.com', display_name: 'Duplicate user', account_status: 'active', updated_at: iso(-86400e3) },
  { firebase_uid: 'uid-new', normalized_email: 'new@example.com', display_name: 'New user', account_status: 'active', updated_at: iso(-86400e3) },
]

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url)
  const table = url.pathname.split('/').pop()
  const method = String(init.method || 'GET').toUpperCase()
  if (method === 'GET' && table === 'account_profiles') {
    const query = decodeURIComponent(url.search)
    return Response.json(profiles.filter((profile) =>
      query.includes(profile.firebase_uid) || query.includes(profile.normalized_email),
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
  if (method === 'GET' && table === 'device_login_sessions') return Response.json(deviceLoginRows)
  if (method === 'GET' && table === 'account_device_change_requests') {
    const query = decodeURIComponent(url.search)
    const fields = /select=([^&]+)/.exec(query)?.[1].split(',').map((field) => field.trim()).filter(Boolean) || []
    const project = (items) => items.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])))
    if (query.includes('id=eq.')) {
      const id = /id=eq\.([^&]+)/.exec(query)?.[1]
      return Response.json(project(deviceChangeRequests.filter((row) => row.id === id)))
    }
    if (query.includes('status=eq.')) {
      const status = /status=eq\.([^&]+)/.exec(query)?.[1]
      return Response.json(project(deviceChangeRequests.filter((row) => row.status === status)))
    }
    return Response.json(project(deviceChangeRequests))
  }
  if (method === 'GET' && table === 'account_device_bindings') {
    const query = decodeURIComponent(url.search)
    return Response.json(deviceBindings.filter((row) => !query.includes('status=eq.active') || row.status === 'active'))
  }
  if (method === 'GET' && table === 'account_device_events') return Response.json(deviceEvents)
  if (method === 'GET' && table === 'app_sessions') return Response.json([{ id: 'active-device-session' }])
  if (method === 'GET' && table === 'pending_subscription_grants') {
    const query = decodeURIComponent(url.search)
    if (query.includes('status=eq.pending')) return Response.json(pendingGrants.filter((row) => row.status === 'pending'))
    return Response.json(pendingGrants)
  }
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
  if (method === 'POST' && table === 'subscription_recovery_ledger') {
    const body = JSON.parse(init.body || '{}')
    const row = { id: `recovery-${recoveryRows.length + 1}`, created_at: new Date().toISOString(), ...body }
    recoveryRows.push(row)
    return Response.json([row], { status: 201 })
  }
  if (method === 'POST' && table === 'pending_subscription_grants') {
    const body = JSON.parse(init.body || '{}')
    const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body }
    pendingGrants.push(row)
    return Response.json([row], { status: 201 })
  }
  if (method === 'PATCH' && table === 'pending_subscription_grants') {
    const body = JSON.parse(init.body || '{}')
    const id = decodeURIComponent(/id=eq\.([^&]+)/.exec(url.search)?.[1] || '')
    const row = pendingGrants.find((item) => item.id === id && item.status === 'pending')
    if (!row) return Response.json([])
    Object.assign(row, body, { updated_at: new Date().toISOString() })
    return Response.json([row])
  }
  if (method === 'PATCH' && table === 'device_login_sessions') {
    const body = JSON.parse(init.body || '{}')
    for (const row of deviceLoginRows) Object.assign(row, body)
    return Response.json([])
  }
  if (method === 'POST' && table === 'resolve_account_device_change') {
    const body = JSON.parse(init.body || '{}')
    const row = deviceChangeRequests.find((item) => item.id === body.p_request_id)
    if (!row) return Response.json({ message: 'device_change_request_not_found' }, { status: 404 })
    if (row.status !== 'pending' && row.resolution_request_id !== body.p_resolution_request_id) {
      return Response.json({ message: 'device_change_request_not_pending' }, { status: 409 })
    }
    if (row.status === 'pending') {
      Object.assign(row, {
        status: body.p_action === 'approve' ? 'approved' : 'rejected',
        resolved_at: new Date().toISOString(),
        resolved_by: body.p_actor,
        resolution_note: body.p_resolution_note,
        resolution_request_id: body.p_resolution_request_id,
        updated_at: new Date().toISOString(),
      })
      if (body.p_action === 'approve') {
        deviceBindings[0].status = 'replaced'
        deviceBindings.push({ ...deviceBindings[0], id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', device_key: row.requested_device_key, device_name: row.device_name, status: 'active', updated_at: new Date().toISOString() })
      }
    }
    return Response.json([row])
  }
  if (method === 'POST' && table === 'reset_account_device') {
    const body = JSON.parse(init.body || '{}')
    const active = deviceBindings.find((row) => row.firebase_uid === body.p_firebase_uid && row.status === 'active')
    if (active) active.status = 'revoked'
    deviceEvents.push({ id: `device-event-${deviceEvents.length + 1}`, firebase_uid: body.p_firebase_uid, event_type: 'device_binding_reset', details: { request_id: body.p_request_id } })
    return Response.json(Boolean(active))
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
  ADMIN_EMAIL_ENQUEUE_URL: 'https://api.saturnws.com/v1/internal/email/auth/enqueue',
  ADMIN_EMAIL_ENQUEUE_TOKEN: 'test-email-token',
  POLICY_WORKER: {
    async fetch(request) {
      assert.equal(request.headers.get('authorization'), 'Bearer test-email-token')
      const body = await request.json()
      subscriptionEmails.push(body)
      return Response.json({ success: true, status: 'queued', job_id: `subscription-email-${subscriptionEmails.length}` })
    },
  },
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

async function get(path) {
  const response = await worker.fetch(new Request(`https://admin.saturnws.com${path}`, {
    headers: { Authorization: 'Bearer test-admin-token' },
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

const pendingInput = {
  target_email: 'waiting@example.com',
  operation_type: 'start_from_now',
  plan: 'monthly',
  duration_mode: 'duration',
  duration_value: 30,
  duration_unit: 'days',
  reason_code: 'admin_grant',
  reason: 'Pre-approved subscription before registration',
}
const pendingPreview = await post('/api/admin/subscriptions/manual-grant/preview', pendingInput)
assert.equal(pendingPreview.status, 200, JSON.stringify(pendingPreview.payload))
assert.equal(pendingPreview.payload.preview.pending_registration, true)
assert.equal(pendingPreview.payload.preview.target.firebase_user_id, null)
assert.equal(pendingPreview.payload.preview.proposed_state.resulting_entitlement, 'pending_registration')
const pendingExecutePayload = {
  ...pendingInput,
  idempotency_key: 'idem-pending-1',
  preview_hash: pendingPreview.payload.preview.preview_hash,
}
const pendingExecuted = await post('/api/admin/subscriptions/manual-grant/execute', pendingExecutePayload)
assert.equal(pendingExecuted.status, 200, JSON.stringify(pendingExecuted.payload))
assert.equal(pendingExecuted.payload.item, null)
assert.equal(pendingExecuted.payload.pending_grant.status, 'pending')
assert.equal(pendingExecuted.payload.notification.queued, true)
assert.equal(subscriptionEmails.at(-1)?.event_type, 'billing.subscription_grant_reserved')
assert.equal(pendingGrants.length, 1)
assert.ok(activity.some((row) => row.action === 'pending_subscription_grant_created'))
const pendingReplay = await post('/api/admin/subscriptions/manual-grant/execute', pendingExecutePayload)
assert.equal(pendingReplay.status, 200)
assert.equal(pendingReplay.payload.idempotent_replay, true)
const duplicatePendingPreview = await post('/api/admin/subscriptions/manual-grant/preview', {
  ...pendingInput,
  duration_value: 14,
})
const duplicatePending = await post('/api/admin/subscriptions/manual-grant/execute', {
  ...pendingInput,
  duration_value: 14,
  idempotency_key: 'idem-pending-duplicate',
  preview_hash: duplicatePendingPreview.payload.preview.preview_hash,
})
assert.equal(duplicatePending.status, 409)
assert.equal(duplicatePending.payload.error, 'pending_grant_already_exists')
const pendingList = await get('/api/admin/subscriptions/pending-grants')
assert.equal(pendingList.status, 200)
assert.equal(pendingList.payload.items.length, 1)
const pendingCancel = await post('/api/admin/subscriptions/pending-grants/cancel', {
  grant_id: pendingGrants[0].id,
  reason: 'Customer changed the requested email',
})
assert.equal(pendingCancel.status, 200, JSON.stringify(pendingCancel.payload))
assert.equal(pendingCancel.payload.item.status, 'cancelled')
assert.ok(activity.some((row) => row.action === 'pending_subscription_grant_cancelled'))

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
  reason_code: 'technical_support',
  reason: executeReason,
})
assert.equal(executePreview.status, 200)

const executePayload = {
  ...base,
  reason_code: 'technical_support',
  reason: executeReason,
  idempotency_key: 'idem-active-1',
  preview_hash: executePreview.payload.preview.preview_hash,
}
const executed = await post('/api/admin/subscriptions/manual-grant/execute', executePayload)
assert.equal(executed.status, 200, JSON.stringify(executed.payload))
assert.equal(executed.payload.success, true)
assert.equal(executed.payload.item.id, 'sub-active-1')
assert.equal(executed.payload.notification.queued, true)
assert.equal(subscriptionEmails.at(-1)?.event_type, 'billing.subscription_granted')
assert.equal(subscriptionEmails.at(-1)?.payload?.reason_code, 'technical_support')
assert.ok(activity.some((row) => row.action === 'subscription_manual_grant'))

const replay = await post('/api/admin/subscriptions/manual-grant/execute', executePayload)
assert.equal(replay.status, 200)
assert.equal(replay.payload.idempotent_replay, true)

const replacePreview = await post('/api/admin/subscriptions/manual-grant/preview', {
  ...base,
  operation_type: 'replace_current',
  duration_value: 1,
  duration_unit: 'days',
  reason: 'Replace current subscription after support correction',
})
assert.equal(replacePreview.status, 200)
assert.equal(replacePreview.payload.preview.proposed_state.operation, 'replace_current')
const replaceExecute = await post('/api/admin/subscriptions/manual-grant/execute', {
  ...base,
  operation_type: 'replace_current',
  duration_value: 1,
  duration_unit: 'days',
  reason: 'Replace current subscription after support correction',
  idempotency_key: 'idem-replace-1',
  preview_hash: replacePreview.payload.preview.preview_hash,
})
assert.equal(replaceExecute.status, 200, JSON.stringify(replaceExecute.payload))
assert.equal(replaceExecute.payload.success, true)
assert.ok(replaceExecute.payload.recovery_evidence_created)
assert.equal(recoveryRows.length, 1)
assert.equal(recoveryRows[0].evidence_type, 'subscription_replacement')
assert.equal(recoveryRows[0].source_type, 'manual_grant_replace_current')
assert.ok(Number(recoveryRows[0].remaining_seconds) > 0)
assert.ok(recoveryRows[0].integrity_hash)
assert.equal(deviceLoginRows[0].status, 'device_change_required', 'subscription grants must not bypass device-change approval')

const deviceChangeQueue = await get('/api/admin/device-change-requests?status=pending')
assert.equal(deviceChangeQueue.status, 200)
assert.equal(deviceChangeQueue.payload.items.length, 1)
assert.equal(deviceChangeQueue.payload.items[0].account.normalized_email, 'active@example.com')
assert.equal('requested_hwid_hash' in deviceChangeQueue.payload.items[0], false)
const deviceChangePreview = await post('/api/admin/device-change-requests/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/preview', {
  action: 'approve',
  reason: 'Verified workstation replacement',
})
assert.equal(deviceChangePreview.status, 200, JSON.stringify(deviceChangePreview.payload))
const deviceChangeExecutePayload = {
  action: 'approve',
  reason: 'Verified workstation replacement',
  preview_hash: deviceChangePreview.payload.preview.preview_hash,
  request_id: 'device-change-operation-001',
}
const deviceChangeExecute = await post('/api/admin/device-change-requests/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/execute', deviceChangeExecutePayload)
assert.equal(deviceChangeExecute.status, 200, JSON.stringify(deviceChangeExecute.payload))
assert.equal(deviceChangeExecute.payload.result.item.status, 'approved')
assert.equal('requested_hwid_hash' in deviceChangeExecute.payload.result.item, false)
const deviceChangeReplay = await post('/api/admin/device-change-requests/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/execute', deviceChangeExecutePayload)
assert.equal(deviceChangeReplay.status, 200)
assert.equal(deviceChangeReplay.payload.result.idempotent, true)

const deviceResetPreview = await post('/api/admin/users/uid-active/device/reset/preview', { reason: 'Customer verified reset' })
assert.equal(deviceResetPreview.status, 200, JSON.stringify(deviceResetPreview.payload))
assert.equal(deviceResetPreview.payload.preview.binding.status, 'active')
const deviceResetPayload = {
  reason: 'Customer verified reset',
  preview_hash: deviceResetPreview.payload.preview.preview_hash,
  request_id: 'device-reset-operation-001',
}
const deviceResetExecute = await post('/api/admin/users/uid-active/device/reset/execute', deviceResetPayload)
assert.equal(deviceResetExecute.status, 200, JSON.stringify(deviceResetExecute.payload))
assert.equal(deviceResetExecute.payload.result.reset, true)
const deviceResetReplay = await post('/api/admin/users/uid-active/device/reset/execute', deviceResetPayload)
assert.equal(deviceResetReplay.status, 200)
assert.equal(deviceResetReplay.payload.result.idempotent, true)
assert.ok(activity.some((row) => row.action === 'account_device_change_approved'))
assert.ok(activity.some((row) => row.action === 'account_device_binding_reset'))

assert.equal(paymentWrites.length, 0, 'manual grant must not create payment/order/invoice rows')
const pendingMigration = readFileSync(new URL('../../auth/migrations/20260712201401_pending_subscription_grants.sql', import.meta.url), 'utf8')
assert.match(pendingMigration, /enable row level security/i)
assert.match(pendingMigration, /revoke all on table public\.pending_subscription_grants from public, anon, authenticated/i)
assert.match(pendingMigration, /where status = 'pending'/i)
assert.match(pendingMigration, /pg_advisory_xact_lock/i)
assert.match(pendingMigration, /after insert or update of email_verified, normalized_email, account_status/i)
const deviceMigration = readFileSync(new URL('../../auth/migrations/20260713114500_account_device_policy.sql', import.meta.url), 'utf8')
assert.match(deviceMigration, /account_device_bindings_one_active_per_user_idx/i)
assert.match(deviceMigration, /pg_advisory_xact_lock/i)
assert.match(deviceMigration, /p_resolution_request_id/i)
assert.match(deviceMigration, /status = 'authorized'/i)
console.log('Phase B.2 manual grant checks passed.')
