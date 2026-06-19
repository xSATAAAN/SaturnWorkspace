import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, KeyRound, Link2, LockKeyhole, Mail } from 'lucide-react'
import { developmentMockAdapter } from '../../adapters/mockAdapter'
import { useExperience } from '../../app/ExperienceProvider'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Feedback'
import { Checkbox, FormField, Input, OTPInput, PasswordInput } from '../../components/ui/FormControls'
import { Brand, LocaleControl, ThemeControl, type Navigate } from '../../layouts/SharedChrome'
import { publicCopy } from '../../content/publicCopy'

function AuthShell({ children, navigate }: { children: React.ReactNode; navigate: Navigate }) {
  const { t, locale } = useExperience()
  const Arrow = locale === 'ar' ? ArrowRight : ArrowLeft
  return <main className="auth-shell"><header className="auth-header"><Brand onClick={() => navigate({ surface: 'public', page: 'home' })} /><div><LocaleControl /><ThemeControl /></div></header><section className="auth-main"><div className="auth-form-wrap">{children}</div><Button className="auth-back" variant="ghost" leadingIcon={<Arrow size={16} />} onClick={() => navigate({ surface: 'public', page: 'home' })}>{t('back')}</Button></section></main>
}

function SignIn({ navigate }: { navigate: Navigate }) {
  const { t, locale } = useExperience()
  const c = publicCopy[locale]
  return <AuthShell navigate={navigate}><div className="auth-card"><div className="auth-form"><header><span>{c.signInEyebrow}</span><h1>{c.signInTitle}</h1><p>{c.signInBody}</p></header><form className="stack" onSubmit={(event) => { event.preventDefault(); navigate({ surface: 'portal', page: 'overview' }) }}><FormField label={t('email')} htmlFor="signin-email" required><Input id="signin-email" type="email" autoComplete="email" required placeholder="name@example.com" /></FormField><FormField label={t('password')} htmlFor="signin-password" required><PasswordInput id="signin-password" autoComplete="current-password" required /></FormField><div className="split auth-form__options"><Checkbox label={t('rememberMe')} /><Button type="button" variant="text" onClick={() => navigate({ surface: 'auth', page: 'forgot' })}>{t('forgotPassword')}</Button></div><Button type="submit" variant="primary" size="lg" fullWidth>{t('signIn')}</Button></form><div className="auth-divider"><span>{t('orContinue')}</span></div><Button fullWidth size="lg">{t('continueGoogle')}</Button><p className="auth-switch">{t('noAccount')} <button type="button" onClick={() => navigate({ surface: 'auth', page: 'signup' })}>{t('signUp')}</button></p></div></div></AuthShell>
}

function SignUp({ navigate }: { navigate: Navigate }) {
  const { t } = useExperience()
  return <AuthShell navigate={navigate}><div className="auth-card"><div className="auth-form"><header><h1>{t('signUpTitle')}</h1><p>{t('signUpBody')}</p></header><form className="stack" onSubmit={(event) => { event.preventDefault(); navigate({ surface: 'auth', page: 'verify' }) }}><FormField label={t('name')} htmlFor="signup-name" required><Input id="signup-name" autoComplete="name" required /></FormField><FormField label={t('email')} htmlFor="signup-email" required><Input id="signup-email" type="email" autoComplete="email" required placeholder="name@example.com" /></FormField><FormField label={t('password')} htmlFor="signup-password" required><PasswordInput id="signup-password" autoComplete="new-password" required /></FormField><FormField label={t('confirmPassword')} htmlFor="signup-confirm" required><PasswordInput id="signup-confirm" autoComplete="new-password" required /></FormField><Checkbox label={t('agreeTerms')} required /><Button type="submit" variant="primary" size="lg" fullWidth>{t('signUp')}</Button></form><p className="auth-switch">{t('haveAccount')} <button type="button" onClick={() => navigate({ surface: 'auth', page: 'signin' })}>{t('signIn')}</button></p></div></div></AuthShell>
}

