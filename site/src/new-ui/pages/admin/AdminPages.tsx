import { useMemo, useState } from 'react'
import { Activity, BookOpenText, Boxes, Bug, CircleDollarSign, CreditCard, FileClock, FileText, Gift, KeyRound, LayoutDashboard, LifeBuoy, Megaphone, PackageOpen, ScrollText, Settings, ShieldAlert, ShieldCheck, Tags, UserCog, Users, WalletCards } from 'lucide-react'
import { featureFlags } from '../../adapters/featureRegistry'
import { useExperience } from '../../app/ExperienceProvider'
import { Button } from '../../components/ui/Button'
import { ActionMenu, ActionMenuItem, Card, DataTable, FilterSelect, PageHeader, SectionHeader, StatCard, TableToolbar, Timeline, type Column } from '../../components/ui/DataDisplay'
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback'
import { Checkbox, FormField, Input, Select, Switch, Textarea } from '../../components/ui/FormControls'
import { SegmentedControl, Tabs } from '../../components/ui/Navigation'
import { ConfirmDialog, Drawer, Modal } from '../../components/ui/Overlays'
import { coverageRegistry, coverageSummary, type CoverageEntry } from '../../data/coverageRegistry'
import { mockAdminUsers, mockAuditRows, mockSupportThreads } from '../../data/mockData'
import { WorkspaceShell, type NavigationGroup } from '../../layouts/WorkspaceShell'
import { Brand, LocaleControl, ThemeControl, type Navigate } from '../../layouts/SharedChrome'

export function AdminPages({ page, navigate }: { page: string; navigate: Navigate }) {
  const { t } = useExperience()
  const groups = useMemo<NavigationGroup[]>(() => [
    { items: [{ id: 'overview', label: t('overview'), icon: LayoutDashboard }] },
    { label: t('users'), items: [{ id: 'users', label: t('users'), icon: Users }, { id: 'subscriptions', label: t('subscriptions'), icon: CreditCard }, { id: 'commerce', label: t('payments'), icon: WalletCards }] },
    { label: t('distribution'), items: [{ id: 'releases', label: t('releases'), icon: PackageOpen }, { id: 'promos', label: t('promoCodes'), icon: Tags }] },
    { label: t('operations'), items: [{ id: 'support', label: t('supportInbox'), icon: LifeBuoy }, { id: 'communications', label: t('announcements'), icon: Megaphone }, { id: 'diagnostics', label: t('diagnostics'), icon: Bug }] },
    { label: t('governance'), items: [{ id: 'policies', label: t('policies'), icon: ShieldCheck }, { id: 'audit', label: t('auditLog'), icon: ScrollText }, { id: 'content', label: t('content'), icon: BookOpenText }, { id: 'settings', label: t('settings'), icon: Settings }, { id: 'coverage', label: t('featureCoverage'), icon: Boxes }] },
  ], [t])
  if (page === 'login') return <AdminLoginPage navigate={navigate} />
  const title = groups.flatMap((group) => group.items).find((item) => item.id === page)?.label ?? t('adminOverview')
  const content = page === 'users' ? <UsersPage /> : page === 'subscriptions' ? <SubscriptionsPage /> : page === 'commerce' ? <CommercePage /> : page === 'releases' ? <ReleasesAdminPage /> : page === 'promos' ? <PromoPage /> : page === 'support' ? <SupportAdminPage /> : page === 'communications' ? <CommunicationsPage /> : page === 'diagnostics' ? <DiagnosticsPage /> : page === 'policies' ? <PoliciesPage /> : page === 'audit' ? <AuditPage /> : page === 'content' ? <ContentPage /> : page === 'settings' ? <AdminSettingsPage /> : page === 'coverage' ? <CoveragePage navigate={navigate} /> : <AdminOverview navigate={navigate} />
  return <WorkspaceShell surface="admin" page={page} title={title} groups={groups} navigate={navigate} admin>{content}</WorkspaceShell>
}

