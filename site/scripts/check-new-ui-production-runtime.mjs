import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const sourceFiles = [
  'src/new-ui/production-main.tsx',
  'src/new-ui/app/ProductionApp.tsx',
  'src/new-ui/app/productionRouter.ts',
  'src/new-ui/adapters/productionAdapters.ts',
  'src/new-ui/pages/production/ProductionPages.tsx',
  'src/new-ui/layouts/SharedChrome.tsx',
  'src/new-ui/layouts/WorkspaceShell.tsx',
]

const forbidden = [
  'mockAdapter',
  'mockData',
  'developmentMockAdapter',
  'previewRouter',
  'PreviewSwitcher',
  'development-mock',
  'ui-complete-mock',
]

function walk(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const item of readdirSync(dir)) {
    const path = join(dir, item)
    const stat = statSync(path)
    if (stat.isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out
}

const checked = []
const failures = []
for (const rel of sourceFiles) {
  const file = join(root, rel)
  if (!existsSync(file)) {
    failures.push(`missing:${rel}`)
    continue
  }
  checked.push(rel)
  const text = readFileSync(file, 'utf8')
  for (const token of forbidden) {
    if (text.includes(token)) failures.push(`${rel}: forbidden token ${token}`)
  }
}

const distDir = join(root, 'src/new-ui/dist-production')
if (existsSync(distDir)) {
  for (const file of walk(distDir)) {
    if (!/\.(js|html|css)$/.test(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const token of forbidden) {
      if (text.includes(token)) failures.push(`${file}: forbidden bundled token ${token}`)
    }
  }
}

if (failures.length) {
  console.error('Production runtime mock exclusion failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Production runtime mock exclusion passed (${checked.length} source files checked).`)
