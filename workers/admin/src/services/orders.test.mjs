import assert from "node:assert/strict"
import test from "node:test"

import { createOrder, listCommercialPlans } from "./orders.js"

const env = {
  SUPABASE_URL: "https://example.supabase.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

test("public catalog excludes inactive, hidden, and provider-incomplete plans", async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async () => response([
    { plan_id: "weekly", version: 1, active: true, public_visible: false, purchasable: false },
    {
      plan_id: "monthly",
      version: 1,
      display_name: "Monthly",
      active: true,
      public_visible: true,
      purchasable: true,
      provider: "stripe",
      provider_price_id: "price_test",
      price_minor: 3500,
      original_price_minor: 5000,
      currency: "USD",
      billing_interval: "month",
      term: "monthly",
      localized_content: { ar: { name: "شهري" } },
    },
  ])

  const plans = await listCommercialPlans(env, { publicOnly: true })
  assert.equal(plans.length, 1)
  assert.equal(plans[0].id, "monthly")
  assert.equal(plans[0].checkout_enabled, true)
  assert.equal(plans[0].localizations.ar.name, "شهري")
})

test("disabled plan cannot create an order", async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async () => response([{ plan_id: "monthly", version: 1, active: true, purchasable: false }])

  await assert.rejects(
    () => createOrder(env, { plan: "monthly", plan_version: 1, firebase_user_id: "uid", idempotency_key_hash: "hash" }),
    /plan_not_purchasable/,
  )
})

test("provider-unavailable order creation is idempotent", async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const plan = {
    plan_id: "monthly",
    version: 1,
    active: true,
    public_visible: true,
    purchasable: true,
    provider: "stripe",
    provider_price_id: "price_test",
    price_minor: 3500,
    currency: "USD",
  }
  const stored = {
    id: "00000000-0000-4000-8000-000000000001",
    plan_id: "monthly",
    status: "provider_unavailable",
  }
  let inserted = false
  let insertCount = 0
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.includes("/commercial_plans?")) return response([plan])
    if (href.includes("idempotency_key_hash")) return response(inserted ? [stored] : [])
    if (href.includes("/commercial_orders?select=*") && init.method === "POST") {
      inserted = true
      insertCount += 1
      return response([stored])
    }
    throw new Error(`unexpected_request:${href}`)
  }

  const payload = {
    plan: "monthly",
    plan_version: 1,
    firebase_user_id: "uid",
    customer: { email: "customer@example.invalid" },
    idempotency_key_hash: "same-hash",
  }
  const first = await createOrder(env, payload)
  const second = await createOrder(env, payload)
  assert.equal(first.id, second.id)
  assert.equal(insertCount, 1)
})
