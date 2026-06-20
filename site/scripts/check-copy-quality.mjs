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
  'src/new-ui/pages/production/',
  'src/new-ui/content/',
  'src/new-ui/i18n/',
  'src/new-ui/layouts/',
  'src/new-ui/components/ui/',
]

const banned = [
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
  'هذه الصفحة تعرض',
  'أنت مسجّل الدخول',
  'تم التعرف على حسابك',
  'البوابة جاهزة',
  'البريد مفعّل',
  'يمكنك مراجعة',
  'الربط قيد الانتظار',
]

const allowedLineFragments = [
  'const banned = [',
  'Backend integration required',
  'Product decision required',
  'Integration pending',
  'Live plan names and prices',
  'commercial source of truth',
]

const failures = []

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
