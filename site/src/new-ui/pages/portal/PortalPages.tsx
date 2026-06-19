import { useMemo, useState } from 'react'
import { Bell, CreditCard, Download, KeyRound, LayoutDashboard, LifeBuoy, Monitor, ReceiptText, Settings, ShieldCheck, WalletCards } from 'lucide-react'
import { featureFlags } from '../../adapters/featureRegistry'
import { useExperience } from '../../app/ExperienceProvider'
import { Button } from '../../components/ui/Button'
import { Card, DataTable, PageHeader, SectionHeader, type Column } from '../../components/ui/DataDisplay'
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback'
import { FormField, Input, PasswordInput, Switch } from '../../components/ui/FormControls'
import { Tabs } from '../../components/ui/Navigation'
import { ConfirmDialog, Drawer, Modal } from '../../components/ui/Overlays'
import { DownloadCard, SubscriptionCard, SupportTicketCard } from '../../components/ui/ProductCards'
import { mockNotifications } from '../../data/mockData'
import { WorkspaceShell, type NavigationGroup } from '../../layouts/WorkspaceShell'
import type { Navigate } from '../../layouts/SharedChrome'

const supportRows = [
  { id: 'PREVIEW-1', subject: 'Subscription status review', status: 'Open', updated: '2026-06-18' },
]

export function PortalPages({ page, navigate }: { page: string; navigate: Navigate }) {
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
  const title = groups[0].items.find((item) => item.id === page)?.label ?? t('overview')
  return <WorkspaceShell surface="portal" page={page} title={title} groups={groups} navigate={navigate}>{page === 'subscription' ? <SubscriptionPage /> : page === 'payments' ? <PaymentsPage /> : page === 'downloads' ? <PortalDownloads navigate={navigate} /> : page === 'devices' ? <DevicesPage /> : page === 'notifications' ? <NotificationsPage /> : page === 'support' ? <SupportPage /> : page === 'security' ? <SecurityPage /> : page === 'settings' ? <SettingsPage /> : <PortalOverview navigate={navigate} />}</WorkspaceShell>
}

function PortalOverview({ navigate }: { navigate: Navigate }) {
  const { t } = useExperience()
  return <><PageHeader title={t('overview')} description={t('accountOverviewBody')} /><div className="portal-overview-grid"><div className="stack"><SubscriptionCard title={t('currentPlan')} status={t('active')} details={[{ label: t('plan'), value: t('planUnavailable') }, { label: t('expiresOn'), value: '—' }, { label: t('licensedFor'), value: 'user@example.com' }, { label: t('status'), value: t('active') }]} action={<Button variant="text" onClick={() => navigate({ surface: 'portal', page: 'subscription' })}>{t('details')}</Button>} /><Card><SectionHeader title={t('latestRelease')} action={<Button variant="text" onClick={() => navigate({ surface: 'portal', page: 'downloads' })}>{t('viewAll')}</Button>} /><DownloadCard title={t('downloadForWindows')} version={t('unavailable')} meta={[t('integrationPending')]} buttonLabel={t('downloads')} disabled /></Card><Card><SectionHeader title={t('currentDevice')} action={<Button variant="text" onClick={() => navigate({ surface: 'portal', page: 'devices' })}>{t('viewAll')}</Button>} /><div className="device-row"><span><Monitor size={20} /></span><div><strong>WINDOWS-DEVICE</strong><small>Windows · 64-bit</small></div><Badge tone="success">{t('thisDevice')}</Badge><Button size="sm">{t('signIn')}</Button></div></Card><div className="portal-mini-grid"><Card><SectionHeader title={t('recentSupport')} /><SupportTicketCard subject="Subscription status review" status={t('pending')} updated="—" /></Card><Card><SectionHeader title={t('security')} /><div className="settings-list"><div><span><ShieldCheck size={18} /></span><div><strong>{t('verifyEmail')}</strong><small>{t('verified')}</small></div><Badge tone="success">{t('success')}</Badge></div><div><span><KeyRound size={18} /></span><div><strong>{t('password')}</strong><small>{t('passwordUpdated')}</small></div><Button size="sm">{t('save')}</Button></div></div></Card></div></div><aside className="portal-notices"><SectionHeader title={t('notifications')} action={<Button variant="text" onClick={() => navigate({ surface: 'portal', page: 'notifications' })}>{t('viewAll')}</Button>} />{mockNotifications.map((notice) => <article key={notice.id} className={notice.read ? 'is-read' : ''}><span><Bell size={17} /></span><div><strong>{t(notice.titleKey)}</strong><p>{t(notice.bodyKey)}</p></div></article>)}</aside></div></>
}

