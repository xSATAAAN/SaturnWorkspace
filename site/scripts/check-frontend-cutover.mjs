import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const dist = path.join(root, 'dist')
const indexPath = path.join(dist, 'index.html')

const fallbackSegments = [
  'privacy',
  'terms',
  'refund',
  'cookies',
  'acceptable-use',
  'contact',
  'login',
  'download',
  'downloads',
  'releases',
  'release-notes',
  'account',
  'account/signin',
  'account/signup',
  'account/verify',
  'account/support',
  'admin',
  'admin/users',
  'admin/subscriptions',
  'admin/releases',
  'admin/support',
  'admin/policies',
  'admin/audit',
  '403',
  '404',
  '500',
  '503',
]

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!fs.existsSync(indexPath)) fail('Missing dist/index.html')

const indexHtml = fs.readFileSync(indexPath, 'utf8')
if (!indexHtml.includes('id="root"')) fail('dist/index.html is not the React app shell')
if (!indexHtml.includes('/assets/')) fail('dist/index.html does not reference built assets')

for (const segment of fallbackSegments) {
  const file = path.join(dist, segment, 'index.html')
  if (!fs.existsSync(file)) fail(`Missing SPA fallback: ${segment}/index.html`)
  const html = fs.readFileSync(file, 'utf8')
  if (html !== indexHtml) fail(`Fallback is not the new-ui SPA shell: ${segment}/index.html`)
}

for (const oldStatic of ['privacy.html', 'terms.html', 'refund.html', 'cookies.html', 'acceptable-use.html', 'contact.html', 'login.html', 'updates.html']) {
  if (fs.existsSync(path.join(dist, oldStatic))) fail(`Old static HTML leaked into dist: ${oldStatic}`)
}

const forbiddenBundleTokens = [
  '?surface',
  'PreviewSwitcher',
  'mockAdapter',
  'mockData',
  'developmentMockAdapter',
  'development-mock',
  'ui-complete-mock',
  'NewUiApp',
  'usePreviewRouter',
]

const assetsDir = path.join(dist, 'assets')
if (fs.existsSync(assetsDir)) {
  for (const entry of fs.readdirSync(assetsDir)) {
    if (!entry.endsWith('.js')) continue
    const content = fs.readFileSync(path.join(assetsDir, entry), 'utf8')
    for (const token of forbiddenBundleTokens) {
      if (content.includes(token)) {
        fail(`Development preview token leaked into production bundle: ${token} in ${entry}`)
      }
    }
  }
}

console.log(`Frontend cutover output check passed (${fallbackSegments.length} SPA fallbacks checked).`)
