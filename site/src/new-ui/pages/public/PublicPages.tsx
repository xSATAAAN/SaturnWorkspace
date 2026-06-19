import { useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Cloud, DatabaseBackup,
  Download, FolderClock, Layers3, LifeBuoy, Mail, Monitor,
  Play, Search, ShieldCheck, Sparkles, UserRoundCheck, Workflow,
} from 'lucide-react'
import { developmentMockAdapter } from '../../adapters/mockAdapter'
import { useExperience } from '../../app/ExperienceProvider'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/DataDisplay'
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback'
import { FormField, Input, Textarea } from '../../components/ui/FormControls'
import { Reveal } from '../../components/marketing/Reveal'
import { Accordion } from '../../components/ui/Navigation'
import { DownloadCard, PricingCard, ReleaseCard } from '../../components/ui/ProductCards'
import { publicCopy } from '../../content/publicCopy'
import { PublicLayout } from '../../layouts/WorkspaceShell'
import type { Navigate } from '../../layouts/SharedChrome'
import appIcon from '../../assets/saturnws-app-icon.png'

type PublicPageProps = { page: string; navigate: Navigate }
type MockupView = 'session' | 'accounts' | 'backup'

function ProductWorkspaceMockup({ view = 'session', compact = false }: { view?: MockupView; compact?: boolean }) {
  const { locale } = useExperience()
  const ar = locale === 'ar'
  const nav = ar ? ['نظرة عامة', 'بدء جلسة', 'الخزنة والتذكيرات', 'قاعدة البريد', 'النسخ الاحتياطي'] : ['Overview', 'New session', 'Accounts', 'Saved email', 'Backups']
  const active = view === 'session' ? 1 : view === 'accounts' ? 2 : 4
  return <div className={`saturn-mockup saturn-mockup--${view}${compact ? ' is-compact' : ''}`} aria-label={ar ? 'معاينة واجهة Saturn Workspace' : 'Saturn Workspace product preview'}>
    <div className="saturn-mockup__window"><i /><i /><i /><span>Saturn Workspace</span></div>
    <div className="saturn-mockup__app">
      <aside><strong><img src={appIcon} alt="" />Saturn</strong>{nav.map((item, index) => <div key={item} className={index === active ? 'is-active' : ''}>{index === active ? <span className="saturn-mockup__nav-mark" /> : null}{item}</div>)}</aside>
      <section className="saturn-mockup__main">
        {view === 'session' ? <SessionMockup ar={ar} /> : null}
        {view === 'accounts' ? <AccountsMockup ar={ar} /> : null}
        {view === 'backup' ? <BackupMockup ar={ar} /> : null}
      </section>
    </div>
  </div>
}

function MockField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`mock-field${wide ? ' is-wide' : ''}`}><span>{label}</span><strong>{value}</strong><ChevronRight size={12} /></div>
}

function SessionMockup({ ar }: { ar: boolean }) {
  return <><header className="mock-page-head"><div><small>{ar ? 'سير العمل' : 'Workflow'}</small><h3>{ar ? 'بدء جلسة جديدة' : 'Start a new session'}</h3></div><Badge tone="success">{ar ? 'جاهز' : 'Ready'}</Badge></header><div className="mock-tabs"><span className="is-active">AdsPower</span></div><div className="mock-form-grid"><MockField label={ar ? 'البريد الإلكتروني' : 'Email account'} value={ar ? 'حساب محفوظ' : 'Saved account'} /><MockField label={ar ? 'الرابط' : 'Destination'} value={ar ? 'رابط محفوظ' : 'Saved link'} /><MockField label={ar ? 'خيارات البروكسي' : 'Proxy options'} value={ar ? 'اختياري' : 'Optional'} /><MockField label={ar ? 'الدولة' : 'Country'} value={ar ? 'مصر' : 'Egypt'} /></div><div className="mock-session-log"><span><CheckCircle2 size={14} />{ar ? 'تم تجهيز البريد' : 'Email prepared'}</span><span><CheckCircle2 size={14} />{ar ? 'تم تجهيز بروفايل المتصفح' : 'Browser profile prepared'}</span><span className="is-current"><span />{ar ? 'جاهز لفتح الجلسة' : 'Ready to launch'}</span></div><footer><button>{ar ? 'إلغاء' : 'Cancel'}</button><button className="is-primary">{ar ? 'بدء الجلسة' : 'Start session'}</button></footer></>
}

