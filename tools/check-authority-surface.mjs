import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const TOOL_PATH = 'tools/check-authority-surface.mjs'
const TEST_PATH = 'tools/authority-surface.test.mjs'
export const PRODUCT_DECISION_REGISTER_URL =
  'https://github.com/xSATAAAN/SaturnWorkspace-Desktop/blob/main/README.md#approved-product-decision-register'
const PRODUCT_DECISION_REGISTER_HEADING = '## Approved product decision register'
const ACTIVE_AUTHORITY = new Map([
  ['AGENTS.md', 16_384],
  ['README.md', 20_480],
])
const REQUIRED_METADATA = ['Status:', 'Scope:', 'Owner:', 'Last verified:', 'Verification:']
const FORBIDDEN_PREFIXES = ['.cursor/', 'docs/']
const FORBIDDEN_FILES = new Set(['.cursorrules', '.windsurfrules', 'AGENTS.override.md'])
const FORBIDDEN_REFERENCES = [
  'docs/product-readiness-system-completion',
  'docs/production-integration',
  '.cursor/',
  'AdminPhaseF',
  'test:phase-',
  'test:new-ui:round3b',
  'check-phase-',
  'check-round3b',
  'phase_f_schema',
]
const TEXT_EXTENSIONS = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.jsonc', '.jsx', '.md', '.mdc',
  '.mjs', '.sql', '.toml', '.ts', '.tsx', '.txt', '.yaml', '.yml',
])
const HISTORICAL_PATH = /(?:^|[/_.-])(?:phase|round)[-_.]?[a-z0-9]/i
const HISTORICAL_LABEL = /\b(?:Phase\s+[A-G](?:\.\d+)?|EXEC-\d+)\b/i

function normalize(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '')
}

function isMigrationRecord(value) {
  const normalized = normalize(value).toLowerCase()
  return normalized.endsWith('.sql') && normalized.split('/').includes('migrations')
}

function violation(code, file) {
  return { code, file: normalize(file) }
}

export function evaluateAuthoritySurface({ paths, readText }) {
  const normalizedPaths = [...new Set(paths.map(normalize))].sort()
  const pathSet = new Set(normalizedPaths)
  const violations = []

  for (const file of normalizedPaths) {
    const lowered = file.toLowerCase()
    const extension = path.extname(file).toLowerCase()
    if ((extension === '.md' || extension === '.mdc') && !ACTIVE_AUTHORITY.has(file)) {
      violations.push(violation('UNAPPROVED_PROSE_AUTHORITY', file))
    }
    if (FORBIDDEN_FILES.has(file) || FORBIDDEN_PREFIXES.some((prefix) => lowered.startsWith(prefix))) {
      violations.push(violation('FORBIDDEN_AUTHORITY_PATH', file))
    }
    if (HISTORICAL_PATH.test(file) && !isMigrationRecord(file)) {
      violations.push(violation('HISTORICAL_WORK_PATH', file))
    }
  }

  for (const [file, maximumBytes] of ACTIVE_AUTHORITY) {
    if (!pathSet.has(file)) {
      violations.push(violation('ACTIVE_AUTHORITY_MISSING', file))
      continue
    }
    const text = readText(file)
    if (Buffer.byteLength(text, 'utf8') > maximumBytes) {
      violations.push(violation('ACTIVE_AUTHORITY_TOO_LARGE', file))
    }
    if (REQUIRED_METADATA.some((marker) => !text.includes(marker))) {
      violations.push(violation('AUTHORITY_METADATA_MISSING', file))
    }
  }

  if (pathSet.has('AGENTS.md')) {
    const instructions = readText('AGENTS.md')
    const pointerCount = instructions.split(PRODUCT_DECISION_REGISTER_URL).length - 1
    if (pointerCount !== 1) {
      violations.push(violation('PRODUCT_DECISION_REGISTER_POINTER_INVALID', 'AGENTS.md'))
    }
  }

  for (const file of ACTIVE_AUTHORITY.keys()) {
    if (pathSet.has(file) && readText(file).includes(PRODUCT_DECISION_REGISTER_HEADING)) {
      violations.push(violation('DUPLICATE_PRODUCT_DECISION_REGISTER', file))
    }
  }

  for (const file of normalizedPaths) {
    if (file === TOOL_PATH || file === TEST_PATH || isMigrationRecord(file)) continue
    if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue
    const text = readText(file)
    if (FORBIDDEN_REFERENCES.some((reference) => text.includes(reference))) {
      violations.push(violation('OBSOLETE_AUTHORITY_REFERENCE', file))
    }
    if (HISTORICAL_LABEL.test(text)) {
      violations.push(violation('HISTORICAL_WORK_LABEL', file))
    }
  }

  return {
    schema: 'saturnws.web.authority-surface.v1',
    success: violations.length === 0,
    tracked_file_count: normalizedPaths.length,
    active_authority_files: [...ACTIVE_AUTHORITY.keys()],
    violation_count: violations.length,
    violations: violations.slice(0, 100),
  }
}

function trackedPaths(root) {
  return execFileSync('git', ['-C', root, 'ls-files', '-z'])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const report = evaluateAuthoritySurface({
    paths: trackedPaths(root),
    readText: (file) => readFileSync(path.join(root, file), 'utf8'),
  })
  console.log(JSON.stringify(report))
  if (!report.success) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
