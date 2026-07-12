import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)

const textExtensions = new Set([
  '', '.bat', '.cjs', '.css', '.html', '.ini', '.js', '.json', '.jsonc', '.jsx', '.md', '.mjs',
  '.ps1', '.py', '.sql', '.svg', '.toml', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml',
])
const secretRules = [
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=\r\n]{100,}-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['aws_access_key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['github_token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ['slack_token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ['stripe_live_key', /\bsk_live_[A-Za-z0-9]{16,}\b/g],
  ['google_api_key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['npm_token', /\bnpm_[A-Za-z0-9]{30,}\b/g],
  ['credentialed_url', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:[^\s/@]+@/gi],
  ['service_role_assignment', /\b(?:SUPABASE_SERVICE_ROLE_KEY|CLOUDFLARE_API_TOKEN)\s*[:=]\s*["'][^"']{20,}["']/g],
]
const reviewRules = [
  ['dynamic_eval', /\beval\s*\(|new\s+Function\s*\(/g],
  ['react_raw_html', /dangerouslySetInnerHTML/g],
  ['python_shell_true', /\bshell\s*=\s*True\b/g],
  ['wildcard_cors', /Access-Control-Allow-Origin[^\r\n]{0,40}["']\*["']/g],
]
const forbiddenNames = [/(^|\/)\.env(?:\.|$)/i, /(^|\/).*\.(?:pem|p12|pfx)$/i]
const findings = []

for (const relative of tracked) {
  const normalized = relative.replaceAll('\\', '/')
  if (normalized.includes('secret (dont read)')) {
    findings.push({ severity: 'error', rule: 'forbidden_secret_path_tracked', file: normalized, line: 1 })
    continue
  }
  if (forbiddenNames.some((rule) => rule.test(normalized))) {
    findings.push({ severity: 'error', rule: 'sensitive_filename_tracked', file: normalized, line: 1 })
  }
  const absolute = path.join(root, relative)
  const extension = path.extname(relative).toLowerCase()
  if (!textExtensions.has(extension) || statSync(absolute).size > 2 * 1024 * 1024) continue
  const content = readFileSync(absolute, 'utf8')
  for (const [rule, pattern] of secretRules) collect(content, normalized, pattern, rule, 'error')
  if (normalized !== 'tools/security/repository-check.mjs') {
    for (const [rule, pattern] of reviewRules) collect(content, normalized, pattern, rule, 'review')
  }
}

function collect(content, file, pattern, rule, severity) {
  pattern.lastIndex = 0
  for (const match of content.matchAll(pattern)) {
    const line = content.slice(0, match.index).split('\n').length
    findings.push({ severity, rule, file, line })
  }
}

const errors = findings.filter((item) => item.severity === 'error')
const reviews = findings.filter((item) => item.severity === 'review')
const report = {
  status: errors.length ? 'FAIL' : 'PASS',
  trackedFiles: tracked.length,
  errors,
  manualReview: reviews,
}
console.log(JSON.stringify(report, null, 2))
assert.equal(errors.length, 0, 'high-confidence secret or sensitive file detected')