function AccountsMockup({ ar }: { ar: boolean }) {
  const rows = ar ? [
    ['account.one@example.com', 'جاهز', 'اليوم'], ['account.two@example.com', 'مراجعة', 'أمس'], ['account.three@example.com', 'جاهز', 'منذ 3 أيام'],
  ] : [
    ['account.one@example.com', 'Ready', 'Today'], ['account.two@example.com', 'Review', 'Yesterday'], ['account.three@example.com', 'Ready', '3 days ago'],
  ]
  return <><header className="mock-page-head"><div><small>{ar ? 'مساحة العمل' : 'Workspace'}</small><h3>{ar ? 'الخزنة والتذكيرات' : 'Accounts and reminders'}</h3></div><div className="mock-search"><Search size={13} />{ar ? 'بحث' : 'Search'}</div></header><div className="mock-summary"><span><strong>{ar ? 'الحالة' : 'Status'}</strong>{ar ? 'كل الحسابات' : 'All accounts'}</span><span><strong>{ar ? 'المراجعة' : 'Review'}</strong>{ar ? 'تحتاج متابعة' : 'Needs attention'}</span><span><strong>{ar ? 'الاستعادة' : 'Recovery'}</strong>{ar ? 'متاحة' : 'Available'}</span></div><div className="mock-account-list">{rows.map((row, index) => <div key={row[0]}><span className="mock-avatar">{index + 1}</span><strong>{row[0]}</strong><Badge tone={index === 1 ? 'warning' : 'success'}>{row[1]}</Badge><small>{row[2]}</small><button>•••</button></div>)}</div></>
}

function BackupMockup({ ar }: { ar: boolean }) {
  return <><header className="mock-page-head"><div><small>{ar ? 'الاستعادة' : 'Recovery'}</small><h3>{ar ? 'النسخ الاحتياطي' : 'Backup explorer'}</h3></div><Badge>{ar ? 'متصل' : 'Connected'}</Badge></header><div className="mock-backup-path"><Cloud size={15} /><span>Google Drive / Saturn Workspace</span></div><div className="mock-backup-list"><div><FolderClock size={18} /><span><strong>{ar ? 'حسابات الخزنة' : 'Account records'}</strong><small>{ar ? 'آخر مزامنة اليوم' : 'Last synced today'}</small></span><CheckCircle2 size={16} /></div><div><Mail size={18} /><span><strong>{ar ? 'قاعدة البريد' : 'Saved email'}</strong><small>{ar ? 'نقطة استعادة متاحة' : 'Restore point available'}</small></span><CheckCircle2 size={16} /></div><div><DatabaseBackup size={18} /><span><strong>{ar ? 'نسخة محلية' : 'Local backup'}</strong><small>{ar ? 'جاهزة للاستعادة' : 'Ready to restore'}</small></span><CheckCircle2 size={16} /></div></div><div className="mock-backup-callout"><ShieldCheck size={18} /><span><strong>{ar ? 'الاستعادة تحت تحكمك' : 'Recovery stays under your control'}</strong><small>{ar ? 'راجع نقطة الاستعادة قبل تطبيقها.' : 'Review the restore point before applying it.'}</small></span></div></>
}

function SectionIntro({ title, body, align = 'start' }: { title: string; body: string; align?: 'start' | 'center' }) {
  return <header className={`marketing-heading marketing-heading--${align}`}><h2>{title}</h2><p>{body}</p></header>
}

