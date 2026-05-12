import { useEffect, useMemo, useRef, useState } from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import heroImage from '../assets/hero.png'
import { fetchAccountSubscription, type AccountSubscription } from '../api/account'
import { firebaseAuth } from '../lib/firebase'

type AccountPageProps = {
  lang: 'en' | 'ar'
}

type AuthMode = 'login' | 'signup'

const EMAIL_LINK_STORAGE_KEY = 'saturnws_email_link_email'

function formatRemaining(expiresAt?: string) {
  if (!expiresAt) return '--'
  const diff = Date.parse(expiresAt) - Date.now()
  if (!Number.isFinite(diff)) return '--'
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  return days > 0 ? `${days}d${hours > 0 ? ` ${hours}h` : ''}` : `${Math.max(1, hours)}h`
}

function getAccountUrl() {
  if (typeof window === 'undefined') return 'https://saturnws.com/account'
  return new URL('/account', window.location.origin).toString()
}

function getRequestedMode(): AuthMode {
  if (typeof window === 'undefined') return 'login'
  const mode = String(new URLSearchParams(window.location.search).get('mode') || '').trim().toLowerCase()
  return mode === 'signup' ? 'signup' : 'login'
}

function writeModeToUrl(mode: AuthMode) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (mode === 'signup') {
    url.searchParams.set('mode', 'signup')
  } else {
    url.searchParams.delete('mode')
  }
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`)
}

function normalizeFirebaseError(input: unknown, isAr: boolean) {
  const raw = String(input instanceof Error ? input.message : input || '').trim()
  const code = raw.replace(/^firebase:\s*/i, '').replace(/[().]/g, '').toLowerCase()

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
      ar: 'طريقة تسجيل الدخول هذه غير مفعلة في Firebase حاليًا.',
      en: 'This sign-in method is not enabled in Firebase.',
    },
    'auth/missing-email': {
      ar: 'أدخل البريد الإلكتروني أولًا.',
      en: 'Enter an email address first.',
    },
    'auth/missing-password': {
      ar: 'أدخل كلمة المرور أولًا.',
      en: 'Enter a password first.',
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
      ar: 'انتهت صلاحية رابط الدخول.',
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
  const [confirmPassword, setConfirmPassword] = useState('')
  const [authMode, setAuthMode] = useState<AuthMode>(() => getRequestedMode())
  const [completingEmailLink, setCompletingEmailLink] = useState(false)
  const [needsEmailForLink, setNeedsEmailForLink] = useState(false)
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [magicLinkLoading, setMagicLinkLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [slideIndex, setSlideIndex] = useState(0)

  const t = useMemo(
    () =>
      isAr
        ? {
            brand: 'Saturn Workspace',
            loginTab: 'تسجيل الدخول',
            signupTab: 'إنشاء حساب',
            loginTitle: 'تسجيل الدخول',
            loginSubtitle: 'سجّل دخولك للوصول إلى مساحة العمل الخاصة بك.',
            signupTitle: 'إنشاء حساب',
            signupSubtitle: 'أنشئ حسابك للبدء في استخدام المنصة.',
            signedInTitle: 'الحساب الحالي',
            signedInSubtitle: 'هذا هو الحساب المرتبط الآن بالمنصة.',
            email: 'البريد الإلكتروني',
            password: 'كلمة المرور',
            confirmPassword: 'تأكيد كلمة المرور',
            logIn: 'تسجيل الدخول',
            createAccount: 'إنشاء الحساب',
            loggingIn: 'جار تسجيل الدخول...',
            creatingAccount: 'جار إنشاء الحساب...',
            continueWithGoogle: 'المتابعة باستخدام Google',
            continueWithGoogleLoading: 'جار فتح Google...',
            forgotPassword: 'نسيت كلمة المرور؟',
            resetSent: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك.',
            show: 'إظهار',
            hide: 'إخفاء',
            or: 'أو',
            otherOptions: 'خيارات أخرى',
            magicLink: 'إرسال رابط دخول',
            magicLinkLoading: 'جار إرسال الرابط...',
            magicLinkSent:
              'تم إرسال رابط دخول إلى بريدك. افتح الرسالة واضغط الرابط من نفس المتصفح إن أمكن.',
            magicLinkHeading: 'إكمال تسجيل الدخول بالرابط',
            magicLinkNeedsEmail: 'أدخل نفس البريد الإلكتروني لإكمال تسجيل الدخول بهذا الرابط.',
            completeMagicLink: 'إكمال تسجيل الدخول',
            magicLinkSuccess: 'تم تسجيل الدخول عبر الرابط بنجاح.',
            noAccount: 'ليس لديك حساب؟',
            haveAccount: 'لديك حساب بالفعل؟',
            createOne: 'إنشاء حساب',
            signInHere: 'تسجيل الدخول',
            legalConsent:
              'بإنشائك للحساب، فأنت توافق على شروط الاستخدام وسياسة الخصوصية وسياسة ملفات تعريف الارتباط.',
            consentRequired: 'يجب الموافقة على الشروط والسياسات للمتابعة.',
            passwordMismatch: 'كلمتا المرور غير متطابقتين.',
            requestBeta: 'طلب تفعيل تجريبي',
            signOut: 'تسجيل الخروج',
            refresh: 'تحديث الحالة',
            subscription: 'الاشتراك',
            active: 'نشط',
            noSubscription:
              'لا يوجد اشتراك نشط على هذا الحساب بعد. يمكنك طلب تفعيل تجريبي أو انتظار منحه من لوحة الأدمن.',
            openTool: 'بعد منح الاشتراك التجريبي، افتح الأداة وسجل بنفس الحساب.',
            plan: 'الخطة',
            tier: 'الباقة',
            remaining: 'المتبقي',
            loading: 'جار التحميل...',
            acceptableUse: 'سياسة الاستخدام المقبول',
            refund: 'سياسة الاسترداد',
            contact: 'التواصل القانوني',
            slides: [
              {
                title: 'إدارة أسهل لمساحة العمل',
                body: 'نقطة دخول موحدة للحسابات والجلسات والنسخ الاحتياطي، بدون فوضى تشغيلية.',
                metric: 'Vault + Gmail + Sync',
              },
              {
                title: 'تحكم ذكي في البيانات والمهام',
                body: 'تنظيم أوضح للحسابات، التذكيرات، والنسخ السحابية على حساب المستخدم نفسه.',
                metric: 'جلسات أسرع وتنظيم أدق',
              },
              {
                title: 'تجربة أسرع وأكثر تنظيمًا',
                body: 'واجهة تشغيل واحدة تبقي ما تحتاجه قريبًا من يدك بدل التنقل بين أدوات كثيرة.',
                metric: 'Beta access on one account',
              },
            ],
          }
        : {
            brand: 'Saturn Workspace',
            loginTab: 'Sign in',
            signupTab: 'Create account',
            loginTitle: 'Sign in',
            loginSubtitle: 'Sign in to access your workspace.',
            signupTitle: 'Create account',
            signupSubtitle: 'Create your account to start using the platform.',
            signedInTitle: 'Current account',
            signedInSubtitle: 'This account is currently linked to the platform.',
            email: 'Email address',
            password: 'Password',
            confirmPassword: 'Confirm password',
            logIn: 'Sign in',
            createAccount: 'Create account',
            loggingIn: 'Signing in...',
            creatingAccount: 'Creating account...',
            continueWithGoogle: 'Continue with Google',
            continueWithGoogleLoading: 'Opening Google...',
            forgotPassword: 'Forgot password?',
            resetSent: 'A password reset link was sent to your email.',
            show: 'Show',
            hide: 'Hide',
            or: 'Or',
            otherOptions: 'Other options',
            magicLink: 'Send sign-in link',
            magicLinkLoading: 'Sending link...',
            magicLinkSent: 'A sign-in link was sent to your email. Open it from the same browser if possible.',
            magicLinkHeading: 'Complete sign-in from email link',
            magicLinkNeedsEmail: 'Enter the same email address to complete this sign-in link.',
            completeMagicLink: 'Complete sign-in',
            magicLinkSuccess: 'Signed in successfully with the email link.',
            noAccount: "Don't have an account?",
            haveAccount: 'Already have an account?',
            createOne: 'Create one',
            signInHere: 'Sign in',
            legalConsent:
              'By creating an account, you agree to the Terms of Use, Privacy Policy, and Cookie Policy.',
            consentRequired: 'You must accept the terms and policies to continue.',
            passwordMismatch: 'Passwords do not match.',
            requestBeta: 'Request beta access',
            signOut: 'Sign out',
            refresh: 'Refresh status',
            subscription: 'Subscription',
            active: 'Active',
            noSubscription:
              'No active subscription is linked to this account yet. You can request beta access or wait for it to be granted from the admin dashboard.',
            openTool: 'After beta access is granted, open the desktop app and sign in with the same account.',
            plan: 'Plan',
            tier: 'Tier',
            remaining: 'Remaining',
            loading: 'Loading...',
            acceptableUse: 'Acceptable use',
            refund: 'Refund policy',
            contact: 'Legal contact',
            slides: [
              {
                title: 'A calmer way to run your workspace',
                body: 'One access point for accounts, sessions, and backup without operational clutter.',
                metric: 'Vault + Gmail + Sync',
              },
              {
                title: 'Sharper control over data and tasks',
                body: 'Cleaner structure for accounts, reminders, and private cloud backup on the user account.',
                metric: 'Faster sessions, tighter organization',
              },
              {
                title: 'Faster, more structured daily flow',
                body: 'A single workspace keeps the operating pieces close instead of spread across tools.',
                metric: 'Beta access on one account',
              },
            ],
          },
    [isAr],
  )

  const slides = t.slides
  const subscription = account?.subscription

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % slides.length)
    }, 4800)
    return () => window.clearInterval(timer)
  }, [slides.length])

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
      window.history.replaceState({}, document.title, window.location.pathname)
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

  function switchAuthMode(nextMode: AuthMode) {
    setAuthMode(nextMode)
    setError('')
    setInfo('')
    setConfirmPassword('')
    setLegalAccepted(false)
    setNeedsEmailForLink(false)
    writeModeToUrl(nextMode)
  }

  async function handleGoogleSignIn() {
    setError('')
    setInfo('')
    setGoogleLoading(true)
    try {
      const result = await signInWithPopup(firebaseAuth, new GoogleAuthProvider())
      setUser(result.user)
      await refreshAccount(result.user)
    } catch (err) {
      setError(normalizeFirebaseError(err, isAr))
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleSignOut() {
    await signOut(firebaseAuth)
    setUser(null)
    setAccount(null)
    setInfo('')
    setError('')
  }

  async function handlePasswordAuth() {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError(normalizeFirebaseError('auth/missing-email', isAr))
      return
    }
    if (!password) {
      setError(normalizeFirebaseError('auth/missing-password', isAr))
      return
    }
    if (authMode === 'signup') {
      if (!legalAccepted) {
        setError(t.consentRequired)
        return
      }
      if (!confirmPassword) {
        setError(isAr ? 'أكد كلمة المرور أولًا.' : 'Confirm the password first.')
        return
      }
      if (password !== confirmPassword) {
        setError(t.passwordMismatch)
        return
      }
    }

    setError('')
    setInfo('')
    setSubmitting(true)
    try {
      const result =
        authMode === 'signup'
          ? await createUserWithEmailAndPassword(firebaseAuth, normalizedEmail, password)
          : await signInWithEmailAndPassword(firebaseAuth, normalizedEmail, password)
      setUser(result.user)
      await refreshAccount(result.user)
    } catch (err) {
      setError(normalizeFirebaseError(err, isAr))
    } finally {
      setSubmitting(false)
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
    setMagicLinkLoading(true)
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
    } finally {
      setMagicLinkLoading(false)
    }
  }

  async function handleForgotPassword() {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError(normalizeFirebaseError('auth/missing-email', isAr))
      return
    }
    setError('')
    setInfo('')
    setResetLoading(true)
    try {
      await sendPasswordResetEmail(firebaseAuth, normalizedEmail)
      setInfo(t.resetSent)
    } catch (err) {
      setError(normalizeFirebaseError(err, isAr))
    } finally {
      setResetLoading(false)
    }
  }

  const activeHeading = needsEmailForLink
    ? t.magicLinkHeading
    : authMode === 'signup'
      ? t.signupTitle
      : t.loginTitle

  const activeSubheading = needsEmailForLink
    ? t.magicLinkNeedsEmail
    : authMode === 'signup'
      ? t.signupSubtitle
      : t.loginSubtitle

  const legalLinks = {
    terms: '/terms/',
    privacy: '/privacy/',
    cookies: '/cookies/',
    acceptableUse: '/acceptable-use/',
    refund: '/refund/',
    contact: '/contact/',
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid min-h-[calc(100vh-3rem)] items-stretch gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,480px)]">
        <aside className="relative hidden overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/60 lg:flex">
          <img
            src={heroImage}
            alt={t.brand}
            className="absolute inset-0 h-full w-full object-cover opacity-25"
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.22),transparent_45%),linear-gradient(180deg,rgba(2,6,23,0.14),rgba(2,6,23,0.9))]" />
          <div className="relative flex w-full flex-col justify-between p-8 xl:p-10">
            <div className="space-y-5">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-base font-bold text-white shadow-[0_18px_40px_rgba(37,99,235,0.25)]">
                SW
              </div>
              <div className="relative min-h-[168px]">
                {slides.map((slide, index) => (
                  <div
                    key={slide.title}
                    className={`absolute inset-0 transition-all duration-500 ${index === slideIndex ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}
                  >
                    <h2 className="max-w-xl text-4xl font-bold leading-tight text-white xl:text-5xl">
                      {slide.title}
                    </h2>
                    <p className="mt-4 max-w-lg text-base leading-8 text-slate-200/78">{slide.body}</p>
                    <div className="mt-5 inline-flex rounded-full border border-sky-400/20 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-100">
                      {slide.metric}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {slides.map((slide, index) => (
                  <button
                    key={slide.title}
                    type="button"
                    onClick={() => setSlideIndex(index)}
                    className={`h-2.5 rounded-full transition-all duration-300 ${index === slideIndex ? 'w-8 bg-sky-300' : 'w-2.5 bg-white/25 hover:bg-white/40'}`}
                    aria-label={`${t.brand} slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[24px] border border-white/10 bg-slate-950/68 p-5 shadow-[0_18px_44px_rgba(2,6,23,0.34)] backdrop-blur-xl">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300/72">Workspace</div>
                  <div className="mt-3 grid gap-3">
                    <div className="rounded-2xl border border-white/8 bg-white/6 p-4">
                      <div className="text-sm font-semibold text-white">Vault</div>
                      <div className="mt-1 text-xs leading-6 text-slate-300/72">
                        {isAr ? 'تنظيم الحسابات مع الملاحظات والحالة.' : 'Account organization with notes and status.'}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/6 p-4">
                      <div className="text-sm font-semibold text-white">Google Drive</div>
                      <div className="mt-1 text-xs leading-6 text-slate-300/72">
                        {isAr ? 'نسخ سحابي خاص على حساب المستخدم نفسه.' : 'Private cloud backup on the user account.'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/7 p-5 shadow-[0_18px_44px_rgba(2,6,23,0.34)] backdrop-blur-xl">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300/72">Flow</div>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-emerald-400/18 bg-emerald-400/8 px-3 py-3 text-sm text-emerald-100">
                      {isAr ? 'جلسات أسرع مع رؤية أوضح للحالة.' : 'Faster sessions with clearer state tracking.'}
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-slate-950/55 px-3 py-3 text-sm text-slate-200/76">
                      {isAr ? 'ربط الوصول التجريبي بالحساب نفسه.' : 'Beta access linked to the same account.'}
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-slate-950/55 px-3 py-3 text-sm text-slate-200/76">
                      {isAr ? 'أقل تبديل بين الأدوات وأكثر تركيزًا.' : 'Less tool switching, more focus.'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-md rounded-[30px] border border-white/10 bg-slate-950/76 p-5 shadow-[0_24px_60px_rgba(2,6,23,0.42)] backdrop-blur-2xl sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-base font-bold text-white shadow-[0_18px_40px_rgba(37,99,235,0.24)]">
                  SW
                </div>
                <div className="mt-4 text-xl font-bold text-white">{t.brand}</div>
                <div className="mt-1 text-sm text-slate-300/72">{activeHeading}</div>
              </div>
              <a
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200/78 transition hover:border-white/16 hover:bg-white/8"
                href="/"
              >
                {isAr ? 'الرئيسية' : 'Home'}
              </a>
            </div>

            <div className="mb-5 rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm leading-7 text-slate-300/74 lg:hidden">
              <div className="font-semibold text-white">{slides[slideIndex]?.title}</div>
              <div className="mt-1">{slides[slideIndex]?.body}</div>
            </div>

            {loading ? (
              <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200/74">{t.loading}</div>
            ) : null}
            {error ? (
              <div className="mb-4 rounded-2xl border border-rose-400/24 bg-rose-500/10 px-4 py-3 text-sm leading-7 text-rose-100">{error}</div>
            ) : null}
            {info ? (
              <div className="mb-4 rounded-2xl border border-emerald-400/24 bg-emerald-500/10 px-4 py-3 text-sm leading-7 text-emerald-100">{info}</div>
            ) : null}

            {!user ? (
              <>
                <div className="mb-5 inline-flex w-full rounded-2xl border border-white/10 bg-white/[0.04] p-1">
                  <button
                    type="button"
                    className={`flex-1 rounded-[14px] px-4 py-3 text-sm font-semibold transition ${authMode === 'login' ? 'bg-white/10 text-white shadow-[0_8px_22px_rgba(15,23,42,0.24)]' : 'text-slate-300/68 hover:text-white'}`}
                    onClick={() => switchAuthMode('login')}
                  >
                    {t.loginTab}
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-[14px] px-4 py-3 text-sm font-semibold transition ${authMode === 'signup' ? 'bg-white/10 text-white shadow-[0_8px_22px_rgba(15,23,42,0.24)]' : 'text-slate-300/68 hover:text-white'}`}
                    onClick={() => switchAuthMode('signup')}
                  >
                    {t.signupTab}
                  </button>
                </div>

                <div className="mb-5">
                  <h1 className="text-2xl font-bold text-white">{activeHeading}</h1>
                  <p className="mt-2 text-sm leading-7 text-slate-300/70">{activeSubheading}</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-200/84">{t.email}</label>
                    <input
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-slate-400/60 focus:border-sky-400/38 focus:bg-white/[0.07]"
                      dir="ltr"
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                    />
                  </div>

                  {!needsEmailForLink ? (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <label className="block text-sm font-semibold text-slate-200/84">{t.password}</label>
                          {authMode === 'login' ? (
                            <button
                              type="button"
                              className="text-xs font-semibold text-sky-300 transition hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => void handleForgotPassword()}
                              disabled={resetLoading}
                            >
                              {resetLoading ? t.loading : t.forgotPassword}
                            </button>
                          ) : null}
                        </div>
                        <div className="relative">
                          <input
                            className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 pr-4 text-sm text-white outline-none transition placeholder:text-slate-400/60 focus:border-sky-400/38 focus:bg-white/[0.07]"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                          />
                          <button
                            type="button"
                            className={`absolute inset-y-0 ${isAr ? 'left-3' : 'right-3'} my-auto h-8 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs font-semibold text-slate-200/84 transition hover:border-white/16 hover:bg-white/[0.1]`}
                            onClick={() => setShowPassword((value) => !value)}
                          >
                            {showPassword ? t.hide : t.show}
                          </button>
                        </div>
                      </div>

                      {authMode === 'signup' ? (
                        <div className="space-y-2">
                          <label className="block text-sm font-semibold text-slate-200/84">{t.confirmPassword}</label>
                          <div className="relative">
                            <input
                              className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 pr-4 text-sm text-white outline-none transition placeholder:text-slate-400/60 focus:border-sky-400/38 focus:bg-white/[0.07]"
                              type={showConfirmPassword ? 'text' : 'password'}
                              placeholder="••••••••"
                              value={confirmPassword}
                              onChange={(event) => setConfirmPassword(event.target.value)}
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              className={`absolute inset-y-0 ${isAr ? 'left-3' : 'right-3'} my-auto h-8 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs font-semibold text-slate-200/84 transition hover:border-white/16 hover:bg-white/[0.1]`}
                              onClick={() => setShowConfirmPassword((value) => !value)}
                            >
                              {showConfirmPassword ? t.hide : t.show}
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {authMode === 'signup' ? (
                        <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-7 text-slate-300/80">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 accent-blue-500"
                            checked={legalAccepted}
                            onChange={(event) => setLegalAccepted(event.target.checked)}
                          />
                          <span>
                            {isAr ? 'بإنشائك للحساب، فأنت توافق على ' : 'By creating an account, you agree to the '}
                            <a className="text-sky-300 hover:text-sky-200" href={legalLinks.terms}>
                              {isAr ? 'شروط الاستخدام' : 'Terms of Use'}
                            </a>
                            {isAr ? ' و' : ', '}
                            <a className="text-sky-300 hover:text-sky-200" href={legalLinks.privacy}>
                              {isAr ? 'سياسة الخصوصية' : 'Privacy Policy'}
                            </a>
                            {isAr ? ' و' : ', and '}
                            <a className="text-sky-300 hover:text-sky-200" href={legalLinks.cookies}>
                              {isAr ? 'سياسة ملفات تعريف الارتباط' : 'Cookie Policy'}
                            </a>
                            .
                          </span>
                        </label>
                      ) : null}

                      <button
                        type="button"
                        className="btn-primary h-12 w-full rounded-2xl px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-65"
                        onClick={() => void handlePasswordAuth()}
                        disabled={submitting || (authMode === 'signup' && !legalAccepted)}
                      >
                        {submitting ? (authMode === 'signup' ? t.creatingAccount : t.loggingIn) : authMode === 'signup' ? t.createAccount : t.logIn}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary h-12 w-full rounded-2xl px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-65"
                      onClick={() => void completeEmailLinkSignIn(email)}
                      disabled={completingEmailLink}
                    >
                      {completingEmailLink ? t.loading : t.completeMagicLink}
                    </button>
                  )}

                  <div className="flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400/64">{t.or}</span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>

                  <button
                    type="button"
                    className="flex h-12 w-full items-center justify-center rounded-2xl border border-white/12 bg-white/[0.05] px-5 text-sm font-semibold text-white transition hover:border-white/18 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-65"
                    onClick={() => void handleGoogleSignIn()}
                    disabled={googleLoading}
                  >
                    {googleLoading ? t.continueWithGoogleLoading : t.continueWithGoogle}
                  </button>

                  {!needsEmailForLink ? (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400/62">{t.otherOptions}</div>
                      <button
                        type="button"
                        className="w-full rounded-xl border border-white/10 bg-transparent px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-white/16 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-65"
                        onClick={() => void handleMagicLink()}
                        disabled={magicLinkLoading}
                      >
                        {magicLinkLoading ? t.magicLinkLoading : t.magicLink}
                      </button>
                    </div>
                  ) : null}

                  <div className="space-y-3 pt-1 text-center">
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-xs text-slate-400/64">{authMode === 'signup' ? t.haveAccount : t.noAccount}</span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-sky-400/24 bg-sky-400/8 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:border-sky-400/34 hover:bg-sky-400/12"
                      onClick={() => switchAuthMode(authMode === 'signup' ? 'login' : 'signup')}
                    >
                      {authMode === 'signup' ? t.signInHere : t.createOne}
                    </button>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-slate-400/72">
                      <a className="text-slate-300/78 transition hover:text-white" href={legalLinks.acceptableUse}>
                        {t.acceptableUse}
                      </a>
                      <a className="text-slate-300/78 transition hover:text-white" href={legalLinks.refund}>
                        {t.refund}
                      </a>
                      <a className="text-slate-300/78 transition hover:text-white" href={legalLinks.contact}>
                        {t.contact}
                      </a>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mb-5">
                  <h1 className="text-2xl font-bold text-white">{t.signedInTitle}</h1>
                  <p className="mt-2 text-sm leading-7 text-slate-300/70">{t.signedInSubtitle}</p>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400/66">{t.brand}</div>
                    <div className="mt-3 text-base font-semibold text-white">{user.email}</div>
                    <div className="mt-1 text-xs text-slate-400/68">{user.uid}</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:border-white/18 hover:bg-white/[0.08]"
                        onClick={() => void refreshAccount()}
                      >
                        {checking ? t.loading : t.refresh}
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-rose-400/24 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-400/36 hover:bg-rose-500/14"
                        onClick={() => void handleSignOut()}
                      >
                        {t.signOut}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400/66">{t.subscription}</div>
                    {subscription ? (
                      <div className="mt-4 grid gap-3 text-sm text-slate-200/82">
                        <div className="inline-flex w-fit rounded-full border border-emerald-400/26 bg-emerald-500/12 px-3 py-2 text-xs font-semibold text-emerald-100">
                          {t.active}
                        </div>
                        <div>
                          {t.plan}: <span className="font-semibold text-white">{subscription.plan || '--'}</span>
                        </div>
                        <div>
                          {t.tier}: <span className="font-semibold text-white">{subscription.tier || 'public'}</span>
                        </div>
                        <div>
                          {t.remaining}: <span className="font-semibold text-white">{formatRemaining(subscription.expires_at)}</span>
                        </div>
                        <p className="pt-1 text-xs leading-6 text-slate-300/70">{t.openTool}</p>
                      </div>
                    ) : (
                      <div className="mt-4">
                        <p className="text-sm leading-7 text-slate-300/72">{t.noSubscription}</p>
                        <div className="mt-4 grid gap-2">
                          <a
                            className="btn-primary rounded-2xl px-4 py-3 text-center text-sm font-semibold"
                            href={`mailto:support@saturnws.com?subject=Saturn%20Workspace%20Beta%20Access&body=${encodeURIComponent(user.email || '')}`}
                          >
                            {t.requestBeta}
                          </a>
                          <button
                            type="button"
                            className="rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white transition hover:border-white/18 hover:bg-white/[0.08]"
                            onClick={() => void refreshAccount()}
                          >
                            {checking ? t.loading : t.refresh}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </section>
    </main>
  )
}
