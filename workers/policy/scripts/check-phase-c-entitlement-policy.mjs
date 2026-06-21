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
const bundlePath = path.join(BUILD_DIR, 'policy-worker.mjs')
await esbuild.build({ entryPoints: [path.join(ROOT, 'src/index.ts')], outfile: bundlePath, bundle: true, format: 'esm', platform: 'browser', target: 'es2022' })
const worker = (await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`)).default

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
    return { success: true }
  }
}

class D1Mock {
  constructor() {
    this.subscriptionWrites = 0
    this.syntheticSubscription = null
    this.staleSubscription = { id: 'stale', user_id: 'uid-test', plan_id: 'monthly', status: 'active', expires_at: '2099-01-01T00:00:00Z' }
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
  return { status: response.status, body: await response.json(), db }
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

fs.rmSync(BUILD_DIR, { recursive: true, force: true })
console.log('Phase C entitlement policy checks passed.')
