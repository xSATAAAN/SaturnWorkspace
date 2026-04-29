type SiteHeaderProps = {
  telegramHref: string
  lang: 'en' | 'ar'
  onToggleLang: () => void
}

export function SiteHeader({ telegramHref, lang, onToggleLang }: SiteHeaderProps) {
  const t =
    lang === 'ar'
      ? {
          modules: 'المزايا',
          workflow: 'طريقة العمل',
          plans: 'الأسعار',
          faq: 'الأسئلة',
          feedback: 'المقترحات',
          updates: 'التحديثات',
          login: 'دخول',
          telegram: 'تيليجرام',
          buy: 'اشتراك الآن',
          switchLabel: 'EN',
        }
      : {
          modules: 'Modules',
          workflow: 'Workflow',
          plans: 'Plans',
          faq: 'FAQ',
          feedback: 'Feedback',
          updates: 'Updates',
          login: 'Login',
          telegram: 'Telegram',
          buy: 'Get license',
          switchLabel: 'AR',
        }
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/25 backdrop-blur supports-[backdrop-filter]:bg-black/20">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <a href="/" className="group inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_24px_rgba(255,60,60,.55)]" />
          <span className="text-sm font-semibold tracking-wide text-white">
            SATAN <span className="text-white/70">Toolkit</span>
          </span>
        </a>

        <nav className="hidden items-center gap-6 text-sm sm:absolute sm:left-1/2 sm:flex sm:-translate-x-1/2">
          <a className="text-white/70 hover:text-white" href="#features">
            {t.modules}
          </a>
          <a className="text-white/70 hover:text-white" href="#how">
            {t.workflow}
          </a>
          <a className="text-white/70 hover:text-white" href="#pricing">
            {t.plans}
          </a>
          <a className="text-white/70 hover:text-white" href="#faq">
            {t.faq}
          </a>
          <a className="text-white/70 hover:text-white" href="#feedback">
            {t.feedback}
          </a>
          <a className="text-white/70 hover:text-white" href="/updates.html">
            {t.updates}
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleLang}
            className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8"
          >
            {t.switchLabel}
          </button>
          <a
            href={telegramHref}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8 sm:inline-flex"
          >
            {t.telegram}
          </a>
          <a
            href="/login.html"
            className="hidden rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8 md:inline-flex"
          >
            {t.login}
          </a>
          <a
            href="#pricing"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-red-500 to-red-700 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_36px_rgba(255,60,60,.22)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            {t.buy}
          </a>
        </div>
      </div>
    </header>
  )
}

