import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Bug,
  Check,
  Copy,
  CreditCard,
  Download,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  Monitor,
  PackageOpen,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Tags,
  Users,
  WalletCards,
} from 'lucide-react'
import type { AdminAuditLogItem, AdminCrashGroup, AdminCrashLog, AdminRemoteControls, AdminSubscription, AdminSupportThread } from '../../../api/admin'
import type { AccountSubscription } from '../../../api/account'
import { useAdapters } from '../../adapters/AdapterProvider'
import type { CustomerSupportThread, PlanInfo, ReleaseInfo } from '../../adapters/contracts'
import { useExperience } from '../../app/ExperienceProvider'
import { createAuthRoute, createPricingReturnState, currentInternalLocation, readAuthIntent, readCheckoutPlan } from '../../app/navigationIntent'
import { routeFromInternalUrl } from '../../app/productionRouter'
import { Button } from '../../components/ui/Button'
import { CheckoutDialog } from '../../components/CheckoutDialog'
import { GoogleIcon } from '../../components/icons/GoogleIcon'
import { Card, DataTable, PageHeader, SectionHeader, StatCard, TableToolbar, type Column } from '../../components/ui/DataDisplay'
import { Alert, Badge, EmptyState, FullPageState } from '../../components/ui/Feedback'
import { Checkbox, FormField, Input, OTPInput, PasswordInput, Select, Textarea } from '../../components/ui/FormControls'
import { Accordion, Tabs } from '../../components/ui/Navigation'
import { Drawer } from '../../components/ui/Overlays'
import { DownloadCard, PricingCard, SubscriptionCard } from '../../components/ui/ProductCards'
import { publicCopy } from '../../content/publicCopy'
import { isProductionFeatureEnabled } from '../../adapters/productionFeatureFlags'
import { PublicLayout, WorkspaceShell, type NavigationGroup } from '../../layouts/WorkspaceShell'
import { Brand, LocaleControl, ThemeControl } from '../../layouts/SharedChrome'
import appIcon from '../../assets/saturnws-app-icon.png'
import type { Navigate } from '../../app/routes'
import type { MessageKey } from '../../i18n/messages'
import { useAuthState } from '../../hooks/useAuthState'

type AsyncState<T> = { loading: boolean; data: T | null; error: string | null }
const PENDING_EMAIL_VERIFICATION_KEY = 'saturnws.production.pendingEmailVerification.v1'
const LOCAL_EMAIL_VERIFICATION_TEST_CODE_KEY = 'saturnws.production.localEmailVerificationCode.v1'
const EMAIL_SUPPORT_ENABLED = false

function copyByLocale(locale: 'ar' | 'en', en: string, ar: string) {
  return locale === 'ar' ? ar : en
}

function stableTicketNumber(id: string, createdAt?: string | null, updatedAt?: string | null) {
  const year = (createdAt || updatedAt || new Date().toISOString()).slice(0, 4).replace(/\D/g, '') || '2026'
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return `SAT-${year}-${String(hash % 1000000).padStart(6, '0')}`
}

function supportStatusTone(status?: string) {
  const normalized = String(status || 'open').toLowerCase()
  if (normalized === 'closed') return 'neutral' as const
  if (normalized === 'resolved') return 'success' as const
  if (normalized === 'waiting_for_customer' || normalized === 'answered') return 'warning' as const
  return 'info' as const
}

function supportStatusLabel(status: string | undefined, locale: 'ar' | 'en') {
  const normalized = String(status || 'open').toLowerCase()
  const labels: Record<string, { en: string; ar: string }> = {
    open: { en: 'Open', ar: 'مفتوحة' },
    waiting_for_support: { en: 'Waiting for support', ar: 'بانتظار الدعم' },
    waiting_for_customer: { en: 'Waiting for customer', ar: 'بانتظار العميل' },
    answered: { en: 'Waiting for customer', ar: 'بانتظار العميل' },
    resolved: { en: 'Resolved', ar: 'تم الحل' },
    closed: { en: 'Closed', ar: 'مغلقة' },
  }
  const item = labels[normalized] || labels.open
  return locale === 'ar' ? item.ar : item.en
}

