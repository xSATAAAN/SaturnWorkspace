export function assertArtifactBinarySignature(value, artifactType) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || 0)
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (
    (bytes[2] === 0x03 && bytes[3] === 0x04) ||
    (bytes[2] === 0x05 && bytes[3] === 0x06) ||
    (bytes[2] === 0x07 && bytes[3] === 0x08)
  )
  const isExecutable = bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a
  if ((artifactType === "installed" && !isZip) || (artifactType === "portable" && !isExecutable)) {
    throw new Error("invalid_file_content")
  }
}

export function releaseVersionKey(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/^v/, "").split("+", 1)[0]
  const [core, prerelease = ""] = normalized.split("-", 2)
  const release = (core.match(/\d+/g) || []).slice(0, 4).map(Number)
  while (release.length < 4) release.push(0)
  let prereleaseRank = 4
  let prereleaseNumbers = [0, 0]
  if (normalized.includes("-")) {
    prereleaseRank = prerelease.includes("rc") ? 3 : prerelease.includes("beta") ? 2 : prerelease.includes("alpha") ? 1 : 0
    prereleaseNumbers = (prerelease.match(/\d+/g) || []).slice(0, 2).map(Number)
    while (prereleaseNumbers.length < 2) prereleaseNumbers.push(0)
  }
  return [...release, prereleaseRank, ...prereleaseNumbers]
}

export function compareReleaseVersions(left, right) {
  const leftKey = releaseVersionKey(left)
  const rightKey = releaseVersionKey(right)
  for (let index = 0; index < Math.max(leftKey.length, rightKey.length); index += 1) {
    const difference = (leftKey[index] || 0) - (rightKey[index] || 0)
    if (difference) return difference > 0 ? 1 : -1
  }
  return 0
}

function normalizeReleaseNotesValue(value) {
  if (typeof value === "string") return value.trim().slice(0, 6000)
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join("\n")
      .slice(0, 6000)
  }
  if (!value || typeof value !== "object") return ""
  const localized = {}
  for (const locale of ["ar", "en", "default"]) {
    const notes = normalizeReleaseNotesValue(value[locale])
    if (notes) localized[locale] = notes
  }
  return Object.keys(localized).length ? localized : ""
}

function normalizeWhatsNewRelease(value) {
  if (!value || typeof value !== "object") return null
  const version = String(value.version || value.app_version || "")
    .trim()
    .replace(/^v/i, "")
    .slice(0, 80)
  if (!/^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?(?:\+[0-9a-z.-]+)?$/i.test(version)) return null
  const notes = normalizeReleaseNotesValue(value.notes ?? value.release_notes ?? value.body)
  if (!notes || (typeof notes === "object" && !Object.keys(notes).length)) return null
  const buildId = String(value.build_id || value.app_build_id || "").trim().slice(0, 160)
  return {
    version,
    ...(buildId ? { build_id: buildId } : {}),
    notes,
  }
}

export function mergeWhatsNewReleaseHistory(existingHistory, releases, limit = 24) {
  const boundedLimit = Math.max(1, Math.min(50, Number(limit) || 24))
  const values = [
    ...(Array.isArray(existingHistory) ? existingHistory : []),
    ...(Array.isArray(releases) ? releases : []),
  ]
  const byVersion = new Map()
  for (const value of values) {
    const normalized = normalizeWhatsNewRelease(value)
    if (!normalized) continue
    byVersion.set(normalized.version.toLowerCase(), normalized)
  }
  return Array.from(byVersion.values())
    .sort((left, right) => compareReleaseVersions(left.version, right.version))
    .slice(-boundedLimit)
}

export function releaseTargetAudienceKey(value) {
  const parts = []
  for (const key of ["user_ids", "user_emails", "install_ids", "device_ids", "hwids"]) {
    const raw = Array.isArray(value?.[key])
      ? value[key]
      : typeof value?.[key] === "string"
        ? value[key].split(/[\s,;]+/g)
        : []
    const items = Array.from(new Set(raw.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))).sort()
    parts.push(`${key}:${items.join(",")}`)
  }
  return parts.join("|")
}
