import { useEffect, useState } from 'react'
import { SiteHeader } from './components/SiteHeader'
import { Feedback } from './components/sections/Feedback'
import { FaqSection } from './components/sections/FaqSection'
import { FeaturesSection } from './components/sections/FeaturesSection'
import { HeroSection } from './components/sections/HeroSection'
import { HowSection } from './components/sections/HowSection'
import { Pricing } from './components/sections/Pricing'
import { SiteFooter } from './components/sections/SiteFooter'
import { AdminDashboard } from './components/admin/AdminDashboard'
import { AdminAuthGate } from './components/admin/AdminAuthGate'
import { DeviceActivation } from './components/DeviceActivation'
import { TELEGRAM_USERNAME, getSiteCopy } from './constants/siteCopy'

export default function App() {
  const [lang, setLang] = useState<'en' | 'ar'>('en')
  const isAr = lang === 'ar'

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = isAr ? 'rtl' : 'ltr'
  }, [lang, isAr])

  const copy = getSiteCopy(lang)
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''
  const isActivationRoute = currentPath.startsWith('/activate')
  const isAdminRoute =
    typeof window !== 'undefined' &&
    (currentPath.startsWith('/admin') || window.location.hostname.toLowerCase().startsWith('admin.'))

  return (
    <div className="app-canvas relative" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="noise" aria-hidden="true" />
      {isActivationRoute ? (
        <DeviceActivation lang={lang} />
      ) : isAdminRoute ? (
        <AdminAuthGate lang={lang}>
          <AdminDashboard lang={lang} />
        </AdminAuthGate>
      ) : (
        <>
          <SiteHeader lang={lang} onToggleLang={() => setLang((p) => (p === 'en' ? 'ar' : 'en'))} />
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