function HomePage({ navigate }: { navigate: Navigate }) {
  const { locale, t } = useExperience()
  const c = publicCopy[locale]
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight
  return <>
    <section className="marketing-hero"><div className="container"><div className="marketing-hero__copy"><span className="announcement"><Sparkles size={14} />{c.announcement}</span><h1>{c.heroTitle}</h1><p>{c.heroBody}</p><div className="hero-actions"><Button size="lg" variant="primary" trailingIcon={<Arrow size={17} />} onClick={() => navigate({ surface: 'auth', page: 'signup' })}>{c.heroPrimary}</Button><Button size="lg" variant="ghost" trailingIcon={<Play size={16} />} onClick={() => navigate({ surface: 'public', page: 'product' })}>{c.heroSecondary}</Button></div><ul><li><Monitor size={15} />{c.proofOne}</li><li><UserRoundCheck size={15} />{c.proofTwo}</li><li><Cloud size={15} />{c.proofThree}</li></ul></div><Reveal className="hero-product-reveal" delay={120}><ProductWorkspaceMockup /></Reveal></div></section>

    <section className="marketing-band core-value"><Reveal><div className="container"><SectionIntro title={c.coreTitle} body={c.coreBody} align="center" /><div className="value-line"><span><Layers3 size={19} />{c.stepAccount}</span><span><Workflow size={19} />{c.stepProfile}</span><span><Cloud size={19} />{c.stepLaunch}</span></div></div></Reveal></section>

    <section className="marketing-section"><div className="container split-feature"><Reveal className="split-feature__copy"><span className="section-index">01</span><SectionIntro title={c.sessionsTitle} body={c.sessionsBody} /><ol className="feature-steps"><li><span>1</span><div><strong>{c.stepAccount}</strong><p>{c.stepAccountBody}</p></div></li><li><span>2</span><div><strong>{c.stepProfile}</strong><p>{c.stepProfileBody}</p></div></li><li><span>3</span><div><strong>{c.stepLaunch}</strong><p>{c.stepLaunchBody}</p></div></li></ol></Reveal><Reveal delay={100}><ProductWorkspaceMockup view="session" compact /></Reveal></div></section>

    <section className="marketing-section marketing-section--subtle"><div className="container split-feature split-feature--reverse"><Reveal><ProductWorkspaceMockup view="accounts" compact /></Reveal><Reveal className="split-feature__copy" delay={100}><span className="section-index">02</span><SectionIntro title={c.accountsTitle} body={c.accountsBody} /><div className="plain-points"><span><Check size={16} />{c.stepAccount}</span><span><Check size={16} />{c.stepLaunch}</span><span><Check size={16} />{c.featureRecovery}</span></div></Reveal></div></section>

    <section className="marketing-section"><div className="container split-feature"><Reveal className="split-feature__copy"><span className="section-index">03</span><SectionIntro title={c.backupTitle} body={c.backupBody} /><div className="recovery-rail"><span><DatabaseBackup size={18} />{c.featureRecovery}</span><span><Mail size={18} />{t('workflowAccounts')}</span><span><Cloud size={18} />Google Drive</span></div></Reveal><Reveal delay={100}><ProductWorkspaceMockup view="backup" compact /></Reveal></div></section>

    <section className="dark-product-band"><div className="container"><Reveal><div className="dark-product-band__copy"><span className="section-index">04</span><SectionIntro title={c.isolationTitle} body={c.isolationBody} align="center" /></div><div className="browser-profile-visual"><div className="browser-profile-visual__bar"><i /><i /><i /><span>{c.proofOne}</span></div><div className="browser-profile-visual__body is-single"><div><ShieldCheck size={28} /><strong>AdsPower</strong><span>{c.stepProfileBody}</span></div></div></div></Reveal></div></section>

    <section className="marketing-section proxy-support"><div className="container"><Reveal><div className="proxy-support__layout"><div><span className="section-index">05</span><SectionIntro title={c.proxyTitle} body={c.proxyBody} /></div><div><span>{c.providers}</span><strong>{locale === 'ar' ? 'الدولة' : 'Country'}</strong><strong>{locale === 'ar' ? 'البروتوكول' : 'Protocol'}</strong><strong>{locale === 'ar' ? 'مدة الثبات' : 'Stability'}</strong><strong>{locale === 'ar' ? 'فحص السرعة' : 'Speed check'}</strong><small>{locale === 'ar' ? 'يُجهّز قبل فتح الجلسة' : 'Prepared before launch'}</small></div></div></Reveal></div></section>

    <section className="marketing-section marketing-section--subtle use-cases"><div className="container"><Reveal><SectionIntro title={c.useCasesTitle} body={c.useCasesBody} align="center" /><div className="use-case-strip"><ProductWorkspaceMockup view="accounts" compact /><ProductWorkspaceMockup view="backup" compact /></div></Reveal></div></section>

    <PricingPreview navigate={navigate} />
    <FaqBlock />
    <section className="final-cta"><Reveal><div className="container"><div><h2>{c.finalTitle}</h2><p>{c.finalBody}</p></div><div className="cluster"><Button size="lg" variant="primary" onClick={() => navigate({ surface: 'auth', page: 'signup' })}>{c.heroPrimary}</Button><Button size="lg" onClick={() => navigate({ surface: 'public', page: 'download' })}>{t('downloads')}</Button></div></div></Reveal></section>
  </>
}

