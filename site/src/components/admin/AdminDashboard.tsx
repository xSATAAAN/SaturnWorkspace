import { useEffect, useMemo, useState } from 'react'
import {
  fetchAccessRequests,
  createPromoCode,
  createSubscription,
  disableRelease,
  fetchAdminDashboard,
  fetchAuditLog,
  fetchCrashGroups,
  fetchCrashLogs,
  fetchOtaUpdates,
  fetchPromoCodes,
  fetchRemoteControls,
  fetchSubscriptions,
  fetchUserDetail,
  patchSubscriptionStatus,
  publishRelease,
  resetSubscriptionHwid,
  rollbackRelease,
  updateRemoteControls,
  uploadReleaseBinary,
  type AdminAccessRequest,
  type AdminAuditLogItem,
  type AdminCrashGroup,
  type AdminCrashLog,
  type AdminOtaUpdate,
  type AdminPromoCode,
  type AdminRemoteControls,
  type AdminSubscription,
  type AdminUserDetail,
} from '../../api/admin'

type AdminDashboardProps = {
  lang: 'en' | 'ar'
}

type AdminPage = 'overview' | 'users' | 'subscriptions' | 'promos' | 'ota' | 'controls' | 'crashes' | 'audit'

const pageSize = 12
const DEFAULT_DURATION_DAYS = 30

function toDateTimeLocalValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function addDaysToNow(days: number) {
  return toDateTimeLocalValue(new Date(Date.now() + days * 86_400_000))
}

function isUnlimitedSubscription(expiresAt?: string | null, metadata?: Record<string, unknown> | null) {
  if (metadata && metadata.is_unlimited === true) return true
  if (!expiresAt) return false
  const date = new Date(expiresAt)
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 9999
}

function daysRemaining(expiresAt?: string | null, metadata?: Record<string, unknown> | null, isAr?: boolean) {
  if (isUnlimitedSubscription(expiresAt, metadata)) return '∞'
  if (!expiresAt) return '--'
  const diff = Date.parse(expiresAt) - Date.now()
  if (!Number.isFinite(diff)) return '--'
  if (diff <= 0) return isAr ? 'منتهي' : 'Expired'
  const count = Math.ceil(diff / 86_400_000)
  return isAr ? `${count} يوم` : `${count} days`
}

function formatEgyptDateTime(value?: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date)
}

function adminStatusLabel(value: string | undefined | null, isAr: boolean) {
  const normalized = String(value || '').trim().toLowerCase()
  const map = isAr
    ? {
        active: 'نشط',
        canceled: 'ملغى',
        suspended: 'معلق',
        expired: 'منتهي',
        pending: 'قيد الانتظار',
        authorized: 'تم الربط',
        consumed: 'تم الاستهلاك',
        subscription_required: 'يتطلب اشتراكًا',
        subscription_missing: 'اشتراك مفقود',
        subscription_inactive: 'اشتراك غير نشط',
      }
    : {
        active: 'Active',
        canceled: 'Canceled',
        suspended: 'Suspended',
        expired: 'Expired',
        pending: 'Pending',
        authorized: 'Authorized',
        consumed: 'Consumed',
        subscription_required: 'Subscription required',
        subscription_missing: 'Subscription missing',
        subscription_inactive: 'Subscription inactive',
      }
  return map[normalized as keyof typeof map] || value || '--'
}

function adminPlanLabel(value: string | undefined | null, isAr: boolean) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'monthly') return isAr ? 'شهري' : 'Monthly'
  if (normalized === 'yearly') return isAr ? 'سنوي' : 'Yearly'
  return value || '--'
}

function adminTierLabel(value: string | undefined | null, isAr: boolean) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'public') return isAr ? 'عام' : 'Public'
  if (normalized === 'private') return isAr ? 'خاص' : 'Private'
  return value || '--'
}

function adminChannelLabel(value: string | undefined | null, isAr: boolean) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'beta') return isAr ? 'بيتا' : 'Beta'
  if (normalized === 'stable') return isAr ? 'مستقر' : 'Stable'
  return value || '--'
}

function visiblePage<T>(items: T[], page: number) {
  return items.slice((page - 1) * pageSize, page * pageSize)
}

function Pager({ page, total, onPage, isAr }: { page: number; total: number; onPage: (next: number) => void; isAr: boolean }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-white/60">
      <span>
        {isAr ? `الصفحة ${page} من ${pages}` : `Page ${page} of ${pages}`}
      </span>
      <div className="flex gap-2">
        <button
          className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPage(Math.max(1, page - 1))}
        >
          {isAr ? 'السابق' : 'Previous'}
        </button>
        <button
          className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => onPage(Math.min(pages, page + 1))}
        >
          {isAr ? 'التالي' : 'Next'}
        </button>
      </div>
    </div>
  )
}

