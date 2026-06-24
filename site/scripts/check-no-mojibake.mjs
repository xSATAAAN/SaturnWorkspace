import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteScriptsDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(siteScriptsDir, '..', '..')
const result = spawnSync(
  process.execPath,
  [join(repoRoot, 'scripts', 'check-no-mojibake.mjs'), '--site-only', ...process.argv.slice(2)],
  { cwd: repoRoot, stdio: 'inherit' },
)

process.exit(result.status ?? 1)