function AdminLoginPage({ navigate }: { navigate: Navigate }) {
  const { t } = useExperience()
  const [step, setStep] = useState<'preauth' | 'session'>('preauth')
  return <main className="admin-login"><header><Brand /><div className="cluster"><LocaleControl /><ThemeControl /></div></header><Card className="admin-login__card"><span className="auth-icon"><ShieldCheck size={23} /></span><h1>{t('adminConsole')}</h1><p>{step === 'preauth' ? t('secureByDesign') : t('signInBody')}</p><form className="stack" onSubmit={(event) => { event.preventDefault(); if (step === 'preauth') setStep('session'); else navigate({ surface: 'admin', page: 'overview' }) }}><FormField label={t('email')} htmlFor="admin-login-user"><Input id="admin-login-user" autoComplete="username" /></FormField><FormField label={t('password')} htmlFor="admin-login-password"><Input id="admin-login-password" type="password" autoComplete="current-password" /></FormField><Button variant="primary" size="lg" fullWidth>{step === 'preauth' ? t('continue') : t('signIn')}</Button></form><Badge tone="info">{step === 'preauth' ? 'pre-auth' : 'firebase-session'}</Badge></Card></main>
}

function AdminOverview({ navigate }: { navigate: Navigate }) {
  const { t } = useExperience()
  const metrics = [t('totalUsers'), t('activeSubscriptions'), t('expiringSubscriptions'), t('openTickets'), t('latestReleases'), t('securityAlerts'), t('unresolvedCrashes')]
  return <><PageHeader title={t('adminOverview')} description={t('previewData')} actions={<><Button onClick={() => navigate({ surface: 'admin', page: 'releases' })}>{t('createRelease')}</Button><Button variant="primary" onClick={() => navigate({ surface: 'admin', page: 'subscriptions' })}>{t('grantSubscription')}</Button></>} /><div className="admin-metric-strip">{metrics.map((label) => <StatCard key={label} label={label} value="—" detail={t('unavailableMetric')} />)}</div><Card className="service-health" padding="sm"><SectionHeader title={t('serviceHealth')} /><div>{['Auth', 'Policy', 'Updates', 'Support', 'Crash ingest'].map((service) => <span key={service}><i />{service}<strong>—</strong></span>)}</div></Card><div className="admin-overview-grid"><AdminPreviewTable title={t('subscriptionsAction')} onView={() => navigate({ surface: 'admin', page: 'subscriptions' })} /><AdminSupportPreview onView={() => navigate({ surface: 'admin', page: 'support' })} /></div><div className="admin-overview-lower"><Card><SectionHeader title={t('latestReleases')} action={<Button variant="text" onClick={() => navigate({ surface: 'admin', page: 'releases' })}>{t('viewAll')}</Button>} /><EmptyState icon={PackageOpen} title={t('noRelease')} body={t('integrationPending')} /></Card><Card><SectionHeader title={t('crashSummary')} action={<Button variant="text" onClick={() => navigate({ surface: 'admin', page: 'diagnostics' })}>{t('viewAll')}</Button>} /><EmptyState icon={ShieldAlert} title={t('tableEmpty')} body={t('previewData')} /></Card><Card><SectionHeader title={t('recentAdminActivity')} action={<Button variant="text" onClick={() => navigate({ surface: 'admin', page: 'audit' })}>{t('viewAll')}</Button>} /><Timeline items={mockAuditRows.map((row) => ({ title: row.action, body: row.target, time: row.date, tone: 'brand' }))} /></Card></div></>
}

function AdminPreviewTable({ title, onView }: { title: string; onView: () => void }) {
  const { t } = useExperience()
  const columns: Column<(typeof mockAdminUsers)[number]>[] = [{ key: 'email', header: t('account'), render: (row) => row.email }, { key: 'status', header: t('status'), render: (row) => <Badge tone={row.subscription === 'active' ? 'success' : 'warning'}>{row.subscription}</Badge> }, { key: 'access', header: t('details'), render: (row) => row.access }]
  return <Card padding="none"><div className="admin-panel-head"><strong>{title}</strong><Button variant="text" onClick={onView}>{t('viewAll')}</Button></div><DataTable columns={columns} rows={[...mockAdminUsers]} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('previewData')} /></Card>
}

function AdminSupportPreview({ onView }: { onView: () => void }) {
  const { t } = useExperience()
  const columns: Column<(typeof mockSupportThreads)[number]>[] = [{ key: 'subject', header: t('support'), render: (row) => row.subject }, { key: 'status', header: t('status'), render: (row) => <Badge tone="info">{row.status}</Badge> }, { key: 'updated', header: t('date'), render: (row) => row.updated }]
  return <Card padding="none"><div className="admin-panel-head"><strong>{t('supportQueue')}</strong><Button variant="text" onClick={onView}>{t('viewAll')}</Button></div><DataTable columns={columns} rows={[...mockSupportThreads]} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('previewData')} /></Card>
}

