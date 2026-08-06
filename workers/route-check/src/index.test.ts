import assert from "node:assert/strict"
import test from "node:test"
import { RouteAttemptCore } from "./route-attempt-core.js"

class FakeStorage {
  private values = new Map<string, unknown>()
  alarmAt: number | null = null
  failNextPut = false
  failNextDeleteAll = false
  failNextDeleteAlarm = false
  async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined }
  async put(key: string, value: unknown): Promise<void> {
    if (this.failNextPut) { this.failNextPut = false; throw new Error("synthetic_put_failure") }
    this.values.set(key, value)
  }
  async setAlarm(value: number): Promise<void> { this.alarmAt = value }
  async deleteAlarm(): Promise<void> {
    if (this.failNextDeleteAlarm) { this.failNextDeleteAlarm = false; throw new Error("synthetic_delete_alarm_failure") }
    this.alarmAt = null
  }
  async deleteAll(): Promise<void> {
    if (this.failNextDeleteAll) { this.failNextDeleteAll = false; throw new Error("synthetic_delete_all_failure") }
    this.values.clear()
  }
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function call(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://route-attempt.invalid${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

test("attempt lifecycle is single-init, owner-bound, and deleted on finalize", async () => {
  const storage = new FakeStorage()
  const durable = new RouteAttemptCore(storage)
  const browserToken = "browser-" + "b".repeat(48)
  const desktopToken = "desktop-" + "d".repeat(48)
  const initBody = {
    browser_secret_hash: await digest(browserToken),
    desktop_secret_hash: await digest(desktopToken),
    ttl_seconds: 90,
  }

  const created = await durable.fetch(call("/internal/init", initBody))
  assert.equal(created.status, 201)
  assert.ok(storage.alarmAt && storage.alarmAt > Date.now())

  const repeated = await durable.fetch(call("/internal/init", initBody))
  assert.equal(repeated.status, 409)
  const conflicting = await durable.fetch(call("/internal/init", { ...initBody, desktop_secret_hash: "e".repeat(64) }))
  assert.equal(conflicting.status, 409)

  const denied = await durable.fetch(call("/internal/result", {}, { "X-Route-Token": "wrong".repeat(10) }))
  assert.equal(denied.status, 401)
  const ipv4 = await durable.fetch(call("/internal/network/ipv4", {}, {
    "X-Route-Token": browserToken,
    "CF-Connecting-IP": "203.0.113.42",
  }))
  assert.equal(ipv4.status, 200)
  const wrongFamily = await durable.fetch(call("/internal/network/ipv6", {}, {
    "X-Route-Token": browserToken,
    "CF-Connecting-IP": "203.0.113.42",
  }))
  assert.equal(wrongFamily.status, 503)
  const ipv6 = await durable.fetch(call("/internal/network/ipv6", {}, {
    "X-Route-Token": browserToken,
    "CF-Connecting-IP": "2001:db8::42",
  }))
  assert.equal(ipv6.status, 200)
  const observed = await durable.fetch(call("/internal/observe", {
    ipv4_probe_attempted: true,
    ipv6_probe_attempted: true,
    webrtc_public_candidate: false,
    webrtc_public_candidates: [],
    webrtc_private_candidate: true,
    webrtc_relay_candidate: false,
    webrtc_gathering_completed: true,
    browser_probe_completed: true,
  }, { "X-Route-Token": browserToken, "CF-Connecting-IP": "203.0.113.42" }))
  assert.equal(observed.status, 200)
  assert.equal((await observed.json() as { exit_ip_masked: string }).exit_ip_masked, "203.0.x.x")
  const repeatedObservation = await durable.fetch(call("/internal/observe", {
    ipv4_probe_attempted: true,
    ipv6_probe_attempted: true,
    webrtc_public_candidate: false,
    webrtc_public_candidates: [],
    webrtc_private_candidate: true,
    webrtc_relay_candidate: false,
    webrtc_gathering_completed: true,
    browser_probe_completed: true,
  }, { "X-Route-Token": browserToken, "CF-Connecting-IP": "203.0.113.42" }))
  assert.equal(repeatedObservation.status, 200)
  const conflictingObservation = await durable.fetch(call("/internal/observe", {
    ipv4_probe_attempted: true,
    ipv6_probe_attempted: true,
    webrtc_public_candidate: true,
    webrtc_public_candidates: ["203.0.113.43"],
    webrtc_private_candidate: true,
    webrtc_relay_candidate: false,
    webrtc_gathering_completed: true,
    browser_probe_completed: true,
  }, { "X-Route-Token": browserToken, "CF-Connecting-IP": "203.0.113.42" }))
  assert.equal(conflictingObservation.status, 409)

  const result = await durable.fetch(call("/internal/result", {}, { "X-Route-Token": desktopToken }))
  const payload = await result.json() as Record<string, unknown>
  assert.equal(payload.exit_ip, "203.0.113.42")
  assert.equal(payload.ipv4_exit, "203.0.113.42")
  assert.equal(payload.ipv6_exit, "2001:db8::42")
  assert.equal(payload.ipv4_probe_completed, true)
  assert.equal(payload.ipv6_probe_completed, true)
  assert.equal(JSON.stringify(payload).includes(browserToken), false)
  assert.equal(JSON.stringify(payload).includes(desktopToken), false)

  const decided = await durable.fetch(call("/internal/decision", { qualified: true, code: "route_qualified" }, { "X-Route-Token": desktopToken }))
  assert.equal(decided.status, 200)
  const browserResult = await durable.fetch(call("/internal/browser-result", {}, { "X-Route-Token": browserToken }))
  const browserPayload = await browserResult.json() as Record<string, unknown>
  assert.deepEqual(browserPayload, { success: true, status: "observed", decision: "qualified", decision_code: "route_qualified" })
  assert.equal(JSON.stringify(browserPayload).includes("203.0.113.42"), false)
  const acknowledged = await durable.fetch(call("/internal/browser-ack", {}, { "X-Route-Token": browserToken }))
  assert.equal(acknowledged.status, 200)
  const acknowledgedResult = await durable.fetch(call("/internal/result", {}, { "X-Route-Token": desktopToken }))
  assert.equal((await acknowledgedResult.json() as Record<string, unknown>).browser_acknowledged, true)

  const finalized = await durable.fetch(call("/internal/finalize", {}, { "X-Route-Token": desktopToken }))
  assert.equal(finalized.status, 200)
  const missing = await durable.fetch(call("/internal/result", {}, { "X-Route-Token": desktopToken }))
  assert.equal(missing.status, 404)
  const finalizedAgain = await durable.fetch(call("/internal/finalize", {}, { "X-Route-Token": desktopToken }))
  assert.equal(finalizedAgain.status, 200)
})

test("alarm removes short-lived raw network observations", async () => {
  const storage = new FakeStorage()
  const durable = new RouteAttemptCore(storage)
  await storage.put("attempt", { exit_ip: "203.0.113.9" })
  await durable.alarm()
  assert.equal(await storage.get("attempt"), undefined)
  assert.equal(storage.alarmAt, null)
})

test("an initialization write failure retains a cleanup alarm and converges", async () => {
  const storage = new FakeStorage()
  const durable = new RouteAttemptCore(storage)
  storage.failNextPut = true
  await assert.rejects(() => durable.fetch(call("/internal/init", {
    browser_secret_hash: "b".repeat(64),
    desktop_secret_hash: "d".repeat(64),
    ttl_seconds: 90,
  })), /synthetic_put_failure/)
  assert.ok(storage.alarmAt)
  await durable.alarm()
  assert.equal(storage.alarmAt, null)
})

test("alarm cleanup never deletes the alarm before raw storage and retries safely", async () => {
  const storage = new FakeStorage()
  const durable = new RouteAttemptCore(storage)
  await storage.put("attempt", { exit_ip: "203.0.113.9" })
  await storage.setAlarm(Date.now())
  storage.failNextDeleteAll = true
  await assert.rejects(() => durable.alarm(), /synthetic_delete_all_failure/)
  assert.ok(storage.alarmAt)
  assert.ok(await storage.get("attempt"))
  await durable.alarm()
  assert.equal(await storage.get("attempt"), undefined)
  assert.equal(storage.alarmAt, null)
})

test("an alarm deletion failure leaves only a harmless retry alarm", async () => {
  const storage = new FakeStorage()
  const durable = new RouteAttemptCore(storage)
  await storage.put("attempt", { exit_ip: "203.0.113.9" })
  await storage.setAlarm(Date.now())
  storage.failNextDeleteAlarm = true
  await assert.rejects(() => durable.alarm(), /synthetic_delete_alarm_failure/)
  assert.equal(await storage.get("attempt"), undefined)
  assert.ok(storage.alarmAt)
  await durable.alarm()
  assert.equal(storage.alarmAt, null)
})

test("an omitted content length cannot bypass the bounded stream reader", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`{"value":"${"x".repeat(5000)}"}`))
      controller.close()
    },
  })
  const request = new Request("https://route-attempt.invalid/test", { method: "POST", body, duplex: "half" } as RequestInit)
  await assert.rejects(() => import("./route-attempt-core.js").then(({ readJson }) => readJson(request)), /request_too_large/)
})

