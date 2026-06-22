import assert from "node:assert/strict"
import test from "node:test"
import { desktopEntitlementFromProjection, resolveSubscriptionTruth } from "./resolver.js"

const now = "2026-06-22T12:00:00.000Z"
const base = {
  id: "sub-1",
  firebase_user_id: "uid-1",
  user_email: "user@example.com",
  lifecycle_state: "active",
  plan_term: "monthly",
  renewal_state: "manual",
  starts_at: "2026-06-01T00:00:00.000Z",
  expires_at: "2026-07-01T00:00:00.000Z",
  metadata: {},
}

function resolve(rows, identity = { firebaseUid: "uid-1", email: "user@example.com" }) {
  return resolveSubscriptionTruth(rows, identity, { now })
}

test("no rows returns the exact no-subscription contract", () => {
  const result = resolve([])
  assert.equal(result.current, null)
  assert.deepEqual(result.projection, {
    existence: "none", lifecycle: null, plan_term: null, renewal_state: "not_applicable",
    entitlement: "no_subscription", current_subscription: null, subscription_id: null,
    plan: null, status: null, starts_at: null, expires_at: null,
    source: "supabase_account_subscriptions",
  })
})

test("legacy email-only row never grants entitlement or a fake monthly plan", () => {
  const result = resolve([{ ...base, firebase_user_id: null }])
  assert.equal(result.projection.entitlement, "no_subscription")
  assert.equal(result.projection.plan, null)
  assert.equal(result.diagnostics.legacy_email_candidates, 1)
})

test("same email with a different uid never grants access", () => {
  const result = resolve([{ ...base, firebase_user_id: "uid-2" }])
  assert.equal(result.projection.entitlement, "no_subscription")
  assert.equal(result.diagnostics.uid_mismatch_candidates, 1)
})

test("active, trial, grace, lifetime and cancel-at-period-end map independently", () => {
  assert.equal(resolve([base]).projection.entitlement, "entitled")
  assert.equal(resolve([{ ...base, lifecycle_state: "trialing", trial_ends_at: base.expires_at }]).projection.lifecycle, "trialing")
  assert.equal(resolve([{ ...base, lifecycle_state: "past_due", grace_ends_at: "2026-06-25T00:00:00.000Z" }]).projection.entitlement, "grace_period")
  assert.equal(resolve([{ ...base, plan_term: "lifetime", expires_at: "9999-12-31T23:59:59.000Z" }]).projection.expires_at, null)
  assert.equal(resolve([{ ...base, cancel_at_period_end: true }]).projection.lifecycle, "cancel_at_period_end")
})

test("expired, cancelled and future rows are history only", () => {
  for (const row of [
    { ...base, lifecycle_state: "expired", expires_at: "2026-06-01T00:00:00.000Z" },
    { ...base, lifecycle_state: "cancelled" },
    { ...base, starts_at: "2026-07-01T00:00:00.000Z", expires_at: "2026-08-01T00:00:00.000Z" },
  ]) assert.equal(resolve([row]).projection.entitlement, "no_subscription")
})

test("multiple usable or malformed current rows fail closed", () => {
  const duplicate = resolve([base, { ...base, id: "sub-2", plan_term: "annual" }])
  assert.equal(duplicate.projection.entitlement, "integrity_conflict")
  assert.equal(duplicate.current, null)
  const malformed = resolve([{ ...base, lifecycle_state: "unexpected" }])
  assert.equal(malformed.projection.entitlement, "integrity_conflict")
})

test("desktop mapping preserves connection and entitlement separation", () => {
  assert.equal(desktopEntitlementFromProjection(resolve([]).projection), "no_subscription")
  assert.equal(desktopEntitlementFromProjection(resolve([{ ...base, plan_term: "lifetime" }]).projection), "lifetime")
  assert.equal(desktopEntitlementFromProjection(resolve([{ ...base, lifecycle_state: "trialing" }]).projection), "trial")
})
