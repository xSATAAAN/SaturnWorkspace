import { handleCreatePayment, handleGetPaymentStatus, handlePaymentWebhook } from "./routes/payments.js";
const CHANNELS = ["stable", "beta"];
const UPDATE_MODES = ["optional", "force", "required", "silent"];
const DEFAULT_MANIFEST = {
  version: "0",
  available: false,
  mandatory: false,
  download_url: "",
  filename: "",
  notes: "",
  channels: {
    stable: {},
    beta: {},
  },
  extensions: {
    trust_wallet: {
      name: "Trust Wallet Extension",
      version: "0",
      available: false,
      download_url: "",
      filename: "trust-wallet.zip",
      notes: "",
    },
  },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return handleOptions(request, env);

    try {
      if (url.pathname === "/updates/latest.json" && request.method === "GET") {
        return serveLatestManifest(env);
      }
      if (url.pathname.startsWith("/updates/file/") && request.method === "GET") {
        return serveReleaseBinary(url, env);
      }
      if (url.pathname === "/api/admin/state" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await loadDashboardState(env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/upload" && request.method === "POST") {
        const adminEmail = await requireAdmin(request, env);
        return json(await uploadReleaseBinary(request, env, adminEmail), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/publish" && request.method === "POST") {
        const adminEmail = await requireAdmin(request, env);
        return json(await publishRelease(request, env, adminEmail), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/history" && request.method === "GET") {
        await requireAdmin(request, env);
        const channel = normalizeChannel(url.searchParams.get("channel"));
        return json(await getReleaseHistory(env, channel), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/rollback" && request.method === "POST") {
        const adminEmail = await requireAdmin(request, env);
        return json(await rollbackRelease(request, env, adminEmail), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/payments/create" && request.method === "POST") {
        return json(await handleCreatePayment(request, env), 200, corsHeaders(request, env));
      }
      if (url.pathname.startsWith("/api/payments/") && request.method === "GET") {
        const orderId = decodeURIComponent(url.pathname.replace("/api/payments/", "")).trim();
        return json(await handleGetPaymentStatus(request, orderId, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/payments/webhook" && request.method === "POST") {
        return json(await handlePaymentWebhook(request, env), 200, corsHeaders(request, env));
      }
      return json({ success: false, error: "not_found" }, 404, corsHeaders(request, env));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "unexpected_error");
      const status = message === "unauthorized" ? 401 : 400;
      return json({ success: false, error: message }, status, corsHeaders(request, env));
    }
  },
};

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ADMIN_ORIGIN || "").trim();
  const value = allowed && origin === allowed ? origin : allowed || "*";
  return {
    "Access-Control-Allow-Origin": value,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function handleOptions(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

async function requireAdmin(request, env) {
  const bearer = request.headers.get("Authorization") || "";
  const configuredToken = String(env.ADMIN_API_TOKEN || "").trim();
  if (configuredToken && bearer.startsWith("Bearer ")) {
    const provided = bearer.slice("Bearer ".length).trim();
    if (provided === configuredToken) return "token-admin";
  }

  const email = (request.headers.get("cf-access-authenticated-user-email") || "").trim().toLowerCase();
  const allowlist = String(env.ADMIN_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!email || !allowlist.includes(email)) {
    throw new Error("unauthorized");
  }
  return email;
}

function normalizeChannel(value) {
  const channel = String(value || "stable").trim().toLowerCase();
  return CHANNELS.includes(channel) ? channel : "stable";
}

function normalizeVersion(value) {
  const version = String(value || "").trim();
  if (!version) throw new Error("missing_version");
  if (!/^[0-9A-Za-z._-]{1,60}$/.test(version)) throw new Error("invalid_version");
  return version;
}

function normalizeUpdateMode(value) {
  const mode = String(value || "optional").trim().toLowerCase();
  if (!UPDATE_MODES.includes(mode)) throw new Error("invalid_update_mode");
  return mode;
}

function sanitizeFilename(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^\w.\-]+/g, "_");
  return cleaned || "SATAN-Toolkit.exe";
}

function releaseObjectKey(channel, version, filename) {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  return `releases/${channel}/${version}/${now}_${sanitizeFilename(filename)}`;
}

async function uploadReleaseBinary(request, env, adminEmail) {
  const maxMb = Number(env.MAX_UPLOAD_MB || 150);
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > 0 && contentLength > maxMb * 1024 * 1024) {
    throw new Error("file_too_large");
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("missing_file");
  if (!String(file.name || "").toLowerCase().endsWith(".exe")) throw new Error("invalid_file_type");
  if (file.size <= 0) throw new Error("empty_file");
  if (file.size > maxMb * 1024 * 1024) throw new Error("file_too_large");

  const channel = normalizeChannel(form.get("channel"));
  const version = normalizeVersion(form.get("version"));
  const key = releaseObjectKey(channel, version, file.name);
  const fileBytes = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", fileBytes);
  const hashHex = [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

  await env.OTA_BUCKET.put(key, fileBytes, {
    httpMetadata: {
      contentType: "application/vnd.microsoft.portable-executable",
      contentDisposition: `attachment; filename="${sanitizeFilename(file.name)}"`,
    },
    customMetadata: {
      version,
      channel,
      uploadedBy: adminEmail,
      sha256: hashHex,
    },
  });

  const releaseRecord = {
    key,
    channel,
    version,
    filename: sanitizeFilename(file.name),
    size: file.size,
    sha256: hashHex,
    uploaded_at: new Date().toISOString(),
    uploaded_by: adminEmail,
  };
  await env.OTA_BUCKET.put(`meta/${channel}/${version}.json`, JSON.stringify(releaseRecord, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  await appendAudit(env, {
    type: "upload",
    channel,
    version,
    key,
    actor: adminEmail,
    at: new Date().toISOString(),
  });
  return { success: true, release: releaseRecord };
}

async function publishRelease(request, env, adminEmail) {
  const body = await request.json();
  const channel = normalizeChannel(body?.channel);
  const version = normalizeVersion(body?.version);
  const updateMode = normalizeUpdateMode(body?.update_mode);
  const notes = String(body?.notes || "").trim();
  const mandatory = Boolean(body?.mandatory) || updateMode === "force" || updateMode === "required";

  const metaKey = `meta/${channel}/${version}.json`;
  const metaObj = await env.OTA_BUCKET.get(metaKey);
  if (!metaObj) throw new Error("release_not_uploaded");
  const release = await metaObj.json();
  const downloadUrlBase = String(env.PUBLIC_UPDATES_BASE_URL || "https://satantoolkit.com/updates").replace(/\/+$/, "");
  const downloadUrl = `${downloadUrlBase}/file/${encodeURIComponent(release.key)}`;

  const manifest = await loadManifest(env);
  const channelManifest = {
    version,
    available: true,
    mandatory,
    download_url: downloadUrl,
    filename: release.filename || "SATAN Toolkit.exe",
    notes,
    remote_config: {
      ...(manifest.channels?.[channel]?.remote_config || {}),
      update_mode: updateMode,
    },
    published_at: new Date().toISOString(),
  };
  const nextManifest = {
    ...manifest,
    version: channel === "stable" ? version : manifest.version || version,
    available: true,
    mandatory: channel === "stable" ? mandatory : Boolean(manifest.mandatory),
    download_url: channel === "stable" ? downloadUrl : manifest.download_url || "",
    filename: channel === "stable" ? channelManifest.filename : manifest.filename || "",
    notes: channel === "stable" ? notes : manifest.notes || "",
    channels: {
      stable: manifest.channels?.stable || {},
      beta: manifest.channels?.beta || {},
      [channel]: channelManifest,
    },
  };

  await saveManifest(env, nextManifest);
  await appendAudit(env, {
    type: "publish",
    channel,
    version,
    update_mode: updateMode,
    actor: adminEmail,
    at: new Date().toISOString(),
  });
  return { success: true, manifest: nextManifest };
}

async function rollbackRelease(request, env, adminEmail) {
  const body = await request.json();
  const channel = normalizeChannel(body?.channel);
  const version = normalizeVersion(body?.version);
  const metaKey = `meta/${channel}/${version}.json`;
  const metaObj = await env.OTA_BUCKET.get(metaKey);
  if (!metaObj) throw new Error("rollback_release_not_found");
  const release = await metaObj.json();

  const manifest = await loadManifest(env);
  const existing = manifest.channels?.[channel] || {};
  const downloadUrlBase = String(env.PUBLIC_UPDATES_BASE_URL || "https://satantoolkit.com/updates").replace(/\/+$/, "");
  const downloadUrl = `${downloadUrlBase}/file/${encodeURIComponent(release.key)}`;
  const updatedChannel = {
    ...existing,
    version,
    available: true,
    download_url: downloadUrl,
    filename: release.filename || existing.filename || "SATAN Toolkit.exe",
    published_at: new Date().toISOString(),
  };

  const nextManifest = {
    ...manifest,
    version: channel === "stable" ? version : manifest.version,
    download_url: channel === "stable" ? downloadUrl : manifest.download_url,
    filename: channel === "stable" ? updatedChannel.filename : manifest.filename,
    channels: {
      stable: manifest.channels?.stable || {},
      beta: manifest.channels?.beta || {},
      [channel]: updatedChannel,
    },
  };
  await saveManifest(env, nextManifest);
  await appendAudit(env, {
    type: "rollback",
    channel,
    version,
    actor: adminEmail,
    at: new Date().toISOString(),
  });
  return { success: true, manifest: nextManifest };
}

async function getReleaseHistory(env, channel) {
  const audit = await loadAudit(env);
  const filtered = audit
    .filter((event) => !channel || event.channel === channel)
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  return { success: true, events: filtered };
}

async function loadDashboardState(env) {
  const manifest = await loadManifest(env);
  const audit = await loadAudit(env);
  return {
    success: true,
    manifest,
    recent_events: audit.slice(-50).reverse(),
  };
}

async function loadManifest(env) {
  const existing = await env.OTA_BUCKET.get("updates/latest.json");
  if (!existing) return structuredClone(DEFAULT_MANIFEST);
  try {
    const parsed = await existing.json();
    if (!parsed || typeof parsed !== "object") return structuredClone(DEFAULT_MANIFEST);
    return {
      ...structuredClone(DEFAULT_MANIFEST),
      ...parsed,
      channels: {
        stable: {},
        beta: {},
        ...(parsed.channels && typeof parsed.channels === "object" ? parsed.channels : {}),
      },
    };
  } catch {
    return structuredClone(DEFAULT_MANIFEST);
  }
}

async function saveManifest(env, manifest) {
  await env.OTA_BUCKET.put("updates/latest.json", JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

async function loadAudit(env) {
  const existing = await env.OTA_BUCKET.get("updates/audit.json");
  if (!existing) return [];
  try {
    const parsed = await existing.json();
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function appendAudit(env, event) {
  const list = await loadAudit(env);
  list.push(event);
  const next = list.slice(-5000);
  await env.OTA_BUCKET.put("updates/audit.json", JSON.stringify(next, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

async function serveLatestManifest(env) {
  const manifest = await loadManifest(env);
  return new Response(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function serveReleaseBinary(url, env) {
  const raw = decodeURIComponent(url.pathname.replace("/updates/file/", ""));
  const key = raw.trim();
  if (!key || !key.startsWith("releases/")) {
    return new Response("Not found", { status: 404 });
  }
  const obj = await env.OTA_BUCKET.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("Cache-Control", "public, max-age=300");
  return new Response(obj.body, { status: 200, headers });
}
