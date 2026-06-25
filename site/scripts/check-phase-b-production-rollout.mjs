import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const WEB_PLATFORM = path.resolve(ROOT, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(WEB_PLATFORM, relativePath), 'utf8')
}

function assertIncludes(source, token, label) {
  if (!source.includes(token)) throw new Error(`${label}: missing ${token}`)
}

function assertNotIncludes(source, token, label) {
  if (source.includes(token)) throw new Error(`${label}: forbidden ${token}`)
}

function sliceBetween(source, startToken, endToken, label) {
  const start = source.indexOf(startToken)
  if (start < 0) throw new Error(`${label}: missing start token ${startToken}`)
  const end = source.indexOf(endToken, start + startToken.length)
  if (end < 0) throw new Error(`${label}: missing end token ${endToken}`)
  return source.slice(start, end)
}

const authWorker = read('workers/auth/src/index.ts')
const authTypes = read('workers/auth/src/types.ts')
const authSupabase = read('workers/auth/src/lib/supabase.ts')
const authProfileMigration = read('workers/auth/migrations/009_account_profiles.sql')
const authVerificationMigration = read('workers/auth/migrations/008_email_verification_core.sql')
const authWrangler = read('workers/auth/wrangler.toml')
const policyWorker = read('workers/policy/src/index.ts')
const policyCatalog = read('workers/policy/src/email_catalog.ts')
const policyMigration = read('workers/policy/migrations/0011_auth_email_verification_events.sql')
const policySensitiveMigration = read('workers/policy/migrations/0012_email_sensitive_payloads.sql')
const productionAdapters = read('site/src/new-ui/adapters/productionAdapters.ts')
const productionPages = read('site/src/new-ui/pages/production/ProductionPages.tsx')
const emailVerificationPage = sliceBetween(
  productionPages,
  'function EmailVerificationProductionPage',
  'export function PortalProductionPages',
  'email verification page block',
)
const pricingSection = sliceBetween(
  productionPages,
  'function PricingSection',
  'function FaqSection',
  'pricing section block',
)

for (const token of ['email_verified_at', 'verification_source']) {
  assertIncludes(authTypes, token, `auth profile type ${token}`)
  assertIncludes(authSupabase, token, `auth supabase profile ${token}`)
  assertIncludes(authProfileMigration, token, `auth profile migration ${token}`)
}

for (const source of ['firebase_google', 'saturnws_otp', 'admin', 'legacy_unknown']) {
  assertIncludes(authProfileMigration, source, `verification source ${source}`)
}

assertIncludes(authVerificationMigration, 'delivery_failed', 'email verification delivery failed status')
assertIncludes(authWorker, 'verificationSource: "saturnws_otp"', 'OTP verification source')
assertIncludes(authWorker, 'isTrustedGoogleIdentity(firebaseUser)', 'Google verification source')
assertIncludes(authWorker, 'EMAIL_VERIFICATION_REQUIRED', 'protected account endpoints gate unverified email/password users')
assertIncludes(authWorker, 'AUTH_EMAIL_ENQUEUE_URL', 'auth email enqueue URL')
assertIncludes(authWorker, 'AUTH_EMAIL_ENQUEUE_TOKEN', 'auth email enqueue token')
assertIncludes(authWorker, 'auth.email_verification', 'auth email verification event')
assertIncludes(authWorker, 'auth.verification_resend', 'auth verification resend event')
assertNotIncludes(authWorker, 'auth.email_verification_requested', 'legacy auth verification event must not be emitted')
assertIncludes(authWorker, 'function emailVerificationResolveError', 'auth worker email verification error normalizer')
assertIncludes(authWorker, 'handleEmailVerificationCancel', 'auth worker email verification cancel handler')
assertIncludes(authWorker, 'apiPath === "/email-verification/cancel"', 'auth worker email verification cancel route')
assertIncludes(authWorker, 'superseded_by_email_change', 'auth worker records superseded email verification audit result')
assertIncludes(authWorker, 'AUTH_SESSION_EXPIRED', 'auth worker unauthenticated verification response')
assertIncludes(authWorker, 'EMAIL_REQUIRED', 'auth worker email-required verification response')
assertIncludes(authWorker, 'if (user instanceof Response) return user', 'auth worker verification handlers return normalized resolve errors')

assertIncludes(authWrangler, 'EMAIL_AUTH_ENABLED = "true"', 'auth production email flag enabled')
assertNotIncludes(authWrangler, 'EMAIL_VERIFICATION_TEST_TRANSPORT', 'auth production test transport')

