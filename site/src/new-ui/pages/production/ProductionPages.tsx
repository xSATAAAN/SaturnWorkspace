import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
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
  RefreshCcw,
  ScrollText,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Tags,
  Users,
  WalletCards,
} from 'lucide-react'
import type { AdminAuditLogItem, AdminCrashGroup, AdminCrashLog, AdminEmailCatalogItem, AdminEmailJob, AdminEmailProviderEvent, AdminEmailRecipientFlag, AdminEmailStatus, AdminInboundEmailMessage, AdminRemoteControls, AdminScheduledEmail, AdminSubscription, AdminSupportThread } from '../../../api/admin'
import type { AccountSubscription } from '../../../api/account'
import { useAdapters } from '../../adapters/AdapterProvider'
import type { CustomerSupportThread, PlanInfo, ReleaseInfo, SupportSenderRole } from '../../adapters/contracts'
import { useExperience } from '../../app/ExperienceProvider'
import { createAuthRoute, createPricingReturnState, currentInternalLocation, readAuthIntent, readCheckoutPlan } from '../../app/navigationIntent'
import { routeFromInternalUrl } from '../../app/productionRouter'
import { Button } from '../../components/ui/Button'
import { CheckoutDialog } from '../../components/CheckoutDialog'
import { GoogleIcon } from '../../components/icons/GoogleIcon'
import { Card, DataTable, PageHeader, SectionHeader, StatCard, TableToolbar, type Column } from '../../components/ui/DataDisplay'
import { Alert, Badge, CardSkeleton, EmptyState, FullPageState, Skeleton, SkeletonStack } from '../../components/ui/Feedback'
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

type ResourceStatus = 'idle' | 'bootstrapping' | 'loading_initial' | 'refreshing' | 'success' | 'empty' | 'partial' | 'error_recoverable' | 'error_terminal'
type AsyncResource<T> = { status: ResourceStatus; loading: boolean; refreshing: boolean; data: T | null; error: string | null; reload: () => void }
const PENDING_EMAIL_VERIFICATION_KEY = 'saturnws.production.pendingEmailVerification.v1'
const LOCAL_EMAIL_VERIFICATION_TEST_CODE_KEY = 'saturnws.production.localEmailVerificationCode.v1'
const ACTIVATION_STORAGE_KEY = 'saturnws.activation.payload.v1'
const AUTH_BASE = 'https://auth.saturnws.com'
const EMAIL_SUPPORT_ENABLED = true

type ActivationPayload = {
  ticket: string
  legacyCode?: string
}

function copyByLocale(locale: 'ar' | 'en', en: string, ar: string) {
  return locale === 'ar' ? ar : en
}

function loadActivationPayload(routeState?: string): ActivationPayload | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(routeState?.startsWith('?') ? routeState.slice(1) : routeState || window.location.search.slice(1))
  const ticket = String(params.get('ticket') || params.get('device_code') || '').trim()
  const legacyCode = String(params.get('code') || '').trim().toUpperCase()
  if (ticket || legacyCode) {
    const payload = { ticket, legacyCode: legacyCode || undefined }
    window.sessionStorage.setItem(ACTIVATION_STORAGE_KEY, JSON.stringify(payload))
    if (window.location.pathname === '/activate') {
      params.delete('ticket')
      params.delete('device_code')
      params.delete('code')
      const next = params.toString()
      window.history.replaceState({}, document.title, `/account/signin${next ? `?${next}` : ''}${window.location.hash}`)
    }
    return payload
  }
  try {
    const raw = window.sessionStorage.getItem(ACTIVATION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ActivationPayload>
    const storedTicket = String(parsed.ticket || '').trim()
    const storedLegacyCode = String(parsed.legacyCode || '').trim().toUpperCase()
    if (!storedTicket && !storedLegacyCode) return null
    return { ticket: storedTicket, legacyCode: storedLegacyCode || undefined }
  } catch {
    return null
  }
}

function clearActivationPayload() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(ACTIVATION_STORAGE_KEY)
}

