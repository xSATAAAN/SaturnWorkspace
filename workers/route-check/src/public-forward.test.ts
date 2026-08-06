import assert from "node:assert/strict"
import test from "node:test"
import { forwardJsonRequest } from "./public-forward.js"

function request(body: BodyInit | null): Request {
  return new Request("https://route-check.saturnws.com/v1/observe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
}

test("public JSON forwarding distinguishes malformed and oversized bodies", async () => {
  const stub = { fetch: async () => new Response(null, { status: 204 }) }
  const malformed = await forwardJsonRequest(request("{"), stub, "/internal/observe")
  const oversized = await forwardJsonRequest(
    request(JSON.stringify({ value: "x".repeat(5000) })),
    stub,
    "/internal/observe",
  )

  assert.equal(malformed.status, 400)
  assert.deepEqual(await malformed.json(), { success: false, error: "invalid_json" })
  assert.equal(oversized.status, 413)
  assert.deepEqual(await oversized.json(), { success: false, error: "request_too_large" })
})

test("public JSON forwarding fails closed when Durable Object storage is unavailable", async () => {
  const unavailable = await forwardJsonRequest(
    request(JSON.stringify({ browser_probe_completed: true })),
    { fetch: async () => { throw new Error("synthetic_storage_outage") } },
    "/internal/observe",
  )

  assert.equal(unavailable.status, 503)
  assert.deepEqual(await unavailable.json(), { success: false, error: "route_check_unavailable" })
})
