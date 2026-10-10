import type { AdminCrashLog, AdminDiagnosticFilters, AdminDiagnosticPage } from '../../../api/admin'

type DiagnosticReader = {
  listCrashLogs: (filters: AdminDiagnosticFilters) => Promise<AdminDiagnosticPage>
  getCrashLog: (id: string) => Promise<AdminCrashLog>
}

export async function collectDiagnosticReports(
  reader: DiagnosticReader,
  filters: AdminDiagnosticFilters,
  signal: AbortSignal,
  onProgress: (count: number) => void,
): Promise<AdminCrashLog[]> {
  const reports: AdminCrashLog[] = []
  const ids = new Set<string>()
  const cursors = new Set<string>()
  let cursor = ''
  const checkActive = () => { if (signal.aborted) throw new DOMException('Aborted', 'AbortError') }
  do {
    checkActive()
    const page = await reader.listCrashLogs({ ...filters, cursor, limit: 200 })
    checkActive()
    if (!page.success) throw new Error('diagnostic_export_failed')
    const summaries = page.items.filter((report) => {
      if (ids.has(report.id)) return false
      ids.add(report.id)
      return true
    })
    for (let start = 0; start < summaries.length; start += 4) {
      checkActive()
      const batch = await Promise.all(summaries.slice(start, start + 4).map(async (summary) => {
        const detail = await reader.getCrashLog(summary.id)
        if (detail.id !== summary.id) throw new Error('diagnostic_export_mismatch')
        return detail
      }))
      checkActive()
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

export function formatDiagnosticReports(reports: AdminCrashLog[], filters: AdminDiagnosticFilters): string {
  // Only the sanitized detail projection is shareable. Legacy raw_payload is excluded.
  const safeReports = reports.map((report) => ({
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
  }))
  return JSON.stringify({
    format: 'saturnws.diagnostic-reports.v1', collected_at: new Date().toISOString(),
    filters: { user: filters.user, search: filters.search, classification: filters.classification, attribution: filters.attribution, component: filters.component },
    report_count: reports.length, reports: safeReports,
  }, null, 2)
}
