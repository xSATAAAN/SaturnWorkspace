/**
 * GitHub Pages has no URL rewriting. Clean URLs need path/index.html.
 * Runs after Vite build; writes into site/dist only.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const dist = path.join(root, 'site', 'dist')

/** Static HTML from repo root → served at /{name}/ */
const LEGAL_PAGES = ['privacy', 'terms', 'refund', 'login']

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

function rewriteRootRelative(html) {
  let out = html
  out = out.replace(/href="\.\/index\.html#/g, 'href="/#')
  out = out.replace(/href="\.\/index\.html"/g, 'href="/"')
  out = out.replace(/href="\.\/privacy\.html"/g, 'href="/privacy/"')
  out = out.replace(/href="\.\/terms\.html"/g, 'href="/terms/"')
  out = out.replace(/href="\.\/refund\.html"/g, 'href="/refund/"')
  out = out.replace(/href="\.\/updates\.html"/g, 'href="/release-notes/"')
  out = out.replace(/href="\.\/login\.html"/g, 'href="/login/"')
  out = out.replace(/href="\.\/styles\.css"/g, 'href="/styles.css"')
  out = out.replace(/href="\.\//g, 'href="/')
  out = out.replace(/src="\.\//g, 'src="/')
  return out
}

function copyIfExists(srcName) {
  const from = path.join(root, srcName)
  if (!fs.existsSync(from)) return
  const to = path.join(dist, srcName)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

if (!fs.existsSync(dist)) {
  console.error('Missing site/dist — run Vite build first.')
  process.exit(1)
}

const spaIndex = path.join(dist, 'index.html')
if (!fs.existsSync(spaIndex)) {
  console.error('Missing site/dist/index.html after Vite build.')
  process.exit(1)
}

for (const name of LEGAL_PAGES) {
  const src = path.join(root, `${name}.html`)
  if (!fs.existsSync(src)) {
    console.warn(`skip missing source: ${name}.html`)
    continue
  }
  const html = rewriteRootRelative(fs.readFileSync(src, 'utf8'))
  const outDir = path.join(dist, name)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'index.html'), html)
}

const updatesSrc = path.join(root, 'updates.html')
if (fs.existsSync(updatesSrc)) {
  const html = rewriteRootRelative(fs.readFileSync(updatesSrc, 'utf8'))
  const outDir = path.join(dist, 'release-notes')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'index.html'), html)
}

for (const segment of ['account', 'activate']) {
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

console.log('Static pages + SPA fallbacks merged into site/dist')
