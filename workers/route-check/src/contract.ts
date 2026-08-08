export const ATTEMPT_TTL_SECONDS = 180
export const MIN_ATTEMPT_TTL_SECONDS = 45
export const MAX_ATTEMPT_TTL_SECONDS = 300

const ATTEMPT_ID = /^[A-Za-z0-9_-]{32,64}$/
const SHA256_HEX = /^[a-f0-9]{64}$/

export type Observation = {
  ipv4_probe_attempted: boolean
  ipv6_probe_attempted: boolean
  webrtc_public_candidate: boolean
  webrtc_public_candidates: string[]
  webrtc_private_candidate: boolean
  webrtc_relay_candidate: boolean
  webrtc_gathering_completed: boolean
  browser_probe_completed: boolean
}

function normalizePublicCandidateIps(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 8) return null
  const output: string[] = []
  for (const item of value) {
    const candidate = String(item || "").trim().toLowerCase()
    if (!candidate || candidate.length > 64) return null
    const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(candidate)
    const ipv6 = candidate.includes(":") && /^[0-9a-f:]+$/.test(candidate)
    const privateAddress = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|169\.254\.|::1$|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/i.test(candidate)
    if ((!ipv4 && !ipv6) || privateAddress) return null
    if (!output.includes(candidate)) output.push(candidate)
  }
  return output
}

export function normalizePublicIp(value: unknown): string | null {
  const normalized = normalizePublicCandidateIps([value])
  return normalized?.[0] || null
}

export function validAttemptId(value: unknown): value is string {
  return typeof value === "string" && ATTEMPT_ID.test(value)
}

export function validSecretHash(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value)
}

export function normalizeTtl(value: unknown): number {
  const ttl = Number(value)
  if (!Number.isInteger(ttl)) return ATTEMPT_TTL_SECONDS
  return Math.min(MAX_ATTEMPT_TTL_SECONDS, Math.max(MIN_ATTEMPT_TTL_SECONDS, ttl))
}

export function normalizeObservation(value: unknown): Observation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const keys = [
    "ipv4_probe_attempted",
    "ipv6_probe_attempted",
    "webrtc_public_candidate",
    "webrtc_private_candidate",
    "webrtc_relay_candidate",
    "webrtc_gathering_completed",
    "browser_probe_completed",
  ]
  if (keys.some((key) => typeof input[key] !== "boolean")) return null
  const publicCandidates = normalizePublicCandidateIps(input.webrtc_public_candidates)
  if (publicCandidates === null || Boolean(input.webrtc_public_candidate) !== Boolean(publicCandidates.length)) return null
  return {
    ipv4_probe_attempted: input.ipv4_probe_attempted as boolean,
    ipv6_probe_attempted: input.ipv6_probe_attempted as boolean,
    webrtc_public_candidate: input.webrtc_public_candidate as boolean,
    webrtc_public_candidates: publicCandidates,
    webrtc_private_candidate: input.webrtc_private_candidate as boolean,
    webrtc_relay_candidate: input.webrtc_relay_candidate as boolean,
    webrtc_gathering_completed: input.webrtc_gathering_completed as boolean,
    browser_probe_completed: input.browser_probe_completed as boolean,
  }
}

export function securityHeaders(contentType: string): Headers {
  return new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": contentType,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  })
}

export function publicResult(record: {
  status: string
  expires_at: number
  observed_at?: number
  exit_ip?: string
  ipv4_exit?: string
  ipv6_exit?: string
  observation?: Observation
  decision?: "qualified" | "rejected"
  decision_code?: string
  browser_acknowledged_at?: number
}) {
  const observedExits = new Set([record.exit_ip, record.ipv4_exit, record.ipv6_exit].filter((value): value is string => Boolean(value)))
  const publicCandidates = record.observation?.webrtc_public_candidates || []
  return {
    success: true,
    status: record.status,
    expires_at: new Date(record.expires_at).toISOString(),
    observed_at: record.observed_at ? new Date(record.observed_at).toISOString() : null,
    exit_ip: record.exit_ip || null,
    ipv4_exit: record.ipv4_exit || null,
    ipv6_exit: record.ipv6_exit || null,
    ipv4_probe_completed: Boolean(record.ipv4_exit),
    ipv6_probe_completed: Boolean(record.ipv6_exit),
    // The Worker derives this from the authenticated /observe request reaching
    // the measurement origin. The browser is not trusted to assert it.
    measurement_host_resolved: Boolean(record.observation && record.exit_ip),
    ipv4_probe_attempted: record.observation?.ipv4_probe_attempted ?? false,
    ipv6_probe_attempted: record.observation?.ipv6_probe_attempted ?? false,
    browser_probe_completed: record.observation?.browser_probe_completed ?? false,
    webrtc_gathering_completed: record.observation?.webrtc_gathering_completed ?? false,
    webrtc_public_candidate: record.observation?.webrtc_public_candidate ?? null,
    webrtc_private_candidate: record.observation?.webrtc_private_candidate ?? null,
    webrtc_relay_candidate: record.observation?.webrtc_relay_candidate ?? null,
    webrtc_candidate_route_qualified: Boolean(
      record.observation
      && record.observation.webrtc_private_candidate === false
      && publicCandidates.every((candidate) => observedExits.has(candidate))
    ),
    decision: record.decision || null,
    decision_code: record.decision_code || null,
    browser_acknowledged: Boolean(record.browser_acknowledged_at),
  }
}

export function publicBrowserResult(record: {
  status: string
  decision?: "qualified" | "rejected"
  decision_code?: string
}) {
  return {
    success: true,
    status: record.status,
    decision: record.decision || null,
    decision_code: record.decision_code || null,
  }
}
