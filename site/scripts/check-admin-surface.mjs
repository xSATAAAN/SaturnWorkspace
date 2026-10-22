import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import assert from 'node:assert/strict'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

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
const windowFunction = syntax.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === 'DiagnosticEventWindow')
assert.ok(windowFunction, 'Diagnostic event timeline must exist')
const windowCode = ts.transpileModule(windowFunction.getText(syntax), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
let timelineLocale = 'en'
const Timeline = new Function('React', 'useExperience', 'copy', 'diagnosticTechnicalFields', `${windowCode}; return DiagnosticEventWindow;`)(React, () => ({ locale: timelineLocale }), (locale, en, ar) => locale === 'ar' ? ar : en, technicalFields)
const timelineEvents = Array.from({ length: 96 }, (_, index) => ({ event: `api.event${index}`, sequence: index + 1, at_unix_ms: 1791800000000, facts: { method: 'synthetic_method', success: false } }))
const timeline = renderToStaticMarkup(React.createElement(Timeline, { title: 'Before failure', value: { complete: false, omitted_events: 5, events: timelineEvents } }))
assert.equal((timeline.match(/<li>/g) || []).length, 96)
assert.match(timeline, /api.event95/)
assert.match(timeline, /omitted_events/)
assert.match(timeline, /<summary>/)
timelineLocale = 'ar'
assert.match(renderToStaticMarkup(React.createElement(Timeline, { title: 'After failure', value: null })), /لم تُسجّل أحداث لهذه الفترة/)
console.log('PASS Diagnostic event timeline: ordered events, complete bounded window, coverage and Arabic empty state')
const exportSource = read('src/new-ui/pages/production/diagnosticReportExport.ts')
const exportModule = { exports: {} }
new Function('exports', ts.transpileModule(exportSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(exportModule.exports)
const { collectDiagnosticReports, createDiagnosticBundle, formatDiagnosticReports, DIAGNOSTIC_BUNDLE_LIMITS } = exportModule.exports
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
const record = (id, signature = 'repeated', version = '1.2.10') => ({ ...fullReport(String(id)), fingerprint: signature, app_version: version, component: 'desktop-app', occurrence_count: 3, stack_trace: '', classification: 'error' })
const records = Array.from({ length: 2400 }, (_, index) => record(index, `signature-${index % 3}`))
const boundedCalls = []
const detailCalls = []
let bundleConcurrent = 0
let bundlePeak = 0
const bundleReader = {
  listCrashLogs: async (filters, signal) => {
    assert.ok(signal instanceof AbortSignal)
    boundedCalls.push(filters)
    const offset = Number(filters.cursor || 0)
    return { success: true, items: records.slice(offset, offset + filters.limit), has_more: offset + filters.limit < records.length, next_cursor: String(offset + filters.limit), retention_days: 90 }
  },
  getCrashLog: async (id, signal) => {
    assert.ok(signal instanceof AbortSignal)
    detailCalls.push(id); bundleConcurrent++; bundlePeak = Math.max(bundlePeak, bundleConcurrent)
    await Promise.resolve(); bundleConcurrent--
    return { ...records.find((item) => item.id === id), stack_trace: fullReport(id).stack_trace }
  },
}
const bundleProgress = []
const bundleText = await createDiagnosticBundle(bundleReader, { user: 'synthetic@example.invalid', classification: 'error', cursor: 'ignored', limit: 1 }, new AbortController().signal, (count, stage) => bundleProgress.push([count, stage]))
const bundle = JSON.parse(bundleText)
assert.equal(bundle.format, 'saturnws.diagnostic-bundle.v1')
assert.equal(bundle.coverage.scanned_records, 1000)
assert.equal(bundle.coverage.scanned_occurrences, 3000)
assert.equal(bundle.coverage.signature_count, 3)
assert.equal(bundle.coverage.included_examples, 3)
assert.equal(bundle.coverage.omitted_examples, 0)
assert.equal(bundle.coverage.has_more, true)
assert.equal(bundle.coverage.counts_scope, 'scanned_records_only')
assert.equal(bundle.coverage.snapshot, 'cursor_walk_not_atomic')
assert.equal(bundle.coverage.retention_days, 90)
assert.equal(boundedCalls.length, 5)
assert.equal(detailCalls.length, 3)
assert.ok(bundlePeak <= 4)
assert.ok(boundedCalls.every((filters) => filters.user === 'synthetic@example.invalid' && filters.classification === 'error' && filters.limit === 200))
assert.deepEqual(bundleProgress.slice(0, 5).map(([count]) => count), [200, 400, 600, 800, 1000])
assert.equal(bundleProgress.at(-1)[1], 'examples')
assert.equal(bundle.examples[0].stack_trace, fullReport('0').stack_trace)
assert.ok(!bundleText.includes('not-for-export'))
assert.ok(!('cursor' in bundle.filters) && !('limit' in bundle.filters))
assert.equal(bundle.signatures.reduce((total, item) => total + item.record_count, 0), 1000)
assert.equal(bundle.signatures.reduce((total, item) => total + item.occurrence_count, 0), 3000)
assert.ok(bundle.coverage.oldest_record_at && bundle.coverage.newest_record_at && bundle.coverage.scan_started_at && bundle.coverage.scan_completed_at)

const manySignatures = Array.from({ length: 1000 }, (_, index) => ({ ...record(index, `signature-${index}`), message: 'synthetic '.repeat(300), context: 'context '.repeat(120) }))
let manyDetailCalls = 0
let manyConcurrent = 0
let manyPeak = 0
const manyReader = {
  listCrashLogs: async (filters) => { const offset = Number(filters.cursor || 0); return { success: true, items: manySignatures.slice(offset, offset + 200), has_more: offset + 200 < manySignatures.length, next_cursor: String(offset + 200), retention_days: 90 } },
  getCrashLog: async (id) => {
    manyDetailCalls++; manyConcurrent++; manyPeak = Math.max(manyPeak, manyConcurrent)
    await Promise.resolve(); manyConcurrent--
    return { ...manySignatures.find((item) => item.id === id), stack_trace: 'synthetic trace\n'.repeat(10000), technical_context: { unicode: 'تشخيص '.repeat(1000) } }
  },
}
const manyText = await createDiagnosticBundle(manyReader, {}, new AbortController().signal, () => {})
const many = JSON.parse(manyText)
assert.ok(Buffer.byteLength(manyText, 'utf8') <= DIAGNOSTIC_BUNDLE_LIMITS.bytes)
assert.equal(many.coverage.signature_count, 1000)
assert.equal(many.coverage.requested_examples, 40)
assert.equal(manyDetailCalls, 40)
assert.equal(manyPeak, 4)
assert.equal(many.coverage.has_more, false)
assert.equal(many.coverage.included_examples + many.coverage.omitted_examples, 1000)
assert.equal(many.coverage.included_signatures + many.coverage.omitted_signatures, 1000)
assert.equal(many.coverage.examples_omitted_by_byte_limit, 40 - many.examples.length)
assert.ok(many.coverage.omitted_signatures > 0 && many.coverage.examples_omitted_by_byte_limit > 0)
assert.ok(many.examples.length > 0)
assert.ok(many.examples.every((item) => item.stack_trace === 'synthetic trace\n'.repeat(10000)))
assert.ok(many.signatures.every((item) => item.message_preview.length <= 320 && item.message_preview_truncated && !('signature' in item)))

const splitRecords = [record('v1', 'same', '1.2.9'), record('v2', 'same', '1.2.10'), { ...record('source', 'same'), component: 'launcher' }, { ...record('fallback-a'), fingerprint: null, message: 'first' }, { ...record('fallback-b'), fingerprint: null, message: 'second' }]
const splitReader = { listCrashLogs: async () => ({ success: true, items: splitRecords, has_more: false, next_cursor: null, retention_days: 90 }), getCrashLog: async (id) => splitRecords.find((item) => item.id === id) }
const split = JSON.parse(await createDiagnosticBundle(splitReader, {}, new AbortController().signal, () => {}))
assert.equal(split.coverage.signature_count, 5)
assert.equal(split.examples.length, 5)
const duplicates = JSON.parse(await createDiagnosticBundle({ ...splitReader, listCrashLogs: async () => ({ success: true, items: [splitRecords[0], splitRecords[0]], has_more: false, next_cursor: null, retention_days: 90 }) }, {}, new AbortController().signal, () => {}))
assert.equal(duplicates.coverage.scanned_records, 1)
assert.equal(duplicates.coverage.scanned_occurrences, 3)
const recentRecords = [
  { ...record('older'), happened_at: '2026-10-01T12:00:00Z', first_happened_at: '2026-09-30T12:00:00Z', last_happened_at: '2026-10-02T12:00:00Z' },
  { ...record('newer'), happened_at: '2026-10-03T12:00:00Z', last_happened_at: '2026-10-04T12:00:00Z' },
]
const recent = JSON.parse(await createDiagnosticBundle({ listCrashLogs: async () => ({ success: true, items: recentRecords, has_more: false, next_cursor: null, retention_days: 90 }), getCrashLog: async (id) => recentRecords.find((item) => item.id === id) }, {}, new AbortController().signal, () => {}))
assert.equal(recent.examples[0].id, 'newer')
assert.equal(recent.coverage.oldest_record_at, '2026-10-01T12:00:00Z')
assert.equal(recent.coverage.newest_record_at, '2026-10-03T12:00:00Z')
assert.equal(recent.signatures[0].first_happened_at, '2026-09-30T12:00:00Z')
assert.equal(recent.signatures[0].last_happened_at, '2026-10-04T12:00:00Z')

for (const collect of [collectDiagnosticReports, createDiagnosticBundle]) {
  await assert.rejects(collect({ ...bundleReader, listCrashLogs: async () => ({ success: false, items: [], has_more: false, next_cursor: null }) }, {}, new AbortController().signal, () => {}), /export_failed/)
  await assert.rejects(collect({ ...bundleReader, listCrashLogs: async () => ({ success: true, items: [], has_more: true, next_cursor: null }) }, {}, new AbortController().signal, () => {}), /cursor_invalid/)
  await assert.rejects(collect({ ...bundleReader, listCrashLogs: async () => ({ success: true, items: [], has_more: true, next_cursor: 'same' }) }, {}, new AbortController().signal, () => {}), /cursor_invalid/)
  await assert.rejects(collect({ ...splitReader, getCrashLog: async () => { throw new Error('synthetic_detail_failure') } }, {}, new AbortController().signal, () => {}), /detail_failure/)
  await assert.rejects(collect({ ...splitReader, getCrashLog: async () => record('wrong') }, {}, new AbortController().signal, () => {}), /mismatch/)
  let underlyingSignal
  const cancelledPending = new AbortController()
  const pending = collect({ ...bundleReader, listCrashLogs: (_, signal) => { underlyingSignal = signal; return new Promise(() => {}) } }, {}, cancelledPending.signal, () => assert.fail('Cancelled read must not publish progress'))
  cancelledPending.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(underlyingSignal.aborted, true)
  let deadlineSignal
  await assert.rejects(collect({ ...bundleReader, listCrashLogs: (_, signal) => { deadlineSignal = signal; return new Promise(() => {}) } }, {}, new AbortController().signal, () => assert.fail('Timed-out read must not publish progress'), { deadlineMs: 5 }), { name: 'TimeoutError' })
  assert.equal(deadlineSignal.aborted, true)
  const cancelledDetail = new AbortController()
  let detailSignal
  const detailPending = collect({ ...splitReader, getCrashLog: (_, signal) => { detailSignal = signal; cancelledDetail.abort(); return new Promise(() => {}) } }, {}, cancelledDetail.signal, () => {})
  await assert.rejects(detailPending, { name: 'AbortError' })
  assert.equal(detailSignal.aborted, true)
}
await assert.rejects(createDiagnosticBundle({ ...splitReader, getCrashLog: async (id) => ({ ...splitRecords.find((item) => item.id === id), app_version: 'changed' }) }, {}, new AbortController().signal, () => {}), /mismatch/)
const empty = JSON.parse(await createDiagnosticBundle({ ...bundleReader, listCrashLogs: async () => ({ success: true, items: [], has_more: false, next_cursor: null, retention_days: 90 }) }, {}, new AbortController().signal, () => {}))
assert.equal(empty.coverage.scanned_records, 0)
assert.equal(empty.examples.length, 0)
assert.equal(empty.coverage.oldest_record_at, null)
console.log('PASS Bounded diagnostic bundle: large histories, signatures, complete samples, byte coverage, real cancellation and deadlines')
const apiSyntax = ts.createSourceFile('admin.ts', api, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const apiFunctionNames = ['adminBaseUrl', 'compactAdminError', 'adminFetch', 'diagnosticQuery', 'fetchCrashLogs', 'fetchCrashLog']
const diagnosticHttpSource = apiSyntax.statements.filter((item) => ts.isFunctionDeclaration(item) && apiFunctionNames.includes(item.name?.text)).map((item) => item.getText(apiSyntax).replace(/^export\s+/, '')).join('\n')
const compiledHttp = ts.transpileModule(diagnosticHttpSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
let httpMode = 'list'
let actualHttpSignal
const diagnosticHttp = new Function('fetch', 'getAdminToken', 'ApiError', `${compiledHttp}; return { fetchCrashLogs, fetchCrashLog };`)(async (url, init) => {
  actualHttpSignal = init.signal
  assert.equal(init.credentials, 'same-origin')
  assert.ok(!init.headers.has('Authorization'))
  if (httpMode === 'pending' || (httpMode === 'detail-pending' && url.includes('/crash-logs/'))) return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
  const payload = httpMode === 'list' || httpMode === 'detail-pending'
    ? { success: true, items: httpMode === 'detail-pending' ? [fullReport('encoded/id')] : [], has_more: false, next_cursor: null, retention_days: 90 }
    : { success: true, item: fullReport('encoded/id') }
  assert.ok(url.startsWith('/api/admin/crash-logs'))
  return { ok: true, status: 200, text: async () => JSON.stringify(payload) }
}, () => '', Error)
const httpController = new AbortController()
await diagnosticHttp.fetchCrashLogs({ user: 'synthetic@example.invalid' }, httpController.signal)
assert.equal(actualHttpSignal, httpController.signal)
httpMode = 'detail'
assert.equal((await diagnosticHttp.fetchCrashLog('encoded/id', httpController.signal)).item.id, 'encoded/id')
assert.equal(actualHttpSignal, httpController.signal)
httpMode = 'pending'
await assert.rejects(createDiagnosticBundle({ listCrashLogs: diagnosticHttp.fetchCrashLogs, getCrashLog: async (id, signal) => (await diagnosticHttp.fetchCrashLog(id, signal)).item }, {}, new AbortController().signal, () => {}, { deadlineMs: 5 }), { name: 'TimeoutError' })
assert.equal(actualHttpSignal.aborted, true)
httpMode = 'detail-pending'
await assert.rejects(createDiagnosticBundle({ listCrashLogs: diagnosticHttp.fetchCrashLogs, getCrashLog: async (id, signal) => (await diagnosticHttp.fetchCrashLog(id, signal)).item }, {}, new AbortController().signal, () => {}, { deadlineMs: 5 }), { name: 'TimeoutError' })
assert.equal(actualHttpSignal.aborted, true)
console.log('PASS Diagnostic HTTP cancellation: actual list/detail API helpers forward the deadline signal into fetch')
const section = (start, end) => adminOperations.slice(adminOperations.indexOf(start), adminOperations.indexOf(end))
const manualGrant = section('function ManualGrantDrawer', 'function AdminOperationDialog')
const userDetail = section('function UserDetailDrawer', 'function SubscriptionRecoveryDrawer')
const recovery = section('function SubscriptionRecoveryDrawer', 'export function AdminSubscriptions')
const diagnostics = section('export function AdminDiagnostics', 'export function AdminAudit')
const policies = section('export function AdminPolicies', 'function safeJsonCount')
const adminReleasesStart = adapters.indexOf('async listReleases(')
const adminReleasesAdapter = adapters.slice(adminReleasesStart, adapters.indexOf('async uploadRelease(', adminReleasesStart))

const checks = [
  ['Admin user page is routed', pages.includes("page === 'users' ? <AdminUsers")],
  ['Admin subscription page is routed', pages.includes("page === 'subscriptions' ? <AdminSubscriptions")],
  ['Readiness route is real', pages.includes("page === 'readiness' ? <AdminReadiness")],
  ['Settings route is real', pages.includes("page === 'settings' ? <AdminSettings")],
  ['Policy route uses the structured admin page', pages.includes("page === 'policies' ? <AdminPolicies")],
  ['Android beta access has a dedicated policy control', policies.includes('android_beta_access') && policies.includes('Allow Saturn Android Beta to run')],
  ['Global policy updates preserve existing structured policy fields', policies.includes('blocked_actions: blockedActions') && policies.includes('safeJsonObject(global?.features_json)') && policies.includes('safeJsonObject(global?.limits_json)')],
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
  ['Diagnostics defaults to a bounded problem summary', diagnostics.includes('createDiagnosticBundle(admin, filters') && diagnostics.includes('Copy problem summary') && diagnostics.includes('Copy all matching reports (slower)')],
  ['Diagnostic reads forward cancellation into HTTP', api.includes('params: AdminDiagnosticFilters = {}, signal?: AbortSignal') && api.includes('encodeURIComponent(id)}`, { signal })') && adapters.includes('fetchCrashLogs(filters, signal)') && adapters.includes('fetchCrashLog(id, signal)')],
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