function Verification({ navigate, passwordReset = false }: { navigate: Navigate; passwordReset?: boolean }) {
  const { t } = useExperience()
  const [code, setCode] = useState('')
  const [seconds, setSeconds] = useState(45)
  const [status, setStatus] = useState<'idle' | 'loading' | 'invalid' | 'success'>('idle')
  useEffect(() => { if (seconds <= 0) return; const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer) }, [seconds])
  const verify = async () => { setStatus('loading'); const response = passwordReset ? await developmentMockAdapter.resetPasswordCode(code) : await developmentMockAdapter.verifyEmailCode(code); setStatus(response.data.valid ? 'success' : 'invalid') }
  return <AuthShell navigate={navigate}><div className="auth-form auth-form--center"><span className="auth-icon"><Mail size={23} /></span><header><h1>{passwordReset ? t('forgotTitle') : t('verificationTitle')}</h1><p>{t('verificationBody')}</p><strong>name@example.com</strong></header><OTPInput value={code} onChange={setCode} label={t('codeLabel')} /><Button variant="primary" size="lg" fullWidth loading={status === 'loading'} disabled={code.length !== 6} onClick={verify}>{t('continue')}</Button>{status === 'invalid' ? <Alert title={t('codeInvalid')} tone="danger" /> : null}{status === 'success' ? <Alert title={passwordReset ? t('success') : t('verified')} tone="success" action={<Button size="sm" onClick={() => navigate({ surface: passwordReset ? 'auth' : 'portal', page: passwordReset ? 'reset' : 'overview' })}>{t('continue')}</Button>} /> : null}<div className="auth-resend"><span>{t('didntReceive')}</span><button type="button" disabled={seconds > 0} onClick={() => setSeconds(45)}>{seconds > 0 ? `${t('resend')} · ${seconds}s` : t('resend')}</button></div><Button variant="text" onClick={() => navigate({ surface: 'auth', page: passwordReset ? 'forgot' : 'signup' })}>{t('changeEmail')}</Button><small className="muted">{t('demoOnly')} · 123456</small></div></AuthShell>
}

function ForgotPassword({ navigate }: { navigate: Navigate }) {
  const { t } = useExperience()
  return <AuthShell navigate={navigate}><div className="auth-form"><span className="auth-icon"><KeyRound size={23} /></span><header><h1>{t('forgotTitle')}</h1><p>{t('forgotBody')}</p></header><form className="stack" onSubmit={(event) => { event.preventDefault(); navigate({ surface: 'auth', page: 'forgot-code' }) }}><FormField label={t('email')} htmlFor="forgot-email" required><Input id="forgot-email" type="email" required placeholder="name@example.com" /></FormField><Button variant="primary" size="lg" fullWidth>{t('sendCode')}</Button></form></div></AuthShell>
}

function ResetPassword({ navigate }: { navigate: Navigate }) {
  const { t } = useExperience()
  const [saved, setSaved] = useState(false)
  return <AuthShell navigate={navigate}><div className="auth-form"><span className="auth-icon"><LockKeyhole size={23} /></span><header><h1>{t('resetPassword')}</h1><p>{t('forgotBody')}</p></header><form className="stack" onSubmit={(event) => { event.preventDefault(); setSaved(true) }}><FormField label={t('newPassword')} htmlFor="new-password" required><PasswordInput id="new-password" required /></FormField><FormField label={t('confirmPassword')} htmlFor="new-password-confirm" required><PasswordInput id="new-password-confirm" required /></FormField><Button variant="primary" size="lg" fullWidth>{t('resetPassword')}</Button></form>{saved ? <Alert title={t('passwordUpdated')} tone="success" action={<Button size="sm" onClick={() => navigate({ surface: 'auth', page: 'signin' })}>{t('signIn')}</Button>} /> : null}</div></AuthShell>
}

function LinkedState({ navigate, error = false }: { navigate: Navigate; error?: boolean }) {
  const { t } = useExperience()
  return <AuthShell navigate={navigate}><div className="auth-form auth-form--center"><span className="auth-icon"><Link2 size={23} /></span><header><h1>{error ? t('system503') : t('success')}</h1><p>{error ? t('systemBody') : t('accountOverviewBody')}</p></header><Alert title={error ? t('failed') : t('success')} tone={error ? 'danger' : 'success'} /><Button variant="primary" fullWidth onClick={() => navigate({ surface: error ? 'auth' : 'portal', page: error ? 'signin' : 'overview' })}>{error ? t('retry') : t('continue')}</Button></div></AuthShell>
}

export function AuthPages({ page, navigate }: { page: string; navigate: Navigate }) {
  if (page === 'signup') return <SignUp navigate={navigate} />
  if (page === 'verify') return <Verification navigate={navigate} />
  if (page === 'forgot') return <ForgotPassword navigate={navigate} />
  if (page === 'forgot-code') return <Verification navigate={navigate} passwordReset />
  if (page === 'reset') return <ResetPassword navigate={navigate} />
  if (page === 'linked') return <LinkedState navigate={navigate} />
  if (page === 'linked-error') return <LinkedState navigate={navigate} error />
  return <SignIn navigate={navigate} />
}