assertIncludes(policyWorker, '/v1/internal/email/auth/enqueue', 'policy internal auth email route')
assertIncludes(policyWorker, 'AUTH_EMAIL_ENQUEUE_TOKEN', 'policy internal auth token')
assertIncludes(policyWorker, 'AUTH_EMAIL_VERIFICATION_EVENTS', 'policy auth email event allowlist')
assertIncludes(policyWorker, 'readLimitedJson', 'policy payload size limit')
assertIncludes(policyWorker, 'code_redacted: true', 'policy redacted template data')
assertIncludes(policyWorker, 'EMAIL_SENSITIVE_PAYLOAD_KEY_B64', 'policy sensitive payload key')
assertIncludes(policyWorker, 'encryptSensitiveEmailPayload', 'policy sensitive payload encryption')
assertIncludes(policyWorker, 'decryptSensitiveEmailPayload', 'policy sensitive payload decryption')
assertIncludes(policyWorker, 'sensitivePayload:', 'policy auth payload stored separately')
assertIncludes(policyWorker, 'purgeSensitiveEmailPayload', 'policy sensitive payload purge')
assertIncludes(policyWorker, 'cancelSupersededAuthEmailJobs', 'policy superseded OTP job cancellation')
assertIncludes(policyWorker, 'safeEqualHashed', 'policy timing-safe token comparison')
assertIncludes(policyCatalog, '"auth.email_verification"', 'policy catalog auth verification')
assertIncludes(policyCatalog, '"auth.verification_resend"', 'policy catalog auth resend')
assertIncludes(policyMigration, 'auth.email_verification', 'policy D1 auth verification migration')
assertIncludes(policyMigration, 'auth.verification_resend', 'policy D1 auth resend migration')
assertIncludes(policySensitiveMigration, 'sensitive_payload_ciphertext', 'policy D1 sensitive payload ciphertext')
assertIncludes(policySensitiveMigration, 'sensitive_payload_expires_at', 'policy D1 sensitive payload expiry')
assertIncludes(policySensitiveMigration, 'sensitive_payload_purged_at', 'policy D1 sensitive payload purge time')

assertNotIncludes(productionAdapters, 'baseUser.emailVerified || profile?.email_verified', 'frontend Firebase/profile verification drift')
assertNotIncludes(productionAdapters, 'user.emailVerified || provisioned.profile.email_verified', 'frontend signup verification drift')
assertNotIncludes(productionAdapters, 'return provisionCurrentFirebaseUser({\n          displayName: input.displayName', 'frontend email/password signup must not provision profile before OTP')
assertIncludes(productionAdapters, "emailVerificationState: 'verification_pending'", 'frontend initial hydration state')
assertIncludes(productionAdapters, 'async function refreshAuthenticatedAccountState', 'frontend shared auth refresh helper')
assertIncludes(productionAdapters, 'await refreshAuthenticatedAccountState(true)', 'frontend OTP verification refreshes profile source of truth')
assertIncludes(productionAdapters, 'clearAccountBootstrap()', 'frontend OTP verification clears stale account bootstrap cache')
assertIncludes(productionPages, 'function emailRequiredMessage', 'frontend localized email-required message')
assertIncludes(productionPages, 'function loadPendingEmailVerification', 'frontend verification context loader')
assertIncludes(productionPages, 'function savePendingEmailVerification', 'frontend verification context writer')
assertIncludes(emailVerificationPage, 'setError(authErrorMessage(err, t, locale))', 'frontend verification errors use stable localized user-safe copy')
assertNotIncludes(emailVerificationPage, 'authErrorMessage(err, t))', 'frontend verification errors must not omit locale')
assertIncludes(emailVerificationPage, 'verification-destination', 'frontend verification destination is shown as fixed account context')
assertIncludes(emailVerificationPage, 'auth.cancelEmailVerification', 'frontend change-email path cancels the active verification')
assertIncludes(emailVerificationPage, 'saveSignupPrefill', 'frontend change-email path preserves safe registration fields')
assertNotIncludes(emailVerificationPage, 'id="verify-email"', 'frontend verification page must not render an editable email input')
assertNotIncludes(emailVerificationPage, 'setEmail', 'frontend verification page must not mutate the verification email')
assertNotIncludes(emailVerificationPage, 'window.sessionStorage.setItem(PENDING_EMAIL_VERIFICATION_KEY, event.target.value)', 'frontend verification page must not store arbitrary email input')
assertNotIncludes(pricingSection, 'pricing-included', 'pricing must not render the old shared feature strip')
assertNotIncludes(pricingSection, 'checkoutUnavailable', 'pricing must not render a large checkout-unavailable banner')
assertNotIncludes(pricingSection, 'descriptionForPlan', 'pricing cards must not imply feature differences through plan descriptions')
assertIncludes(pricingSection, 'trialNoteForPlan', 'pricing cards must place trial terms inside eligible plan cards')
assertIncludes(pricingSection, "plan.id !== 'monthly' && plan.id !== 'annual'", 'weekly pricing card must not receive trial copy')
assertNotIncludes(productionPages, "setError('email_required')", 'frontend must not expose raw email_required')
assertNotIncludes(emailVerificationPage, "setError(err instanceof Error ? err.message", 'frontend verification page must not expose raw provider errors')

console.log('Phase B production rollout contract checks passed.')
