import { useEffect, useMemo, useState } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { fetchAccountSubscription, type AccountSubscription } from '../api/account'
import { firebaseAuth } from '../lib/firebase'

type AccountPageProps = {
  lang: 'en' | 'ar'
}

function formatRemaining(expiresAt?: string) {
  if (!expiresAt) return '--'
  const diff = Date.parse(expiresAt) - Date.now()
  if (!Number.isFinite(diff)) return '--'
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  return days > 0 ? `${days} days${hours > 0 ? `, ${hours} hours` : ''}` : `${Math.max(1, hours)} hours`
}

export function AccountPage({ lang }: AccountPageProps) {
  const isAr = lang === 'ar'
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [account, setAccount] = useState<AccountSubscription | null>(null)
  const [error, setError] = useState('')

  const t = useMemo(
    () =>
      isAr
        ? {
            title: 'حساب Saturn Workspace',
            subtitle: 'سجل دخولك أو أنشئ حسابًا باستخدام Google. في مرحلة البيتا يتم منح الاشتراك التجريبي من لوحة الأدمن.',
            signIn: 'تسجيل دخول / إنشاء حساب Google',
            signOut: 'تسجيل الخروج',
            signedIn: 'الحساب الحالي',
            subscription: 'الاشتراك',
            active: 'نشط',
            noSubscription: 'لا يوجد اشتراك نشط على هذا الحساب. أرسل بريد الحساب للدعم أو انتظر منحه اشتراكًا تجريبيًا من لوحة الأدمن.',
            requestBeta: 'طلب تفعيل تجريبي',
            openTool: 'بعد منح التفعيل التجريبي افتح الأداة وسجل بنفس حساب Google.',
            refresh: 'تحديث الحالة',
            plan: 'الخطة',
            tier: 'الباقة',
            remaining: 'المتبقي',
          }
        : {
            title: 'Saturn Workspace Account',
            subtitle: 'Sign in or create an account with Google. During beta, subscriptions are granted manually from the admin dashboard.',
            signIn: 'Sign in / create account with Google',
            signOut: 'Sign out',
            signedIn: 'Current account',
            subscription: 'Subscription',
            active: 'Active',
            noSubscription: 'No active subscription is linked to this account. Send this account email to support or wait for a beta subscription to be granted from the admin dashboard.',
            requestBeta: 'Request beta access',
            openTool: 'After beta access is granted, open the desktop app and sign in with the same Google account.',
            refresh: 'Refresh status',
            plan: 'Plan',
            tier: 'Tier',
            remaining: 'Remaining',
          },
    [isAr],
  )

  async function refreshAccount(nextUser = user) {
    if (!nextUser) {
      setAccount(null)
      return
    }
    setChecking(true)
    setError('')
    try {
      const token = await nextUser.getIdToken(true)
      setAccount(await fetchAccountSubscription(token))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'account_check_failed')
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    const stop = onAuthStateChanged(firebaseAuth, async (nextUser) => {
      setUser(nextUser)
      setLoading(false)
      await refreshAccount(nextUser)
    })
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSignIn() {
    setError('')
    try {
      const result = await signInWithPopup(firebaseAuth, new GoogleAuthProvider())
      setUser(result.user)
      await refreshAccount(result.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login_failed')
    }
  }

  async function handleSignOut() {
    await signOut(firebaseAuth)
    setUser(null)
    setAccount(null)
  }

  const subscription = account?.subscription

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-5 py-12">
      <section className="surface-card w-full p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">{t.title}</h1>
            <p className="mt-2 text-sm leading-6 text-white/65">{t.subtitle}</p>
          </div>
          <a className="rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90" href="/">
            Saturn Workspace
          </a>
        </div>

        {loading ? <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">Loading...</div> : null}
        {error ? <div className="mt-6 rounded-xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}

        {!user ? (
          <div className="mt-8">
            <button className="btn-primary rounded-xl px-5 py-3 text-sm font-semibold" onClick={() => void handleSignIn()}>
              {t.signIn}
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/45">{t.signedIn}</div>
              <div className="mt-2 text-lg font-semibold text-white">{user.email}</div>
              <div className="mt-1 text-sm text-white/55">{user.uid}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/85" onClick={() => void refreshAccount()}>
                  {checking ? 'Checking...' : t.refresh}
                </button>
                <button className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/85" onClick={() => void handleSignOut()}>
                  {t.signOut}
                </button>
              </div>
            </article>

            <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/45">{t.subscription}</div>
              {subscription ? (
                <div className="mt-3 grid gap-2 text-sm text-white/75">
                  <div className="text-lg font-semibold text-emerald-100">{t.active}</div>
                  <div>{t.plan}: {subscription.plan || '--'}</div>
                  <div>{t.tier}: {subscription.tier || 'public'}</div>
                  <div>{t.remaining}: {formatRemaining(subscription.expires_at)}</div>
                  <p className="pt-2 text-xs leading-5 text-white/55">{t.openTool}</p>
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-sm leading-6 text-white/70">{t.noSubscription}</p>
                  <div className="mt-4 grid gap-2">
                    <a
                      className="btn-primary rounded-xl px-4 py-2 text-center text-sm font-semibold"
                      href={`mailto:support@saturnws.com?subject=Saturn%20Workspace%20Beta%20Access&body=${encodeURIComponent(user.email || '')}`}
                    >
                      {t.requestBeta}
                    </a>
                    <button className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/85" onClick={() => void refreshAccount()}>
                      {checking ? 'Checking...' : t.refresh}
                    </button>
                  </div>
                </div>
              )}
            </article>
          </div>
        )}
      </section>
    </main>
  )
}
