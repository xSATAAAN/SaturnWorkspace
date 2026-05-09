export function normalizeHwid(value: unknown): string {
  return String(value || "").trim()
}

export function isValidHwid(value: unknown): boolean {
  const hwid = normalizeHwid(value)
  return hwid.length >= 8 && hwid.length <= 200
}

export function isIsoExpired(expiryDateIso: string | null): boolean {
  if (!expiryDateIso) return false
  const ts = Date.parse(expiryDateIso)
  if (!Number.isFinite(ts)) return false
  return Date.now() > ts
}