function formatBytes(bytes?: number) {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function useAsyncData<T>(load: () => Promise<T>, deps: React.DependencyList): AsyncState<T> & { reload: () => void } {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<AsyncState<T>>({ loading: true, data: null, error: null })
  useEffect(() => {
    let alive = true
    Promise.resolve()
      .then(load)
      .then((data) => {
        if (alive) setState({ loading: false, data, error: null })
      })
      .catch((error) => {
        if (alive) setState({ loading: false, data: null, error: error instanceof Error ? error.message : 'request_failed' })
      })
    return () => {
      alive = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])
  return { ...state, reload: () => setVersion((value) => value + 1) }
}

function LoadingBlock({ label }: { label: string }) {
  return <Card><div className="stack"><strong>{label}</strong><div className="download-skeleton"><span /><span /><span /></div></div></Card>
}

function ErrorBlock({ error, onRetry }: { error: string; onRetry?: () => void }) {
  const { t } = useExperience()
  return <Alert title={t('failed')} tone="danger" action={onRetry ? <Button size="sm" onClick={onRetry}>{t('retry')}</Button> : undefined}>{error}</Alert>
}

function authErrorMessage(error: unknown, t: (key: MessageKey) => string) {
  const raw = error instanceof Error ? error.message : String(error || '')
  const key = raw.toLowerCase()
  if (key.includes('invalid-credential') || key.includes('user-not-found') || key.includes('wrong-password') || key.includes('invalid_credentials')) return t('invalidCredentials')
  if (key.includes('network') || key.includes('failed to fetch') || key.includes('auth/network-request-failed')) return t('authUnavailable')
  return t('failed')
}

function RequireAuth({ children, navigate }: { children: ReactNode; navigate: Navigate }) {
  const { t } = useExperience()
  const { ready, user } = useAuthState()
  if (!ready) return <FullPageState icon={ShieldCheck} title={t('loading')} body={t('accountOverviewBody')} primaryLabel={t('retry')} onPrimary={() => window.location.reload()} />
  if (!user) return <FullPageState icon={KeyRound} title={t('signIn')} body={t('signInBody')} primaryLabel={t('signIn')} onPrimary={() => navigate(createAuthRoute('signin', { returnTo: currentInternalLocation() }))} secondaryLabel={t('signUp')} onSecondary={() => navigate(createAuthRoute('signup', { returnTo: currentInternalLocation() }))} />
  return children
}

export function PublicProductionPages({ page, routeState, navigate }: { page: string; routeState?: string; navigate: Navigate }) {
  const { t, locale } = useExperience()
  const adapters = useAdapters()
  const { ready, user } = useAuthState()
  const c = publicCopy[locale]
  const plans = useAsyncData(() => adapters.plans.listPlans(locale), [adapters, locale])
  const release = useAsyncData(() => adapters.releases.getLatest('beta'), [adapters])
  let content: ReactNode
  if (page === 'pricing') content = <PricingSection page={page} routeState={routeState} plans={plans.data || []} loading={plans.loading} navigate={navigate} />
  else if (page === 'product' || page === 'features') content = <ProductDetailsSection />
  else if (page === 'download') content = <DownloadSection release={release.data} loading={release.loading} error={release.error} reload={release.reload} />
  else if (page === 'releases' || page === 'changelog') content = <ReleaseNotes release={release.data} loading={release.loading} error={release.error} />
  else if (page === 'faq') content = <FaqSection />
  else if (page === 'contact' || page === 'support') content = <PublicContact navigate={navigate} />
  else if (['privacy', 'terms', 'refund', 'acceptable-use', 'cookies'].includes(page)) content = <LegalSection page={page} />
  else if (page === '404') content = <FullPageState icon={ShieldAlert} title={t('system404')} body={t('systemBody')} primaryLabel={t('back')} onPrimary={() => navigate({ surface: 'public', page: 'home' })} />
  else {
    const primaryLabel = ready && user ? t('account') : c.heroPrimary
    const primaryAction = () => ready && user ? navigate({ surface: 'portal', page: 'overview' }) : navigate(createAuthRoute('signup', { returnTo: currentInternalLocation() }))
    content = <><section className="marketing-hero"><div className="container"><div className="marketing-hero__copy"><span className="announcement">{c.announcement}</span><h1>{c.heroTitle}</h1><p>{c.heroBody}</p><div className="hero-actions"><Button size="lg" variant="primary" disabled={!ready} onClick={primaryAction}>{primaryLabel}</Button><Button size="lg" variant="ghost" onClick={() => navigate({ surface: 'public', page: 'pricing' })}>{t('pricing')}</Button></div><ul><li><Monitor size={15} />{c.proofOne}</li><li><ShieldCheck size={15} />{c.proofTwo}</li><li><Download size={15} />{c.proofThree}</li></ul></div><Card className="hero-product-reveal"><SectionHeader title={c.sessionsTitle} description={c.sessionsBody} /><div className="value-line"><span>{c.stepAccount}</span><span>{c.stepProfile}</span><span>{c.stepLaunch}</span></div></Card></div></section><section className="marketing-section"><div className="container split-feature"><div><span className="section-index">01</span><SectionHeader title={c.accountsTitle} description={c.accountsBody} /></div><Card><SectionHeader title={c.backupTitle} description={c.backupBody} /></Card></div></section><PricingSection page={page} routeState={routeState} plans={plans.data || []} loading={plans.loading} navigate={navigate} compact /><section className="final-cta"><div className="container"><div><h2>{c.finalTitle}</h2><p>{c.finalBody}</p></div><Button size="lg" variant="primary" disabled={!ready} onClick={primaryAction}>{primaryLabel}</Button></div></section></>
  }
  return <PublicLayout navigate={navigate}>{content}</PublicLayout>
}

function ProductDetailsSection() {
  const { locale } = useExperience()
  const c = publicCopy[locale]
  const sections = [
    { title: c.sessionsTitle, body: c.sessionsBody },
    { title: c.accountsTitle, body: c.accountsBody },
    { title: c.backupTitle, body: c.backupBody },
    { title: c.proxyTitle, body: c.proxyBody },
  ]
  return <section className="marketing-section page-enter"><div className="container"><header className="marketing-heading marketing-heading--center marketing-heading--wide"><h1>{c.productPageTitle}</h1><p>{c.productPageBody}</p></header><div className="feature-grid">{sections.map((section) => <Card key={section.title}><SectionHeader title={section.title} description={section.body} /></Card>)}</div></div></section>
}

function PricingSection({ page, routeState, plans, loading, navigate, compact = false }: { page: string; routeState?: string; plans: PlanInfo[]; loading: boolean; navigate: Navigate; compact?: boolean }) {
  const { t, locale } = useExperience()
  const { ready, user } = useAuthState()
  const c = publicCopy[locale]
  const featuresForPlan = () => [c.featureWorkspace, c.featureProfiles, c.featureUpdates]
  const [selectedPlan, setSelectedPlan] = useState<PlanInfo | null>(null)
  const requestedPlan = readCheckoutPlan(routeState)
  const requestedCheckoutPlan = ready && user && requestedPlan && !loading
    ? plans.find((plan) => plan.id === requestedPlan) ?? null
    : null
  const activeCheckoutPlan = selectedPlan ?? requestedCheckoutPlan
  const choosePlan = (plan: PlanInfo) => {
    if (!ready) return
    if (!user) {
      navigate(createAuthRoute('signup', { returnTo: currentInternalLocation().split('?')[0], plan: plan.id, checkout: true }))
      return
    }
    setSelectedPlan(plan)
  }
  const closeCheckout = () => {
    setSelectedPlan(null)
    if (requestedPlan) navigate({ surface: 'public', page })
  }
  const trialLabel = locale === 'ar' ? 'ابدأ بـ 7 أيام مجانًا' : 'Start with 7 days free'
  const getCta = (plan: PlanInfo) => {
    if (!ready) return t('loading')
    if (user) return locale === 'ar' ? 'اختر الخطة' : 'Choose plan'
    return plan.id === 'weekly' ? t('getStarted') : (locale === 'ar' ? 'ابدأ التجربة المجانية' : 'Start free trial')
  }
  return <section className={`marketing-section pricing-section${compact ? '' : ' pricing-page'}`}><div className="container"><header className="marketing-heading marketing-heading--center">{compact ? <h2>{c.pricingTitle}</h2> : <h1>{c.pricingTitle}</h1>}<p>{c.pricingBody}</p></header><div className="pricing-promo">{c.trialPromo}</div>{loading ? <LoadingBlock label={t('loading')} /> : <div className="pricing-grid">{plans.map((plan) => <PricingCard key={plan.id} name={plan.name} description={plan.description} price={plan.price} originalPrice={plan.originalPrice} period={plan.period} features={featuresForPlan()} cta={getCta(plan)} featured={plan.id === 'monthly'} featuredLabel={c.recommended} trialLabel={plan.id === 'monthly' || plan.id === 'yearly' ? trialLabel : undefined} disabled={!ready} onClick={() => choosePlan(plan)} />)}</div>}<p className="pricing-trust-note"><ShieldCheck size={15} />{c.trustNote}</p></div><CheckoutDialog open={Boolean(activeCheckoutPlan)} plan={activeCheckoutPlan} user={user} features={activeCheckoutPlan ? featuresForPlan() : []} onClose={closeCheckout} /></section>
}

function FaqSection() {
  const { locale } = useExperience()
  const c = publicCopy[locale]
  const items = [
    { id: 'windows', title: c.faqWindows, body: c.faqWindowsBody },
    { id: 'profiles', title: c.faqProfiles, body: c.faqProfilesBody },
    { id: 'backup', title: c.faqBackup, body: c.faqBackupBody },
    { id: 'proxy', title: c.faqProxy, body: c.faqProxyBody },
  ]
  return <section className="marketing-section faq-section page-enter"><div className="container narrow-page"><header className="marketing-heading marketing-heading--center"><h1>{c.faqTitle}</h1></header><Accordion items={items} /></div></section>
}

function DownloadSection({ release, loading, error, reload }: { release: ReleaseInfo | null; loading: boolean; error: string | null; reload: () => void }) {
  const { t, locale } = useExperience()
  const [downloading, setDownloading] = useState(false)
  if (loading) return <div className="marketing-section"><div className="container narrow-page"><LoadingBlock label={t('loading')} /></div></div>
  const meta = [
    release?.version ? `${t('version')}: ${release.version}` : '',
    release?.architecture || '',
    formatBytes(release?.sizeBytes),
    release?.filename || '',
  ].filter(Boolean)
  const startDownload = () => {
    if (!release?.downloadUrl) return
    setDownloading(true)
    window.location.href = release.downloadUrl
    window.setTimeout(() => setDownloading(false), 1400)
  }
  return <div className="marketing-section page-enter"><div className="container narrow-page"><header className="marketing-heading marketing-heading--center"><img className="download-product-icon" src={appIcon} alt="" /><h1>{t('downloadTitle')}</h1><p>{t('downloadBody')}</p></header>{error ? <ErrorBlock error={error} onRetry={reload} /> : release?.available && release.downloadUrl ? <Card className="download-simple-card"><div><span className="download-simple-card__mark"><Download size={25} /></span><h2>{t('downloadForWindows')}</h2><p>{copyByLocale(locale, 'Get the current Windows package published for Saturn Workspace.', 'نزّل حزمة Windows الحالية المنشورة لـ Saturn Workspace.')}</p><div className="download-simple-card__meta">{meta.map((item) => <span key={item}>{item}</span>)}</div></div><Button size="lg" variant="primary" leadingIcon={<Download size={17} />} loading={downloading} onClick={startDownload}>{t('downloadForWindows')}</Button></Card> : <EmptyState icon={Download} title={t('noRelease')} body={t('releaseUnavailable')} action={<Button onClick={reload}>{t('retry')}</Button>} />}</div></div>
}

function ReleaseNotes({ release, loading, error }: { release: ReleaseInfo | null; loading: boolean; error: string | null }) {
  const { t } = useExperience()
  return <div className="marketing-section page-enter"><div className="container narrow-page"><header className="marketing-heading marketing-heading--center"><h1>{t('releases')}</h1></header>{loading ? <LoadingBlock label={t('loading')} /> : error ? <ErrorBlock error={error} /> : <Card><dl className="detail-list"><div><dt>{t('version')}</dt><dd>{release?.version || t('unavailable')}</dd></div><div><dt>{t('status')}</dt><dd>{release?.available ? t('active') : t('unavailable')}</dd></div><div><dt>{t('releaseNotes')}</dt><dd>{release?.notes || t('releaseUnavailable')}</dd></div></dl></Card>}</div></div>
}

function PublicContact({ navigate }: { navigate: Navigate }) {
  const { t } = useExperience()
  return <div className="marketing-section page-enter"><div className="container contact-grid"><div><LifeBuoy size={28} /><h1>{t('contact')}</h1><p>{t('signInBody')}</p></div><Card><Alert title={t('signIn')} tone="info" action={<Button variant="primary" onClick={() => navigate(createAuthRoute('signin', { returnTo: currentInternalLocation() }))}>{t('signIn')}</Button>}>{t('integrationPending')}</Alert></Card></div></div>
}

function LegalSection({ page }: { page: string }) {
  const { t, locale } = useExperience()
  const adapters = useAdapters()
  const legal = useAsyncData(() => adapters.content.getLegalPage(page, locale), [adapters, page, locale])
  return <div className="marketing-section page-enter"><article className="container legal-document">{legal.loading ? <LoadingBlock label={t('loading')} /> : legal.error ? <ErrorBlock error={legal.error} /> : <><h1>{legal.data?.title}</h1><p>{legal.data?.body}</p></>}</article></div>
}

export function AuthProductionPages({ page, routeState, navigate }: { page: string; routeState?: string; navigate: Navigate }) {
  if (page === 'verify') return <EmailVerificationProductionPage routeState={routeState} navigate={navigate} />
  return <EmailPasswordProductionPage page={page} routeState={routeState} navigate={navigate} />
}

function ProductionAuthShell({ children, navigate }: { children: ReactNode; navigate: Navigate }) {
  const { t, locale } = useExperience()
  const Arrow = locale === 'ar' ? ArrowRight : ArrowLeft
  return <main className="auth-shell"><header className="auth-header"><Brand onClick={() => navigate({ surface: 'public', page: 'home' })} /><div><LocaleControl /><ThemeControl /></div></header><section className="auth-main"><div className="auth-form-wrap">{children}</div><Button className="auth-back" variant="ghost" leadingIcon={<Arrow size={16} />} onClick={() => navigate({ surface: 'public', page: 'home' })}>{t('back')}</Button></section></main>
}

function destinationAfterAuth(routeState?: string) {
  const intent = readAuthIntent(routeState)
  const destination = routeFromInternalUrl(intent.returnTo || '/account')
  if (intent.checkout && intent.plan) return { ...destination, state: createPricingReturnState(intent.plan) }
  return destination
}

function EmailPasswordProductionPage({ page, routeState, navigate }: { page: string; routeState?: string; navigate: Navigate }) {
  const { t, locale } = useExperience()
  const { auth } = useAdapters()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const signup = page === 'signup'
  const passwordLongEnough = password.length >= 6
  const passwordsMatch = Boolean(confirmPassword) && password === confirmPassword
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (signup && !passwordLongEnough) {
      setError(locale === 'ar' ? 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.' : 'Password must contain at least 6 characters.')
      return
    }
    if (signup && !passwordsMatch) {
      setError(locale === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.')
      return
    }
    if (signup && !acceptedTerms) {
      setError(locale === 'ar' ? 'يجب الموافقة على شروط الخدمة وسياسة الخصوصية.' : 'You must agree to the Terms of Service and Privacy Policy.')
      return
    }
    setLoading(true)
    try {
      if (signup) {
        await auth.signUpWithEmail(email, password)
        if (isProductionFeatureEnabled('emailVerification')) {
          const verification = await auth.requestEmailVerification(email)
          if (!verification.success) throw new Error(verification.error || 'email_verification_failed')
          window.sessionStorage.setItem(PENDING_EMAIL_VERIFICATION_KEY, email.trim())
          if (verification.testCode) window.sessionStorage.setItem(LOCAL_EMAIL_VERIFICATION_TEST_CODE_KEY, verification.testCode)
          navigate({ surface: 'auth', page: 'verify', state: routeState })
          return
        }
      } else {
        await auth.signInWithEmail(email, password)
      }
      navigate(destinationAfterAuth(routeState))
    } catch (err) {
      setError(authErrorMessage(err, t))
    } finally {
      setLoading(false)
    }
  }
  const reset = async () => {
    if (!email.trim()) {
      setError('email_required')
      return
    }
    setLoading(true)
    setError('')
    try {
      await auth.sendPasswordReset(email)
      setNotice(locale === 'ar' ? 'أرسلنا رابط استعادة كلمة المرور إلى بريدك إذا كان الحساب مسجلًا.' : 'A password reset link was sent if this email is registered.')
    } catch (err) {
      setError(authErrorMessage(err, t))
    } finally {
      setLoading(false)
    }
  }
  return <ProductionAuthShell navigate={navigate}><div className={`auth-card auth-card--${signup ? 'signup' : 'signin'}`}><div className="auth-form"><header><span>{signup ? copyByLocale(locale, 'Create your workspace access', 'ابدأ إعداد مساحة عملك') : copyByLocale(locale, 'Secure account access', 'دخول آمن للحساب')}</span><h1>{signup ? t('signUpTitle') : t('signInTitle')}</h1><p>{signup ? copyByLocale(locale, 'Create one account for subscriptions, downloads, support, and your desktop sign-in.', 'أنشئ حسابًا واحدًا للاشتراك والتنزيلات والدعم وتسجيل الدخول إلى الأداة.') : t('signInBody')}</p></header><form className="stack" onSubmit={submit} noValidate><FormField label={t('email')} htmlFor="auth-email" required><Input id="auth-email" type="email" autoComplete="email" placeholder={locale === 'ar' ? 'name@example.com' : 'name@example.com'} value={email} onChange={(event) => setEmail(event.target.value)} required /></FormField><FormField label={t('password')} htmlFor="auth-password" required><PasswordInput id="auth-password" autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required /></FormField>{signup ? <><FormField label={t('confirmPassword')} htmlFor="auth-confirm-password" required error={confirmPassword && !passwordsMatch ? (locale === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.') : undefined}><PasswordInput id="auth-confirm-password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></FormField><div className="password-requirements" aria-live="polite"><strong>{locale === 'ar' ? 'متطلبات كلمة المرور' : 'Password requirements'}</strong><span className={passwordLongEnough ? 'is-valid' : ''}><Check size={14} />{locale === 'ar' ? '6 أحرف على الأقل' : 'At least 6 characters'}</span><span className={passwordsMatch ? 'is-valid' : ''}><Check size={14} />{locale === 'ar' ? 'تطابق كلمتي المرور' : 'Both passwords match'}</span></div><Checkbox checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required label={<span>{locale === 'ar' ? 'أوافق على ' : 'I agree to the '}<a href="/terms">{t('terms')}</a>{locale === 'ar' ? ' و' : ' and the '}<a href="/privacy">{t('privacy')}</a></span>} /></> : <div className="auth-form__options"><Button type="button" variant="text" onClick={reset}>{t('forgotPassword')}</Button></div>}{error ? <Alert title={t('failed')} tone="danger">{error}</Alert> : null}{notice ? <Alert title={t('success')} tone="success">{notice}</Alert> : null}<Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>{signup ? t('signUp') : t('signIn')}</Button></form><div className="auth-divider"><span>{t('orContinue')}</span></div><Button type="button" fullWidth size="lg" leadingIcon={<GoogleIcon />} onClick={async () => { setLoading(true); setError(''); try { await auth.signInWithGoogle(); navigate(destinationAfterAuth(routeState)) } catch (err) { setError(authErrorMessage(err, t)) } finally { setLoading(false) } }}>{t('continueGoogle')}</Button><p className="auth-switch">{signup ? t('haveAccount') : t('noAccount')} <button type="button" onClick={() => navigate({ surface: 'auth', page: signup ? 'signin' : 'signup', state: routeState })}>{signup ? t('signIn') : t('signUp')}</button></p></div></div></ProductionAuthShell>
}

function EmailVerificationProductionPage({ routeState, navigate }: { routeState?: string; navigate: Navigate }) {
  const { t } = useExperience()
  const { auth } = useAdapters()
  const [email, setEmail] = useState(() => window.sessionStorage.getItem(PENDING_EMAIL_VERIFICATION_KEY) || '')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(() => {
    const testCode = window.sessionStorage.getItem(LOCAL_EMAIL_VERIFICATION_TEST_CODE_KEY)
    return testCode ? `${t('demoOnly')}: ${testCode}` : ''
  })
  const [loading, setLoading] = useState(false)
  const verify = async () => {
    if (!email.trim()) {
      setError('email_required')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await auth.verifyEmailCode(email, code)
      if (!result.success) throw new Error(result.error || 'EMAIL_CODE_INVALID')
      window.sessionStorage.removeItem(PENDING_EMAIL_VERIFICATION_KEY)
      window.sessionStorage.removeItem(LOCAL_EMAIL_VERIFICATION_TEST_CODE_KEY)
      navigate(destinationAfterAuth(routeState))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('codeInvalid'))
    } finally {
      setLoading(false)
    }
  }
  const resend = async () => {
    if (!email.trim()) {
      setError('email_required')
      return
    }
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const result = await auth.requestEmailVerification(email)
      if (!result.success) throw new Error(result.error || 'EMAIL_RESEND_LIMITED')
      if (result.testCode) {
        window.sessionStorage.setItem(LOCAL_EMAIL_VERIFICATION_TEST_CODE_KEY, result.testCode)
        setNotice(`${t('demoOnly')}: ${result.testCode}`)
      } else {
        setNotice(t('success'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'EMAIL_RESEND_LIMITED')
    } finally {
      setLoading(false)
    }
  }
  return <ProductionAuthShell navigate={navigate}><div className="auth-card"><div className="auth-form auth-form--center"><span className="auth-icon"><Mail size={23} /></span><header><h1>{t('verificationTitle')}</h1><p>{t('verificationBody')}</p>{email ? <strong>{email}</strong> : null}</header><form className="stack" onSubmit={(event) => { event.preventDefault(); void verify() }}><FormField label={t('email')} htmlFor="verify-email" required><Input id="verify-email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); window.sessionStorage.setItem(PENDING_EMAIL_VERIFICATION_KEY, event.target.value) }} required /></FormField><OTPInput value={code} onChange={setCode} label={t('codeLabel')} />{error ? <Alert title={t('failed')} tone="danger">{error}</Alert> : null}{notice ? <Alert title={t('success')} tone="success">{notice}</Alert> : null}<Button type="submit" variant="primary" size="lg" fullWidth loading={loading} disabled={code.length !== 6}>{t('continue')}</Button><div className="cluster"><Button type="button" variant="text" onClick={resend} disabled={loading}>{t('resend')}</Button><Button type="button" variant="text" onClick={() => navigate({ surface: 'auth', page: 'signup', state: routeState })}>{t('changeEmail')}</Button></div></form></div></div></ProductionAuthShell>
}

export function PortalProductionPages({ page, navigate }: { page: string; navigate: Navigate }) {
  const { t } = useExperience()
  const groups = useMemo<NavigationGroup[]>(() => [{ items: [
    { id: 'overview', label: t('overview'), icon: LayoutDashboard },
    { id: 'subscription', label: t('subscription'), icon: CreditCard },
    { id: 'payments', label: t('payments'), icon: WalletCards },
    { id: 'downloads', label: t('downloads'), icon: Download },
    { id: 'devices', label: t('devices'), icon: Monitor },
    { id: 'notifications', label: t('notifications'), icon: Bell },
    { id: 'support', label: t('support'), icon: LifeBuoy },
    { id: 'security', label: t('security'), icon: ShieldCheck },
    { id: 'settings', label: t('settings'), icon: Settings },
  ] }], [t])
  const title = groups[0].items.find((item) => item.id === page)?.label || t('overview')
  return <RequireAuth navigate={navigate}><WorkspaceShell surface="portal" page={page} title={title} groups={groups} navigate={navigate}>{page === 'subscription' ? <PortalSubscription /> : page === 'downloads' ? <PortalDownloads /> : page === 'support' ? <PortalSupport /> : page === 'security' || page === 'settings' ? <PortalSettings /> : page === 'payments' ? <PortalPayments /> : page === 'devices' ? <PortalDevices /> : page === 'notifications' ? <PortalNotifications /> : <PortalOverview navigate={navigate} />}</WorkspaceShell></RequireAuth>
}

function PortalOverview({ navigate }: { navigate: Navigate }) {
  const { t } = useExperience()
  const adapters = useAdapters()
  const subscription = useAsyncData(() => adapters.account.getSubscription(), [adapters])
  const release = useAsyncData(() => adapters.releases.getLatest('beta'), [adapters])
  return <><PageHeader title={t('overview')} description={t('accountOverviewBody')} />{subscription.error ? <ErrorBlock error={subscription.error} onRetry={subscription.reload} /> : null}<div className="portal-overview-grid"><div className="stack"><SubscriptionSummary data={subscription.data} loading={subscription.loading} /><Card><SectionHeader title={t('latestRelease')} action={<Button variant="text" onClick={() => navigate({ surface: 'portal', page: 'downloads' })}>{t('viewAll')}</Button>} />{release.loading ? <LoadingBlock label={t('loading')} /> : <DownloadCard title={t('downloadForWindows')} version={release.data?.version || t('unavailable')} meta={[release.data?.available ? t('active') : t('unavailable')]} buttonLabel={t('downloads')} disabled={!release.data?.available} onClick={() => { if (release.data?.downloadUrl) window.location.href = release.data.downloadUrl }} />}</Card></div><aside className="portal-notices"><SectionHeader title={t('notifications')} /><Alert title={t('integrationPending')} tone="info">{t('noNotifications')}</Alert></aside></div></>
}

function SubscriptionSummary({ data, loading }: { data: AccountSubscription | null; loading: boolean }) {
  const { t } = useExperience()
  if (loading) return <LoadingBlock label={t('subscription')} />
  const sub = data?.subscription
  return <SubscriptionCard title={t('subscriptionStatus')} status={sub?.status || data?.status || t('unavailable')} details={[{ label: t('email'), value: data?.user?.email || sub?.user_email || '—' }, { label: t('plan'), value: sub?.plan || sub?.tier || t('planUnavailable') }, { label: t('expiresOn'), value: sub?.expires_at || '—' }, { label: t('status'), value: sub?.status || data?.status || '—' }]} />
}

function PortalSubscription() {
  const { t } = useExperience()
  const adapters = useAdapters()
  const subscription = useAsyncData(() => adapters.account.getSubscription(), [adapters])
  return <><PageHeader title={t('subscription')} description={t('accountOverviewBody')} />{subscription.error ? <ErrorBlock error={subscription.error} onRetry={subscription.reload} /> : <SubscriptionSummary data={subscription.data} loading={subscription.loading} />}<Alert title={t('decisionRequired')} tone="info">{t('pricingBody')}</Alert></>
}

function PortalDownloads() {
  const { t } = useExperience()
  const adapters = useAdapters()
  const release = useAsyncData(() => adapters.releases.getLatest('beta'), [adapters])
  return <><PageHeader title={t('downloads')} description={t('downloadBody')} />{release.loading ? <LoadingBlock label={t('loading')} /> : release.error ? <ErrorBlock error={release.error} onRetry={release.reload} /> : <DownloadCard title={t('downloadForWindows')} version={release.data?.version || t('unavailable')} meta={[release.data?.filename || t('fileSize'), release.data?.sha256 || t('releaseNotes')]} buttonLabel={t('downloads')} disabled={!release.data?.available} onClick={() => { if (release.data?.downloadUrl) window.location.href = release.data.downloadUrl }} />}</>
}

function PortalPayments() {
  const { t } = useExperience()
  return <><PageHeader title={t('payments')} description={t('accountOverviewBody')} /><EmptyState icon={ReceiptText} title={t('noInvoices')} body={t('backendRequired')} /><Alert title={t('decisionRequired')} tone="warning">{t('pricingBody')}</Alert></>
}

function PortalDevices() {
  const { t } = useExperience()
  return <><PageHeader title={t('devices')} description={t('noSessions')} /><Alert title={t('backendRequired')} tone="warning">{t('noSessions')}</Alert></>
}

function PortalNotifications() {
  const { t } = useExperience()
  return <><PageHeader title={t('notifications')} description={t('accountOverviewBody')} /><EmptyState icon={Bell} title={t('noNotifications')} body={t('backendRequired')} /></>
}

function PortalSupport() {
  const { t, locale } = useExperience()
  const { support } = useAdapters()
  const [selected, setSelected] = useState<CustomerSupportThread | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [reply, setReply] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const threads = useAsyncData(() => support.listThreads(), [support])
  const thread = useAsyncData(() => selected ? support.getThread(selected.id) : Promise.resolve({ messages: [] }), [support, selected?.id])
  const visibleThreads = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (threads.data || []).filter((row) => {
      const ticketNumber = stableTicketNumber(row.id, row.updatedAt)
      const status = String(row.status || 'open').toLowerCase()
      const matchesStatus = !statusFilter || status === statusFilter || (statusFilter === 'waiting_for_customer' && status === 'answered')
      const matchesSearch = !query || row.subject.toLowerCase().includes(query) || ticketNumber.toLowerCase().includes(query)
      return matchesStatus && matchesSearch
    })
  }, [threads.data, search, statusFilter])

  const createTicket = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await support.createTicket({ subject, body })
      if (!result.success) throw new Error(result.error || 'support_ticket_failed')
      setSubject('')
      setBody('')
      setNotice(t('success'))
      threads.reload()
      if (result.threadId) setSelected({ id: result.threadId, subject, status: 'open', updatedAt: new Date().toISOString() })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'support_ticket_failed')
    } finally {
      setBusy(false)
    }
  }

  const sendReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      const result = await support.replyThread(selected.id, reply)
      if (!result.success) throw new Error(result.error || 'support_reply_failed')
      setReply('')
      setNotice(t('success'))
      thread.reload()
      threads.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'support_reply_failed')
    } finally {
      setBusy(false)
    }
  }

  const setSelectedStatus = async (status: 'open' | 'closed') => {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      const result = await support.setThreadStatus(selected.id, status)
      if (!result.success) throw new Error(result.error || 'support_status_failed')
      setSelected({ ...selected, status: result.status || status, updatedAt: new Date().toISOString() })
      setNotice(t('success'))
      thread.reload()
      threads.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'support_status_failed')
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<CustomerSupportThread>[] = [
    { key: 'ticket', header: '#', render: (row) => <strong>{stableTicketNumber(row.id, row.updatedAt)}</strong> },
    { key: 'subject', header: t('support'), render: (row) => <div><strong>{row.subject}</strong><small className="muted">{row.lastMessageAt || row.updatedAt || ''}</small></div> },
    { key: 'status', header: t('status'), render: (row) => <Badge tone={supportStatusTone(row.status)}>{supportStatusLabel(row.status, locale)}</Badge> },
    { key: 'unread', header: t('notifications'), render: (row) => row.unreadCount ? <Badge tone="info">{row.unreadCount}</Badge> : '0' },
    { key: 'updated', header: t('date'), render: (row) => row.updatedAt || '—' },
  ]

  return <><PageHeader title={t('support')} description={t('recentSupport')} /><div className="portal-two-column"><Card><SectionHeader title={t('createTicket')} description={copyByLocale(locale, 'Support replies appear in this portal. Email delivery is not enabled yet.', 'ستظهر ردود الدعم داخل هذه البوابة. إرسال البريد غير مفعّل حاليًا.')} /><form className="settings-form" onSubmit={createTicket}><FormField label={t('details')} htmlFor="support-subject" required><Input id="support-subject" value={subject} maxLength={160} onChange={(event) => setSubject(event.target.value)} required /></FormField><FormField label={t('support')} htmlFor="support-body" required><Textarea id="support-body" value={body} maxLength={4000} onChange={(event) => setBody(event.target.value)} required /></FormField><Button type="submit" variant="primary" loading={busy}>{t('createTicket')}</Button></form></Card><Card><SectionHeader title={t('recentSupport')} /><TableToolbar searchLabel={t('search')} searchValue={search} onSearch={setSearch} filters={<Select aria-label={t('status')} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">{t('status')}</option><option value="open">{supportStatusLabel('open', locale)}</option><option value="waiting_for_support">{supportStatusLabel('waiting_for_support', locale)}</option><option value="waiting_for_customer">{supportStatusLabel('waiting_for_customer', locale)}</option><option value="resolved">{supportStatusLabel('resolved', locale)}</option><option value="closed">{supportStatusLabel('closed', locale)}</option></Select>} />{threads.error ? <ErrorBlock error={threads.error} onRetry={threads.reload} /> : <DataTable columns={columns} rows={visibleThreads} loading={threads.loading} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('support')} onRowClick={(row) => { setSelected(row); setError(''); setNotice('') }} />}</Card></div>{error ? <Alert title={t('failed')} tone="danger">{error}</Alert> : null}{notice ? <Alert title={t('success')} tone="success">{notice}</Alert> : null}<Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? stableTicketNumber(selected.id, selected.updatedAt) : t('support')} description={selected?.subject} closeLabel={t('close')}><div className="support-ticket-meta"><Badge tone={supportStatusTone(thread.data?.thread?.status || selected?.status)}>{supportStatusLabel(thread.data?.thread?.status || selected?.status, locale)}</Badge><span>{thread.data?.thread?.updatedAt || selected?.updatedAt || ''}</span></div><div className="support-thread">{thread.loading ? <LoadingBlock label={t('loading')} /> : thread.data?.messages.filter((message) => message.sender !== 'internal').map((message) => <article key={message.id} className={message.sender === 'admin' ? 'is-admin' : message.sender === 'system' ? 'is-system' : ''}><strong>{message.sender === 'admin' ? t('messageFromAdmin') : message.sender === 'system' ? copyByLocale(locale, 'System', 'النظام') : t('account')}</strong><p>{message.body}</p><small>{message.createdAt}</small></article>)}</div>{(thread.data?.thread?.status || selected?.status) === 'closed' ? <Alert title={supportStatusLabel('closed', locale)} tone="info" action={<Button size="sm" onClick={() => setSelectedStatus('open')} loading={busy}>{copyByLocale(locale, 'Reopen', 'إعادة فتح')}</Button>}>{copyByLocale(locale, 'This ticket is closed. Reopen it if you need to add another reply.', 'هذه التذكرة مغلقة. أعد فتحها إذا كنت تريد إضافة رد جديد.')}</Alert> : <form className="settings-form" onSubmit={sendReply}><FormField label={t('reply')} htmlFor="support-reply"><Textarea id="support-reply" value={reply} maxLength={4000} onChange={(event) => setReply(event.target.value)} required /></FormField><div className="cluster"><Button type="submit" variant="primary" loading={busy}>{t('reply')}</Button>{selected ? <Button type="button" onClick={() => setSelectedStatus('closed')} loading={busy}>{t('close')}</Button> : null}</div></form>}</Drawer></>
}