function UsersPage() {
  const { t } = useExperience()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<(typeof mockAdminUsers)[number] | null>(null)
  const filtered = mockAdminUsers.filter((row) => row.email.includes(search))
  const columns: Column<(typeof mockAdminUsers)[number]>[] = [
    { key: 'email', header: t('email'), render: (row) => <div className="identity-cell"><span>{row.email[0].toUpperCase()}</span><strong>{row.email}</strong></div> },
    { key: 'subscription', header: t('subscription'), render: (row) => <Badge tone={row.subscription === 'active' ? 'success' : row.subscription === 'expired' ? 'danger' : 'neutral'}>{row.subscription}</Badge> },
    { key: 'access', header: t('status'), render: (row) => row.access }, { key: 'updated', header: t('date'), render: (row) => row.updated },
    { key: 'actions', header: t('actions'), width: '54px', render: (row) => <ActionMenu label={t('actions')}><ActionMenuItem onClick={() => setSelected(row)}>{t('details')}</ActionMenuItem><ActionMenuItem>{t('grantSubscription')}</ActionMenuItem></ActionMenu> },
  ]
  return <><PageHeader title={t('users')} description={t('previewData')} /><TableToolbar searchLabel={t('search')} searchValue={search} onSearch={setSearch} filters={<FilterSelect label={t('status')} options={[t('active'), t('pending'), t('disabled')]} />} /><DataTable columns={columns} rows={[...filtered]} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('previewData')} onRowClick={setSelected} /><Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={t('userDetails')} description={selected?.email} closeLabel={t('close')} footer={<Button variant="primary">{t('grantSubscription')}</Button>}><div className="detail-sections"><Card><SectionHeader title={t('profile')} /><dl className="detail-list"><div><dt>{t('email')}</dt><dd>{selected?.email}</dd></div><div><dt>{t('subscription')}</dt><dd>{selected?.subscription}</dd></div><div><dt>{t('status')}</dt><dd>{selected?.access}</dd></div></dl></Card><Card><SectionHeader title={t('policies')} /><Switch label={t('enabled')} checked onChange={() => undefined} /><Switch label={t('disabled')} checked={false} onChange={() => undefined} /></Card></div></Drawer></>
}

function SubscriptionsPage() {
  const { t } = useExperience()
  const [search, setSearch] = useState('')
  const [grantOpen, setGrantOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const columns: Column<(typeof mockAdminUsers)[number]>[] = [{ key: 'email', header: t('email'), render: (row) => row.email }, { key: 'plan', header: t('plan'), render: () => t('planUnavailable') }, { key: 'status', header: t('status'), render: (row) => <Badge tone={row.subscription === 'active' ? 'success' : 'warning'}>{row.subscription}</Badge> }, { key: 'date', header: t('expiryDate'), render: () => '—' }, { key: 'actions', header: t('actions'), render: () => <ActionMenu label={t('actions')}><ActionMenuItem>{t('extend')}</ActionMenuItem><ActionMenuItem onClick={() => setConfirmOpen(true)}>{t('resetHwid')}</ActionMenuItem><ActionMenuItem danger>{t('disabled')}</ActionMenuItem></ActionMenu> }]
  return <><PageHeader title={t('subscriptions')} description={t('previewData')} actions={<Button variant="primary" onClick={() => setGrantOpen(true)}>{t('grantSubscription')}</Button>} /><TableToolbar searchLabel={t('search')} searchValue={search} onSearch={setSearch} filters={<FilterSelect label={t('status')} options={[t('active'), t('pending'), t('disabled')]} />} /><DataTable columns={columns} rows={[...mockAdminUsers]} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('previewData')} /><GrantSubscriptionDrawer open={grantOpen} onClose={() => setGrantOpen(false)} /><ConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t('resetHwid')} body={t('previewData')} confirmLabel={t('continue')} cancelLabel={t('cancel')} onConfirm={() => undefined} /></>
}

function GrantSubscriptionDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useExperience()
  const [mode, setMode] = useState('replace')
  return <Drawer open={open} onClose={onClose} title={t('grantTitle')} description={t('grantBody')} closeLabel={t('close')} footer={<><Button onClick={onClose}>{t('cancel')}</Button><Button variant="primary" onClick={onClose}>{t('confirmGrant')}</Button></>}><div className="stack"><FormField label={t('email')} htmlFor="grant-user" required><Input id="grant-user" placeholder="user@example.com" /></FormField><FormField label={t('plan')} htmlFor="grant-plan" required><Select id="grant-plan"><option>{t('planUnavailable')}</option></Select></FormField><SegmentedControl ariaLabel={t('grantMode')} value={mode} onChange={setMode} items={[{ value: 'replace', label: t('replace') }, { value: 'extend', label: t('extend') }]} /><div className="form-grid"><FormField label={t('startDate')} htmlFor="grant-start"><Input id="grant-start" type="date" /></FormField><FormField label={t('expiryDate')} htmlFor="grant-expiry"><Input id="grant-expiry" type="date" /></FormField></div><FormField label={t('internalSource')} htmlFor="grant-source"><Select id="grant-source"><option value="manual">manual</option><option value="trial">trial</option><option value="paid">paid</option><option value="promotional">promotional</option><option value="complimentary">complimentary</option></Select></FormField><FormField label={t('reason')} htmlFor="grant-reason"><Input id="grant-reason" /></FormField><FormField label={t('adminNote')} htmlFor="grant-note"><Textarea id="grant-note" /></FormField></div></Drawer>
}

function CommercePage() {
  const { t } = useExperience()
  const [tab, setTab] = useState('payments')
  return <><PageHeader title={t('payments')} description={t('previewData')} /><Tabs ariaLabel={t('payments')} active={tab} onChange={setTab} items={[{ id: 'payments', label: t('payments') }, { id: 'plans', label: t('plans') }, { id: 'invoices', label: t('invoices') }]} /><div className="admin-tab-panel">{tab === 'payments' ? <EmptyState icon={CircleDollarSign} title={t('tableEmpty')} body={t('integrationPending')} /> : tab === 'plans' ? <Alert title={t('decisionRequired')} tone="warning">{t('pricingBody')}</Alert> : <EmptyState icon={FileText} title={t('noInvoices')} body={t('backendRequired')} />}</div></>
}

function ReleasesAdminPage() {
  const { t } = useExperience()
  const [createOpen, setCreateOpen] = useState(false)
  const [tab, setTab] = useState('releases')
  const columns: Column<{ id: string; version: string; channel: string; status: string }>[] = [{ key: 'version', header: t('version'), render: (row) => row.version }, { key: 'channel', header: t('channel'), render: (row) => <Badge>{row.channel}</Badge> }, { key: 'status', header: t('status'), render: (row) => <Badge tone="warning">{row.status}</Badge> }, { key: 'actions', header: t('actions'), render: () => <ActionMenu label={t('actions')}><ActionMenuItem>{t('publishRelease')}</ActionMenuItem><ActionMenuItem>{t('rollback')}</ActionMenuItem><ActionMenuItem danger>{t('unpublish')}</ActionMenuItem></ActionMenu> }]
  return <><PageHeader title={t('releases')} description={t('previewData')} actions={<Button variant="primary" onClick={() => setCreateOpen(true)}>{t('createRelease')}</Button>} /><Tabs ariaLabel={t('releases')} active={tab} onChange={setTab} items={[{ id: 'releases', label: t('releases') }, { id: 'history', label: t('releaseHistory') }, { id: 'policy', label: t('mandatory') }, { id: 'extension', label: t('extensionReleases') }]} /><div className="admin-tab-panel">{tab === 'releases' ? <DataTable columns={columns} rows={[{ id: 'preview', version: t('unavailable'), channel: t('stable'), status: t('integrationPending') }]} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('previewData')} /> : tab === 'policy' ? <Card><div className="settings-form"><Switch label={t('mandatory')} checked={false} onChange={() => undefined} /><FormField label={t('minimumVersion')} htmlFor="min-version"><Input id="min-version" placeholder="—" /></FormField><FormField label={t('disabledVersions')} htmlFor="disabled-version"><Input id="disabled-version" /></FormField></div></Card> : <EmptyState icon={FileClock} title={t('tableEmpty')} body={t('integrationPending')} />}</div><ReleaseModal open={createOpen} onClose={() => setCreateOpen(false)} /></>
}

function ReleaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useExperience()
  return <Modal open={open} onClose={onClose} title={t('createRelease')} description={t('previewData')} closeLabel={t('close')} size="lg" footer={<><Button onClick={onClose}>{t('cancel')}</Button><Button variant="primary" onClick={onClose}>{t('publishRelease')}</Button></>}><div className="stack"><div className="form-grid"><FormField label={t('version')} htmlFor="release-version"><Input id="release-version" /></FormField><FormField label={t('channel')} htmlFor="release-channel"><Select id="release-channel"><option>{t('stable')}</option><option>{t('beta')}</option></Select></FormField></div><FormField label={t('uploadArtifact')} htmlFor="release-file"><Input id="release-file" type="file" /></FormField><FormField label={t('releaseNotes')} htmlFor="release-notes"><Textarea id="release-notes" /></FormField><div className="form-grid"><FormField label={t('minimumVersion')} htmlFor="release-min"><Input id="release-min" /></FormField><FormField label={t('targetAudience')} htmlFor="release-audience"><Select id="release-audience"><option>{t('unavailable')}</option></Select></FormField></div><Checkbox label={t('mandatory')} /></div></Modal>
}

