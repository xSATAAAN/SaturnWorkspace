import { useEffect, useMemo, useRef, useState } from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { fetchAccountSubscription, type AccountSubscription } from '../api/account'
import { firebaseAuth } from '../lib/firebase'

type AccountPageProps = {
  lang: 'en' | 'ar'
}

const EMAIL_LINK_STORAGE_KEY = 'saturnws_email_link_email'

function formatRemaining(expiresAt?: string) {
  if (!expiresAt) return '--'
  const diff = Date.parse(expiresAt) - Date.now()
  if (!Number.isFinite(diff)) return '--'
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  return days > 0 ? `${days} days${hours > 0 ? `, ${hours} hours` : ''}` : `${Math.max(1, hours)} hours`
}

function getAccountUrl() {
  if (typeof window === 'undefined') return 'https://saturnws.com/account'
  return new URL('/account', window.location.origin).toString()
}

function getRequestedMode() {
  if (typeof window === 'undefined') return 'login'
  const mode = String(new URLSearchParams(window.location.search).get('mode') || '').trim().toLowerCase()
  return mode === 'signup' ? 'signup' : 'login'
}

function normalizeFirebaseError(input: unknown, isAr: boolean) {
  const message = String(input instanceof Error ? input.message : input || '').trim().toLowerCase()
  const code = message.replace(/^firebase:\s*/i, '').replace(/[().]/g, '')

  const map: Record<string, { ar: string; en: string }> = {
    'auth/email-already-in-use': {
      ar: 'هذا البريد مستخدم بالفعل.',
      en: 'This email is already in use.',
    },
    'auth/invalid-email': {
      ar: 'صيغة البريد الإلكتروني غير صحيحة.',
      en: 'The email address format is invalid.',
    },
    'auth/invalid-credential': {
      ar: 'بيانات الدخول غير صحيحة.',
      en: 'The sign-in credentials are invalid.',
    },
    'auth/invalid-login-credentials': {
      ar: 'البريد أو كلمة المرور غير صحيحين.',
      en: 'The email or password is incorrect.',
    },
    'auth/user-not-found': {
      ar: 'لا يوجد حساب بهذا البريد.',
      en: 'No account exists for this email.',
    },
    'auth/wrong-password': {
      ar: 'كلمة المرور غير صحيحة.',
      en: 'The password is incorrect.',
    },
    'auth/too-many-requests': {
      ar: 'تمت محاولات كثيرة. حاول لاحقًا.',
      en: 'Too many attempts. Try again later.',
    },
    'auth/operation-not-allowed': {
      ar: 'طريقة تسجيل الدخول هذه غير مفعلة في Firebase بعد.',
      en: 'This sign-in method is not enabled in Firebase yet.',
    },
    'auth/missing-email': {
      ar: 'أدخل البريد الإلكتروني أولًا.',
      en: 'Enter an email address first.',
    },
    'auth/weak-password': {
      ar: 'كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل.',
      en: 'The password is too weak. Use at least 6 characters.',
    },
    'auth/invalid-action-code': {
      ar: 'رابط الدخول غير صالح أو انتهت صلاحيته.',
      en: 'The sign-in link is invalid or expired.',
    },
    'auth/expired-action-code': {
      ar: 'رابط الدخول انتهت صلاحيته.',
      en: 'The sign-in link has expired.',
    },
  }

  const localized = map[code]
  if (localized) return isAr ? localized.ar : localized.en
  return input instanceof Error ? input.message : String(input || '')
}