function SubscriptionPage() {
  const { t } = useExperience()
  const [requestOpen, setRequestOpen] = useState(false)
  return <><PageHeader title={t('subscription')} description={t('accountOverviewBody')} actions={<Button variant="primary" onClick={() => setRequestOpen(true)}>{t('requestActivation')}</Button>} /><div className="portal-two-column"><SubscriptionCard title={t('subscriptionStatus')} status={t('active')} details={[{ label: t('plan'), value: t('planUnavailable') }, { label: t('startDate'), value: '—' }, { label: t('expiryDate'), value: '—' }, { label: t('status'), value: t('active') }]} /><Card><SectionHeader title={t('includedFeatures')} /><ul className="check-list"><li>{t('workflowAccounts')}</li><li>{t('workflowSessions')}</li><li>{t('workflowBackup')}</li><li>{t('managedUpdates')}</li></ul></Card></div><Alert title={t('integrationPending')} tone="info">{t('pricingBody')}</Alert><Modal open={requestOpen} onClose={() => setRequestOpen(false)} title={t('requestActivation')} description={t('pricingBody')} closeLabel={t('close')} footer={<><Button onClick={() => setRequestOpen(false)}>{t('cancel')}</Button><Button variant="primary" onClick={() => setRequestOpen(false)}>{t('continue')}</Button></>}><FormField label={t('details')} htmlFor="activation-details"><Input id="activation-details" /></FormField></Modal></>
}

function PaymentsPage() {
  const { t } = useExperience()
  const [tab, setTab] = useState('payments')
  const paymentColumns: Column<{ id: string; status: string; date: string }>[] = [{ key: 'id', header: t('details'), render: (row) => row.id }, { key: 'date', header: t('date'), render: (row) => row.date }, { key: 'status', header: t('status'), render: (row) => <Badge tone="warning">{row.status}</Badge> }]
  return <><PageHeader title={t('payments')} description={t('accountOverviewBody')} /><Tabs ariaLabel={t('billing')} active={tab} onChange={setTab} items={[{ id: 'payments', label: t('payments'), icon: <CreditCard size={15} /> }, { id: 'invoices', label: t('invoices'), icon: <ReceiptText size={15} /> }]} /><div className="portal-tab-panel">{tab === 'payments' ? <DataTable columns={paymentColumns} rows={[]} rowKey={(row) => row.id} emptyTitle={t('tableEmpty')} emptyBody={t('integrationPending')} /> : <EmptyState icon={ReceiptText} title={t('noInvoices')} body={t('backendRequired')} action={<Badge tone="warning">{featureFlags.invoices.state}</Badge>} />}</div></>
}

function PortalDownloads({ navigate }: { navigate: Navigate }) {
  const { t } = useExperience()
  return <><PageHeader title={t('downloads')} description={t('downloadBody')} /><DownloadCard title={t('downloadForWindows')} version={t('unavailable')} meta={[t('fileSize'), t('architecture'), t('requirements')]} buttonLabel={t('downloads')} disabled /><div className="portal-tab-panel"><Alert title={t('integrationPending')} tone="info" action={<Button size="sm" onClick={() => navigate({ surface: 'public', page: 'releases' })}>{t('releaseNotes')}</Button>}>{t('releaseUnavailable')}</Alert></div></>
}

function DevicesPage() {
  const { t } = useExperience()
  const [confirm, setConfirm] = useState(false)
  return <><PageHeader title={t('devices')} description={t('noSessions')} /><Card><div className="device-row device-row--large"><span><Monitor size={22} /></span><div><strong>WINDOWS-DEVICE</strong><small>Windows · 64-bit · {t('thisDevice')}</small></div><Badge tone="success">{t('active')}</Badge><Button size="sm" onClick={() => setConfirm(true)}>{t('signIn')}</Button></div></Card><div className="portal-tab-panel"><Alert title={t('backendRequired')} tone="warning">{t('noSessions')}</Alert><Button disabled>{t('signOutAllDevices')}</Button></div><ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={t('signIn')} body={t('noSessions')} confirmLabel={t('continue')} cancelLabel={t('cancel')} onConfirm={() => undefined} /></>
}

