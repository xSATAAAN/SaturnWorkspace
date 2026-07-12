import assert from 'node:assert/strict'

const probes = [
  { name: 'public_site', url: 'https://saturnws.com/', statuses: [200] },
  { name: 'auth_health', url: 'https://auth.saturnws.com/health', statuses: [200] },
  { name: 'policy_health', url: 'https://api.saturnws.com/health', statuses: [200] },
  { name: 'plans_catalog_allowed_origin', url: 'https://admin-api.saturnws.com/api/plans/catalog', statuses: [200], headers: { Origin: 'https://saturnws.com' } },
  { name: 'plans_catalog_missing_origin_denied', url: 'https://admin-api.saturnws.com/api/plans/catalog', statuses: [403] },
  { name: 'updates_manifest', url: 'https://updates.saturnws.com/latest.json', statuses: [200, 404] }
]

const results = []
for (const probe of probes) {
  const started = performance.now()
  const response = await fetch(probe.url, {
    method: 'GET',
    headers: { 'User-Agent': 'SaturnWS-Production-Safe-Smoke/1.0', ...(probe.headers || {}) },
    redirect: 'manual',
  })
  const body = await response.arrayBuffer()
  const result = {
    name: probe.name,
    url: probe.url,
    status: response.status,
    durationMs: performance.now() - started,
    bytes: body.byteLength,
    requestId: response.headers.get('cf-ray') || response.headers.get('x-request-id') || '',
    cache: response.headers.get('cf-cache-status') || '',
    passed: probe.statuses.includes(response.status),
  }
  results.push(result)
}

console.log(JSON.stringify({ status: results.every((item) => item.passed) ? 'PASS' : 'FAIL', results }, null, 2))
assert.ok(results.every((item) => item.passed), 'production-safe smoke failed')
