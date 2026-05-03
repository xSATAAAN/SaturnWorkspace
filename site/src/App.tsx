import { useEffect, useState } from 'react'
import { SiteHeader } from './components/SiteHeader'
import { Feedback } from './components/sections/Feedback'
import { FaqSection } from './components/sections/FaqSection'
import { FeaturesSection } from './components/sections/FeaturesSection'
import { HeroSection } from './components/sections/HeroSection'
import { HowSection } from './components/sections/HowSection'
import { Pricing } from './components/sections/Pricing'
import { SiteFooter } from './components/sections/SiteFooter'
import { TELEGRAM_LINK, TELEGRAM_USERNAME, getSiteCopy } from './constants/siteCopy'

export default function App() {
  const [lang, setLang] = useState<'en' | 'ar'>('en')
  const isAr = lang === 'ar'

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = isAr ? 'rtl' : 'ltr'
  }, [lang, isAr])

  const copy = getSiteCopy(lang)

  return (
    <div className="app-canvas relative" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="noise" aria-hidden="true" />
      <SiteHeader lang={lang} onToggleLang={() => setLang((p) => (p === 'en' ? 'ar' : 'en'))} />

      <main>
        <HeroSection copy={copy} />
        <FeaturesSection copy={copy} />
        <HowSection copy={copy} />
        <Pricing telegramHref={TELEGRAM_LINK} lang={lang} />
        <Feedback telegramUsername={TELEGRAM_USERNAME} lang={lang} />
        <FaqSection copy={copy} />
        <SiteFooter copy={copy} isAr={isAr} />
      </main>
    </div>
  )
}
