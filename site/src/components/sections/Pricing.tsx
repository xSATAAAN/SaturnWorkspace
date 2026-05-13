import { Reveal } from '../Reveal'

type PricingProps = {
  lang: 'en' | 'ar'
}

const FULL_FEATURES_EN = [
  'Full Saturn Workspace — Vault, Gmail, IP & every module',
  'Continuous updates and security fixes',
  'Email support for setup and subscription questions',
  'Same complete subscription — pick monthly or yearly billing',
]

const FULL_FEATURES_AR = [
  'Saturn Workspace كامل — Vault وGmail وIP وكل الوحدات',
  'تحديثات وأمان مستمرة',
  'دعم بالبريد للإعداد واستفسارات الترخيص',
  'نفس الترخيص الكامل — دفع شهري أو سنوي',
]

const SUPPORT_EMAIL = 'support@saturnws.com'
const DEV_TELEGRAM = 'https://t.me/v1u_0'

function openAccountForPlan(plan: 'monthly' | 'yearly') {
  window.location.assign(`/account/signup?plan=${plan}`)
}

export function Pricing({ lang }: PricingProps) {
  const isAr = lang === 'ar'
  const fullFeatures = isAr ? FULL_FEATURES_AR : FULL_FEATURES_EN

  const t = isAr
    ? {
        tag: 'الأسعار',
        title: 'وصول Saturn Workspace التجريبي',
        desc: 'مرحلة البيتا تعمل باشتراكات مجانية يمنحها الأدمن للحسابات المصرح لها. الأسعار هنا مرجعية فقط لما بعد البيتا.',
        monthly: 'شهري',
        starter: 'مرن',
        yearly: 'سنوي',
        best: 'الأوفر',
        promo50: 'خصم ٥٠٪',
        limitedTime: 'لفترة محدودة',
        compareAt: 'بدلًا من $240 لو دفعت شهريًا لمدة سنة',
        yearlyEquiv: '≈ $10/شهر خلال العرض',
        perYear: '/سنة',
        order: 'إنشاء حساب البيتا',
        supportHint: 'للدعم:',
        supportEmail: SUPPORT_EMAIL,
        supportTele: 'تيليجرام المطوّر',
        note: 'الدفع غير مفعل أثناء البيتا. سجل بحساب Google ثم اطلب تفعيلًا تجريبيًا، وسيتم منح الاشتراك من لوحة الأدمن.',
      }
    : {
        tag: 'PRICING',
        title: 'Saturn Workspace beta access',
        desc: 'Beta access is granted manually from the admin dashboard. Prices are reference-only for the post-beta release.',
        monthly: 'Monthly',
        starter: 'Flexible',
        yearly: 'Yearly',
        best: 'Best value',
        promo50: '−50%',
        limitedTime: 'Limited time',
        compareAt: 'vs. $240 if billed monthly for 12 months',
        yearlyEquiv: '≈ $10/mo during promo',
        perYear: '/yr',
        order: 'Create beta account',
        supportHint: 'Support:',
        supportEmail: SUPPORT_EMAIL,
        supportTele: 'Developer on Telegram',
        note: 'Payments are disabled during beta. Sign in with Google, request beta access, and the admin dashboard will grant the free subscription.',
      }

  return (
    <section id="pricing" className="bg-transparent">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-accent text-sm font-semibold">{t.tag}</p>
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
            <div className="surface-card rounded-[var(--radius)] p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white/80">{t.monthly}</div>
                  <div className="mt-2 text-3xl font-semibold text-white">
                    $20 <span className="text-base font-semibold text-white/60">/mo</span>
                  </div>
                </div>
                <span className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/88">
                  {t.starter}
                </span>
              </div>

              <ul className="mt-6 space-y-2 text-sm text-white/70">
                {fullFeatures.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>

              <div className="mt-7">
                <button
                  type="button"
                  onClick={() => openAccountForPlan('monthly')}
                  className="btn-primary inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition focus:outline-none"
                >
                  {t.order}
                </button>
                <p className="mt-3 text-center text-xs text-white/55">
                  {t.supportHint}{' '}
                  <a className="text-accent underline-offset-2 hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
                    {t.supportEmail}
                  </a>
                  {' · '}
                  <a className="text-accent underline-offset-2 hover:underline" href={DEV_TELEGRAM} target="_blank" rel="noreferrer">
                    {t.supportTele}
                  </a>
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delayMs={130}>
            <div className="surface-card relative overflow-hidden rounded-[var(--radius)] p-7 ring-1 ring-slate-500/20">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-400/35 to-transparent"
                aria-hidden
              />
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white/80">{t.yearly}</div>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-xl font-medium text-white/45 line-through decoration-white/30">$240</span>
                    <span className="text-3xl font-semibold text-white">$120</span>
                    <span className="text-base font-semibold text-white/55">{t.perYear}</span>
                  </div>
                  <p className="mt-1 text-xs text-white/50">{t.compareAt}</p>
                  <p className="mt-0.5 text-xs font-medium text-emerald-200/85">{t.yearlyEquiv}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 sm:items-end">
                  <span className="rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-emerald-100">
                    {t.promo50}
                  </span>
                  <span className="text-accent-muted rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-xs font-semibold">
                    {t.limitedTime}
                  </span>
                  <span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-3 py-1 text-xs font-semibold text-white/90">
                    {t.best}
                  </span>
                </div>
              </div>

              <ul className="mt-6 space-y-2 text-sm text-white/70">
                {fullFeatures.map((f) => (
                  <li key={`y-${f}`}>{f}</li>
                ))}
              </ul>

              <div className="mt-7">
                <button
                  type="button"
                  onClick={() => openAccountForPlan('yearly')}
                  className="btn-primary inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition focus:outline-none"
                >
                  {t.order}
                </button>
                <p className="mt-3 text-center text-xs text-white/55">
                  {t.supportHint}{' '}
                  <a className="text-accent underline-offset-2 hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
                    {t.supportEmail}
                  </a>
                  {' · '}
                  <a className="text-accent underline-offset-2 hover:underline" href={DEV_TELEGRAM} target="_blank" rel="noreferrer">
                    {t.supportTele}
                  </a>
                </p>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delayMs={220}>
          <div className="surface-card mx-auto mt-10 max-w-3xl rounded-[var(--radius)] px-6 py-5 text-center text-sm text-white/74">
            {t.note}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
