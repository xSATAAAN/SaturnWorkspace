import { ApiError } from './http'

export type ProtectedRelease = {
  id: string
  version: string
  channel: string
  platform: string
  architecture: string
  filename: string
  size_bytes: number
  sha256: string
  release_notes: string
  minimum_requirements: string
  published_at?: string | null
  download_path: string
}

export type ProtectedReleaseCatalog = {
  success: boolean
  entitlement: string
  releases: ProtectedRelease[]
}

function downloadApiUrl(path: string) {
  if (typeof window === 'undefined') return `https://admin-api.saturnws.com${path}`
  const host = window.location.hostname.toLowerCase()
  if (host === 'admin.saturnws.com' || host === 'admin-api.saturnws.com') return path
  return `https://admin-api.saturnws.com${path}`
}

async function responseError(response: Response) {
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  const message = typeof payload?.error === 'string' ? payload.error : `request_failed_${response.status}`
  return new ApiError(message, response.status)
}

export async function fetchProtectedReleaseCatalog(idToken: string) {
  const response = await fetch(downloadApiUrl('/api/account/downloads/catalog'), {
    method: 'GET',
    headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json' },
  })
  if (!response.ok) throw await responseError(response)
  return response.json() as Promise<ProtectedReleaseCatalog>
}

export async function fetchProtectedReleaseFile(releaseId: string, idToken: string) {
  const response = await fetch(downloadApiUrl(`/api/account/downloads/file/${encodeURIComponent(releaseId)}`), {
    method: 'GET',
    headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/octet-stream' },
  })
  if (!response.ok) throw await responseError(response)
  return response.blob()
}
