import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { MAX_ATTEMPT_TTL_SECONDS, MIN_ATTEMPT_TTL_SECONDS, normalizeObservation, normalizePublicIp, normalizeTtl, securityHeaders, validAttemptId, validSecretHash } from "./contract.js"
import { ROUTE_CHECK_PAGE } from "./page.js"

test("attempt identifiers and secret hashes are bounded", () => {
  assert.equal(validAttemptId("a".repeat(32)), true)
  assert.equal(validAttemptId("short"), false)
  assert.equal(validAttemptId("a".repeat(65)), false)
  assert.equal(validSecretHash("a".repeat(64)), true)
  assert.equal(validSecretHash("A".repeat(64)), false)
})
test("ttl is clamped to the privacy retention window", () => {
  assert.equal(normalizeTtl(1), MIN_ATTEMPT_TTL_SECONDS)
  assert.equal(normalizeTtl(999), MAX_ATTEMPT_TTL_SECONDS)
})
test("host exit normalization accepts only bounded public IP values", () => {
  assert.equal(normalizePublicIp("203.0.113.20"), "203.0.113.20")
  assert.equal(normalizePublicIp("2001:db8::20"), "2001:db8::20")
  assert.equal(normalizePublicIp("192.168.1.1"), null)
  assert.equal(normalizePublicIp("not-an-ip"), null)
})
test("observation rejects raw or incomplete values", () => {
  assert.equal(normalizeObservation({ webrtc_public_candidate: false }), null)
  assert.deepEqual(normalizeObservation({ ipv4_probe_attempted: true, ipv6_probe_attempted: true, webrtc_public_candidate: false, webrtc_public_candidates: [], webrtc_private_candidate: true, webrtc_relay_candidate: false, webrtc_gathering_completed: true, browser_probe_completed: true, raw_candidate: "192.0.2.1" }), { ipv4_probe_attempted: true, ipv6_probe_attempted: true, webrtc_public_candidate: false, webrtc_public_candidates: [], webrtc_private_candidate: true, webrtc_relay_candidate: false, webrtc_gathering_completed: true, browser_probe_completed: true })
})
test("measurement page carries no analytics or identity fields", () => {
  for (const forbidden of ["firebase", "email", "profile_id", "analytics", "target_url", "proxy_password"]) assert.equal(ROUTE_CHECK_PAGE.toLowerCase().includes(forbidden), false, forbidden)
  assert.match(ROUTE_CHECK_PAGE, /history\.replaceState/)
  assert.match(ROUTE_CHECK_PAGE, /credentials:'omit'/)
  assert.match(ROUTE_CHECK_PAGE, /\.route-check\.saturnws\.com\/v1\/network/)
  assert.match(ROUTE_CHECK_PAGE, /probeNetwork\('ipv4'\)/)
  assert.match(ROUTE_CHECK_PAGE, /probeNetwork\('ipv6'\)/)
  assert.match(ROUTE_CHECK_PAGE, /\\\.local\$/)
  assert.match(ROUTE_CHECK_PAGE, /classify\(e\.candidate\)/)
  assert.match(ROUTE_CHECK_PAGE, /iceGatheringState==='complete'/)
  assert.match(ROUTE_CHECK_PAGE, /webrtc_gathering_completed:complete/)
  assert.match(ROUTE_CHECK_PAGE, /observation\.webrtc_private_candidate\|\|observation\.webrtc_public_candidate/)
  assert.match(ROUTE_CHECK_PAGE, /stun:stun\.cloudflare\.com:3478/)
  assert.match(ROUTE_CHECK_PAGE, /Cloudflare STUN infrastructure/)
  assert.match(ROUTE_CHECK_PAGE, /مسار محلل DNS غير مقاس/)
  assert.match(ROUTE_CHECK_PAGE, /navigator\.language/)
  assert.match(ROUTE_CHECK_PAGE, /Connection route check/)
  assert.match(ROUTE_CHECK_PAGE, /فحص مسار الاتصال/)
  assert.match(ROUTE_CHECK_PAGE, /prefers-reduced-motion:reduce/)
  assert.doesNotMatch(ROUTE_CHECK_PAGE, /setTimeout\(r,2500\)/)
})
test("security headers disable storage and ambient capabilities", () => {
  const headers = securityHeaders("application/json")
  assert.equal(headers.get("Cache-Control"), "no-store, max-age=0")
  assert.equal(headers.get("Referrer-Policy"), "no-referrer")
  assert.match(headers.get("Permissions-Policy") || "", /camera=\(\)/)
})
test("measurement page CSP limits HTTPS probes and permits only the declared external STUN endpoint", () => {
  const workerSource = readFileSync(path.resolve(process.cwd(), "src/index.ts"), "utf8")
  assert.match(workerSource, /connect-src 'self' https:\/\/v4\.route-check\.saturnws\.com https:\/\/v6\.route-check\.saturnws\.com/)
  assert.match(ROUTE_CHECK_PAGE, /stun:stun\.cloudflare\.com:3478/)
  assert.doesNotMatch(workerSource, /connect-src \*/)
})
test("worker protocol matches the canonical desktop control-plane contract", () => {
  const contract = JSON.parse(readFileSync(path.resolve(process.cwd(), "../../contracts/desktop-control-plane.v1.json"), "utf8"))
  assert.equal(contract.route_check.origin, "https://route-check.saturnws.com")
  assert.deepEqual(contract.route_check.operations.observe.required, [
    "ipv4_probe_attempted",
    "ipv6_probe_attempted",
    "browser_probe_completed",
    "webrtc_gathering_completed",
    "webrtc_public_candidate",
    "webrtc_public_candidates",
    "webrtc_private_candidate",
    "webrtc_relay_candidate",
  ])
  assert.equal(contract.route_check.qualification.does_not_claim_to_measure_dns_resolver_identity, true)
  assert.equal(contract.route_check.qualification.requires_complete_webrtc_candidate_gathering, true)
  assert.equal(contract.route_check.qualification.requires_ipv4_and_ipv6_side_route_evidence, true)
  assert.equal(contract.route_check.operations.decision.authorization, "desktop_attempt_token")
  assert.equal(contract.route_check.operations.browser_result.authorization, "browser_attempt_token")
  assert.deepEqual(contract.route_check.operations.browser_result.forbidden, ["raw_exit_ip", "network_observation"])
  assert.equal(contract.route_check.operations.browser_acknowledgement.effect, "confirm_visible_decision_rendered")
  assert.equal(contract.route_check.qualification.requires_visible_browser_acknowledgement_before_targets, true)
  assert.equal(contract.route_check.privacy.persistent_application_observability, false)
})

test("worker configuration enforces bounded initiation and no persistent observability", () => {
  const config = JSON.parse(readFileSync(path.resolve(process.cwd(), "wrangler.jsonc"), "utf8"))
  assert.deepEqual(config.observability, { enabled: false })
  assert.deepEqual(config.vars, { QA_LOOPBACK_ALLOWED: "false" })
  assert.deepEqual(config.ratelimits, [{
    name: "INIT_RATE_LIMITER",
    namespace_id: "910701",
    simple: { limit: 30, period: 60 },
  }])
  assert.deepEqual(config.durable_objects.bindings, [{ name: "ROUTE_ATTEMPTS", class_name: "RouteAttempt" }])
  assert.deepEqual(config.routes.map((route: { pattern: string }) => route.pattern), [
    "route-check.saturnws.com/*",
    "v4.route-check.saturnws.com/*",
    "v6.route-check.saturnws.com/*",
  ])
  assert.equal(config.preview_urls, false)
  assert.equal(config.workers_dev, false)
})
