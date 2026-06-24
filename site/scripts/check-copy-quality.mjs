import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const includeDist = process.argv.includes('--include-dist')
const roots = [
  'src/new-ui',
  ...(includeDist ? ['dist'] : []),
].map((item) => join(root, item)).filter(existsSync)

const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.html'])
const ignoredSegments = new Set(['node_modules', '.git', '.wrangler', 'dist', 'dist-production'])
const focusedSourceFragments = [
  'src/new-ui/app/',
  'src/new-ui/components/',
  'src/new-ui/layouts/',
  'src/new-ui/pages/',
  'src/new-ui/content/',
  'src/new-ui/i18n/',
]

const banned = [
  'Secure sign in',
  'Secure login',
  'Secure account access',
  'Plan data unavailable',
  'You are logged in',
  'You are signed in',
  'Backend integration required',
  'Product decision required',
  'Integration pending',
  'Live plan names and prices',
  'commercial source of truth',
  'Your account workspace brings',
  'No invoice service is connected yet',
  'Notification preferences are not available yet',
  'Account export is not available yet',
  'Only the current session can be shown',
  'A Windows session was verified',
  'Sign in to manage your subscription',
  'Sign in to manage access',
  'Use your email to create an account. Subscription access is managed separately.',
  'Support replies appear in this portal',
  'Technical account help is handled inside',
  'TODO',
  'Lorem ipsum',
  'دخول آمن للحساب',
  'تسجيل دخول آمن',
  'دخول موثوق',
  'وصول محمي',
  'تجربة آمنة',
  'حماية حسابك',
  'هذه الصفحة تعرض',
  'أنت مسجّل الدخول',
  'أنت مسجل الدخول',
  'تم التعرف على حسابك',
  'البوابة جاهزة',
  'البريد مفعّل',
  'يمكنك مراجعة',
  'الربط قيد الانتظار',
]

const allowedLineFragments = [
  'const banned = [',
  'const trustClaimFragments = [',
  'Backend integration required',
  'Product decision required',
  'Integration pending',
  'Live plan names and prices',
  'commercial source of truth',
  'دخول آمن للحساب',
  'تسجيل دخول آمن',
  'Secure sign in',
  'You are logged in',
  'أنت مسجل الدخول',
]

const trustClaimFragments = [
  'Secure account',
  'Secure sign',
  'Secure login',
  'Protected access',
  'Trusted access',
  'دخول آمن',
  'تسجيل دخول آمن',
  'دخول موثوق',
  'وصول محمي',
  'تجربة آمنة',
]

const failures = []

const pricingBannedFragments = [
  'Choose the access period',
  'access period',
  'Weekly access',
  'Monthly access',
  'Annual access',
  'launch pricing',
  'Current launch',
  'Current discount from',
  'Launch price',
  'سعر الإطلاق',
  'مرحلة الإطلاق',
  'مدة الوصول',
  'وصول أسبوعي',
  'وصول شهري',
  'وصول سنوي',
  'خصم حالي من',
]

const pricingSourceFragments = [
  'src/new-ui/content/publicCopy.ts',
  'src/new-ui/i18n/messages.ts',
  'src/new-ui/pages/public/PublicPages.tsx',
  'src/new-ui/pages/production/ProductionPages.tsx',
  'src/new-ui/components/ui/ProductCards.tsx',
]

const stateFixtures = [
  { id: 'pricing-normal', state: 'normal', title: 'Saturn Workspace plans', description: 'Every current plan includes the same Saturn Workspace features.', cta: 'Subscribe', actionable: true },
  { id: 'pricing-loading', state: 'loading', title: 'Loading', description: '', cta: '', actionable: false },
  { id: 'pricing-empty', state: 'empty', title: 'No plans are published', description: '', cta: '', actionable: false },
  { id: 'pricing-unavailable', state: 'unavailable', title: 'Prices could not be loaded', description: 'Try again to load the available plans.', cta: 'Try again', actionable: true },
  { id: 'pricing-disabled', state: 'disabled', title: 'Monthly', description: '', cta: 'Unavailable', actionable: false },
  { id: 'pricing-error-ar', state: 'error', title: 'تعذر تحميل الأسعار', description: 'أعد المحاولة لتحميل الخطط المتاحة.', cta: 'إعادة المحاولة', actionable: true },
]

for (const fixture of stateFixtures) {
  const combined = `${fixture.title} ${fixture.description} ${fixture.cta}`.toLowerCase()
  if (!fixture.actionable && /choose|select|اختر|اضغط/.test(combined)) {
    failures.push(`state fixture ${fixture.id}: disabled/non-actionable state invites an action`)
  }
  if (['empty', 'unavailable', 'error'].includes(fixture.state) && /choose a plan|اختر.*خطة/.test(combined)) {
    failures.push(`state fixture ${fixture.id}: normal pricing copy reused in ${fixture.state}`)
  }
  if (fixture.state === 'loading' && /retry|try again|إعادة المحاولة/.test(combined)) {
    failures.push(`state fixture ${fixture.id}: retry shown during normal loading`)
  }
}

function extensionOf(path) {
  const dot = path.lastIndexOf('.')
  return dot >= 0 ? path.slice(dot) : ''
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredSegments.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(path)
      continue
    }
    if (!extensions.has(extensionOf(path))) continue
    const rel = relative(root, path).replaceAll('\\', '/')
    if (!includeDist && !focusedSourceFragments.some((fragment) => rel.startsWith(fragment))) continue
    const content = readFileSync(path, 'utf8')
    content.split(/\r?\n/).forEach((line, index) => {
      if (allowedLineFragments.some((fragment) => line.includes(fragment)) && path.endsWith('check-copy-quality.mjs')) return
      banned.forEach((phrase) => {
        if (line.includes(phrase)) failures.push(`${relative(root, path)}:${index + 1}: ${phrase}`)
      })
      trustClaimFragments.forEach((phrase) => {
        if (line.includes(phrase)) failures.push(`${relative(root, path)}:${index + 1}: trust claim: ${phrase}`)
      })
      if (pricingSourceFragments.some((fragment) => rel === fragment)) {
        pricingBannedFragments.forEach((phrase) => {
          if (line.includes(phrase)) failures.push(`${relative(root, path)}:${index + 1}: pricing language: ${phrase}`)
        })
      }
    })
  }
}

roots.forEach(walk)

if (failures.length) {
  console.error('User-facing copy quality check failed:')
  failures.slice(0, 80).forEach((item) => console.error(`- ${item}`))
  process.exit(1)
}

console.log('User-facing copy quality check passed.')
