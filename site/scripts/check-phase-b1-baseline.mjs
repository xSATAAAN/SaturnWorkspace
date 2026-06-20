import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const productionPage = readFileSync(join(root, 'src/new-ui/pages/production/ProductionPages.tsx'), 'utf8')
const workspaceShell = readFileSync(join(root, 'src/new-ui/layouts/WorkspaceShell.tsx'), 'utf8')
const sharedChrome = readFileSync(join(root, 'src/new-ui/layouts/SharedChrome.tsx'), 'utf8')
const portalCss = readFileSync(join(root, 'src/new-ui/foundation/portal.css'), 'utf8')
const messages = readFileSync(join(root, 'src/new-ui/i18n/messages.ts'), 'utf8')
const adapters = readFileSync(join(root, 'src/new-ui/adapters/productionAdapters.ts'), 'utf8')
const authWorker = readFileSync(join(root, '../workers/auth/src/index.ts'), 'utf8')

const checks = [
  {
    name: 'account bootstrap uses shell skeleton instead of full-page retry',
    pass: productionPage.includes('<PortalRouteSkeleton page={page} />') && !productionPage.includes('function RequireAuth('),
  },
  {
    name: 'subscription UI consumes current_subscription and no-subscription state',
    pass: productionPage.includes('data?.current_subscription') && productionPage.includes("'No active subscription'") && productionPage.includes('projection?.existence === \'none\''),
  },
  {
    name: 'support thread rendering uses semantic sender roles',
    pass: productionPage.includes('SupportThreadMessage') && productionPage.includes('supportSenderRole') && productionPage.includes('supportMessageClass'),
  },
  {
    name: 'page skeletons are page-specific rather than generic card placeholders',
    pass: productionPage.includes('PortalOverviewSkeleton') && productionPage.includes('PortalSupportSkeleton') && productionPage.includes('AdminEmailOperationsSkeleton') && !productionPage.includes('PageSkeleton cards'),
  },
  {
    name: 'public contact page routes support to authenticated support center',
    pass: productionPage.includes("returnTo: '/account/support'") && !productionPage.includes('You are signed in') && !productionPage.includes('أنت مسجّل الدخول'),
  },
  {
    name: 'public footer separates contact from support portal routing',
    pass: sharedChrome.includes("returnTo: '/account/support'") && sharedChrome.includes("returnTo: '/account/subscription'") && sharedChrome.includes('footerRoute(page)'),
  },
  {
    name: 'support message CSS distinguishes customer, support, internal, and system roles',
    pass: portalCss.includes('support-message--customer') && portalCss.includes('var(--brand-primary)') && portalCss.includes('support-message--support_agent') && portalCss.includes('support-message--internal_note') && portalCss.includes('support-message--system'),
  },
  {
    name: 'technical placeholder copy is not exposed in UI messages',
    pass: !messages.includes('Plan data unavailable') && !messages.includes('Backend integration required') && !messages.includes('Product decision required') && !messages.includes('Integration pending') && !messages.includes('الربط قيد الانتظار'),
  },
  {
    name: 'portal brand navigates to public home while admin brand stays admin',
    pass: workspaceShell.includes("admin ? { surface: 'admin', page: 'overview' } : { surface: 'public', page: 'home' }"),
  },
  {
    name: 'production adapter avoids forced token refresh for account/support reads',
    pass: !adapters.includes('getIdToken(true)') && adapters.includes('accountBootstrapInflight') && adapters.includes('saturnws:account_bootstrap'),
  },
  {
    name: 'auth worker exposes current_subscription and history summary',
    pass: authWorker.includes('current_subscription: runtime') && authWorker.includes('subscription_history_summary: historySummary') && authWorker.includes('selectCurrentSubscription'),
  },
]

const failed = checks.filter((check) => !check.pass)
if (failed.length) {
  console.error('Phase B.1 baseline checks failed:')
  failed.forEach((check) => console.error(`- ${check.name}`))
  process.exit(1)
}

console.log('Phase B.1 baseline checks passed.')
