import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'
import { cloudflareWorkersTestShim } from './esbuild-cloudflare-test-shim.mjs'
import { loadRuntimeContract, validateRuntimeOperation } from '../../../tools/runtime-contract.mjs'

const ROOT = process.cwd()
const CONTRACT = loadRuntimeContract(path.resolve(ROOT, '../../contracts/desktop-control-plane.v1.json'))
const BUILD_DIR = path.resolve(ROOT, '.entitlement-test-build')
if (!BUILD_DIR.startsWith(`${path.resolve(ROOT)}${path.sep}`)) throw new Error('unsafe_test_build_path')
fs.rmSync(BUILD_DIR, { recursive: true, force: true })
fs.mkdirSync(BUILD_DIR, { recursive: true })
const bundlePath = path.join(BUILD_DIR, 'policy-worker.mjs')
await esbuild.build({ entryPoints: [path.join(ROOT, 'src/index.ts')], outfile: bundlePath, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', plugins: [cloudflareWorkersTestShim] })
const policyModule = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`)
const worker = policyModule.default
const { RouteCapabilityService } = policyModule

class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = [] }
  bind(...args) { this.args = args; return this }
  async first() {
    if (this.sql.includes('FROM global_policy')) return { id: 'global', kill_switch_enabled: 0, mandatory_update_enabled: 0, minimum_supported_version: null, update_mode: 'optional', blocked_actions_json: '[]', features_json: '{}', limits_json: '{}' }
    if (this.sql.includes('FROM disabled_versions')) return null
    if (this.sql.includes('FROM users WHERE id')) return { id: this.args[0], email: `${this.args[0]}@example.test`, status: 'active', role: 'user', plan_id: 'default' }
    if (this.sql.includes('FROM users WHERE lower(email)')) return null
    if (this.sql.includes('FROM policy_overrides')) return null
    if (this.sql.includes('FROM subscriptions WHERE id')) return this.db.syntheticSubscription
    if (this.sql.includes('FROM plan_features')) return null
    return null
  }
  async all() {
    if (this.sql.includes('FROM subscriptions WHERE user_id')) return { results: [this.db.staleSubscription] }
    return { results: [] }
  }
  async run() {
    if (this.sql.includes('INSERT INTO subscriptions')) {
      this.db.subscriptionWrites += 1
      this.db.syntheticSubscription = { id: this.args[0], user_id: this.args[1], plan_id: this.args[2], status: 'active', expires_at: this.args[3] }
    }
    if (this.sql.includes('INSERT INTO route_check_capabilities')) {
      this.db.routeCapability = {
        token_hash: this.args[0],
        attempt_id: this.args[1],
        browser_secret_hash: this.args[2],
        desktop_secret_hash: this.args[3],
        expires_at: this.args[4],
        consumed_at: null,
      }
    }
    if (this.sql.includes('UPDATE route_check_capabilities SET consumed_at')) {
      const row = this.db.routeCapability
      const matches = Boolean(
        row
        && !row.consumed_at
        && Date.parse(row.expires_at) > Date.now()
        && row.token_hash === this.args[0]
        && row.attempt_id === this.args[1]
        && row.browser_secret_hash === this.args[2]
        && row.desktop_secret_hash === this.args[3]
      )
      if (matches) row.consumed_at = new Date().toISOString()
      return { success: true, meta: { changes: matches ? 1 : 0 } }
    }
    return { success: true, meta: { changes: 0 } }
  }
}

class D1Mock {
  constructor() {
    this.subscriptionWrites = 0
    this.syntheticSubscription = null
    this.staleSubscription = { id: 'stale', user_id: 'uid-test', plan_id: 'monthly', status: 'active', expires_at: '2099-01-01T00:00:00Z' }
    this.routeCapability = null
  }
  prepare(sql) { return new Statement(this, sql) }
}

const seed = Buffer.alloc(32, 7).toString('base64')
async function evaluate(entitlementState, subscriptionId = null) {
  const db = new D1Mock()
  const env = {
    DB: db,
    POLICY_SIGNING_SEED_B64: seed,
    DEFAULT_TTL_SECONDS: '120',
    AUTH_VERIFY_URL: 'https://auth.saturnws.com/session/verify',
    AUTH_SERVICE: {
      fetch: async () => Response.json({
        success: true,
        user_id: 'uid-test',
        user_email: 'uid-test@example.test',
        connection_state: 'linked',
        entitlement_state: entitlementState,
        subscription_id: subscriptionId,
        plan: subscriptionId ? 'monthly' : null,
        tier: subscriptionId ? 'public' : null,
        session_expires_at: '2099-01-01T00:00:00Z',
        expires_at: subscriptionId ? '2030-01-01T00:00:00Z' : null,
        policy: {},
      }),
    },
  }
  const request = new Request('https://api.saturnws.com/v1/policy/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-session-token' },
    body: JSON.stringify({ user_id: 'uid-test', email: 'uid-test@example.test', device_id: 'a'.repeat(32), requested_action: 'app_start' }),
  })
  const response = await worker.fetch(request, env, { waitUntil() {} })
  const body = await response.json()
  validateRuntimeOperation(CONTRACT, 'policy.check', body)
  return { status: response.status, body, db }
}

const none = await evaluate('no_subscription')
assert.equal(none.status, 200)
assert.equal(none.body.decision, 'subscription_required')
assert.equal(none.body.allow, false)
assert.equal(none.db.subscriptionWrites, 0, 'no-subscription auth must not create a paid D1 projection')

const expired = await evaluate('expired', 'sub-expired')
assert.equal(expired.body.decision, 'subscription_expired')
assert.equal(expired.body.allow, false)
assert.equal(expired.db.subscriptionWrites, 0, 'expired auth must not create an active D1 projection')

const active = await evaluate('active', 'sub-active')
assert.equal(active.body.decision, 'allow')
assert.equal(active.body.allow, true)
assert.equal(active.db.subscriptionWrites, 1)
assert.equal(active.db.syntheticSubscription.expires_at, '2030-01-01T00:00:00Z', 'policy projection must use subscription expiry, not app-session expiry')

const grace = await evaluate('grace', 'sub-grace')
assert.equal(grace.body.decision, 'allow')
assert.equal(grace.body.allow, true)
assert.equal(grace.db.subscriptionWrites, 1)

async function mintRouteCapability(entitlementState, body = {}) {
  const db = new D1Mock()
  const env = {
    DB: db,
    POLICY_SIGNING_SEED_B64: seed,
    DEFAULT_TTL_SECONDS: '120',
    AUTH_VERIFY_URL: 'https://auth.saturnws.com/session/verify',
    AUTH_SERVICE: {
      fetch: async () => Response.json({
        success: true,
        user_id: 'uid-test',
        user_email: 'uid-test@example.test',
        connection_state: 'linked',
        entitlement_state: entitlementState,
        subscription_id: entitlementState === 'active' ? 'sub-active' : null,
        plan: entitlementState === 'active' ? 'monthly' : null,
        tier: entitlementState === 'active' ? 'public' : null,
        session_expires_at: '2099-01-01T00:00:00Z',
        expires_at: entitlementState === 'active' ? '2030-01-01T00:00:00Z' : null,
        policy: {},
      }),
    },
  }
  const request = new Request('https://api.saturnws.com/v1/route-check/capability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-session-token' },
    body: JSON.stringify({
      user_id: 'uid-test',
      email: 'uid-test@example.test',
      device_id: 'a'.repeat(32),
      attempt_id: 'r'.repeat(43),
      browser_secret_hash: 'b'.repeat(64),
      desktop_secret_hash: 'd'.repeat(64),
      ...body,
    }),
  })
  const response = await worker.fetch(request, env, { waitUntil() {} })
  return { response, payload: await response.json(), db }
}

const minted = await mintRouteCapability('active')
assert.equal(minted.response.status, 200)
assert.equal(minted.payload.success, true)
assert.match(minted.payload.capability, /^[a-f0-9]{64}$/)
assert.ok(minted.payload.signature, 'route capability response must be signed')
assert.equal(minted.db.routeCapability.attempt_id, 'r'.repeat(43))
assert.equal(minted.db.routeCapability.browser_secret_hash, 'b'.repeat(64))

const deniedCapability = await mintRouteCapability('no_subscription')
assert.equal(deniedCapability.response.status, 403)
assert.equal(deniedCapability.payload.success, false)
assert.ok(deniedCapability.payload.signature, 'denied capability response must also be signed')

const service = new RouteCapabilityService(undefined, { DB: minted.db })
const exactBinding = {
  capability: minted.payload.capability,
  attempt_id: 'r'.repeat(43),
  browser_secret_hash: 'b'.repeat(64),
  desktop_secret_hash: 'd'.repeat(64),
}
assert.deepEqual(await service.consumeRouteCapability(exactBinding), { success: true })
assert.deepEqual(await service.consumeRouteCapability(exactBinding), { success: false, error: 'route_capability_rejected' }, 'capability replay must fail')

const alteredMint = await mintRouteCapability('active')
const alteredService = new RouteCapabilityService(undefined, { DB: alteredMint.db })
assert.deepEqual(
  await alteredService.consumeRouteCapability({ ...exactBinding, capability: alteredMint.payload.capability, desktop_secret_hash: 'e'.repeat(64) }),
  { success: false, error: 'route_capability_rejected' },
  'capability must remain bound to exact route hashes',
)

const expiredMint = await mintRouteCapability('active')
expiredMint.db.routeCapability.expires_at = '2000-01-01T00:00:00.000Z'
const expiredService = new RouteCapabilityService(undefined, { DB: expiredMint.db })
assert.deepEqual(
  await expiredService.consumeRouteCapability({ ...exactBinding, capability: expiredMint.payload.capability }),
  { success: false, error: 'route_capability_rejected' },
  'expired capability must fail closed',
)

const concurrentMint = await mintRouteCapability('active')
const concurrentService = new RouteCapabilityService(undefined, { DB: concurrentMint.db })
const concurrentInput = { ...exactBinding, capability: concurrentMint.payload.capability }
const concurrent = await Promise.all([
  concurrentService.consumeRouteCapability(concurrentInput),
  concurrentService.consumeRouteCapability(concurrentInput),
])
assert.equal(concurrent.filter((item) => item.success).length, 1, 'only one concurrent consume may succeed')

const oversizedRequest = new Request('https://api.saturnws.com/v1/route-check/capability', {
  method: 'POST',
  headers: { Authorization: 'Bearer test-session-token' },
  body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(5000))); controller.close() } }),
  duplex: 'half',
})
const oversizedResponse = await worker.fetch(oversizedRequest, {
  DB: new D1Mock(), POLICY_SIGNING_SEED_B64: seed, DEFAULT_TTL_SECONDS: '120', AUTH_VERIFY_URL: 'https://auth.saturnws.com/session/verify'
}, { waitUntil() {} })
assert.equal(oversizedResponse.status, 400)

fs.rmSync(BUILD_DIR, { recursive: true, force: true })
console.log('Entitlement policy checks passed.')
