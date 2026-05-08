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
import { setAdminBearerToken } from '../../api/admin'
import { firebaseAuth } from '../../lib/firebase'

type AdminAuthGateProps = {
  lang: 'en' | 'ar'
  children: ReactNode
}

const TOKEN_REFRESH_MS = 40 * 60 * 1000
const PRE_AUTH_SESSION_KEY = 'st_admin_layer1_ok'
const LAYER1_USERNAME = 'stk_admin_gate_9Q7vK2'
const LAYER1_PASSWORD = 'M9!vT2#pL7@xR4$hN8'

export function AdminAuthGate({ lang, children }: AdminAuthGateProps) {
  const isAr = lang === 'ar'
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [layer1Error, setLayer1Error] = useState<string | null>(null)
  const [layer1UserInput, setLayer1UserInput] = useState('')
  const [layer1PassInput, setLayer1PassInput] = useState('')
  const [layer1Passed, setLayer1Passed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.sessionStorage.getItem(PRE_AUTH_SESSION_KEY) === '1'
  })

  const labels = useMemo(
    () =>
      isAr
        ? {
            title: 'تسجيل دخول الإدارة',
            subtitle: 'سجل الدخول بحساب Google المصرح له للوصول إلى لوحة الأدمن.',
            layer1Title: 'التحقق الأول',
            layer1Subtitle: 'أدخل البريد وكلمة المرور للمتابعة إلى تسجيل دخول Google.',
            fakeEmailLabel: 'البريد الإلكتروني',
            fakePassLabel: 'كلمة المرور',
            continueBtn: 'متابعة',
            layer1Invalid: 'بيانات التحقق غير صحيحة.',
            login: 'تسجيل الدخول عبر Google',
            logout: 'تسجيل الخروج',
          }
        : {
            title: 'Admin Sign In',
            subtitle: 'Use your allowed Google account to access the dashboard.',
            layer1Title: 'Layer 1 Verification',
            layer1Subtitle: 'Enter email and password to continue to Google sign-in.',
            fakeEmailLabel: 'Email',
            fakePassLabel: 'Password',
            continueBtn: 'Continue',
            layer1Invalid: 'Invalid verification credentials.',
            login: 'Sign In With Google',
            logout: 'Sign out',
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
        } catch {
          setAdminBearerToken(null)
        }
      } else {
        setAdminBearerToken(null)
      }
      setLoading(false)
    })
    return () => stop()
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
    const valid = layer1UserInput.trim() === LAYER1_USERNAME && layer1PassInput === LAYER1_PASSWORD
    if (!valid) {
      setLayer1Error(labels.layer1Invalid)
      return
    }
    setLayer1Passed(true)
    window.sessionStorage.setItem(PRE_AUTH_SESSION_KEY, '1')
    setLayer1PassInput('')
  }

  const handleSignOut = async () => {
    setError(null)
    try {
      await signOut(firebaseAuth)
      setAdminBearerToken(null)
      setLayer1Passed(false)
      window.sessionStorage.removeItem(PRE_AUTH_SESSION_KEY)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'logout_failed')
    }
  }

  if (loading) {
    return <section className="mx-auto mt-8 w-full max-w-xl rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">Loading authentication...</section>
  }

  if (!layer1Passed) {
    return (
      <main className="mx-auto mt-10 w-full max-w-xl px-4">
        <section className="surface-card p-6">
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
      <main className="mx-auto mt-10 w-full max-w-xl px-4">
        <section className="surface-card p-6">
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