function PortalSettings() {
  const { t } = useExperience()
  const { account } = useAdapters()
  const { user } = useAuthState()
  const [name, setName] = useState(user?.displayName || '')
  const [message, setMessage] = useState('')
  return <><PageHeader title={t('settings')} description={t('accountOverviewBody')} /><div className="settings-sections"><Card><SectionHeader title={t('profile')} /><form className="settings-form" onSubmit={async (event) => { event.preventDefault(); const next = await account.updateProfile({ displayName: name }); setName(next.displayName || ''); setMessage(t('success')) }}><FormField label={t('name')} htmlFor="profile-name"><Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} /></FormField><FormField label={t('email')} htmlFor="profile-email"><Input id="profile-email" value={user?.email || ''} readOnly /></FormField><Button variant="primary">{t('save')}</Button>{message ? <Alert title={message} tone="success" /> : null}</form></Card><Card><SectionHeader title={t('security')} /><Button onClick={async () => { await account.sendPasswordReset(); setMessage(t('passwordUpdated')) }}>{t('forgotPassword')}</Button></Card></div></>
}

export function AdminProductionPages({ page, navigate }: { page: string; navigate: Navigate }) {
  const { t } = useExperience()
  const groups = useMemo<NavigationGroup[]>(() => [
    { items: [{ id: 'overview', label: t('overview'), icon: LayoutDashboard }] },
    { label: t('users'), items: [{ id: 'users', label: t('users'), icon: Users }, { id: 'subscriptions', label: t('subscriptions'), icon: CreditCard }, { id: 'commerce', label: t('payments'), icon: WalletCards }] },
    { label: t('distribution'), items: [{ id: 'releases', label: t('releases'), icon: PackageOpen }, { id: 'promos', label: t('promoCodes'), icon: Tags }] },
    { label: t('operations'), items: [{ id: 'support', label: t('supportInbox'), icon: LifeBuoy }, { id: 'diagnostics', label: t('diagnostics'), icon: Bug }] },
    { label: t('governance'), items: [{ id: 'policies', label: t('policies'), icon: ShieldCheck }, { id: 'audit', label: t('auditLog'), icon: ScrollText }, { id: 'settings', label: t('settings'), icon: Settings }] },
  ], [t])
  const title = groups.flatMap((group) => group.items).find((item) => item.id === page)?.label || t('adminOverview')
  return <AdminGuard navigate={navigate}><WorkspaceShell surface="admin" page={page} title={title} groups={groups} navigate={navigate} admin>{page === 'subscriptions' || page === 'users' ? <AdminSubscriptions /> : page === 'releases' ? <AdminReleases /> : page === 'support' ? <AdminSupportV2 /> : page === 'diagnostics' ? <AdminDiagnostics /> : page === 'audit' ? <AdminAudit /> : page === 'promos' ? <AdminPromos /> : page === 'commerce' ? <AdminCommerce /> : page === 'policies' ? <AdminPolicies /> : <AdminOverview />}</WorkspaceShell></AdminGuard>
}

