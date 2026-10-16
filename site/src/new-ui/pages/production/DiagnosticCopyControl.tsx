import { useEffect, useId, useRef, useState } from 'react'
import { Copy, Download } from 'lucide-react'
import { useExperience } from '../../app/ExperienceProvider'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Feedback'
import { FormField, Textarea } from '../../components/ui/FormControls'
import { Modal } from '../../components/ui/Overlays'
import type { DiagnosticProgress } from './diagnosticReportExport'

export function DiagnosticCopyControl({ label, disabled, prepare, bundle = false }: {
  label: string
  disabled?: boolean
  prepare: (signal: AbortSignal, onProgress: DiagnosticProgress) => Promise<string>
  bundle?: boolean
}) {
  const { locale } = useExperience()
  const text = (en: string, ar: string) => locale === 'ar' ? ar : en
  const active = useRef<AbortController | null>(null)
  const textId = useId()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState<'records' | 'examples'>('records')
  const [reportText, setReportText] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => () => active.current?.abort(), [])
  const close = () => { active.current?.abort(); setOpen(false); setReportText('') }
  const copyText = async (value: string, signal?: AbortSignal) => {
    try {
      await navigator.clipboard.writeText(value)
      if (!signal?.aborted) setCopied(true)
    } catch {
      if (!signal?.aborted) setCopied(false)
    }
  }
  const start = async () => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setOpen(true); setBusy(true); setProgress(0); setStage('records'); setError(''); setReportText(''); setCopied(false)
    try {
      const value = await prepare(controller.signal, (count, nextStage) => {
        if (!controller.signal.aborted) { setProgress(count); setStage(nextStage || 'records') }
      })
      if (controller.signal.aborted) return
      setReportText(value)
      await copyText(value, controller.signal)
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error && cause.name === 'TimeoutError'
        ? text('Collection took too long. Nothing was copied. Narrow the filters and try again.', 'استغرق جمع التقارير وقتًا طويلًا. لم يتم نسخ شيء. حدّد الفلاتر أكثر وحاول مجددًا.')
        : text('Could not prepare the diagnostic text. Nothing was copied. Close and try again.', 'تعذر تجهيز نص التشخيص. لم يتم نسخ شيء. أغلق النافذة وحاول مجددًا.'))
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([reportText], { type: 'application/json;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = bundle ? 'Saturn-diagnostic-bundle.json' : 'Saturn-diagnostic-reports.json'; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <>
    <Button variant={bundle ? 'primary' : undefined} disabled={disabled} leadingIcon={<Copy size={16} />} onClick={() => void start()}>{label}</Button>
    <Modal open={open} onClose={close} title={label} closeLabel={text('Close', 'إغلاق')} size="lg" footer={<>
      <Button onClick={close}>{busy ? text('Cancel', 'إلغاء') : text('Close', 'إغلاق')}</Button>
      {reportText ? <><Button leadingIcon={<Download size={16} />} onClick={download}>{text('Download file', 'تنزيل ملف')}</Button><Button variant="primary" onClick={() => void copyText(reportText, active.current?.signal)}>{text('Copy', 'نسخ')}</Button></> : null}
    </>}>
      <div className="stack">
        {busy ? <p role="status">{bundle
          ? stage === 'examples' ? text(`Collecting full examples: ${progress} (up to 40)`, `جارٍ جمع الأمثلة الكاملة: ${progress} (حتى 40)`)
            : text(`Reading recent reports: ${progress} (up to 1,000)`, `جارٍ قراءة أحدث التقارير: ${progress} (حتى 1,000)`)
          : text(`Collecting full reports: ${progress}`, `جارٍ جمع التقارير الكاملة: ${progress}`)}</p> : null}
        {error ? <Alert tone="danger" title={error} /> : null}
        {reportText ? <>
          <p role="status">{copied ? text('Copied. You can paste the diagnostic text into your support conversation.', 'تم النسخ. يمكنك لصق نص التشخيص في محادثة الدعم.') : text('Diagnostic text is ready. Press Copy, or select the text below if your browser blocks clipboard access.', 'نص التشخيص جاهز. اضغط نسخ، أو حدّد النص أدناه إذا منع المتصفح الوصول للحافظة.')}</p>
          <FormField htmlFor={textId} label={text('Diagnostic text', 'نص التشخيص')}>
            <Textarea id={textId} className="diagnostic-copy-text" dir="ltr" rows={12} value={reportText} readOnly onFocus={(event) => event.currentTarget.select()} />
          </FormField>
        </> : null}
      </div>
    </Modal>
  </>
}
