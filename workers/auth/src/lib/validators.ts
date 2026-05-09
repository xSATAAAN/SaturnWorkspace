export function isValidLicenseKey(value: unknown): boolean {
  const text = String(value || "").trim()
  return /^SATURN-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}$/.test(text)
}

export function normalizeHwid(value: unknown): string {
  return String(value || "").trim()
}

export function isValidHwid(value: unknown): boolean {
  const hwid = normalizeHwid(value)
  return hwid.length >= 8 && hwid.length <= 200
}

export function isLicenseExpired(expiryDateIso: string | null): boolean {
  if (!expiryDateIso) return false
  const ts = Date.parse(expiryDateIso)
  if (!Number.isFinite(ts)) return false
  return Date.now() > ts
}
