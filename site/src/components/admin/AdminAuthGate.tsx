import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  browserSessionPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { clearAdminPreauth, fetchAdminDashboard, fetchAdminPreauthState, setAdminBearerToken, submitAdminPreauth } from '../../api/admin'
import { firebaseAuth } from '../../lib/firebase'

type AdminAuthGateProps = {
  lang: 'en' | 'ar'
  children: ReactNode
}

const TOKEN_REFRESH_MS = 40 * 60 * 1000

export function AdminAuthGate({ lang, children }: AdminAuthGateProps) {
  const isAr = lang === 'ar'
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [layer1Error, setLayer1Error] = useState<string | null>(null)
  const [layer1UserInput, setLayer1UserInput] = useState('')
  const [layer1PassInput, setLayer1PassInput] = useState('')
  const [authorizing, setAuthorizing] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [authzError, setAuthzError] = useState<string | null>(null)
  const [layer1Passed, setLayer1Passed] = useState(false)

  const labels = useMemo(
    () =>
      isAr
        ? {
            title: 'تسجيل الدخول',
            subtitle: 'سجل الدخول بحساب Google المصرح له للوصول إلى لوحة الأدمن.',
            layer1Title: 'تسجيل الدخول',
            layer1Subtitle: 'أدخل البريد وكلمة المرور للمتابعة إلى تسجيل دخول Google.',
            fakeEmailLabel: 'البريد الإلكتروني',
            fakePassLabel: 'كلمة المرور',
            continueBtn: 'متابعة',
            layer1Invalid: 'بيانات التحقق غير صحيحة.',
            login: 'تسجيل الدخول عبر Google',
            logout: 'تسجيل الخروج',
            accessDenied: 'هذا الحساب غير مصرح له بالدخول.',
            authChecking: 'جار التحقق من صلاحية الحساب...',
          }
        : {
            title: 'Sign In',
            subtitle: 'Use your allowed Google account to access the dashboard.',
            layer1Title: 'Sign In',
            layer1Subtitle: 'Enter email and password to continue to Google sign-in.',
            fakeEmailLabel: 'Email',
            fakePassLabel: 'Password',
            continueBtn: 'Continue',
            layer1Invalid: 'Invalid verification credentials.',
            login: 'Sign In With Google',
            logout: 'Sign out',
            accessDenied: 'This Google account is not allowed.',
            authChecking: 'Verifying account access...',
          },
    [isAr],
  )

  useEffect(() => {
    void signOut(firebaseAuth).catch(() => {
      // No-op: user may already be signed out.
    })
    void setPersistence(firebaseAuth, browserSessionPersistence).catch(() => {
      // Keep default behavior if persistence setup fails.
    })
    const stop = onAuthStateChanged(firebaseAuth, async (nextUser) => {
      setUser(nextUser)
      if (nextUser) {
        try {
          const token = await nextUser.getIdToken()
          setAdminBearerToken(token)
          setAuthorizing(true)
          setAuthzError(null)
          await fetchAdminDashboard()
          setIsAuthorized(true)
        } catch {
          setAdminBearerToken(null)
          setIsAuthorized(false)
          setAuthzError(labels.accessDenied)
          void signOut(firebaseAuth).catch(() => {
            // no-op
          })
        } finally {
          setAuthorizing(false)
        }
      } else {
        setAdminBearerToken(null)
        setIsAuthorized(false)
        setAuthzError(null)
      }
      setLoading(false)
    })
    return () => stop()
  }, [])

  useEffect(() => {
    let alive = true
    void fetchAdminPreauthState()
      .then((state) => {
        if (alive) setLayer1Passed(Boolean(state.authenticated))
      })
      .catch(() => {
        if (alive) setLayer1Passed(false)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!user) return
    const timer = window.setInterval(() => {
      void user.getIdToken(true).then((token) => {
        setAdminBearerToken(token)
      })
    }, TOKEN_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [user])

  const handleSignIn = async () => {
    setError(null)
    try {
      await signInWithPopup(firebaseAuth, new GoogleAuthProvider())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login_failed')
    }
  }

  const handleLayer1Submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLayer1Error(null)
    void submitAdminPreauth({
      username: layer1UserInput.trim(),
      password: layer1PassInput,
    })
      .then((result) => {
        if (!result.authenticated) {
          setLayer1Error(labels.layer1Invalid)
          return
        }
        setLayer1Passed(true)
        setLayer1PassInput('')
      })
      .catch(() => {
        setLayer1Error(labels.layer1Invalid)
      })
  }

  const handleSignOut = async () => {
    setError(null)
    try {
      await signOut(firebaseAuth)
      await clearAdminPreauth().catch(() => {
        // Session cookie may already be gone.
      })
      setAdminBearerToken(null)
      setLayer1Passed(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'logout_failed')
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4">
        <section className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">Loading authentication...</section>
      </main>
    )
  }

  if (!layer1Passed) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4">
        <section className="surface-card w-full p-6">
          <h1 className="text-xl font-bold text-white">{labels.layer1Title}</h1>
          <p className="mt-2 text-sm text-white/70">{labels.layer1Subtitle}</p>
          <form className="mt-4 grid gap-3" onSubmit={handleLayer1Submit}>
            <input
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
              type="text"
              autoComplete="off"
              placeholder={labels.fakeEmailLabel}
              value={layer1UserInput}
              onChange={(e) => setLayer1UserInput(e.target.value)}
            />
            <input
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
              type="password"
              autoComplete="off"
              placeholder={labels.fakePassLabel}
              value={layer1PassInput}
              onChange={(e) => setLayer1PassInput(e.target.value)}
            />
            {layer1Error ? <p className="rounded-lg border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{layer1Error}</p> : null}
            <button type="submit" className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold">
              {labels.continueBtn}
            </button>
          </form>
        </section>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4">
        <section className="surface-card w-full p-6">
          <h1 className="text-xl font-bold text-white">{labels.title}</h1>
          <p className="mt-2 text-sm text-white/70">{labels.subtitle}</p>
          {error ? <p className="mt-3 rounded-lg border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</p> : null}
          <button className="btn-primary mt-4 rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => void handleSignIn()}>
            {labels.login}
          </button>
        </section>
      </main>
    )
  }

  if (authorizing) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4">
        <section className="surface-card w-full p-6 text-center">
          <p className="text-sm text-white/75">{labels.authChecking}</p>
        </section>
      </main>
    )
  }

  if (!isAuthorized) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4">
        <section className="surface-card w-full p-6">
          <h1 className="text-xl font-bold text-white">{labels.title}</h1>
          <p className="mt-2 text-sm text-rose-200">{authzError || labels.accessDenied}</p>
          <button className="btn-primary mt-4 rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => void handleSignOut()}>
            {labels.logout}
          </button>
        </section>
      </main>
    )
  }

  return (
    <>
      <section className="mx-auto mt-6 flex w-full max-w-6xl items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
        <div className="truncate">
          {user.email || 'admin'}
        </div>
        <button className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/90" onClick={() => void handleSignOut()}>
          {labels.logout}
        </button>
      </section>
      {error ? <section className="mx-auto mt-4 w-full max-w-6xl rounded-xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</section> : null}
      {children}
    </>
  )
}
