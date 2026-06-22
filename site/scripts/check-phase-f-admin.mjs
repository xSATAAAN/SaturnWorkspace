import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const pages = read('src/new-ui/pages/production/ProductionPages.tsx')
const phaseF = read('src/new-ui/pages/production/AdminPhaseF.tsx')
const api = read('src/api/admin.ts')
const section = (start, end) => phaseF.slice(phaseF.indexOf(start), phaseF.indexOf(end))
const manualGrant = section('function ManualGrantDrawer', 'function AdminOperationDialog')
const userDetail = section('function UserDetailDrawer', 'function SubscriptionRecoveryDrawer')
const recovery = section('function SubscriptionRecoveryDrawer', 'export function AdminSubscriptionsPhaseF')
const diagnostics = section('export function AdminDiagnosticsPhaseF', 'export function AdminAuditPhaseF')

const checks = [
  ['Phase F user page is routed', pages.includes("page === 'users' ? <AdminUsersPhaseF")],
  ['Phase F subscription page is routed', pages.includes("page === 'subscriptions' ? <AdminSubscriptionsPhaseF")],
  ['Readiness route is real', pages.includes("page === 'readiness' ? <AdminReadinessPhaseF")],
  ['Settings route is real', pages.includes("page === 'settings' ? <AdminSettingsPhaseF")],
  ['Policy route uses structured Phase F page', pages.includes("page === 'policies' ? <AdminPoliciesPhaseF")],
  ['Manual grant uses a user picker', manualGrant.includes('Search by name or email')],
  ['Manual grant does not expose Firebase UID input', !manualGrant.includes('Firebase UID')],
  ['Recovery is not a normal grant action', !manualGrant.includes('restore_remaining_time')],
  ['Recovery requires ledger evidence', recovery.includes('recovery_evidence_id') && userDetail.includes('recovery_evidence')],
  ['User detail exposes safe session revocation', userDetail.includes('scope: "session"') && userDetail.includes('scope: "device"')],
  ['User detail includes support and access requests', userDetail.includes('support_threads') && userDetail.includes('login_requests')],
  ['Crash group state is operational', diagnostics.includes('updateCrashGroupState') && diagnostics.includes('CrashGroupStateDialog')],
  ['Tamper resolution requires an explicit note', diagnostics.includes('TamperResolveDialog') && diagnostics.includes('reason.trim().length < 3')],
  ['Explicit subscription transition endpoints exist', api.includes('/transition/preview') && api.includes('/transition/execute')],
  ['Explicit account lifecycle endpoints exist', api.includes('/lifecycle/preview') && api.includes('/lifecycle/execute')],
  ['Release publication has a review step', pages.includes('Confirm release publication')],
  ['Primary Phase F pages contain no raw JSON dump', !phaseF.includes('<pre') && !phaseF.includes('JSON.stringify(')],
]

const failed = checks.filter(([, passed]) => !passed)
for (const [label, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`)
if (failed.length) process.exit(1)
