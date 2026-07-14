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
