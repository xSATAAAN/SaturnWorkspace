import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const productionPage = readFileSync(join(root, 'src/new-ui/pages/production/ProductionPages.tsx'), 'utf8')
const workspaceShell = readFileSync(join(root, 'src/new-ui/layouts/WorkspaceShell.tsx'), 'utf8')
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