function AdminGuard({ children }: { children: ReactNode; navigate: Navigate }) {
  const { t } = useExperience()
  const { admin } = useAdapters()
  const [checked, setChecked] = useState(false)
  const [preauth, setPreauth] = useState(false)
  const [sessionEmail, setSessionEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    Promise.allSettled([admin.getPreauthState(), admin.getSession()])
      .then(([preauthResult, sessionResult]) => {
        if (!alive) return
        if (preauthResult.status === 'fulfilled') setPreauth(preauthResult.value.authenticated)
        if (sessionResult.status === 'fulfilled') setSessionEmail(sessionResult.value.email)
        setChecked(true)
      })
      .catch(() => {
        if (alive) setChecked(true)
      })
    return () => {
      alive = false
    }
  }, [admin])
  if (!checked) return <FullPageState icon={ShieldCheck} title={t('loading')} body={t('adminConsole')} primaryLabel={t('retry')} onPrimary={() => window.location.reload()} />
  if (!preauth) return <main className="admin-login"><header><Brand /><div className="cluster"><LocaleControl /><ThemeControl /></div></header><Card className="admin-login__card"><h1>{t('adminConsole')}</h1><p>{t('secureByDesign')}</p><form className="stack" onSubmit={async (event) => { event.preventDefault(); setError(''); try { const result = await admin.submitPreauth({ username, password }); setPreauth(result.authenticated); if (!result.authenticated) setError('admin_preauth_failed') } catch (err) { setError(err instanceof Error ? err.message : 'admin_preauth_failed') } }}><FormField label={t('email')} htmlFor="admin-user"><Input id="admin-user" value={username} onChange={(event) => setUsername(event.target.value)} /></FormField><FormField label={t('password')} htmlFor="admin-pass"><PasswordInput id="admin-pass" value={password} onChange={(event) => setPassword(event.target.value)} /></FormField>{error ? <Alert title={t('failed')} tone="danger">{error}</Alert> : null}<Button variant="primary" fullWidth>{t('continue')}</Button></form></Card></main>
  if (!sessionEmail) return <main className="admin-login"><header><Brand /><div className="cluster"><LocaleControl /><ThemeControl /></div></header><Card className="admin-login__card"><h1>{t('adminConsole')}</h1><p>{t('signInBody')}</p>{error ? <Alert title={t('failed')} tone="danger">{error}</Alert> : null}<Button variant="primary" fullWidth onClick={async () => { setError(''); try { await admin.signInWithGoogle(); const session = await admin.getSession(); setSessionEmail(session.email) } catch (err) { setError(err instanceof Error ? err.message : 'admin_session_failed') } }}>{t('continue')} Google</Button></Card></main>
  return children
}

