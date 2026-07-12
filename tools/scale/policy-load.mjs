import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import Database from 'better-sqlite3'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const policyRoot = path.join(repoRoot, 'workers', 'policy')
const args = process.argv.slice(2)
const arg = (name, fallback = '') => {
  const index = args.indexOf(name)
  return index >= 0 ? String(args[index + 1] || fallback) : fallback
}
const profileName = arg('--profile', 'quick')
const outputArg = arg('--output')
const thresholds = JSON.parse(await readFile(path.join(here, 'thresholds.json'), 'utf8'))
const profile = thresholds[profileName]
if (!profile) throw new Error(`unknown_profile:${profileName}`)
let dispatchRequest

const temp = await mkdtemp(path.join(tmpdir(), 'saturnws-scale-'))
const bundle = path.join(temp, 'policy-worker.mjs')
const report = {
  schema: 'saturnws.scale-validation.v1',
  generatedAt: new Date().toISOString(),
  profile: profileName,
  configuration: profile,
  slo: thresholds.slo,
  localRuntime: thresholds.localRuntime,
  scenarios: [],
  invariants: [],
  runtime: {},
  status: 'FAIL',
}

function percentile(values, fraction) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

function memoryMb() {
  return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100
}

class D1StatementAdapter {
  constructor(database, sql, params = []) {
    this.database = database
    this.sql = sql
    this.params = params
  }

  bind(...params) {
    return new D1StatementAdapter(this.database, this.sql, params)
  }

  bindingArguments() {
    if (!this.params.length) return []
    if (/\?[1-9][0-9]*/.test(this.sql)) {
      return [Object.fromEntries(this.params.map((value, index) => [String(index + 1), value]))]
    }
    return this.params
  }

  async first(column) {
    const row = this.database.prepare(this.sql).get(...this.bindingArguments()) ?? null
    return column && row ? row[column] : row
  }

  async all() {
    const results = this.database.prepare(this.sql).all(...this.bindingArguments())
    return { success: true, results, meta: { changes: 0 } }
  }

  async run() {
    return this.execute()
  }

  execute() {
    const statement = this.database.prepare(this.sql)
    const args = this.bindingArguments()
    if (statement.reader) {
      return { success: true, results: statement.all(...args), meta: { changes: 0 } }
    }
    const result = statement.run(...args)
    return {
      success: true,
      results: [],
      meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid || 0) },
    }
  }
}

class D1DatabaseAdapter {
  constructor(database) {
    this.database = database
  }

  prepare(sql) {
    return new D1StatementAdapter(this.database, sql)
  }

  async batch(statements) {
    return this.database.transaction((items) => items.map((statement) => statement.execute()))(statements)
  }

  async exec(sql) {
    this.database.exec(sql)
    return { count: 0, duration: 0 }
  }
}

function recordLatency(sample, value, seen) {
  if (sample.length < 200000) {
    sample.push(value)
    return
  }
  const replacement = Math.floor(Math.random() * seen)
  if (replacement < sample.length) sample[replacement] = value
}

