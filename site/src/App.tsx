import { useEffect, useState } from 'react'
import { SiteHeader } from './components/SiteHeader'
import { ErrorStatusPage } from './components/ErrorStatusPage'
import { Feedback } from './components/sections/Feedback'
import { FaqSection } from './components/sections/FaqSection'
import { FeaturesSection } from './components/sections/FeaturesSection'
import { HeroSection } from './components/sections/HeroSection'
import { HowSection } from './components/sections/HowSection'
import { Pricing } from './components/sections/Pricing'
import { SiteFooter } from './components/sections/SiteFooter'
import { AdminDashboard } from './components/admin/AdminDashboard'
import { AdminAuthGate } from './components/admin/AdminAuthGate'
import { AccountPage } from './components/AccountPage'
import { AuthPage } from './components/AuthPage'
import { TELEGRAM_USERNAME, getSiteCopy } from './constants/siteCopy'

const STATIC_ROUTE_REDIRECTS: Record<string, string> = {
  '/privacy': '/privacy/',
  '/terms': '/terms/',
  '/refund': '/refund/',
  '/cookies': '/cookies/',
  '/acceptable-use': '/acceptable-use/',
  '/contact': '/contact/',
  '/release-notes': '/release-notes/',
}

const STATUS_ROUTES = new Map<string, 403 | 404 | 429 | 500 | 503>([
  ['/403', 403],
  ['/404', 404],
  ['/429', 429],
  ['/500', 500],
  ['/503', 503],
])

function normalizePathname(pathname: string) {
  if (!pathname) return '/'
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname
}

function pathWithCurrentSearch(pathname: string, keysToRemove: string[] = []) {
  if (typeof window === 'undefined') return pathname
  const url = new URL(window.location.href)
  for (const key of keysToRemove) {
    url.searchParams.delete(key)
  }
  const nextSearch = url.searchParams.toString()
  return `${pathname}${nextSearch ? `?${nextSearch}` : ''}`
}

export default function App() {
  const [lang, setLang] = useState<'en' | 'ar'>('en')
  const isAr = lang === 'ar'

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = isAr ? 'rtl' : 'ltr'
  }, [lang, isAr])

  const copy = getSiteCopy(lang)
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''
  const normalizedPath = normalizePathname(currentPath)
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const legacyMode = String(searchParams?.get('mode') || '').trim().toLowerCase()
  const redirectTarget =
    normalizedPath === '/activate'
      ? pathWithCurrentSearch('/account/signin')
      : normalizedPath === '/login'
        ? pathWithCurrentSearch('/account/signin')
      : normalizedPath === '/account' && legacyMode === 'signup'
        ? pathWithCurrentSearch('/account/signup', ['mode'])
        : normalizedPath === '/account' && legacyMode === 'login'
          ? pathWithCurrentSearch('/account/signin', ['mode'])
          : STATIC_ROUTE_REDIRECTS[normalizedPath]
  const explicitStatus = STATUS_ROUTES.get(normalizedPath)
  const isAccountRoute = normalizedPath === '/account'
  const isSigninRoute = normalizedPath === '/account/signin'
  const isSignupRoute = normalizedPath === '/account/signup'
  const isAdminRoute =
    typeof window !== 'undefined' &&
    (normalizedPath.startsWith('/admin') || window.location.hostname.toLowerCase().startsWith('admin.'))
  const isKnownRootRoute = normalizedPath === '/'
  const fallbackStatus =
    !redirectTarget && !explicitStatus && !isAccountRoute && !isSigninRoute && !isSignupRoute && !isAdminRoute && !isKnownRootRoute ? 404 : null

  useEffect(() => {
    if (!redirectTarget || typeof window === 'undefined') return
    window.location.replace(redirectTarget)
  }, [redirectTarget])

  return (
    <div className="app-canvas relative" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="noise" aria-hidden="true" />
      {redirectTarget ? (
        <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4">
          <section className="surface-card w-full p-6 text-center">
            <p className="text-sm text-white/75">{isAr ? 'جار فتح الصفحة الصحيحة...' : 'Opening the correct page...'}</p>
          </section>
        </main>
      ) : isSigninRoute ? (
        <AuthPage lang={lang} initialMode="login" />
      ) : isSignupRoute ? (
        <AuthPage lang={lang} initialMode="signup" />
      ) : isAccountRoute ? (
        <AccountPage lang={lang} />
      ) : isAdminRoute ? (
        <AdminAuthGate lang={lang}>
          <AdminDashboard lang={lang} />
        </AdminAuthGate>
      ) : explicitStatus ? (
        <>
          <SiteHeader lang={lang} onToggleLang={() => setLang((prev) => (prev === 'en' ? 'ar' : 'en'))} />
          <ErrorStatusPage lang={lang} status={explicitStatus} path={currentPath} />
          <SiteFooter copy={copy} isAr={isAr} />
        </>
      ) : fallbackStatus ? (
        <>
          <SiteHeader lang={lang} onToggleLang={() => setLang((prev) => (prev === 'en' ? 'ar' : 'en'))} />
          <ErrorStatusPage lang={lang} status={fallbackStatus} path={currentPath} />
          <SiteFooter copy={copy} isAr={isAr} />
        </>
      ) : (
        <>
          <SiteHeader lang={lang} onToggleLang={() => setLang((prev) => (prev === 'en' ? 'ar' : 'en'))} />
          <main>
            <HeroSection copy={copy} />
            <FeaturesSection copy={copy} />
            <HowSection copy={copy} />
            <Pricing lang={lang} />
            <Feedback telegramUsername={TELEGRAM_USERNAME} lang={lang} />
            <FaqSection copy={copy} />
            <SiteFooter copy={copy} isAr={isAr} />
          </main>
        </>
      )}
    </div>
  )
}
