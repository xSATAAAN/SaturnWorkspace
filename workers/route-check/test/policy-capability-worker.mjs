import { WorkerEntrypoint } from "cloudflare:workers"

const consumed = new Set()

export class RouteCapabilityService extends WorkerEntrypoint {
  async consumeRouteCapability(input) {
    const capability = String(input?.capability || "")
    if (capability === "e".repeat(64)) throw new Error("synthetic-policy-outage")
    const valid = /^[a-f0-9]{64}$/.test(capability)
      && /^[A-Za-z0-9_-]{32,64}$/.test(String(input?.attempt_id || ""))
      && /^[a-f0-9]{64}$/.test(String(input?.browser_secret_hash || ""))
      && /^[a-f0-9]{64}$/.test(String(input?.desktop_secret_hash || ""))
      && !consumed.has(capability)
    if (!valid) return { success: false, error: "route_capability_rejected" }
    consumed.add(capability)
    return { success: true }
  }
}

export default { fetch() { return new Response("not_found", { status: 404 }) } }
