/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { messages, type Locale, type MessageKey } from '../i18n/messages'

export type Theme = 'light' | 'dark'

type ExperienceContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  theme: Theme
  setTheme: (theme: Theme) => void
  t: (key: MessageKey) => string
  formatDate: (value: Date | string) => string
  formatNumber: (value: number) => string
}

const ExperienceContext = createContext<ExperienceContextValue | null>(null)
const LANGUAGE_KEY = 'saturnws.new-ui.language.v1'
const THEME_KEY = 'saturnws.new-ui.theme.v1'

function readLocale(): Locale {
  const requested = new URLSearchParams(window.location.search).get('lang')
  if (requested === 'ar' || requested === 'en') return requested
  const saved = window.localStorage.getItem(LANGUAGE_KEY)
  return saved === 'ar' ? 'ar' : 'en'
}

function readTheme(): Theme {
  const requested = new URLSearchParams(window.location.search).get('theme')
  if (requested === 'dark' || requested === 'light') return requested
  return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
}

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(readLocale)
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    const root = document.documentElement
    root.lang = locale
    root.dir = locale === 'ar' ? 'rtl' : 'ltr'
    window.localStorage.setItem(LANGUAGE_KEY, locale)
  }, [locale])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const value = useMemo<ExperienceContextValue>(() => ({
    locale,
    setLocale,
    theme,
    setTheme,
    t: (key) => messages[locale][key] ?? messages.en[key],
    formatDate: (value) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'medium' }).format(new Date(value)),
    formatNumber: (value) => new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US').format(value),
  }), [locale, theme])

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>
}

export function useExperience() {
  const context = useContext(ExperienceContext)
  if (!context) throw new Error('useExperience must be used inside ExperienceProvider')
  return context
}
