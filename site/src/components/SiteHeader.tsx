import { useState } from 'react'

type SiteHeaderProps = {
  lang: 'en' | 'ar'
  onToggleLang: () => void
}

export function SiteHeader({ lang, onToggleLang }: SiteHeaderProps) {
  const isAr = lang === 'ar'
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
          buy: 'اشتراك الآن',
          switchLabel: 'EN',
        }
      : {
          modules: 'Features',
          workflow: 'Workflow',
          plans: 'Plans',
          faq: 'FAQ',
          feedback: 'Feedback',
          updates: 'Updates',
          login: 'Login',
          buy: 'Get license',
          switchLabel: 'AR',
        }
  const [mobileOpen, setMobileOpen] = useState(false)

  const closeMobile = () => setMobileOpen(false)

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[rgba(2,6,23,0.72)] backdrop-blur supports-[backdrop-filter]:bg-[rgba(2,6,23,0.58)]">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <a href="/" className="group inline-flex items-center gap-2.5" onClick={closeMobile}>
          <img
            src="/logo-header.png"
            alt=""
            width={32}
            height={32}
            decoding="sync"
            fetchPriority="high"
            className="site-logo h-8 w-8 shrink-0 object-contain"
          />
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
            onClick={() => setMobileOpen((p) => !p)}
            className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8 sm:hidden"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
              <path
                fill="currentColor"
                d="M4 6.5h16a1 1 0 0 1 0 2H4a1 1 0 1 1 0-2Zm0 4.5h16a1 1 0 0 1 0 2H4a1 1 0 1 1 0-2Zm0 4.5h16a1 1 0 0 1 0 2H4a1 1 0 1 1 0-2Z"
              />
            </svg>
          </button>
          <a
            href="/login.html"
            className="hidden rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8 md:inline-flex"
          >
            {t.login}
          </a>
          {isAr ? (
            <button
              type="button"
              onClick={onToggleLang}
              className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8"
            >
              {t.switchLabel}
            </button>
          ) : null}
          <a
            href="#pricing"
            onClick={closeMobile}
            className="btn-primary inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none"
          >
            {t.buy}
          </a>
          {!isAr ? (
            <button
              type="button"
              onClick={onToggleLang}
              className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8"
            >
              {t.switchLabel}
            </button>
          ) : null}
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-white/[0.06] bg-[rgba(2,6,23,0.88)] backdrop-blur sm:hidden">
          <div className="mx-auto max-w-6xl px-5 py-3">
            <div className="grid gap-2 text-sm">
              <a className="rounded-lg px-3 py-2 text-white/80 hover:bg-white/5 hover:text-white" href="#features" onClick={closeMobile}>
                {t.modules}
              </a>
              <a className="rounded-lg px-3 py-2 text-white/80 hover:bg-white/5 hover:text-white" href="#how" onClick={closeMobile}>
                {t.workflow}
              </a>
              <a className="rounded-lg px-3 py-2 text-white/80 hover:bg-white/5 hover:text-white" href="#pricing" onClick={closeMobile}>
                {t.plans}
              </a>
              <a className="rounded-lg px-3 py-2 text-white/80 hover:bg-white/5 hover:text-white" href="#faq" onClick={closeMobile}>
                {t.faq}
              </a>
              <a className="rounded-lg px-3 py-2 text-white/80 hover:bg-white/5 hover:text-white" href="#feedback" onClick={closeMobile}>
                {t.feedback}
              </a>
              <a className="rounded-lg px-3 py-2 text-white/80 hover:bg-white/5 hover:text-white" href="/updates.html" onClick={closeMobile}>
                {t.updates}
              </a>
              <div className="mt-1 grid grid-cols-1 gap-2">
                <a
                  href="/login.html"
                  className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8"
                  onClick={closeMobile}
                >
                  {t.login}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    onToggleLang()
                    closeMobile()
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8"
                >
                  {t.switchLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  )
}

