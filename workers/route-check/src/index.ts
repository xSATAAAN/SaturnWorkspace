import { DurableObject } from "cloudflare:workers"
import { normalizePublicIp, normalizeTtl, securityHeaders, validAttemptId, validSecretHash } from "./contract.js"
import { ROUTE_CHECK_PAGE } from "./page.js"
import { forwardJsonRequest, minimumInternalHeaders } from "./public-forward.js"
import { error, json, readJson, RouteAttemptCore, sha256 } from "./route-attempt-core.js"

function attemptStub(env: Env, request: Request): DurableObjectStub | null {
  const attemptId = request.headers.get("X-Route-Attempt") || ""
  if (!validAttemptId(attemptId)) return null
  return env.ROUTE_ATTEMPTS.get(env.ROUTE_ATTEMPTS.idFromName(attemptId))
}

function internalRequest(request: Request, path: string, body?: string): Request {
  return new Request(`https://route-attempt.invalid${path}`, {
    method: "POST",
    headers: minimumInternalHeaders(request),
    body,
  })
}

const ROUTE_PAGE_ORIGIN = "https://route-check.saturnws.com"

type RouteCapabilityBinding = {
  consumeRouteCapability(input: {
    capability: string
    attempt_id: string
    browser_secret_hash: string
    desktop_secret_hash: string
  }): Promise<{ success: boolean }>
}

async function authorizeRouteCapability(
  env: Env,
  capability: string,
  body: Record<string, unknown>,
): Promise<Response | null> {
  if (!validAttemptId(body.attempt_id) || !validSecretHash(body.browser_secret_hash) || !validSecretHash(body.desktop_secret_hash)) {
    return error("invalid_attempt")
  }
  try {
    const policyCapabilities = env.POLICY_CAPABILITIES as unknown as RouteCapabilityBinding
    const authorization = await policyCapabilities.consumeRouteCapability({
      capability,
      attempt_id: body.attempt_id,
      browser_secret_hash: body.browser_secret_hash,
      desktop_secret_hash: body.desktop_secret_hash,
    })
    return authorization.success ? null : error("route_capability_rejected", 401)
  } catch {
    return error("route_check_authorization_unavailable", 503)
  }
}

function corsHeaders(origin: string): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Route-Attempt, X-Route-Token, X-Saturn-QA-Loopback",
    "Access-Control-Max-Age": "300",
    "Vary": "Origin",
  })
}