function AdminOverview() {
  const { t } = useExperience()
  const adapters = useAdapters()
  const dashboard = useAsyncData(() => adapters.admin.getDashboard(), [adapters])
  const kpis = dashboard.data?.kpis || {}
  return <><PageHeader title={t('adminOverview')} description={t('serviceHealth')} />{dashboard.error ? <ErrorBlock error={dashboard.error} onRetry={dashboard.reload} /> : null}<div className="admin-metric-strip">{[t('totalUsers'), t('activeSubscriptions'), t('openTickets'), t('unresolvedCrashes')].map((label, index) => <StatCard key={label} label={label} value={Object.values(kpis)[index] ?? '—'} />)}</div><Card><SectionHeader title={t('recentAdminActivity')} /><pre className="mono">{JSON.stringify(dashboard.data?.recentActivity || [], null, 2)}</pre></Card></>
}

function AdminSubscriptions() {
  const { t } = useExperience()
  const { admin } = useAdapters()
  const [search, setSearch] = useState('')
  const [grantOpen, setGrantOpen] = useState(false)
  const rows = useAsyncData(() => admin.listSubscriptions({ search }), [admin, search])
  const columns: Column<AdminSubscription>[] = [
    { key: 'email', header: t('email'), render: (row) => row.user_email || row.firebase_user_id || row.id },
    { key: 'status', header: t('status'), render: (row) => <Badge tone={row.status === 'active' ? 'success' : 'warning'}>{row.status}</Badge> },
    { key: 'plan', header: t('plan'), render: (row) => row.plan },
    { key: 'expires', header: t('expiryDate'), render: (row) => row.expires_at || '—' },
    { key: 'actions', header: t('actions'), render: (row) => <div className="cluster"><Button size="sm" onClick={() => admin.updateSubscriptionStatus(row.id, row.status === 'active' ? 'suspended' : 'active').then(rows.reload)}>{row.status === 'active' ? t('disabled') : t('enabled')}</Button><Button size="sm" onClick={() => admin.resetHwid(row.id).then(rows.reload)}>{t('resetHwid')}</Button></div> },
  ]
  return <><PageHeader title={t('subscriptions')} description={t('adminConsole')} actions={<Button variant="primary" onClick={() => setGrantOpen(true)}>{t('grantSubscription')}</Button>} /><TableToolbar searchLabel={t('search')} searchValue={search} onSearch={setSearch} />{rows.error ? <ErrorBlock error={rows.error} onRetry={rows.reload} /> : <DataTable columns={columns} rows={rows.data || []} loading={rows.loading} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('unavailableMetric')} />}<GrantSubscriptionDrawer open={grantOpen} onClose={() => { setGrantOpen(false); rows.reload() }} /></>
}

function GrantSubscriptionDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useExperience()
  const { admin } = useAdapters()
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('monthly')
  const [tier, setTier] = useState<'public' | 'private'>('public')
  const [expires, setExpires] = useState('')
  const [unlimited, setUnlimited] = useState(false)
  const [error, setError] = useState('')
  return <Drawer open={open} onClose={onClose} title={t('grantTitle')} description={t('grantBody')} closeLabel={t('close')} footer={<Button variant="primary" onClick={async () => { setError(''); try { await admin.createSubscription({ user_email: email, plan, tier, expires_at: expires || undefined, is_unlimited: unlimited }); onClose() } catch (err) { setError(err instanceof Error ? err.message : 'grant_failed') } }}>{t('confirmGrant')}</Button>}><div className="stack"><FormField label={t('email')} htmlFor="grant-email"><Input id="grant-email" value={email} onChange={(event) => setEmail(event.target.value)} /></FormField><div className="form-grid"><FormField label={t('plan')} htmlFor="grant-plan"><Select id="grant-plan" value={plan} onChange={(event) => setPlan(event.target.value as 'monthly' | 'yearly')}><option value="monthly">monthly</option><option value="yearly">yearly</option></Select></FormField><FormField label={t('type')} htmlFor="grant-tier"><Select id="grant-tier" value={tier} onChange={(event) => setTier(event.target.value as 'public' | 'private')}><option value="public">public</option><option value="private">private</option></Select></FormField></div><FormField label={t('expiryDate')} htmlFor="grant-expires"><Input id="grant-expires" type="datetime-local" value={expires} onChange={(event) => setExpires(event.target.value)} /></FormField><label className="ui-checkbox"><input type="checkbox" checked={unlimited} onChange={(event) => setUnlimited(event.target.checked)} />Unlimited</label>{error ? <Alert title={t('failed')} tone="danger">{error}</Alert> : null}</div></Drawer>
}

function AdminReleases() {
  const { t } = useExperience()
  const adapters = useAdapters()
  const release = useAsyncData(() => adapters.releases.getLatest('beta'), [adapters])
  const [version, setVersion] = useState('')
  const [channel, setChannel] = useState('beta')
  const [notes, setNotes] = useState('')
  const [mandatory, setMandatory] = useState(false)
  const [updateMode, setUpdateMode] = useState<'optional' | 'force' | 'required' | 'silent'>('optional')
  const [artifactType, setArtifactType] = useState<'portable' | 'installed'>('installed')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (file) await adapters.admin.uploadRelease({ file, version, channel, artifactType })
      await adapters.admin.publishRelease({ version, channel, notes, mandatory, updateMode })
      setNotice(t('success'))
      release.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'release_publish_failed')
    } finally {
      setBusy(false)
    }
  }
  return <><PageHeader title={t('releases')} description={t('managedUpdates')} />{release.error ? <ErrorBlock error={release.error} onRetry={release.reload} /> : <Card><dl className="detail-list"><div><dt>{t('version')}</dt><dd>{release.data?.version || t('unavailable')}</dd></div><div><dt>{t('mandatory')}</dt><dd>{release.data?.mandatory ? t('enabled') : t('disabled')}</dd></div><div><dt>SHA256</dt><dd>{release.data?.sha256 || '—'}</dd></div></dl></Card>}<Card><SectionHeader title={t('publishRelease')} description={t('managedUpdates')} /><form className="settings-form" onSubmit={submit}><div className="form-grid"><FormField label={t('version')} htmlFor="release-version" required><Input id="release-version" value={version} onChange={(event) => setVersion(event.target.value)} required /></FormField><FormField label={t('channel')} htmlFor="release-channel" required><Select id="release-channel" value={channel} onChange={(event) => setChannel(event.target.value)}><option value="beta">{t('beta')}</option><option value="stable">{t('stable')}</option></Select></FormField></div><div className="form-grid"><FormField label={t('type')} htmlFor="release-artifact"><Select id="release-artifact" value={artifactType} onChange={(event) => setArtifactType(event.target.value as 'portable' | 'installed')}><option value="installed">installed</option><option value="portable">portable</option></Select></FormField><FormField label={t('availability')} htmlFor="release-mode"><Select id="release-mode" value={updateMode} onChange={(event) => setUpdateMode(event.target.value as 'optional' | 'force' | 'required' | 'silent')}><option value="optional">optional</option><option value="required">required</option><option value="force">force</option><option value="silent">silent</option></Select></FormField></div><FormField label={t('uploadArtifact')} htmlFor="release-file"><Input id="release-file" type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /></FormField><FormField label={t('releaseNotes')} htmlFor="release-notes"><Textarea id="release-notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></FormField><label className="ui-checkbox"><input type="checkbox" checked={mandatory} onChange={(event) => setMandatory(event.target.checked)} />{t('mandatory')}</label><Button type="submit" variant="primary" loading={busy}>{t('publishRelease')}</Button>{error ? <Alert title={t('failed')} tone="danger">{error}</Alert> : null}{notice ? <Alert title={t('success')} tone="success">{notice}</Alert> : null}</form></Card></>
}

