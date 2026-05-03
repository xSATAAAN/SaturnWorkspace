import type { ReactNode } from 'react'

export type Lang = 'en' | 'ar'

export type FeatureIconName = 'vault' | 'gmail' | 'ip' | 'cloud' | 'session' | 'proxy'

export type StatItem = {
  label: string
  value: string
  hint: string
}

export type FeatureItem = {
  icon: FeatureIconName
  title: string
  desc: string
}

export type HowItem = {
  step: string
  title: string
  desc: string
}

export type FaqItem = {
  q: string
  a: string
}

export type SiteCopy = {
  heroBadge: string
  heroTitleA: string
  heroTitleB: string
  heroTitleC: string
  heroDesc: string
  ctaStart: string
  ctaExplore: string
  stats: StatItem[]
  featuresTag: string
  featuresTitle: string
  featuresDesc: string
  features: FeatureItem[]
  howTag: string
  howTitle: string
  how: HowItem[]
  faqTag: string
  faqTitle: string
  faq: FaqItem[]
  footerDesc: string
  footerPrivacy: string
  footerTerms: string
  footerRefund: string
  footerUpdates: string
}

export type FeaturePaths = Record<FeatureIconName, ReactNode>