async function withCors(response: Response, origin: string): Promise<Response> {
  const headers = new Headers(response.headers)
  for (const [name, value] of corsHeaders(origin)) headers.set(name, value)
  return new Response(await response.arrayBuffer(), { status: response.status, statusText: response.statusText, headers })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const requestOrigin = request.headers.get("Origin") || ""
    const qaLoopback = String(env.QA_LOOPBACK_ALLOWED) === "true"
      && request.headers.get("X-Saturn-QA-Loopback") === "1"
      && Boolean(requestOrigin)
    const localFamily = qaLoopback ? url.searchParams.get("family") : ""
    const networkFamily = url.hostname === "v4.route-check.saturnws.com" || localFamily === "ipv4" ? "ipv4" : url.hostname === "v6.route-check.saturnws.com" || localFamily === "ipv6" ? "ipv6" : ""
    const allowedOrigin = qaLoopback ? requestOrigin : ROUTE_PAGE_ORIGIN
    if (networkFamily && request.method === "OPTIONS" && url.pathname === "/v1/network") {
      if (request.headers.get("Origin") !== allowedOrigin) return error("forbidden_origin", 403)
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) })
    }
    if (networkFamily && request.method === "POST" && url.pathname === "/v1/network") {
      if (request.headers.get("Origin") !== allowedOrigin) return error("forbidden_origin", 403)
      const stub = attemptStub(env, request)
      return await withCors(stub ? await stub.fetch(internalRequest(request, `/internal/network/${networkFamily}`)) : error("invalid_attempt"), allowedOrigin)
    }
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/check")) {
      const headers = securityHeaders("text/html; charset=utf-8")
      headers.set("Content-Security-Policy", "default-src 'none'; base-uri 'none'; connect-src 'self' https://v4.route-check.saturnws.com https://v6.route-check.saturnws.com; form-action 'none'; frame-ancestors 'none'; img-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'")
      return new Response(ROUTE_CHECK_PAGE, { headers })
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ success: true, service: "saturnws-route-check", persistent_logs: false })
    }
    if (request.method === "POST" && url.pathname === "/v1/attempts") {
      const capability = request.headers.get("X-Route-Initiation") || ""
      if (!/^[a-f0-9]{64}$/.test(capability)) return error("route_capability_required", 401)
      const source = request.headers.get("CF-Connecting-IP") || "unavailable"
      try {
        const limited = await env.INIT_RATE_LIMITER.limit({ key: await sha256(`route-init:${source}`) })
        if (!limited.success) return error("rate_limited", 429)
      } catch {
        return error("route_check_authorization_unavailable", 503)
      }
      let body: Record<string, unknown>
      try {
        body = await readJson(request) as Record<string, unknown>
      } catch (caught) {
        const tooLarge = caught instanceof Error && caught.message === "request_too_large"
        return error(tooLarge ? "request_too_large" : "invalid_json", tooLarge ? 413 : 400)
      }
      const denied = await authorizeRouteCapability(env, capability, body)
      if (denied) return denied
      const attemptId = String(body.attempt_id || "")
      if (!/^[A-Za-z0-9_-]{32,64}$/.test(attemptId)) return error("invalid_attempt", 400)
      try {
        const stub = env.ROUTE_ATTEMPTS.get(env.ROUTE_ATTEMPTS.idFromName(attemptId))
        return stub.fetch("https://route-attempt.invalid/internal/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            browser_secret_hash: body.browser_secret_hash,
            desktop_secret_hash: body.desktop_secret_hash,
            ttl_seconds: normalizeTtl(body.ttl_seconds),
          }),
        })
      } catch {
        return error("route_check_unavailable", 503)
      }
    }
    if (request.method === "POST" && url.pathname === "/v1/host-exit") {
      const capability = request.headers.get("X-Route-Initiation") || ""
      if (!/^[a-f0-9]{64}$/.test(capability)) return error("route_capability_required", 401)
      const source = request.headers.get("CF-Connecting-IP") || ""
      try {
        const limited = await env.INIT_RATE_LIMITER.limit({ key: await sha256(`route-host:${source || "unavailable"}`) })
        if (!limited.success) return error("rate_limited", 429)
      } catch {
        return error("route_check_authorization_unavailable", 503)
      }
      let body: Record<string, unknown>
      try {
        body = await readJson(request) as Record<string, unknown>
      } catch (caught) {
        const tooLarge = caught instanceof Error && caught.message === "request_too_large"
        return error(tooLarge ? "request_too_large" : "invalid_json", tooLarge ? 413 : 400)
      }
      const denied = await authorizeRouteCapability(env, capability, body)
      if (denied) return denied
      const exitIp = normalizePublicIp(source)
      return exitIp ? json({ success: true, exit_ip: exitIp }) : error("host_exit_unavailable", 503)
    }
    if (request.method === "POST" && url.pathname === "/v1/observe") {
      const stub = attemptStub(env, request)
      if (!stub) return error("invalid_attempt")
      return forwardJsonRequest(request, stub, "/internal/observe")
    }
    if (request.method === "POST" && url.pathname === "/v1/result") {
      const stub = attemptStub(env, request)
      return stub ? stub.fetch(internalRequest(request, "/internal/result")) : error("invalid_attempt")
    }
    if (request.method === "POST" && url.pathname === "/v1/decision") {
      const stub = attemptStub(env, request)
      if (!stub) return error("invalid_attempt")
      return forwardJsonRequest(request, stub, "/internal/decision")
    }
    if (request.method === "POST" && url.pathname === "/v1/browser-result") {
      const stub = attemptStub(env, request)
      return stub ? stub.fetch(internalRequest(request, "/internal/browser-result")) : error("invalid_attempt")
    }
    if (request.method === "POST" && url.pathname === "/v1/browser-ack") {
      const stub = attemptStub(env, request)
      return stub ? stub.fetch(internalRequest(request, "/internal/browser-ack")) : error("invalid_attempt")
    }
    if (request.method === "POST" && url.pathname === "/v1/finalize") {
      const stub = attemptStub(env, request)
      return stub ? stub.fetch(internalRequest(request, "/internal/finalize")) : error("invalid_attempt")
    }
    return error("not_found", 404)
  },
} satisfies ExportedHandler<Env>

export class RouteAttempt extends DurableObject<Env> {
  private readonly core: RouteAttemptCore

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.core = new RouteAttemptCore(ctx.storage)
  }

  async fetch(request: Request): Promise<Response> {
    return this.core.fetch(request)
  }

  async alarm(): Promise<void> {
    return this.core.alarm()
  }
}