test("a network family cannot change its exit inside one attempt", async () => {
  const storage = new FakeStorage()
  const durable = new RouteAttemptCore(storage)
  const browserToken = "browser-" + "b".repeat(48)
  const desktopToken = "desktop-" + "d".repeat(48)
  await durable.fetch(call("/internal/init", {
    browser_secret_hash: await digest(browserToken),
    desktop_secret_hash: await digest(desktopToken),
    ttl_seconds: 90,
  }))
  const first = await durable.fetch(call("/internal/network/ipv4", {}, { "X-Route-Token": browserToken, "CF-Connecting-IP": "203.0.113.10" }))
  const changed = await durable.fetch(call("/internal/network/ipv4", {}, { "X-Route-Token": browserToken, "CF-Connecting-IP": "203.0.113.11" }))
  assert.equal(first.status, 200)
  assert.equal(changed.status, 409)
})

test("concurrent IPv4 and IPv6 probes preserve both observations", async () => {
  const storage = new FakeStorage()
  const durable = new RouteAttemptCore(storage)
  const browserToken = "browser-concurrent-token-1234567890"
  const desktopToken = "desktop-concurrent-token-1234567890"
  await durable.fetch(call("/internal/init", {
    browser_secret_hash: await digest(browserToken),
    desktop_secret_hash: await digest(desktopToken),
    ttl_seconds: 180,
  }))

  const [ipv4, ipv6] = await Promise.all([
    durable.fetch(call("/internal/network/ipv4", {}, { "X-Route-Token": browserToken, "CF-Connecting-IP": "203.0.113.20" })),
    durable.fetch(call("/internal/network/ipv6", {}, { "X-Route-Token": browserToken, "CF-Connecting-IP": "2001:db8::20" })),
  ])
  assert.equal(ipv4.status, 200)
  assert.equal(ipv6.status, 200)
  const result = await durable.fetch(call("/internal/result", {}, { "X-Route-Token": desktopToken }))
  const payload = await result.json() as Record<string, unknown>
  assert.equal(payload.ipv4_exit, "203.0.113.20")
  assert.equal(payload.ipv6_exit, "2001:db8::20")
})
