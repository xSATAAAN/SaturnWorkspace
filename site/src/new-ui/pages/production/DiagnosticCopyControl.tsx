import { useEffect, useRef, useState } from 'react'
import { Copy, Download } from 'lucide-react'
import { useExperience } from '../../app/ExperienceProvider'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Feedback'
import { FormField, Textarea } from '../../components/ui/FormControls'
import { Modal } from '../../components/ui/Overlays'

export function DiagnosticCopyControl({ label, disabled, prepare }: {
  label: string
  disabled?: boolean
  prepare: (signal: AbortSignal, onProgress: (count: number) => void) => Promise<string>
}) {
  const { locale } = useExperience()
  const text = (en: string, ar: string) => locale === 'ar' ? ar : en
  const active = useRef<AbortController | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
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
    setOpen(true); setBusy(true); setProgress(0); setError(''); setReportText(''); setCopied(false)
    try {
      const value = await prepare(controller.signal, setProgress)
      if (controller.signal.aborted) return
      setReportText(value)
      await copyText(value, controller.signal)
    } catch {
      if (!controller.signal.aborted) setError(text('Could not collect every report. Nothing was copied. Close and try again.', 'تعذر جمع كل التقارير. لم يتم نسخ شيء. أغلق النافذة وحاول مجددًا.'))
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([reportText], { type: 'application/json;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'Saturn-diagnostic-reports.json'; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <>
    <Button disabled={disabled} leadingIcon={<Copy size={16} />} onClick={() => void start()}>{label}</Button>
    <Modal open={open} onClose={close} title={label} closeLabel={text('Close', 'إغلاق')} size="lg" footer={<>
      <Button onClick={close}>{busy ? text('Cancel', 'إلغاء') : text('Close', 'إغلاق')}</Button>
      {reportText ? <><Button leadingIcon={<Download size={16} />} onClick={download}>{text('Download file', 'تنزيل ملف')}</Button><Button variant="primary" onClick={() => void copyText(reportText, active.current?.signal)}>{text('Copy', 'نسخ')}</Button></> : null}
    </>}>
      <div className="stack">
        {busy ? <p role="status">{text(`Collecting full reports: ${progress}`, `جارٍ جمع التقارير الكاملة: ${progress}`)}</p> : null}
        {error ? <Alert tone="danger" title={error} /> : null}
        {reportText ? <>
          <p role="status">{copied ? text('Copied. You can paste the reports into your support conversation.', 'تم النسخ. يمكنك لصق التقارير في محادثة الدعم.') : text('Reports are ready. Press Copy, or select the text below if your browser blocks clipboard access.', 'التقارير جاهزة. اضغط نسخ، أو حدد النص أدناه إذا منع المتصفح الوصول للحافظة.')}</p>
          <FormField htmlFor="diagnostic-copy-text" label={text('Full technical reports', 'التقارير الفنية الكاملة')}>
            <Textarea id="diagnostic-copy-text" className="diagnostic-copy-text" dir="ltr" rows={12} value={reportText} readOnly onFocus={(event) => event.currentTarget.select()} />
          </FormField>
        </> : null}
      </div>
    </Modal>
  </>
}
