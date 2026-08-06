import { normalizeObservation, normalizeTtl, publicBrowserResult, publicResult, securityHeaders, validSecretHash } from "./contract.js"

type AttemptRecord = {
  schema: "saturnws.route-check.attempt.v1"
  browser_secret_hash: string
  desktop_secret_hash: string
  status: "waiting" | "observed" | "finalized"
  created_at: number
  expires_at: number
  observed_at?: number
  exit_ip?: string
  ipv4_exit?: string
  ipv6_exit?: string
  observation?: NonNullable<ReturnType<typeof normalizeObservation>>
  decision?: "qualified" | "rejected"
  decision_code?: string
  decision_at?: number
  browser_acknowledged_at?: number
}

export interface RouteAttemptStorage {
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
  setAlarm(scheduledTime: number): Promise<void>
  deleteAlarm(): Promise<void>
  deleteAll(): Promise<void>
}

const MAX_BODY_BYTES = 4096
const FINALIZE_TOMBSTONE_SECONDS = 30

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: securityHeaders("application/json; charset=utf-8") })
}

export function error(code: string, status = 400): Response {
  return json({ success: false, error: code }, status)
}

export async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("Content-Length") || 0)
  if (length > MAX_BODY_BYTES) throw new Error("request_too_large")
  if (!request.body) return {}
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BODY_BYTES) {
        await reader.cancel("request_too_large")
        throw new Error("request_too_large")
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(body)
  return text ? JSON.parse(text) : {}
}

export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function sameHash(left: string, right: string): boolean {
  if (!validSecretHash(left) || !validSecretHash(right)) return false
  const decode = (value: string) => Uint8Array.from(value.match(/.{2}/g) || [], (pair) => Number.parseInt(pair, 16))
  const leftBytes = decode(left)
  const rightBytes = decode(right)
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean }
  if (typeof subtle.timingSafeEqual !== "function") throw new Error("timing_safe_compare_unavailable")
  return subtle.timingSafeEqual(leftBytes, rightBytes)
}

function ipFamily(value: string): "ipv4" | "ipv6" | null {
  if (value.includes(":")) return /^[0-9a-f:.]+$/i.test(value) ? "ipv6" : null
  const parts = value.split(".")
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null
  return "ipv4"
}