export function AdminDashboard({ lang }: AdminDashboardProps) {
  const isAr = lang === 'ar'
  const [activePage, setActivePage] = useState<AdminPage>('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [kpis, setKpis] = useState<Record<string, number | null>>({})
  const [recentActivity, setRecentActivity] = useState<unknown[]>([])
  const [accessRequests, setAccessRequests] = useState<AdminAccessRequest[]>([])
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([])
  const [promoCodes, setPromoCodes] = useState<AdminPromoCode[]>([])
  const [otaUpdates, setOtaUpdates] = useState<AdminOtaUpdate[]>([])
  const [crashes, setCrashes] = useState<AdminCrashLog[]>([])
  const [crashGroups, setCrashGroups] = useState<AdminCrashGroup[]>([])
  const [auditLog, setAuditLog] = useState<AdminAuditLogItem[]>([])
  const [remoteControls, setRemoteControls] = useState<AdminRemoteControls>({})
  const [remoteChannel, setRemoteChannel] = useState('beta')

  const [subscriptionSearch, setSubscriptionSearch] = useState('')
  const [crashSearch, setCrashSearch] = useState('')
  const [accessRequestPage, setAccessRequestPage] = useState(1)
  const [subscriptionPage, setSubscriptionPage] = useState(1)
  const [crashPage, setCrashPage] = useState(1)
  const [expandedCrashId, setExpandedCrashId] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null)
  const [selectedUserLoading, setSelectedUserLoading] = useState(false)

  const [newSubscriptionEmail, setNewSubscriptionEmail] = useState('')
  const [newSubscriptionUserId, setNewSubscriptionUserId] = useState('')
  const [newSubscriptionHwid, setNewSubscriptionHwid] = useState('')
  const [newSubscriptionPlan, setNewSubscriptionPlan] = useState<'monthly' | 'yearly'>('monthly')
  const [newSubscriptionTier, setNewSubscriptionTier] = useState<'public' | 'private'>('public')
  const [newSubscriptionDuration, setNewSubscriptionDuration] = useState<'1' | '7' | '30' | '90' | '365' | 'custom' | 'unlimited'>('30')
  const [newSubscriptionExpiry, setNewSubscriptionExpiry] = useState(addDaysToNow(DEFAULT_DURATION_DAYS))
  const [newPromoCode, setNewPromoCode] = useState('')
  const [newPromoType, setNewPromoType] = useState<'percent' | 'fixed'>('percent')
  const [newPromoValue, setNewPromoValue] = useState('10')
  const [newPromoPrivate, setNewPromoPrivate] = useState(false)
  const [newPromoMaxUses, setNewPromoMaxUses] = useState('')

  const [otaVersion, setOtaVersion] = useState('1.0.0-beta')
  const [otaChannel, setOtaChannel] = useState('beta')
  const [otaNotes, setOtaNotes] = useState('')
  const [otaMandatory, setOtaMandatory] = useState(false)
  const [otaMode, setOtaMode] = useState<'optional' | 'force' | 'required' | 'silent'>('optional')
  const [otaRollout, setOtaRollout] = useState('100')
  const [otaMinimumVersion, setOtaMinimumVersion] = useState('')
  const [otaForceDeadline, setOtaForceDeadline] = useState('')
  const [otaFile, setOtaFile] = useState<File | null>(null)
  const [rollbackVersion, setRollbackVersion] = useState('')
  const [disableReason, setDisableReason] = useState('')

  const [killSwitchEnabled, setKillSwitchEnabled] = useState(false)
  const [killSwitchMessage, setKillSwitchMessage] = useState('')
  const [featureFlagsText, setFeatureFlagsText] = useState('{}')
  const [announcementsText, setAnnouncementsText] = useState('[]')
  const [saving, setSaving] = useState(false)

  const t = useMemo(
    () => ({
      title: isAr ? 'إدارة Saturn Workspace' : 'Saturn Workspace Admin',
      subtitle: isAr
        ? 'إدارة الاشتراكات، التحديثات الهوائية، الأخطاء، والتحكمات البعيدة.'
        : 'Manage subscriptions, OTA releases, crash telemetry, and remote controls.',
    }),
    [isAr],
  )

  const loadAll = async () => {
    setLoading(true)
    setError(null)
    try {
      const [dashboard, access, subs, promos, ota, crash, groups, audit, controls] = await Promise.all([
        fetchAdminDashboard(),
        fetchAccessRequests({ limit: 200 }),
        fetchSubscriptions({ limit: 200 }),
        fetchPromoCodes(),
        fetchOtaUpdates(),
        fetchCrashLogs({ limit: 200 }),
        fetchCrashGroups(),
        fetchAuditLog(),
        fetchRemoteControls(remoteChannel),
      ])
      setKpis(dashboard.kpis || {})
      setRecentActivity(dashboard.recent_activity || [])
      setAccessRequests(access.items || [])
      setSubscriptions(subs.items || [])
      setPromoCodes(promos.items || [])
      setOtaUpdates(ota.items || [])
      setCrashes(crash.items || [])
      setCrashGroups(groups.items || [])
      setAuditLog(audit.items || [])
      applyRemoteControlState(controls.controls || {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed_to_load_admin_data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteChannel])

  useEffect(() => {
    if (newSubscriptionDuration === 'custom' || newSubscriptionDuration === 'unlimited') return
    setNewSubscriptionExpiry(addDaysToNow(Number(newSubscriptionDuration)))
  }, [newSubscriptionDuration])

  const applyRemoteControlState = (controls: AdminRemoteControls) => {
    setRemoteControls(controls)
    setOtaRollout(String(controls.rollout_percent ?? 100))
    setOtaMinimumVersion(controls.minimum_supported_version || '')
    setOtaForceDeadline(controls.force_update_deadline ? controls.force_update_deadline.slice(0, 16) : '')
    setKillSwitchEnabled(Boolean(controls.remote_config?.kill_switch_enabled))
    setKillSwitchMessage(controls.remote_config?.kill_switch_message || '')
    setFeatureFlagsText(JSON.stringify(controls.remote_config?.feature_flags || {}, null, 2))
    setAnnouncementsText(JSON.stringify(controls.remote_config?.announcements || [], null, 2))
  }

  const filteredSubscriptions = useMemo(() => {
    const term = subscriptionSearch.trim().toLowerCase()
    if (!term) return subscriptions
    return subscriptions.filter((item) =>
      [item.user_email, item.firebase_user_id, item.hwid, item.status, item.tier, item.plan]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    )
  }, [subscriptions, subscriptionSearch])

  const filteredAccessRequests = useMemo(() => {
    const term = subscriptionSearch.trim().toLowerCase()
    if (!term) return accessRequests
    return accessRequests.filter((item) =>
      [item.user_email, item.user_id, item.hwid, item.status, item.subscription_status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    )
  }, [accessRequests, subscriptionSearch])

  const filteredCrashes = useMemo(() => {
    const term = crashSearch.trim().toLowerCase()
    if (!term) return crashes
    return crashes.filter((item) =>
      [item.error_type, item.message, item.hwid, item.device_name, item.windows_version, item.app_version]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    )
  }, [crashes, crashSearch])

  const handleCreateSubscription = async () => {
    const isUnlimited = newSubscriptionDuration === 'unlimited'
    if (!newSubscriptionEmail.trim() || (!isUnlimited && !newSubscriptionExpiry)) return
    setSaving(true)
    try {
      const res = await createSubscription({
        user_email: newSubscriptionEmail.trim(),
        firebase_user_id: newSubscriptionUserId.trim() || undefined,
        hwid: newSubscriptionHwid.trim() || undefined,
        plan: newSubscriptionPlan,
        tier: newSubscriptionTier,
        expires_at: isUnlimited ? undefined : new Date(newSubscriptionExpiry).toISOString(),
        is_unlimited: isUnlimited,
      })
      await loadAll()
      setNewSubscriptionEmail('')
      setNewSubscriptionUserId('')
      setNewSubscriptionHwid('')
      setNewSubscriptionDuration('30')
      setNewSubscriptionExpiry(addDaysToNow(DEFAULT_DURATION_DAYS))
      setNotice(
        res.auto_authorized_requests
          ? isAr
            ? `تم حفظ الاشتراك وفتح ${res.auto_authorized_requests} طلب ربط معلّق.`
            : `Subscription saved and ${res.auto_authorized_requests} waiting device request(s) were unlocked.`
          : isAr
            ? 'تم حفظ الاشتراك.'
            : 'Subscription saved.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'subscription_create_failed')
    } finally {
      setSaving(false)
    }
  }

  const handlePatchSubscription = async (id: string, status: AdminSubscription['status']) => {
    const res = await patchSubscriptionStatus(id, status)
    setSubscriptions((prev) => prev.map((item) => (item.id === id ? res.item : item)))
  }

  const handleResetHwid = async (id: string) => {
    const res = await resetSubscriptionHwid(id, true)
    setSubscriptions((prev) => prev.map((item) => (item.id === id ? res.item : item)))
    setNotice('HWID reset and active app sessions revoked.')
    if (selectedUser?.item?.id === id) await handleOpenUser(id)
  }

  const handleCreatePromo = async () => {
    if (!newPromoCode.trim()) return
    setSaving(true)
    try {
      const res = await createPromoCode({
        code: newPromoCode.trim(),
        discount_type: newPromoType,
        discount_value: Number(newPromoValue || 0),
        is_private_tier_trigger: newPromoPrivate,
        max_uses: newPromoMaxUses ? Number(newPromoMaxUses) : undefined,
      })
      setPromoCodes((prev) => [res.item, ...prev])
      setNewPromoCode('')
      setNotice(isAr ? 'تم إنشاء كود الخصم.' : 'Promo code created.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'promo_create_failed')
    } finally {
      setSaving(false)
    }
  }

  const handlePublishOta = async () => {
    if (!otaVersion.trim() || !otaFile) return
    setSaving(true)
    setError(null)
    try {
      const channel = otaChannel.trim() || 'beta'
      const version = otaVersion.trim()
      const shouldForceUpdate = otaMandatory || otaMode === 'force' || otaMode === 'required'
      const forceDeadlineIso = shouldForceUpdate && otaForceDeadline ? new Date(otaForceDeadline).toISOString() : ''
      const upload = await uploadReleaseBinary({ file: otaFile, version, channel })
      const publish = await publishRelease({
        version,
        channel,
        notes: otaNotes.trim(),
        mandatory: otaMandatory,
        update_mode: otaMandatory ? 'force' : otaMode,
        rollout_percent: Number(otaRollout || 100),
        minimum_supported_version: otaMinimumVersion.trim(),
        force_update_deadline: forceDeadlineIso,
      })
      const channelManifest = publish.manifest.channels?.[channel]
      setOtaUpdates((prev) => [
        {
          id: `published-${Date.now()}`,
          version,
          channel,
          release_notes: otaNotes.trim(),
          download_url: channelManifest?.download_url || publish.manifest.download_url || '',
          is_mandatory: Boolean(channelManifest?.mandatory ?? publish.manifest.mandatory),
          is_published: true,
          rollout_percent: Number(otaRollout || 100),
          minimum_supported_version: otaMinimumVersion.trim(),
          force_update_deadline: forceDeadlineIso || null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ])
      setNotice(isAr ? `تم نشر ${version}. بصمة SHA-256: ${upload.release.sha256}` : `Published ${version}. SHA-256 ${upload.release.sha256}`)
      setOtaFile(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ota_publish_failed'
      setError(
        message === 'same_version_already_active'
          ? 'This version is already active on the selected channel. Publish a higher version to trigger desktop updates.'
          : message,
      )
    } finally {
      setSaving(false)
    }
  }

  const handleRollback = async () => {
    if (!rollbackVersion.trim()) return
    setSaving(true)
    try {
      await rollbackRelease({ version: rollbackVersion.trim(), channel: otaChannel.trim() || 'beta' })
      setNotice(isAr ? `تم التراجع بقناة ${otaChannel} إلى الإصدار ${rollbackVersion}.` : `Rolled back ${otaChannel} to ${rollbackVersion}.`)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'rollback_failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDisableRelease = async () => {
    setSaving(true)
    try {
      await disableRelease({ channel: otaChannel.trim() || 'beta', reason: disableReason.trim() })
      setNotice(isAr ? `تم تعطيل الإصدار الحالي لقناة ${otaChannel}.` : `Disabled current ${otaChannel} release.`)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'disable_release_failed')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveControls = async () => {
    setSaving(true)
    try {
      const featureFlags = JSON.parse(featureFlagsText || '{}') as Record<string, unknown>
      const announcements = JSON.parse(announcementsText || '[]') as NonNullable<AdminRemoteControls['remote_config']>['announcements']
      const shouldForceUpdate = otaMode === 'force' || otaMode === 'required'
      const forceDeadlineIso = shouldForceUpdate && otaForceDeadline ? new Date(otaForceDeadline).toISOString() : ''
      const res = await updateRemoteControls({
        channel: remoteChannel,
        rollout_percent: Number(otaRollout || 100),
        minimum_supported_version: otaMinimumVersion.trim(),
        force_update_deadline: forceDeadlineIso,
        remote_config: {
          ...(remoteControls.remote_config || {}),
          update_mode: otaMode,
          kill_switch_enabled: killSwitchEnabled,
          kill_switch_message: killSwitchMessage.trim(),
          feature_flags: featureFlags,
          announcements,
        },
      })
      applyRemoteControlState(res.controls || {})
      setNotice(isAr ? 'تم حفظ التحكمات البعيدة.' : 'Remote controls saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'remote_controls_save_failed')
    } finally {
      setSaving(false)
    }
  }

  const handleOpenUser = async (userKey: string) => {
    if (!userKey) return
    setSelectedUserLoading(true)
    try {
      setSelectedUser(await fetchUserDetail(userKey))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'user_detail_failed')
    } finally {
      setSelectedUserLoading(false)
    }
  }

  const applyAccessRequestToForm = (request: AdminAccessRequest) => {
    setNewSubscriptionEmail(request.user_email || '')
    setNewSubscriptionUserId(request.user_id || '')
    setNewSubscriptionHwid(request.hwid || '')
    setNewSubscriptionPlan('monthly')
    setNewSubscriptionTier('public')
    setNewSubscriptionDuration('30')
    setNewSubscriptionExpiry(addDaysToNow(DEFAULT_DURATION_DAYS))
    setNotice(isAr ? 'تم نسخ طلب الوصول إلى نموذج الاشتراك.' : 'Access request copied into the subscription form.')
  }

  const handleGrantBeta = async (request: AdminAccessRequest) => {
    if (!request.user_email) return
    const isUnlimited = newSubscriptionDuration === 'unlimited'
    if (!isUnlimited && !newSubscriptionExpiry) return
    setSaving(true)
    setError(null)
    try {
      const res = await createSubscription({
        user_email: request.user_email,
        firebase_user_id: request.user_id || undefined,
        hwid: request.hwid || undefined,
        plan: newSubscriptionPlan,
        tier: newSubscriptionTier,
        expires_at: isUnlimited ? undefined : new Date(newSubscriptionExpiry).toISOString(),
        is_unlimited: isUnlimited,
      })
      setNotice(
        res.auto_authorized_requests
          ? isAr
            ? `تم منح ${request.user_email} اشتراكًا ${isUnlimited ? '∞' : 'بالفترة المحددة'} وتم فتح ${res.auto_authorized_requests} طلب ربط معلّق.`
            : `Granted access to ${request.user_email} and unlocked ${res.auto_authorized_requests} waiting device request(s).`
          : isAr
            ? `تم منح ${request.user_email} اشتراكًا ${isUnlimited ? '∞' : 'بالفترة المحددة'}.`
            : `Granted access to ${request.user_email}.`,
      )
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'subscription_create_failed')
    } finally {
      setSaving(false)
    }
  }

  const pages: Array<{ id: AdminPage; label: string; hint: string }> = [
    { id: 'overview', label: isAr ? 'نظرة عامة' : 'Overview', hint: isAr ? 'المؤشرات وآخر النشاط' : 'KPIs and recent events' },
    { id: 'users', label: isAr ? 'المستخدمون' : 'Users', hint: isAr ? 'الحسابات والأجهزة وHWID' : 'Accounts, devices, HWID' },
    { id: 'subscriptions', label: isAr ? 'الاشتراكات' : 'Subscriptions', hint: isAr ? 'الحالة والإجراءات اليدوية' : 'Status and manual actions' },
    { id: 'promos', label: isAr ? 'أكواد الخصم' : 'Promo Codes', hint: isAr ? 'الخصومات وتفعيل الفئات' : 'Discount and tier triggers' },
    { id: 'ota', label: isAr ? 'التحديثات الهوائية' : 'OTA Updates', hint: isAr ? 'نشر وتراجع وتعطيل' : 'Publish, rollback, disable' },
    { id: 'controls', label: isAr ? 'التحكمات البعيدة' : 'Remote Controls', hint: isAr ? 'الرايات والنشر والإيقاف' : 'Flags, rollout, kill switch' },
    { id: 'crashes', label: isAr ? 'سجل الأخطاء' : 'Crash Telemetry', hint: isAr ? 'التجميع والسجلات الخام' : 'Groups and raw logs' },
    { id: 'audit', label: isAr ? 'سجل الإدارة' : 'Audit Log', hint: isAr ? 'إجراءات الأدمن' : 'Admin actions' },
  ]

  const kpiCards = [
    { label: isAr ? 'المستخدمون النشطون' : 'Total Active Users', value: String(kpis.total_active_users ?? 0) },
    { label: isAr ? 'إجمالي الإيراد' : 'Total Revenue', value: kpis.total_revenue != null ? `$${kpis.total_revenue}` : '--' },
    { label: isAr ? 'المستخدمون المتوقفون' : 'Churned Users', value: String(kpis.churned_users ?? 0) },
    { label: isAr ? 'تنبيهات العبث النشطة' : 'Active Tampering Alerts', value: String(kpis.active_tampering_alerts ?? 0) },
  ]

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8">
      <section className="surface-card mb-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">{t.title}</h1>
            <p className="mt-1 text-sm text-white/65">{t.subtitle}</p>
          </div>
          <button className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => void loadAll()} disabled={loading}>
            {loading ? (isAr ? 'جار التحديث...' : 'Refreshing...') : isAr ? 'تحديث' : 'Refresh'}
          </button>
        </div>
      </section>

      {error ? <section className="mb-4 rounded-xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</section> : null}
      {notice ? (
        <section className="mb-4 rounded-xl border border-emerald-300/35 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </section>
      ) : null}
      {loading ? <section className="mb-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">{isAr ? 'جار تحميل بيانات لوحة الإدارة...' : 'Loading admin data...'}</section> : null}

      <div className="grid gap-4 lg:grid-cols-[245px_minmax(0,1fr)]">
        <aside className="surface-card h-fit p-2 lg:sticky lg:top-24">
          <nav className="grid gap-1" aria-label="Admin pages">
            {pages.map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={() => setActivePage(page.id)}
                className={`rounded-xl px-3 py-3 text-start transition ${
                  activePage === page.id
                    ? 'border border-sky-300/35 bg-sky-400/15 text-white'
                    : 'border border-transparent text-white/68 hover:border-white/12 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <span className="block text-sm font-semibold">{page.label}</span>
                <span className="mt-1 block text-xs text-white/45">{page.hint}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">
          {activePage === 'overview' ? (
            <section className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {kpiCards.map((card) => (
                  <article key={card.label} className="surface-card p-4">
                    <div className="text-xs text-white/60">{card.label}</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{card.value}</div>
                  </article>
                ))}
              </div>
              <article className="surface-card p-5">
                <h3 className="mb-3 text-sm font-semibold text-white/85">{isAr ? 'آخر النشاط' : 'Recent Activity'}</h3>
                <ul className="space-y-2 text-sm text-white/75">
                  {recentActivity.slice(0, 20).map((item, idx) => (
                    <li key={`${idx}-${JSON.stringify(item)}`} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                      {typeof item === 'string' ? item : JSON.stringify(item)}
                    </li>
                  ))}
                </ul>
              </article>
            </section>
          ) : null}

          {activePage === 'users' || activePage === 'subscriptions' ? (
            <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px] 2xl:items-start">
              <div className="grid min-w-0 gap-4">
                {activePage === 'users' ? (
                  <article className="surface-card min-w-0 p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white/85">{isAr ? 'طلبات الوصول التجريبية' : 'Beta Access Requests'}</h3>
                        <p className="mt-1 text-xs text-white/50">
                          {isAr ? 'أي حساب أكمل تسجيل الدخول لكنه ما زال يحتاج اشتراكًا يدويًا من لوحة الإدارة.' : 'Any account that finished Google sign-in but still needs a manual beta subscription.'}
                        </p>
                      </div>
                      <input
                        className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none sm:w-72"
                        placeholder={isAr ? 'ابحث بالبريد أو HWID أو الحالة...' : 'Search email, HWID, status...'}
                        value={subscriptionSearch}
                        onChange={(e) => {
                          setSubscriptionSearch(e.target.value)
                          setAccessRequestPage(1)
                          setSubscriptionPage(1)
                        }}
                      />
                    </div>
                    {filteredAccessRequests.length ? (
                      <>
                        <div className="overflow-x-auto rounded-xl border border-white/10">
                          <table className="w-full min-w-[860px] text-sm">
                            <thead className="bg-white/5 text-white/60">
                              <tr>
                                <th className="px-3 py-2 text-start">{isAr ? 'الحساب' : 'Account'}</th>
                                <th className="px-3 py-2 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                                <th className="px-3 py-2 text-start">HWID</th>
                                <th className="px-3 py-2 text-start">{isAr ? 'الاشتراك' : 'Subscription'}</th>
                                <th className="px-3 py-2 text-start">{isAr ? 'آخر حدث' : 'Last event'}</th>
                                <th className="px-3 py-2 text-start">{isAr ? 'إجراءات' : 'Actions'}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visiblePage(filteredAccessRequests, accessRequestPage).map((request) => (
                                <tr key={request.id} className="border-t border-white/10 text-white/80">
                                  <td className="px-3 py-2">{request.user_email || request.user_id || request.id}</td>
                                  <td className="px-3 py-2">{adminStatusLabel(request.status, isAr)}</td>
                                  <td className="max-w-40 truncate px-3 py-2">{request.hwid || '--'}</td>
                                  <td className="px-3 py-2">
                                    {request.has_subscription
                                      ? `${adminStatusLabel(request.subscription_status || 'authorized', isAr)}${request.subscription_expires_at ? ` / ${daysRemaining(request.subscription_expires_at, null, isAr)}` : ''}`
                                      : isAr ? 'مفقود' : 'missing'}
                                  </td>
                                  <td className="px-3 py-2">{formatEgyptDateTime(request.last_event_at || request.created_at)}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap gap-2">
                                      <button className="rounded-lg border border-emerald-300/35 bg-emerald-400/10 px-2.5 py-1 text-emerald-100" onClick={() => void handleGrantBeta(request)} disabled={saving || !request.user_email}>
                                        {isAr ? 'منح الوصول' : 'Grant access'}
                                      </button>
                                      <button className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1" onClick={() => applyAccessRequestToForm(request)}>
                                        {isAr ? 'تعبئة النموذج' : 'Fill form'}
                                      </button>
                                      <button className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1" onClick={() => void handleOpenUser(request.user_email || request.user_id || request.id)}>
                                        {isAr ? 'التفاصيل' : 'Details'}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <Pager page={accessRequestPage} total={filteredAccessRequests.length} onPage={setAccessRequestPage} isAr={isAr} />
                      </>
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.03] px-4 py-6 text-sm text-white/55">
                        {isAr ? 'لا توجد طلبات وصول معلقة حاليًا.' : 'No pending access requests right now.'}
                      </div>
                    )}
                  </article>
                ) : null}

                <article className="surface-card min-w-0 p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-white/85">{isAr ? 'الاشتراكات' : 'Subscriptions'}</h3>
                    {activePage === 'subscriptions' ? (
                      <input
                        className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none sm:w-72"
                        placeholder={isAr ? 'ابحث بالبريد أو HWID أو الحالة...' : 'Search email, HWID, status...'}
                        value={subscriptionSearch}
                        onChange={(e) => {
                          setSubscriptionSearch(e.target.value)
                          setSubscriptionPage(1)
                        }}
                      />
                    ) : null}
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead className="bg-white/5 text-white/60">
                        <tr>
                          <th className="px-3 py-2 text-start">{isAr ? 'الحساب' : 'Account'}</th>
                          <th className="px-3 py-2 text-start">{isAr ? 'الخطة' : 'Plan'}</th>
                          <th className="px-3 py-2 text-start">{isAr ? 'الفئة' : 'Tier'}</th>
                          <th className="px-3 py-2 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                          <th className="px-3 py-2 text-start">HWID</th>
                          <th className="px-3 py-2 text-start">{isAr ? 'المدة المتبقية' : 'Remaining'}</th>
                          <th className="px-3 py-2 text-start">{isAr ? 'إجراءات' : 'Actions'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visiblePage(filteredSubscriptions, subscriptionPage).map((row) => (
                          <tr key={row.id} className="border-t border-white/10 text-white/80">
                            <td className="px-3 py-2">{row.user_email || row.firebase_user_id || row.id}</td>
                            <td className="px-3 py-2">{adminPlanLabel(row.plan, isAr)}</td>
                            <td className="px-3 py-2">{adminTierLabel(row.tier, isAr)}</td>
                            <td className="px-3 py-2">{adminStatusLabel(row.status, isAr)}</td>
                            <td className="max-w-40 truncate px-3 py-2">{row.hwid || '--'}</td>
                            <td className="px-3 py-2">{daysRemaining(row.expires_at, row.metadata, isAr)}</td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-2">
                                <button className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1" onClick={() => void handleOpenUser(row.id)}>
                                  {isAr ? 'التفاصيل' : 'Details'}
                                </button>
                                <button
                                  className="rounded-lg border border-amber-300/35 bg-amber-400/10 px-2.5 py-1 text-amber-100"
                                  onClick={() => void handlePatchSubscription(row.id, 'suspended')}
                                >
                                  {isAr ? 'تعليق' : 'Suspend'}
                                </button>
                                <button
                                  className="rounded-lg border border-rose-300/40 bg-rose-500/10 px-2.5 py-1 text-rose-200"
                                  onClick={() => void handlePatchSubscription(row.id, 'canceled')}
                                >
                                  {isAr ? 'إلغاء' : 'Cancel'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pager page={subscriptionPage} total={filteredSubscriptions.length} onPage={setSubscriptionPage} isAr={isAr} />
                </article>
              </div>

              <aside className="grid gap-4 2xl:sticky 2xl:top-24 2xl:self-start">
                <article className="surface-card p-5">
                  <h3 className="mb-3 text-sm font-semibold text-white/85">{isAr ? 'إنشاء / تحديث اشتراك' : 'Create Subscription'}</h3>
                  <div className="grid gap-3">
                    <input className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" placeholder={isAr ? 'بريد المستخدم' : 'User email'} value={newSubscriptionEmail} onChange={(e) => setNewSubscriptionEmail(e.target.value)} />
                    {newSubscriptionUserId || newSubscriptionHwid ? (
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/60">
                        {newSubscriptionUserId ? <div>{isAr ? 'معرّف Firebase:' : 'Firebase user:'} {newSubscriptionUserId}</div> : null}
                        {newSubscriptionHwid ? <div>HWID: {newSubscriptionHwid}</div> : null}
                      </div>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select className="site-select" value={newSubscriptionPlan} onChange={(e) => setNewSubscriptionPlan(e.target.value as 'monthly' | 'yearly')}>
                        <option value="monthly">{isAr ? 'شهري' : 'Monthly'}</option>
                        <option value="yearly">{isAr ? 'سنوي' : 'Yearly'}</option>
                      </select>
                      <select className="site-select" value={newSubscriptionTier} onChange={(e) => setNewSubscriptionTier(e.target.value as 'public' | 'private')}>
                        <option value="public">{isAr ? 'عام' : 'Public'}</option>
                        <option value="private">{isAr ? 'خاص' : 'Private'}</option>
                      </select>
                    </div>
                    <select className="site-select" value={newSubscriptionDuration} onChange={(e) => setNewSubscriptionDuration(e.target.value as typeof newSubscriptionDuration)}>
                      <option value="1">{isAr ? 'يوم واحد' : '1 day'}</option>
                      <option value="7">{isAr ? '7 أيام' : '7 days'}</option>
                      <option value="30">{isAr ? '30 يومًا' : '30 days'}</option>
                      <option value="90">{isAr ? '90 يومًا' : '90 days'}</option>
                      <option value="365">{isAr ? 'سنة' : '1 year'}</option>
                      <option value="unlimited">∞</option>
                      <option value="custom">{isAr ? 'تاريخ مخصص' : 'Custom date'}</option>
                    </select>
                    {newSubscriptionDuration !== 'unlimited' ? (
                      <input className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" type="datetime-local" value={newSubscriptionExpiry} onChange={(e) => setNewSubscriptionExpiry(e.target.value)} />
                    ) : (
                      <div className="rounded-xl border border-emerald-400/22 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                        {isAr ? 'سيظهر هذا الاشتراك داخل الأداة بالرمز ∞.' : 'This subscription will be shown inside the app as ∞.'}
                      </div>
                    )}
                    <button className="btn-primary w-full rounded-xl px-4 py-2 text-sm font-semibold" disabled={saving || !newSubscriptionEmail.trim() || (newSubscriptionDuration !== 'unlimited' && !newSubscriptionExpiry)} onClick={() => void handleCreateSubscription()}>
                      {isAr ? 'حفظ الاشتراك' : 'Save subscription'}
                    </button>
                  </div>
                </article>

                {selectedUser ? (
                  <article className="surface-card p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-white/85">{isAr ? 'تفاصيل المستخدم' : 'User Detail'}</h3>
                      {selectedUser.item ? (
                        <button className="rounded-lg border border-amber-300/35 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-100" onClick={() => void handleResetHwid(selectedUser.item!.id)}>
                          {isAr ? 'إعادة تعيين HWID' : 'Reset HWID'}
                        </button>
                      ) : null}
                    </div>
                    {selectedUserLoading ? <div className="text-sm text-white/60">{isAr ? 'جار التحميل...' : 'Loading...'}</div> : null}
                    <div className="space-y-2 text-sm text-white/75">
                      <div>{isAr ? 'البريد:' : 'Email:'} {selectedUser.item?.user_email || selectedUser.request?.user_email || '--'}</div>
                      <div>HWID: {selectedUser.item?.hwid || selectedUser.request?.hwid || '--'}</div>
                      <div>{isAr ? 'آخر دخول:' : 'Last login:'} {formatEgyptDateTime(selectedUser.item?.last_seen_at || selectedUser.request?.last_event_at)}</div>
                      <div>{isAr ? 'حالة الطلب:' : 'Request status:'} {selectedUser.request?.status || '--'}</div>
                      <div>{isAr ? 'آخر خطأ:' : 'Last crash:'} {formatEgyptDateTime(selectedUser.last_crash?.happened_at)}</div>
                      <div>{isAr ? 'الأجهزة:' : 'Devices:'} {selectedUser.devices.length}</div>
                      <div>{isAr ? 'الجلسات:' : 'Sessions:'} {selectedUser.sessions.length}</div>
                      <div>{isAr ? 'طلبات الدخول:' : 'Login requests:'} {selectedUser.login_requests.length}</div>
                      <div>{isAr ? 'الأخطاء:' : 'Crashes:'} {selectedUser.crashes.length}</div>
                    </div>
                  </article>
                ) : null}
              </aside>
            </section>
          ) : null}

          {activePage === 'promos' ? (
            <section className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
              <article className="surface-card p-5">
                <h3 className="mb-3 text-sm font-semibold text-white/85">{isAr ? 'إنشاء كود خصم' : 'Create Promo Code'}</h3>
                <div className="grid gap-3">
                  <input className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" placeholder={isAr ? 'الكود' : 'Code'} value={newPromoCode} onChange={(e) => setNewPromoCode(e.target.value)} />
                  <select className="site-select" value={newPromoType} onChange={(e) => setNewPromoType(e.target.value as 'percent' | 'fixed')}>
                    <option value="percent">{isAr ? 'نسبة مئوية' : 'Percent'}</option>
                    <option value="fixed">{isAr ? 'قيمة ثابتة' : 'Fixed amount'}</option>
                  </select>
                  <input className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" placeholder={isAr ? 'قيمة الخصم' : 'Discount value'} value={newPromoValue} onChange={(e) => setNewPromoValue(e.target.value)} />
                  <input className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" placeholder={isAr ? 'الحد الأقصى للاستخدام' : 'Usage limit'} value={newPromoMaxUses} onChange={(e) => setNewPromoMaxUses(e.target.value)} />
                  <label className="flex items-center gap-2 text-sm text-white/75">
                    <input type="checkbox" checked={newPromoPrivate} onChange={(e) => setNewPromoPrivate(e.target.checked)} />
                    {isAr ? 'يفعّل الفئة الخاصة' : 'Private tier trigger'}
                  </label>
                  <button className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold" disabled={saving} onClick={() => void handleCreatePromo()}>
                    {isAr ? 'حفظ' : 'Save'}
                  </button>
                </div>
              </article>
              <article className="surface-card p-5">
                <h3 className="mb-3 text-sm font-semibold text-white/85">{isAr ? 'أكواد الخصم' : 'Promo Codes'}</h3>
                <div className="grid gap-2">
                  {promoCodes.map((promo) => (
                    <div key={promo.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">
                      <div className="font-semibold text-white">{promo.code}</div>
                      <div>
                        {promo.discount_type} / {promo.discount_value} / {promo.is_private_tier_trigger ? (isAr ? 'فئة خاصة' : 'Private tier') : (isAr ? 'فئة عامة' : 'Public tier')}
                      </div>
                      <div>
                        {isAr ? 'الحالة:' : 'Status:'} {promo.is_active ? (isAr ? 'نشط' : 'active') : (isAr ? 'معطل' : 'inactive')}
                        {' / '}
                        {isAr ? 'تم الاستخدام' : 'Used'} {promo.used_count ?? 0}{promo.max_uses ? `${isAr ? ' من ' : ' of '}${promo.max_uses}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          ) : null}

          {activePage === 'ota' ? (
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <article className="surface-card p-5">
                <h3 className="mb-3 text-sm font-semibold text-white/85">{isAr ? 'نشر تحديث هوائي' : 'Publish OTA Update'}</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <input className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" placeholder={isAr ? 'الإصدار' : 'Version'} value={otaVersion} onChange={(e) => setOtaVersion(e.target.value)} />
                  <select className="site-select" value={otaChannel} onChange={(e) => setOtaChannel(e.target.value)}>
                    <option value="beta">{isAr ? 'بيتا' : 'Beta'}</option>
                    <option value="stable">{isAr ? 'مستقر' : 'Stable'}</option>
                  </select>
                  <input className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" type="file" accept=".exe,application/vnd.microsoft.portable-executable,application/octet-stream" onChange={(e) => setOtaFile(e.currentTarget.files?.[0] || null)} />
                  <select className="site-select" value={otaMode} onChange={(e) => setOtaMode(e.target.value as 'optional' | 'force' | 'required' | 'silent')} disabled={otaMandatory}>
                    <option value="optional">{isAr ? 'اختياري' : 'Optional'}</option>
                    <option value="silent">{isAr ? 'صامت' : 'Silent'}</option>
                    <option value="required">{isAr ? 'مطلوب' : 'Required'}</option>
                    <option value="force">{isAr ? 'إجباري' : 'Force'}</option>
                  </select>
                  <select className="site-select" value={otaRollout} onChange={(e) => setOtaRollout(e.target.value)}>
                    <option value="5">{isAr ? 'نشر تدريجي 5%' : 'Staged 5%'}</option>
                    <option value="25">{isAr ? 'نشر تدريجي 25%' : 'Staged 25%'}</option>
                    <option value="100">{isAr ? 'نشر كامل 100%' : 'Rollout 100%'}</option>
                  </select>
                  <input className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" placeholder={isAr ? 'أقل إصدار مدعوم' : 'Minimum supported version'} value={otaMinimumVersion} onChange={(e) => setOtaMinimumVersion(e.target.value)} />
                  <input className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" type="datetime-local" value={otaForceDeadline} onChange={(e) => setOtaForceDeadline(e.target.value)} />
                  <label className="flex items-center gap-2 text-sm text-white/75">
                    <input type="checkbox" checked={otaMandatory} onChange={(e) => setOtaMandatory(e.target.checked)} />
                    {isAr ? 'تحديث إجباري' : 'Mandatory update'}
                  </label>
                </div>
                <textarea className="mt-3 min-h-28 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" placeholder={isAr ? 'ملاحظات الإصدار' : 'Release notes'} value={otaNotes} onChange={(e) => setOtaNotes(e.target.value)} />
                {otaFile ? <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/65">{otaFile.name} - {(otaFile.size / 1024 / 1024).toFixed(2)} MB</div> : null}
                <button className="btn-primary mt-3 rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => void handlePublishOta()} disabled={saving || !otaVersion.trim() || !otaFile}>
                  {saving ? (isAr ? 'جار التنفيذ...' : 'Working...') : isAr ? 'نشر التحديث' : 'Publish Update'}
                </button>
              </article>
              <aside className="grid gap-4">
                <article className="surface-card p-5">
                  <h3 className="mb-3 text-sm font-semibold text-white/85">{isAr ? 'الرجوع / التعطيل' : 'Rollback / Disable'}</h3>
                  <div className="grid gap-3">
                    <input className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" placeholder={isAr ? 'إصدار الرجوع' : 'Rollback version'} value={rollbackVersion} onChange={(e) => setRollbackVersion(e.target.value)} />
                    <button className="rounded-xl border border-sky-300/35 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-100" disabled={saving || !rollbackVersion.trim()} onClick={() => void handleRollback()}>
                      {isAr ? 'إرجاع القناة' : 'Rollback Channel'}
                    </button>
                    <input className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" placeholder={isAr ? 'سبب التعطيل' : 'Disable reason'} value={disableReason} onChange={(e) => setDisableReason(e.target.value)} />
                    <button className="rounded-xl border border-rose-300/45 bg-rose-500/12 px-4 py-2 text-sm font-semibold text-rose-100" disabled={saving} onClick={() => void handleDisableRelease()}>
                      {isAr ? 'تعطيل الإصدار الحالي' : 'Disable Current Release'}
                    </button>
                  </div>
                </article>
                <article className="surface-card p-5">
                  <h3 className="mb-3 text-sm font-semibold text-white/85">{isAr ? 'سجل التحديثات' : 'OTA Records'}</h3>
                  <div className="grid gap-2 text-sm text-white/75">
                    {otaUpdates.slice(0, 8).map((item) => (
                      <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="font-semibold text-white">{item.version} / {adminChannelLabel(item.channel, isAr)}</div>
                        <div>
                          {item.is_mandatory ? (isAr ? 'إجباري' : 'mandatory') : (isAr ? 'اختياري' : 'optional')}
                          {' / '}
                          {item.is_published ? (isAr ? 'منشور' : 'published') : (isAr ? 'مسودة' : 'draft')}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </aside>
            </section>
          ) : null}

          {activePage === 'controls' ? (
            <section className="surface-card p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white/85">{isAr ? 'التحكمات البعيدة' : 'Remote Controls'}</h3>
                <select className="site-select" value={remoteChannel} onChange={(e) => setRemoteChannel(e.target.value)}>
                  <option value="beta">{isAr ? 'بيتا' : 'Beta'}</option>
                  <option value="stable">{isAr ? 'مستقر' : 'Stable'}</option>
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <select className="site-select" value={otaRollout} onChange={(e) => setOtaRollout(e.target.value)}>
                  <option value="5">{isAr ? 'نشر 5%' : '5% rollout'}</option>
                  <option value="25">{isAr ? 'نشر 25%' : '25% rollout'}</option>
                  <option value="100">{isAr ? 'نشر 100%' : '100% rollout'}</option>
                </select>
                <select className="site-select" value={otaMode} onChange={(e) => setOtaMode(e.target.value as 'optional' | 'force' | 'required' | 'silent')}>
                  <option value="optional">{isAr ? 'تحديث اختياري' : 'Optional update'}</option>
                  <option value="silent">{isAr ? 'تنزيل صامت' : 'Silent download'}</option>
                  <option value="required">{isAr ? 'تحديث مطلوب' : 'Required update'}</option>
                  <option value="force">{isAr ? 'تحديث إجباري' : 'Force update'}</option>
                </select>
                <input className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" placeholder={isAr ? 'أقل إصدار مدعوم' : 'Minimum supported version'} value={otaMinimumVersion} onChange={(e) => setOtaMinimumVersion(e.target.value)} />
                <input className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" type="datetime-local" value={otaForceDeadline} onChange={(e) => setOtaForceDeadline(e.target.value)} />
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm text-white/75">
                <input type="checkbox" checked={killSwitchEnabled} onChange={(e) => setKillSwitchEnabled(e.target.checked)} />
                {isAr ? 'تفعيل مفتاح الإيقاف' : 'Enable kill switch'}
              </label>
              <input className="mt-3 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" placeholder={isAr ? 'رسالة الإيقاف' : 'Kill switch message'} value={killSwitchMessage} onChange={(e) => setKillSwitchMessage(e.target.value)} />
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <label className="grid gap-2 text-xs text-white/60">
                  {isAr ? 'JSON الرايات' : 'Feature flags JSON'}
                  <textarea className="min-h-48 rounded-xl border border-white/15 bg-white/5 px-3 py-2 font-mono text-xs text-white outline-none" value={featureFlagsText} onChange={(e) => setFeatureFlagsText(e.target.value)} />
                </label>
                <label className="grid gap-2 text-xs text-white/60">
                  {isAr ? 'JSON الإعلانات داخل الأداة' : 'In-app announcements JSON'}
                  <textarea className="min-h-48 rounded-xl border border-white/15 bg-white/5 px-3 py-2 font-mono text-xs text-white outline-none" value={announcementsText} onChange={(e) => setAnnouncementsText(e.target.value)} />
                </label>
              </div>
              <button className="btn-primary mt-4 rounded-xl px-4 py-2 text-sm font-semibold" disabled={saving} onClick={() => void handleSaveControls()}>
                {isAr ? 'حفظ التحكمات' : 'Save Remote Controls'}
              </button>
            </section>
          ) : null}

          {activePage === 'crashes' ? (
            <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)] xl:items-start">
              <article className="surface-card min-w-0 overflow-hidden p-5">
                <h3 className="mb-3 text-sm font-semibold text-white/85">{isAr ? 'مجموعات الأعطال' : 'Crash Groups'}</h3>
                <div className="grid gap-2">
                  {crashGroups.map((group) => (
                    <button key={group.fingerprint} className="w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-3 text-start text-sm text-white/75 hover:border-sky-300/35" onClick={() => setCrashSearch(group.error_type)}>
                      <div className="break-words font-semibold text-white">{group.error_type}</div>
                      <div>{isAr ? `${group.count} عطل / ${group.affected_hwids.length} جهاز` : `${group.count} crashes / ${group.affected_hwids.length} devices`}</div>
                      <div className="break-words text-white/50">{group.message || group.fingerprint}</div>
                    </button>
                  ))}
                </div>
              </article>
              <article className="surface-card min-w-0 overflow-hidden p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white/85">{isAr ? 'سجل الأعطال الخام' : 'Raw Crash Logs'}</h3>
                  <input className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none sm:w-72" placeholder={isAr ? 'ابحث في الأعطال...' : 'Search crashes...'} value={crashSearch} onChange={(e) => { setCrashSearch(e.target.value); setCrashPage(1) }} />
                </div>
                <div className="grid gap-3">
                  {visiblePage(filteredCrashes, crashPage).map((crash) => {
                    const expanded = expandedCrashId === crash.id
                    const crashIp = crash.raw_payload?.request?.ip || '--'
                    const crashCountry = crash.raw_payload?.request?.country || ''
                    const crashAuth = crash.raw_payload?.auth?.source || '--'
                    return (
                      <div key={crash.id} className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/80">
                        <div className="grid min-w-0 gap-1">
                          <div className="text-rose-200">{crash.error_type}</div>
                          <div>{formatEgyptDateTime(crash.happened_at)} / {crash.app_version || '--'}</div>
                          <div>{crash.device_name || '--'} / {crash.hwid || (isAr ? 'بدون HWID' : 'no-hwid')}</div>
                          <div>{isAr ? 'IP:' : 'IP:'} {crashIp}{crashCountry ? ` / ${crashCountry}` : ''} / {isAr ? 'المصادقة:' : 'Auth:'} {crashAuth}</div>
                          <div>{[crash.windows_version, crash.cpu, crash.ram_gb ? `${crash.ram_gb}GB` : null, crash.gpu].filter(Boolean).join(' / ') || '--'}</div>
                          {crash.message ? <div className="text-white/60">{crash.message}</div> : null}
                        </div>
                        <button className="mt-2 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-xs" onClick={() => setExpandedCrashId(expanded ? null : crash.id)}>
                          {expanded ? (isAr ? 'إخفاء التتبع' : 'Hide Stack') : (isAr ? 'عرض التتبع' : 'Show Stack')}
                        </button>
                        {expanded ? <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-[#030712] p-3 text-xs leading-5 text-white/75">{crash.stack_trace}</pre> : null}
                      </div>
                    )
                  })}
                </div>
                <Pager page={crashPage} total={filteredCrashes.length} onPage={setCrashPage} isAr={isAr} />
              </article>
            </section>
          ) : null}

          {activePage === 'audit' ? (
            <section className="surface-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-white/85">{isAr ? 'سجل المراجعة' : 'Audit Log'}</h3>
              <div className="grid gap-2">
                {auditLog.map((item, idx) => (
                  <div key={`${item.id || idx}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">
                    <div className="font-semibold text-white">{item.action || item.type || (isAr ? 'إجراء إداري' : 'admin_action')}</div>
                    <div>{item.admin_email || item.actor || '--'} / {formatEgyptDateTime(item.happened_at || item.at)}</div>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-white/10 bg-[#030712] p-2 text-xs text-white/65">
                      {JSON.stringify(item.payload || item, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {activePage === 'controls' ? null : null}
        </div>
      </div>
    </main>
  )
}
