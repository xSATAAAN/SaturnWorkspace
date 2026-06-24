import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const PLATFORM = path.resolve(ROOT, '..')
const desktopCandidates = [
  process.env.SATURNWS_DESKTOP_APP_ROOT,
  path.resolve(PLATFORM, '..', 'desktop-app'),
  path.resolve(PLATFORM, '..', '..', 'desktop-app'),
].filter(Boolean)
const DESKTOP = desktopCandidates.find((candidate) => fs.existsSync(path.join(candidate, 'src/backend/security/device_auth.py')))
if (!DESKTOP) throw new Error('desktop_app_root_not_found')
const read = (root, relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const includes = (source, token, label) => { if (!source.includes(token)) throw new Error(`${label}: missing ${token}`) }
const excludes = (source, token, label) => { if (source.includes(token)) throw new Error(`${label}: forbidden ${token}`) }

const dashboard = read(PLATFORM, 'docs/product-readiness-system-completion/product-completion-dashboard.md')
const issues = read(PLATFORM, 'docs/product-readiness-system-completion/issues-and-phases.md')
const matrix = read(PLATFORM, 'docs/product-readiness-system-completion/feature-completeness-matrix.md')
const acceptance = read(PLATFORM, 'docs/product-readiness-system-completion/acceptance-test-plan.md')
includes(dashboard, 'C - Account and Desktop Linking', 'dashboard Phase C row')
includes(dashboard, 'COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE', 'dashboard Phase C/B closure status')
if (!dashboard.includes('PHASE_G_IMPLEMENTATION_COMPLETE_WITH_EXPLICIT_OPERATIONAL_CONFIGURATION_ITEMS') && !dashboard.includes('PHASE_G_PRE_ACCEPTANCE_COMPLETION_ACTIVE')) {
  throw new Error('dashboard Phase G implementation state: missing accepted Phase G state')
}
includes(issues, 'Phase C', 'issues Phase C section')
includes(matrix, 'Desktop linking', 'matrix Desktop linking row')
includes(acceptance, 'Phase C', 'acceptance Phase C coverage')

const authWorker = read(PLATFORM, 'workers/auth/src/index.ts')
const authStore = read(PLATFORM, 'workers/auth/src/lib/supabase.ts')
const policyWorker = read(PLATFORM, 'workers/policy/src/index.ts')
const accountApi = read(PLATFORM, 'site/src/api/account.ts')
const adapters = read(PLATFORM, 'site/src/new-ui/adapters/productionAdapters.ts')
const pages = read(PLATFORM, 'site/src/new-ui/pages/production/ProductionPages.tsx')
const deviceAuth = read(DESKTOP, 'src/backend/security/device_auth.py')
const bridge = read(DESKTOP, 'src/backend/api_bridge/auth_policy_bridge.py')
const desktopApi = read(DESKTOP, 'src/frontend/src/lib/api.ts')
const desktopApp = read(DESKTOP, 'src/frontend/src/App.tsx')

includes(authWorker, 'entitlement_state: entitlementState', 'auth entitlement projection')
includes(authWorker, 'connection_state: "linked"', 'auth connection projection')
includes(authWorker, 'device_code_already_used', 'device replay protection')
includes(authWorker, 'handleSessionRefresh', 'session refresh route')
includes(authWorker, 'handleAccountSessions', 'account sessions endpoint')
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

for (const state of ['signed_out', 'link_pending', 'linked', 'session_expired', 'revoked', 'offline', 'error']) includes(deviceAuth, `"${state}"`, `desktop connection state ${state}`)
for (const state of ['unknown', 'no_subscription', 'active', 'trial', 'grace', 'expired', 'suspended', 'lifetime']) includes(authWorker, `"${state}"`, `entitlement state ${state}`)
includes(deviceAuth, 'def begin_account_switch', 'desktop account switching')
includes(deviceAuth, '"/session/refresh"', 'desktop session refresh')
includes(bridge, 'def begin_account_switch', 'desktop account switch bridge')
includes(desktopApi, 'begin_account_switch', 'desktop frontend API')
includes(desktopApp, 'handleAccountSwitch', 'desktop account switch UI')

for (const source of [authWorker, authStore, policyWorker, accountApi, adapters, pages, deviceAuth, bridge, desktopApi, desktopApp]) {
  excludes(source, 'console.log(session_token', 'session token logging')
  excludes(source, 'print(session_token', 'session token printing')
}

console.log('Phase C cross-layer account linking contract checks passed.')
