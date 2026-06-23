import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const workerRoot = resolve(import.meta.dirname, '..')
const repoRoot = resolve(workerRoot, '..', '..')
const migration = readFileSync(resolve(repoRoot, 'workers/auth/migrations/009_account_profiles.sql'), 'utf8')
const createBlock = /create table if not exists public\.account_profiles\s*\(([\s\S]*?)\n\);/i.exec(migration)?.[1]
assert.ok(createBlock, 'account_profiles migration contract was not found')

const canonicalColumns = new Set(
  createBlock
    .split(/\r?\n/)
    .map((line) => /^\s*([a-z_][a-z0-9_]*)\s+/.exec(line)?.[1])
    .filter(Boolean),
)

assert.ok(canonicalColumns.has('firebase_uid'), 'account_profiles.firebase_uid must exist')
assert.ok(!canonicalColumns.has('firebase_user_id'), 'account_profiles.firebase_user_id must not exist')

const sourceFiles = [
  'workers/admin/src/index.js',
  'workers/admin/src/routes/adminOperations.js',
  'workers/auth/src/lib/supabase.ts',
]

const queryLiterals = []
for (const relativePath of sourceFiles) {
  const content = readFileSync(resolve(repoRoot, relativePath), 'utf8')
  const safeRead = /safeSupabaseRead\(\s*env\s*,\s*['"]account_profiles['"]\s*,\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g
  for (const match of content.matchAll(safeRead)) queryLiterals.push({ file: relativePath, query: match[1] ?? match[2] ?? match[3] })
  const restPath = /(?:'\/account_profiles\?([^']*)'|"\/account_profiles\?([^"]*)"|`\/account_profiles\?([^`]*)`)/g
  for (const match of content.matchAll(restPath)) queryLiterals.push({ file: relativePath, query: match[1] ?? match[2] ?? match[3] })
}

assert.ok(queryLiterals.length > 0, 'no account_profiles query contracts were discovered')
for (const { file, query } of queryLiterals) {
  assert.ok(!query.includes('firebase_user_id'), `${file} references missing account_profiles.firebase_user_id`)
  const select = /(?:^|[?&])select=([^&]+)/.exec(query)?.[1]
  if (!select || select === '*') continue
  for (const rawColumn of select.split(',')) {
    const column = rawColumn.trim().split(/[(:]/)[0]
    if (!column || column.includes('${')) continue
    assert.ok(canonicalColumns.has(column), `${file} selects unknown account_profiles.${column}`)
  }
}

console.log(`Schema contract passed for ${queryLiterals.length} account_profiles queries.`)
