import { useEffect, useMemo, useState } from 'react'
import { createPaymentIntent, type PaymentPlan } from '../api/payments'
import { buildTelegramDeepLink } from '../lib/telegram'

export type PlanId = PaymentPlan

type CheckoutModalProps = {
  open: boolean
  onClose: () => void
  telegramUsername: string
  initialPlan?: PlanId
  lang: 'en' | 'ar'
}

function normalizeField(value: string, max = 180) {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

export function CheckoutModal({
  open,
  onClose,
  telegramUsername,
  initialPlan = 'yearly',
  lang,
}: CheckoutModalProps) {
  const isAr = lang === 'ar'
  const t = isAr
    ? {
        title: 'إتمام الطلب',
        close: 'إلغاء',
        monthly: 'ترخيص شهري',
        yearly: 'ترخيص سنوي (عرض محدود)',
        email: 'البريد الإلكتروني',
        phone: 'الهاتف / واتساب',
        notes: 'ملاحظات الطلب',
        notesPlaceholder: 'عدد الأجهزة أو أي تفاصيل مهمة.',
        continue: 'متابعة الدفع',
        copy: 'نسخ نص الطلب',
        footer: 'النموذج ينشئ طلبًا كاملاً لتسريع تأكيد التفعيل.',
        creating: 'جارٍ تجهيز الطلب...',
        failed: 'تعذر تجهيز رابط الدفع. راسل admin@saturnws.com أو المطوّر على تيليجرام مع رقم الطلب.',
      }
    : {
        title: 'License checkout',
        close: 'Cancel',
        monthly: 'Monthly license',
        yearly: 'Yearly license (limited promo)',
        email: 'Email',
        phone: 'Phone / WhatsApp',
        notes: 'Order notes',
        notesPlaceholder: 'Device count, preferred contact time, or any details.',
        continue: 'Continue to payment',
        copy: 'Copy order request',
        footer: 'This form creates a complete order request so activation can be confirmed quickly.',
        creating: 'Preparing secure checkout...',
        failed: 'Could not prepare payment link. Email admin@saturnws.com or message the developer on Telegram with your order id.',
      }
  const [plan, setPlan] = useState<PlanId>(initialPlan)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [orderId, setOrderId] = useState('PENDING')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      setOrderId('PENDING')
      setSubmitError('')
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    setPlan(initialPlan)
  }, [open, initialPlan])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const message = useMemo(() => {
    const lines: string[] = []
    lines.push(`SATAN Toolkit — ${isAr ? 'طلب ترخيص' : 'License Order'}`)
    lines.push('------------------------------')
    lines.push(`Order: ${orderId}`)
    const planLine = isAr
      ? plan === 'monthly'
        ? 'الخطة: شهري — 20$/شهر'
        : 'الخطة: سنوي — 120$ (عرض −50% مقارنة بـ 240$ لو دفعت شهريًا لسنة)'
      : plan === 'monthly'
        ? 'Plan: Monthly — $20/mo'
        : 'Plan: Yearly — $120 (limited-time −50% vs. $240 at monthly rate for 12 mo.)'
    lines.push(planLine)
    if (email.trim()) lines.push(`Email: ${normalizeField(email, 120)}`)
    if (phone.trim()) lines.push(`Phone: ${normalizeField(phone, 40)}`)
    if (notes.trim()) lines.push(`Notes: ${normalizeField(notes, 500)}`)
    lines.push('------------------------------')
    lines.push(
      isAr
        ? 'يرجى إرسال طريقة الدفع وإثبات التحويل إن لزم.'
        : 'Please share payment method and transfer proof if required.',
    )
    return lines.join('\n')
  }, [orderId, plan, email, phone, notes, isAr])

  const telegramHref = useMemo(
    () => buildTelegramDeepLink({ telegramUsername, message }),
    [telegramUsername, message],
  )

  async function handleContinueToPayment() {
    if (submitting) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const response = await createPaymentIntent({
        plan,
        customer: {
          email: normalizeField(email, 120) || undefined,
          phone: normalizeField(phone, 40) || undefined,
          contact: normalizeField(phone || email, 120) || undefined,
        },
        notes: normalizeField(notes, 500) || undefined,
        locale: lang,
      })
      if (response.order_id) setOrderId(response.order_id)
      if (response.hosted_url) {
        window.location.assign(response.hosted_url)
        return
      }
      window.open(
        buildTelegramDeepLink({
          telegramUsername,
          message: response.fallback_telegram_message || message,
        }),
        '_blank',
        'noopener,noreferrer',
      )
    } catch {
      setSubmitError(t.failed)
      window.open(telegramHref, '_blank', 'noopener,noreferrer')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="License checkout"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(2,8,16,0.74)] backdrop-blur-sm"
        aria-label="Close checkout"
      />

      <div className="relative w-full max-w-xl overflow-hidden rounded-[var(--radius)] border border-white/12 bg-[rgb(var(--panel))]/90 shadow-[0_30px_120px_rgba(0,0,0,.55)] backdrop-blur">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
          <div>
            <div className="text-sm font-semibold text-white">{t.title}</div>
            <div className="mt-1 text-xs text-white/60">Order ID: {orderId}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/8"
          >
            {t.close}
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="grid gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPlan('monthly')}
                className={
                  plan === 'monthly'
                    ? 'rounded-xl border border-slate-400/35 bg-slate-500/10 px-4 py-3 text-start'
                    : 'rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-start hover:bg-white/7'
                }
              >
                <div className="text-sm font-semibold text-white">{t.monthly}</div>
                <div className="mt-1 text-sm text-white/70">$20 / mo</div>
              </button>
              <button
                type="button"
                onClick={() => setPlan('yearly')}
                className={
                  plan === 'yearly'
                    ? 'rounded-xl border border-slate-400/35 bg-slate-500/10 px-4 py-3 text-start'
                    : 'rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-start hover:bg-white/7'
                }
              >
                <div className="text-sm font-semibold text-white">{t.yearly}</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="text-white/45 line-through">$240</span>
                  <span className="text-white/85">$120</span>
                  <span className="text-xs font-semibold text-emerald-200/90">−50%</span>
                </div>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-white/70">{t.email}</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11 rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-slate-400/50"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-white/70">{t.phone}</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+20..."
                  className="h-11 rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-slate-400/50"
                />
              </label>
            </div>

            <label className="grid gap-1">
              <span className="text-xs font-semibold text-white/70">{t.notes}</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={t.notesPlaceholder}
                className="resize-none rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-slate-400/50"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleContinueToPayment}
              disabled={submitting}
              className="btn-primary inline-flex flex-1 items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition focus:outline-none"
            >
              {submitting ? t.creating : t.continue}
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(message)}
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/35"
            >
              {t.copy}
            </button>
          </div>

          <div className="mt-4 text-xs text-white/55">
            {t.footer}
          </div>
          {submitError ? <div className="mt-2 text-xs text-amber-200/90">{submitError}</div> : null}
        </div>
      </div>
    </div>
  )
}

