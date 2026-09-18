const routeOrigin = "https://route-check.saturnws.com"
const policyOrigin = "https://api.saturnws.com"
const timeoutMs = 8_000
const desktopRouteHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  // Match the currently shipped urllib transport so this inexpensive probe
  // catches browser-only edge heuristics before a Desktop package cycle.
  "User-Agent": "Python-urllib/3.11",
}

async function requestJson(url, init, expectedStatus, expectedError) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  const contentType = String(response.headers.get("content-type") || "").toLowerCase()
  if (response.status !== expectedStatus || !contentType.includes("application/json")) {
    throw new Error(`delivery_boundary_rejected:${new URL(url).hostname}:${response.status}`)
  }
  const body = await response.json().catch(() => null)
  if (!body || typeof body !== "object" || body.error !== expectedError) {
    throw new Error(`delivery_contract_mismatch:${new URL(url).hostname}`)
  }
}

await requestJson(
  `${policyOrigin}/v1/route-check/capability`,
  { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "SaturnWorkspace-RouteCapability/1" }, body: "{}" },
  400,
  "invalid_route_attempt",
)
await requestJson(
  `${routeOrigin}/v1/host-exit`,
  { method: "POST", headers: desktopRouteHeaders, body: "{}" },
  401,
  "route_capability_required",
)
for (const hostname of ["v4.route-check.saturnws.com", "v6.route-check.saturnws.com"]) {
  await requestJson(
    `https://${hostname}/v1/network`,
    { method: "POST", headers: desktopRouteHeaders, body: "{}" },
    403,
    "forbidden_origin",
  )
}

console.log(JSON.stringify({
  status: "PASS",
  policy_capability_reached: true,
  route_worker_reached: true,
  browser_only_edge_challenge_absent: true,
  sent_capability_or_user_data: false,
}))
