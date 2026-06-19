import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const WEB_PLATFORM = path.resolve(ROOT, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(WEB_PLATFORM, relativePath), 'utf8')
}

function exists(relativePath) {
  return fs.existsSync(path.join(WEB_PLATFORM, relativePath))
}

function assertIncludes(source, token, label) {
  if (!source.includes(token)) {
    throw new Error(`${label}: missing ${token}`)
  }
}

function assertNotIncludes(source, token, label) {
  if (source.includes(token)) {
    throw new Error(`${label}: forbidden ${token}`)
  }
}

const productionAdapters = read('site/src/new-ui/adapters/productionAdapters.ts')
const productionPages = read('site/src/new-ui/pages/production/ProductionPages.tsx')
const supportApi = read('site/src/api/support.ts')
const emailVerificationApi = read('site/src/api/emailVerification.ts')
const featureFlags = read('site/src/new-ui/adapters/productionFeatureFlags.ts')

for (const route of [
  '/email-verification/request',
  '/email-verification/verify',
  '/email-verification/status',
]) {
  assertIncludes(emailVerificationApi, route, `site email verification API route ${route}`)
}

for (const route of [
  '/v1/web/support/messages',
  '/v1/web/support/threads',
  '/v1/web/support/thread',
  '/v1/web/support/reply',
  '/v1/web/support/status',
]) {
  assertIncludes(supportApi, route, `site support API route ${route}`)
}

assertIncludes(productionAdapters, 'createWebSupportTicket', 'production support create')
assertIncludes(productionAdapters, 'fetchWebSupportThreads', 'production support list')
assertIncludes(productionAdapters, 'replyWebSupportThread', 'production support reply')
assertIncludes(productionAdapters, 'updateWebSupportStatus', 'production support status')
assertIncludes(productionAdapters, 'requestEmailVerificationCode', 'production email verification request')
assertIncludes(productionAdapters, 'verifyEmailVerificationCode', 'production email verification verify')
assertNotIncludes(productionAdapters, 'return []', 'production adapters must not hide missing data with empty arrays')
assertNotIncludes(productionAdapters, 'customer_web_support_requires_desktop_session_contract', 'customer support must not remain disabled')

assertIncludes(productionPages, 'auth.requestEmailVerification', 'auth signup email verification UI')
assertIncludes(productionPages, 'auth.verifyEmailCode', 'auth email verification code UI')
assertIncludes(productionPages, 'support.createTicket', 'portal support create UI')
assertIncludes(productionPages, 'support.replyThread', 'portal support reply UI')
assertIncludes(productionPages, 'admin.sendSupportReply', 'admin support reply UI')
assertIncludes(productionPages, 'admin.setSupportBlocked', 'admin support block UI')
assertIncludes(productionPages, 'adapters.admin.uploadRelease', 'admin release upload UI')
assertIncludes(productionPages, 'adapters.admin.publishRelease', 'admin release publish UI')
assertIncludes(productionPages, 'adapters.admin.updateRemoteControls', 'admin policy update UI')

for (const flag of [
  'emailVerification',
  'payments',
  'publicCheckout',
  'customerDownloads',
  'customerSupport',
  'adminPaymentManagement',
]) {
  assertIncludes(featureFlags, flag, `production feature flag ${flag}`)
}

const backendContractFiles = [
  'workers/policy/src/index.ts',
  'workers/auth/src/index.ts',
  'workers/auth/src/lib/supabase.ts',
  'workers/auth/migrations/008_email_verification_core.sql',
  'workers/admin/migrations/008_payment_core_model.sql',
  'workers/admin/src/routes/payments.js',
  'workers/admin/src/services/orders.js',
  'workers/admin/src/validation/payments.js',
]

const missingBackendFiles = backendContractFiles.filter((file) => !exists(file))

if (missingBackendFiles.length === 0) {
  const policyWorker = read('workers/policy/src/index.ts')
  const authWorker = read('workers/auth/src/index.ts')
  const authSupabase = read('workers/auth/src/lib/supabase.ts')
  const emailMigration = read('workers/auth/migrations/008_email_verification_core.sql')
  const paymentMigration = read('workers/admin/migrations/008_payment_core_model.sql')
  const adminPayments = read('workers/admin/src/routes/payments.js')
  const paymentOrders = read('workers/admin/src/services/orders.js')
  const paymentValidation = read('workers/admin/src/validation/payments.js')

  assertIncludes(authWorker, 'apiPath === "/account/identity"', 'auth worker identity endpoint')
  for (const route of [
    '/email-verification/request',
    '/email-verification/verify',
    '/email-verification/status',
  ]) {
    assertIncludes(authWorker, route, `auth email verification route ${route}`)
  }
  assertIncludes(authWorker, 'handleEmailVerificationRequest', 'auth email verification request handler')
  assertIncludes(authWorker, 'handleEmailVerificationVerify', 'auth email verification verify handler')
  assertIncludes(authWorker, 'hmacSha256Hex', 'auth email verification hash')
  assertIncludes(authWorker, 'timingSafeEqualHex', 'auth email verification timing-safe compare')
  assertIncludes(authWorker, 'EMAIL_VERIFICATION_TEST_TRANSPORT', 'auth test transport guard')
  assertIncludes(authSupabase, 'account_email_verifications', 'auth email verification storage')
  assertIncludes(authSupabase, 'account_email_verification_audit', 'auth email verification audit')
  assertIncludes(emailMigration, 'account_email_verifications', 'email verification migration table')
  assertIncludes(emailMigration, 'code_hash', 'email verification migration stores hash only')

  for (const route of [
    '/v1/web/support/messages',
    '/v1/web/support/threads',
    '/v1/web/support/thread',
    '/v1/web/support/reply',
    '/v1/web/support/status',
  ]) {
    assertIncludes(policyWorker, route, `policy web support route ${route}`)
  }

  assertIncludes(policyWorker, 'requireWebSupportUser', 'policy web support Firebase auth guard')
  assertIncludes(policyWorker, 'thread_not_found', 'policy support tenant isolation')
  assertIncludes(policyWorker, 'support_rate_limited', 'policy support rate limit')
  assertIncludes(paymentMigration, 'billing_plans', 'payment migration plans table')
  assertIncludes(paymentMigration, 'payment_orders', 'payment migration orders table')
  assertIncludes(adminPayments, 'handleCreatePayment', 'admin payment create route')
  assertIncludes(paymentOrders, 'idempotency_key', 'admin payment idempotency service')
  assertIncludes(paymentValidation, 'idempotency_key', 'admin payment idempotency validation')
} else {
  console.log(`Backend contract source checks skipped; missing files in this checkout: ${missingBackendFiles.join(', ')}`)
}

console.log('Round 3B production integration contract checks passed.')