export class RouteAttemptCore {
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly storage: RouteAttemptStorage) {}

  private async serialized<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.tail
    let release!: () => void
    this.tail = new Promise<void>((resolve) => { release = resolve })
    await previous
    try {
      return await action()
    } finally {
      release()
    }
  }

  private async record(): Promise<AttemptRecord | undefined> {
    const record = await this.storage.get<AttemptRecord>("attempt")
    if (record && record.expires_at <= Date.now()) {
      await this.storage.deleteAll()
      await this.storage.deleteAlarm()
      return undefined
    }
    return record
  }

  private async authorize(request: Request, expectedHash: string): Promise<boolean> {
    const token = request.headers.get("X-Route-Token") || ""
    if (token.length < 32 || token.length > 256) return false
    return sameHash(await sha256(token), expectedHash)
  }

  async fetch(request: Request): Promise<Response> {
    return this.serialized(() => this.fetchSerialized(request))
  }

  private async fetchSerialized(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname
    if (request.method !== "POST") return error("method_not_allowed", 405)
    if (path === "/internal/init") {
      const body = await readJson(request) as Record<string, unknown>
      if (!validSecretHash(body.browser_secret_hash) || !validSecretHash(body.desktop_secret_hash)) return error("invalid_attempt")
      const existing = await this.record()
      if (existing) {
        return error("attempt_already_initialized", 409)
      }
      const now = Date.now()
      const record: AttemptRecord = {
        schema: "saturnws.route-check.attempt.v1",
        browser_secret_hash: body.browser_secret_hash,
        desktop_secret_hash: body.desktop_secret_hash,
        status: "waiting",
        created_at: now,
        expires_at: now + normalizeTtl(body.ttl_seconds) * 1000,
      }
      await this.storage.setAlarm(record.expires_at)
      await this.storage.put("attempt", record)
      return json(publicResult(record), 201)
    }
    const record = await this.record()
    if (!record) return error("attempt_not_found", 404)
    if (record.status === "finalized") {
      if (path !== "/internal/finalize") return error("attempt_not_found", 404)
      if (!await this.authorize(request, record.desktop_secret_hash)) return error("unauthorized", 401)
      return json({ success: true, deleted: true, already_finalized: true })
    }
    if (path === "/internal/network/ipv4" || path === "/internal/network/ipv6") {
      if (!await this.authorize(request, record.browser_secret_hash)) return error("unauthorized", 401)
      const family = path.endsWith("ipv6") ? "ipv6" : "ipv4"
      const exitIp = request.headers.get("CF-Connecting-IP") || ""
      if (ipFamily(exitIp) !== family) return error(`${family}_route_unavailable`, 503)
      const field = family === "ipv4" ? "ipv4_exit" : "ipv6_exit"
      const previous = record[field]
      if (previous && previous !== exitIp) return error("network_observation_conflict", 409)
      if (!previous) await this.storage.put("attempt", { ...record, [field]: exitIp })
      return json({ success: true, family, exit_ip_masked: maskIp(exitIp) })
    }
    if (path === "/internal/observe") {
      if (!await this.authorize(request, record.browser_secret_hash)) return error("unauthorized", 401)
      const observation = normalizeObservation(await readJson(request))
      if (!observation) return error("invalid_observation")
      const exitIp = request.headers.get("CF-Connecting-IP") || ""
      if (!exitIp || exitIp.length > 64) return error("exit_ip_unavailable", 503)
      if (record.status === "observed") {
        const sameObservation = record.exit_ip === exitIp && JSON.stringify(record.observation) === JSON.stringify(observation)
        if (!sameObservation) return error("observation_conflict", 409)
        return json({ success: true, status: record.status, exit_ip_masked: maskIp(exitIp) })
      }
      const next: AttemptRecord = { ...record, status: "observed", observed_at: Date.now(), exit_ip: exitIp, observation }
      await this.storage.put("attempt", next)
      return json({ success: true, status: next.status, exit_ip_masked: maskIp(exitIp) })
    }
    if (path === "/internal/result") {
      if (!await this.authorize(request, record.desktop_secret_hash)) return error("unauthorized", 401)
      return json(publicResult(record))
    }
    if (path === "/internal/decision") {
      if (!await this.authorize(request, record.desktop_secret_hash)) return error("unauthorized", 401)
      if (record.status !== "observed") return error("observation_not_ready", 409)
      const body = await readJson(request) as Record<string, unknown>
      if (typeof body.qualified !== "boolean" || typeof body.code !== "string" || !/^[a-z0-9_]{1,64}$/.test(body.code)) return error("invalid_decision")
      const decision = body.qualified ? "qualified" : "rejected"
      if (record.decision) {
        return record.decision === decision && record.decision_code === body.code
          ? json(publicResult(record))
          : error("decision_conflict", 409)
      }
      const next: AttemptRecord = { ...record, decision, decision_code: body.code, decision_at: Date.now() }
      await this.storage.put("attempt", next)
      return json(publicResult(next))
    }
    if (path === "/internal/browser-result") {
      if (!await this.authorize(request, record.browser_secret_hash)) return error("unauthorized", 401)
      return json(publicBrowserResult(record))
    }
    if (path === "/internal/browser-ack") {
      if (!await this.authorize(request, record.browser_secret_hash)) return error("unauthorized", 401)
      if (!record.decision) return error("decision_not_ready", 409)
      if (!record.browser_acknowledged_at) {
        const next: AttemptRecord = { ...record, browser_acknowledged_at: Date.now() }
        await this.storage.put("attempt", next)
      }
      return json({ success: true, acknowledged: true })
    }
    if (path === "/internal/finalize") {
      if (!await this.authorize(request, record.desktop_secret_hash)) return error("unauthorized", 401)
      const expiresAt = Math.min(record.expires_at, Date.now() + FINALIZE_TOMBSTONE_SECONDS * 1000)
      const tombstone: AttemptRecord = {
        schema: record.schema,
        browser_secret_hash: "",
        desktop_secret_hash: record.desktop_secret_hash,
        status: "finalized",
        created_at: record.created_at,
        expires_at: expiresAt,
      }
      // Shorten the existing privacy alarm before replacing raw observations.
      // If the write fails, the shortened alarm still removes the old record;
      // if the alarm write fails, the existing alarm remains as containment.
      await this.storage.setAlarm(expiresAt)
      await this.storage.put("attempt", tombstone)
      return json({ success: true, deleted: true })
    }
    return error("not_found", 404)
  }

  async alarm(): Promise<void> {
    await this.serialized(async () => {
      await this.storage.deleteAll()
      await this.storage.deleteAlarm()
    })
  }
}

function maskIp(value: string): string {
  return value.includes(":") ? `${value.split(":").slice(0, 2).join(":")}:…` : `${value.split(".").slice(0, 2).join(".")}.x.x`
}
