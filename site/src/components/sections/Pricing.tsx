import { useState } from 'react'
import { CheckoutModal, type PlanId } from '../CheckoutModal'
import { Reveal } from '../Reveal'

type PricingProps = {
  telegramHref: string
  lang: 'en' | 'ar'
}

export function Pricing({ telegramHref, lang }: PricingProps) {
  const isAr = lang === 'ar'
  const t = isAr
    ? {
        tag: 'الأسعار',
        title: 'خطط ترخيص SATAN Toolkit',
        desc: 'اختر الخطة المناسبة لحجم عملك، ويمكنك الترقية لاحقًا بسهولة.',
        monthly: 'شهري',
        starter: 'بداية',
        monthlyFeatures: ['Vault + Gmail + IP', 'جلسات سريعة', 'تحديثات دورية', 'دعم قياسي'],
        sixMonths: '6 شهور',
        best: 'الأفضل للمحترفين',
        sixMonthsFeatures: ['كل مزايا الأداة', 'تحديثات مستمرة', 'أولوية في الدعم', 'خطة تشغيل مستقرة لـ 6 شهور'],
        order: 'تنفيذ الطلب',
        telegram: 'تواصل عبر تيليجرام',
        note: 'الطلب يبدأ من هنا ثم التأكيد عبر تيليجرام بسرعة.',
      }
    : {
        tag: 'PRICING',
        title: 'License plans for SATAN Toolkit',
        desc: 'Start with the plan that matches your operation size. Upgrade anytime without data loss.',
        monthly: 'Monthly',
        starter: 'Starter',
        monthlyFeatures: ['Vault + Gmail + IP storage', 'Quick session tools', 'Standard updates', 'Standard support'],
        sixMonths: '6 Months',
        best: 'Operator choice',
        sixMonthsFeatures: ['Complete SATAN Toolkit feature set', 'Continuous updates', 'Priority support lane', 'Stable 6-month operating plan'],
        order: 'Place order',
        telegram: 'Contact on Telegram',
        note: 'Checkout starts here, then finishes on Telegram (fast confirmation).',
      }
  const telegramUsername = telegramHref.replace(/^https?:\/\/t\.me\//, '').replace(/\?.*$/, '')
  const [open, setOpen] = useState(false)
  const [initialPlan, setInitialPlan] = useState<PlanId>('six_months')

  return (
    <section id="pricing" className="border-t border-white/10">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-[#2884ff]">{t.tag}</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {t.title}
            </h2>
            <p className="mt-4 text-pretty text-white/65">
              {t.desc}
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Reveal delayMs={80}>
            <div className="rounded-[var(--radius)] border border-[#1f4f82]/70 bg-gradient-to-b from-[#0d2a4a] to-[#07192f] p-7 shadow-[0_16px_34px_rgba(40,132,255,.12)] backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white/80">{t.monthly}</div>
                  <div className="mt-2 text-3xl font-semibold text-white">
                    $20 <span className="text-base font-semibold text-white/60">/mo</span>
                  </div>
                </div>
                <span className="rounded-full border border-[#1f4f82]/80 bg-[rgba(7,19,35,0.55)] px-3 py-1 text-xs font-semibold text-white/88">
                  {t.starter}
                </span>
              </div>

              <ul className="mt-6 space-y-2 text-sm text-white/70">
                {t.monthlyFeatures.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>

              <div className="mt-7 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setInitialPlan('monthly')
                    setOpen(true)
                  }}
                  className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-b from-[#0d2a4a] to-[#07192f] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(40,132,255,.16)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2884ff]"
                >
                  {t.order}
                </button>
                <a
                  href={telegramHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2884ff]"
                >
                  {t.telegram}
                </a>
              </div>
            </div>
          </Reveal>

          <Reveal delayMs={130}>
            <div className="rounded-[var(--radius)] border border-[#1f4f82]/70 bg-gradient-to-b from-[#0d2a4a] to-[#07192f] p-7 shadow-[0_16px_34px_rgba(40,132,255,.12)] backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white/80">{t.sixMonths}</div>
                  <div className="mt-2 text-3xl font-semibold text-white">$105</div>
                </div>
                <span className="rounded-full border border-[#1f4f82]/80 bg-[rgba(7,19,35,0.62)] px-3 py-1 text-xs font-semibold text-[#2884ff]">
                  {t.best}
                </span>
              </div>

              <ul className="mt-6 space-y-2 text-sm text-white/70">
                {t.sixMonthsFeatures.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>

              <div className="mt-7 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setInitialPlan('six_months')
                    setOpen(true)
                  }}
                  className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-b from-[#0d2a4a] to-[#07192f] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(40,132,255,.16)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2884ff]"
                >
                  {t.order}
                </button>
                <a
                  href={telegramHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2884ff]"
                >
                  {t.telegram}
                </a>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delayMs={220}>
          <div className="mx-auto mt-10 max-w-3xl rounded-[var(--radius)] border border-white/10 bg-[rgba(7,19,35,0.6)] px-6 py-5 text-center text-sm text-white/74 backdrop-blur">
            {t.note}
          </div>
        </Reveal>
      </div>

      <CheckoutModal
        open={open}
        onClose={() => setOpen(false)}
        telegramUsername={telegramUsername || 'satantoolkit'}
        initialPlan={initialPlan}
        lang={lang}
      />
    </section>
  )
}