function PricingPreview({ navigate, full = false }: { navigate: Navigate; full?: boolean }) {
  const { locale } = useExperience()
  const c = publicCopy[locale]
  const plans = [
    { name: c.weeklyName, description: c.weeklyBody, price: c.weeklyPrice, originalPrice: c.weeklyOriginalPrice, period: c.weeklyPeriod, features: [c.featureWorkspace, c.featureProfiles, c.featureUpdates], featured: false },
    { name: c.monthlyName, description: c.monthlyBody, price: c.monthlyPrice, originalPrice: c.monthlyOriginalPrice, period: c.monthlyPeriod, features: [c.featureWorkspace, c.featureProfiles, c.featureRecovery], featured: true },
    { name: c.annualName, description: c.annualBody, price: c.annualPrice, originalPrice: c.annualOriginalPrice, period: c.annualPeriod, features: [c.featureWorkspace, c.featureProfiles, c.featureRecovery, c.featureUpdates], featured: false },
  ]
  return <section className={`marketing-section pricing-section${full ? ' pricing-page' : ''}`}><div className="container"><Reveal><header className="marketing-heading marketing-heading--center">{full ? <h1>{c.pricingTitle}</h1> : <h2>{c.pricingTitle}</h2>}<p>{c.pricingBody}</p></header></Reveal><div className="pricing-promo">{c.trialPromo}</div><div className="pricing-grid">{plans.map((plan, index) => <Reveal key={plan.name} delay={index * 80}><PricingCard name={plan.name} description={plan.description} price={plan.price} originalPrice={plan.originalPrice} period={plan.period} features={plan.features} cta={c.requestAccess} featured={plan.featured} featuredLabel={c.recommended} onClick={() => navigate({ surface: 'auth', page: 'signup' })} /></Reveal>)}</div>{full ? <PlanComparison /> : <div className="marketing-center"><Button variant="text" trailingIcon={<ArrowRight size={15} />} onClick={() => navigate({ surface: 'public', page: 'pricing' })}>{locale === 'ar' ? 'عرض تفاصيل الاشتراك' : 'View plan details'}</Button></div>}</div></section>
}

function PlanComparison() {
  const { locale } = useExperience()
  const c = publicCopy[locale]
  const rows = [c.featureWorkspace, c.featureProfiles, c.featureRecovery, c.featureUpdates]
  return <Reveal><section className="comparison"><div><h2>{c.compareTitle}</h2><p>{c.trustNote}</p></div><div className="comparison-list">{rows.map((row) => <span key={row}><CheckCircle2 size={17} />{row}</span>)}</div></section></Reveal>
}

function FaqBlock() {
  const { locale } = useExperience()
  const c = publicCopy[locale]
  const items = [
    { id: 'windows', title: c.faqWindows, body: c.faqWindowsBody },
    { id: 'profiles', title: c.faqProfiles, body: c.faqProfilesBody },
    { id: 'backup', title: c.faqBackup, body: c.faqBackupBody },
    { id: 'proxy', title: c.faqProxy, body: c.faqProxyBody },
  ]
  return <section className="marketing-section faq-section"><div className="container"><Reveal><SectionIntro title={c.faqTitle} body="" align="center" /><Accordion items={items} /></Reveal></div></section>
}

function ProductPage() {
  const { locale } = useExperience()
  const c = publicCopy[locale]
  return <div className="marketing-section page-enter"><div className="container"><header className="marketing-heading marketing-heading--center marketing-heading--wide"><h1>{c.productPageTitle}</h1><p>{c.productPageBody}</p></header><ProductWorkspaceMockup /><div className="product-showcase-stack"><Reveal><SectionIntro title={c.sessionsTitle} body={c.sessionsBody} /><ProductWorkspaceMockup view="session" compact /></Reveal><Reveal><SectionIntro title={c.accountsTitle} body={c.accountsBody} /><ProductWorkspaceMockup view="accounts" compact /></Reveal><Reveal><SectionIntro title={c.backupTitle} body={c.backupBody} /><ProductWorkspaceMockup view="backup" compact /></Reveal></div></div></div>
}

