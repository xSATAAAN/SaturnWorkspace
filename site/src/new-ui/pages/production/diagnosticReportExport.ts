import type { AdminCrashLog, AdminDiagnosticFilters, AdminDiagnosticPage } from '../../../api/admin'

type DiagnosticReader = {
  listCrashLogs: (filters: AdminDiagnosticFilters, signal?: AbortSignal) => Promise<AdminDiagnosticPage>
  getCrashLog: (id: string, signal?: AbortSignal) => Promise<AdminCrashLog>
}

export type DiagnosticProgress = (count: number, stage?: 'records' | 'examples') => void

export const DIAGNOSTIC_BUNDLE_LIMITS = {
  records: 1000, examples: 40, concurrency: 4, bytes: 512 * 1024, deadlineMs: 45000,
} as const

function checkActive(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError')
}

async function withDeadline<T>(signal: AbortSignal, deadlineMs: number, work: (active: AbortSignal) => Promise<T>): Promise<T> {
  checkActive(signal)
  const controller = new AbortController()
  const cancel = () => controller.abort(signal.reason)
  signal.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Diagnostic collection deadline exceeded', 'TimeoutError')), deadlineMs)
  let rejectAbort: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason)
    controller.signal.addEventListener('abort', rejectAbort, { once: true })
  })
  try {
    return await Promise.race([work(controller.signal), aborted])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
    if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort)
    controller.abort()
  }
}

export function collectDiagnosticReports(
  reader: DiagnosticReader,
  filters: AdminDiagnosticFilters,
  signal: AbortSignal,
  onProgress: DiagnosticProgress,
  options: { deadlineMs?: number } = {},
): Promise<AdminCrashLog[]> {
  return withDeadline(signal, options.deadlineMs ?? 120000, (active) => collectAllReports(reader, filters, active, onProgress))
}

async function collectAllReports(reader: DiagnosticReader, filters: AdminDiagnosticFilters, signal: AbortSignal, onProgress: DiagnosticProgress): Promise<AdminCrashLog[]> {
  const reports: AdminCrashLog[] = []
  const ids = new Set<string>()
  const cursors = new Set<string>()
  let cursor = ''
  do {
    checkActive(signal)
    const page = await reader.listCrashLogs({ ...filters, cursor, limit: 200 }, signal)
    checkActive(signal)
    if (!page.success) throw new Error('diagnostic_export_failed')
    const summaries = page.items.filter((report) => {
      if (ids.has(report.id)) return false
      ids.add(report.id)
      return true
    })
    for (let start = 0; start < summaries.length; start += 4) {
      checkActive(signal)
      const batch = await Promise.all(summaries.slice(start, start + 4).map(async (summary) => {
        checkActive(signal)
        const detail = await reader.getCrashLog(summary.id, signal)
        if (detail.id !== summary.id) throw new Error('diagnostic_export_mismatch')
        return detail
      }))
      checkActive(signal)
      reports.push(...batch)
      onProgress(reports.length)
    }
    if (!page.has_more) return reports
    if (!page.next_cursor || cursors.has(page.next_cursor)) throw new Error('diagnostic_export_cursor_invalid')
    cursor = page.next_cursor
    cursors.add(cursor)
  } while (cursor)
  return reports
}

function safeReport(report: AdminCrashLog) {
  // Share only the sanitized detail fields; exclude legacy raw_payload.
  return {
    id: report.id, event_id: report.event_id, happened_at: report.happened_at,
    first_happened_at: report.first_happened_at, last_happened_at: report.last_happened_at,
    occurrence_count: report.occurrence_count || 1, error_type: report.error_type,
    message: report.message, stack_trace: report.stack_trace, classification: report.classification,
    component: report.component, context: report.context, severity: report.severity,
    app_version: report.app_version, tool_channel: report.tool_channel,
    attribution: report.attribution, operator: report.operator,
    user_id: report.user_id, subscription_id: report.subscription_id, license_id: report.license_id,
    device_name: report.device_name, hwid: report.hwid, windows_version: report.windows_version,
    cpu: report.cpu, gpu: report.gpu, ram_gb: report.ram_gb,
    fingerprint: report.fingerprint, technical_context: report.technical_context,
  }
}

function safeFilters(filters: AdminDiagnosticFilters) {
  return { user: filters.user, search: filters.search, classification: filters.classification, attribution: filters.attribution, component: filters.component }
}