function AdminSupportV2() {
  const { t, locale } = useExperience()
  const { admin } = useAdapters()
  const [selected, setSelected] = useState<AdminSupportThread | null>(null)
  const [reply, setReply] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [replyMode, setReplyMode] = useState<'portal' | 'portal_email'>('portal')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [statusReason, setStatusReason] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const threads = useAsyncData(() => admin.listSupportThreads(), [admin])
  const messages = useAsyncData(() => selected ? admin.listSupportMessages(selected.id) : Promise.resolve([]), [admin, selected?.id])
  const visibleThreads = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (threads.data || []).filter((row) => {
      const ticketNumber = stableTicketNumber(row.id, row.created_at, row.updated_at)
      const status = String(row.status || 'open').toLowerCase()
      const matchesStatus = !statusFilter || status === statusFilter || (statusFilter === 'waiting_for_customer' && status === 'answered')
      const haystack = [ticketNumber, row.subject, row.email, row.install_id, row.device_id, row.last_message_body].filter(Boolean).join(' ').toLowerCase()
      return matchesStatus && (!query || haystack.includes(query))
    })
  }, [threads.data, search, statusFilter])
  const columns: Column<AdminSupportThread>[] = [
    { key: 'ticket', header: '#', render: (row) => <div><strong>{stableTicketNumber(row.id, row.created_at, row.updated_at)}</strong>{row.unread_count ? <small className="muted">{row.unread_count} unread</small> : null}</div> },
    { key: 'customer', header: t('email'), render: (row) => <div><strong>{row.email || '—'}</strong><small className="muted">{row.install_id || row.device_id || ''}</small></div> },
    { key: 'subject', header: t('support'), render: (row) => <div><strong>{row.subject}</strong><small className="muted">{row.last_message_body || ''}</small></div> },
    { key: 'status', header: t('status'), render: (row) => <Badge tone={supportStatusTone(row.status)}>{supportStatusLabel(row.status, locale)}</Badge> },
    { key: 'updated', header: t('date'), render: (row) => row.updated_at || '—' },
  ]

  const sendReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await admin.sendSupportReply(selected.id, reply, { emailRequested: replyMode === 'portal_email' })
      setReply('')
      setNotice(replyMode === 'portal_email' && !EMAIL_SUPPORT_ENABLED ? copyByLocale(locale, 'Portal reply saved. Email delivery is not configured yet.', 'تم حفظ الرد في البوابة. إرسال البريد غير مفعّل بعد.') : t('success'))
      messages.reload()
      threads.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'support_reply_failed')
    } finally {
      setBusy(false)
    }
  }
  const saveInternalNote = async () => {
    if (!selected || !internalNote.trim()) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await admin.sendSupportReply(selected.id, internalNote, { internal: true })
      setInternalNote('')
      setNotice(t('success'))
      messages.reload()
      threads.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'support_note_failed')
    } finally {
      setBusy(false)
    }
  }
  const changeStatus = async (status: string) => {
    if (!selected) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await admin.updateSupportStatus(selected.id, status, statusReason)
      setSelected({ ...selected, status, updated_at: new Date().toISOString() })
      setStatusReason('')
      setNotice(t('success'))
      messages.reload()
      threads.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'support_status_failed')
    } finally {
      setBusy(false)
    }
  }
  const copyTicketNumber = async () => {
    if (!selected) return
    await navigator.clipboard?.writeText(stableTicketNumber(selected.id, selected.created_at, selected.updated_at))
    setNotice(t('success'))
  }
  const toggleBlock = async () => {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      await admin.setSupportBlocked(selected.id, !selected.support_blocked, selected.support_blocked ? undefined : 'admin_block')
      setSelected({ ...selected, support_blocked: !selected.support_blocked })
      threads.reload()
      setNotice(t('success'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'support_block_failed')
    } finally {
      setBusy(false)
    }
  }
  return <><PageHeader title={t('supportInbox')} description={copyByLocale(locale, 'Manage customer support threads, internal notes, status changes, and sender blocks.', 'إدارة تذاكر الدعم، الملاحظات الداخلية، تغييرات الحالة، وحظر المرسلين.')} /><TableToolbar searchLabel={t('search')} searchValue={search} onSearch={setSearch} filters={<Select aria-label={t('status')} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">{t('status')}</option><option value="open">{supportStatusLabel('open', locale)}</option><option value="waiting_for_support">{supportStatusLabel('waiting_for_support', locale)}</option><option value="waiting_for_customer">{supportStatusLabel('waiting_for_customer', locale)}</option><option value="resolved">{supportStatusLabel('resolved', locale)}</option><option value="closed">{supportStatusLabel('closed', locale)}</option></Select>} />{threads.error ? <ErrorBlock error={threads.error} onRetry={threads.reload} /> : <DataTable columns={columns} rows={visibleThreads} loading={threads.loading} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('supportInbox')} onRowClick={(row) => { setSelected(row); setError(''); setNotice(''); setReply(''); setInternalNote('') }} />}{error ? <Alert title={t('failed')} tone="danger">{error}</Alert> : null}{notice ? <Alert title={t('success')} tone="success">{notice}</Alert> : null}<Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? stableTicketNumber(selected.id, selected.created_at, selected.updated_at) : t('support')} description={selected?.subject || t('support')} closeLabel={t('close')}><div className="support-admin-head"><div><Badge tone={supportStatusTone(selected?.status)}>{supportStatusLabel(selected?.status, locale)}</Badge><span>{selected?.email || '—'}</span><small>{selected?.app_version || selected?.platform || ''}</small></div><div className="cluster"><Button size="sm" leadingIcon={<Copy size={14} />} onClick={copyTicketNumber}>{copyByLocale(locale, 'Copy ticket number', 'نسخ رقم التذكرة')}</Button><Button size="sm" variant="secondary" onClick={toggleBlock} disabled={!selected || busy}>{selected?.support_blocked ? t('enabled') : t('blockSender')}</Button></div></div><div className="form-grid"><FormField label={t('status')} htmlFor="admin-ticket-status"><Select id="admin-ticket-status" value={selected?.status || 'open'} onChange={(event) => changeStatus(event.target.value)}><option value="open">{supportStatusLabel('open', locale)}</option><option value="waiting_for_support">{supportStatusLabel('waiting_for_support', locale)}</option><option value="waiting_for_customer">{supportStatusLabel('waiting_for_customer', locale)}</option><option value="resolved">{supportStatusLabel('resolved', locale)}</option><option value="closed">{supportStatusLabel('closed', locale)}</option></Select></FormField><FormField label={t('reason')} htmlFor="support-status-reason"><Input id="support-status-reason" value={statusReason} onChange={(event) => setStatusReason(event.target.value)} /></FormField></div><div className="support-thread">{messages.loading ? <LoadingBlock label={t('loading')} /> : messages.data?.map((message) => <article key={message.id} className={message.sender === 'admin' ? 'is-admin' : message.sender === 'internal' ? 'is-internal' : message.sender === 'system' ? 'is-system' : ''}><strong>{message.sender === 'internal' ? copyByLocale(locale, 'Internal note', 'ملاحظة داخلية') : message.sender === 'system' ? copyByLocale(locale, 'System', 'النظام') : message.sender === 'admin' ? t('messageFromAdmin') : t('account')}</strong><p>{message.body}</p><small>{message.created_at}</small></article>)}</div><form className="settings-form" onSubmit={sendReply}><div className="form-grid"><FormField label={t('type')} htmlFor="admin-support-mode"><Select id="admin-support-mode" value={replyMode} onChange={(event) => setReplyMode(event.target.value as 'portal' | 'portal_email')}><option value="portal">{copyByLocale(locale, 'Portal only', 'البوابة فقط')}</option><option value="portal_email">{copyByLocale(locale, 'Portal + email', 'البوابة + البريد')}</option></Select></FormField><FormField label={copyByLocale(locale, 'Assigned admin', 'المسؤول المعين')} htmlFor="assigned-admin"><Input id="assigned-admin" value={copyByLocale(locale, 'Unassigned', 'غير معيّن')} readOnly /></FormField></div>{replyMode === 'portal_email' && !EMAIL_SUPPORT_ENABLED ? <Alert title={copyByLocale(locale, 'Email provider required', 'يتطلب مزود بريد')} tone="warning">{copyByLocale(locale, 'The reply will be saved in the portal. Email sending stays off until a transactional email provider is configured.', 'سيتم حفظ الرد داخل البوابة فقط. إرسال البريد يظل متوقفًا حتى يتم إعداد مزود بريد للرسائل التشغيلية.')}</Alert> : null}<FormField label={t('reply')} htmlFor="admin-support-reply"><Textarea id="admin-support-reply" value={reply} maxLength={4000} onChange={(event) => setReply(event.target.value)} required /></FormField><Button type="submit" variant="primary" loading={busy}>{t('reply')}</Button></form><Card padding="sm"><SectionHeader title={copyByLocale(locale, 'Internal note', 'ملاحظة داخلية')} description={copyByLocale(locale, 'Visible only to administrators.', 'تظهر للمديرين فقط.')} /><FormField label={t('adminNote')} htmlFor="admin-internal-note"><Textarea id="admin-internal-note" value={internalNote} maxLength={4000} onChange={(event) => setInternalNote(event.target.value)} /></FormField><Button type="button" onClick={saveInternalNote} loading={busy}>{t('save')}</Button></Card></Drawer></>
}

