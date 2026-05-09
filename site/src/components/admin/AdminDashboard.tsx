import { useEffect, useMemo, useState } from 'react'
import {
  createLicense,
  createOtaUpdate,
  createPromoCode,
  fetchAdminDashboard,
  fetchCrashLogs,
  fetchLicenses,
  fetchOtaUpdates,
  fetchPromoCodes,
  patchLicenseStatus,
  type AdminCrashLog,
  type AdminLicense,
  type AdminOtaUpdate,
  type AdminPromoCode,
} from '../../api/admin'

type AdminDashboardProps = {
  lang: 'en' | 'ar'
}

export function AdminDashboard({ lang }: AdminDashboardProps) {
  const isAr = lang === 'ar'
  const [expandedCrashId, setExpandedCrashId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [kpis, setKpis] = useState<Record<string, number | null>>({})
  const [recentActivity, setRecentActivity] = useState<unknown[]>([])
  const [licenses, setLicenses] = useState<AdminLicense[]>([])
  const [promoCodes, setPromoCodes] = useState<AdminPromoCode[]>([])
  const [otaUpdates, setOtaUpdates] = useState<AdminOtaUpdate[]>([])
  const [crashes, setCrashes] = useState<AdminCrashLog[]>([])
  const [savingPromo, setSavingPromo] = useState(false)
  const [savingOta, setSavingOta] = useState(false)
  const [savingLicense, setSavingLicense] = useState(false)
  const [newPromoCode, setNewPromoCode] = useState('')
  const [newPromoType, setNewPromoType] = useState<'percent' | 'fixed'>('percent')
  const [newPromoValue, setNewPromoValue] = useState('10')
  const [newPromoPrivate, setNewPromoPrivate] = useState(false)
  const [newPromoMaxUses, setNewPromoMaxUses] = useState('')
  const [newLicenseKey, setNewLicenseKey] = useState('')
  const [newLicenseEmail, setNewLicenseEmail] = useState('')
  const [newLicensePlan, setNewLicensePlan] = useState<'monthly' | 'yearly'>('monthly')
  const [newLicenseTier, setNewLicenseTier] = useState<'public' | 'private'>('public')
  const [newLicenseExpiry, setNewLicenseExpiry] = useState('')
  const [newOtaVersion, setNewOtaVersion] = useState('')
  const [newOtaChannel, setNewOtaChannel] = useState('stable')
  const [newOtaUrl, setNewOtaUrl] = useState('')
  const [newOtaNotes, setNewOtaNotes] = useState('')
  const [newOtaMandatory, setNewOtaMandatory] = useState(false)

  const t = useMemo(
    () =>
      isAr
        ? {
            title: 'لوحة إدارة Saturn Workspace',
            subtitle: 'إدارة التراخيص، أكواد الخصم، التحديثات الهوائية، وسجلات الأعطال.',
            publish: 'نشر تحديث',
            save: 'حفظ',
            revoke: 'سحب',
            suspend: 'تعليق',
            overview: 'نظرة عامة',
            activity: 'آخر النشاطات',
            licenses: 'إدارة التراخيص',
            promos: 'إدارة أكواد الخصم',
            ota: 'التحديثات الهوائية OTA',
            crashes: 'Crash Logs & Telemetry',
            users: 'دليل المستخدمين',
            security: 'الأمان ومكافحة العبث',
          }
        : {
            title: 'Saturn Workspace Admin Dashboard',
            subtitle: 'Manage licenses, promo codes, OTA releases, crash telemetry, and security actions.',
            publish: 'Publish Update',
            save: 'Save',
            revoke: 'Revoke',
            suspend: 'Suspend',
            overview: 'Overview',
            activity: 'Recent Activity',
            licenses: 'License Management',
            promos: 'Promo Codes',
            ota: 'OTA Updates',
            crashes: 'Crash Logs & Telemetry',
            users: 'Users Directory',
            security: 'Security & Anti-Tamper',
          },
    [isAr],
  )

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [dashboard, lic, promo, ota, crash] = await Promise.all([
          fetchAdminDashboard(),
          fetchLicenses(),
          fetchPromoCodes(),
          fetchOtaUpdates(),
          fetchCrashLogs(),
        ])
        if (!alive) return
        setKpis(dashboard.kpis || {})
        setRecentActivity(dashboard.recent_activity || [])
        setLicenses(lic.items || [])
        setPromoCodes(promo.items || [])
        setOtaUpdates(ota.items || [])
        setCrashes(crash.items || [])
      } catch (err) {
        if (!alive) return
        setError(err instanceof Error ? err.message : 'failed_to_load_admin_data')
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [])

  const kpiCards = [
    {
      key: 'active-users',
      label: isAr ? 'إجمالي المستخدمين النشطين' : 'Total Active Users',
      value: String(kpis.total_active_users ?? 0),
    },
    {
      key: 'revenue',
      label: isAr ? 'إجمالي الإيرادات' : 'Total Revenue',
      value: kpis.total_revenue != null ? `$${kpis.total_revenue}` : '--',
    },
    {
      key: 'churned',
      label: isAr ? 'المستخدمون غير المجددين' : 'Churned Users',
      value: String(kpis.churned_users ?? 0),
    },
    {
      key: 'tamper',
      label: isAr ? 'تنبيهات العبث النشطة' : 'Active Tampering Alerts',
      value: String(kpis.active_tampering_alerts ?? 0),
    },
  ]

  const handleCreatePromo = async () => {
    if (!newPromoCode.trim()) return
    setSavingPromo(true)
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
      setNewPromoValue('10')
      setNewPromoPrivate(false)
      setNewPromoMaxUses('')
    } finally {
      setSavingPromo(false)
    }
  }

  const handleCreateLicense = async () => {
    if (!newLicenseExpiry) return
    setSavingLicense(true)
    try {
      const res = await createLicense({
        license_key: newLicenseKey.trim() || undefined,
        user_email: newLicenseEmail.trim() || undefined,
        plan: newLicensePlan,
        tier: newLicenseTier,
        expires_at: new Date(newLicenseExpiry).toISOString(),
      })
      setLicenses((prev) => [res.item, ...prev])
      setNewLicenseKey('')
      setNewLicenseEmail('')
      setNewLicenseExpiry('')
    } finally {
      setSavingLicense(false)
    }
  }

  const handlePatchLicense = async (id: string, status: AdminLicense['status']) => {
    const res = await patchLicenseStatus(id, status)
    setLicenses((prev) => prev.map((x) => (x.id === id ? res.item : x)))
  }

  const handleCreateOta = async () => {
    if (!newOtaVersion.trim() || !newOtaUrl.trim()) return
    setSavingOta(true)
    try {
      const res = await createOtaUpdate({
        version: newOtaVersion.trim(),
        channel: newOtaChannel.trim() || 'stable',
        release_notes: newOtaNotes.trim(),
        download_url: newOtaUrl.trim(),
        is_mandatory: newOtaMandatory,
        is_published: true,
      })
      setOtaUpdates((prev) => [res.item, ...prev])
      setNewOtaVersion('')
      setNewOtaUrl('')
      setNewOtaNotes('')
      setNewOtaMandatory(false)
    } finally {
      setSavingOta(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8">
      <section className="surface-card mb-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">{t.title}</h1>
            <p className="mt-1 text-sm text-white/65">{t.subtitle}</p>
          </div>
          <button className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold" onClick={handleCreateOta} disabled={savingOta}>
            {t.publish}
          </button>
        </div>
      </section>
      {error ? <section className="mb-6 rounded-xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</section> : null}
      {loading ? <section className="mb-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">Loading admin data...</section> : null}

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/70">{t.overview}</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {kpiCards.map((card) => (
            <article key={card.key} className="surface-card p-4">
              <div className="text-xs text-white/60">{card.label}</div>
              <div className="mt-2 text-2xl font-semibold text-white">{card.value}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-3">
        <article className="surface-card p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-white/85">{t.licenses}</h3>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-white/5 text-white/60">
                <tr>
                  <th className="px-3 py-2 text-start">License</th>
                  <th className="px-3 py-2 text-start">Plan</th>
                  <th className="px-3 py-2 text-start">Tier</th>
                  <th className="px-3 py-2 text-start">Status</th>
                  <th className="px-3 py-2 text-start">Actions</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((row) => (
                  <tr key={row.id} className="border-t border-white/10 text-white/80">
                    <td className="px-3 py-2">{row.license_key}</td>
                    <td className="px-3 py-2">{row.plan}</td>
                    <td className="px-3 py-2">{row.tier}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1" onClick={() => void handlePatchLicense(row.id, 'suspended')}>
                          {t.suspend}
                        </button>
                        <button
                          className="rounded-lg border border-rose-300/40 bg-rose-500/10 px-2.5 py-1 text-rose-200"
                          onClick={() => void handlePatchLicense(row.id, 'revoked')}
                        >
                          {t.revoke}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="surface-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-white/85">{t.activity}</h3>
          <ul className="space-y-2 text-sm text-white/75">
            {recentActivity.map((item, idx) => (
              <li key={`${idx}-${JSON.stringify(item)}`} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                {typeof item === 'string' ? item : JSON.stringify(item)}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <article className="surface-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-white/85">{t.promos}</h3>
          <div className="grid gap-3">
            <input
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
              placeholder="Code (e.g. PRIVATE-GROUP-2026)"
              value={newPromoCode}
              onChange={(e) => setNewPromoCode(e.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                value={newPromoType}
                onChange={(e) => setNewPromoType(e.target.value as 'percent' | 'fixed')}
              >
                <option value="percent">Percent</option>
                <option value="fixed">Fixed</option>
              </select>
              <input
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                placeholder="Value"
                value={newPromoValue}
                onChange={(e) => setNewPromoValue(e.target.value)}
              />
            </div>
            <input
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
              placeholder="Usage limit (optional)"
              value={newPromoMaxUses}
              onChange={(e) => setNewPromoMaxUses(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-white/75">
              <input type="checkbox" checked={newPromoPrivate} onChange={(e) => setNewPromoPrivate(e.target.checked)} />
              Tier 1 (Private) trigger
            </label>
            <button className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold" onClick={handleCreatePromo} disabled={savingPromo}>
              {t.save}
            </button>
            {promoCodes.length ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2 text-xs text-white/70">{promoCodes.length} promo codes loaded</div>
            ) : null}
          </div>
        </article>

        <article className="surface-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-white/85">{t.ota}</h3>
          <div className="grid gap-3">
            <input
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
              placeholder="Version (e.g. 2.5.0)"
              value={newOtaVersion}
              onChange={(e) => setNewOtaVersion(e.target.value)}
            />
            <input
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
              placeholder="Channel (stable/beta)"
              value={newOtaChannel}
              onChange={(e) => setNewOtaChannel(e.target.value)}
            />
            <input
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
              placeholder="Download URL"
              value={newOtaUrl}
              onChange={(e) => setNewOtaUrl(e.target.value)}
            />
            <textarea
              className="min-h-24 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
              placeholder="Release Notes"
              value={newOtaNotes}
              onChange={(e) => setNewOtaNotes(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-white/75">
              <input type="checkbox" checked={newOtaMandatory} onChange={(e) => setNewOtaMandatory(e.target.checked)} />
              Mandatory update
            </label>
            <button className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold" onClick={handleCreateOta} disabled={savingOta}>
              {t.publish}
            </button>
            {otaUpdates.length ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2 text-xs text-white/70">{otaUpdates.length} OTA records loaded</div>
            ) : null}
          </div>
        </article>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <article className="surface-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-white/85">{t.crashes}</h3>
          {crashes.map((crash) => {
            const expanded = expandedCrashId === crash.id
            return (
              <div key={crash.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/80">
                <div className="grid gap-1">
                  <div>{crash.happened_at}</div>
                  <div>{crash.user_id || '--'}</div>
                  <div>{crash.windows_version || '--'}</div>
                  <div>{[crash.cpu, crash.ram_gb ? `${crash.ram_gb}GB` : null, crash.gpu].filter(Boolean).join(' / ') || '--'}</div>
                  <div className="text-rose-200">{crash.error_type}</div>
                </div>
                <button
                  className="mt-2 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-xs"
                  onClick={() => setExpandedCrashId(expanded ? null : crash.id)}
                >
                  {expanded ? 'Hide Stack' : 'Show Stack'}
                </button>
                {expanded ? (
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-[#030712] p-3 text-xs leading-5 text-white/75">
                    {crash.stack_trace}
                  </pre>
                ) : null}
              </div>
            )
          })}
        </article>

        <article className="surface-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-white/85">{t.security}</h3>
          <div className="rounded-xl border border-amber-300/35 bg-amber-400/10 p-3 text-sm text-amber-100">
            HWID mismatch detected for license ST-LIC-992
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded-xl border border-rose-300/45 bg-rose-500/12 px-3 py-2 text-sm font-semibold text-rose-100">
              Disable Subscription
            </button>
            <button className="rounded-xl border border-rose-300/45 bg-rose-500/12 px-3 py-2 text-sm font-semibold text-rose-100">
              Ban HWID
            </button>
          </div>
        </article>
      </section>

      <section className="surface-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-white/85">{t.users}</h3>
        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            placeholder="License key"
            value={newLicenseKey}
            onChange={(e) => setNewLicenseKey(e.target.value)}
          />
          <input
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            placeholder="User email (optional)"
            value={newLicenseEmail}
            onChange={(e) => setNewLicenseEmail(e.target.value)}
          />
          <select
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            value={newLicensePlan}
            onChange={(e) => setNewLicensePlan(e.target.value as 'monthly' | 'yearly')}
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <select
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            value={newLicenseTier}
            onChange={(e) => setNewLicenseTier(e.target.value as 'public' | 'private')}
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          <input
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            type="datetime-local"
            value={newLicenseExpiry}
            onChange={(e) => setNewLicenseExpiry(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <button className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold" onClick={handleCreateLicense} disabled={savingLicense}>
            Create License
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-white/5 text-white/60">
              <tr>
                <th className="px-3 py-2 text-start">License ID</th>
                <th className="px-3 py-2 text-start">Email</th>
                <th className="px-3 py-2 text-start">Plan</th>
                <th className="px-3 py-2 text-start">Tier</th>
                <th className="px-3 py-2 text-start">Expires</th>
                <th className="px-3 py-2 text-start">Status</th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((row) => (
                <tr key={row.id} className="border-t border-white/10 text-white/80">
                  <td className="px-3 py-2">{row.id}</td>
                  <td className="px-3 py-2">{row.user_email || '--'}</td>
                  <td className="px-3 py-2">{row.plan}</td>
                  <td className="px-3 py-2">{row.tier}</td>
                  <td className="px-3 py-2">{row.expires_at}</td>
                  <td className="px-3 py-2">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

