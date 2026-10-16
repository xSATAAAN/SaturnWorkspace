import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../src/lib/emailRegistrationDelivery.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { registrationDelivery } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const now = Date.parse('2026-10-16T00:00:00Z')
const sent = { deliveryStatus: 'sent', sentAt: '2026-10-15T23:59:10Z', resendAfterSeconds: 37 }

test('only explicit acknowledged delivery starts the server remaining cooldown', () => {
  const result = registrationDelivery(sent, now)
  assert.equal(result.deliveryStatus, 'sent')
  assert.equal(result.resendAfterSeconds, 37)
  assert.equal(result.resendAvailableAt, new Date(now + 37_000).toISOString())
})

test('restored delivery does not restart the countdown or depend on server clock skew', () => {
  const stored = registrationDelivery({ ...sent, sentAt: '2026-10-16T10:00:00Z' }, now)
  assert.equal(registrationDelivery(stored, now + 10_000).resendAfterSeconds, 27)
  assert.equal(registrationDelivery(stored, now + 60_000).resendAfterSeconds, 0)
})

test('queued, failed and legacy replies never manufacture a countdown', () => {
  for (const deliveryStatus of ['queued', 'failed', 'unknown', undefined]) {
    const result = registrationDelivery({ deliveryStatus, sentAt: null, resendAfterSeconds: 45 }, now)
    assert.equal(result.resendAfterSeconds, 0)
    assert.equal(result.sentAt, null)
    assert.equal(result.resendAvailableAt, undefined)
  }
})

test('malformed, fractional and unbounded server delays are rejected', () => {
  for (const resendAfterSeconds of [-1, 0.5, 3601, NaN, Infinity, '45', undefined, null]) {
    assert.equal(registrationDelivery({ ...sent, resendAfterSeconds }, now).deliveryStatus, 'unknown')
  }
  for (const sentAt of [undefined, null, '', '2026-10-16 00:00:00', 'invalid']) {
    assert.equal(registrationDelivery({ ...sent, sentAt }, now).deliveryStatus, 'unknown')
  }
})

test('zero remaining time is valid only with an explicit sent acknowledgement', () => {
  assert.equal(registrationDelivery({ ...sent, resendAfterSeconds: 0 }, now).deliveryStatus, 'sent')
  assert.equal(registrationDelivery({ ...sent, resendAfterSeconds: 0 }, now).resendAfterSeconds, 0)
  assert.equal(registrationDelivery({ deliveryStatus: 'queued', sentAt: sent.sentAt }, now).deliveryStatus, 'unknown')
})

test('delivery projection excludes unrelated fields and secret values', () => {
  const result = registrationDelivery({ ...sent, password: 'synthetic-only', registrationId: 'private-job', provider_message_id: 'private-provider' }, now)
  assert.deepEqual(Object.keys(result).sort(), ['deliveryStatus', 'resendAfterSeconds', 'resendAvailableAt', 'sentAt'].sort())
})
