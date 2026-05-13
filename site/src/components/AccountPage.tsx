import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { onAuthStateChanged, sendPasswordResetEmail, signOut, updateProfile, type User } from 'firebase/auth'
import { fetchAccountSubscription, type AccountSubscription } from '../api/account'
import { firebaseAuth } from '../lib/firebase'

type AccountPageProps = {
  lang: 'en' | 'ar'
}

function formatDate(value: string | undefined, locale: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function formatDateTime(value: string | undefined, locale: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDaysRemaining(value: string | undefined) {
  if (!value) return '--'
  const diff = Date.parse(value) - Date.now()
  if (!Number.isFinite(diff) || diff <= 0) return '0'
  return String(Math.ceil(diff / 86_400_000))
}

function deriveAuthProviders(user: User | null, isAr: boolean) {
  const ids = new Set((user?.providerData || []).map((provider) => provider.providerId).filter(Boolean))
  if (ids.size === 0) return [isAr ? 'غير معروف' : 'Unknown']
  return Array.from(ids).map((providerId) => {
    switch (providerId) {
      case 'google.com':
        return 'Google'
      case 'password':
        return isAr ? 'البريد وكلمة المرور' : 'Email/password'
      case 'emailLink':
        return isAr ? 'رابط البريد' : 'Email link'
      default:
        return providerId
    }
  })
}

function getInitials(user: User | null) {
  const source = String(user?.displayName || user?.email || 'S').trim()
  if (!source) return 'S'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function statusBadge(status: string | undefined, lang: 'en' | 'ar') {
  const isAr = lang === 'ar'
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'active') {
    return {
      label: isAr ? 'نشط' : 'Active',
      className: 'border-emerald-400/24 bg-emerald-500/12 text-emerald-100',
    }
  }
  if (normalized === 'subscription_required' || normalized === 'subscription_not_found' || !normalized) {
    return {
      label: isAr ? 'غير مشترك' : 'No subscription',
      className: 'border-amber-400/24 bg-amber-500/12 text-amber-100',
    }
  }
  if (normalized === 'subscription_expired') {
    return {
      label: isAr ? 'منتهي' : 'Expired',
      className: 'border-amber-400/24 bg-amber-500/12 text-amber-100',
    }
  }
  if (normalized === 'subscription_inactive' || normalized === 'suspended') {
    return {
      label: isAr ? 'غير نشط' : 'Inactive',
      className: 'border-rose-400/24 bg-rose-500/12 text-rose-100',
    }
  }
  return {
    label: normalized,
    className: 'border-white/12 bg-white/[0.06] text-white/84',
  }
}

function browserSessionLabel(isAr: boolean) {
  if (typeof navigator === 'undefined') return isAr ? 'هذه الجلسة' : 'Current session'
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return isAr ? 'Windows - الجلسة الحالية' : 'Windows - Current session'
  if (/Mac OS/i.test(ua)) return isAr ? 'macOS - الجلسة الحالية' : 'macOS - Current session'
  if (/Linux/i.test(ua)) return isAr ? 'Linux - الجلسة الحالية' : 'Linux - Current session'
  return isAr ? 'الجلسة الحالية' : 'Current session'
}

function FieldRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-center">
      <div className="text-sm text-slate-400/76">{label}</div>
      <div className={`text-sm text-white ${mono ? 'font-medium tracking-wide' : ''}`}>{value}</div>
    </div>
  )
}

function SectionCard({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section id={id} className="surface-card rounded-[28px] p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-7 text-slate-300/68">{description}</p>
      </div>
      {children}
    </section>
  )
}

