import { useEffect, useMemo, useRef, useState } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithRedirect, signOut, type User } from 'firebase/auth'
import { firebaseAuth } from '../lib/firebase'

type DeviceActivationProps = {
  lang: 'en' | 'ar'
}

const AUTH_BASE = 'https://auth.saturnws.com'
const ACTIVATION_STORAGE_KEY = 'saturnws_activation_payload'
const AUTOLOGIN_STORAGE_KEY = 'saturnws_activation_autologin'

type ActivationPayload = {
  ticket: string
  legacyCode?: string
}

function loadActivationPayload(): ActivationPayload | null {
  if (typeof window === 'undefined') return null

  const search = new URLSearchParams(window.location.search)
  const ticket = String(search.get('ticket') || search.get('device_code') || '').trim()
  const legacyCode = String(search.get('code') || '').trim().toUpperCase()

  if (ticket || legacyCode) {
    const payload: ActivationPayload = {
      ticket,
      legacyCode: legacyCode || undefined,
    }
    window.sessionStorage.setItem(ACTIVATION_STORAGE_KEY, JSON.stringify(payload))
    window.history.replaceState({}, document.title, '/activate')
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
  window.sessionStorage.removeItem(AUTOLOGIN_STORAGE_KEY)
}

export function DeviceActivation({ lang }: DeviceActivationProps) {
  const isAr = lang === 'ar'
  const [user, setUser] = useState<User | null>(firebaseAuth.currentUser)
  const [authReady, setAuthReady] = useState(Boolean(firebaseAuth.currentUser))
  const [activationPayload] = useState<ActivationPayload | null>(() => loadActivationPayload())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const completionStartedRef = useRef(false)

  const t = useMemo(
    () =>
      isAr
        ? {
            title: 'تسجيل الدخول للأداة',
            subtitle: 'سيتم ربط جلسة الأداة بحسابك في Saturn Workspace ثم يمكنك العودة مباشرة إلى التطبيق.',
            login: 'المتابعة باستخدام Google',
            logout: 'تسجيل الخروج',
            working: 'جارٍ إكمال الربط...',
            success: 'تم ربط الأداة بحسابك. ارجع الآن إلى التطبيق وسيكمل الفتح تلقائيًا.',
            failed: 'تعذر إكمال ربط الأداة بهذا الحساب.',
            noSubscription:
              'لا يوجد اشتراك نشط على هذا الحساب حاليًا. عند منحه اشتراكًا تجريبيًا من لوحة الأدمن ستتمكن الأداة من المتابعة.',
            missingTicket: 'جلسة التفعيل غير صالحة أو انتهت. ارجع إلى الأداة وابدأ تسجيل الدخول مرة أخرى.',
          }
        : {
            title: 'Tool Sign In',
            subtitle: 'This browser session will be linked to your Saturn Workspace desktop session, then you can return to the app.',
            login: 'Continue with Google',
            logout: 'Sign out',
            working: 'Completing sign-in...',
            success: 'The desktop tool is now linked to your account. Return to the app; it will continue automatically.',
            failed: 'Could not finish linking this tool session.',
            noSubscription:
              'This account does not have an active subscription yet. After beta access is granted from the admin dashboard, the app will continue normally.',
            missingTicket: 'This activation session is missing or expired. Return to the app and start sign-in again.',
          },
    [isAr],
  )

  useEffect(() => {
    const stop = onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser)
      setAuthReady(true)
    })
    return () => stop()
  }, [])

  async function handleLoginRedirect() {
    setError('')
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(AUTOLOGIN_STORAGE_KEY, '1')
    }
    await signInWithRedirect(firebaseAuth, provider)
  }

  async function handleLogout() {
    setUser(null)
    completionStartedRef.current = false
    await signOut(firebaseAuth).catch(() => undefined)
  }

  async function completeDeviceLink(nextUser: User) {
    if (!activationPayload || busy || completionStartedRef.current) return
    completionStartedRef.current = true
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
          ticket: activationPayload.ticket,
          device_code: activationPayload.ticket,
          user_code: activationPayload.legacyCode || undefined,
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
      clearActivationPayload()
      setDone(true)
    } catch (err) {
      completionStartedRef.current = false
      setError(err instanceof Error ? err.message : t.failed)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!activationPayload) {
      setError((current) => current || t.missingTicket)
      return
    }
    if (!authReady || user || busy || done) return
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(AUTOLOGIN_STORAGE_KEY) === '1') {
      return
    }
    void handleLoginRedirect()
  }, [activationPayload, authReady, busy, done, t.missingTicket, user])

  useEffect(() => {
    if (!authReady || !user || !activationPayload || done) return
    void completeDeviceLink(user)
  }, [activationPayload, authReady, done, user])

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4 py-10">
      <section className="surface-card w-full p-6">
        <h1 className="text-2xl font-bold text-white">{t.title}</h1>
        <p className="mt-2 text-sm text-white/65">{t.subtitle}</p>

        {!activationPayload ? (
          <p className="mt-5 rounded-lg border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{t.missingTicket}</p>
        ) : null}

        {user ? (
          <div className="mt-5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate">{user.email}</span>
              <button className="rounded-lg border border-white/15 px-3 py-1 text-xs" onClick={() => void handleLogout()}>
                {t.logout}
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-5 rounded-lg border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</p> : null}
        {done ? <p className="mt-5 rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{t.success}</p> : null}

        {!done ? (
          <div className="mt-5">
            {!user ? (
              <button className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => void handleLoginRedirect()}>
                {t.login}
              </button>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70">
                {busy ? t.working : t.subtitle}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </main>
  )
}