function PromoPage() {
  const { t } = useExperience()
  const [open, setOpen] = useState(false)
  return <><PageHeader title={t('promoCodes')} description={t('previewData')} actions={<Button variant="primary" onClick={() => setOpen(true)}>{t('getStarted')}</Button>} /><EmptyState icon={Gift} title={t('tableEmpty')} body={t('previewData')} /><Modal open={open} onClose={() => setOpen(false)} title={t('promoCodes')} closeLabel={t('close')} footer={<Button variant="primary" onClick={() => setOpen(false)}>{t('save')}</Button>}><div className="stack"><FormField label={t('promoCode')} htmlFor="promo-code"><Input id="promo-code" /></FormField><FormField label={t('details')} htmlFor="promo-details"><Input id="promo-details" /></FormField></div></Modal></>
}

function SupportAdminPage() {
  const { t } = useExperience()
  const [thread, setThread] = useState<(typeof mockSupportThreads)[number] | null>(null)
  const columns: Column<(typeof mockSupportThreads)[number]>[] = [{ key: 'id', header: t('details'), render: (row) => row.id }, { key: 'subject', header: t('support'), render: (row) => row.subject }, { key: 'requester', header: t('email'), render: (row) => row.requester }, { key: 'status', header: t('status'), render: (row) => <Badge tone="info">{row.status}</Badge> }, { key: 'updated', header: t('date'), render: (row) => row.updated }]
  return <><PageHeader title={t('supportInbox')} description={t('previewData')} /><DataTable columns={columns} rows={[...mockSupportThreads]} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('previewData')} onRowClick={setThread} /><Drawer open={Boolean(thread)} onClose={() => setThread(null)} title={t('ticketThread')} description={thread?.subject} closeLabel={t('close')} footer={<><Button variant="danger">{t('blockSender')}</Button><Button variant="primary">{t('reply')}</Button></>}><div className="support-thread"><article><strong>{thread?.requester}</strong><p>{t('accountOverviewBody')}</p></article><FormField label={t('reply')} htmlFor="admin-reply"><Textarea id="admin-reply" /></FormField></div></Drawer></>
}

function CommunicationsPage() {
  const { t } = useExperience()
  const [open, setOpen] = useState(false)
  return <><PageHeader title={t('announcements')} description={t('previewData')} actions={<Button variant="primary" onClick={() => setOpen(true)}>{t('composeAnnouncement')}</Button>} /><Alert title={t('uiComplete')} tone="info">{t('integrationPending')}</Alert><div className="admin-tab-panel"><EmptyState icon={Megaphone} title={t('tableEmpty')} body={t('previewData')} /></div><Modal open={open} onClose={() => setOpen(false)} title={t('composeAnnouncement')} closeLabel={t('close')} footer={<Button variant="primary" onClick={() => setOpen(false)}>{t('save')}</Button>}><div className="stack"><FormField label={t('type')} htmlFor="announcement-type"><Select id="announcement-type"><option>system</option><option>update</option><option>security</option></Select></FormField><FormField label={t('details')} htmlFor="announcement-title"><Input id="announcement-title" /></FormField><FormField label={t('messageFromAdmin')} htmlFor="announcement-body"><Textarea id="announcement-body" /></FormField></div></Modal></>
}

function DiagnosticsPage() {
  const { t } = useExperience()
  const [tab, setTab] = useState('crashes')
  return <><PageHeader title={t('diagnostics')} description={t('previewData')} /><Tabs ariaLabel={t('diagnostics')} active={tab} onChange={setTab} items={[{ id: 'crashes', label: t('crashReports') }, { id: 'groups', label: t('crashSummary') }, { id: 'tamper', label: t('tamperAlerts') }]} /><div className="admin-tab-panel">{tab === 'tamper' ? <EmptyState icon={ShieldAlert} title={t('tamperAlerts')} body={t('backendRequired')} action={<Badge tone="warning">{featureFlags.tamperDetails.state}</Badge>} /> : <EmptyState icon={Bug} title={t('tableEmpty')} body={t('previewData')} />}</div></>
}

