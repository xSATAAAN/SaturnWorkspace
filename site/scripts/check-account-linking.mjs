import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const PLATFORM = path.resolve(ROOT, '..')
const read = (relative) => fs.readFileSync(path.join(PLATFORM, relative), 'utf8')
const includes = (source, token, label) => {
  if (!source.includes(token)) throw new Error(`${label}: missing ${token}`)
}
const excludes = (source, token, label) => {
  if (source.includes(token)) throw new Error(`${label}: forbidden ${token}`)
}

const contract = JSON.parse(read('contracts/desktop-control-plane.v1.json'))
const authWorker = read('workers/auth/src/index.ts')
const authStore = read('workers/auth/src/lib/supabase.ts')
const policyWorker = read('workers/policy/src/index.ts')
const accountApi = read('site/src/api/account.ts')
const adapters = read('site/src/new-ui/adapters/productionAdapters.ts')
const pages = read('site/src/new-ui/pages/production/ProductionPages.tsx')

if (contract?.product_invariants?.account_connection_is_separate_from_entitlement !== true) {
  throw new Error('contract must keep account connection separate from entitlement')
}
if (contract?.product_invariants?.linked_without_subscription_is_valid !== true) {
  throw new Error('contract must allow a linked account without a subscription')
}
for (const operation of ['auth.device_poll_authorized', 'auth.session_verify', 'policy.check']) {
  if (!contract?.[operation.split('.')[0]]?.operations?.[operation.split('.')[1]]) {
    throw new Error(`contract operation missing: ${operation}`)
  }
}

includes(authWorker, 'entitlement_state: entitlementState', 'auth entitlement projection')
includes(authWorker, 'connection_state: "linked"', 'auth connection projection')
includes(authWorker, 'device_code_already_used', 'auth device replay protection')
includes(authWorker, 'handleSessionRefresh', 'auth session refresh route')
includes(authWorker, 'handleAccountSessions', 'auth account sessions endpoint')
includes(authStore, 'status=eq.pending', 'atomic device authorization')
includes(authStore, 'status=eq.authorized&consumed_at=is.null', 'atomic device consume claim')
includes(authStore, 'user_id=eq.${encodeURIComponent(firebaseUserId)}', 'session ownership filter')
excludes(authWorker, 'await revokeActiveAppSessionsForSubscription', 'multiple-device preservation')

includes(policyWorker, '| "subscription_required"', 'policy no-subscription decision')
includes(policyWorker, 'entitlementState === "no_subscription"', 'policy no-subscription gate')
includes(policyWorker, 'normalizeText(auth.subscription_id)', 'policy paid projection guard')
includes(accountApi, '/account/sessions/revoke-all', 'account sessions API')
includes(adapters, 'async revokeAllSessions()', 'account sessions adapter')
includes(pages, 'function PortalDevices()', 'portal devices page')
excludes(pages, '<Alert title={t(\'currentDevice\')} tone="info">{t(\'noSessions\')}</Alert>', 'legacy devices shell')

for (const state of ['unknown', 'no_subscription', 'active', 'trial', 'grace', 'expired', 'suspended', 'lifetime']) {
  includes(authWorker, `"${state}"`, `entitlement state ${state}`)
}
for (const source of [authWorker, authStore, policyWorker, accountApi, adapters, pages]) {
  excludes(source, 'console.log(session_token', 'session token logging')
}

console.log('Cross-layer account linking contract checks passed.')
