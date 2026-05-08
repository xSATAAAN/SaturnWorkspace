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

function hasOtaBucket(env) {
  return Boolean(env && env.OTA_BUCKET && typeof env.OTA_BUCKET.get === "function" && typeof env.OTA_BUCKET.put === "function");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = (url.hostname || "").toLowerCase();
    if (request.method === "OPTIONS") return handleOptions(request, env);

    try {
      if (host === "admin.satantoolkit.com" && request.method === "GET" && !url.pathname.startsWith("/api/")) {
        return proxyAdminFrontend(url);
      }
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
      if (url.pathname === "/api/admin/dashboard" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await getAdminDashboard(env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/licenses" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await listLicenses(url, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/licenses" && request.method === "POST") {
        const adminEmail = await requireAdmin(request, env);
        return json(await createLicense(request, env, adminEmail), 200, corsHeaders(request, env));
      }
      if (url.pathname.startsWith("/api/admin/licenses/") && request.method === "PATCH") {
        const adminEmail = await requireAdmin(request, env);
        const licenseId = decodeURIComponent(url.pathname.replace("/api/admin/licenses/", "")).trim();
        return json(await updateLicense(licenseId, request, env, adminEmail), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/promo-codes" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await listPromoCodes(url, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/promo-codes" && request.method === "POST") {
        const adminEmail = await requireAdmin(request, env);
        return json(await createPromoCode(request, env, adminEmail), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/ota-updates" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await listOtaUpdates(url, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/ota-updates" && request.method === "POST") {
        const adminEmail = await requireAdmin(request, env);
        return json(await createOtaUpdate(request, env, adminEmail), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/crash-logs" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await listCrashLogs(url, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/crash-logs/ingest" && request.method === "POST") {
        return json(await ingestCrashLog(request, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/licenses/issue" && request.method === "POST") {
        return json(await issueLicense(request, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/licenses/verify" && request.method === "POST") {
        return json(await verifyLicense(request, env), 200, corsHeaders(request, env));
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

async function proxyAdminFrontend(url) {
  const source = new URL(url.toString());
  source.hostname = "satantoolkit.com";
  source.protocol = "https:";
  source.port = "";
  source.hash = "";
  const upstream = await fetch(source.toString(), {
    method: "GET",
    headers: {
      "User-Agent": "SATAN-Toolkit-AdminProxy/1",
      "Accept": "*/*",
    },
  });

  const path = source.pathname || "/";
  const lastSegment = path.split("/").pop() || "";
  const looksLikeStaticFile = lastSegment.includes(".");
  let finalUpstream = upstream;
  if (upstream.status === 404 && !looksLikeStaticFile) {
    const fallback = new URL(source.toString());
    fallback.pathname = "/";
    fallback.search = "";
    finalUpstream = await fetch(fallback.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "SATAN-Toolkit-AdminProxy/1",
        "Accept": "*/*",
      },
    });
  }

  const headers = new Headers(finalUpstream.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(finalUpstream.body, {
    status: finalUpstream.status,
    headers,
  });
}

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

  if (bearer.startsWith("Bearer ")) {
    const idToken = bearer.slice("Bearer ".length).trim();
    if (idToken) {
      const firebaseAdminEmail = await verifyFirebaseAdminEmail(idToken, env);
      if (firebaseAdminEmail) {
        return firebaseAdminEmail;
      }
    }
  }

  const email = (request.headers.get("cf-access-authenticated-user-email") || "").trim().toLowerCase();
  const allowlist = parseAdminAllowlist(env);
  if (!email || !allowlist.includes(email)) {
    throw new Error("unauthorized");
  }
  return email;
}

function parseAdminAllowlist(env) {
  return String(env.ADMIN_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

async function verifyFirebaseAdminEmail(idToken, env) {
  const allowlist = parseAdminAllowlist(env);
  if (!allowlist.length) return null;
  const webApiKey = String(env.FIREBASE_WEB_API_KEY || "").trim();
  if (!webApiKey) return null;

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(webApiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return null;

  const payload = await response.json().catch(() => null);
  const user = payload?.users?.[0];
  const email = String(user?.email || "").trim().toLowerCase();
  const emailVerified = Boolean(user?.emailVerified);

  if (!email || !emailVerified) return null;
  return allowlist.includes(email) ? email : null;
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
  if (!hasOtaBucket(env)) throw new Error("r2_not_enabled");
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
  if (!hasOtaBucket(env)) throw new Error("r2_not_enabled");
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
  if (!hasOtaBucket(env)) throw new Error("r2_not_enabled");
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
  if (!hasOtaBucket(env)) return { success: true, events: [] };
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
  if (!hasOtaBucket(env)) return structuredClone(DEFAULT_MANIFEST);
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
  if (!hasOtaBucket(env)) return;
  await env.OTA_BUCKET.put("updates/latest.json", JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

async function loadAudit(env) {
  if (!hasOtaBucket(env)) return [];
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
  if (!hasOtaBucket(env)) return;
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
  if (!hasOtaBucket(env)) return new Response("R2 is not enabled for this account.", { status: 503 });
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

function getSupabaseConfig(env) {
  const baseUrl = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceKey) {
    throw new Error("supabase_not_configured");
  }
  return { baseUrl, serviceKey };
}

async function supabaseRequest(env, table, method = "GET", { query = "", body = null, prefer = "" } = {}) {
  const { baseUrl, serviceKey } = getSupabaseConfig(env);
  const url = `${baseUrl}/rest/v1/${table}${query ? `?${query}` : ""}`;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `supabase_${response.status}`);
  }
  return payload;
}

function safeInt(value, fallback = 25, max = 200) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

async function getAdminDashboard(env) {
  const [licenses, crashes, alerts, updates] = await Promise.all([
    supabaseRequest(env, "licenses", "GET", { query: "select=id,status,tier,created_at&limit=200" }),
    supabaseRequest(env, "crash_logs", "GET", { query: "select=id,error_type,happened_at,user_id&order=happened_at.desc&limit=20" }),
    supabaseRequest(env, "tamper_alerts", "GET", { query: "select=id,severity,resolved,happened_at,reason&resolved=is.false&order=happened_at.desc&limit=50" }),
    supabaseRequest(env, "ota_updates", "GET", { query: "select=id,version,channel,is_mandatory,is_published,created_at&order=created_at.desc&limit=20" }),
  ]);
  const activeUsers = Array.isArray(licenses) ? licenses.filter((x) => x.status === "active").length : 0;
  const churnedUsers = Array.isArray(licenses) ? licenses.filter((x) => x.status === "expired" || x.status === "revoked").length : 0;
  return {
    success: true,
    kpis: {
      total_active_users: activeUsers,
      churned_users: churnedUsers,
      active_tampering_alerts: Array.isArray(alerts) ? alerts.length : 0,
      total_revenue: null,
    },
    recent_activity: [...(Array.isArray(crashes) ? crashes : []), ...(Array.isArray(updates) ? updates : [])]
      .sort((a, b) => String(b.happened_at || b.created_at || "").localeCompare(String(a.happened_at || a.created_at || "")))
      .slice(0, 20),
  };
}

async function listLicenses(url, env) {
  const limit = safeInt(url.searchParams.get("limit"), 50);
  const status = String(url.searchParams.get("status") || "").trim();
  const tier = String(url.searchParams.get("tier") || "").trim();
  const filters = [];
  if (status) filters.push(`status.eq.${encodeURIComponent(status)}`);
  if (tier) filters.push(`tier.eq.${encodeURIComponent(tier)}`);
  const query = `select=*&order=created_at.desc&limit=${limit}${filters.length ? `&${filters.join("&")}` : ""}`;
  const data = await supabaseRequest(env, "licenses", "GET", { query });
  return { success: true, items: data || [] };
}

async function createLicense(request, env, adminEmail) {
  const body = await request.json();
  const licenseKey = String(body?.license_key || body?.licenseKey || "").trim();
  const plan = String(body?.plan || "monthly").trim().toLowerCase();
  const tier = String(body?.tier || "public").trim().toLowerCase();
  const expiresAt = String(body?.expires_at || "").trim();
  if (!licenseKey || !expiresAt) throw new Error("missing_license_fields");
  const payload = {
    license_key: licenseKey,
    user_email: String(body?.user_email || "").trim() || null,
    plan,
    tier,
    status: "active",
    expires_at: expiresAt,
    feature_payload: body?.feature_payload && typeof body.feature_payload === "object" ? body.feature_payload : {},
    metadata: { ...(body?.metadata && typeof body.metadata === "object" ? body.metadata : {}), created_by: adminEmail },
  };
  const created = await supabaseRequest(env, "licenses", "POST", {
    body: payload,
    prefer: "return=representation",
  });
  return { success: true, item: Array.isArray(created) ? created[0] : created };
}

async function updateLicense(licenseId, request, env, adminEmail) {
  if (!licenseId) throw new Error("missing_license_id");
  const body = await request.json();
  const patch = {};
  if (body?.status) patch.status = String(body.status).trim().toLowerCase();
  if (body?.tier) patch.tier = String(body.tier).trim().toLowerCase();
  if (body?.hwid !== undefined) patch.hwid = body.hwid ? String(body.hwid).trim() : null;
  if (body?.expires_at) patch.expires_at = String(body.expires_at).trim();
  patch.metadata = { ...(body?.metadata && typeof body.metadata === "object" ? body.metadata : {}), updated_by: adminEmail };
  const updated = await supabaseRequest(env, "licenses", "PATCH", {
    query: `id=eq.${encodeURIComponent(licenseId)}&select=*`,
    body: patch,
    prefer: "return=representation",
  });
  return { success: true, item: Array.isArray(updated) ? updated[0] : updated };
}

async function listPromoCodes(url, env) {
  const limit = safeInt(url.searchParams.get("limit"), 100);
  const data = await supabaseRequest(env, "promo_codes", "GET", {
    query: `select=*&order=created_at.desc&limit=${limit}`,
  });
  return { success: true, items: data || [] };
}

async function createPromoCode(request, env, adminEmail) {
  const body = await request.json();
  const payload = {
    code: String(body?.code || "").trim(),
    title: String(body?.title || "").trim() || null,
    discount_type: String(body?.discount_type || "percent").trim().toLowerCase(),
    discount_value: Number(body?.discount_value || 0),
    max_uses: body?.max_uses ? Number(body.max_uses) : null,
    expires_at: body?.expires_at ? String(body.expires_at).trim() : null,
    is_active: body?.is_active !== false,
    is_private_tier_trigger: Boolean(body?.is_private_tier_trigger),
    private_feature_payload:
      body?.private_feature_payload && typeof body.private_feature_payload === "object" ? body.private_feature_payload : {},
    metadata: { ...(body?.metadata && typeof body.metadata === "object" ? body.metadata : {}), created_by: adminEmail },
  };
  if (!payload.code) throw new Error("missing_code");
  const created = await supabaseRequest(env, "promo_codes", "POST", {
    body: payload,
    prefer: "return=representation",
  });
  return { success: true, item: Array.isArray(created) ? created[0] : created };
}

async function listOtaUpdates(url, env) {
  const limit = safeInt(url.searchParams.get("limit"), 100);
  const data = await supabaseRequest(env, "ota_updates", "GET", {
    query: `select=*&order=created_at.desc&limit=${limit}`,
  });
  return { success: true, items: data || [] };
}

async function createOtaUpdate(request, env, adminEmail) {
  const body = await request.json();
  const payload = {
    version: String(body?.version || "").trim(),
    channel: String(body?.channel || "stable").trim().toLowerCase(),
    release_notes: String(body?.release_notes || body?.notes || "").trim(),
    download_url: String(body?.download_url || "").trim(),
    is_mandatory: Boolean(body?.is_mandatory),
    is_published: Boolean(body?.is_published),
    published_at: body?.is_published ? new Date().toISOString() : null,
    created_by: body?.created_by || null,
  };
  if (!payload.version || !payload.download_url) throw new Error("missing_ota_fields");
  const created = await supabaseRequest(env, "ota_updates", "POST", {
    body: payload,
    prefer: "return=representation",
  });
  await appendAudit(env, {
    type: "ota_update_record",
    version: payload.version,
    channel: payload.channel,
    actor: adminEmail,
    at: new Date().toISOString(),
  });
  return { success: true, item: Array.isArray(created) ? created[0] : created };
}

async function listCrashLogs(url, env) {
  const limit = safeInt(url.searchParams.get("limit"), 50);
  const data = await supabaseRequest(env, "crash_logs", "GET", {
    query: `select=*&order=happened_at.desc&limit=${limit}`,
  });
  return { success: true, items: data || [] };
}

async function ingestCrashLog(request, env) {
  const body = await request.json();
  const token = String(env.CRASH_INGEST_TOKEN || "").trim();
  const auth = String(request.headers.get("Authorization") || "");
  if (token) {
    const expected = `Bearer ${token}`;
    if (auth !== expected) throw new Error("unauthorized");
  }
  const payload = {
    happened_at: body?.happened_at || new Date().toISOString(),
    user_id: body?.user_id || null,
    license_id: body?.license_id || null,
    hwid: body?.hwid || null,
    windows_version: body?.windows_version || null,
    device_name: body?.device_name || null,
    cpu: body?.cpu || null,
    ram_gb: body?.ram_gb || null,
    gpu: body?.gpu || null,
    error_type: String(body?.error_type || "unknown").trim(),
    message: body?.message || null,
    stack_trace: String(body?.stack_trace || "").trim(),
    app_version: body?.app_version || null,
    tool_channel: body?.tool_channel || null,
    raw_payload: body && typeof body === "object" ? body : {},
  };
  if (!payload.stack_trace) throw new Error("missing_stack_trace");
  const created = await supabaseRequest(env, "crash_logs", "POST", {
    body: payload,
    prefer: "return=representation",
  });
  return { success: true, item: Array.isArray(created) ? created[0] : created };
}

function buildLicenseKey() {
  const a = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const b = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const c = Date.now().toString(36).toUpperCase().slice(-6);
  return `STK-${a}-${b}-${c}`;
}

function addPlanDuration(startIso, plan) {
  const start = new Date(startIso || new Date().toISOString());
  const out = new Date(start);
  if (String(plan || "").toLowerCase() === "yearly") {
    out.setFullYear(out.getFullYear() + 1);
  } else {
    out.setMonth(out.getMonth() + 1);
  }
  return out.toISOString();
}

function clampStatus(status) {
  const value = String(status || "active").trim().toLowerCase();
  if (["active", "suspended", "revoked", "expired"].includes(value)) return value;
  return "active";
}

async function resolvePromoForIssue(env, promoCodeRaw) {
  const promoCode = String(promoCodeRaw || "").trim();
  if (!promoCode) {
    return {
      promo: null,
      tier: "public",
      feature_payload: {},
    };
  }
  const code = encodeURIComponent(promoCode);
  const rows = await supabaseRequest(env, "promo_codes", "GET", {
    query: `select=*&code=eq.${code}&limit=1`,
  });
  const promo = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!promo) throw new Error("promo_not_found");
  if (promo.is_active === false) throw new Error("promo_inactive");
  const now = Date.now();
  if (promo.starts_at && Date.parse(String(promo.starts_at)) > now) throw new Error("promo_not_started");
  if (promo.expires_at && Date.parse(String(promo.expires_at)) <= now) throw new Error("promo_expired");
  if (typeof promo.max_uses === "number" && typeof promo.used_count === "number" && promo.used_count >= promo.max_uses) {
    throw new Error("promo_usage_limit_reached");
  }

  const isPrivate = Boolean(promo.is_private_tier_trigger);
  return {
    promo,
    tier: isPrivate ? "private" : "public",
    feature_payload: isPrivate ? promo.private_feature_payload || {} : {},
  };
}

async function issueLicense(request, env) {
  const issueToken = String(env.LICENSE_ISSUE_TOKEN || "").trim();
  if (issueToken) {
    const auth = String(request.headers.get("Authorization") || "");
    if (auth !== `Bearer ${issueToken}`) throw new Error("unauthorized");
  }
  const body = await request.json();
  const plan = String(body?.plan || "monthly").trim().toLowerCase();
  if (!["monthly", "yearly"].includes(plan)) throw new Error("invalid_plan");
  const userEmail = String(body?.user_email || body?.email || "").trim() || null;
  const promoCode = String(body?.promo_code || "").trim();
  const source = await resolvePromoForIssue(env, promoCode);
  const createdAt = new Date().toISOString();
  const licenseKey = String(body?.license_key || "").trim().toUpperCase() || buildLicenseKey();
  const payload = {
    license_key: licenseKey,
    user_email: userEmail,
    plan,
    tier: source.tier,
    status: "active",
    starts_at: createdAt,
    expires_at: addPlanDuration(createdAt, plan),
    source_promo_code: source.promo ? source.promo.code : null,
    feature_payload: source.feature_payload,
    metadata: {
      issued_via: "api_issue",
      purchase_ref: body?.purchase_ref || null,
    },
  };
  const created = await supabaseRequest(env, "licenses", "POST", {
    body: payload,
    prefer: "return=representation",
  });
  if (source.promo?.id) {
    await supabaseRequest(env, "promo_codes", "PATCH", {
      query: `id=eq.${encodeURIComponent(source.promo.id)}&select=id,used_count`,
      body: { used_count: Number(source.promo.used_count || 0) + 1 },
      prefer: "return=minimal",
    });
  }
  return {
    success: true,
    item: Array.isArray(created) ? created[0] : created,
  };
}

async function verifyLicense(request, env) {
  const body = await request.json();
  const licenseKey = String(body?.license_key || "").trim().toUpperCase();
  const hwid = String(body?.hwid || "").trim();
  if (!licenseKey || !hwid) throw new Error("missing_license_or_hwid");

  const rows = await supabaseRequest(env, "licenses", "GET", {
    query: `select=*&license_key=eq.${encodeURIComponent(licenseKey)}&limit=1`,
  });
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) {
    return { success: false, status: "not_found", error: "license_not_found" };
  }
  const now = Date.now();
  const expiresAt = Date.parse(String(row.expires_at || ""));
  if (Number.isFinite(expiresAt) && expiresAt <= now) {
    await supabaseRequest(env, "licenses", "PATCH", {
      query: `id=eq.${encodeURIComponent(row.id)}&select=id`,
      body: { status: "expired" },
      prefer: "return=minimal",
    });
    return { success: false, status: "expired", error: "license_expired" };
  }
  const status = clampStatus(row.status);
  if (status !== "active") {
    return { success: false, status, error: `license_${status}` };
  }

  let boundHwid = row.hwid ? String(row.hwid).trim() : "";
  if (!boundHwid) {
    const updated = await supabaseRequest(env, "licenses", "PATCH", {
      query: `id=eq.${encodeURIComponent(row.id)}&select=*`,
      body: {
        hwid,
        bound_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        metadata: { ...(row.metadata || {}), first_bind_source: "verify_endpoint" },
      },
      prefer: "return=representation",
    });
    const next = Array.isArray(updated) ? updated[0] : updated;
    boundHwid = String(next?.hwid || hwid).trim();
    row.hwid = boundHwid;
  } else if (boundHwid !== hwid) {
    await supabaseRequest(env, "tamper_alerts", "POST", {
      body: {
        user_id: row.user_id || null,
        license_id: row.id,
        hwid,
        severity: "high",
        reason: "hwid_mismatch",
        details: { expected_hwid: boundHwid, provided_hwid: hwid },
      },
      prefer: "return=minimal",
    });
    return { success: false, status: "blocked", error: "hwid_mismatch" };
  } else {
    await supabaseRequest(env, "licenses", "PATCH", {
      query: `id=eq.${encodeURIComponent(row.id)}&select=id`,
      body: { last_seen_at: new Date().toISOString() },
      prefer: "return=minimal",
    });
  }

  const isPrivate = String(row.tier || "public").toLowerCase() === "private";
  const featurePayload = row.feature_payload && typeof row.feature_payload === "object" ? row.feature_payload : {};
  const runtimePayload = isPrivate ? featurePayload : {};

  return {
    success: true,
    status: "active",
    tier: isPrivate ? "private" : "public",
    license_id: row.id,
    user_id: row.user_id || null,
    expires_at: row.expires_at,
    runtime_payload: runtimePayload,
    policy: {
      allow_offline: true,
      blocked_actions: [],
    },
  };
}
