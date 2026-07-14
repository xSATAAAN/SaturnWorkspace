export function artifactVersionFromFilename(filename, artifactType) {
  const value = String(filename || "").trim()
  const pattern = artifactType === "installed"
    ? /^SaturnWorkspace-app-(.+)\.zip$/i
    : /^SaturnWorkspace-(?:Setup|Portable)-(.+)\.exe$/i
  return pattern.exec(value)?.[1]?.trim() || ""
}

export function assertArtifactVersionMatchesFilename(filename, artifactType, version) {
  const artifactVersion = artifactVersionFromFilename(filename, artifactType)
  if (artifactType === "installed" && !artifactVersion) {
    throw new Error("release_artifact_filename_invalid")
  }
  if (artifactVersion && artifactVersion.toLowerCase() !== String(version || "").trim().toLowerCase()) {
    throw new Error("release_version_filename_mismatch")
  }
  return artifactVersion
}
