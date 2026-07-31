import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateAuthoritySurface } from './check-authority-surface.mjs'

const metadata = [
  '- Status: active',
  '- Scope: repository',
  '- Owner: maintainer',
  '- Last verified: 2026-07-31',
  '- Verification: protected CI',
].join('\n')

function evaluate(extra = {}, extraPaths = []) {
  const files = new Map([
    ['AGENTS.md', `${metadata}\nInstructions\n`],
    ['README.md', `${metadata}\nGuide\n`],
    ['workers/auth/migrations/20260101_phase_a.sql', 'select 1;\n'],
    ['site/src/app.ts', 'export const app = true\n'],
    ...Object.entries(extra),
  ])
  return evaluateAuthoritySurface({
    paths: [...files.keys(), ...extraPaths],
    readText: (file) => files.get(file) ?? '',
  })
}

test('the minimal authority surface and applied migration history are accepted', () => {
  assert.equal(evaluate().success, true)
})

test('nested prose, editor rules, and historical work paths are rejected', () => {
  const report = evaluate({
    'site/README.md': metadata,
    '.cursor/rules/build.mdc': metadata,
    'site/scripts/check-phase-z.mjs': 'console.log("old")',
  })
  assert.equal(report.success, false)
  assert.ok(report.violations.some(({ code }) => code === 'UNAPPROVED_PROSE_AUTHORITY'))
  assert.ok(report.violations.some(({ code }) => code === 'FORBIDDEN_AUTHORITY_PATH'))
  assert.ok(report.violations.some(({ code }) => code === 'HISTORICAL_WORK_PATH'))
})

test('obsolete references and missing authority metadata are rejected', () => {
  const report = evaluate({
    'README.md': 'Guide without lifecycle metadata',
    'site/src/app.ts': 'const old = "docs/production-integration"\n',
  })
  assert.equal(report.success, false)
  assert.ok(report.violations.some(({ code }) => code === 'AUTHORITY_METADATA_MISSING'))
  assert.ok(report.violations.some(({ code }) => code === 'OBSOLETE_AUTHORITY_REFERENCE'))
})
