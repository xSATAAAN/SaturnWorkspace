import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadRuntimeContract, validateRuntimeOperation } from './runtime-contract.mjs'

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url))
const contract = loadRuntimeContract(path.resolve(TOOL_DIR, '../contracts/desktop-control-plane.v1.json'))
const future = new Date(Date.now() + 60_000).toISOString()

test('email registration proves an identity separately from desktop session authorization', () => {
  const identity = { registration_id: 'synthetic-registration-id', email: 'qa@example.test' }
  const cases = [
    ['email_registration_start', { success: true, status: 'sent', ...identity, expires_at: future, resend_after_seconds: 45, delivery_status: 'sent', sent_at: new Date().toISOString() }],
    ['email_registration_delivery', { success: true, status: 'sent', ...identity, expires_at: future, resend_after_seconds: 0, delivery_status: 'queued', sent_at: null }],
    ['email_registration_verify', { success: true, status: 'verified', ...identity, verified_at: future, finalization_token: 'synthetic-finalization-proof', finalization_expires_at: future }],
    ['email_registration_finalize', { success: true, status: 'finalized', email: identity.email }],
    ['email_registration_cancel', { success: true, status: 'superseded' }],
  ]
  for (const [operation, payload] of cases) {
    assert.equal(validateRuntimeOperation(contract, `auth.${operation}`, payload), payload)
    assert.equal('session_token' in contract.auth.operations[operation].response.required, false)
    assert.throws(() => validateRuntimeOperation(contract, `auth.${operation}`, { ...payload, success: false }), /invalid_fixed_value:success/)
  }
  assert.throws(() => validateRuntimeOperation(contract, 'auth.email_registration_verify', {
    success: true, status: 'verified', ...identity, verified_at: future, finalization_expires_at: future,
  }), /missing:finalization_token/)
})

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

test('route-check contract composes Policy mint, Desktop transport and edge delivery', () => {
  assert.equal(contract.policy.operations.route_capability.path, '/v1/route-check/capability')
  assert.equal(contract.policy.operations.route_capability.authorization, 'bearer_app_session')
  assert.equal(contract.route_check.operations.host_exit.path, '/v1/host-exit')
  assert.equal(contract.route_check.operations.host_exit.authorization, 'one_time_policy_capability')
  assert.equal(contract.route_check.delivery.machine_api_path_prefix, '/v1/')
  assert.equal(contract.route_check.delivery.desktop_machine_user_agent, 'SaturnWorkspace-RouteCheck/1')
  assert.equal(contract.route_check.delivery.worker_response_header, 'X-Saturn-Route-Response')
  assert.equal(contract.route_check.delivery.worker_response_header_value, '1')
  assert.equal(contract.route_check.delivery.machine_api_must_not_require_browser_challenge_or_browser_integrity_headers, true)
  assert.equal(contract.route_check.delivery.production_acceptance_requires_edge_to_worker_evidence, true)
})
