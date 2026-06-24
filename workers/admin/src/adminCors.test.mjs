import assert from "node:assert/strict"
import test from "node:test"

import worker from "./index.js"

function preflight(path, origin, method = "GET") {
  return new Request(`https://admin.saturnws.com${path}`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": method,
    },
  })
}

test("admin API preflight accepts the canonical admin origin", async () => {
  const response = await worker.fetch(preflight("/api/admin/history?channel=beta", "https://admin.saturnws.com"), {})
  assert.equal(response.status, 204)
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://admin.saturnws.com")
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), "true")
})

test("admin API preflight rejects unknown origins without fallback", async () => {
  const response = await worker.fetch(preflight("/api/admin/history?channel=beta", "https://evil.example"), {})
  assert.equal(response.status, 403)
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null)
  const payload = await response.json()
  assert.equal(payload.error, "origin_not_allowed")
})

test("customer download catalog does not accept the admin origin", async () => {
  const response = await worker.fetch(preflight("/api/account/downloads/catalog", "https://admin.saturnws.com"), {})
  assert.equal(response.status, 403)
  const payload = await response.json()
  assert.equal(payload.error, "origin_not_allowed")
})

test("public catalog preflight accepts the public site origin", async () => {
  const response = await worker.fetch(preflight("/api/plans/catalog", "https://saturnws.com"), {})
  assert.equal(response.status, 204)
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://saturnws.com")
})
