import { useEffect, useMemo, useState } from 'react'
import { Reveal } from './components/Reveal'
import { SiteHeader } from './components/SiteHeader'
import { Feedback } from './components/sections/Feedback'
import { Pricing } from './components/sections/Pricing'

const TELEGRAM_USERNAME = import.meta.env.VITE_TELEGRAM_USERNAME || 'satantoolkit'
const TELEGRAM_LINK = `https://t.me/${TELEGRAM_USERNAME}`

export default function App() {
  const [lang, setLang] = useState<'en' | 'ar'>('en')
  const isAr = lang === 'ar'

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = isAr ? 'rtl' : 'ltr'
  }, [lang, isAr])

  const copy = isAr
    ? {
        heroBadge: 'نسخة سطح المكتب متاحة الآن',
        heroTitleA: 'إدارة',
        heroTitleB: 'حسابات Bybit باحترافية',
        heroTitleC: 'من داخل مساحة عمل واحدة على جهازك.',
        heroDesc:
          'SATAN Toolkit بتخليك تدير الحسابات بشكل منظم: تخزين حسابات Bybit، تخزين Gmail احترافي، جلسات سريعة، ومزامنة آمنة على Google Drive الشخصي للمستخدم.',
        ctaStart: 'ابدأ الآن',
        ctaExplore: 'استكشف المزايا',
        stats: [
          { label: 'حسابات Bybit مُدارة', value: '250k+', hint: 'أرشفة منظمة لكل الحسابات' },
          { label: 'مستخدمين فعّالين', value: '2,500+', hint: 'تشغيل يومي للأداة' },
          { label: 'بدء جلسة سريع', value: '< 2 min', hint: 'AdsPower ببروكسي أو بدون' },
        ],
        featuresTag: 'المزايا',
        featuresTitle: 'كل ما تحتاجه لإدارة الحسابات في أداة واحدة',
        featuresDesc: 'الموديولات مبنية للتنفيذ الفعلي وليس الحشو، وكل خطوة لها مكان واضح.',
        features: [
          {
            title: 'إدارة Vault',
            desc: 'تخزين احترافي لحسابات Bybit مع ملاحظات وحالة كل حساب بشكل مرتب.',
          },
          {
            title: 'تخزين Gmail',
            desc: 'قاعدة بيانات Gmail منظمة مع بيانات الاسترداد وحالة الاستخدام.',
          },
          {
            title: 'تتبع IP ذكي',
            desc: 'منع تكرار IP في الجلسات المختلفة عبر سجل ذكي للتتبع.',
          },
          {
            title: 'نسخ سحابي آمن',
            desc: 'مزامنة على Google Drive الشخصي للمستخدم فقط بدون أي طرف ثالث.',
          },
          {
            title: 'جلسة سريعة',
            desc: 'تشغيل سريع على AdsPower ببروكسي أو بدون مع بروفايل جاهز.',
          },
          {
            title: 'إدارة البروكسي',
            desc: 'سحب بروكسيات IPRoyal واستخدامها مباشرة داخل جلسات AdsPower.',
          },
        ],
        howTag: 'طريقة العمل',
        howTitle: '٣ خطوات واضحة',
        how: [
          {
            step: '01',
            title: 'جهز البيانات',
            desc: 'سجّل الحسابات والجيميلات والبيانات المطلوبة بشكل منظم.',
          },
          {
            step: '02',
            title: 'ابدأ الجلسة',
            desc: 'شغّل جلسة AdsPower سريعًا، أنشئ الحساب، واحفظ كل الملاحظات.',
          },
          {
            step: '03',
            title: 'راجع وامنح نسخة احتياطية',
            desc: 'حدّث الحالة والتذكيرات ثم فعّل المزامنة على Google Drive الخاص بك.',
          },
        ],
        faqTag: 'الأسئلة الشائعة',
        faqTitle: 'إجابات مباشرة',
        faq: [
          {
            q: 'هل الأداة تعمل محليًا؟',
            a: 'نعم. التشغيل الأساسي محلي بالكامل، والمزامنة السحابية اختيارية.',
          },
          { q: 'ما الأنظمة المدعومة؟', a: 'Windows 10 و Windows 11.' },
          { q: 'هل الترخيص لجهاز واحد؟', a: 'نعم، الترخيص لكل جهاز إلا في حالات الاتفاق الخاص.' },
          { q: 'ما المتصفحات المدعومة حاليًا؟', a: 'AdsPower و Brave، وقد تتم إضافة المزيد مستقبلًا.' },
          { q: 'كيف أستلم التفعيل؟', a: 'بعد تأكيد الطلب يتم إرسال بيانات التفعيل مباشرة.' },
        ],
        footerDesc:
          'أداة سطح مكتب لإدارة حسابات Bybit وتخزين Gmail وIP ومزامنة سحابية آمنة.',
        footerPrivacy: 'الخصوصية',
        footerTerms: 'الشروط',
        footerUpdates: 'التحديثات',
      }
    : {
        heroBadge: 'Desktop build available now',
        heroTitleA: 'Professional',
        heroTitleB: 'Bybit account operations',
        heroTitleC: 'in one local-first desktop workspace.',
        heroDesc:
          'SATAN Toolkit helps you run Bybit account operations with discipline: account vault, professional Gmail storage, fast session tools, and private cloud backup to your own Google Drive account.',
        ctaStart: 'Start now',
        ctaExplore: 'Explore modules',
        stats: [
          { label: 'Bybit accounts managed', value: '250k+', hint: 'structured vault history' },
          { label: 'Operators using toolkit', value: '2,500+', hint: 'daily active workflows' },
          { label: 'Quick session start', value: '< 2 min', hint: 'AdsPower with/without proxy' },
        ],
        featuresTag: 'FEATURES',
        featuresTitle: 'Built for real SATAN Toolkit workflows',
        featuresDesc:
          'Every module serves actual execution: create, run, review, sync, and reopen accounts quickly.',
        features: [
          {
            title: 'Vault Manager',
            desc: 'Professional storage for Bybit accounts with notes, status, and organized tracking fields.',
          },
          {
            title: 'Gmail Storage',
            desc: 'Clean Gmail database with recovery details and usage state ready for operational flow.',
          },
          {
            title: 'Smart IP Register',
            desc: 'Avoid IP reuse across sessions with smart tracking and duplicate prevention logic.',
          },
          {
            title: 'Private Cloud Backup',
            desc: 'Sync to your personal Google Drive app-data only. Your data is not routed to third parties.',
          },
          {
            title: 'Fast Session Start',
            desc: 'Launch quick AdsPower session with proxy or without, using prepared profile settings.',
          },
          {
            title: 'Proxy Operations',
            desc: 'Pull IPRoyal proxies and use them directly in AdsPower profiles (requires active IPRoyal plan).',
          },
        ],
        howTag: 'HOW IT WORKS',
        howTitle: 'Workflow in three steps',
        how: [
          {
            step: '01',
            title: 'Prepare operation setup',
            desc: 'Store account + Gmail data in structured fields, then choose browser route.',
          },
          {
            step: '02',
            title: 'Start account session',
            desc: 'Run quick session on AdsPower (proxy/no proxy), create account, and save required notes.',
          },
          {
            step: '03',
            title: 'Review and sync securely',
            desc: 'Update account status/reminders and sync your dataset to personal Google Drive if enabled.',
          },
        ],
        faqTag: 'FAQ',
        faqTitle: 'Questions from real users',
        faq: [
          {
            q: 'Does SATAN Toolkit work locally?',
            a: 'Yes. Core operations are local-first. Cloud sync is optional and user-controlled.',
          },
          { q: 'Which Windows versions are supported?', a: 'Windows 10 and Windows 11.' },
          { q: 'Is license per device?', a: 'Yes. Each license is bound to one device unless agreed otherwise.' },
          { q: 'Which browsers are supported now?', a: 'AdsPower and Brave are supported now. More browsers may be added later.' },
          { q: 'How do I receive activation?', a: 'After order confirmation, activation details are sent directly.' },
        ],
        footerDesc:
          'Official desktop toolkit for Vault, Gmail, IP, and controlled cloud sync workflows.',
        footerPrivacy: 'Privacy',
        footerTerms: 'Terms',
        footerUpdates: 'Updates',
      }

  const stats = useMemo(
    () => copy.stats,
    [copy],
  )

  return (
    <div className="relative" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="noise" aria-hidden="true" />
      <SiteHeader telegramHref={TELEGRAM_LINK} lang={lang} onToggleLang={() => setLang((p) => (p === 'en' ? 'ar' : 'en'))} />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:pb-20 sm:pt-14">
            <div className="mx-auto max-w-3xl text-center">
              <Reveal>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/80 backdrop-blur">
                  <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_24px_rgba(255,60,60,.55)]" />
                  {copy.heroBadge}
                </div>
              </Reveal>

              <Reveal delayMs={80}>
                <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-white sm:text-6xl">
                  {copy.heroTitleA}{' '}
                  <span className="bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
                    {copy.heroTitleB}
                  </span>{' '}
                  {copy.heroTitleC}
                </h1>
              </Reveal>

              <Reveal delayMs={140}>
                <p className="mt-5 text-pretty text-base leading-relaxed text-white/70 sm:text-lg">
                  {copy.heroDesc}
                </p>
              </Reveal>

              <Reveal delayMs={220}>
                <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                  <a
                    href="#pricing"
                    className="group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-red-500 to-red-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(255,60,60,.22)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    {copy.ctaStart}
                    <span className="translate-x-0 transition group-hover:translate-x-0.5">→</span>
                  </a>
                  <a
                    href="#features"
                    className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/4 px-5 py-3 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/7 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    {copy.ctaExplore}
                  </a>
                </div>
              </Reveal>
            </div>

            <Reveal delayMs={260}>
              <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-3 sm:grid-cols-3">
                {stats.map((s) => (
                  <div key={s.label} className="rounded-[var(--radius)] border border-white/10 bg-black/35 px-5 py-5 backdrop-blur">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-3xl font-semibold text-white">{s.value}</div>
                        <div className="mt-1 text-sm font-semibold text-white/85">{s.label}</div>
                        <div className="mt-1 text-xs text-white/55">{s.hint}</div>
                      </div>
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500/90" />
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-sm font-semibold text-red-300/90">{copy.featuresTag}</p>
                <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  {copy.featuresTitle}
                </h2>
                <p className="mt-4 text-pretty text-white/65">
                  {copy.featuresDesc}
                </p>
              </div>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {copy.features.map((f, idx) => (
                <Reveal key={f.title} delayMs={60 + idx * 35}>
                  <div className="glow-border">
                    <div className="red-panel h-full rounded-[var(--radius)] p-6 backdrop-blur transition">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-white">{f.title}</div>
                          <p className="mt-2 text-sm leading-relaxed text-white/65">{f.desc}</p>
                        </div>
                        <div className="red-badge h-10 w-10 shrink-0 rounded-xl" />
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-sm font-semibold text-red-300/90">{copy.howTag}</p>
                <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  {copy.howTitle}
                </h2>
              </div>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
              {copy.how.map((s, idx) => (
                <Reveal key={s.step} delayMs={70 + idx * 45}>
                  <div className="red-panel rounded-[var(--radius)] p-6 backdrop-blur">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-red-300/90">{s.step}</div>
                      <div className="red-badge h-8 w-8 rounded-full" />
                    </div>
                    <div className="mt-4 text-lg font-semibold text-white">{s.title}</div>
                    <p className="mt-2 text-sm leading-relaxed text-white/65">{s.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <Pricing telegramHref={TELEGRAM_LINK} lang={lang} />

        <Feedback telegramUsername={TELEGRAM_USERNAME} lang={lang} />

        {/* FAQ */}
        <section id="faq" className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-sm font-semibold text-red-300/90">{copy.faqTag}</p>
                <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  {copy.faqTitle}
                </h2>
              </div>
            </Reveal>

            <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-3">
              {copy.faq.map((item, idx) => (
                <Reveal key={item.q} delayMs={60 + idx * 35}>
                  <details className="red-panel group rounded-[var(--radius)] px-5 py-4 backdrop-blur">
                    <summary className="cursor-pointer list-none select-none text-sm font-semibold text-white">
                      <span className="mr-2 text-red-300/90">+</span>
                      {item.q}
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-white/65">{item.a}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-white">SATAN Toolkit</div>
                <div className="mt-1 text-sm text-white/60">
                  {copy.footerDesc}
                </div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <a className="text-white/70 hover:text-white" href="/privacy.html">
                  {copy.footerPrivacy}
                </a>
                <a className="text-white/70 hover:text-white" href="/terms.html">
                  {copy.footerTerms}
                </a>
                <a className="text-white/70 hover:text-white" href="/updates/latest.json">
                  {copy.footerUpdates}
                </a>
              </div>
            </div>
            <div className="mt-8 text-xs text-white/45">© {new Date().getFullYear()} SATAN Toolkit</div>
          </div>
        </footer>
      </main>
    </div>
  )
}