async function completeDeviceActivation(idToken: string, activation: ActivationPayload) {
  const response = await fetch(`${AUTH_BASE}/device/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      id_token: idToken,
      ticket: activation.ticket,
      device_code: activation.ticket,
      user_code: activation.legacyCode || undefined,
    }),
  })
  const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null
  if (!response.ok || !payload?.success) throw new Error(String(payload?.error || `device_link_failed_${response.status}`))
  clearActivationPayload()
  return payload
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

function supportSenderRole(sender: string | undefined, explicitRole?: SupportSenderRole): SupportSenderRole {
  if (explicitRole) return explicitRole
  const normalized = String(sender || '').trim().toLowerCase()
  if (normalized === 'admin' || normalized === 'support' || normalized === 'support_agent' || normalized === 'agent') return 'support_agent'
  if (normalized === 'internal' || normalized === 'internal_note') return 'internal_note'
  if (normalized === 'system') return 'system'
  return 'customer'
}

function supportSenderLabel(role: SupportSenderRole, locale: 'ar' | 'en') {
  if (role === 'support_agent') return copyByLocale(locale, 'Support', 'الدعم')
  if (role === 'internal_note') return copyByLocale(locale, 'Internal note', 'ملاحظة داخلية')
  if (role === 'system') return copyByLocale(locale, 'System', 'النظام')
  return copyByLocale(locale, 'Customer', 'العميل')
}

function supportMessageClass(role: SupportSenderRole) {
  return `support-message support-message--${role}`
}

function supportErrorMessage(error: unknown, locale: 'ar' | 'en') {
  const raw = String(error instanceof Error ? error.message : error || '').trim()
  const key = raw.toLowerCase()
  if (key === 'auth_session_expired' || key === 'not_authenticated' || key === 'missing_id_token' || key === 'unauthorized') {
    return copyByLocale(locale, 'Your session expired. Sign in again and retry.', 'انتهت جلسة تسجيل الدخول. سجّل الدخول مرة أخرى ثم أعد المحاولة.')
  }
  if (key === 'support_ticket_forbidden' || key === 'thread_not_found') {
    return copyByLocale(locale, 'This ticket is unavailable or no longer belongs to this account.', 'هذه التذكرة غير متاحة أو لم تعد مرتبطة بهذا الحساب.')
  }
  if (key === 'support_rate_limited') {
    return copyByLocale(locale, 'Daily support message limit reached. Try again later.', 'تم الوصول إلى الحد اليومي لرسائل الدعم. حاول لاحقًا.')
  }
  if (key === 'network_unavailable' || key.includes('failed to fetch') || key.includes('network')) {
    return copyByLocale(locale, 'Unable to reach the server right now. Check the connection and retry.', 'تعذر الوصول إلى الخادم حاليًا. تحقق من الاتصال ثم أعد المحاولة.')
  }
  return copyByLocale(locale, 'The request could not be completed. Try again.', 'تعذر تنفيذ الطلب. حاول مرة أخرى.')
}

function deviceActivationErrorMessage(error: unknown, locale: 'ar' | 'en') {
  const raw = String(error instanceof Error ? error.message : error || '').trim()
  const key = raw.toLowerCase()
  if (key.includes('network') || key.includes('failed to fetch')) {
    return copyByLocale(locale, 'Unable to reach the account linking server. Try again from the desktop app.', 'تعذر الوصول إلى خادم ربط الحساب. حاول مرة أخرى من أداة سطح المكتب.')
  }
  if (key.includes('subscription')) {
    return copyByLocale(locale, 'This account does not have an active subscription for the desktop app.', 'هذا الحساب لا يملك اشتراكًا نشطًا لاستخدام أداة سطح المكتب.')
  }
  if (key.includes('device_code_expired') || key.includes('not_found')) {
    return copyByLocale(locale, 'This desktop linking session expired. Start sign-in again from the desktop app.', 'انتهت صلاحية جلسة ربط الأداة. ابدأ تسجيل الدخول مرة أخرى من أداة سطح المكتب.')
  }
  return copyByLocale(locale, 'The desktop app could not be linked to this account. Try again from the desktop app.', 'تعذر ربط أداة سطح المكتب بهذا الحساب. حاول مرة أخرى من الأداة.')
}

function emailJobTone(status?: string) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'sent' || normalized === 'delivered') return 'success' as const
  if (normalized === 'pending' || normalized === 'queued' || normalized === 'scheduled') return 'info' as const
  if (normalized === 'retrying') return 'warning' as const
  if (normalized === 'failed' || normalized === 'bounced' || normalized === 'complained' || normalized === 'suppressed') return 'danger' as const
  return 'neutral' as const
}

function emailIntegrationTone(status?: string) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'linked') return 'success' as const
  if (normalized === 'prepared') return 'info' as const
  if (normalized === 'disabled') return 'warning' as const
  return 'danger' as const
}

function boolLabel(value: unknown, locale: 'ar' | 'en') {
  return value ? copyByLocale(locale, 'On', 'مفعّل') : copyByLocale(locale, 'Off', 'متوقف')
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

function formatDisplayDate(value?: string | null, locale: 'ar' | 'en' = 'ar') {
  const raw = String(value || '').trim()
  if (!raw) return '—'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function isEmptyAsyncData<T>(data: T | null): boolean {
  if (data == null) return true
  if (Array.isArray(data)) return data.length === 0
  return false
}

function useAsyncData<T>(load: () => Promise<T>, deps: React.DependencyList): AsyncResource<T> {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<Omit<AsyncResource<T>, 'reload'>>({ status: 'idle', loading: true, refreshing: false, data: null, error: null })
  useEffect(() => {
    let alive = true
    setState((previous) => ({
      ...previous,
      status: previous.data ? 'refreshing' : 'loading_initial',
      loading: !previous.data,
      refreshing: Boolean(previous.data),
      error: null,
    }))
    Promise.resolve()
      .then(load)
      .then((data) => {
        if (alive) setState({ status: isEmptyAsyncData(data) ? 'empty' : 'success', loading: false, refreshing: false, data, error: null })
      })
      .catch((error) => {
        if (alive) setState((previous) => ({
          status: previous.data ? 'partial' : 'error_recoverable',
          loading: false,
          refreshing: false,
          data: previous.data,
          error: error instanceof Error ? error.message : 'request_failed',
        }))
      })
    return () => {
      alive = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])
  return { ...state, reload: () => setVersion((value) => value + 1) }
}

function LoadingBlock({ label }: { label: string }) {
  void label
  return <Card><SkeletonStack rows={4} /></Card>
}

function PageHeaderSkeleton({ actions = false }: { actions?: boolean }) {
  return <header className="ui-page-header" aria-busy="true"><div className="split"><div><Skeleton width="180px" height={30} /><Skeleton width="360px" height={15} /></div>{actions ? <div className="cluster"><Skeleton width="130px" height={40} /></div> : null}</div></header>
}

function SectionHeaderSkeleton({ action = false }: { action?: boolean }) {
  return <header className="ui-section-header" aria-busy="true"><div><Skeleton width="170px" height={20} /><Skeleton width="290px" height={13} /></div>{action ? <Skeleton width="76px" height={34} /> : null}</header>
}

function SubscriptionSummarySkeleton() {
  return <Card className="subscription-card" aria-busy="true"><div className="split"><div><Skeleton width="150px" height={13} /><Skeleton width="210px" height={27} /></div><Skeleton width="86px" height={22} /></div><div className="subscription-card__skeleton-grid">{Array.from({ length: 4 }).map((_, index) => <div key={index}><Skeleton width="68px" height={11} /><Skeleton width={index % 2 ? '72%' : '86%'} height={17} /></div>)}</div><Skeleton width="118px" height={40} /></Card>
}

function DownloadCardSkeleton() {
  return <Card aria-busy="true"><div className="download-card"><div><Skeleton width="44px" height={44} /><div><Skeleton width="210px" height={22} /><Skeleton width="160px" height={14} /><div className="cluster"><Skeleton width="84px" height={20} /><Skeleton width="112px" height={20} /></div></div></div><Skeleton width="150px" height={40} /></div></Card>
}

function TablePanelSkeleton({ columns = 5, rows = 5 }: { columns?: number; rows?: number }) {
  return <div className="ui-table-wrap" aria-busy="true"><table className="ui-table"><thead><tr>{Array.from({ length: columns }).map((_, index) => <th key={index}><Skeleton width={index === 0 ? '48%' : '38%'} height={12} /></th>)}</tr></thead><tbody>{Array.from({ length: rows }).map((_, rowIndex) => <tr key={rowIndex}>{Array.from({ length: columns }).map((__, colIndex) => <td key={colIndex}><Skeleton width={colIndex === 0 ? '72%' : '56%'} height={14} /></td>)}</tr>)}</tbody></table></div>
}

function PortalOverviewSkeleton() {
  return <><PageHeaderSkeleton /><div className="portal-overview-grid"><div className="stack"><SubscriptionSummarySkeleton /><DownloadCardSkeleton /></div><aside className="portal-notices"><SectionHeaderSkeleton /><article><Skeleton width="30px" height={30} /><div><Skeleton width="120px" height={16} /><Skeleton width="180px" height={13} /></div></article></aside></div></>
}

function PortalSubscriptionSkeleton() {
  return <><PageHeaderSkeleton /><SubscriptionSummarySkeleton /><Card><SectionHeaderSkeleton /><SkeletonStack rows={2} /></Card></>
}

function PortalDownloadsSkeleton() {
  return <><PageHeaderSkeleton /><DownloadCardSkeleton /></>
}

function PortalSupportSkeleton() {
  return <><PageHeaderSkeleton /><div className="portal-two-column"><Card><SectionHeaderSkeleton /><div className="settings-form"><Skeleton width="100%" height={44} /><Skeleton width="100%" height={112} /><Skeleton width="132px" height={40} /></div></Card><Card><SectionHeaderSkeleton /><div className="ui-table-toolbar"><Skeleton width="260px" height={38} /><Skeleton width="140px" height={38} /></div><TablePanelSkeleton columns={5} rows={4} /></Card></div></>
}

function PortalSettingsSkeleton() {
  return <><PageHeaderSkeleton /><div className="settings-sections"><Card><SectionHeaderSkeleton /><div className="settings-form"><Skeleton width="100%" height={44} /><Skeleton width="100%" height={44} /><Skeleton width="140px" height={40} /></div></Card><Card><SectionHeaderSkeleton /><Skeleton width="180px" height={40} /></Card></div></>
}

function AdminOverviewSkeleton() {
  return <><PageHeaderSkeleton /><div className="admin-metric-strip">{Array.from({ length: 4 }).map((_, index) => <StatCard key={index} label={<Skeleton width="90px" height={12} />} value={<Skeleton width="52px" height={27} />} />)}</div><Card><SectionHeaderSkeleton /><SkeletonStack rows={5} /></Card></>
}

function AdminSubscriptionsSkeleton() {
  return <><PageHeaderSkeleton actions /><div className="ui-table-toolbar"><Skeleton width="280px" height={38} /></div><TablePanelSkeleton columns={5} rows={6} /></>
}

function AdminEmailOperationsSkeleton() {
  return <><PageHeaderSkeleton actions /><div className="admin-metric-strip">{Array.from({ length: 10 }).map((_, index) => <StatCard key={index} label={<Skeleton width="86px" height={12} />} value={<Skeleton width="44px" height={24} />} />)}</div><div className="admin-overview-grid"><Card><SectionHeaderSkeleton /><SkeletonStack rows={4} /></Card><Card><SectionHeaderSkeleton /><div className="cluster"><Skeleton width="86px" height={22} /><Skeleton width="96px" height={22} /><Skeleton width="84px" height={22} /></div></Card></div><Card><SectionHeaderSkeleton /><div className="settings-form"><div className="form-grid"><Skeleton width="100%" height={44} /><Skeleton width="100%" height={44} /><Skeleton width="100%" height={44} /></div><div className="cluster"><Skeleton width="120px" height={40} /><Skeleton width="140px" height={40} /></div></div></Card><div className="admin-tab-panel"><TablePanelSkeleton columns={5} rows={5} /></div></>
}

function ErrorBlock({ error, onRetry }: { error: string; onRetry?: () => void }) {
  const { t } = useExperience()
  return <Alert title={t('failed')} tone="danger" action={onRetry ? <Button size="sm" onClick={onRetry}>{t('retry')}</Button> : undefined}>{error}</Alert>
}

function authErrorMessage(error: unknown, t: (key: MessageKey) => string) {
  const raw = error instanceof Error ? error.message : String(error || '')
  const key = raw.toLowerCase()
  if (key.includes('auth_email_already_used') || key.includes('email-already-in-use')) return 'هذا البريد مستخدم بالفعل.'
  if (key.includes('auth_weak_password') || key.includes('weak-password')) return 'كلمة المرور ضعيفة.'
  if (key.includes('auth_invalid_email') || key.includes('invalid-email')) return 'البريد الإلكتروني غير صحيح.'
  if (key.includes('auth_too_many_attempts') || key.includes('too-many-requests')) return 'تمت محاولات كثيرة. حاول لاحقًا.'
  if (key.includes('verification_delivery_disabled') || key.includes('verification_delivery_not_configured') || key.includes('verification_delivery_failed')) return 'التحقق بالبريد غير متاح حاليًا. حاول لاحقًا.'
  if (key.includes('verification_code_invalid') || key.includes('email_code_invalid')) return t('codeInvalid')
  if (key.includes('verification_code_expired') || key.includes('email_code_expired')) return t('codeExpired')
  if (key.includes('verification_rate_limited') || key.includes('email_resend_limited')) return t('tooManyAttempts')
  if (key.includes('profile_provisioning_failed') || key.includes('profile_terms_required')) return 'تعذر تجهيز الحساب. راجع البيانات وحاول مرة أخرى.'
  if (key.includes('invalid-credential') || key.includes('user-not-found') || key.includes('wrong-password') || key.includes('invalid_credentials')) return t('invalidCredentials')
  if (key.includes('network') || key.includes('failed to fetch') || key.includes('auth/network-request-failed')) return t('authUnavailable')
  return t('failed')
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
  const { t, locale } = useExperience()
  const { ready, user } = useAuthState()
  const supportRoute = ready && user ? { surface: 'portal' as const, page: 'support' } : createAuthRoute('signin', { returnTo: '/account/support' })
  const channels = [
    { title: copyByLocale(locale, 'Billing', 'الفوترة'), body: copyByLocale(locale, 'Invoices, renewal, and subscription questions.', 'الفواتير والتجديد وأسئلة الاشتراك.'), icon: CreditCard },
    { title: copyByLocale(locale, 'Security', 'الأمان'), body: copyByLocale(locale, 'Account access, device activity, and privacy concerns.', 'الوصول للحساب ونشاط الأجهزة وطلبات الخصوصية.'), icon: ShieldCheck },
    { title: copyByLocale(locale, 'General', 'استفسار عام'), body: copyByLocale(locale, 'Product questions before creating an account.', 'أسئلة المنتج قبل إنشاء الحساب.'), icon: Mail },
  ]
  return <div className="marketing-section page-enter"><div className="container contact-page"><header className="marketing-heading marketing-heading--center"><LifeBuoy size={28} /><h1>{t('contact')}</h1><p>{copyByLocale(locale, 'Choose the right channel and we will route the request to the right place.', 'اختر القناة المناسبة وسنوجه طلبك للمكان الصحيح.')}</p></header><div className="contact-grid">{channels.map(({ title, body, icon: Icon }) => <Card key={title}><SectionHeader title={title} description={body} action={<Icon size={18} />} /></Card>)}<Card className="contact-support-card"><SectionHeader title={t('support')} description={copyByLocale(locale, 'Technical account help is handled inside the support center.', 'الدعم الفني للحسابات يتم داخل مركز الدعم.')} /><div className="cluster"><Button variant="primary" disabled={!ready} onClick={() => navigate(supportRoute)}>{t('createTicket')}</Button><Button variant="secondary" onClick={() => navigate({ surface: 'public', page: 'faq' })}>{t('faq')}</Button></div></Card></div></div></div>
}

function LegalSection({ page }: { page: string }) {
  const { t, locale } = useExperience()
  const adapters = useAdapters()
  const legal = useAsyncData(() => adapters.content.getLegalPage(page, locale), [adapters, page, locale])
  return <div className="marketing-section page-enter"><article className="container legal-document">{legal.loading ? <LoadingBlock label={t('loading')} /> : legal.error ? <ErrorBlock error={legal.error} /> : <><h1>{legal.data?.title}</h1><p>{legal.data?.body}</p></>}</article></div>
}

export function AuthProductionPages({ page, routeState, navigate }: { page: string; routeState?: string; navigate: Navigate }) {
  if (page === 'linked') return <DeviceLinkedProductionPage navigate={navigate} />
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

function DeviceLinkedProductionPage({ navigate }: { navigate: Navigate }) {
  const { t, locale } = useExperience()
  return <ProductionAuthShell navigate={navigate}><div className="auth-card"><div className="auth-form auth-form--center"><span className="auth-icon"><Check size={23} /></span><header><h1>{copyByLocale(locale, 'Desktop app linked', 'تم ربط أداة سطح المكتب')}</h1><p>{copyByLocale(locale, 'You can now return to Saturn Workspace or close this page.', 'يمكنك الآن الرجوع إلى Saturn Workspace أو إغلاق هذه الصفحة.')}</p></header><Button variant="primary" size="lg" fullWidth onClick={() => navigate({ surface: 'portal', page: 'overview' })}>{t('continue')}</Button></div></div></ProductionAuthShell>
}

function EmailPasswordProductionPage({ page, routeState, navigate }: { page: string; routeState?: string; navigate: Navigate }) {
  const { t, locale } = useExperience()
  const { auth } = useAdapters()
  const authState = useAuthState()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const signup = page === 'signup'
  const activationPayload = useMemo(() => loadActivationPayload(routeState), [routeState])
  const completionStartedRef = useRef(false)
  const passwordLongEnough = password.length >= 6
  const passwordsMatch = Boolean(confirmPassword) && password === confirmPassword
  const finishActivationIfNeeded = async () => {
    if (!activationPayload) return false
    if (completionStartedRef.current) return true
    completionStartedRef.current = true
    const token = await auth.getIdToken(false)
    if (!token) throw new Error('not_authenticated')
    await completeDeviceActivation(token, activationPayload)
    navigate({ surface: 'auth', page: 'linked' })
    return true
  }
  useEffect(() => {
    if (!activationPayload || !authState.ready || !authState.user || completionStartedRef.current) return
    setLoading(true)
    setError('')
    finishActivationIfNeeded()
      .catch((err) => {
        completionStartedRef.current = false
        setError(deviceActivationErrorMessage(err, locale))
      })
      .finally(() => setLoading(false))
  }, [activationPayload, authState.ready, authState.user?.id, locale])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (signup && !fullName.trim()) {
      setError(locale === 'ar' ? 'اكتب الاسم الكامل.' : 'Full name is required.')
      return
    }
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
        await auth.signUpWithEmail({
          displayName: fullName,
          email,
          password,
          locale,
          termsAccepted: acceptedTerms,
          termsVersion: '2026-06',
        })
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
      if (await finishActivationIfNeeded()) return
      navigate(destinationAfterAuth(routeState))
    } catch (err) {
      setError(activationPayload ? deviceActivationErrorMessage(err, locale) : authErrorMessage(err, t))
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
  return <ProductionAuthShell navigate={navigate}><div className={`auth-card auth-card--${signup ? 'signup' : 'signin'}`}><div className="auth-form"><header><span>{signup ? copyByLocale(locale, 'Create your workspace access', 'ابدأ إعداد مساحة عملك') : copyByLocale(locale, 'Secure account access', 'دخول آمن للحساب')}</span><h1>{signup ? t('signUpTitle') : t('signInTitle')}</h1><p>{activationPayload ? copyByLocale(locale, 'Sign in to link this desktop app session to your account.', 'سجّل الدخول لربط جلسة أداة سطح المكتب بحسابك.') : signup ? copyByLocale(locale, 'Create one account for subscriptions, downloads, support, and your desktop sign-in.', 'أنشئ حسابًا واحدًا للاشتراك والتنزيلات والدعم وتسجيل الدخول إلى الأداة.') : t('signInBody')}</p></header>{activationPayload ? <Alert title={copyByLocale(locale, 'Desktop linking', 'ربط أداة سطح المكتب')} tone="info">{copyByLocale(locale, 'After sign-in, Saturn Workspace will be linked automatically.', 'بعد تسجيل الدخول سيتم ربط Saturn Workspace تلقائيًا.')}</Alert> : null}<form className="stack" onSubmit={submit} noValidate>{signup ? <FormField label={locale === 'ar' ? 'الاسم الكامل' : 'Full name'} htmlFor="auth-full-name" required><Input id="auth-full-name" type="text" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required /></FormField> : null}<FormField label={t('email')} htmlFor="auth-email" required><Input id="auth-email" type="email" autoComplete="email" placeholder={locale === 'ar' ? 'name@example.com' : 'name@example.com'} value={email} onChange={(event) => setEmail(event.target.value)} required /></FormField><FormField label={t('password')} htmlFor="auth-password" required><PasswordInput id="auth-password" autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required /></FormField>{signup ? <><FormField label={t('confirmPassword')} htmlFor="auth-confirm-password" required error={confirmPassword && !passwordsMatch ? (locale === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.') : undefined}><PasswordInput id="auth-confirm-password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></FormField><div className="password-requirements" aria-live="polite"><strong>{locale === 'ar' ? 'متطلبات كلمة المرور' : 'Password requirements'}</strong><span className={passwordLongEnough ? 'is-valid' : ''}><Check size={14} />{locale === 'ar' ? '6 أحرف على الأقل' : 'At least 6 characters'}</span><span className={passwordsMatch ? 'is-valid' : ''}><Check size={14} />{locale === 'ar' ? 'تطابق كلمتي المرور' : 'Both passwords match'}</span></div><Checkbox checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required label={<span>{locale === 'ar' ? 'أوافق على ' : 'I agree to the '}<a href="/terms">{t('terms')}</a>{locale === 'ar' ? ' و' : ' and the '}<a href="/privacy">{t('privacy')}</a></span>} /></> : <div className="auth-form__options"><Button type="button" variant="text" onClick={reset}>{t('forgotPassword')}</Button></div>}{error ? <Alert title={t('failed')} tone="danger">{error}</Alert> : null}{notice ? <Alert title={t('success')} tone="success">{notice}</Alert> : null}<Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>{signup ? t('signUp') : t('signIn')}</Button></form><div className="auth-divider"><span>{t('orContinue')}</span></div><Button type="button" fullWidth size="lg" leadingIcon={<GoogleIcon />} onClick={async () => { setLoading(true); setError(''); try { if (signup && !acceptedTerms) { setError(locale === 'ar' ? 'يجب الموافقة على شروط الخدمة وسياسة الخصوصية.' : 'You must agree to the Terms of Service and Privacy Policy.'); return } await auth.signInWithGoogle(signup ? { locale, termsAccepted: acceptedTerms, termsVersion: '2026-06' } : undefined); if (await finishActivationIfNeeded()) return; navigate(destinationAfterAuth(routeState)) } catch (err) { setError(activationPayload ? deviceActivationErrorMessage(err, locale) : authErrorMessage(err, t)) } finally { setLoading(false) } }}>{t('continueGoogle')}</Button><p className="auth-switch">{signup ? t('haveAccount') : t('noAccount')} <button type="button" onClick={() => navigate({ surface: 'auth', page: signup ? 'signin' : 'signup', state: routeState })}>{signup ? t('signIn') : t('signUp')}</button></p></div></div></ProductionAuthShell>
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
  const authState = useAuthState()
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
  if (!authState.ready) return <WorkspaceShell surface="portal" page={page} title={title} groups={groups} navigate={navigate}><PortalRouteSkeleton page={page} /></WorkspaceShell>
  if (!authState.user) return <FullPageState icon={KeyRound} title={t('signIn')} body={t('signInBody')} primaryLabel={t('signIn')} onPrimary={() => navigate(createAuthRoute('signin', { returnTo: currentInternalLocation() }))} secondaryLabel={t('signUp')} onSecondary={() => navigate(createAuthRoute('signup', { returnTo: currentInternalLocation() }))} />
  return <WorkspaceShell surface="portal" page={page} title={title} groups={groups} navigate={navigate}>{page === 'subscription' ? <PortalSubscription /> : page === 'downloads' ? <PortalDownloads /> : page === 'support' ? <PortalSupport /> : page === 'security' || page === 'settings' ? <PortalSettings /> : page === 'payments' ? <PortalPayments /> : page === 'devices' ? <PortalDevices /> : page === 'notifications' ? <PortalNotifications /> : <PortalOverview navigate={navigate} />}</WorkspaceShell>
}

function PortalRouteSkeleton({ page }: { page: string }) {
  if (page === 'overview') return <PortalOverviewSkeleton />
  if (page === 'subscription') return <PortalSubscriptionSkeleton />
  if (page === 'downloads') return <PortalDownloadsSkeleton />
  if (page === 'support') return <PortalSupportSkeleton />
  if (page === 'security' || page === 'settings') return <PortalSettingsSkeleton />
  return <><PageHeaderSkeleton /><div className="portal-mini-grid"><CardSkeleton rows={4} /><CardSkeleton rows={4} /></div></>
}

function PortalOverview({ navigate }: { navigate: Navigate }) {
  const { t, locale } = useExperience()
  const adapters = useAdapters()
  const subscription = useAsyncData(() => adapters.account.getSubscription(), [adapters])
  const release = useAsyncData(() => adapters.releases.getLatest('beta'), [adapters])
  return <><PageHeader title={t('overview')} description={t('accountOverviewBody')} />{subscription.error ? <ErrorBlock error={subscription.error} onRetry={subscription.reload} /> : null}<div className="portal-overview-grid"><div className="stack"><SubscriptionSummary data={subscription.data} loading={subscription.loading} navigate={navigate} />{subscription.refreshing ? <Alert title={copyByLocale(locale, 'Refreshing account data', 'يتم تحديث بيانات الحساب')} tone="info" /> : null}<Card><SectionHeader title={t('latestRelease')} action={<Button variant="text" onClick={() => navigate({ surface: 'portal', page: 'downloads' })}>{t('viewAll')}</Button>} />{release.loading ? <SkeletonStack rows={4} /> : release.error ? <ErrorBlock error={release.error} onRetry={release.reload} /> : <DownloadCard title={t('downloadForWindows')} version={release.data?.version || t('unavailable')} meta={[release.data?.available ? t('active') : t('unavailable')]} buttonLabel={t('downloads')} disabled={!release.data?.available} onClick={() => { if (release.data?.downloadUrl) window.location.href = release.data.downloadUrl }} />}</Card></div><aside className="portal-notices"><SectionHeader title={t('notifications')} /><Alert title={t('integrationPending')} tone="info">{t('noNotifications')}</Alert></aside></div></>
}

function SubscriptionSummary({ data, loading, navigate }: { data: AccountSubscription | null; loading: boolean; navigate?: Navigate }) {
  const { t, locale } = useExperience()
  if (loading) return <SubscriptionSummarySkeleton />
  const sub = data?.current_subscription ?? data?.subscription
  const projection = data?.subscription_projection
  const noActiveSubscription = projection?.entitlement === 'no_subscription' || projection?.existence === 'none' || !sub
  if (noActiveSubscription) {
    return <SubscriptionCard title={t('subscriptionStatus')} status={copyByLocale(locale, 'No active subscription', 'لا يوجد اشتراك نشط')} tone="warning" badgeLabel={copyByLocale(locale, 'Not active', 'غير نشط')} details={[{ label: t('email'), value: data?.user?.email || '—' }]} action={navigate ? <Button variant="primary" onClick={() => navigate({ surface: 'public', page: 'pricing' })}>{t('pricing')}</Button> : undefined} />
  }
  return <SubscriptionCard title={t('subscriptionStatus')} status={sub?.plan || sub?.tier || projection?.plan_term || t('active')} tone={projection?.entitlement === 'payment_required' ? 'warning' : 'success'} badgeLabel={projection?.entitlement || sub?.status || t('active')} details={[{ label: t('email'), value: data?.user?.email || sub?.user_email || '—' }, { label: t('plan'), value: sub?.plan || sub?.tier || projection?.plan_term || t('planUnavailable') }, { label: t('expiresOn'), value: formatDisplayDate(sub?.expires_at || projection?.expires_at, locale) }, { label: t('status'), value: projection?.lifecycle || sub?.status || data?.status || '—' }]} />
}

function SupportThreadMessage({ message, locale }: { message: { id: string; sender?: string; senderRole?: SupportSenderRole; body?: string; createdAt?: string; created_at?: string }; locale: 'ar' | 'en' }) {
  const role = supportSenderRole(message.sender, message.senderRole)
  return <article className={supportMessageClass(role)} data-role={role}><strong>{supportSenderLabel(role, locale)}</strong>{role === 'system' ? <span>{message.body}</span> : <p>{message.body}</p>}<small>{formatDisplayDate(message.createdAt || message.created_at, locale)}</small></article>
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
  return <><PageHeader title={t('downloads')} description={t('downloadBody')} />{release.loading ? <DownloadCardSkeleton /> : release.error ? <ErrorBlock error={release.error} onRetry={release.reload} /> : <DownloadCard title={t('downloadForWindows')} version={release.data?.version || t('unavailable')} meta={[release.data?.filename || t('fileSize'), release.data?.sha256 || t('releaseNotes')]} buttonLabel={t('downloads')} disabled={!release.data?.available} onClick={() => { if (release.data?.downloadUrl) window.location.href = release.data.downloadUrl }} />}</>
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
      setError(supportErrorMessage(err, locale))
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
      setError(supportErrorMessage(err, locale))
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
      setError(supportErrorMessage(err, locale))
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<CustomerSupportThread>[] = [
    { key: 'ticket', header: '#', render: (row) => <strong>{stableTicketNumber(row.id, row.updatedAt)}</strong> },
    { key: 'subject', header: t('support'), render: (row) => <div><strong>{row.subject}</strong><small className="muted">{formatDisplayDate(row.lastMessageAt || row.updatedAt, locale)}</small></div> },
    { key: 'status', header: t('status'), render: (row) => <Badge tone={supportStatusTone(row.status)}>{supportStatusLabel(row.status, locale)}</Badge> },
    { key: 'unread', header: t('notifications'), render: (row) => row.unreadCount ? <Badge tone="info">{row.unreadCount}</Badge> : '0' },
    { key: 'updated', header: t('date'), render: (row) => formatDisplayDate(row.updatedAt, locale) },
  ]

  return (
    <>
      <PageHeader title={t('support')} description={t('recentSupport')} />
      <div className="portal-two-column">
        <Card>
          <SectionHeader title={t('createTicket')} description={copyByLocale(locale, 'Support replies appear in this portal and may also be delivered by email.', 'ستظهر ردود الدعم داخل هذه البوابة وقد تصلك أيضًا عبر البريد الإلكتروني.')} />
          <form className="settings-form" onSubmit={createTicket}>
            <FormField label={t('details')} htmlFor="support-subject" required><Input id="support-subject" value={subject} maxLength={160} onChange={(event) => setSubject(event.target.value)} required /></FormField>
            <FormField label={t('support')} htmlFor="support-body" required><Textarea id="support-body" value={body} maxLength={4000} onChange={(event) => setBody(event.target.value)} required /></FormField>
            <Button type="submit" variant="primary" loading={busy}>{t('createTicket')}</Button>
          </form>
        </Card>
        <Card>
          <SectionHeader title={t('recentSupport')} />
          <TableToolbar searchLabel={t('search')} searchValue={search} onSearch={setSearch} filters={<Select aria-label={t('status')} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">{t('status')}</option><option value="open">{supportStatusLabel('open', locale)}</option><option value="waiting_for_support">{supportStatusLabel('waiting_for_support', locale)}</option><option value="waiting_for_customer">{supportStatusLabel('waiting_for_customer', locale)}</option><option value="resolved">{supportStatusLabel('resolved', locale)}</option><option value="closed">{supportStatusLabel('closed', locale)}</option></Select>} />
          {threads.error ? <ErrorBlock error={supportErrorMessage(threads.error, locale)} onRetry={threads.reload} /> : <DataTable columns={columns} rows={visibleThreads} loading={threads.loading} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('support')} onRowClick={(row) => { setSelected(row); setError(''); setNotice('') }} />}
        </Card>
      </div>
      {error ? <Alert title={t('failed')} tone="danger">{error}</Alert> : null}
      {notice ? <Alert title={t('success')} tone="success">{notice}</Alert> : null}
      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? stableTicketNumber(selected.id, selected.updatedAt) : t('support')} description={selected?.subject} closeLabel={t('close')}>
        <div className="support-ticket-meta"><Badge tone={supportStatusTone(thread.data?.thread?.status || selected?.status)}>{supportStatusLabel(thread.data?.thread?.status || selected?.status, locale)}</Badge><span>{formatDisplayDate(thread.data?.thread?.updatedAt || selected?.updatedAt, locale)}</span></div>
        {thread.error ? <ErrorBlock error={supportErrorMessage(thread.error, locale)} onRetry={thread.reload} /> : null}
        <div className="support-thread">{thread.loading ? <LoadingBlock label={t('loading')} /> : thread.data?.messages.filter((message) => supportSenderRole(message.sender, message.senderRole) !== 'internal_note').map((message) => <SupportThreadMessage key={message.id} message={message} locale={locale} />)}</div>
        {(thread.data?.thread?.status || selected?.status) === 'closed' ? <Alert title={supportStatusLabel('closed', locale)} tone="info" action={<Button size="sm" onClick={() => setSelectedStatus('open')} loading={busy}>{copyByLocale(locale, 'Reopen', 'إعادة فتح')}</Button>}>{copyByLocale(locale, 'This ticket is closed. Reopen it if you need to add another reply.', 'هذه التذكرة مغلقة. أعد فتحها إذا كنت تريد إضافة رد جديد.')}</Alert> : <form className="settings-form" onSubmit={sendReply}><FormField label={t('reply')} htmlFor="support-reply"><Textarea id="support-reply" value={reply} maxLength={4000} onChange={(event) => setReply(event.target.value)} required /></FormField><div className="cluster"><Button type="submit" variant="primary" loading={busy}>{t('reply')}</Button>{selected ? <Button type="button" onClick={() => setSelectedStatus('closed')} loading={busy}>{t('close')}</Button> : null}</div></form>}
      </Drawer>
    </>
  )
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
  const { t, locale } = useExperience()
  const groups = useMemo<NavigationGroup[]>(() => [
    { items: [{ id: 'overview', label: t('overview'), icon: LayoutDashboard }] },
    { label: t('users'), items: [{ id: 'users', label: t('users'), icon: Users }, { id: 'subscriptions', label: t('subscriptions'), icon: CreditCard }, { id: 'commerce', label: t('payments'), icon: WalletCards }] },
    { label: t('distribution'), items: [{ id: 'releases', label: t('releases'), icon: PackageOpen }, { id: 'promos', label: t('promoCodes'), icon: Tags }] },
    { label: t('operations'), items: [{ id: 'support', label: t('supportInbox'), icon: LifeBuoy }, { id: 'communications', label: copyByLocale(locale, 'Email Operations', 'عمليات البريد'), icon: Mail }, { id: 'diagnostics', label: t('diagnostics'), icon: Bug }] },
    { label: t('governance'), items: [{ id: 'policies', label: t('policies'), icon: ShieldCheck }, { id: 'audit', label: t('auditLog'), icon: ScrollText }, { id: 'settings', label: t('settings'), icon: Settings }] },
  ], [t, locale])
  const title = groups.flatMap((group) => group.items).find((item) => item.id === page)?.label || t('adminOverview')
  return <AdminGuard navigate={navigate}><WorkspaceShell surface="admin" page={page} title={title} groups={groups} navigate={navigate} admin>{page === 'subscriptions' || page === 'users' ? <AdminSubscriptions /> : page === 'releases' ? <AdminReleases /> : page === 'support' ? <AdminSupportV2 /> : page === 'communications' ? <AdminEmailOperations /> : page === 'diagnostics' ? <AdminDiagnostics /> : page === 'audit' ? <AdminAudit /> : page === 'promos' ? <AdminPromos /> : page === 'commerce' ? <AdminCommerce /> : page === 'policies' ? <AdminPolicies /> : <AdminOverview />}</WorkspaceShell></AdminGuard>
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
  if (dashboard.loading) return <AdminOverviewSkeleton />
  return <><PageHeader title={t('adminOverview')} description={t('serviceHealth')} />{dashboard.error ? <ErrorBlock error={dashboard.error} onRetry={dashboard.reload} /> : null}<div className="admin-metric-strip">{[t('totalUsers'), t('activeSubscriptions'), t('openTickets'), t('unresolvedCrashes')].map((label, index) => <StatCard key={label} label={label} value={Object.values(kpis)[index] ?? '—'} />)}</div><Card><SectionHeader title={t('recentAdminActivity')} /><pre className="mono">{JSON.stringify(dashboard.data?.recentActivity || [], null, 2)}</pre></Card></>
}

function AdminSubscriptions() {
  const { t, locale } = useExperience()
  const { admin } = useAdapters()
  const [search, setSearch] = useState('')
  const [grantOpen, setGrantOpen] = useState(false)
  const rows = useAsyncData(() => admin.listSubscriptions({ search }), [admin, search])
  if (rows.loading && !rows.data) return <AdminSubscriptionsSkeleton />
  const columns: Column<AdminSubscription>[] = [
    { key: 'email', header: t('email'), render: (row) => row.user_email || row.firebase_user_id || row.id },
    { key: 'status', header: t('status'), render: (row) => <Badge tone={row.status === 'active' ? 'success' : 'warning'}>{row.status}</Badge> },
    { key: 'plan', header: t('plan'), render: (row) => row.plan },
    { key: 'expires', header: t('expiryDate'), render: (row) => formatDisplayDate(row.expires_at, locale) },
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
    { key: 'updated', header: t('date'), render: (row) => formatDisplayDate(row.updated_at, locale) },
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
      setNotice(t('success'))
      messages.reload()
      threads.reload()
    } catch (err) {
      setError(supportErrorMessage(err, locale))
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
      setError(supportErrorMessage(err, locale))
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
      setError(supportErrorMessage(err, locale))
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
      setError(supportErrorMessage(err, locale))
    } finally {
      setBusy(false)
    }
  }
  return <><PageHeader title={t('supportInbox')} description={copyByLocale(locale, 'Manage customer support threads, internal notes, status changes, and sender blocks.', 'إدارة تذاكر الدعم، الملاحظات الداخلية، تغييرات الحالة، وحظر المرسلين.')} /><TableToolbar searchLabel={t('search')} searchValue={search} onSearch={setSearch} filters={<Select aria-label={t('status')} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">{t('status')}</option><option value="open">{supportStatusLabel('open', locale)}</option><option value="waiting_for_support">{supportStatusLabel('waiting_for_support', locale)}</option><option value="waiting_for_customer">{supportStatusLabel('waiting_for_customer', locale)}</option><option value="resolved">{supportStatusLabel('resolved', locale)}</option><option value="closed">{supportStatusLabel('closed', locale)}</option></Select>} />{threads.error ? <ErrorBlock error={supportErrorMessage(threads.error, locale)} onRetry={threads.reload} /> : <DataTable columns={columns} rows={visibleThreads} loading={threads.loading} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('supportInbox')} onRowClick={(row) => { setSelected(row); setError(''); setNotice(''); setReply(''); setInternalNote('') }} />}{error ? <Alert title={t('failed')} tone="danger">{error}</Alert> : null}{notice ? <Alert title={t('success')} tone="success">{notice}</Alert> : null}<Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? stableTicketNumber(selected.id, selected.created_at, selected.updated_at) : t('support')} description={selected?.subject || t('support')} closeLabel={t('close')}><div className="support-admin-head"><div><Badge tone={supportStatusTone(selected?.status)}>{supportStatusLabel(selected?.status, locale)}</Badge><span>{selected?.email || '—'}</span><small>{selected?.app_version || selected?.platform || ''}</small></div><div className="cluster"><Button size="sm" leadingIcon={<Copy size={14} />} onClick={copyTicketNumber}>{copyByLocale(locale, 'Copy ticket number', 'نسخ رقم التذكرة')}</Button><Button size="sm" variant="secondary" onClick={toggleBlock} disabled={!selected || busy}>{selected?.support_blocked ? t('enabled') : t('blockSender')}</Button></div></div><div className="form-grid"><FormField label={t('status')} htmlFor="admin-ticket-status"><Select id="admin-ticket-status" value={selected?.status || 'open'} onChange={(event) => changeStatus(event.target.value)}><option value="open">{supportStatusLabel('open', locale)}</option><option value="waiting_for_support">{supportStatusLabel('waiting_for_support', locale)}</option><option value="waiting_for_customer">{supportStatusLabel('waiting_for_customer', locale)}</option><option value="resolved">{supportStatusLabel('resolved', locale)}</option><option value="closed">{supportStatusLabel('closed', locale)}</option></Select></FormField><FormField label={t('reason')} htmlFor="support-status-reason"><Input id="support-status-reason" value={statusReason} onChange={(event) => setStatusReason(event.target.value)} /></FormField></div>{messages.error ? <ErrorBlock error={supportErrorMessage(messages.error, locale)} onRetry={messages.reload} /> : null}<div className="support-thread">{messages.loading ? <LoadingBlock label={t('loading')} /> : messages.data?.map((message) => <SupportThreadMessage key={message.id} message={message} locale={locale} />)}</div><form className="settings-form" onSubmit={sendReply}><div className="form-grid"><FormField label={t('type')} htmlFor="admin-support-mode"><Select id="admin-support-mode" value={replyMode} onChange={(event) => setReplyMode(event.target.value as 'portal' | 'portal_email')}><option value="portal">{copyByLocale(locale, 'Portal only', 'البوابة فقط')}</option><option value="portal_email">{copyByLocale(locale, 'Portal + email', 'البوابة + البريد')}</option></Select></FormField><FormField label={copyByLocale(locale, 'Assigned admin', 'المسؤول المعين')} htmlFor="assigned-admin"><Input id="assigned-admin" value={copyByLocale(locale, 'Unassigned', 'غير معيّن')} readOnly /></FormField></div>{replyMode === 'portal_email' && !EMAIL_SUPPORT_ENABLED ? <Alert title={copyByLocale(locale, 'Email provider required', 'يتطلب مزود بريد')} tone="warning">{copyByLocale(locale, 'The reply will be saved in the portal. Email sending stays off until a transactional email provider is configured.', 'سيتم حفظ الرد داخل البوابة فقط. إرسال البريد يظل متوقفًا حتى يتم إعداد مزود بريد للرسائل التشغيلية.')}</Alert> : null}<FormField label={t('reply')} htmlFor="admin-support-reply"><Textarea id="admin-support-reply" value={reply} maxLength={4000} onChange={(event) => setReply(event.target.value)} required /></FormField><Button type="submit" variant="primary" loading={busy}>{t('reply')}</Button></form><Card padding="sm"><SectionHeader title={copyByLocale(locale, 'Internal note', 'ملاحظة داخلية')} description={copyByLocale(locale, 'Visible only to administrators.', 'تظهر للمديرين فقط.')} /><FormField label={t('adminNote')} htmlFor="admin-internal-note"><Textarea id="admin-internal-note" value={internalNote} maxLength={4000} onChange={(event) => setInternalNote(event.target.value)} /></FormField><Button type="button" onClick={saveInternalNote} loading={busy}>{t('save')}</Button></Card></Drawer></>
}

export function AdminSupport() {
  const { t, locale } = useExperience()
  const { admin } = useAdapters()
  const [selected, setSelected] = useState<AdminSupportThread | null>(null)
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const threads = useAsyncData(() => admin.listSupportThreads(), [admin])
  const messages = useAsyncData(() => selected ? admin.listSupportMessages(selected.id) : Promise.resolve([]), [admin, selected?.id])
  const columns: Column<AdminSupportThread>[] = [{ key: 'subject', header: t('support'), render: (row) => row.subject }, { key: 'email', header: t('email'), render: (row) => row.email || '—' }, { key: 'status', header: t('status'), render: (row) => <Badge>{row.status || 'open'}</Badge> }, { key: 'updated', header: t('date'), render: (row) => formatDisplayDate(row.updated_at, locale) }]
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
  return <><PageHeader title={t('supportInbox')} description={t('support')} />{threads.error ? <ErrorBlock error={threads.error} onRetry={threads.reload} /> : <DataTable columns={columns} rows={threads.data || []} loading={threads.loading} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('supportInbox')} onRowClick={(row) => { setSelected(row); setError(''); setNotice(''); setReply('') }} />}{error ? <Alert title={t('failed')} tone="danger">{error}</Alert> : null}{notice ? <Alert title={t('success')} tone="success">{notice}</Alert> : null}<Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.subject || t('support')} closeLabel={t('close')}><div className="support-thread">{messages.loading ? <LoadingBlock label={t('loading')} /> : messages.data?.map((message) => <SupportThreadMessage key={message.id} message={message} locale={locale} />)}</div><form className="settings-form" onSubmit={sendReply}><FormField label={t('reply')} htmlFor="admin-support-reply"><Textarea id="admin-support-reply" value={reply} onChange={(event) => setReply(event.target.value)} required /></FormField><div className="cluster"><Button type="submit" variant="primary" loading={busy}>{t('reply')}</Button><Button type="button" variant="secondary" onClick={toggleBlock} disabled={!selected || busy}>{selected?.support_blocked ? t('enabled') : t('blockSender')}</Button></div></form></Drawer></>
}

function AdminEmailOperations() {
  const { t, locale } = useExperience()
  const { admin } = useAdapters()
  const status = useAsyncData(() => admin.getEmailOperations(), [admin])
  const [tab, setTab] = useState('catalog')
  const [recipient, setRecipient] = useState('')
  const [emailType, setEmailType] = useState('admin.email_test')
  const [testLocale, setTestLocale] = useState<'ar' | 'en'>(locale)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const data = status.data as AdminEmailStatus | null
  const catalog = data?.catalog || []
  const testableCatalog = catalog.filter((item) => item.admin_test_allowed !== false && item.integration_status !== 'disabled')
  const categoryFlags = data?.config.category_flags || {}
  if (status.loading && !data) return <AdminEmailOperationsSkeleton />

  const sendTest = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await admin.sendAdminTestEmail({ recipient, emailType, locale: testLocale })
      setNotice(copyByLocale(locale, 'Test email queued.', 'تمت إضافة رسالة الاختبار إلى الطابور.'))
      status.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'email_test_failed')
    } finally {
      setBusy(false)
    }
  }

  const processQueue = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await admin.processEmailOutbox()
      setNotice(copyByLocale(locale, `Processed ${result.processed}; sent ${result.sent}.`, `تمت معالجة ${result.processed}؛ تم إرسال ${result.sent}.`))
      status.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'email_process_failed')
    } finally {
      setBusy(false)
    }
  }

  const retryJob = async (jobId: string) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await admin.retryEmailJob(jobId)
      setNotice(copyByLocale(locale, 'Retry requested.', 'تم طلب إعادة المحاولة.'))
      status.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'email_retry_failed')
    } finally {
      setBusy(false)
    }
  }

  const catalogColumns: Column<AdminEmailCatalogItem>[] = [
    { key: 'event', header: copyByLocale(locale, 'Event', 'الحدث'), render: (row) => <div><strong>{locale === 'ar' ? row.title_ar : row.title_en}</strong><small className="muted">{row.event_type}</small></div> },
    { key: 'category', header: copyByLocale(locale, 'Category', 'التصنيف'), render: (row) => <Badge>{row.category}</Badge> },
    { key: 'status', header: t('status'), render: (row) => <Badge tone={emailIntegrationTone(row.integration_status)}>{row.integration_status}</Badge> },
    { key: 'sender', header: copyByLocale(locale, 'Sender', 'المرسل'), render: (row) => row.sender_identity },
    { key: 'template', header: copyByLocale(locale, 'Template', 'القالب'), render: (row) => `${row.template_key} v${row.template_version}` },
  ]
  const jobColumns: Column<AdminEmailJob>[] = [
    { key: 'type', header: copyByLocale(locale, 'Type', 'النوع'), render: (row) => <div><strong>{row.catalog_event_type || row.email_type}</strong><small className="muted">{row.template_key || ''}</small></div> },
    { key: 'recipient', header: copyByLocale(locale, 'Recipient', 'المستلم'), render: (row) => row.recipient },
    { key: 'status', header: t('status'), render: (row) => <Badge tone={emailJobTone(row.status)}>{row.status}</Badge> },
    { key: 'attempts', header: copyByLocale(locale, 'Attempts', 'المحاولات'), render: (row) => `${row.attempt_count || 0}/${row.max_attempts || 0}` },
    { key: 'date', header: t('date'), render: (row) => formatDisplayDate(row.created_at || row.updated_at, locale) },
    { key: 'actions', header: t('actions'), render: (row) => <Button type="button" size="sm" onClick={() => retryJob(row.id)} disabled={busy}>{copyByLocale(locale, 'Retry', 'إعادة')}</Button> },
  ]
  const scheduledColumns: Column<AdminScheduledEmail>[] = [
    { key: 'type', header: copyByLocale(locale, 'Type', 'النوع'), render: (row) => row.event_type },
    { key: 'recipient', header: copyByLocale(locale, 'Recipient', 'المستلم'), render: (row) => row.recipient },
    { key: 'status', header: t('status'), render: (row) => <Badge tone={emailJobTone(row.status)}>{row.status}</Badge> },
    { key: 'scheduled', header: copyByLocale(locale, 'Scheduled for', 'موعد الإرسال'), render: (row) => row.scheduled_for },
    { key: 'error', header: t('details'), render: (row) => row.last_error || '—' },
  ]
  const inboundColumns: Column<AdminInboundEmailMessage>[] = [
    { key: 'from', header: copyByLocale(locale, 'From', 'من'), render: (row) => row.sender_email || '—' },
    { key: 'to', header: copyByLocale(locale, 'To', 'إلى'), render: (row) => row.recipient_email || '—' },
    { key: 'subject', header: t('details'), render: (row) => row.subject || row.rejection_reason || '—' },
    { key: 'status', header: t('status'), render: (row) => <Badge tone={emailJobTone(row.status)}>{row.status}</Badge> },
    { key: 'date', header: t('date'), render: (row) => formatDisplayDate(row.received_at || row.created_at, locale) },
  ]
  const providerColumns: Column<AdminEmailProviderEvent>[] = [
    { key: 'event', header: copyByLocale(locale, 'Provider event', 'حدث المزود'), render: (row) => <Badge tone={emailJobTone(row.event_type)}>{row.event_type}</Badge> },
    { key: 'message', header: copyByLocale(locale, 'Message ID', 'معرف الرسالة'), render: (row) => row.provider_message_id || '—' },
    { key: 'job', header: copyByLocale(locale, 'Job', 'المهمة'), render: (row) => row.email_job_id || '—' },
    { key: 'date', header: t('date'), render: (row) => formatDisplayDate(row.created_at || row.processed_at, locale) },
  ]
  const flagColumns: Column<AdminEmailRecipientFlag>[] = [
    { key: 'email', header: t('email'), render: (row) => row.email },
    { key: 'status', header: t('status'), render: (row) => <Badge tone={emailJobTone(row.status)}>{row.status}</Badge> },
    { key: 'reason', header: t('reason'), render: (row) => row.reason || '—' },
    { key: 'date', header: t('date'), render: (row) => formatDisplayDate(row.updated_at || row.created_at, locale) },
  ]

  return (
    <>
      <PageHeader
        title={copyByLocale(locale, 'Email Operations', 'عمليات البريد')}
        description={copyByLocale(locale, 'Transactional email catalog, queue, provider webhooks, and suppression state.', 'كتالوج الرسائل التشغيلية والطابور وأحداث المزود وحالات الحظر.')}
        actions={<Button type="button" leadingIcon={<RefreshCcw size={15} />} onClick={status.reload}>{t('retry')}</Button>}
      />
      {status.error ? <ErrorBlock error={status.error} onRetry={status.reload} /> : null}
      {data ? (
        <>
          <div className="admin-metric-strip">
            <StatCard label={copyByLocale(locale, 'Outbound', 'الإرسال')} value={boolLabel(data.config.outbound_enabled, locale)} />
            <StatCard label={copyByLocale(locale, 'Inbound', 'الاستقبال')} value={boolLabel(data.config.inbound_enabled, locale)} />
            <StatCard label={copyByLocale(locale, 'Scheduler', 'الجدولة')} value={boolLabel(data.config.scheduler_enabled, locale)} />
            <StatCard label={copyByLocale(locale, 'Send key', 'مفتاح الإرسال')} value={boolLabel(data.config.has_resend_send_api_key, locale)} />
            <StatCard label={copyByLocale(locale, 'Receive key', 'مفتاح الاستقبال')} value={boolLabel(data.config.has_resend_receive_api_key, locale)} />
            <StatCard label={copyByLocale(locale, 'Webhook secret', 'توقيع Webhook')} value={boolLabel(data.config.has_resend_webhook_secret, locale)} />
            <StatCard label={copyByLocale(locale, 'Linked', 'مربوط')} value={data.metrics?.catalog_linked ?? 0} />
            <StatCard label={copyByLocale(locale, 'Prepared', 'جاهز')} value={data.metrics?.catalog_prepared ?? 0} />
            <StatCard label={copyByLocale(locale, 'Disabled', 'معطل')} value={data.metrics?.catalog_disabled ?? 0} />
            <StatCard label={copyByLocale(locale, 'Queued', 'الطابور')} value={data.jobs.length} />
          </div>
          <div className="admin-overview-grid">
            <Card>
              <SectionHeader title={copyByLocale(locale, 'Sender identities', 'هويات الإرسال')} description={data.config.reply_domain} />
              <dl className="detail-list">
                {Object.entries(data.config.sender_identities || { general: data.config.from }).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
              </dl>
            </Card>
            <Card>
              <SectionHeader title={copyByLocale(locale, 'Category flags', 'تفعيل التصنيفات')} description={copyByLocale(locale, 'Feature flags control which categories may send.', 'تحدد flags أي تصنيفات مسموح بإرسالها.')} />
              <div className="cluster">
                {Object.entries(categoryFlags).map(([key, value]) => <Badge key={key} tone={value ? 'success' : 'warning'}>{key}: {boolLabel(value, locale)}</Badge>)}
              </div>
            </Card>
          </div>
          <Card>
            <SectionHeader title={copyByLocale(locale, 'Admin test email', 'رسالة اختبار للإدارة')} description={copyByLocale(locale, 'Only catalog events marked as admin-testable can be queued from here.', 'يمكن إرسال الأحداث المسموح باختبارها من الكتالوج فقط.')} />
            <form className="settings-form" onSubmit={sendTest}>
              <div className="form-grid">
                <FormField label={copyByLocale(locale, 'Recipient', 'المستلم')} htmlFor="email-test-recipient" required><Input id="email-test-recipient" type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} required /></FormField>
                <FormField label={copyByLocale(locale, 'Template', 'القالب')} htmlFor="email-test-template"><Select id="email-test-template" value={emailType} onChange={(event) => setEmailType(event.target.value)}>{(testableCatalog.length ? testableCatalog : [{ event_type: 'admin.email_test', title_en: 'Admin test email', title_ar: 'رسالة اختبار من الإدارة' } as AdminEmailCatalogItem]).map((item) => <option key={item.event_type} value={item.event_type}>{locale === 'ar' ? item.title_ar : item.title_en}</option>)}</Select></FormField>
                <FormField label={copyByLocale(locale, 'Language', 'اللغة')} htmlFor="email-test-locale"><Select id="email-test-locale" value={testLocale} onChange={(event) => setTestLocale(event.target.value as 'ar' | 'en')}><option value="ar">العربية</option><option value="en">English</option></Select></FormField>
              </div>
              <div className="cluster">
                <Button type="submit" variant="primary" leadingIcon={<Send size={15} />} loading={busy}>{copyByLocale(locale, 'Queue test', 'إرسال اختبار')}</Button>
                <Button type="button" onClick={processQueue} loading={busy}>{copyByLocale(locale, 'Process queue', 'معالجة الطابور')}</Button>
              </div>
            </form>
          </Card>
          {error ? <Alert title={t('failed')} tone="danger">{error}</Alert> : null}
          {notice ? <Alert title={t('success')} tone="success">{notice}</Alert> : null}
          <Tabs ariaLabel={copyByLocale(locale, 'Email sections', 'أقسام البريد')} active={tab} onChange={setTab} items={[
            { id: 'catalog', label: copyByLocale(locale, 'Catalog', 'الكتالوج') },
            { id: 'outbox', label: copyByLocale(locale, 'Outbox', 'الطابور') },
            { id: 'scheduled', label: copyByLocale(locale, 'Scheduled', 'مجدول') },
            { id: 'inbound', label: copyByLocale(locale, 'Inbound', 'الوارد') },
            { id: 'events', label: copyByLocale(locale, 'Provider events', 'أحداث المزود') },
            { id: 'flags', label: copyByLocale(locale, 'Recipient flags', 'حالات المستلمين') },
          ]} />
          <div className="admin-tab-panel">
            {tab === 'catalog' ? <DataTable columns={catalogColumns} rows={catalog} rowKey={(row) => row.event_type} emptyTitle={t('tableEmpty')} emptyBody={copyByLocale(locale, 'No catalog events found.', 'لا توجد أحداث بريد.')} /> : null}
            {tab === 'outbox' ? <DataTable columns={jobColumns} rows={data.jobs} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={copyByLocale(locale, 'No queued jobs.', 'لا توجد مهام في الطابور.')} /> : null}
            {tab === 'scheduled' ? <DataTable columns={scheduledColumns} rows={data.scheduled || []} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={copyByLocale(locale, 'No scheduled notifications.', 'لا توجد رسائل مجدولة.')} /> : null}
            {tab === 'inbound' ? <DataTable columns={inboundColumns} rows={data.inbound} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={copyByLocale(locale, 'No inbound emails.', 'لا توجد رسائل واردة.')} /> : null}
            {tab === 'events' ? <DataTable columns={providerColumns} rows={data.provider_events || []} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={copyByLocale(locale, 'No provider events.', 'لا توجد أحداث من المزود.')} /> : null}
            {tab === 'flags' ? <DataTable columns={flagColumns} rows={data.recipient_flags || []} rowKey={(row) => row.email} emptyTitle={t('tableEmpty')} emptyBody={copyByLocale(locale, 'No suppressed recipients.', 'لا توجد حالات حظر للمستلمين.')} /> : null}
          </div>
        </>
      ) : <Card><LoadingBlock label={t('loading')} /></Card>}
    </>
  )
}

function AdminDiagnostics() {
  const { t, locale } = useExperience()
  const adapters = useAdapters()
  const [tab, setTab] = useState('crashes')
  const logs = useAsyncData(() => adapters.admin.listCrashLogs(), [adapters])
  const groups = useAsyncData(() => adapters.admin.listCrashGroups(), [adapters])
  const logColumns: Column<AdminCrashLog>[] = [{ key: 'type', header: t('type'), render: (row) => row.error_type }, { key: 'message', header: t('details'), render: (row) => row.message || row.stack_trace?.slice(0, 80) || '—' }, { key: 'date', header: t('date'), render: (row) => formatDisplayDate(row.happened_at, locale) }]
  const groupColumns: Column<AdminCrashGroup>[] = [{ key: 'type', header: t('type'), render: (row) => row.error_type }, { key: 'count', header: t('details'), render: (row) => row.count }, { key: 'date', header: t('date'), render: (row) => row.last_seen_at }]
  return <><PageHeader title={t('diagnostics')} description={t('crashReports')} /><Tabs ariaLabel={t('diagnostics')} active={tab} onChange={setTab} items={[{ id: 'crashes', label: t('crashReports') }, { id: 'groups', label: t('crashSummary') }]} />{tab === 'groups' ? <DataTable columns={groupColumns} rows={groups.data || []} loading={groups.loading} rowKey={(row) => row.fingerprint} emptyTitle={t('tableEmpty')} emptyBody={t('crashSummary')} /> : <DataTable columns={logColumns} rows={logs.data || []} loading={logs.loading} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('crashReports')} />}</>
}

function AdminAudit() {
  const { t, locale } = useExperience()
  const adapters = useAdapters()
  const rows = useAsyncData(() => adapters.admin.listAuditLog(), [adapters])
  const columns: Column<AdminAuditLogItem>[] = [{ key: 'date', header: t('date'), render: (row) => formatDisplayDate(row.happened_at || row.at, locale) }, { key: 'action', header: t('actions'), render: (row) => row.action || row.type || '—' }, { key: 'entity', header: t('details'), render: (row) => row.entity || row.entity_id || '—' }]
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
