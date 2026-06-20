import { Reveal } from '../Reveal'

type PricingProps = {
  lang: 'en' | 'ar'
}

type PlanId = 'weekly' | 'monthly' | 'yearly'

const SUPPORT_EMAIL = 'support@saturnws.com'
const DEV_TELEGRAM = 'https://t.me/v1u_0'

const FULL_FEATURES_EN = [
  'Full Saturn Workspace access',
  'Vault, Gmail, IP, backup, and session workflow modules',
  'Managed updates and security fixes',
  'Support for setup and subscription questions',
]

const FULL_FEATURES_AR = [
  'وصول كامل إلى Saturn Workspace',
  'وحدات الخزنة والبريد وIP والنسخ الاحتياطي وسير الجلسات',
  'تحديثات وإصلاحات أمان مُدارة',
  'دعم للإعداد واستفسارات الاشتراك',
]

function openAccountForPlan(plan: PlanId) {
  window.location.assign(`/account/signup?plan=${plan}`)
}

export function Pricing({ lang }: PricingProps) {
  const isAr = lang === 'ar'
  const fullFeatures = isAr ? FULL_FEATURES_AR : FULL_FEATURES_EN

  const t = isAr
    ? {
        tag: 'الأسعار',
        title: 'اشتراك Saturn Workspace',
        desc: 'اختر مدة الاشتراك المناسبة لحسابك. يتم تفعيل الاشتراك على نفس البريد المستخدم في تسجيل الدخول.',
        weekly: 'أسبوعي',
        weeklyHint: 'مناسب للتجربة القصيرة أو العمل المحدد.',
        monthly: 'شهري',
        monthlyHint: 'مرن للاستخدام المستمر خلال الشهر.',
        yearly: 'سنوي',
        yearlyHint: 'الأوفر للاستخدام المنتظم طوال السنة.',
        best: 'الأوفر',
        perWeek: '/أسبوع',
        perMonth: '/شهر',
        perYear: '/سنة',
        order: 'إنشاء حساب',
        supportHint: 'للدعم:',
        supportEmail: SUPPORT_EMAIL,
        supportTele: 'تيليجرام المطور',
        note: 'سجل بحسابك ثم اطلب تفعيل الاشتراك. سيظهر الاشتراك داخل حسابك بعد اعتماد الطلب.',
      }
    : {
        tag: 'PRICING',
        title: 'Saturn Workspace subscription',
        desc: 'Choose the subscription term that fits your account. Access is activated for the same email used to sign in.',
        weekly: 'Weekly',
        weeklyHint: 'Short-term access for focused work.',
        monthly: 'Monthly',
        monthlyHint: 'Flexible access for active monthly use.',
        yearly: 'Yearly',
        yearlyHint: 'Best value for regular annual use.',
        best: 'Best value',
        perWeek: '/week',
        perMonth: '/month',
        perYear: '/year',
        order: 'Create account',
        supportHint: 'Support:',
        supportEmail: SUPPORT_EMAIL,
        supportTele: 'Developer on Telegram',
        note: 'Sign in, request subscription activation, and your account will show the active subscription after approval.',
      }

  const plans: Array<{
    id: PlanId
    label: string
    price: string
    period: string
    hint: string
    featured?: boolean
  }> = [
    { id: 'weekly', label: t.weekly, price: '$10', period: t.perWeek, hint: t.weeklyHint },
    { id: 'monthly', label: t.monthly, price: '$30', period: t.perMonth, hint: t.monthlyHint },
    { id: 'yearly', label: t.yearly, price: '$300', period: t.perYear, hint: t.yearlyHint, featured: true },
  ]

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

        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {plans.map((plan, index) => (
            <Reveal key={plan.id} delayMs={80 + index * 50}>
              <div className={`surface-card relative h-full overflow-hidden rounded-[var(--radius)] p-7 ${plan.featured ? 'ring-1 ring-slate-400/30' : ''}`}>
                {plan.featured ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300/40 to-transparent"
                    aria-hidden
                  />
                ) : null}
                <div className="flex min-h-[96px] items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-white/80">{plan.label}</div>
                    <p className="mt-2 text-sm leading-6 text-white/55">{plan.hint}</p>
                  </div>
                  {plan.featured ? (
                    <span className="rounded-full border border-slate-400/30 bg-slate-500/10 px-3 py-1 text-xs font-semibold text-white/90">
                      {t.best}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap items-baseline gap-2">
                  <span className="text-3xl font-semibold text-white">{plan.price}</span>
                  <span className="text-base font-semibold text-white/55">{plan.period}</span>
                </div>

                <ul className="mt-6 space-y-2 text-sm text-white/70">
                  {fullFeatures.map((feature) => (
                    <li key={`${plan.id}-${feature}`}>{feature}</li>
                  ))}
                </ul>

                <div className="mt-7">
                  <button
                    type="button"
                    onClick={() => openAccountForPlan(plan.id)}
                    className="btn-primary inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition focus:outline-none"
                  >
                    {t.order}
                  </button>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delayMs={260}>
          <div className="surface-card mx-auto mt-10 max-w-3xl rounded-[var(--radius)] px-6 py-5 text-center text-sm text-white/74">
            <p>{t.note}</p>
            <p className="mt-2 text-xs text-white/55">
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
        </Reveal>
      </div>
    </section>
  )
}
