import type { SiteCopy } from '../../types/content'

type SiteFooterProps = {
  copy: SiteCopy
  isAr: boolean
}

export function SiteFooter({ copy, isAr }: SiteFooterProps) {
  return (
    <footer className="bg-transparent">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">SATAN Toolkit</div>
            <div className="mt-1 text-sm text-white/60">{copy.footerDesc}</div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a className="text-white/70 hover:text-white" href="/privacy.html">
              {copy.footerPrivacy}
            </a>
            <a className="text-white/70 hover:text-white" href="/terms.html">
              {copy.footerTerms}
            </a>
            <a className="text-white/70 hover:text-white" href="/updates.html">
              {copy.footerUpdates}
            </a>
            <a className="text-white/70 hover:text-white" href="/login.html">
              {isAr ? 'تسجيل الدخول' : 'Login'}
            </a>
          </div>
        </div>
        <div className="mt-8 text-xs text-white/45">© {new Date().getFullYear()} SATAN Toolkit</div>
      </div>
    </footer>
  )
}
