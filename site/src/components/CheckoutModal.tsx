import { useEffect, useMemo, useState } from 'react'
import { buildTelegramDeepLink } from '../lib/telegram'

export type PlanId = 'monthly' | 'lifetime'

type CheckoutModalProps = {
  open: boolean
  onClose: () => void
  telegramUsername: string
  initialPlan?: PlanId
  lang: 'en' | 'ar'
}

function createOrderId() {
  const rand = Math.random().toString(16).slice(2, 8).toUpperCase()
  const t = Date.now().toString(16).slice(-6).toUpperCase()
  return `STK-${t}-${rand}`
}

export function CheckoutModal({
  open,
  onClose,
  telegramUsername,
  initialPlan = 'lifetime',
  lang,
}: CheckoutModalProps) {
  const isAr = lang === 'ar'
  const t = isAr
    ? {
        title: 'إتمام الطلب',
        close: 'إلغاء',
        monthly: 'ترخيص شهري',
        lifetime: 'ترخيص مدى الحياة',
        email: 'البريد الإلكتروني',
        phone: 'الهاتف / واتساب',
        notes: 'ملاحظات الطلب',
        notesPlaceholder: 'عدد الأجهزة أو أي تفاصيل مهمة.',
        continue: 'المتابعة على تيليجرام',
        copy: 'نسخ نص الطلب',
        footer: 'النموذج ينشئ طلبًا كاملاً لتسريع تأكيد التفعيل.',
      }
    : {
        title: 'License checkout',
        close: 'Cancel',
        monthly: 'Monthly license',
        lifetime: 'Lifetime license',
        email: 'Email',
        phone: 'Phone / WhatsApp',
        notes: 'Order notes',
        notesPlaceholder: 'Device count, preferred contact time, or any details.',
        continue: 'Continue to Telegram',
        copy: 'Copy order request',
        footer: 'This form creates a complete order request so activation can be confirmed quickly.',
      }
  const [plan, setPlan] = useState<PlanId>(initialPlan)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [orderId, setOrderId] = useState(() => createOrderId())

  useEffect(() => {
    if (!open) return
    setOrderId(createOrderId())
  }, [open])

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
    lines.push(`Plan: ${plan === 'monthly' ? 'Monthly (EGP 499)' : 'Lifetime (EGP 1,499)'}`)
    if (email.trim()) lines.push(`Email: ${email.trim()}`)
    if (phone.trim()) lines.push(`Phone: ${phone.trim()}`)
    if (notes.trim()) lines.push(`Notes: ${notes.trim()}`)
    lines.push('------------------------------')
    lines.push('Please share payment method and transfer proof if required.')
    return lines.join('\n')
  }, [orderId, plan, email, phone, notes, isAr])

  const telegramHref = useMemo(
    () => buildTelegramDeepLink({ telegramUsername, message }),
    [telegramUsername, message],
  )

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
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
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
                    ? 'rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-left'
                    : 'rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-left hover:bg-white/7'
                }
              >
                <div className="text-sm font-semibold text-white">{t.monthly}</div>
                <div className="mt-1 text-sm text-white/70">EGP 499 / mo</div>
              </button>
              <button
                type="button"
                onClick={() => setPlan('lifetime')}
                className={
                  plan === 'lifetime'
                    ? 'rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-left'
                    : 'rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-left hover:bg-white/7'
                }
              >
                <div className="text-sm font-semibold text-white">{t.lifetime}</div>
                <div className="mt-1 text-sm text-white/70">EGP 1,499</div>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-white/70">{t.email}</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11 rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-sky-500/40"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-white/70">{t.phone}</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+20..."
                  className="h-11 rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-sky-500/40"
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
                className="resize-none rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-sky-500/40"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <a
              href={telegramHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-b from-sky-500 to-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_44px_rgba(56,189,248,.18)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              {t.continue}
            </a>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(message)}
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              {t.copy}
            </button>
          </div>

          <div className="mt-4 text-xs text-white/55">
            {t.footer}
          </div>
        </div>
      </div>
    </div>
  )
}

