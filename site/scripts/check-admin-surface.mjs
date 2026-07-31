import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const pages = read('src/new-ui/pages/production/ProductionPages.tsx')
const adminOperations = read('src/new-ui/pages/production/AdminOperations.tsx')
const api = read('src/api/admin.ts')
const adapters = read('src/new-ui/adapters/productionAdapters.ts')
const overlays = read('src/new-ui/components/ui/Overlays.tsx')
const adminResponsive = read('src/new-ui/foundation/admin-responsive.css')
const section = (start, end) => adminOperations.slice(adminOperations.indexOf(start), adminOperations.indexOf(end))
const manualGrant = section('function ManualGrantDrawer', 'function AdminOperationDialog')
const userDetail = section('function UserDetailDrawer', 'function SubscriptionRecoveryDrawer')
const recovery = section('function SubscriptionRecoveryDrawer', 'export function AdminSubscriptions')
const diagnostics = section('export function AdminDiagnostics', 'export function AdminAudit')
const adminReleasesStart = adapters.indexOf('async listReleases(')
const adminReleasesAdapter = adapters.slice(adminReleasesStart, adapters.indexOf('async uploadRelease(', adminReleasesStart))

const checks = [
  ['Admin user page is routed', pages.includes("page === 'users' ? <AdminUsers")],
  ['Admin subscription page is routed', pages.includes("page === 'subscriptions' ? <AdminSubscriptions")],
  ['Readiness route is real', pages.includes("page === 'readiness' ? <AdminReadiness")],
  ['Settings route is real', pages.includes("page === 'settings' ? <AdminSettings")],
  ['Policy route uses the structured admin page', pages.includes("page === 'policies' ? <AdminPolicies")],
  ['Manual grant uses a user picker', manualGrant.includes('Search by name or email')],
  ['Manual grant does not expose Firebase UID input', !manualGrant.includes('Firebase UID')],
  ['Manual grant does not invent a reason note', manualGrant.includes('reason: note.trim()') && !manualGrant.includes('reason: note || reasonCode')],
  ['Recovery is not a normal grant action', !manualGrant.includes('restore_remaining_time')],
  ['Recovery requires ledger evidence', recovery.includes('recovery_evidence_id') && userDetail.includes('recovery_evidence')],
  ['User detail exposes safe session revocation', userDetail.includes('scope: "session"') && userDetail.includes('scope: "all"') && !userDetail.includes('row.hwid')],
  ['User detail includes support and access requests', userDetail.includes('support_threads') && userDetail.includes('login_requests')],
  ['Crash group state is operational', diagnostics.includes('updateCrashGroupState') && diagnostics.includes('CrashGroupStateDialog')],
  ['Tamper resolution requires an explicit note', diagnostics.includes('TamperResolveDialog') && diagnostics.includes('reason.trim().length < 3')],
  ['Explicit subscription transition endpoints exist', api.includes('/transition/preview') && api.includes('/transition/execute')],
  ['Explicit account lifecycle endpoints exist', api.includes('/lifecycle/preview') && api.includes('/lifecycle/execute')],
  ['Release publication has a review step', pages.includes('Confirm release publication')],
  ['Admin release list uses an admin endpoint contract', adminReleasesAdapter.includes('fetchRemoteControls(channel)') && !adminReleasesAdapter.includes('productionAdapters.releases.getLatest')],
  ['Admin release page does not call customer protected release catalog', !pages.slice(pages.indexOf('function AdminReleases'), pages.indexOf('function AdminSupportV2')).includes('adapters.releases.getLatest')],
  ['Origin errors are mapped before rendering', pages.includes('userFacingErrorMessage') && pages.includes('origin_not_allowed') && pages.includes('forbidden_origin')],
  ['Overlays render at the viewport root', overlays.includes("createPortal") && overlays.includes('document.body')],
  ['Admin density is explicit and drawers keep actions visible', adminResponsive.includes('font-size: 13px') && adminResponsive.includes('width: min(420px, 100vw)') && adminResponsive.includes('overflow-y: auto')],
  [
    'Primary admin pages contain no raw JSON dump',
    !adminOperations.includes('JSON.stringify(') && !adminOperations.includes('<pre>{JSON'),
  ],
]

const failed = checks.filter(([, passed]) => !passed)
for (const [label, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`)
if (failed.length) process.exit(1)