function NotificationsPage() {
  const { t } = useExperience()
  return <><PageHeader title={t('notifications')} description={t('accountOverviewBody')} /><div className="notification-list">{mockNotifications.map((notice) => <Card key={notice.id} padding="sm" className={notice.read ? 'is-read' : ''}><div className="notification-row"><span><Bell size={18} /></span><div><strong>{t(notice.titleKey)}</strong><p>{t(notice.bodyKey)}</p></div><Badge tone={notice.read ? 'neutral' : 'info'}>{notice.read ? t('current') : t('required')}</Badge></div></Card>)}</div><Card className="portal-tab-panel"><Switch label={t('notifications')} description={t('noNotifications')} checked={false} onChange={() => undefined} disabled /></Card></>
}

function SupportPage() {
  const { t } = useExperience()
  const [drawer, setDrawer] = useState(false)
  return <><PageHeader title={t('support')} description={t('integrationPending')} actions={<Button variant="primary" onClick={() => setDrawer(true)}>{t('createTicket')}</Button>} /><Alert title={t('integrationPending')} tone="warning">{t('backendRequired')}</Alert><div className="portal-tab-panel">{supportRows.map((row) => <SupportTicketCard key={row.id} subject={row.subject} status={row.status} updated={row.updated} onOpen={() => setDrawer(true)} />)}</div><Drawer open={drawer} onClose={() => setDrawer(false)} title={t('ticketThread')} description={t('demoOnly')} closeLabel={t('close')} footer={<Button variant="primary" disabled>{t('reply')}</Button>}><div className="support-thread"><article><strong>user@example.com</strong><p>{t('accountOverviewBody')}</p></article><article className="is-admin"><strong>{t('messageFromAdmin')}</strong><p>{t('integrationPending')}</p></article><FormField label={t('reply')} htmlFor="portal-reply"><Input id="portal-reply" disabled /></FormField></div></Drawer></>
}

function SecurityPage() {
  const { t } = useExperience()
  const [saved, setSaved] = useState(false)
  return <><PageHeader title={t('security')} description={t('protectAccount')} /><div className="settings-sections"><Card><SectionHeader title={t('password')} /><form className="settings-form" onSubmit={(event) => { event.preventDefault(); setSaved(true) }}><FormField label={t('password')} htmlFor="current-password"><PasswordInput id="current-password" /></FormField><FormField label={t('newPassword')} htmlFor="new-security-password"><PasswordInput id="new-security-password" /></FormField><Button variant="primary">{t('save')}</Button>{saved ? <Alert title={t('passwordUpdated')} tone="success" /> : null}</form></Card><Card><SectionHeader title={t('currentDevice')} /><div className="settings-list"><div><span><Monitor size={18} /></span><div><strong>WINDOWS-DEVICE</strong><small>{t('thisDevice')}</small></div><Badge tone="success">{t('active')}</Badge></div></div></Card></div></>
}

function SettingsPage() {
  const { t } = useExperience()
  const [deleteOpen, setDeleteOpen] = useState(false)
  return <><PageHeader title={t('settings')} description={t('accountOverviewBody')} /><div className="settings-sections"><Card><SectionHeader title={t('profile')} /><div className="settings-form"><FormField label={t('name')} htmlFor="profile-name"><Input id="profile-name" defaultValue="Saturn User" /></FormField><FormField label={t('email')} htmlFor="profile-email"><Input id="profile-email" value="user@example.com" readOnly /></FormField><Button variant="primary">{t('save')}</Button></div></Card><Card><SectionHeader title={t('notifications')} /><Switch label={t('notifications')} description={t('noNotifications')} checked={false} onChange={() => undefined} disabled /></Card><Card><SectionHeader title={t('privacy')} /><div className="settings-actions"><Button disabled>{t('noExport')}</Button><Button variant="danger" onClick={() => setDeleteOpen(true)}>{t('deleteAccount')}</Button></div></Card></div><ConfirmDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('deleteAccount')} body={t('noExport')} confirmLabel={t('continue')} cancelLabel={t('cancel')} onConfirm={() => undefined} destructive /></>
}