export function AdminSupport() {
  const { t } = useExperience()
  const { admin } = useAdapters()
  const [selected, setSelected] = useState<AdminSupportThread | null>(null)
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const threads = useAsyncData(() => admin.listSupportThreads(), [admin])
  const messages = useAsyncData(() => selected ? admin.listSupportMessages(selected.id) : Promise.resolve([]), [admin, selected?.id])
  const columns: Column<AdminSupportThread>[] = [{ key: 'subject', header: t('support'), render: (row) => row.subject }, { key: 'email', header: t('email'), render: (row) => row.email || '—' }, { key: 'status', header: t('status'), render: (row) => <Badge>{row.status || 'open'}</Badge> }, { key: 'updated', header: t('date'), render: (row) => row.updated_at || '—' }]
  const sendReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await admin.sendSupportReply(selected.id, reply)
      setReply('')
      setNotice(t('success'))
      messages.reload()
      threads.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'support_reply_failed')
    } finally {
      setBusy(false)
    }
  }
  const toggleBlock = async () => {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      await admin.setSupportBlocked(selected.id, !selected.support_blocked, selected.support_blocked ? undefined : 'admin_block')
      setSelected({ ...selected, support_blocked: !selected.support_blocked })
      threads.reload()
      setNotice(t('success'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'support_block_failed')
    } finally {
      setBusy(false)
    }
  }
  return <><PageHeader title={t('supportInbox')} description={t('support')} />{threads.error ? <ErrorBlock error={threads.error} onRetry={threads.reload} /> : <DataTable columns={columns} rows={threads.data || []} loading={threads.loading} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('supportInbox')} onRowClick={(row) => { setSelected(row); setError(''); setNotice(''); setReply('') }} />}{error ? <Alert title={t('failed')} tone="danger">{error}</Alert> : null}{notice ? <Alert title={t('success')} tone="success">{notice}</Alert> : null}<Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.subject || t('support')} closeLabel={t('close')}><div className="support-thread">{messages.loading ? <LoadingBlock label={t('loading')} /> : messages.data?.map((message) => <article key={message.id} className={message.sender === 'admin' ? 'is-admin' : ''}><strong>{message.sender}</strong><p>{message.body}</p><small>{message.created_at}</small></article>)}</div><form className="settings-form" onSubmit={sendReply}><FormField label={t('reply')} htmlFor="admin-support-reply"><Textarea id="admin-support-reply" value={reply} onChange={(event) => setReply(event.target.value)} required /></FormField><div className="cluster"><Button type="submit" variant="primary" loading={busy}>{t('reply')}</Button><Button type="button" variant="secondary" onClick={toggleBlock} disabled={!selected || busy}>{selected?.support_blocked ? t('enabled') : t('blockSender')}</Button></div></form></Drawer></>
}

function AdminDiagnostics() {
  const { t } = useExperience()
  const adapters = useAdapters()
  const [tab, setTab] = useState('crashes')
  const logs = useAsyncData(() => adapters.admin.listCrashLogs(), [adapters])
  const groups = useAsyncData(() => adapters.admin.listCrashGroups(), [adapters])
  const logColumns: Column<AdminCrashLog>[] = [{ key: 'type', header: t('type'), render: (row) => row.error_type }, { key: 'message', header: t('details'), render: (row) => row.message || row.stack_trace?.slice(0, 80) || '—' }, { key: 'date', header: t('date'), render: (row) => row.happened_at }]
  const groupColumns: Column<AdminCrashGroup>[] = [{ key: 'type', header: t('type'), render: (row) => row.error_type }, { key: 'count', header: t('details'), render: (row) => row.count }, { key: 'date', header: t('date'), render: (row) => row.last_seen_at }]
  return <><PageHeader title={t('diagnostics')} description={t('crashReports')} /><Tabs ariaLabel={t('diagnostics')} active={tab} onChange={setTab} items={[{ id: 'crashes', label: t('crashReports') }, { id: 'groups', label: t('crashSummary') }]} />{tab === 'groups' ? <DataTable columns={groupColumns} rows={groups.data || []} loading={groups.loading} rowKey={(row) => row.fingerprint} emptyTitle={t('tableEmpty')} emptyBody={t('crashSummary')} /> : <DataTable columns={logColumns} rows={logs.data || []} loading={logs.loading} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('crashReports')} />}</>
}

function AdminAudit() {
  const { t } = useExperience()
  const adapters = useAdapters()
  const rows = useAsyncData(() => adapters.admin.listAuditLog(), [adapters])
  const columns: Column<AdminAuditLogItem>[] = [{ key: 'date', header: t('date'), render: (row) => row.happened_at || row.at || '—' }, { key: 'action', header: t('actions'), render: (row) => row.action || row.type || '—' }, { key: 'entity', header: t('details'), render: (row) => row.entity || row.entity_id || '—' }]
  return <><PageHeader title={t('auditLog')} description={t('auditLog')} />{rows.error ? <ErrorBlock error={rows.error} onRetry={rows.reload} /> : <DataTable columns={columns} rows={rows.data || []} loading={rows.loading} rowKey={(row, ) => row.id || `${row.action}-${row.at}`} emptyTitle={t('tableEmpty')} emptyBody={t('auditLog')} />}</>
}

function AdminPromos() {
  const { t } = useExperience()
  const adapters = useAdapters()
  const promos = useAsyncData(() => adapters.admin.listPromoCodes(), [adapters])
  return <><PageHeader title={t('promoCodes')} description={t('promoCodes')} />{promos.error ? <ErrorBlock error={promos.error} onRetry={promos.reload} /> : <Card><pre className="mono">{JSON.stringify(promos.data || [], null, 2)}</pre></Card>}</>
}

function AdminCommerce() {
  const { t } = useExperience()
  return <><PageHeader title={t('payments')} description={t('payments')} /><EmptyState icon={WalletCards} title={t('decisionRequired')} body={t('backendRequired')} /></>
}

function AdminPolicies() {
  const { t } = useExperience()
  const adapters = useAdapters()
  const controls = useAsyncData(() => adapters.admin.getRemoteControls('beta'), [adapters])
  const reloadPolicies = controls.reload
  const policyKey = `${controls.data?.minimum_supported_version || ''}:${JSON.stringify(controls.data?.remote_config || {})}`
  return <><PageHeader title={t('policies')} description={t('managedUpdates')} />{controls.error ? <ErrorBlock error={controls.error} onRetry={controls.reload} /> : null}{controls.data ? <AdminPoliciesEditor key={policyKey} controls={controls.data} onReload={reloadPolicies} /> : <Card><SectionHeader title={t('policies')} /><EmptyState icon={ShieldAlert} title={t('loading')} body={t('policies')} /></Card>}</>
}

function AdminPoliciesEditor({ controls, onReload }: { controls: AdminRemoteControls; onReload: () => void }) {
  const { t } = useExperience()
  const adapters = useAdapters()
  const initialUpdateMode = controls.remote_config?.update_mode
  const [minimumVersion, setMinimumVersion] = useState(controls.minimum_supported_version || '')
  const [updateMode, setUpdateMode] = useState<'optional' | 'force' | 'required' | 'silent'>(initialUpdateMode && ['optional', 'force', 'required', 'silent'].includes(initialUpdateMode) ? initialUpdateMode : 'optional')
  const [killSwitch, setKillSwitch] = useState(Boolean(controls.remote_config?.kill_switch_enabled))
  const [killMessage, setKillMessage] = useState(controls.remote_config?.kill_switch_message || '')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await adapters.admin.updateRemoteControls({
        channel: 'beta',
        ...controls,
        minimum_supported_version: minimumVersion,
        remote_config: {
          ...(controls.remote_config || {}),
          update_mode: updateMode,
          kill_switch_enabled: killSwitch,
          kill_switch_message: killMessage,
        },
      })
      setNotice(t('success'))
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'policy_update_failed')
    } finally {
      setBusy(false)
    }
  }
  return <><Card><SectionHeader title={t('policies')} /><form className="settings-form" onSubmit={save}><div className="form-grid"><FormField label={t('minimumVersion')} htmlFor="policy-min-version"><Input id="policy-min-version" value={minimumVersion} onChange={(event) => setMinimumVersion(event.target.value)} /></FormField><FormField label={t('availability')} htmlFor="policy-update-mode"><Select id="policy-update-mode" value={updateMode} onChange={(event) => setUpdateMode(event.target.value as 'optional' | 'force' | 'required' | 'silent')}><option value="optional">optional</option><option value="required">required</option><option value="force">force</option><option value="silent">silent</option></Select></FormField></div><label className="ui-checkbox"><input type="checkbox" checked={killSwitch} onChange={(event) => setKillSwitch(event.target.checked)} />{t('killSwitch')}</label><FormField label={t('details')} htmlFor="policy-kill-message"><Textarea id="policy-kill-message" value={killMessage} onChange={(event) => setKillMessage(event.target.value)} /></FormField><Button type="submit" variant="primary" loading={busy}>{t('save')}</Button>{error ? <Alert title={t('failed')} tone="danger">{error}</Alert> : null}{notice ? <Alert title={t('success')} tone="success">{notice}</Alert> : null}</form></Card><Card><SectionHeader title={t('details')} /><pre className="mono">{JSON.stringify(controls || {}, null, 2)}</pre></Card></>
}

export function SystemProductionPages({ page, navigate }: { page: string; navigate: Navigate }) {
  const { t } = useExperience()
  const title = page === '403' ? t('system403') : page === '503' ? t('system503') : page === '500' ? t('system500') : t('system404')
  return <FullPageState icon={ShieldAlert} title={title} body={t('systemBody')} primaryLabel={t('back')} onPrimary={() => navigate({ surface: 'public', page: 'home' })} />
}