function AccountSkeleton() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="animate-pulse space-y-6">
        <div className="space-y-3">
          <div className="h-9 w-40 rounded-xl bg-white/8" />
          <div className="h-5 w-96 max-w-full rounded-xl bg-white/6" />
        </div>
        <div className="surface-card rounded-[28px] p-6">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-white/8" />
            <div className="flex-1 space-y-3">
              <div className="h-6 w-56 rounded-xl bg-white/8" />
              <div className="h-4 w-72 max-w-full rounded-xl bg-white/6" />
              <div className="h-4 w-40 rounded-xl bg-white/6" />
            </div>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-6">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="surface-card rounded-[28px] p-6">
                <div className="h-6 w-48 rounded-xl bg-white/8" />
                <div className="mt-3 h-4 w-80 max-w-full rounded-xl bg-white/6" />
                <div className="mt-6 space-y-3">
                  <div className="h-11 rounded-2xl bg-white/6" />
                  <div className="h-11 rounded-2xl bg-white/6" />
                  <div className="h-11 rounded-2xl bg-white/6" />
                </div>
              </div>
            ))}
          </div>
          <div className="surface-card rounded-[28px] p-5">
            <div className="space-y-3">
              <div className="h-4 w-24 rounded-xl bg-white/8" />
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-10 rounded-2xl bg-white/6" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

