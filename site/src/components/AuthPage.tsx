import { useEffect, useMemo, useRef, useState } from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import heroImage from '../assets/hero.png'
import appIcon from '../assets/saturnws-app-icon.png'
import { firebaseAuth } from '../lib/firebase'

type AuthPageProps = {
  lang: 'en' | 'ar'
  initialMode: 'login' | 'signup'
}

type AuthMode = 'login' | 'signup'

type ActivationPayload = {
  ticket: string
  legacyCode?: string
}

const AUTH_BASE = 'https://auth.saturnws.com'
const EMAIL_LINK_STORAGE_KEY = 'saturnws_email_link_email'
const ACTIVATION_STORAGE_KEY = 'saturnws_activation_payload'

function loadActivationPayload(targetPath: string): ActivationPayload | null {
  if (typeof window === 'undefined') return null

  const url = new URL(window.location.href)
  const ticket = String(url.searchParams.get('ticket') || url.searchParams.get('device_code') || '').trim()
  const legacyCode = String(url.searchParams.get('code') || '').trim().toUpperCase()

  if (ticket || legacyCode) {
    const payload: ActivationPayload = {
      ticket,
      legacyCode: legacyCode || undefined,
    }
    window.sessionStorage.setItem(ACTIVATION_STORAGE_KEY, JSON.stringify(payload))
    url.searchParams.delete('ticket')
    url.searchParams.delete('device_code')
    url.searchParams.delete('code')
    const nextSearch = url.searchParams.toString()
    window.history.replaceState({}, document.title, `${targetPath}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`)
    return payload
  }

  try {
    const raw = window.sessionStorage.getItem(ACTIVATION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ActivationPayload>
    const storedTicket = String(parsed.ticket || '').trim()
    const storedLegacyCode = String(parsed.legacyCode || '').trim().toUpperCase()
    if (!storedTicket && !storedLegacyCode) return null
    return {
      ticket: storedTicket,
      legacyCode: storedLegacyCode || undefined,
    }
  } catch {
    return null
  }
}

function clearActivationPayload() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(ACTIVATION_STORAGE_KEY)
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
      ar: 'طريقة تسجيل الدخول هذه غير مفعلة حاليًا.',
      en: 'This sign-in method is not enabled right now.',
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
      ar: 'رابط تسجيل الدخول غير صالح أو انتهت صلاحيته.',
      en: 'The sign-in link is invalid or expired.',
    },
    'auth/expired-action-code': {
      ar: 'انتهت صلاحية رابط تسجيل الدخول.',
      en: 'The sign-in link has expired.',
    },
  }

  const localized = map[code]
  if (localized) return isAr ? localized.ar : localized.en
  return input instanceof Error ? input.message : String(input || '')
}

function writeAuthRoute(nextMode: AuthMode) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const nextPath = nextMode === 'signup' ? '/account/signup' : '/account/signin'
  window.history.replaceState({}, document.title, `${nextPath}${url.search}${url.hash}`)
}

