/**
 * GitHub Pages has no URL rewriting. Clean URLs need path/index.html.
 * Runs after Vite build; writes into site/dist only.
 *
 * Frontend cutover note:
 * The React production app now owns public, auth, account and admin routes.
 * Do not copy legacy root HTML pages over these routes.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const dist = path.join(root, 'site', 'dist')

const ROOT_STATIC_FILES = [
  'styles.css',
  'site.js',
  'icons.svg',
  'favicon.svg',
  'favicon-sm.png',
  'favicon.png',
  'apple-touch-icon.png',
  'logo-header.png',
]

const SPA_FALLBACK_SEGMENTS = [
  'product',
  'features',
  'pricing',
  'compare',
  'download',
  'downloads',
  'releases',
  'release-notes',
  'changelog',
  'faq',
  'contact',
  'support',
  'privacy',
  'terms',
  'refund',
  'cookies',
  'acceptable-use',
  'login',
  'activate',
  'account',
  'account/signin',
  'account/signup',
  'account/verify',
  'account/linked',
  'account/subscription',
  'account/payments',
  'account/downloads',
  'account/devices',
  'account/notifications',
  'account/support',
  'account/security',
  'account/settings',
  'admin',
  'admin/users',
  'admin/subscriptions',
  'admin/commerce',
  'admin/releases',
  'admin/promos',
  'admin/support',
  'admin/communications',
  'admin/diagnostics',
  'admin/policies',
  'admin/audit',
  'admin/content',
  'admin/settings',
  'admin/coverage',
  '403',
  '404',
  '429',
  '500',
  '503',
]

function copyIfExists(srcName) {
  const from = path.join(root, srcName)
  if (!fs.existsSync(from)) return
  const to = path.join(dist, srcName)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

if (!fs.existsSync(dist)) {
  console.error('Missing site/dist - run Vite build first.')
  process.exit(1)
}

const spaIndex = path.join(dist, 'index.html')
if (!fs.existsSync(spaIndex)) {
  console.error('Missing site/dist/index.html after Vite build.')
  process.exit(1)
}

for (const segment of SPA_FALLBACK_SEGMENTS) {
  const dir = path.join(dist, segment)
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(spaIndex, path.join(dir, 'index.html'))
}

fs.copyFileSync(spaIndex, path.join(dist, '404.html'))

for (const f of ROOT_STATIC_FILES) {
  copyIfExists(f)
}

const cname = path.join(root, 'CNAME')
if (fs.existsSync(cname)) {
  fs.copyFileSync(cname, path.join(dist, 'CNAME'))
}

console.log('New UI SPA fallbacks merged into site/dist')