export function AccountPage({ lang }: AccountPageProps) {
  const isAr = lang === 'ar'
  const emailLinkHandledRef = useRef(false)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [account, setAccount] = useState<AccountSubscription | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordMode, setPasswordMode] = useState<'login' | 'signup'>(() => getRequestedMode())
  const [completingEmailLink, setCompletingEmailLink] = useState(false)
  const [needsEmailForLink, setNeedsEmailForLink] = useState(false)

  const t = useMemo(
    () =>
      isAr
        ? {
            title: 'حساب Saturn Workspace',
            subtitle:
              'سجل دخولك أو أنشئ حسابًا. في مرحلة البيتا يتم منح الاشتراك التجريبي من لوحة الأدمن.',
            googleSignIn: 'المتابعة باستخدام Google',
            signOut: 'تسجيل الخروج',
            signedIn: 'الحساب الحالي',
            subscription: 'الاشتراك',
            active: 'نشط',
            noSubscription:
              'لا يوجد اشتراك نشط على هذا الحساب. أرسل بريد الحساب للدعم أو انتظر منحه اشتراكًا تجريبيًا من لوحة الأدمن.',
            requestBeta: 'طلب تفعيل تجريبي',
            openTool: 'بعد منح التفعيل التجريبي افتح الأداة وسجل بنفس الحساب.',
            refresh: 'تحديث الحالة',
            plan: 'الخطة',
            tier: 'الباقة',
            remaining: 'المتبقي',
            loading: 'جارٍ التحميل...',
            login: 'تسجيل الدخول',
            signup: 'إنشاء حساب',
            email: 'البريد الإلكتروني',
            password: 'كلمة المرور',
            createAccount: 'إنشاء الحساب',
            logIn: 'تسجيل الدخول',
            or: 'أو',
            magicLink: 'إرسال رابط دخول',
            magicLinkSent:
              'تم إرسال رابط تسجيل الدخول إلى بريدك. افتح الرسالة واضغط الرابط من نفس المتصفح إن أمكن.',
            magicLinkNeedsEmail:
              'أدخل نفس البريد الإلكتروني لإكمال الدخول بهذا الرابط.',
            completeMagicLink: 'إكمال الدخول بالرابط',
            magicLinkSuccess: 'تم تسجيل الدخول عبر الرابط بنجاح.',
          }
        : {
            title: 'Saturn Workspace Account',
            subtitle: 'Sign in or create an account. During beta, subscriptions are granted manually from the admin dashboard.',
            googleSignIn: 'Continue with Google',
            signOut: 'Sign out',
            signedIn: 'Current account',
            subscription: 'Subscription',
            active: 'Active',
            noSubscription:
              'No active subscription is linked to this account. Send this account email to support or wait for a beta subscription to be granted from the admin dashboard.',
            requestBeta: 'Request beta access',
            openTool: 'After beta access is granted, open the desktop app and sign in with the same account.',
            refresh: 'Refresh status',
            plan: 'Plan',
            tier: 'Tier',
            remaining: 'Remaining',
            loading: 'Loading...',
            login: 'Log in',
            signup: 'Sign up',
            email: 'Email',
            password: 'Password',
            createAccount: 'Create account',
            logIn: 'Log in',
            or: 'Or',
            magicLink: 'Send magic link',
            magicLinkSent:
              'A sign-in link was sent to your email. Open it from the same browser if possible.',
            magicLinkNeedsEmail: 'Enter the same email address to finish this sign-in link.',
            completeMagicLink: 'Complete magic link sign-in',
            magicLinkSuccess: 'Signed in successfully with the email link.',
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
      setError(normalizeFirebaseError(err, isAr))
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

  async function completeEmailLinkSignIn(emailAddress: string) {
    if (typeof window === 'undefined') return
    const normalizedEmail = emailAddress.trim().toLowerCase()
    if (!normalizedEmail) {
      setError(normalizeFirebaseError('auth/missing-email', isAr))
      return
    }
    setCompletingEmailLink(true)
    setError('')
    setInfo('')
    try {
      const result = await signInWithEmailLink(firebaseAuth, normalizedEmail, window.location.href)
      window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY)
      window.history.replaceState({}, document.title, '/account')
      setNeedsEmailForLink(false)
      setUser(result.user)
      setInfo(t.magicLinkSuccess)
      await refreshAccount(result.user)
    } catch (err) {
      setError(normalizeFirebaseError(err, isAr))
    } finally {
      setCompletingEmailLink(false)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined' || emailLinkHandledRef.current) return
    if (!isSignInWithEmailLink(firebaseAuth, window.location.href)) return

    emailLinkHandledRef.current = true
    const storedEmail = window.localStorage.getItem(EMAIL_LINK_STORAGE_KEY) || ''
    if (storedEmail.trim()) {
      void completeEmailLinkSignIn(storedEmail)
      return
    }

    setNeedsEmailForLink(true)
    setInfo(t.magicLinkNeedsEmail)
  }, [t.magicLinkNeedsEmail])

  async function handleGoogleSignIn() {
    setError('')
    setInfo('')
    try {
      const result = await signInWithPopup(firebaseAuth, new GoogleAuthProvider())
      setUser(result.user)
      await refreshAccount(result.user)
    } catch (err) {
      setError(normalizeFirebaseError(err, isAr))
    }
  }

  async function handleSignOut() {
    await signOut(firebaseAuth)
    setUser(null)
    setAccount(null)
    setInfo('')
  }

  async function handlePasswordAuth() {
    setError('')
    setInfo('')
    try {
      const result =
        passwordMode === 'signup'
          ? await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password)
          : await signInWithEmailAndPassword(firebaseAuth, email.trim(), password)
      setUser(result.user)
      await refreshAccount(result.user)
    } catch (err) {
      setError(normalizeFirebaseError(err, isAr))
    }
  }

  async function handleMagicLink() {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError(normalizeFirebaseError('auth/missing-email', isAr))
      return
    }
    setError('')
    setInfo('')
    try {
      await sendSignInLinkToEmail(firebaseAuth, normalizedEmail, {
        url: getAccountUrl(),
        handleCodeInApp: true,
      })
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, normalizedEmail)
      }
      setInfo(t.magicLinkSent)
    } catch (err) {
      setError(normalizeFirebaseError(err, isAr))
    }
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

        {loading ? (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">{t.loading}</div>
        ) : null}
        {error ? (
          <div className="mt-6 rounded-xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
        ) : null}
        {info ? (
          <div className="mt-6 rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{info}</div>
        ) : null}

        {!user ? (
          <div className="mt-8 grid gap-4 md:max-w-lg">
            <div className="inline-flex w-fit rounded-xl border border-white/10 bg-white/5 p-1">
              <button
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${passwordMode === 'login' ? 'bg-white/10 text-white' : 'text-white/60'}`}
                onClick={() => setPasswordMode('login')}
              >
                {t.login}
              </button>
              <button
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${passwordMode === 'signup' ? 'bg-white/10 text-white' : 'text-white/60'}`}
                onClick={() => setPasswordMode('signup')}
              >
                {t.signup}
              </button>
            </div>
            <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <input
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                type="email"
                placeholder={t.email}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
              {!needsEmailForLink ? (
                <input
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                  type="password"
                  placeholder={t.password}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={passwordMode === 'signup' ? 'new-password' : 'current-password'}
                />
              ) : null}
              {needsEmailForLink ? (
                <button
                  className="btn-primary rounded-xl px-5 py-3 text-sm font-semibold"
                  onClick={() => void completeEmailLinkSignIn(email)}
                  disabled={completingEmailLink}
                >
                  {completingEmailLink ? t.loading : t.completeMagicLink}
                </button>
              ) : (
                <>
                  <button className="btn-primary rounded-xl px-5 py-3 text-sm font-semibold" onClick={() => void handlePasswordAuth()}>
                    {passwordMode === 'signup' ? t.createAccount : t.logIn}
                  </button>
                  <button
                    className="rounded-xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90"
                    onClick={() => void handleMagicLink()}
                  >
                    {t.magicLink}
                  </button>
                </>
              )}
            </div>
            <div className="text-xs text-white/45">{t.or}</div>
            <button
              className="rounded-xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90"
              onClick={() => void handleGoogleSignIn()}
            >
              {t.googleSignIn}
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
                  {checking ? t.loading : t.refresh}
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
                  <div>
                    {t.plan}: {subscription.plan || '--'}
                  </div>
                  <div>
                    {t.tier}: {subscription.tier || 'public'}
                  </div>
                  <div>
                    {t.remaining}: {formatRemaining(subscription.expires_at)}
                  </div>
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
                      {checking ? t.loading : t.refresh}
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
