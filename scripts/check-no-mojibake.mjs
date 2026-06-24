import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { basename, extname, join, relative } from "node:path"

const repoRoot = process.cwd()
const args = new Set(process.argv.slice(2))
const includeDist = args.has("--include-dist")
const siteOnly = args.has("--site-only")

const extensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".html",
  ".json",
  ".md",
  ".sql",
  ".toml",
  ".jsonc",
])

const ignoredSegments = new Set([
  ".git",
  ".wrangler",
  "node_modules",
  "dist-production",
  "private-backups",
  "build-output",
  "local-secrets",
])

const technicalAllowlist = new Map([
  [
    "workers/auth/migrations/20260623214533_phase_g_fix_commercial_plan_arabic.sql",
    [
      "Ø£Ø³Ø¨ÙˆØ¹ÙŠ",
      "Ø´Ù‡Ø±ÙŠ",
      "Ø³Ù†ÙˆÙŠ",
    ],
  ],
])

const roots = siteOnly
  ? ["site/src", "site/public", ...(includeDist ? ["site/dist"] : [])]
  : [
      "AGENTS.md",
      "index.html",
      "login.html",
      "contact.html",
      "updates.html",
      "site.js",
      "styles.css",
      "site/src",
      "site/public",
      "workers",
      ...(includeDist ? ["site/dist"] : []),
    ]

const failures = []
const suspiciousPatterns = [
  { name: "double-encoded-arabic", regex: /Ã[˜™ƒ‚¢]/u },
  { name: "replacement-character", regex: /\uFFFD/u },
  { name: "latin1-arabic-mojibake", regex: /[ØÙ][\u0080-\u00ff\u0160\u2039\u201A]/u },
  { name: "windows1252-mojibake", regex: /â[\u0080-\u00ff\u20ac]/u },
  { name: "html-escaped-double-encoded-arabic", regex: /&Atilde;|&Acirc;|&Oslash;|&Ugrave;/u },
]

function normalizePath(path) {
  return relative(repoRoot, path).replace(/\\/g, "/")
}

function isAllowedTechnicalMarker(path, line) {
  const allowed = technicalAllowlist.get(normalizePath(path))
  return Boolean(allowed?.some((marker) => line.includes(marker)))
}

function inspectFile(path) {
  if (!extensions.has(extname(path))) return
  const content = readFileSync(path, "utf8")
  const lines = content.split(/\r?\n/)
  lines.forEach((line, index) => {
    for (const pattern of suspiciousPatterns) {
      if (!pattern.regex.test(line)) continue
      if (isAllowedTechnicalMarker(path, line)) continue
      failures.push(`${normalizePath(path)}:${index + 1} (${pattern.name})`)
      break
    }
  })
}

function walk(path) {
  if (!existsSync(path)) return
  const stats = statSync(path)
  if (stats.isFile()) {
    inspectFile(path)
    return
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (ignoredSegments.has(entry.name)) continue
    const child = join(path, entry.name)
    if (entry.isDirectory()) {
      walk(child)
    } else {
      inspectFile(child)
    }
  }
}

for (const root of roots) {
  const absolute = join(repoRoot, root)
  if (!existsSync(absolute) && basename(root) === root) continue
  walk(absolute)
}

if (failures.length) {
  console.error("Mojibake markers found:")
  failures.slice(0, 120).forEach((item) => console.error(`- ${item}`))
  if (failures.length > 120) console.error(`...and ${failures.length - 120} more`)
  process.exit(1)
}

console.log(`No mojibake markers found${siteOnly ? " in site assets" : " in repository runtime surfaces"}.`)
