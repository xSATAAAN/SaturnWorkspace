import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import assert from 'node:assert/strict'
import ts from 'typescript'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const pages = read('src/new-ui/pages/production/ProductionPages.tsx')
const adminOperations = read('src/new-ui/pages/production/AdminOperations.tsx')
const api = read('src/api/admin.ts')
const adapters = read('src/new-ui/adapters/productionAdapters.ts')
const overlays = read('src/new-ui/components/ui/Overlays.tsx')
const adminResponsive = read('src/new-ui/foundation/admin-responsive.css')
const syntax = ts.createSourceFile('AdminOperations.tsx', adminOperations, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const diagnosticFunction = syntax.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === 'diagnosticTechnicalFields')
assert.ok(diagnosticFunction, 'Diagnostic context renderer must exist')
const compiledFunction = ts.transpileModule(diagnosticFunction.getText(syntax).replace(/^export\s+/, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const technicalFields = new Function(`${compiledFunction}; return diagnosticTechnicalFields;`)()
assert.deepEqual(technicalFields({ lifecycle: { phase: 'checking_data' }, auth: { warning: 'session_expired' }, extra: { attempt: 3 } }), [
  ['lifecycle.phase', 'checking_data'], ['auth.warning', 'session_expired'], ['extra.attempt', '3'],
])
const cyclic = { phase: 'ready' }
cyclic.self = cyclic
assert.deepEqual(technicalFields(cyclic), [['phase', 'ready']])
assert.ok(technicalFields(Array.from({ length: 1000 }, () => 'x')).length <= 160)
const exportSource = read('src/new-ui/pages/production/diagnosticReportExport.ts')
const exportModule = { exports: {} }
new Function('exports', ts.transpileModule(exportSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(exportModule.exports)
const { collectDiagnosticReports, formatDiagnosticReports } = exportModule.exports
const fullReport = (id) => ({ id, happened_at: '2026-10-11T12:00:00Z', error_type: 'synthetic_failure', message: 'Synthetic report', stack_trace: 'full trace\n'.repeat(1000), technical_context: { lifecycle: { phase: 'ready' } }, raw_payload: { secret: 'not-for-export' } })
const requested = []
let concurrent = 0
let peak = 0
const reader = {
  listCrashLogs: async (filters) => {
    requested.push(filters)
    return filters.cursor === '' ? { success: true, items: [1, 2, 3, 4, 5].map((id) => ({ id: String(id) })), has_more: true, next_cursor: 'older', retention_days: 90 }
      : { success: true, items: [{ id: '5' }, { id: '6' }], has_more: false, next_cursor: null, retention_days: 90 }
  },
  getCrashLog: async (id) => { concurrent++; peak = Math.max(peak, concurrent); await Promise.resolve(); concurrent--; return fullReport(id) },
}
const progress = []
const collected = await collectDiagnosticReports(reader, { user: 'synthetic@example.invalid', classification: 'warning' }, new AbortController().signal, (count) => progress.push(count))
assert.deepEqual(collected.map((report) => report.id), ['1', '2', '3', '4', '5', '6'])
assert.deepEqual(progress, [4, 5, 6])
assert.equal(peak, 4)
assert.ok(requested.every((filters) => filters.user === 'synthetic@example.invalid' && filters.classification === 'warning' && filters.limit === 200))
const exported = JSON.parse(formatDiagnosticReports(collected, requested[0]))
assert.equal(exported.report_count, 6)
assert.equal(exported.reports[0].stack_trace, fullReport('1').stack_trace)
assert.deepEqual(exported.reports[0].technical_context, fullReport('1').technical_context)
assert.ok(!JSON.stringify(exported).includes('not-for-export'))
assert.ok(!('cursor' in exported.filters))
await assert.rejects(collectDiagnosticReports({ ...reader, getCrashLog: async () => { throw new Error('synthetic_read_failed') } }, {}, new AbortController().signal, () => {}), /synthetic_read_failed/)
await assert.rejects(collectDiagnosticReports({ ...reader, listCrashLogs: async () => ({ success: true, items: [], has_more: true, next_cursor: 'repeated' }) }, {}, new AbortController().signal, () => {}), /cursor_invalid/)
await assert.rejects(collectDiagnosticReports({ ...reader, getCrashLog: async () => fullReport('wrong') }, {}, new AbortController().signal, () => {}), /mismatch/)
const cancelled = new AbortController()
cancelled.abort()
await assert.rejects(collectDiagnosticReports(reader, {}, cancelled.signal, () => {}), { name: 'AbortError' })
const duringRead = new AbortController()
await assert.rejects(collectDiagnosticReports({ ...reader, getCrashLog: async (id) => { duringRead.abort(); return fullReport(id) } }, {}, duringRead.signal, () => assert.fail('Cancelled work must not publish progress')), { name: 'AbortError' })
console.log('PASS Full diagnostic collection: pagination, detail, bounded concurrency, filters, cancellation, failures and safe export')
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
  ['Diagnostics uses manual refresh only', !diagnostics.includes('10000')],
  ['Diagnostics copies full detail across every matching page', diagnostics.includes('collectDiagnosticReports(admin, filters') && diagnostics.includes('formatDiagnosticReports([details.data!]')],
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
