import { type FormEvent, useMemo, useState } from 'react'
import { GoogleAuthProvider, signInWithPopup, signOut, type User } from 'firebase/auth'
import { firebaseAuth } from '../lib/firebase'

type DeviceActivationProps = {
  lang: 'en' | 'ar'
}

const AUTH_BASE = 'https://auth.saturnws.com'

function initialCode() {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('code')?.trim().toUpperCase() || ''
}

export function DeviceActivation({ lang }: DeviceActivationProps) {
  const isAr = lang === 'ar'
  const [user, setUser] = useState<User | null>(null)
  const [userCode, setUserCode] = useState(initialCode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const t = useMemo(
    () =>
      isAr
        ? {
            title: 'ربط الأداة بالحساب',
            subtitle: 'سجل دخولك أو أنشئ حسابًا بنفس Google الذي سيتم منحه اشتراك Saturn Workspace التجريبي.',
            login: 'تسجيل الدخول / إنشاء حساب Google',
            logout: 'تسجيل الخروج',
            userCode: 'كود الجهاز',
            submit: 'ربط الجهاز',
            working: 'جارٍ الربط...',
            success: 'تم ربط الجهاز بالاشتراك. ارجع إلى الأداة وسيتم فتحها تلقائيًا.',
            failed: 'فشل ربط الجهاز.',
            noSubscription: 'لا يوجد اشتراك نشط لهذا الحساب. سيتم فتح الأداة برسالة توضح أن الحساب يحتاج اشتراكًا تجريبيًا من لوحة الأدمن.',
          }
        : {
            title: 'Link Tool To Account',
            subtitle: 'Sign in or create an account with the Google account that will receive the Saturn Workspace beta subscription.',
            login: 'Sign in / create account with Google',
            logout: 'Sign out',
            userCode: 'Device code',
            submit: 'Link device',
            working: 'Linking...',
            success: 'Device linked to your subscription. Return to the tool; it will open automatically.',
            failed: 'Could not link this device.',
            noSubscription: 'No active subscription is linked to this account. The tool will show that this account needs a beta subscription from the admin dashboard.',
          },
    [isAr],
  )

  async function handleLogin() {
    setError('')
    const result = await signInWithPopup(firebaseAuth, new GoogleAuthProvider())
    setUser(result.user)
    if (userCode.trim()) {
      await completeDeviceLink(result.user)
    }
  }

  async function handleLogout() {
    setUser(null)
    await signOut(firebaseAuth).catch(() => undefined)
  }

  async function completeDeviceLink(nextUser: User) {
    if (!nextUser || busy) return
    setBusy(true)
    setError('')
    setDone(false)
    try {
      const idToken = await nextUser.getIdToken(true)
      const response = await fetch(`${AUTH_BASE}/device/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_token: idToken,
          user_code: userCode.trim().toUpperCase(),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        const errorCode = payload?.error || `request_failed_${response.status}`
        const subscriptionErrors = new Set([
          'subscription_required',
          'subscription_not_found',
          'subscription_expired',
          'subscription_inactive',
          'subscription_missing',
          'subscription_hwid_mismatch',
          'subscription_user_mismatch',
          'subscription_email_mismatch',
        ])
        throw new Error(subscriptionErrors.has(errorCode) ? t.noSubscription : errorCode)
      }
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failed)
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || busy) return
    await completeDeviceLink(user)
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4 py-10">
      <section className="surface-card w-full p-6">
        <h1 className="text-2xl font-bold text-white">{t.title}</h1>
        <p className="mt-2 text-sm text-white/65">{t.subtitle}</p>

        {!user ? (
          <button className="btn-primary mt-5 rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => void handleLogin()}>
            {t.login}
          </button>
        ) : (
          <div className="mt-5">
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75">
              <span className="truncate">{user.email}</span>
              <button className="rounded-lg border border-white/15 px-3 py-1 text-xs" onClick={() => void handleLogout()}>
                {t.logout}
              </button>
            </div>
            <form className="grid gap-3" onSubmit={handleSubmit}>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-white/70">{t.userCode}</span>
                <input
                  className="h-11 rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white outline-none"
                  value={userCode}
                  onChange={(event) => setUserCode(event.target.value.toUpperCase())}
                  placeholder="ABCD-1234"
                  dir="ltr"
                />
              </label>
              {error ? <p className="rounded-lg border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</p> : null}
              {done ? <p className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{t.success}</p> : null}
              <button className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold" disabled={busy || !userCode.trim()}>
                {busy ? t.working : t.submit}
              </button>
            </form>
          </div>
        )}
      </section>
    </main>
  )
}