export function AccountPage({ lang }: AccountPageProps) {
  const isAr = lang === 'ar'
  const locale = isAr ? 'ar-EG' : 'en-GB'
  const [user, setUser] = useState<User | null>(firebaseAuth.currentUser)
  const [authReady, setAuthReady] = useState(Boolean(firebaseAuth.currentUser))
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<AccountSubscription | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [displayName, setDisplayName] = useState(firebaseAuth.currentUser?.displayName || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')

  const t = useMemo(
    () =>
      isAr
        ? {
            header: 'الحساب',
            subtitle: 'إدارة بيانات حسابك، الاشتراك، الأمان، وإعدادات الوصول.',
            overview: 'ملخص الحساب',
            profile: 'الملف الشخصي',
            profileDesc: 'عدل الاسم الظاهر وراجع بيانات الهوية الأساسية لهذا الحساب.',
            subscription: 'الاشتراك والفوترة',
            subscriptionDesc: 'اعرض حالة اشتراكك الحالية وما هو متاح خلال مرحلة البيتا.',
            security: 'الأمان',
            securityDesc: 'راجع طريقة تسجيل الدخول، إعادة تعيين كلمة المرور، وآخر نشاط معروف.',
            sessions: 'الجلسات والأجهزة',
            sessionsDesc: 'راجع الجلسة الحالية وما هو مدعوم فعليًا في إدارة الوصول.',
            notifications: 'الإشعارات',
            notificationsDesc: 'إعدادات التنبيهات المستقبلية. الحفظ الكامل غير مدعوم حاليًا.',
            privacy: 'البيانات والخصوصية',
            privacyDesc: 'الوصول إلى الصفحات القانونية وطلبات البيانات والحذف.',
            danger: 'منطقة الخطر',
            dangerDesc: 'إجراءات حساسة لا يمكن تنفيذها تلقائيًا بدون دعم backend صريح.',
            displayName: 'الاسم الظاهر',
            email: 'البريد الإلكتروني',
            emailReadOnly: 'البريد الحالي مرتبط بطبقة المصادقة ولا يدعم تعديله من هذه الصفحة حاليًا.',
            changePhoto: 'تغيير الصورة',
            comingSoon: 'سيتوفر لاحقًا',
            save: 'حفظ التغييرات',
            saving: 'جار الحفظ...',
            saved: 'تم حفظ التغييرات.',
            active: 'نشط',
            verified: 'موثّق',
            unverified: 'غير موثّق',
            authType: 'طريقة الدخول',
            signOut: 'تسجيل الخروج',
            currentPlan: 'الخطة الحالية',
            subscriptionStatus: 'حالة الاشتراك',
            expiresAt: 'تاريخ الانتهاء',
            daysRemaining: 'الأيام المتبقية',
            tier: 'الفئة',
            betaManual: 'أنت ضمن مرحلة بيتا. تتم إدارة الاشتراكات يدويًا من لوحة الإدارة حاليًا.',
            noSubscription: 'لم يتم تعيين خطة اشتراك نشطة لهذا الحساب بعد.',
            requestSubscription: 'طلب اشتراك تجريبي',
            invoices: 'الفواتير',
            noInvoices: 'لا توجد فواتير متاحة حتى الآن.',
            passwordManagedByGoogle: 'هذا الحساب يستخدم تسجيل الدخول عبر Google. تتم إدارة كلمة المرور من حساب Google.',
            resetPassword: 'إعادة تعيين كلمة المرور',
            providers: 'طرق الدخول المرتبطة',
            createdAt: 'تاريخ إنشاء الحساب',
            lastSignIn: 'آخر تسجيل دخول',
            twoFactor: 'المصادقة الثنائية',
            twoFactorUnavailable: 'المصادقة الثنائية غير متاحة حاليًا.',
            currentSession: 'الجلسة الحالية',
            sessionUnavailable: 'لا تتوفر إدارة الجلسات المتعددة حاليًا.',
            logoutCurrent: 'تسجيل خروج هذه الجلسة',
            logoutAll: 'تسجيل الخروج من جميع الأجهزة',
            logoutAllUnavailable: 'إلغاء الجلسات الأخرى يحتاج endpoint مخصص وغير متاح بعد.',
            emailAlerts: 'إشعارات البريد',
            subscriptionAlerts: 'تنبيهات الاشتراك',
            securityAlerts: 'تنبيهات الأمان',
            productUpdates: 'تحديثات المنتج',
            settingsUnavailable: 'حفظ تفضيلات الإشعارات غير مدعوم حاليًا.',
            terms: 'شروط الاستخدام',
            privacyPolicy: 'سياسة الخصوصية',
            cookies: 'سياسة ملفات تعريف الارتباط',
            acceptableUse: 'سياسة الاستخدام المقبول',
            refund: 'سياسة الاسترداد',
            contact: 'التواصل القانوني',
            exportData: 'تصدير بياناتي',
            exportUnavailable: 'تصدير البيانات من الموقع غير مدعوم حاليًا.',
            requestData: 'طلب نسخة من بياناتي',
            deleteAccount: 'طلب حذف الحساب',
            deleteUnavailable: 'الحذف المباشر غير مدعوم حاليًا. يمكنك إرسال طلب حذف للإدارة.',
            deleteConfirmLabel: 'اكتب "حذف" للمتابعة',
            deleteConfirmValue: 'حذف',
            cancel: 'إلغاء',
            sendRequest: 'إرسال الطلب',
            retry: 'إعادة المحاولة',
            loadError: 'تعذر تحميل بيانات الحساب.',
            accountStatus: 'حالة الحساب',
          }
        : {
            header: 'Account',
            subtitle: 'Manage your profile, subscription, security, and access settings.',
            overview: 'Account overview',
            profile: 'Profile',
            profileDesc: 'Update your display name and review the primary identity details for this account.',
            subscription: 'Subscription & billing',
            subscriptionDesc: 'Review your current access status and what is available during beta.',
            security: 'Security',
            securityDesc: 'Review sign-in methods, password reset, and the latest known activity.',
            sessions: 'Sessions & devices',
            sessionsDesc: 'Review the current session and what is actually supported for access control.',
            notifications: 'Notifications',
            notificationsDesc: 'Future alert preferences. Full persistence is not supported yet.',
            privacy: 'Data & privacy',
            privacyDesc: 'Legal pages, data requests, and deletion requests.',
            danger: 'Danger zone',
            dangerDesc: 'Sensitive actions that cannot run automatically without explicit backend support.',
            displayName: 'Display name',
            email: 'Email address',
            emailReadOnly: 'The current email is bound to the auth layer and cannot be changed from this page yet.',
            changePhoto: 'Change photo',
            comingSoon: 'Coming soon',
            save: 'Save changes',
            saving: 'Saving...',
            saved: 'Changes saved successfully.',
            active: 'Active',
            verified: 'Verified',
            unverified: 'Unverified',
            authType: 'Sign-in method',
            signOut: 'Sign out',
            currentPlan: 'Current plan',
            subscriptionStatus: 'Subscription status',
            expiresAt: 'Expires on',
            daysRemaining: 'Days remaining',
            tier: 'Tier',
            betaManual: 'You are currently in beta. Subscriptions are managed manually from the admin dashboard.',
            noSubscription: 'No active subscription has been assigned to this account yet.',
            requestSubscription: 'Request beta subscription',
            invoices: 'Invoices',
            noInvoices: 'No invoices are available yet.',
            passwordManagedByGoogle: 'This account signs in with Google. Password changes are managed from the Google account.',
            resetPassword: 'Reset password',
            providers: 'Connected sign-in methods',
            createdAt: 'Account created',
            lastSignIn: 'Last sign-in',
            twoFactor: 'Two-factor authentication',
            twoFactorUnavailable: 'Two-factor authentication is not available yet.',
            currentSession: 'Current session',
            sessionUnavailable: 'Multi-session management is not available yet.',
            logoutCurrent: 'Sign out this session',
            logoutAll: 'Sign out all devices',
            logoutAllUnavailable: 'Revoking other sessions needs a dedicated endpoint and is not available yet.',
            emailAlerts: 'Email alerts',
            subscriptionAlerts: 'Subscription alerts',
            securityAlerts: 'Security alerts',
            productUpdates: 'Product updates',
            settingsUnavailable: 'Notification preferences are not persisted yet.',
            terms: 'Terms of Use',
            privacyPolicy: 'Privacy Policy',
            cookies: 'Cookie Policy',
            acceptableUse: 'Acceptable Use Policy',
            refund: 'Refund Policy',
            contact: 'Legal contact',
            exportData: 'Export my data',
            exportUnavailable: 'Website-side data export is not supported yet.',
            requestData: 'Request a copy of my data',
            deleteAccount: 'Request account deletion',
            deleteUnavailable: 'Direct account deletion is not supported yet. You can send a deletion request to the team.',
            deleteConfirmLabel: 'Type "delete" to continue',
            deleteConfirmValue: 'delete',
            cancel: 'Cancel',
            sendRequest: 'Send request',
            retry: 'Retry',
            loadError: 'Could not load account data.',
            accountStatus: 'Account status',
          },
    [isAr],
  )

  const subscription = account?.subscription || null
  const subscriptionState = statusBadge(account?.status, lang)
  const emailState = user?.emailVerified ? t.verified : t.unverified
  const emailStateClass = user?.emailVerified
    ? 'border-emerald-400/24 bg-emerald-500/12 text-emerald-100'
    : 'border-amber-400/24 bg-amber-500/12 text-amber-100'
  const providers = deriveAuthProviders(user, isAr)
  const passwordSupported = (user?.providerData || []).some((provider) => provider.providerId === 'password')
  const accountInitials = getInitials(user)
  const accountName = String(displayName || user?.displayName || user?.email || '').trim() || 'Saturn User'

  async function loadAccount(nextUser: User) {
    setLoading(true)
    setError('')
    try {
      const token = await nextUser.getIdToken(true)
      const payload = await fetchAccountSubscription(token)
      setAccount(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadError)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const stop = onAuthStateChanged(firebaseAuth, async (nextUser) => {
      setAuthReady(true)
      setUser(nextUser)
      setDisplayName(nextUser?.displayName || '')
      if (!nextUser) {
        setLoading(false)
        window.location.replace('/account/signin')
        return
      }
      await loadAccount(nextUser)
    })
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleProfileSave() {
    const currentUser = firebaseAuth.currentUser
    if (!currentUser) return
    setSavingProfile(true)
    setNotice('')
    setError('')
    try {
      await updateProfile(currentUser, { displayName: displayName.trim() || null })
      await currentUser.reload()
      setUser(firebaseAuth.currentUser)
      setNotice(t.saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadError)
    } finally {
      setSavingProfile(false)
    }
  }

  async function handlePasswordReset() {
    if (!user?.email) return
    setResetLoading(true)
    setNotice('')
    setError('')
    try {
      await sendPasswordResetEmail(firebaseAuth, user.email)
      setNotice(isAr ? 'تم إرسال رابط إعادة التعيين إلى بريدك.' : 'A reset link was sent to your email.')
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadError)
    } finally {
      setResetLoading(false)
    }
  }

  async function handleSignOut() {
    await signOut(firebaseAuth).catch(() => undefined)
    window.location.replace('/account/signin')
  }

  function openMailRequest(subject: string, body: string) {
    const mail = `mailto:legal@saturnws.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = mail
  }

  if (!authReady || loading) {
    return <AccountSkeleton />
  }

  if (!user) {
    return null
  }

  if (error && !account) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-10 sm:px-6">
        <div className="surface-card rounded-[28px] p-6 text-center">
          <h1 className="text-2xl font-bold text-white">{t.loadError}</h1>
          <p className="mt-3 text-sm text-slate-300/72">{error}</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button className="btn-primary rounded-2xl px-4 py-2 text-sm font-semibold" onClick={() => void loadAccount(user)}>
              {t.retry}
            </button>
            <button
              className="rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white"
              onClick={() => void handleSignOut()}
            >
              {t.signOut}
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 space-y-2">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">{t.header}</h1>
        <p className="max-w-3xl text-sm leading-7 text-slate-300/72">{t.subtitle}</p>
      </header>

      {notice ? (
        <div className="mb-6 rounded-2xl border border-emerald-400/24 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div>
      ) : null}
      {error && account ? (
        <div className="mb-6 rounded-2xl border border-rose-400/24 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
      ) : null}

      <section className="surface-card mb-6 rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {user.photoURL ? (
              <img src={user.photoURL} alt={accountName} className="h-20 w-20 rounded-full border border-white/12 object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-2xl font-bold text-white">
                {accountInitials}
              </div>
            )}
            <div className="space-y-3">
              <div>
                <div className="text-2xl font-bold text-white">{accountName}</div>
                <div className="mt-1 text-sm text-slate-300/76" dir="ltr">
                  {user.email}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${emailStateClass}`}>{emailState}</span>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${subscriptionState.className}`}>{subscriptionState.label}</span>
                <span className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/84">
                  {providers.join(' + ')}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:border-white/18 hover:bg-white/[0.08]"
              onClick={() => void loadAccount(user)}
            >
              {isAr ? 'تحديث البيانات' : 'Refresh data'}
            </button>
            <button
              type="button"
              className="rounded-2xl border border-rose-400/24 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-400/36 hover:bg-rose-500/14"
              onClick={() => void handleSignOut()}
            >
              {t.signOut}
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-6">
          <SectionCard id="profile" title={t.profile} description={t.profileDesc}>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-200/84">{t.displayName}</label>
                <input
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-slate-400/60 focus:border-sky-400/38 focus:bg-white/[0.07]"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={isAr ? 'اسمك الظاهر' : 'Your display name'}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-200/84">{t.email}</label>
                <input
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm text-slate-300/78 outline-none"
                  value={user.email || ''}
                  disabled
                  dir="ltr"
                />
                <p className="text-xs leading-6 text-slate-400/68">{t.emailReadOnly}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn-primary rounded-2xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-65"
                  onClick={() => void handleProfileSave()}
                  disabled={savingProfile || displayName.trim() === String(user.displayName || '').trim()}
                >
                  {savingProfile ? t.saving : t.save}
                </button>
                <button
                  type="button"
                  className="cursor-not-allowed rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-300/66"
                  disabled
                  title={t.comingSoon}
                >
                  {t.changePhoto}
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard id="subscription" title={t.subscription} description={t.subscriptionDesc}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-lg font-bold text-white">
                    {subscription?.plan ? String(subscription.plan).replace(/^./, (value) => value.toUpperCase()) : '--'}
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${subscriptionState.className}`}>
                    {subscriptionState.label}
                  </span>
                </div>
                <div className="space-y-3">
                  <FieldRow label={t.currentPlan} value={subscription?.plan || '--'} />
                  <FieldRow label={t.subscriptionStatus} value={subscriptionState.label} />
                  <FieldRow label={t.tier} value={String(subscription?.tier || 'public')} />
                  <FieldRow label={t.expiresAt} value={formatDate(subscription?.expires_at, locale)} />
                  <FieldRow label={t.daysRemaining} value={formatDaysRemaining(subscription?.expires_at)} />
                </div>
                <div className="rounded-2xl border border-sky-400/14 bg-sky-400/8 px-4 py-3 text-sm leading-7 text-sky-100/88">
                  {t.betaManual}
                </div>
                {!subscription ? (
                  <div className="rounded-2xl border border-amber-400/18 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{t.noSubscription}</div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <a
                    className="btn-primary inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold"
                    href="mailto:support@saturnws.com?subject=Beta%20subscription%20request"
                  >
                    {t.requestSubscription}
                  </a>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-sm font-semibold text-white">{t.invoices}</div>
                <p className="mt-2 text-sm leading-7 text-slate-300/68">{t.noInvoices}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard id="security" title={t.security} description={t.securityDesc}>
            <div className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-sm font-semibold text-white">{t.providers}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {providers.map((provider) => (
                    <span
                      key={provider}
                      className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/84"
                    >
                      {provider}
                    </span>
                  ))}
                </div>
              </div>

              {passwordSupported ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm leading-7 text-slate-300/76">
                      {isAr ? 'يمكنك إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الحالي.' : 'You can send a password reset link to your current email address.'}
                    </div>
                    <button
                      type="button"
                      className="rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:border-white/18 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-65"
                      onClick={() => void handlePasswordReset()}
                      disabled={resetLoading}
                    >
                      {resetLoading ? (isAr ? 'جار الإرسال...' : 'Sending...') : t.resetPassword}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-7 text-slate-300/76">
                  {t.passwordManagedByGoogle}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-sm font-semibold text-white">{t.createdAt}</div>
                  <div className="mt-2 text-sm text-slate-300/76">{formatDateTime(user.metadata.creationTime, locale)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-sm font-semibold text-white">{t.lastSignIn}</div>
                  <div className="mt-2 text-sm text-slate-300/76">{formatDateTime(user.metadata.lastSignInTime, locale)}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-sm font-semibold text-white">{t.twoFactor}</div>
                <div className="mt-2 text-sm text-slate-300/76">{t.twoFactorUnavailable}</div>
              </div>
            </div>
          </SectionCard>

          <SectionCard id="sessions" title={t.sessions} description={t.sessionsDesc}>
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">{browserSessionLabel(isAr)}</div>
                    <div className="mt-2 text-sm text-slate-300/76">
                      {typeof window !== 'undefined' ? window.location.hostname : 'saturnws.com'}
                    </div>
                    <div className="mt-1 text-xs text-slate-400/68">{t.sessionUnavailable}</div>
                  </div>
                  <button
                    type="button"
                    className="rounded-2xl border border-rose-400/24 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-400/36 hover:bg-rose-500/14"
                    onClick={() => void handleSignOut()}
                  >
                    {t.logoutCurrent}
                  </button>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm leading-7 text-slate-300/76">{t.logoutAllUnavailable}</div>
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-300/66"
                  >
                    {t.logoutAll}
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard id="notifications" title={t.notifications} description={t.notificationsDesc}>
            <div className="grid gap-3 sm:grid-cols-2">
              {[t.emailAlerts, t.subscriptionAlerts, t.securityAlerts, t.productUpdates].map((label) => (
                <label key={label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <span className="text-sm text-white/84">{label}</span>
                  <input type="checkbox" disabled className="h-4 w-4 cursor-not-allowed accent-blue-500 opacity-55" />
                </label>
              ))}
            </div>
            <p className="mt-4 text-xs leading-6 text-slate-400/68">{t.settingsUnavailable}</p>
          </SectionCard>

          <SectionCard id="privacy" title={t.privacy} description={t.privacyDesc}>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <a className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:border-white/16 hover:bg-white/[0.07]" href="/terms/">
                  {t.terms}
                </a>
                <a className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:border-white/16 hover:bg-white/[0.07]" href="/privacy/">
                  {t.privacyPolicy}
                </a>
                <a className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:border-white/16 hover:bg-white/[0.07]" href="/cookies/">
                  {t.cookies}
                </a>
                <a className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:border-white/16 hover:bg-white/[0.07]" href="/acceptable-use/">
                  {t.acceptableUse}
                </a>
                <a className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:border-white/16 hover:bg-white/[0.07]" href="/refund/">
                  {t.refund}
                </a>
                <a className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:border-white/16 hover:bg-white/[0.07]" href="/contact/">
                  {t.contact}
                </a>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-300/66"
                  title={t.exportUnavailable}
                >
                  {t.exportData}
                </button>
                <a
                  className="rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:border-white/18 hover:bg-white/[0.08]"
                  href={`mailto:legal@saturnws.com?subject=${encodeURIComponent(isAr ? 'طلب نسخة من بياناتي' : 'Request a copy of my data')}`}
                >
                  {t.requestData}
                </a>
              </div>
            </div>
          </SectionCard>

          <SectionCard id="danger" title={t.danger} description={t.dangerDesc}>
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4">
              <div className="text-sm leading-7 text-rose-100/92">{t.deleteUnavailable}</div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-2xl border border-rose-400/30 bg-rose-500/14 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-400/42 hover:bg-rose-500/18"
                  onClick={() => {
                    setDeleteConfirm('')
                    setDeleteModalOpen(true)
                  }}
                >
                  {t.deleteAccount}
                </button>
              </div>
            </div>
          </SectionCard>
        </div>

        <aside className="surface-card h-fit rounded-[28px] p-5 lg:sticky lg:top-24">
          <div className="text-sm font-semibold text-white">{t.overview}</div>
          <nav className="mt-4 grid gap-2 text-sm">
            {[
              ['profile', t.profile],
              ['subscription', t.subscription],
              ['security', t.security],
              ['sessions', t.sessions],
              ['notifications', t.notifications],
              ['privacy', t.privacy],
              ['danger', t.danger],
            ].map(([href, label]) => (
              <a
                key={href}
                href={`#${href}`}
                className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-white/84 transition hover:border-white/14 hover:bg-white/[0.07]"
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>
      </div>

      {deleteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/78 px-4 backdrop-blur-sm">
          <div className="surface-card w-full max-w-md rounded-[28px] p-6">
            <h2 className="text-xl font-bold text-white">{t.deleteAccount}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300/74">{t.deleteUnavailable}</p>
            <p className="mt-3 text-sm text-slate-300/74">{t.deleteConfirmLabel}</p>
            <input
              className="mt-4 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-slate-400/60 focus:border-sky-400/38 focus:bg-white/[0.07]"
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder={t.deleteConfirmValue}
              dir={isAr ? 'rtl' : 'ltr'}
            />
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white"
                onClick={() => setDeleteModalOpen(false)}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                className="rounded-2xl border border-rose-400/30 bg-rose-500/14 px-4 py-2 text-sm font-semibold text-rose-100 disabled:cursor-not-allowed disabled:opacity-55"
                disabled={deleteConfirm.trim() !== t.deleteConfirmValue}
                onClick={() => {
                  openMailRequest(
                    isAr ? 'طلب حذف الحساب' : 'Account deletion request',
                    `${isAr ? 'البريد:' : 'Email:'} ${user.email || ''}\n${isAr ? 'المعرف:' : 'UID:'} ${user.uid}`,
                  )
                  setDeleteModalOpen(false)
                }}
              >
                {t.sendRequest}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
