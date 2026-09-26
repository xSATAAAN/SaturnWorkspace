import assert from "node:assert/strict"
import test from "node:test"
import vm from "node:vm"
import { ROUTE_CHECK_PAGE } from "./page.js"

test("a background route-check page acknowledges the browser decision without a paint callback", async () => {
  const script = ROUTE_CHECK_PAGE.match(/<script>([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script)
  const elements = new Map<string, { textContent: string; className: string; setAttribute: () => void }>()
  const element = (id: string) => {
    if (!elements.has(id)) elements.set(id, { textContent: "", className: "", setAttribute() {} })
    return elements.get(id)!
  }
  let acknowledged = false
  const response = (value: object) => ({ ok: true, json: async () => value })
  const context = {
    navigator: { language: "en-US" },
    document: { documentElement: { lang: "", dir: "" }, title: "", getElementById: element },
    location: { hash: `#attempt=${"a".repeat(43)}&token=${"b".repeat(48)}`, pathname: "/check", search: "", hostname: "127.0.0.1" },
    history: { replaceState() {} },
    URLSearchParams,
    setTimeout: (callback: () => void, delay: number) => delay === 15000 ? 0 : setTimeout(callback, delay),
    clearTimeout,
    // Chromium may suspend animation frames in a background tab/window.
    requestAnimationFrame() {},
    RTCPeerConnection: class {
      iceGatheringState = "complete"
      onicecandidate = null
      createDataChannel() {}
      async createOffer() { return {} }
      async setLocalDescription() {}
      close() {}
    },
    fetch: async (path: string) => {
      if (path.startsWith("/v1/network")) return response({ success: true, exit_ip_masked: "198.51.x.x" })
      if (path === "/v1/observe") return response({ success: true, exit_ip_masked: "198.51.x.x" })
      if (path === "/v1/browser-result") return response({ success: true, decision: "qualified" })
      if (path === "/v1/browser-ack") { acknowledged = true; return response({ success: true }) }
      throw new Error(`unexpected route ${path}`)
    },
    window: {} as Record<string, unknown>,
  }
  vm.runInNewContext(script, context)
  await new Promise<void>((resolve, reject) => {
    const poll = setInterval(() => {
      if (acknowledged) { clearInterval(poll); clearTimeout(timeout); resolve() }
    }, 5)
    const timeout = setTimeout(() => {
      clearInterval(poll)
      reject(new Error("background browser acknowledgement stalled"))
    }, 150)
  })
  assert.equal(acknowledged, true)
  assert.equal(element("title").textContent, "Route qualified")
})
