import { resolveSubscriptionTruth } from "../../../shared/subscriptions/resolver.js"
import { verifyFirebaseCustomer } from "../security/firebaseCustomer.js"
import { enforceBrowserOrigin, enforcePaymentRateLimit } from "../security/payments.js"
import { encodeFilterValue, supabaseJson } from "../services/supabase.js"

const RELEASE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_OBJECT_KEY = /^customer-downloads\/[A-Za-z0-9._/-]+$/

function bearerToken(request) {
  const authorization = String(request.headers.get("Authorization") || "").trim()
  return authorization.replace(/^Bearer\s+/i, "").trim()
}

async function customerContext(request, env) {
  const customer = await verifyFirebaseCustomer(bearerToken(request), env)
  const rows = await supabaseJson(
    env,
    `/account_subscriptions?firebase_user_id=eq.${encodeFilterValue(customer.user_id)}&select=*&order=created_at.desc&limit=100`,
  )
  const resolution = resolveSubscriptionTruth(Array.isArray(rows) ? rows : [], {
    firebaseUid: customer.user_id,
    email: customer.email,
  })
  return { customer, resolution }
}

function canDownload(resolution) {
  return ["entitled", "grace_period"].includes(String(resolution?.projection?.entitlement || ""))
}

function publicRelease(release) {
  return {
    id: String(release.id || ""),
    version: String(release.version || ""),
    channel: String(release.channel || ""),
    platform: String(release.platform || ""),
    architecture: String(release.architecture || ""),
    filename: String(release.filename || ""),
    size_bytes: Number(release.size_bytes || 0),
    sha256: String(release.sha256 || ""),
    release_notes: String(release.release_notes || ""),
    minimum_requirements: String(release.minimum_requirements || ""),
    published_at: release.published_at || null,
    download_path: `/api/account/downloads/file/${encodeURIComponent(String(release.id || ""))}`,
  }
}

async function releaseById(env, releaseId) {
  const rows = await supabaseJson(
    env,
    `/download_releases?id=eq.${encodeFilterValue(releaseId)}&active=eq.true&select=*&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] || null : null
}

async function recordAccess(env, releaseId, customer, resolution, decision, request) {
  await supabaseJson(env, "/download_access_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      release_id: releaseId,
      firebase_uid: customer.user_id,
      decision,
      entitlement: String(resolution?.projection?.entitlement || "unknown"),
      request_id: String(request.headers.get("CF-Ray") || "").slice(0, 100) || null,
    }),
  }).catch(() => null)
}

export async function handleDownloadCatalog(request, env) {
  enforceBrowserOrigin(request, env)
  await enforcePaymentRateLimit(request, env, "download_catalog")
  const { resolution } = await customerContext(request, env)
  if (!canDownload(resolution)) throw new Error("download_not_entitled")
  const rows = await supabaseJson(
    env,
    "/download_releases?active=eq.true&select=*&order=published_at.desc,created_at.desc&limit=50",
  )
  return {
    success: true,
    entitlement: resolution.projection.entitlement,
    releases: (Array.isArray(rows) ? rows : []).map(publicRelease),
  }
}

export async function handleDownloadFile(request, releaseId, env) {
  enforceBrowserOrigin(request, env)
  await enforcePaymentRateLimit(request, env, "download_file")
  if (!RELEASE_ID_PATTERN.test(releaseId)) throw new Error("invalid_release_id")
  const [{ customer, resolution }, release] = await Promise.all([
    customerContext(request, env),
    releaseById(env, releaseId),
  ])
  if (!release) throw new Error("release_not_found")
  if (!canDownload(resolution)) {
    await recordAccess(env, release.id, customer, resolution, "denied", request)
    throw new Error("download_not_entitled")
  }
  const objectKey = String(release.object_key || "")
  if (!SAFE_OBJECT_KEY.test(objectKey)) throw new Error("invalid_release_object")
  const object = await env.OTA_BUCKET.get(objectKey)
  if (!object) throw new Error("release_artifact_missing")
  await recordAccess(env, release.id, customer, resolution, "allowed", request)
  const filename = String(release.filename || "SaturnWorkspace.exe").replace(/[^A-Za-z0-9._-]/g, "_")
  const headers = new Headers({
    "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-SaturnWS-SHA256": String(release.sha256 || ""),
  })
  if (object.size) headers.set("Content-Length", String(object.size))
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers })
}
