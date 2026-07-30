import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadRuntimeContract, validateRuntimeOperation } from './runtime-contract.mjs'

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url))
const contract = loadRuntimeContract(path.resolve(TOOL_DIR, '../contracts/desktop-control-plane.v1.json'))
const future = new Date(Date.now() + 60_000).toISOString()

test('canonical contract keeps account connection separate from entitlement', () => {
  assert.equal(contract.product_invariants.account_connection_is_separate_from_entitlement, true)
  assert.equal(contract.product_invariants.linked_without_subscription_is_valid, true)
  assert.ok(contract.auth.entitlement_states.includes('no_subscription'))
  assert.equal(contract.auth.compatibility.license.status, 'deprecated_optional_alias')
  assert.equal('license' in contract.auth.operations.device_poll_authorized.response.required, false)
})

test('authorized no-subscription device response satisfies the canonical contract', () => {
  const payload = {
    success: true,
    status: 'authorized',
    connection_state: 'linked',
    entitlement_state: 'no_subscription',
    entitlement: { state: 'no_subscription' },
    subscription: null,
    session_token: 'qa-session-token',
    session_expires_at: future,
  }
  assert.equal(
    validateRuntimeOperation(contract, 'auth.device_poll_authorized', payload),
    payload,
  )
})

test('malformed successful auth response is rejected instead of defaulted', () => {
  assert.throws(
    () => validateRuntimeOperation(contract, 'auth.device_poll_authorized', {
      success: true,
      session_token: 'qa-session-token',
      session_expires_at: future,
    }),
    /missing:status/,
  )
})

test('policy decision and allow flag cannot contradict each other', () => {
  assert.throws(
    () => validateRuntimeOperation(contract, 'policy.check', {
      success: true,
      decision: 'subscription_required',
      allow: true,
      reason: 'subscription_required',
      message: '',
      plan: '',
      features: {},
      limits: {},
      blocked_actions: [],
      issued_at: new Date().toISOString(),
      expires_at: future,
      ttl_seconds: 60,
      sticky: true,
      signature: 'qa-signature',
    }),
    /invalid_relation:allow_decision/,
  )
})