function DownloadPage({ customer = false }: { customer?: boolean }) {
  const { locale, t } = useExperience()
  const c = publicCopy[locale]
  const [state, setState] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle')
  const load = async () => { setState('loading'); const response = await developmentMockAdapter.loadRelease(); setState(response.data.available ? 'idle' : 'empty') }
  return <div className="marketing-section page-enter"><div className="container narrow-page"><header className="marketing-heading marketing-heading--center"><h1>{t('downloadTitle')}</h1><p>{c.downloadNatural}</p></header>{state === 'loading' ? <Card><div className="download-skeleton"><span /><span /><span /></div></Card> : state === 'error' ? <Alert title={t('downloadError')} tone="danger" action={<Button size="sm" onClick={load}>{t('retry')}</Button>} /> : state === 'empty' ? <EmptyState icon={Download} title={t('noRelease')} body={c.downloadNatural} action={<Button onClick={load}>{t('retry')}</Button>} /> : <DownloadCard title={t('downloadForWindows')} version={t('unavailable')} meta={[t('fileSize'), t('architecture'), t('requirements')]} buttonLabel={t('downloads')} disabled />}<section className="release-notes-block"><h2>{t('releaseNotes')}</h2><p>{c.releaseNatural}</p></section>{customer ? <Alert title={t('subscriptionStatus')} tone="info">{c.downloadNatural}</Alert> : null}</div></div>
}

function ReleasesPage({ changelog = false }: { changelog?: boolean }) {
  const { locale, t } = useExperience()
  const c = publicCopy[locale]
  return <div className="marketing-section page-enter"><div className="container narrow-page"><header className="marketing-heading marketing-heading--center"><h1>{changelog ? t('changelog') : t('releases')}</h1><p>{c.releaseNatural}</p></header><Card><ReleaseCard version={t('unavailable')} channel={t('stable')} status={t('pending')} date="—" notesLabel={t('releaseNotes')} /></Card></div></div>
}

function ContactPage({ ticket = false }: { ticket?: boolean }) {
  const { locale, t } = useExperience()
  const c = publicCopy[locale]
  const [sent, setSent] = useState(false)
  const submit = async (event: FormEvent) => { event.preventDefault(); await developmentMockAdapter.createSupportTicket('Support request', 'Message'); setSent(true) }
  return <div className="marketing-section page-enter"><div className="container contact-grid"><div><LifeBuoy size={28} /><h1>{ticket ? t('createTicket') : t('contact')}</h1><p>{c.contactBody}</p></div><Card><form className="stack" onSubmit={submit}><FormField label={t('email')} htmlFor="contact-email" required><Input id="contact-email" type="email" required placeholder="name@example.com" /></FormField><FormField label={t('details')} htmlFor="contact-subject" required><Input id="contact-subject" required /></FormField><FormField label={t('support')} htmlFor="contact-message" required><Textarea id="contact-message" required /></FormField><Button variant="primary" type="submit">{t('continue')}</Button>{sent ? <Alert title={t('success')} tone="success">{c.messageSent}</Alert> : null}</form></Card></div></div>
}

function LegalPage({ page }: { page: string }) {
  const { locale, t } = useExperience()
  const c = publicCopy[locale]
  const titleMap: Record<string, string> = { privacy: t('privacy'), terms: t('terms'), refund: t('refund'), 'acceptable-use': t('acceptableUse'), cookies: t('cookies') }
  return <div className="marketing-section page-enter"><article className="container legal-document"><h1>{titleMap[page] ?? t('privacy')}</h1><p>{c.legalBody}</p><h2>{t('details')}</h2><p>{c.trustNote}</p></article></div>
}

export function PublicPages({ page, navigate }: PublicPageProps) {
  let content: ReactNode
  if (page === 'home') content = <HomePage navigate={navigate} />
  else if (page === 'product' || page === 'features') content = <ProductPage />
  else if (page === 'pricing' || page === 'compare') content = <PricingPreview navigate={navigate} full />
  else if (page === 'download') content = <DownloadPage />
  else if (page === 'releases') content = <ReleasesPage />
  else if (page === 'changelog') content = <ReleasesPage changelog />
  else if (page === 'faq') content = <FaqBlock />
  else if (page === 'contact' || page === 'support') content = <ContactPage />
  else if (page === 'ticket') content = <ContactPage ticket />
  else content = <LegalPage page={page} />
  return <PublicLayout navigate={navigate}>{content}</PublicLayout>
}
