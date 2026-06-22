import assert from 'node:assert/strict'
import test from 'node:test'
import {
  adminContext,
  previewAccessRevocation,
  previewAccountLifecycle,
  previewSubscriptionTransition,
  requirePermission,
} from './adminOperations.js'

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key', ADMIN_ROLE_ASSIGNMENTS: JSON.stringify({ 'billing@example.com': 'billing', 'support@example.com': 'support' }) }

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

test('role assignments enforce least privilege', () => {
  const billing = adminContext(env, 'billing@example.com')
  assert.equal(billing.role, 'billing')
  assert.doesNotThrow(() => requirePermission(billing, 'subscriptions:write'))
  assert.throws(() => requirePermission(billing, 'policies:write'), /admin_permission_denied/)
  assert.doesNotThrow(() => requirePermission(adminContext(env, 'token-admin'), 'policies:write'))
})

test('account lifecycle preview is deterministic and revokes sessions for suspension', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => jsonResponse([{ firebase_user_id: 'uid-1', normalized_email: 'user@example.com', display_name: 'User', account_status: 'active', updated_at: '2026-06-22T10:00:00.000Z' }])
  try {
    const preview = await previewAccountLifecycle(env, adminContext(env, 'token-admin'), 'uid-1', { action: 'suspend', reason_code: 'security_review' })
    assert.equal(preview.current_status, 'active')
    assert.equal(preview.resulting_status, 'suspended')
    assert.equal(preview.sessions_will_be_revoked, true)
    assert.match(preview.preview_hash, /^[a-f0-9]{64}$/)
  } finally { globalThis.fetch = originalFetch }
})

test('email is never used as the account operation identity', async () => {
  const requested = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => { requested.push(String(url)); return jsonResponse([{ firebase_user_id: 'uid-2', normalized_email: 'user@example.com', account_status: 'active', updated_at: '2026-06-22T10:00:00.000Z' }]) }
  try {
    await previewAccessRevocation(env, adminContext(env, 'support@example.com'), 'uid-2', { scope: 'all', reason_code: 'technical_support' })
    assert.ok(requested.every((url) => url.includes('firebase_uid=eq.uid-2')))
  } finally { globalThis.fetch = originalFetch }
})

test('subscription transitions reject invalid resume and lifetime period cancellation', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => jsonResponse([{ id: 'sub-1', firebase_user_id: 'uid-1', user_email: 'user@example.com', lifecycle_state: 'active', status: 'active', plan_term: 'lifetime', integrity_state: 'ok', starts_at: '2026-01-01T00:00:00.000Z', expires_at: '9999-12-31T23:59:59.000Z', updated_at: '2026-06-22T10:00:00.000Z' }])
  try {
    const context = adminContext(env, 'billing@example.com')
    await assert.rejects(() => previewSubscriptionTransition(env, context, 'sub-1', { action: 'resume', reason_code: 'billing_correction' }), /invalid_subscription_transition/)
    await assert.rejects(() => previewSubscriptionTransition(env, context, 'sub-1', { action: 'cancel_at_period_end', reason_code: 'customer_request' }), /lifetime_cannot_cancel_at_period_end/)
  } finally { globalThis.fetch = originalFetch }
})