export function formatDiagnosticReports(reports: AdminCrashLog[], filters: AdminDiagnosticFilters): string {
  return JSON.stringify({
    format: 'saturnws.diagnostic-reports.v1', collected_at: new Date().toISOString(),
    filters: safeFilters(filters), report_count: reports.length, reports: reports.map(safeReport),
  }, null, 2)
}

type DiagnosticSignature = {
  signature: string
  fingerprint: string | null
  app_version: string | null
  component: string | null
  error_type: string
  context: string | null
  message_preview: string
  message_preview_truncated: boolean
  classification: AdminCrashLog['classification']
  record_count: number
  occurrence_count: number
  first_happened_at: string
  last_happened_at: string
  representative_id: string
}

function signatureFor(report: AdminCrashLog) {
  return JSON.stringify(report.fingerprint
    ? ['fingerprint', report.fingerprint, report.app_version || null, report.component || null]
    : ['fallback', report.error_type, report.context || null, report.message || '', report.app_version || null, report.component || null])
}

function earlier(left: string, right: string) { return Date.parse(left) <= Date.parse(right) ? left : right }
function later(left: string, right: string) { return Date.parse(left) >= Date.parse(right) ? left : right }
function occurrences(report: AdminCrashLog) { return Number.isSafeInteger(report.occurrence_count) && report.occurrence_count! > 0 ? report.occurrence_count! : 1 }

