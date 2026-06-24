import assert from "node:assert/strict"
import test from "node:test"

import { handleDownloadCatalog, handleDownloadFile } from "./downloads.js"

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function testEnv() {
  return {
    FIREBASE_WEB_API_KEY: "test-web-key",
    PAYMENTS_ALLOWED_ORIGIN: "https://saturnws.com",
    SUPABASE_URL: "https://example.supabase.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
    OTA_BUCKET: {
      async get() {
        return { body: new Blob(["artifact"]), size: 8, httpMetadata: { contentType: "application/octet-stream" } }
      },
    },
  }
}

function request(path = "/api/account/downloads/catalog") {
  return new Request(`https://admin-api.saturnws.com${path}`, {
    headers: {
      Authorization: "Bearer test-id-token",
      Origin: "https://saturnws.com",
      "CF-Connecting-IP": "127.0.0.1",
    },
  })
}

test("entitled catalog exposes metadata and protected path but not storage key", async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes("identitytoolkit.googleapis.com")) {
      return jsonResponse({ users: [{ localId: "uid-1", email: "customer@example.invalid", emailVerified: true }] })
    }
    if (href.includes("/account_subscriptions?")) {
      return jsonResponse([{ id: "sub-1", firebase_user_id: "uid-1", status: "active", plan: "monthly", starts_at: "2026-01-01T00:00:00Z", expires_at: "2099-01-01T00:00:00Z" }])
    }
    if (href.includes("/download_releases?")) {
      return jsonResponse([{ id: "00000000-0000-4000-8000-000000000001", version: "1.0.0", channel: "beta", platform: "windows", architecture: "x64", filename: "SaturnWorkspace.exe", size_bytes: 8, sha256: "a".repeat(64), object_key: "customer-downloads/private.exe" }])
    }
    throw new Error(`unexpected_request:${href}`)
  }

  const result = await handleDownloadCatalog(request(), testEnv())
  assert.equal(result.releases.length, 1)
  assert.equal(result.releases[0].download_path, "/api/account/downloads/file/00000000-0000-4000-8000-000000000001")
  assert.equal("object_key" in result.releases[0], false)
  assert.equal("url" in result.releases[0], false)
})

test("account without subscription is denied", async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes("identitytoolkit.googleapis.com")) {
      return jsonResponse({ users: [{ localId: "uid-2", email: "customer@example.invalid", emailVerified: true }] })
    }
    if (href.includes("/account_subscriptions?")) return jsonResponse([])
    throw new Error(`unexpected_request:${href}`)
  }

  await assert.rejects(() => handleDownloadCatalog(request(), testEnv()), /download_not_entitled/)
})

test("admin origin cannot use the customer protected download catalog", async () => {
  const adminRequest = new Request("https://admin-api.saturnws.com/api/account/downloads/catalog", {
    headers: {
      Authorization: "Bearer test-id-token",
      Origin: "https://admin.saturnws.com",
      "CF-Connecting-IP": "127.0.0.1",
    },
  })
  await assert.rejects(() => handleDownloadCatalog(adminRequest, testEnv()), /forbidden_origin/)
})

test("invalid release id is rejected before storage access", async () => {
  await assert.rejects(
    () => handleDownloadFile(request("/api/account/downloads/file/not-a-release"), "not-a-release", testEnv()),
    /invalid_release_id/,
  )
})
