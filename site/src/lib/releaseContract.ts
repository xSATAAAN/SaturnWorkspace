export function releaseVersionKey(value: string) {
  const normalized = String(value || '').trim().toLowerCase().replace(/^v/, '').split('+', 1)[0]
  const [core, prerelease = ''] = normalized.split('-', 2)
  const release = (core.match(/\d+/g) || []).slice(0, 4).map(Number)
  while (release.length < 4) release.push(0)
  let prereleaseRank = 4
  let prereleaseNumbers = [0, 0]
  if (normalized.includes('-')) {
    prereleaseRank = prerelease.includes('rc') ? 3 : prerelease.includes('beta') ? 2 : prerelease.includes('alpha') ? 1 : 0
    prereleaseNumbers = (prerelease.match(/\d+/g) || []).slice(0, 2).map(Number)
    while (prereleaseNumbers.length < 2) prereleaseNumbers.push(0)
  }
  return [...release, prereleaseRank, ...prereleaseNumbers]
}

export function compareReleaseVersions(left: string, right: string) {
  const leftKey = releaseVersionKey(left)
  const rightKey = releaseVersionKey(right)
  for (let index = 0; index < Math.max(leftKey.length, rightKey.length); index += 1) {
    const difference = (leftKey[index] || 0) - (rightKey[index] || 0)
    if (difference) return difference > 0 ? 1 : -1
  }
  return 0
}