async function executeScenario({ name, concurrency, requests, durationSeconds, request, acceptedStatuses, p95BudgetMs, productionP95BudgetMs = p95BudgetMs }) {
  console.error(`[scale] starting ${name}`)
  let cursor = 0
  let completed = 0
  let failures = 0
  let latencySeen = 0
  let maxLatencyMs = 0
  const statuses = {}
  const errors = {}
  const failureSamples = []
  const latencies = []
  const startedAt = performance.now()
  const deadline = durationSeconds ? startedAt + durationSeconds * 1000 : 0

  const worker = async () => {
    while (true) {
      const index = cursor++
      if (requests !== undefined && index >= requests) return
      if (deadline && performance.now() >= deadline) return
      const requestStarted = performance.now()
      try {
        const response = await request(index)
        const responseBody = await response.text()
        const status = String(response.status)
        statuses[status] = (statuses[status] || 0) + 1
        if (!acceptedStatuses.includes(response.status)) {
          failures += 1
          if (failureSamples.length < 5) failureSamples.push({ status: response.status, body: responseBody.slice(0, 500) })
        }
      } catch (error) {
        failures += 1
        const code = String(error instanceof Error ? error.message : error || 'request_failed').slice(0, 160)
        errors[code] = (errors[code] || 0) + 1
      } finally {
        completed += 1
        latencySeen += 1
        const latencyMs = performance.now() - requestStarted
        if (latencyMs > maxLatencyMs) maxLatencyMs = latencyMs
        recordLatency(latencies, latencyMs, latencySeen)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  const elapsedMs = performance.now() - startedAt
  const errorRate = completed ? failures / completed : 1
  const result = {
    name,
    concurrency,
    requested: requests ?? null,
    durationSeconds: durationSeconds ?? null,
    completed,
    failures,
    errorRate,
    requestsPerSecond: elapsedMs ? completed / (elapsedMs / 1000) : 0,
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: maxLatencyMs,
    },
    statuses,
    errors,
    failureSamples,
    p95BudgetMs,
    productionP95BudgetMs,
  }
  result.passed = errorRate <= thresholds.slo.maxErrorRate && result.latencyMs.p95 <= p95BudgetMs
  result.productionTargetPassed = errorRate <= thresholds.slo.maxErrorRate && result.latencyMs.p95 <= productionP95BudgetMs
  report.scenarios.push(result)
  console.error(`[scale] finished ${name}: ${completed} requests, p95=${result.latencyMs.p95.toFixed(1)}ms, failures=${failures}`)
  return result
}

function userToken(index) {
  return `load-user-${index % profile.identities}`
}

function post(pathname, token, body = {}) {
  return dispatchRequest(new Request(`https://policy.local${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id_token: token, ...body }),
  }))
}

await build({
  entryPoints: [path.join(policyRoot, 'src', 'index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: bundle,
  logLevel: 'silent',
})

const sqlite = new Database(path.join(temp, 'policy.sqlite'))
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
sqlite.pragma('busy_timeout = 5000')

const histogram = monitorEventLoopDelay({ resolution: 20 })
histogram.enable()
const initialMemoryMb = memoryMb()

try {
  const db = new D1DatabaseAdapter(sqlite)
  const attachments = {
    async get() { return null },
    async put() {},
    async delete() {},
  }
  const policyWorker = (await import(`${pathToFileURL(bundle).href}?v=${Date.now()}`)).default
  const policyEnv = {
    DB: db,
    SUPPORT_ATTACHMENTS: attachments,
    POLICY_SIGNING_SEED_B64: Buffer.alloc(32, 3).toString('base64'),
    ADMIN_TOKEN_SHA256: createHash('sha256').update('scale-local-admin-token').digest('hex'),
    EMAIL_OUTBOUND_ENABLED: 'false',
    EMAIL_INBOUND_ENABLED: 'false',
    EMAIL_SUPPORT_ENABLED: 'false',
    EMAIL_AUTH_ENABLED: 'false',
    EMAIL_BILLING_ENABLED: 'false',
    EMAIL_RELEASE_ENABLED: 'false',
    EMAIL_SECURITY_ENABLED: 'false',
    EMAIL_SCHEDULER_ENABLED: 'false',
    EMAIL_REPLY_DOMAIN: 'mail.example.test',
    APP_PUBLIC_URL: 'https://example.test',
    EMAIL_SENSITIVE_PAYLOAD_KEY_B64: Buffer.alloc(32, 11).toString('base64'),
    AUTH_SERVICE: {
      async fetch(request) {
        const body = await request.json().catch(() => ({}))
        const token = String(body.id_token || '')
        if (token.startsWith('load-latency-')) await new Promise((resolve) => setTimeout(resolve, 200))
        if (token.startsWith('load-unavailable-')) {
          return Response.json({ success: false, error: 'identity_service_unavailable' }, { status: 503 })
        }
        if (!/^load-(?:user|latency)-[0-9]+$/.test(token) && token !== 'load-idempotency') {
          return Response.json({ success: false, error: 'unauthorized' }, { status: 401 })
        }
        return Response.json({ success: true, user: { id: token, email: `${token}@example.test` } })
      },
    },
  }
  dispatchRequest = (request) => policyWorker.fetch(request, policyEnv, {
    waitUntil(promise) { void Promise.resolve(promise).catch(() => undefined) },
    passThroughOnException() {},
  })
  const migrationDir = path.join(policyRoot, 'migrations')
  for (const name of (await readdir(migrationDir)).filter((item) => item.endsWith('.sql')).sort()) {
    const sql = (await readFile(path.join(migrationDir, name), 'utf8'))
      .replace(/^\s*--.*$/gm, '')
      .replace(/\r?\n/g, ' ')
    await db.exec(sql)
  }

  await executeScenario({
    name: 'health_baseline',
    concurrency: profile.concurrency.health,
    requests: profile.healthRequests,
    request: () => dispatchRequest(new Request('https://policy.local/health')),
    acceptedStatuses: [200],
    p95BudgetMs: thresholds.slo.healthP95Ms,
  })
  await executeScenario({
    name: 'notifications_read_2500_plus_identities',
    concurrency: profile.concurrency.read,
    requests: profile.readRequests,
    request: (index) => post('/v1/web/notifications/list', userToken(index), { limit: 20 }),
    acceptedStatuses: [200],
    p95BudgetMs: thresholds.slo.readP95Ms,
  })
  await executeScenario({
    name: 'support_threads_read',
    concurrency: profile.concurrency.read,
    requests: profile.readRequests,
    request: (index) => post('/v1/web/support/threads', userToken(index), { limit: 20 }),
    acceptedStatuses: [200],
    p95BudgetMs: thresholds.slo.readP95Ms,
  })
  await executeScenario({
    name: 'support_create_unique_users',
    concurrency: profile.concurrency.mutation,
    requests: profile.mutationRequests,
    request: (index) => {
      const token = userToken(index)
      return post('/v1/web/support/messages', token, {
        subject: `Synthetic issue ${index}`,
        body: 'Synthetic scale validation message.',
        idempotency_key: `scale:${index}`,
      })
    },
    acceptedStatuses: [200],
    p95BudgetMs: thresholds.slo.mutationP95Ms,
  })
  const idempotency = await executeScenario({
    name: 'support_idempotency_burst',
    concurrency: 100,
    requests: 100,
    request: () => post('/v1/web/support/messages', 'load-idempotency', {
      subject: 'Idempotency burst',
      body: 'All requests must resolve to one durable ticket.',
      idempotency_key: 'scale:idempotency:one',
    }),
    acceptedStatuses: [200],
    p95BudgetMs: thresholds.localRuntime.idempotencyP95Ms,
    productionP95BudgetMs: thresholds.slo.mutationP95Ms,
  })
  const threadCount = await db.prepare("SELECT COUNT(*) AS count FROM support_threads WHERE user_id = 'load-idempotency'").first()
  const idempotencyPassed = Number(threadCount?.count || 0) === 1 && idempotency.failures === 0
  report.invariants.push({ name: 'support_idempotency_exactly_once', expected: 1, actual: Number(threadCount?.count || 0), passed: idempotencyPassed })

  await executeScenario({
    name: 'read_spike',
    concurrency: profile.concurrency.spike,
    requests: profile.spikeRequests,
    request: (index) => post('/v1/web/notifications/list', userToken(index), { limit: 20 }),
    acceptedStatuses: [200],
    p95BudgetMs: thresholds.slo.spikeP95Ms,
  })

  await executeScenario({
    name: 'auth_dependency_latency',
    concurrency: profile.concurrency.fault,
    requests: 1000,
    request: (index) => post('/v1/web/notifications/list', `load-latency-${index % profile.identities}`, { limit: 20 }),
    acceptedStatuses: [200],
    p95BudgetMs: thresholds.slo.faultLatencyP95Ms,
  })
  await executeScenario({
    name: 'auth_dependency_outage',
    concurrency: profile.concurrency.fault,
    requests: 1000,
    request: (index) => post('/v1/web/notifications/list', `load-unavailable-${index % profile.identities}`, { limit: 20 }),
    acceptedStatuses: [503],
    p95BudgetMs: thresholds.slo.readP95Ms,
  })
  await executeScenario({
    name: 'read_soak',
    concurrency: profile.concurrency.soak,
    durationSeconds: profile.soakSeconds,
    request: (index) => post(index % 2 ? '/v1/web/notifications/list' : '/v1/web/support/threads', userToken(index), { limit: 20 }),
    acceptedStatuses: [200],
    p95BudgetMs: thresholds.slo.readP95Ms,
  })

  if (global.gc) global.gc()
  const finalMemoryMb = memoryMb()
  const memoryGrowthMb = Math.round((finalMemoryMb - initialMemoryMb) * 100) / 100
  const eventLoopP99Ms = histogram.percentile(99) / 1e6
  report.runtime = {
    node: process.version,
    mode: 'direct-worker-module-with-native-sqlite-d1-adapter',
    initialMemoryMb,
    finalMemoryMb,
    memoryGrowthMb,
    eventLoopP99Ms,
  }
  report.invariants.push({
    name: 'memory_growth_within_budget',
    expectedMaxMb: profile.memoryGrowthMb,
    actualMb: memoryGrowthMb,
    passed: memoryGrowthMb <= profile.memoryGrowthMb,
  })
  const eventLoopInvariant = {
    name: 'event_loop_p99_within_budget',
    expectedMaxMs: profile.localEventLoopP99Ms,
    productionTargetMs: thresholds.slo.maxEventLoopP99Ms,
    actualMs: eventLoopP99Ms,
    passed: eventLoopP99Ms <= profile.localEventLoopP99Ms,
    productionTargetPassed: eventLoopP99Ms <= thresholds.slo.maxEventLoopP99Ms,
  }
  report.invariants.push(eventLoopInvariant)
  report.status = report.scenarios.every((item) => item.passed) && report.invariants.every((item) => item.passed) ? 'PASS' : 'FAIL'
  report.productionTargetStatus = report.scenarios.every((item) => item.productionTargetPassed) && eventLoopInvariant.productionTargetPassed ? 'PASS' : 'STAGING_REQUIRED'
} finally {
  histogram.disable()
  sqlite.close()
  await rm(temp, { recursive: true, force: true })
}

const output = outputArg
  ? path.resolve(outputArg)
  : path.join(here, 'reports', `policy-load-${profileName}-${Date.now()}.json`)
await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ status: report.status, productionTargetStatus: report.productionTargetStatus, output, scenarios: report.scenarios, invariants: report.invariants, runtime: report.runtime }, null, 2))
assert.equal(report.status, 'PASS', 'one or more scale validation thresholds failed')
