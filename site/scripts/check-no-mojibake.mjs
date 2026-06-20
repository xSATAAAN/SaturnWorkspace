import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const includeDist = process.argv.includes('--include-dist')
const roots = [
  'src',
  'public',
  ...(includeDist ? ['dist'] : []),
].map((item) => join(root, item)).filter(existsSync)

const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.html', '.json', '.md'])
const markers = ['\u00c3', '\u00c2', '\u00d8', '\u00d9', '\u00e2\u20ac', '\ufffd']
const ignoredSegments = new Set(['node_modules', '.wrangler', '.git', 'dist-production'])
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
    const content = readFileSync(path, 'utf8')
    const lines = content.split(/\r?\n/)
    lines.forEach((line, index) => {
      if (markers.some((marker) => line.includes(marker))) failures.push(`${relative(root, path)}:${index + 1}`)
    })
  }
}

roots.forEach(walk)

if (failures.length) {
  console.error('Mojibake markers found:')
  failures.slice(0, 80).forEach((item) => console.error(`- ${item}`))
  process.exit(1)
}

console.log('No mojibake markers found.')
