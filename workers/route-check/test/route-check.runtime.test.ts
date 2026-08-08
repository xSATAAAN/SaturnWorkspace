import { env } from "cloudflare:workers"
import { runDurableObjectAlarm, runInDurableObject, SELF } from "cloudflare:test"
import { expect, test } from "vitest"

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function initiation(attemptId: string, capability = ""): Request {
  return new Request("https://route-check.saturnws.com/v1/attempts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.20",
      ...(capability ? { "X-Route-Initiation": capability } : {}),
    },
    body: JSON.stringify({
      attempt_id: attemptId,
      browser_secret_hash: "b".repeat(64),
      desktop_secret_hash: "d".repeat(64),
      ttl_seconds: 90,
    }),
  })
}

test("public initiation requires a one-time policy capability before Durable Object creation", async () => {
  const attemptId = "m".repeat(43)
  expect((await SELF.fetch(initiation(attemptId))).status).toBe(401)
  const capability = "f".repeat(64)
  expect((await SELF.fetch(initiation(attemptId, capability))).status).toBe(201)
  expect((await SELF.fetch(initiation(attemptId, capability))).status).toBe(401)

  const stub = env.ROUTE_ATTEMPTS.get(env.ROUTE_ATTEMPTS.idFromName(attemptId))
  await runInDurableObject(stub, async (_instance, state) => {
    expect((await state.storage.get<Record<string, unknown>>("attempt"))?.status).toBe("waiting")
  })
})

test("initiation distinguishes malformed input from unavailable authorization infrastructure", async () => {
  const malformed = initiation("m".repeat(43), "a".repeat(64))
  const malformedResponse = await SELF.fetch(new Request(malformed.url, {
    method: "POST",
    headers: malformed.headers,
    body: "{not-json",
  }))
  expect(malformedResponse.status).toBe(400)
  expect(await malformedResponse.json()).toMatchObject({ error: "invalid_json" })

  const unavailable = await SELF.fetch(initiation("n".repeat(43), "e".repeat(64)))
  expect(unavailable.status).toBe(503)
  expect(await unavailable.json()).toMatchObject({ error: "route_check_authorization_unavailable" })
})

test("host exit measurement is one-time, capability-bound, and not persisted", async () => {
  const attemptId = "h".repeat(43)
  const capability = "c".repeat(64)
  const request = new Request("https://route-check.saturnws.com/v1/host-exit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.30",
      "X-Route-Initiation": capability,
    },
    body: JSON.stringify({
      attempt_id: attemptId,
      browser_secret_hash: "b".repeat(64),
      desktop_secret_hash: "d".repeat(64),
    }),
  })
  const replayRequest = request.clone()
  const measured = await SELF.fetch(request)
  expect(measured.status).toBe(200)
  expect(await measured.json()).toEqual({ success: true, exit_ip: "203.0.113.30" })

  const replay = await SELF.fetch(replayRequest)
  expect(replay.status).toBe(401)
  const stub = env.ROUTE_ATTEMPTS.get(env.ROUTE_ATTEMPTS.idFromName(attemptId))
  await runInDurableObject(stub, async (_instance, state) => {
    expect(await state.storage.get("attempt")).toBeUndefined()
  })
})

test("workerd runs the browser observation, decision, acknowledgement, and retention lifecycle", async () => {
  const attemptId = "z".repeat(43)
  const browserToken = `browser-${"b".repeat(48)}`
  const desktopToken = `desktop-${"d".repeat(48)}`
  const stub = env.ROUTE_ATTEMPTS.get(env.ROUTE_ATTEMPTS.idFromName(attemptId))
  const initialized = await stub.fetch("https://route-attempt.invalid/internal/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      browser_secret_hash: await digest(browserToken),
      desktop_secret_hash: await digest(desktopToken),
      ttl_seconds: 90,
    }),
  })
  expect(initialized.status).toBe(201)

  const ipv4 = await stub.fetch("https://route-attempt.invalid/internal/network/ipv4", {
    method: "POST",
    headers: { "X-Route-Token": browserToken, "CF-Connecting-IP": "203.0.113.22" },
    body: "{}",
  })
  expect(ipv4.status).toBe(200)
  const observed = await stub.fetch("https://route-attempt.invalid/internal/observe", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Route-Token": browserToken, "CF-Connecting-IP": "203.0.113.22" },
    body: JSON.stringify({
      ipv4_probe_attempted: true,
      ipv6_probe_attempted: true,
      webrtc_public_candidate: false,
      webrtc_public_candidates: [],
      webrtc_private_candidate: false,
      webrtc_relay_candidate: false,
      webrtc_gathering_completed: true,
      browser_probe_completed: true,
    }),
  })
  expect(observed.status).toBe(200)
  expect((await stub.fetch("https://route-attempt.invalid/internal/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Route-Token": desktopToken },
    body: JSON.stringify({ qualified: true, code: "route_qualified" }),
  })).status).toBe(200)
  expect((await stub.fetch("https://route-attempt.invalid/internal/browser-ack", {
    method: "POST", headers: { "X-Route-Token": browserToken }, body: "{}",
  })).status).toBe(200)

  expect(await runDurableObjectAlarm(stub)).toBe(true)
  await runInDurableObject(stub, async (_instance, state) => {
    expect(await state.storage.get("attempt")).toBeUndefined()
    expect(await state.storage.getAlarm()).toBeNull()
  })
})
