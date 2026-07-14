export type ReleaseArtifactType = 'installed' | 'portable'

export function releaseVersionFromArtifactName(filename: string, artifactType: ReleaseArtifactType = 'installed') {
  const value = String(filename || '').trim()
  const pattern = artifactType === 'installed'
    ? /^SaturnWorkspace-app-(.+)\.zip$/i
    : /^SaturnWorkspace-(?:Setup|Portable)-(.+)\.exe$/i
  return pattern.exec(value)?.[1]?.trim() || ''
}
