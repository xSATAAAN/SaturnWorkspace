const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function normalizeHex(input: string): string {
  return String(input || "").trim().toLowerCase().replace(/^sha256=/, "")
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
  return toHex(signature)
}

export async function sha256Hex(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(payload))
  return toHex(digest)
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const left = normalizeHex(a)
  const right = normalizeHex(b)
  if (!left || !right || left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  }
  return diff === 0
}

export function generateLicenseKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const parts = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()
  return `SATURN-${parts.slice(0, 8)}-${parts.slice(8, 16)}-${parts.slice(16, 24)}-${parts.slice(24, 32)}`
}

export function randomBase64Url(byteCount = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

export function randomUserCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const text = Array.from(bytes, (byte) => chars[byte % chars.length]).join("")
  return `${text.slice(0, 4)}-${text.slice(4)}`
}