export function AuthPage({ lang, initialMode }: AuthPageProps) {
  const isAr = lang === 'ar'
  const emailLinkHandledRef = useRef(false)
  const completionStartedRef = useRef(false)
  const [user, setUser] = useState<User | null>(firebaseAuth.currentUser)
  const [authReady, setAuthReady] = useState(Boolean(firebaseAuth.currentUser))
  const [authMode, setAuthMode] = useState<AuthMode>(initialMode)
  const [activationPayload] = useState<ActivationPayload | null>(() =>
    loadActivationPayload(initialMode === 'signup' ? '/account/signup' : '/account/signin'),
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [completingEmailLink, setCompletingEmailLink] = useState(false)
  const [needsEmailForLink, setNeedsEmailForLink] = useState(false)
  const [linkingDevice, setLinkingDevice] = useState(false)
  const [deviceLinked, setDeviceLinked] = useState(false)
  const [deviceLinkResult, setDeviceLinkResult] = useState<'linked' | 'already-linked' | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [slideIndex, setSlideIndex] = useState(0)

  const t = useMemo(
    () =>
      isAr
        ? {
            brand: 'Saturn Workspace',
            signInTitle: 'تسجيل الدخول',
            signInSubtitle: 'سجّل دخولك للوصول إلى مساحة العمل الخاصة بك.',
            signUpTitle: 'إنشاء حساب',
            signUpSubtitle: 'أنشئ حسابك للبدء في استخدام المنصة.',
            accountReadyTitle: 'تم تسجيل الدخول',
            accountReadySubtitle: 'يمكنك الآن الانتقال إلى صفحة الحساب وإدارة بياناتك.',
            deviceLinkTitle: 'ربط الأداة بالحساب',
            deviceLinkSubtitle: 'بعد تسجيل الدخول، سيتم ربط جلسة الأداة بحسابك تلقائيًا.',
            email: 'البريد الإلكتروني',
            password: 'كلمة المرور',
            confirmPassword: 'تأكيد كلمة المرور',
            logIn: 'تسجيل الدخول',
            createAccount: 'إنشاء الحساب',
            loggingIn: 'جار تسجيل الدخول...',
            creatingAccount: 'جار إنشاء الحساب...',
            continueWithGoogle: 'تسجيل الدخول باستخدام Google',
            continueWithGoogleLoading: 'جار فتح Google...',
            forgotPassword: 'نسيت كلمة المرور؟',
            resetSent: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك.',
            hide: 'إخفاء',
            show: 'إظهار',
            or: 'أو',
            completeMagicLink: 'إكمال تسجيل الدخول',
            magicLinkTitle: 'إكمال تسجيل الدخول من البريد',
            magicLinkNeedsEmail: 'أدخل نفس البريد الإلكتروني لإكمال رابط تسجيل الدخول.',
            magicLinkSuccess: 'تم تسجيل الدخول عبر الرابط بنجاح.',
            noAccount: 'ليس لديك حساب؟',
            haveAccount: 'لديك حساب بالفعل؟',
            createOne: 'إنشاء حساب',
            signInHere: 'تسجيل الدخول',
            home: 'الرئيسية',
            goToAccount: 'فتح صفحة الحساب',
            backToTool: 'يمكنك الآن العودة إلى الأداة أو إغلاق هذه الصفحة.',
            deviceSuccess: 'تم ربط الأداة بهذا الحساب بنجاح.',
            noSubscription:
              'تم تسجيل الدخول، لكن لا يوجد اشتراك نشط لهذا الحساب بعد. بعد منحه اشتراكًا من لوحة الإدارة ستكمل الأداة الفتح تلقائيًا.',
            activationMissing: 'جلسة ربط الأداة غير موجودة أو انتهت. ارجع إلى الأداة وابدأ تسجيل الدخول مرة أخرى.',
            legalLead: 'بإنشائك للحساب، فأنت توافق على ',
            terms: 'شروط الاستخدام',
            privacy: 'سياسة الخصوصية',
            cookies: 'سياسة ملفات تعريف الارتباط',
            consentRequired: 'يجب الموافقة على الشروط والسياسات للمتابعة.',
            passwordMismatch: 'كلمتا المرور غير متطابقتين.',
            signupFromSite: 'إذا لم يكن لديك حساب، يمكنك إنشاء حساب جديد من الموقع.',
            signUpCta: 'إنشاء حساب جديد',
            selectedPlan: 'الخطة المطلوبة',
            monthly: 'شهري',
            yearly: 'سنوي',
            slides: [
              {
                title: 'إدارة أسهل لمساحة العمل',
                body: 'وصول أوضح للحسابات والنسخ الاحتياطية والجلسات من واجهة واحدة هادئة.',
              },
              {
                title: 'تحكم أدق في البيانات والمهام',
                body: 'ترتيب أفضل للحسابات والتذكيرات والنسخ السحابي على حساب المستخدم نفسه.',
              },
              {
                title: 'تشغيل أسرع وأوضح يوميًا',
                body: 'مسار واحد لتسجيل الدخول والحساب بدل التنقل بين شاشات مبعثرة.',
              },
            ],
          }
        : {
            brand: 'Saturn Workspace',
            signInTitle: 'Sign in',
            signInSubtitle: 'Sign in to access your workspace.',
            signUpTitle: 'Create account',
            signUpSubtitle: 'Create your account to start using the platform.',
            accountReadyTitle: 'Signed in successfully',
            accountReadySubtitle: 'You can now open your account page and manage your settings.',
            deviceLinkTitle: 'Link tool to account',
            deviceLinkSubtitle: 'After signing in, the desktop tool session will be linked automatically.',
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
            hide: 'Hide',
            show: 'Show',
            or: 'Or',
            completeMagicLink: 'Complete sign-in',
            magicLinkTitle: 'Complete sign-in from email',
            magicLinkNeedsEmail: 'Enter the same email address to complete the sign-in link.',
            magicLinkSuccess: 'Signed in successfully with the email link.',
            noAccount: "Don't have an account?",
            haveAccount: 'Already have an account?',
            createOne: 'Create account',
            signInHere: 'Sign in',
            home: 'Home',
            goToAccount: 'Open account page',
            backToTool: 'You can now return to the desktop app or close this page.',
            deviceSuccess: 'The desktop tool is now linked to this account.',
            noSubscription:
              'You are signed in, but this account does not have an active subscription yet. Once access is granted from the admin dashboard, the desktop app will continue automatically.',
            activationMissing: 'This tool-link session is missing or expired. Return to the desktop app and start sign-in again.',
            legalLead: 'By creating an account, you agree to the ',
            terms: 'Terms of Use',
            privacy: 'Privacy Policy',
            cookies: 'Cookie Policy',
            consentRequired: 'You must accept the terms and policies to continue.',
            passwordMismatch: 'Passwords do not match.',
            signupFromSite: "If you don't have an account yet, create one from the website.",
            signUpCta: 'Create new account',
            selectedPlan: 'Selected plan',
            monthly: 'Monthly',
            yearly: 'Yearly',
            slides: [
              {
                title: 'A calmer way to run your workspace',
                body: 'Clearer access to accounts, backup, and sessions from one quiet flow.',
              },
              {
                title: 'Sharper control over data and tasks',
                body: 'Better structure for accounts, reminders, and private cloud backup.',
              },
              {
                title: 'A faster and cleaner daily flow',
                body: 'One account path instead of jumping through disconnected screens.',
              },
            ],
          },
    [isAr],
  )

  const selectedPlan = useMemo(() => {
    if (typeof window === 'undefined') return ''
    const value = String(new URLSearchParams(window.location.search).get('plan') || '').trim().toLowerCase()
    return value === 'monthly' || value === 'yearly' ? value : ''
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % t.slides.length)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [t.slides.length])

  useEffect(() => {
    setAuthMode(initialMode)
  }, [initialMode])

  useEffect(() => {
    const stop = onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser)
      setAuthReady(true)
    })
    return () => stop()
  }, [])

  useEffect(() => {
    if (!authReady || !user || activationPayload || deviceLinked) return
    const timer = window.setTimeout(() => {
      window.location.replace('/account')
    }, 280)
    return () => window.clearTimeout(timer)
  }, [activationPayload, authReady, deviceLinked, user])

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

  async function completeDeviceLink(nextUser: User) {
    if (!activationPayload || linkingDevice || completionStartedRef.current) return
    completionStartedRef.current = true
    setLinkingDevice(true)
    setError('')
    setInfo('')
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
        const code = String(payload?.error || `request_failed_${response.status}`)
        const alreadyLinkedErrors = new Set(['already_linked', 'device_already_linked', 'session_already_linked'])
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
        if (alreadyLinkedErrors.has(code)) {
          clearActivationPayload()
          setDeviceLinkResult('already-linked')
          setDeviceLinked(true)
          setInfo(t.deviceSuccess)
          return
        }
        throw new Error(subscriptionErrors.has(code) ? t.noSubscription : code)
      }
      clearActivationPayload()
      setDeviceLinkResult('linked')
      setDeviceLinked(true)
      setInfo(t.deviceSuccess)
    } catch (err) {
      completionStartedRef.current = false
      setError(err instanceof Error ? err.message : normalizeFirebaseError(err, isAr))
    } finally {
      setLinkingDevice(false)
    }
  }

  useEffect(() => {
    if (!authReady || !user || !activationPayload || deviceLinked) return
    void completeDeviceLink(user)
  }, [activationPayload, authReady, deviceLinked, user])

  function switchMode(nextMode: AuthMode) {
    setAuthMode(nextMode)
    setError('')
    setInfo('')
    setConfirmPassword('')
    setLegalAccepted(false)
    setNeedsEmailForLink(false)
    writeAuthRoute(nextMode)
  }

  async function handleGoogleSignIn() {
    setError('')
    setInfo('')
    setGoogleLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      const result = await signInWithPopup(firebaseAuth, provider)
      setUser(result.user)
    } catch (err) {
      setError(normalizeFirebaseError(err, isAr))
    } finally {
      setGoogleLoading(false)
    }
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
      if (!confirmPassword || password !== confirmPassword) {
        setError(t.passwordMismatch)
        return
      }
    }

    setSubmitting(true)
    setError('')
    setInfo('')
    try {
      const result =
        authMode === 'signup'
          ? await createUserWithEmailAndPassword(firebaseAuth, normalizedEmail, password)
          : await signInWithEmailAndPassword(firebaseAuth, normalizedEmail, password)
      setUser(result.user)
    } catch (err) {
      setError(normalizeFirebaseError(err, isAr))
    } finally {
      setSubmitting(false)
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

  async function handleSignOut() {
    await signOut(firebaseAuth).catch(() => undefined)
    setUser(null)
    setDeviceLinked(false)
    setDeviceLinkResult(null)
    setError('')
    setInfo('')
    completionStartedRef.current = false
  }

  const activeTitle = needsEmailForLink
    ? t.magicLinkTitle
    : activationPayload
      ? t.deviceLinkTitle
      : authMode === 'signup'
        ? t.signUpTitle
        : t.signInTitle

  const activeSubtitle = needsEmailForLink
    ? t.magicLinkNeedsEmail
    : activationPayload
      ? t.deviceLinkSubtitle
      : authMode === 'signup'
        ? t.signUpSubtitle
        : t.signInSubtitle

  const legalLinks = {
    terms: '/terms/',
    privacy: '/privacy/',
    cookies: '/cookies/',
    acceptableUse: '/acceptable-use/',
    refund: '/refund/',
    contact: '/contact/',
  }

  const linkCopy = isAr
    ? {
        successTitle: 'تم ربط الأداة بالحساب بنجاح',
        successBody: 'يمكنك الآن العودة إلى تطبيق سطح المكتب ومتابعة استخدام مساحة العمل.',
        alreadyLinkedTitle: 'الأداة مرتبطة بالفعل بهذا الحساب',
        alreadyLinkedBody: 'يمكنك العودة إلى تطبيق سطح المكتب ومتابعة الاستخدام.',
        processingTitle: 'جارٍ ربط الأداة بالحساب...',
        processingBody: 'لن يستغرق ذلك سوى لحظات.',
        errorTitle: 'تعذر ربط الأداة بالحساب',
        errorBody: 'انتهت صلاحية الجلسة أو حدث خطأ أثناء الربط. حاول تسجيل الدخول مرة أخرى من تطبيق سطح المكتب.',
        linkedBadge: 'مرتبط',
        returnToApp: 'العودة إلى التطبيق',
        openAccount: 'فتح صفحة الحساب',
        retry: 'العودة لتسجيل الدخول',
        signOut: 'تسجيل الخروج',
        autoOpenHint: 'إذا لم يتم فتح التطبيق تلقائيًا، يمكنك إغلاق هذه الصفحة والعودة إلى التطبيق يدويًا.',
      }
    : {
        successTitle: 'The desktop tool is now linked to your account.',
        successBody: 'You can now return to the desktop app and continue using your workspace.',
        alreadyLinkedTitle: 'This tool is already linked to this account.',
        alreadyLinkedBody: 'You can return to the desktop app and continue using it.',
        processingTitle: 'Linking the desktop tool...',
        processingBody: 'This will only take a moment.',
        errorTitle: 'Unable to link the desktop tool',
        errorBody: 'The link session expired or an error occurred while linking the tool. Start the sign-in flow again from the desktop app.',
        linkedBadge: 'Linked',
        returnToApp: 'Return to the desktop app',
        openAccount: 'Open account page',
        retry: 'Back to sign in',
        signOut: 'Sign out',
        autoOpenHint: 'If the app does not open automatically, you can close this page and return to it manually.',
      }

  const showLinkStatusPage = Boolean(activationPayload && (deviceLinked || linkingDevice || error || (authReady && user)))
  const linkStatus =
    deviceLinked
      ? deviceLinkResult === 'already-linked'
        ? 'already-linked'
        : 'success'
      : error
        ? 'error'
        : showLinkStatusPage
          ? 'processing'
          : null

  const linkStatusTitle =
    linkStatus === 'already-linked'
      ? linkCopy.alreadyLinkedTitle
      : linkStatus === 'success'
        ? linkCopy.successTitle
        : linkStatus === 'error'
          ? linkCopy.errorTitle
          : linkCopy.processingTitle

  const linkStatusBody =
    linkStatus === 'already-linked'
      ? linkCopy.alreadyLinkedBody
      : linkStatus === 'success'
        ? linkCopy.successBody
        : linkStatus === 'error'
          ? error === t.noSubscription || error === t.activationMissing
          ? error
          : linkCopy.errorBody
          : linkCopy.processingBody

  useEffect(() => {
    if (!deviceLinked || typeof window === 'undefined') return
    if (window.location.pathname !== '/account/linked') {
      window.history.replaceState(null, '', '/account/linked')
    }
  }, [deviceLinked])

  function handleReturnToDesktopApp() {
    if (typeof window === 'undefined') return
    window.close()
  }

  if (showLinkStatusPage && linkStatus) {
    const isSuccessState = linkStatus === 'success' || linkStatus === 'already-linked'
    const isErrorState = linkStatus === 'error'

    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
        <section className="w-full max-w-[520px] rounded-[28px] border border-white/10 bg-slate-950/84 p-6 text-center shadow-[0_28px_80px_rgba(2,6,23,0.46)] backdrop-blur-2xl sm:p-8">
          <div className="mx-auto flex w-full justify-center">
            <img src={appIcon} alt={t.brand} className="h-14 w-14 object-contain drop-shadow-[0_14px_28px_rgba(37,99,235,0.28)]" />
          </div>

          <h1 className="mt-6 text-2xl font-bold text-white sm:text-[30px]">{linkStatusTitle}</h1>
          <p className="mt-3 text-sm leading-7 text-slate-300/76 sm:text-[15px]">{linkStatusBody}</p>

          {user?.email && isSuccessState ? (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <span className="text-sm font-semibold text-white ltr">{user.email}</span>
              <span className="inline-flex min-h-7 items-center justify-center rounded-full border border-emerald-400/28 bg-emerald-500/12 px-3 text-xs font-semibold text-emerald-200">
                {linkCopy.linkedBadge}
              </span>
            </div>
          ) : null}

          <div className="mt-6 space-y-3">
            {isSuccessState ? (
              <button
                type="button"
                className="btn-primary flex h-12 w-full items-center justify-center rounded-2xl px-5 text-sm font-semibold"
                onClick={handleReturnToDesktopApp}
              >
                {linkCopy.returnToApp}
              </button>
            ) : null}

            {isErrorState ? (
              <a className="btn-primary flex h-12 w-full items-center justify-center rounded-2xl px-5 text-sm font-semibold" href="/account/signin">
                {linkCopy.retry}
              </a>
            ) : null}

            <a
              className="flex h-12 w-full items-center justify-center rounded-2xl border border-white/12 bg-white/[0.05] px-5 text-sm font-semibold text-white transition hover:border-white/18 hover:bg-white/[0.08]"
              href="/account"
            >
              {linkCopy.openAccount}
            </a>
          </div>

          <div className="mt-4 text-xs leading-6 text-slate-400/70">{linkCopy.autoOpenHint}</div>

          <button
            type="button"
            className="mt-6 text-sm font-semibold text-rose-200/86 transition hover:text-rose-100"
            onClick={() => void handleSignOut()}
          >
            {linkCopy.signOut}
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid min-h-[calc(100vh-3rem)] items-stretch gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,480px)]">
        <aside className="relative hidden overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/60 lg:flex">
          <img src={heroImage} alt={t.brand} className="absolute inset-0 h-full w-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.22),transparent_45%),linear-gradient(180deg,rgba(2,6,23,0.14),rgba(2,6,23,0.9))]" />
          <div className="relative flex w-full flex-col p-8 xl:p-10">
            <div className="flex items-start justify-start">
              <img
                src={appIcon}
                alt={t.brand}
                className="h-12 w-12 object-contain drop-shadow-[0_18px_40px_rgba(37,99,235,0.25)]"
              />
            </div>
            <div className="flex flex-1 items-center">
              <div className="relative min-h-[188px] w-full">
                {t.slides.map((slide, index) => (
                  <div
                    key={slide.title}
                    className={`absolute inset-0 transition-all duration-500 ${
                      index === slideIndex ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
                    }`}
                  >
                    <h2 className="max-w-xl text-4xl font-bold leading-tight text-white xl:text-5xl">{slide.title}</h2>
                    <p className="mt-4 max-w-lg text-base leading-8 text-slate-200/78">{slide.body}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center gap-2">
              {t.slides.map((slide, index) => (
                <button
                  key={slide.title}
                  type="button"
                  onClick={() => setSlideIndex(index)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    index === slideIndex ? 'w-8 bg-sky-300' : 'w-2.5 bg-white/25 hover:bg-white/40'
                  }`}
                  aria-label={`${t.brand} slide ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </aside>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-md rounded-[30px] border border-white/10 bg-slate-950/76 p-5 shadow-[0_24px_60px_rgba(2,6,23,0.42)] backdrop-blur-2xl sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <img
                  src={appIcon}
                  alt={t.brand}
                  className="h-12 w-12 object-contain drop-shadow-[0_18px_40px_rgba(37,99,235,0.24)]"
                />
                <div className="mt-4 text-xl font-bold text-white">{t.brand}</div>
                <div className="mt-1 text-sm text-slate-300/72">{activeTitle}</div>
              </div>
              <a
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200/78 transition hover:border-white/16 hover:bg-white/8"
                href="/"
              >
                {t.home}
              </a>
            </div>

            <div className="mb-5 rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm leading-7 text-slate-300/74 lg:hidden">
              <div className="font-semibold text-white">{t.slides[slideIndex]?.title}</div>
              <div className="mt-1">{t.slides[slideIndex]?.body}</div>
            </div>

            {selectedPlan ? (
              <div className="mb-4 rounded-2xl border border-sky-400/18 bg-sky-400/8 px-4 py-3 text-sm text-sky-100/92">
                {t.selectedPlan}: {selectedPlan === 'monthly' ? t.monthly : t.yearly}
              </div>
            ) : null}
            {activationPayload ? (
              <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200/74">
                {activeSubtitle}
              </div>
            ) : null}
            {!authReady ? (
              <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200/74">
                {isAr ? 'جار تحميل الجلسة...' : 'Loading session...'}
              </div>
            ) : null}
            {error ? (
              <div className="mb-4 rounded-2xl border border-rose-400/24 bg-rose-500/10 px-4 py-3 text-sm leading-7 text-rose-100">
                {error}
              </div>
            ) : null}
            {info ? (
              <div className="mb-4 rounded-2xl border border-emerald-400/24 bg-emerald-500/10 px-4 py-3 text-sm leading-7 text-emerald-100">
                {info}
              </div>
            ) : null}

            {!user ? (
              <>
                <div className="mb-5 inline-flex w-full rounded-2xl border border-white/10 bg-white/[0.04] p-1">
                  <button
                    type="button"
                    className={`flex-1 rounded-[14px] px-4 py-3 text-sm font-semibold transition ${
                      authMode === 'login'
                        ? 'bg-white/10 text-white shadow-[0_8px_22px_rgba(15,23,42,0.24)]'
                        : 'text-slate-300/68 hover:text-white'
                    }`}
                    onClick={() => switchMode('login')}
                  >
                    {t.signInTitle}
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-[14px] px-4 py-3 text-sm font-semibold transition ${
                      authMode === 'signup'
                        ? 'bg-white/10 text-white shadow-[0_8px_22px_rgba(15,23,42,0.24)]'
                        : 'text-slate-300/68 hover:text-white'
                    }`}
                    onClick={() => switchMode('signup')}
                  >
                    {t.signUpTitle}
                  </button>
                </div>

                <div className="mb-5">
                  <h1 className="text-2xl font-bold text-white">{activeTitle}</h1>
                  <p className="mt-2 text-sm leading-7 text-slate-300/70">{activeSubtitle}</p>
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
                              {resetLoading ? (isAr ? 'جار الإرسال...' : 'Sending...') : t.forgotPassword}
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
                            aria-label={showPassword ? t.hide : t.show}
                          >
                            {showPassword ? '◐' : '◑'}
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
                              aria-label={showConfirmPassword ? t.hide : t.show}
                            >
                              {showConfirmPassword ? '◐' : '◑'}
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
                            {t.legalLead}
                            <a className="text-sky-300 hover:text-sky-200" href={legalLinks.terms}>
                              {t.terms}
                            </a>
                            {isAr ? ' و' : ', '}
                            <a className="text-sky-300 hover:text-sky-200" href={legalLinks.privacy}>
                              {t.privacy}
                            </a>
                            {isAr ? ' و' : ', and '}
                            <a className="text-sky-300 hover:text-sky-200" href={legalLinks.cookies}>
                              {t.cookies}
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
                      {completingEmailLink ? (isAr ? 'جار الإكمال...' : 'Completing...') : t.completeMagicLink}
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

                  <div className="space-y-3 pt-1 text-center">
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-xs text-slate-400/64">{authMode === 'signup' ? t.haveAccount : t.noAccount}</span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-sky-400/24 bg-sky-400/8 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:border-sky-400/34 hover:bg-sky-400/12"
                      onClick={() => switchMode(authMode === 'signup' ? 'login' : 'signup')}
                    >
                      {authMode === 'signup' ? t.signInHere : t.signUpCta}
                    </button>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-slate-400/72">
                      <a className="text-slate-300/78 transition hover:text-white" href={legalLinks.acceptableUse}>
                        {isAr ? 'سياسة الاستخدام المقبول' : 'Acceptable use'}
                      </a>
                      <a className="text-slate-300/78 transition hover:text-white" href={legalLinks.refund}>
                        {isAr ? 'سياسة الاسترداد' : 'Refund policy'}
                      </a>
                      <a className="text-slate-300/78 transition hover:text-white" href={legalLinks.contact}>
                        {isAr ? 'التواصل القانوني' : 'Legal contact'}
                      </a>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{user.email}</div>
                      <div className="mt-1 text-xs text-slate-400/68">{user.uid}</div>
                    </div>
                    <button
                      type="button"
                      className="rounded-xl border border-rose-400/24 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-400/36 hover:bg-rose-500/14"
                      onClick={() => void handleSignOut()}
                    >
                      {isAr ? 'خروج' : 'Sign out'}
                    </button>
                  </div>
                </div>

                {activationPayload ? (
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                    <h1 className="text-2xl font-bold text-white">{deviceLinked ? t.deviceSuccess : t.deviceLinkTitle}</h1>
                    <p className="mt-2 text-sm leading-7 text-slate-300/72">
                      {deviceLinked ? t.backToTool : linkingDevice ? (isAr ? 'جار إكمال الربط...' : 'Finishing the link...') : activeSubtitle}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      {deviceLinked ? (
                        <a
                          className="btn-primary inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold"
                          href="/account"
                        >
                          {t.goToAccount}
                        </a>
                      ) : null}
                      {error === t.noSubscription ? (
                        <a
                          className="rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:border-white/18 hover:bg-white/[0.08]"
                          href="/contact/"
                        >
                          {isAr ? 'التواصل مع الدعم' : 'Contact support'}
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                    <h1 className="text-2xl font-bold text-white">{t.accountReadyTitle}</h1>
                    <p className="mt-2 text-sm leading-7 text-slate-300/72">{t.accountReadySubtitle}</p>
                    <div className="mt-5">
                      <a className="btn-primary inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold" href="/account">
                        {t.goToAccount}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  )
}