export function createDiagnosticBundle(
  reader: DiagnosticReader, filters: AdminDiagnosticFilters, signal: AbortSignal, onProgress: DiagnosticProgress,
  options: { deadlineMs?: number } = {},
): Promise<string> {
  return withDeadline(signal, options.deadlineMs ?? DIAGNOSTIC_BUNDLE_LIMITS.deadlineMs, async (active) => {
    const startedAt = new Date().toISOString()
    const ids = new Set<string>()
    const cursors = new Set<string>()
    const signatures = new Map<string, DiagnosticSignature>()
    let cursor = ''
    let hasMore: boolean
    let retentionDays: number
    let occurrenceCount = 0
    let oldest: string | null = null
    let newest: string | null = null
    do {
      checkActive(active)
      const page = await reader.listCrashLogs({ ...filters, cursor, limit: 200 }, active)
      checkActive(active)
      if (!page.success) throw new Error('diagnostic_export_failed')
      if (page.has_more && (!page.next_cursor || cursors.has(page.next_cursor))) throw new Error('diagnostic_export_cursor_invalid')
      retentionDays = page.retention_days
      let stoppedWithinPage = false
      for (const report of page.items) {
        if (ids.has(report.id)) continue
        if (!report.id) throw new Error('diagnostic_export_record_invalid')
        if (ids.size === DIAGNOSTIC_BUNDLE_LIMITS.records) { stoppedWithinPage = true; break }
        ids.add(report.id)
        const count = occurrences(report)
        occurrenceCount += count
        oldest = oldest ? earlier(oldest, report.happened_at) : report.happened_at
        newest = newest ? later(newest, report.happened_at) : report.happened_at
        const signature = signatureFor(report)
        const first = report.first_happened_at || report.happened_at
        const last = report.last_happened_at || report.happened_at
        const existing = signatures.get(signature)
        if (existing) {
          existing.record_count++
          existing.occurrence_count += count
          if (report.classification === 'error') existing.classification = 'error'
          existing.first_happened_at = earlier(existing.first_happened_at, first)
          if (Date.parse(last) > Date.parse(existing.last_happened_at)) existing.representative_id = report.id
          existing.last_happened_at = later(existing.last_happened_at, last)
        } else {
          signatures.set(signature, {
            signature, fingerprint: report.fingerprint || null, app_version: report.app_version || null, component: report.component || null,
            error_type: report.error_type, context: report.context || null, message_preview: (report.message || '').slice(0, 320),
            message_preview_truncated: (report.message || '').length > 320, classification: report.classification,
            record_count: 1, occurrence_count: count, first_happened_at: first, last_happened_at: last, representative_id: report.id,
          })
        }
      }
      onProgress(ids.size, 'records')
      hasMore = stoppedWithinPage || page.has_more
      if (ids.size === DIAGNOSTIC_BUNDLE_LIMITS.records || !page.has_more) break
      cursor = page.next_cursor!
      cursors.add(cursor)
    } while (cursor)
    const groups = [...signatures.values()].sort((a, b) =>
      Number(b.classification === 'error') - Number(a.classification === 'error')
      || b.occurrence_count - a.occurrence_count || Date.parse(b.last_happened_at) - Date.parse(a.last_happened_at)
      || a.signature.localeCompare(b.signature))
    const candidates = groups.slice(0, DIAGNOSTIC_BUNDLE_LIMITS.examples)
    const details: ReturnType<typeof safeReport>[] = []
    for (let start = 0; start < candidates.length; start += DIAGNOSTIC_BUNDLE_LIMITS.concurrency) {
      checkActive(active)
      const batch = await Promise.all(candidates.slice(start, start + DIAGNOSTIC_BUNDLE_LIMITS.concurrency).map(async (group) => {
        checkActive(active)
        const detail = await reader.getCrashLog(group.representative_id, active)
        if (detail.id !== group.representative_id || signatureFor(detail) !== group.signature) throw new Error('diagnostic_export_mismatch')
        return safeReport(detail)
      }))
      checkActive(active)
      details.push(...batch)
      onProgress(details.length, 'examples')
    }
    checkActive(active)
    const coverage = {
      scope: 'recent_matching_records', counts_scope: 'scanned_records_only', snapshot: 'cursor_walk_not_atomic',
      scan_started_at: startedAt, scan_completed_at: new Date().toISOString(), retention_days: retentionDays,
      oldest_record_at: oldest, newest_record_at: newest, scanned_records: ids.size, scanned_occurrences: occurrenceCount,
      signature_count: groups.length, included_signatures: 0, omitted_signatures: groups.length,
      requested_examples: candidates.length, included_examples: 0, omitted_examples: groups.length,
      examples_omitted_by_byte_limit: 0, has_more: hasMore, limits: DIAGNOSTIC_BUNDLE_LIMITS,
    }
    const bundle = { format: 'saturnws.diagnostic-bundle.v1', filters: safeFilters(filters), coverage, signatures: [] as Omit<DiagnosticSignature, 'signature'>[], examples: [] as ReturnType<typeof safeReport>[] }
    const encoder = new TextEncoder()
    const itemBytes = (item: unknown) => {
      const formatted = JSON.stringify(item, null, 2)
      return encoder.encode(formatted).byteLength + (formatted.split('\n').length * 4) + 2
    }
    let usedBytes = encoder.encode(JSON.stringify(bundle, null, 2)).byteLength + 4096
    const exampleBudget = Math.floor(DIAGNOSTIC_BUNDLE_LIMITS.bytes * 0.75)
    for (const detail of details) {
      const bytes = itemBytes(detail)
      if (usedBytes + bytes <= exampleBudget) { bundle.examples.push(detail); usedBytes += bytes }
    }
    for (const group of groups) {
      const projection = {
        fingerprint: group.fingerprint, app_version: group.app_version, component: group.component,
        error_type: group.error_type, context: group.context, message_preview: group.message_preview,
        message_preview_truncated: group.message_preview_truncated, classification: group.classification,
        record_count: group.record_count, occurrence_count: group.occurrence_count,
        first_happened_at: group.first_happened_at, last_happened_at: group.last_happened_at, representative_id: group.representative_id,
      }
      const bytes = itemBytes(projection)
      if (usedBytes + bytes <= DIAGNOSTIC_BUNDLE_LIMITS.bytes) { bundle.signatures.push(projection); usedBytes += bytes }
    }
    const serialize = () => {
      coverage.included_signatures = bundle.signatures.length
      coverage.omitted_signatures = groups.length - bundle.signatures.length
      coverage.included_examples = bundle.examples.length
      coverage.omitted_examples = groups.length - bundle.examples.length
      coverage.examples_omitted_by_byte_limit = details.length - bundle.examples.length
      return JSON.stringify(bundle, null, 2)
    }
    let formatted = serialize()
    while (encoder.encode(formatted).byteLength > DIAGNOSTIC_BUNDLE_LIMITS.bytes) {
      if (bundle.signatures.length) bundle.signatures.pop()
      else if (bundle.examples.length) bundle.examples.pop()
      else throw new Error('diagnostic_bundle_size_invalid')
      formatted = serialize()
    }
    checkActive(active)
    return formatted
  })
}