function PoliciesPage() {
  const { t } = useExperience()
  const [kill, setKill] = useState(false)
  const [tab, setTab] = useState('global')
  return <><PageHeader title={t('policies')} description={t('previewData')} /><Tabs ariaLabel={t('policies')} active={tab} onChange={setTab} items={[{ id: 'global', label: t('policies') }, { id: 'versions', label: t('disabledVersions') }, { id: 'plans', label: t('planFeatures') }, { id: 'invites', label: t('inviteCodes') }]} /><div className="admin-tab-panel">{tab === 'global' ? <div className="settings-sections"><Card><Switch label={t('killSwitch')} description={t('system503')} checked={kill} onChange={setKill} /><FormField label={t('minimumVersion')} htmlFor="policy-min"><Input id="policy-min" /></FormField><Button variant="primary">{t('save')}</Button></Card></div> : tab === 'invites' ? <EmptyState icon={KeyRound} title={t('inviteCodes')} body={t('decisionRequired')} action={<Badge tone="warning">{featureFlags.inviteAdmin.state}</Badge>} /> : <Card><div className="settings-form"><FormField label={tab === 'versions' ? t('disabledVersions') : t('planFeatures')} htmlFor="policy-value"><Textarea id="policy-value" /></FormField><Button variant="primary">{t('save')}</Button></div></Card>}</div></>
}

function AuditPage() {
  const { t } = useExperience()
  const columns: Column<(typeof mockAuditRows)[number]>[] = [{ key: 'date', header: t('date'), render: (row) => row.date }, { key: 'admin', header: t('adminConsole'), render: (row) => row.admin }, { key: 'action', header: t('actions'), render: (row) => <span className="mono">{row.action}</span> }, { key: 'target', header: t('details'), render: (row) => row.target }]
  return <><PageHeader title={t('auditLog')} description={t('previewData')} /><DataTable columns={columns} rows={[...mockAuditRows]} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('previewData')} /></>
}

function ContentPage() {
  const { t } = useExperience()
  const items = [{ icon: BookOpenText, label: t('faq') }, { icon: FileClock, label: t('changelog') }, { icon: FileText, label: t('footerLegal') }, { icon: Megaphone, label: t('websiteContent') }]
  return <><PageHeader title={t('content')} description={t('previewData')} /><div className="content-list">{items.map(({ icon: Icon, label }) => <Card key={label} padding="sm"><Icon size={18} /><strong>{label}</strong><Badge tone="warning">{t('integrationPending')}</Badge><Button variant="text">{t('details')}</Button></Card>)}</div></>
}

function AdminSettingsPage() {
  const { t } = useExperience()
  return <><PageHeader title={t('settings')} description={t('previewData')} /><div className="settings-sections"><Card><SectionHeader title={t('adminUsers')} /><EmptyState icon={UserCog} title={t('tableEmpty')} body={t('backendRequired')} /></Card><Card><SectionHeader title={t('serviceHealth')} /><EmptyState icon={Activity} title={t('tableEmpty')} body={t('integrationPending')} /></Card></div></>
}

function CoveragePage({ navigate }: { navigate: Navigate }) {
  const { t } = useExperience()
  const [search, setSearch] = useState('')
  const rows = coverageRegistry.filter((entry) => entry.feature.toLowerCase().includes(search.toLowerCase()))
  const tone = (state: CoverageEntry['state']) => state === 'implemented' ? 'success' : state === 'ui-complete' ? 'info' : state === 'backend-required' || state === 'decision-required' ? 'warning' : 'neutral'
  const columns: Column<CoverageEntry>[] = [{ key: 'feature', header: t('features'), render: (row) => row.feature }, { key: 'state', header: t('status'), render: (row) => <Badge tone={tone(row.state)}>{row.state}</Badge> }, { key: 'surface', header: t('type'), render: (row) => row.surface }, { key: 'page', header: t('details'), render: (row) => <Button variant="text" onClick={() => navigate({ surface: row.surface, page: row.page })}>{row.page}</Button> }]
  return <><PageHeader title={t('featureCoverage')} description={`${t('coverageBody')} · ${coverageRegistry.length}/82`} /><div className="coverage-summary">{Object.entries(coverageSummary).map(([state, count]) => <StatCard key={state} label={state} value={count} />)}</div><TableToolbar searchLabel={t('search')} searchValue={search} onSearch={setSearch} /><DataTable columns={columns} rows={rows} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('coverageBody')} /></>
}
