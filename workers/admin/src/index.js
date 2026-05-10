import { handleCreatePayment, handleGetPaymentStatus } from "./routes/payments.js";
const CHANNELS = ["stable", "beta"];
const UPDATE_MODES = ["optional", "force", "required", "silent"];
const DEFAULT_MANIFEST = {
  version: "0",
  available: false,
  mandatory: false,
  disabled: false,
  disabled_reason: "",
  rollout_percent: 100,
  minimum_supported_version: "",
  force_update_deadline: "",
  download_url: "",
  download_sha256: "",
  filename: "",
  notes: "",
  remote_config: {
    update_mode: "optional",
    kill_switch_enabled: false,
    kill_switch_message: "",
    feature_flags: {},
    announcements: [],
  },
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
      if (host === "admin.saturnws.com" && request.method === "GET" && !url.pathname.startsWith("/api/")) {
        return proxyAdminFrontend(url);
      }
      if (url.pathname === "/updates/latest.json" && request.method === "GET") {
        return serveLatestManifest(env);
      }
      if (url.pathname.startsWith("/updates/file/") && request.method === "GET") {
        return serveReleaseBinary(url, env);
      }
      if (url.pathname === "/api/admin/preauth/state" && request.method === "GET") {
        return json({ success: true, authenticated: await hasAdminLayer1Session(request, env) }, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/preauth" && request.method === "POST") {
        return handleAdminPreauth(request, env);
      }
      if (url.pathname === "/api/admin/preauth/logout" && request.method === "POST") {
        return handleAdminPreauthLogout(request, env);
      }
      if (url.pathname === "/api/admin/session" && request.method === "GET") {
        const adminEmail = await requireAdmin(request, env);
        return json({ success: true, email: adminEmail }, 200, corsHeaders(request, env));
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
      if (url.pathname === "/api/admin/remote-config" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await getRemoteControls(url, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/remote-config" && request.method === "POST") {
        const adminEmail = await requireAdmin(request, env);
        return json(await updateRemoteControls(request, env, adminEmail), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/releases/disable" && request.method === "POST") {
        const adminEmail = await requireAdmin(request, env);
        return json(await disableRelease(request, env, adminEmail), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/dashboard" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await getAdminDashboard(env), 200, corsHeaders(request, env));
      }
      if ((url.pathname === "/api/admin/subscriptions" || url.pathname === "/api/admin/licenses") && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await listSubscriptions(url, env), 200, corsHeaders(request, env));
      }
      if ((url.pathname === "/api/admin/subscriptions" || url.pathname === "/api/admin/licenses") && request.method === "POST") {
        const adminEmail = await requireAdmin(request, env);
        return json(await createSubscription(request, env, adminEmail), 200, corsHeaders(request, env));
      }
      if (
        (url.pathname.startsWith("/api/admin/subscriptions/") || url.pathname.startsWith("/api/admin/licenses/")) &&
        url.pathname.endsWith("/reset-hwid") &&
        request.method === "POST"
      ) {
        const adminEmail = await requireAdmin(request, env);
        const subscriptionId = decodeURIComponent(
          url.pathname
            .replace("/api/admin/subscriptions/", "")
            .replace("/api/admin/licenses/", "")
            .replace("/reset-hwid", ""),
        ).trim();
        return json(await resetSubscriptionHwid(subscriptionId, request, env, adminEmail), 200, corsHeaders(request, env));
      }
      if ((url.pathname.startsWith("/api/admin/subscriptions/") || url.pathname.startsWith("/api/admin/licenses/")) && request.method === "PATCH") {
        const adminEmail = await requireAdmin(request, env);
        const subscriptionId = decodeURIComponent(url.pathname.replace("/api/admin/subscriptions/", "").replace("/api/admin/licenses/", "")).trim();
        return json(await updateSubscription(subscriptionId, request, env, adminEmail), 200, corsHeaders(request, env));
      }
      if (url.pathname.startsWith("/api/admin/users/") && request.method === "GET") {
        await requireAdmin(request, env);
        const userKey = decodeURIComponent(url.pathname.replace("/api/admin/users/", "")).trim();
        return json(await getUserDetail(userKey, env), 200, corsHeaders(request, env));
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
      if (url.pathname === "/api/admin/crash-groups" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await listCrashGroups(url, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/audit-log" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await listAuditLog(url, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/crash-logs/ingest" && request.method === "POST") {
        return json(await ingestCrashLog(request, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/licenses/issue" && request.method === "POST") {
        return json({ success: false, error: "account_subscription_required" }, 410, corsHeaders(request, env));
      }
      if (url.pathname === "/api/licenses/verify" && request.method === "POST") {
        return json({ success: false, error: "account_session_required" }, 410, corsHeaders(request, env));
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
      return json({ success: false, error: "not_found" }, 404, corsHeaders(request, env));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "unexpected_error");
      const authErrors = new Set([
        "unauthorized",
        "preauth_required",
        "admin_allowlist_empty",
        "firebase_not_configured",
        "firebase_token_invalid",
        "firebase_email_not_verified",
      ]);
      const status = authErrors.has(message) || message.startsWith("admin_email_not_allowed") ? 401 : 400;
      return json({ success: false, error: message }, status, corsHeaders(request, env));
    }
  },
};

async function proxyAdminFrontend(url) {
  const source = new URL(url.toString());
  source.hostname = "saturnws.com";
  source.protocol = "https:";
  source.port = "";
  source.hash = "";
  const upstream = await fetch(source.toString(), {
    method: "GET",
    headers: {
      "User-Agent": "SaturnWorkspace-AdminProxy/1",
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
        "User-Agent": "SaturnWorkspace-AdminProxy/1",
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
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
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

  await requireAdminLayer1(request, env);

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
function adminLayer1Configured(env) {
  return Boolean(
    String(env.ADMIN_LAYER1_USERNAME || "").trim() &&
      String(env.ADMIN_LAYER1_PASSWORD || "").trim() &&
      String(env.ADMIN_LAYER1_SESSION_SECRET || "").trim(),
  );
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return rawValue.join("=");
  }
  return "";
}

function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeToString(value) {
  const padded = String(value || "").replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(value || "").length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function createAdminLayer1Cookie(env, username) {
  const maxAgeSeconds = 60 * 60;
  const payload = base64UrlEncode(
    JSON.stringify({
      u: username,
      exp: Date.now() + maxAgeSeconds * 1000,
      n: crypto.randomUUID(),
    }),
  );
  const sig = await hmacHex(env.ADMIN_LAYER1_SESSION_SECRET, payload);
  return `st_admin_pre_auth=${payload}.${sig}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

async function hasAdminLayer1Session(request, env) {
  if (!adminLayer1Configured(env)) return true;
  const value = getCookie(request, "st_admin_pre_auth");
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return false;
  const expected = await hmacHex(env.ADMIN_LAYER1_SESSION_SECRET, payload);
  if (!timingSafeEqual(sig, expected)) return false;
  try {
    const decoded = JSON.parse(base64UrlDecodeToString(payload));
    return Number(decoded?.exp || 0) > Date.now();
  } catch {
    return false;
  }
}

async function requireAdminLayer1(request, env) {
  if (!(await hasAdminLayer1Session(request, env))) {
    throw new Error("preauth_required");
  }
}

async function handleAdminPreauth(request, env) {
  if (!adminLayer1Configured(env)) {
    return json({ success: false, error: "admin_layer1_not_configured" }, 503, corsHeaders(request, env));
  }
  const body = await request.json().catch(() => null);
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  const expectedUsername = String(env.ADMIN_LAYER1_USERNAME || "").trim();
  const expectedPassword = String(env.ADMIN_LAYER1_PASSWORD || "");
  if (!timingSafeEqual(username, expectedUsername) || !timingSafeEqual(password, expectedPassword)) {
    return json({ success: false, authenticated: false, error: "invalid_credentials" }, 401, corsHeaders(request, env));
  }
  const headers = { ...corsHeaders(request, env), "Set-Cookie": await createAdminLayer1Cookie(env, username) };
  return json({ success: true, authenticated: true }, 200, headers);
}

function handleAdminPreauthLogout(request, env) {
  return json(
    { success: true },
    200,
    {
      ...corsHeaders(request, env),
      "Set-Cookie": "st_admin_pre_auth=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict",
    },
  );
}

function parseAdminAllowlist(env) {
  return String(env.ADMIN_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

async function verifyFirebaseAdminEmail(idToken, env) {
  const allowlist = parseAdminAllowlist(env);
  if (!allowlist.length) throw new Error("admin_allowlist_empty");
  const webApiKey = String(env.FIREBASE_WEB_API_KEY || "").trim();
  if (!webApiKey) throw new Error("firebase_not_configured");

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(webApiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) throw new Error("firebase_token_invalid");

  const payload = await response.json().catch(() => null);
  const user = payload?.users?.[0];
  const email = String(user?.email || "").trim().toLowerCase();
  const emailVerified = Boolean(user?.emailVerified);

  if (!email) throw new Error("firebase_token_invalid");
  if (!emailVerified) throw new Error("firebase_email_not_verified");
  if (!allowlist.includes(email)) throw new Error(`admin_email_not_allowed:${email}`);
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

function clampRolloutPercent(value, fallback = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function optionalVersion(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!/^[0-9A-Za-z._-]{1,60}$/.test(text)) throw new Error("invalid_version");
  return text;
}

function optionalIsoDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new Error("invalid_datetime");
  return new Date(timestamp).toISOString();
}

function safePlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeAnnouncements(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .slice(0, 20)
    .map((item) => ({
      id: String(item.id || crypto.randomUUID()).trim().slice(0, 80),
      title: String(item.title || "").trim().slice(0, 160),
      body: String(item.body || "").trim().slice(0, 1200),
      severity: ["info", "warning", "critical"].includes(String(item.severity || "").trim().toLowerCase())
        ? String(item.severity).trim().toLowerCase()
        : "info",
      starts_at: item.starts_at ? optionalIsoDate(item.starts_at) : "",
      ends_at: item.ends_at ? optionalIsoDate(item.ends_at) : "",
    }))
    .filter((item) => item.title || item.body);
}

function mergeChannelControls(existing, body) {
  const remoteConfig = safePlainObject(existing.remote_config);
  const nextRemoteConfig = {
    ...remoteConfig,
    update_mode: body.update_mode ? normalizeUpdateMode(body.update_mode) : normalizeUpdateMode(remoteConfig.update_mode),
    kill_switch_enabled:
      body.kill_switch_enabled !== undefined ? Boolean(body.kill_switch_enabled) : Boolean(remoteConfig.kill_switch_enabled),
    kill_switch_message:
      body.kill_switch_message !== undefined
        ? String(body.kill_switch_message || "").trim().slice(0, 600)
        : String(remoteConfig.kill_switch_message || ""),
    feature_flags:
      body.feature_flags !== undefined ? safePlainObject(body.feature_flags) : safePlainObject(remoteConfig.feature_flags),
    announcements:
      body.announcements !== undefined ? normalizeAnnouncements(body.announcements) : normalizeAnnouncements(remoteConfig.announcements),
  };
  return {
    ...existing,
    rollout_percent:
      body.rollout_percent !== undefined ? clampRolloutPercent(body.rollout_percent) : clampRolloutPercent(existing.rollout_percent, 100),
    minimum_supported_version:
      body.minimum_supported_version !== undefined
        ? optionalVersion(body.minimum_supported_version)
        : String(existing.minimum_supported_version || ""),
    force_update_deadline:
      body.force_update_deadline !== undefined ? optionalIsoDate(body.force_update_deadline) : String(existing.force_update_deadline || ""),
    remote_config: nextRemoteConfig,
  };
}

function sanitizeFilename(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^\w.\-]+/g, "_");
  return cleaned || "Saturn Workspace.exe";
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
  const rolloutPercent = clampRolloutPercent(body?.rollout_percent, 100);
  const minimumSupportedVersion = optionalVersion(body?.minimum_supported_version);
  const forceUpdateDeadline = optionalIsoDate(body?.force_update_deadline);

  const metaKey = `meta/${channel}/${version}.json`;
  const metaObj = await env.OTA_BUCKET.get(metaKey);
  if (!metaObj) throw new Error("release_not_uploaded");
  const release = await metaObj.json();
  const downloadUrlBase = String(env.PUBLIC_UPDATES_BASE_URL || "https://saturnws.com/updates").replace(/\/+$/, "");
  const downloadUrl = `${downloadUrlBase}/file/${encodeURIComponent(release.key)}`;

  const manifest = await loadManifest(env);
  const channelManifest = {
    version,
    available: true,
    disabled: false,
    disabled_reason: "",
    mandatory,
    rollout_percent: rolloutPercent,
    minimum_supported_version: minimumSupportedVersion,
    force_update_deadline: forceUpdateDeadline,
    download_url: downloadUrl,
    download_sha256: release.sha256 || "",
    filename: release.filename || "Saturn Workspace.exe",
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
    disabled: channel === "stable" ? false : Boolean(manifest.disabled),
    disabled_reason: channel === "stable" ? "" : String(manifest.disabled_reason || ""),
    rollout_percent: channel === "stable" ? rolloutPercent : clampRolloutPercent(manifest.rollout_percent, 100),
    minimum_supported_version: channel === "stable" ? minimumSupportedVersion : String(manifest.minimum_supported_version || ""),
    force_update_deadline: channel === "stable" ? forceUpdateDeadline : String(manifest.force_update_deadline || ""),
    download_url: channel === "stable" ? downloadUrl : manifest.download_url || "",
    download_sha256: channel === "stable" ? release.sha256 || "" : manifest.download_sha256 || "",
    filename: channel === "stable" ? channelManifest.filename : manifest.filename || "",
    notes: channel === "stable" ? notes : manifest.notes || "",
    remote_config: channel === "stable" ? channelManifest.remote_config : safePlainObject(manifest.remote_config),
    channels: {
      stable: manifest.channels?.stable || {},
      beta: manifest.channels?.beta || {},
      [channel]: channelManifest,
    },
  };

  const signedManifest = await saveManifest(env, nextManifest);
  await recordPublishedOtaUpdate(env, {
    version,
    channel,
    release_notes: notes,
    download_url: downloadUrl,
    checksum_sha256: release.sha256 || null,
    file_size_bytes: release.size || null,
    is_mandatory: mandatory,
    created_by: adminEmail,
  });
  await appendAudit(env, {
    type: "publish",
    channel,
      version,
      update_mode: updateMode,
      rollout_percent: rolloutPercent,
      actor: adminEmail,
      at: new Date().toISOString(),
    });
  return { success: true, manifest: signedManifest };
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
  const downloadUrlBase = String(env.PUBLIC_UPDATES_BASE_URL || "https://saturnws.com/updates").replace(/\/+$/, "");
  const downloadUrl = `${downloadUrlBase}/file/${encodeURIComponent(release.key)}`;
  const updatedChannel = {
    ...existing,
    version,
    available: true,
    disabled: false,
    disabled_reason: "",
    download_url: downloadUrl,
    download_sha256: release.sha256 || existing.download_sha256 || "",
    filename: release.filename || existing.filename || "Saturn Workspace.exe",
    published_at: new Date().toISOString(),
  };

  const nextManifest = {
    ...manifest,
    version: channel === "stable" ? version : manifest.version,
    available: channel === "stable" ? true : Boolean(manifest.available),
    disabled: channel === "stable" ? false : Boolean(manifest.disabled),
    disabled_reason: channel === "stable" ? "" : String(manifest.disabled_reason || ""),
    download_url: channel === "stable" ? downloadUrl : manifest.download_url,
    download_sha256: channel === "stable" ? release.sha256 || "" : manifest.download_sha256 || "",
    filename: channel === "stable" ? updatedChannel.filename : manifest.filename,
    channels: {
      stable: manifest.channels?.stable || {},
      beta: manifest.channels?.beta || {},
      [channel]: updatedChannel,
    },
  };
  const signedManifest = await saveManifest(env, nextManifest);
  await appendAudit(env, {
    type: "rollback",
    channel,
    version,
    actor: adminEmail,
    at: new Date().toISOString(),
  });
  return { success: true, manifest: signedManifest };
}

function applyChannelToRoot(manifest, channel, channelManifest) {
  if (channel !== "stable") return manifest;
  return {
    ...manifest,
    version: channelManifest.version || manifest.version,
    available: Boolean(channelManifest.available),
    mandatory: Boolean(channelManifest.mandatory),
    disabled: Boolean(channelManifest.disabled),
    disabled_reason: String(channelManifest.disabled_reason || ""),
    rollout_percent: clampRolloutPercent(channelManifest.rollout_percent, 100),
    minimum_supported_version: String(channelManifest.minimum_supported_version || ""),
    force_update_deadline: String(channelManifest.force_update_deadline || ""),
    download_url: channelManifest.download_url || "",
    download_sha256: channelManifest.download_sha256 || "",
    filename: channelManifest.filename || "",
    notes: channelManifest.notes || "",
    remote_config: safePlainObject(channelManifest.remote_config),
  };
}

async function getRemoteControls(url, env) {
  const channel = normalizeChannel(url.searchParams.get("channel"));
  const manifest = await loadManifest(env);
  const channelManifest = manifest.channels?.[channel] || {};
  return {
    success: true,
    channel,
    controls: mergeChannelControls(channelManifest, {}),
    manifest,
  };
}

async function updateRemoteControls(request, env, adminEmail) {
  if (!hasOtaBucket(env)) throw new Error("r2_not_enabled");
  const body = await request.json();
  const channel = normalizeChannel(body?.channel);
  const manifest = await loadManifest(env);
  const existing = manifest.channels?.[channel] || {};
  const updatedChannel = mergeChannelControls(existing, body || {});
  const nextManifest = applyChannelToRoot(
    {
      ...manifest,
      channels: {
        stable: manifest.channels?.stable || {},
        beta: manifest.channels?.beta || {},
        [channel]: updatedChannel,
      },
    },
    channel,
    updatedChannel,
  );
  const signedManifest = await saveManifest(env, nextManifest);
  await appendAudit(env, {
    type: "remote_config_update",
    channel,
    actor: adminEmail,
    payload: {
      rollout_percent: updatedChannel.rollout_percent,
      minimum_supported_version: updatedChannel.minimum_supported_version,
      force_update_deadline: updatedChannel.force_update_deadline,
      remote_config: updatedChannel.remote_config,
    },
    at: new Date().toISOString(),
  });
  return { success: true, manifest: signedManifest, controls: updatedChannel };
}

async function disableRelease(request, env, adminEmail) {
  if (!hasOtaBucket(env)) throw new Error("r2_not_enabled");
  const body = await request.json();
  const channel = normalizeChannel(body?.channel);
  const manifest = await loadManifest(env);
  const existing = manifest.channels?.[channel] || {};
  const reason = String(body?.reason || "disabled_by_admin").trim().slice(0, 600);
  const updatedChannel = {
    ...existing,
    available: false,
    disabled: true,
    disabled_reason: reason,
    disabled_at: new Date().toISOString(),
    disabled_by: adminEmail,
  };
  const nextManifest = applyChannelToRoot(
    {
      ...manifest,
      channels: {
        stable: manifest.channels?.stable || {},
        beta: manifest.channels?.beta || {},
        [channel]: updatedChannel,
      },
    },
    channel,
    updatedChannel,
  );
  const signedManifest = await saveManifest(env, nextManifest);
  await appendAudit(env, {
    type: "release_disable",
    channel,
    version: existing.version || body?.version || "",
    reason,
    actor: adminEmail,
    at: new Date().toISOString(),
  });
  return { success: true, manifest: signedManifest };
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
  if (!hasOtaBucket(env)) return structuredClone(manifest);
  const signedManifest = await signManifest(env, manifest);
  await env.OTA_BUCKET.put("updates/latest.json", JSON.stringify(signedManifest, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  return signedManifest;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function stripManifestSignature(manifest) {
  const clone = JSON.parse(JSON.stringify(manifest || {}));
  delete clone.manifest_signature;
  return clone;
}

function pemToArrayBuffer(pem) {
  const b64 = String(pem || "")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!b64) throw new Error("manifest_signing_key_missing");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function signManifest(env, manifest) {
  const privateKeyPem = String(env.UPDATE_MANIFEST_PRIVATE_KEY_PEM || "").trim();
  if (!privateKeyPem) throw new Error("manifest_signing_key_missing");
  const clean = stripManifestSignature(manifest);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new TextEncoder().encode(stableStringify(clean));
  const signature = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, key, bytes);
  return { ...clean, manifest_signature: arrayBufferToBase64(signature) };
}

async function recordPublishedOtaUpdate(env, payload) {
  const body = {
    version: String(payload.version || "").trim(),
    channel: String(payload.channel || "stable").trim().toLowerCase(),
    release_notes: String(payload.release_notes || "").trim(),
    download_url: String(payload.download_url || "").trim(),
    checksum_sha256: payload.checksum_sha256 || null,
    file_size_bytes: payload.file_size_bytes || null,
    is_mandatory: Boolean(payload.is_mandatory),
    is_published: true,
    published_at: new Date().toISOString(),
    created_by: isUuid(payload.created_by) ? payload.created_by : null,
  };
  try {
    await supabaseRequest(env, "ota_updates", "POST", {
      body,
      prefer: "return=representation",
    });
  } catch (error) {
    await appendAudit(env, {
      type: "ota_update_record_failed",
      version: body.version,
      channel: body.channel,
      error: error instanceof Error ? error.message : String(error || "unknown_error"),
      at: new Date().toISOString(),
    });
  }
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
  const enriched = {
    ...event,
    at: event?.at || new Date().toISOString(),
  };
  if (hasOtaBucket(env)) {
    const list = await loadAudit(env);
    list.push(enriched);
    const next = list.slice(-5000);
    await env.OTA_BUCKET.put("updates/audit.json", JSON.stringify(next, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
  }
  try {
    await supabaseRequest(env, "admin_activity", "POST", {
      body: {
        action: String(enriched.type || "admin_action").trim(),
        entity: String(enriched.entity || enriched.channel || "admin").trim(),
        entity_id: enriched.entity_id || enriched.version || enriched.key || null,
        payload: enriched,
        admin_email: enriched.actor || null,
      },
      prefer: "return=minimal",
    });
  } catch {
    // R2 audit is the durable fallback when the admin_activity table is not migrated yet.
  }
}

async function serveLatestManifest(env) {
  const manifest = await loadManifest(env);
  const signedManifest = await signManifest(env, manifest);
  return new Response(JSON.stringify(signedManifest, null, 2), {
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

function safeSearchTerm(value) {
  return String(value || "")
    .replace(/[,%()*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

async function getAdminDashboard(env) {
  const [subscriptions, crashes, alerts, updates] = await Promise.all([
    safeSupabaseRead(env, "account_subscriptions", "select=id,status,tier,created_at&limit=200"),
    safeSupabaseRead(env, "crash_logs", "select=id,error_type,happened_at,user_id&order=happened_at.desc&limit=20"),
    supabaseRequest(env, "tamper_alerts", "GET", { query: "select=id,severity,resolved,happened_at,reason&resolved=is.false&order=happened_at.desc&limit=50" }),
    supabaseRequest(env, "ota_updates", "GET", { query: "select=id,version,channel,is_mandatory,is_published,created_at&order=created_at.desc&limit=20" }),
  ]);
  const activeUsers = Array.isArray(subscriptions) ? subscriptions.filter((x) => x.status === "active").length : 0;
  const churnedUsers = Array.isArray(subscriptions)
    ? subscriptions.filter((x) => x.status === "expired" || x.status === "canceled").length
    : 0;
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

async function listSubscriptions(url, env) {
  const limit = safeInt(url.searchParams.get("limit"), 50);
  const page = safeInt(url.searchParams.get("page"), 1, 5000);
  const offset = (page - 1) * limit;
  const status = String(url.searchParams.get("status") || "").trim();
  const tier = String(url.searchParams.get("tier") || "").trim();
  const search = safeSearchTerm(url.searchParams.get("search"));
  const filters = [];
  if (status) filters.push(`status.eq.${encodeURIComponent(status)}`);
  if (tier) filters.push(`tier.eq.${encodeURIComponent(tier)}`);
  if (search) {
    const term = encodeURIComponent(`*${search}*`);
    filters.push(`or=(user_email.ilike.${term},firebase_user_id.ilike.${term},hwid.ilike.${term})`);
  }
  const query = `select=*&order=created_at.desc&limit=${limit}&offset=${offset}${filters.length ? `&${filters.join("&")}` : ""}`;
  const data = await supabaseRequest(env, "account_subscriptions", "GET", { query });
  return { success: true, items: data || [], page, limit };
}

async function createSubscription(request, env, adminEmail) {
  const body = await request.json();
  const userEmail = String(body?.user_email || body?.email || "").trim().toLowerCase();
  const plan = String(body?.plan || "monthly").trim().toLowerCase();
  const tier = String(body?.tier || "public").trim().toLowerCase();
  const expiresAt = String(body?.expires_at || "").trim();
  if (!userEmail || !expiresAt) throw new Error("missing_subscription_fields");
  const payload = {
    firebase_user_id: String(body?.firebase_user_id || "").trim() || null,
    user_email: userEmail,
    plan,
    tier,
    status: "active",
    starts_at: body?.starts_at ? String(body.starts_at).trim() : new Date().toISOString(),
    expires_at: expiresAt,
    provider: String(body?.provider || "manual").trim().toLowerCase(),
    provider_customer_id: String(body?.provider_customer_id || "").trim() || null,
    provider_subscription_id: String(body?.provider_subscription_id || "").trim() || null,
    feature_payload: body?.feature_payload && typeof body.feature_payload === "object" ? body.feature_payload : {},
    metadata: { ...(body?.metadata && typeof body.metadata === "object" ? body.metadata : {}), created_by: adminEmail },
  };
  const created = await supabaseRequest(env, "account_subscriptions", "POST", {
    body: payload,
    prefer: "return=representation",
  });
  const item = Array.isArray(created) ? created[0] : created;
  await appendAudit(env, {
    type: "subscription_create",
    entity: "account_subscriptions",
    entity_id: item?.id || null,
    actor: adminEmail,
    payload: { user_email: userEmail, plan, tier, expires_at: expiresAt },
    at: new Date().toISOString(),
  });
  return { success: true, item };
}

async function updateSubscription(subscriptionId, request, env, adminEmail) {
  if (!subscriptionId) throw new Error("missing_subscription_id");
  const body = await request.json();
  const patch = {};
  if (body?.status) patch.status = String(body.status).trim().toLowerCase();
  if (body?.tier) patch.tier = String(body.tier).trim().toLowerCase();
  if (body?.hwid !== undefined) patch.hwid = body.hwid ? String(body.hwid).trim() : null;
  if (body?.expires_at) patch.expires_at = String(body.expires_at).trim();
  if (body?.user_email) patch.user_email = String(body.user_email).trim().toLowerCase();
  if (body?.firebase_user_id !== undefined) patch.firebase_user_id = body.firebase_user_id ? String(body.firebase_user_id).trim() : null;
  patch.metadata = { ...(body?.metadata && typeof body.metadata === "object" ? body.metadata : {}), updated_by: adminEmail };
  const updated = await supabaseRequest(env, "account_subscriptions", "PATCH", {
    query: `id=eq.${encodeURIComponent(subscriptionId)}&select=*`,
    body: patch,
    prefer: "return=representation",
  });
  const item = Array.isArray(updated) ? updated[0] : updated;
  await appendAudit(env, {
    type: "subscription_update",
    entity: "account_subscriptions",
    entity_id: subscriptionId,
    actor: adminEmail,
    payload: patch,
    at: new Date().toISOString(),
  });
  return { success: true, item };
}

async function resetSubscriptionHwid(subscriptionId, request, env, adminEmail) {
  if (!subscriptionId) throw new Error("missing_subscription_id");
  const body = await request.json().catch(() => ({}));
  const revokeSessions = body?.revoke_sessions !== false;
  const updated = await supabaseRequest(env, "account_subscriptions", "PATCH", {
    query: `id=eq.${encodeURIComponent(subscriptionId)}&select=*`,
    body: {
      hwid: null,
      bound_at: null,
      metadata: { reset_hwid_by: adminEmail, reset_hwid_at: new Date().toISOString() },
    },
    prefer: "return=representation",
  });
  if (revokeSessions) {
    await supabaseRequest(env, "app_sessions", "PATCH", {
      query: `subscription_id=eq.${encodeURIComponent(subscriptionId)}`,
      body: { revoked_at: new Date().toISOString() },
      prefer: "return=minimal",
    }).catch(() => null);
  }
  const item = Array.isArray(updated) ? updated[0] : updated;
  await appendAudit(env, {
    type: "subscription_reset_hwid",
    entity: "account_subscriptions",
    entity_id: subscriptionId,
    actor: adminEmail,
    payload: { revoke_sessions: revokeSessions },
    at: new Date().toISOString(),
  });
  return { success: true, item };
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
  const item = Array.isArray(created) ? created[0] : created;
  await appendAudit(env, {
    type: "promo_code_create",
    entity: "promo_codes",
    entity_id: item?.id || payload.code,
    actor: adminEmail,
    payload: { code: payload.code, discount_type: payload.discount_type, private_tier: payload.is_private_tier_trigger },
    at: new Date().toISOString(),
  });
  return { success: true, item };
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
    created_by: isUuid(body?.created_by) ? body.created_by : null,
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
  const page = safeInt(url.searchParams.get("page"), 1, 5000);
  const offset = (page - 1) * limit;
  const search = safeSearchTerm(url.searchParams.get("search"));
  const filters = [];
  if (search) {
    const term = encodeURIComponent(`*${search}*`);
    filters.push(`or=(error_type.ilike.${term},message.ilike.${term},hwid.ilike.${term},device_name.ilike.${term})`);
  }
  const data = await safeSupabaseRead(
    env,
    "crash_logs",
    `select=*&order=happened_at.desc&limit=${limit}&offset=${offset}${filters.length ? `&${filters.join("&")}` : ""}`,
  );
  return { success: true, items: data || [], page, limit };
}

function crashSignatureSource(row) {
  const stackLine = String(row?.stack_trace || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return [
    String(row?.error_type || "unknown").trim().toLowerCase(),
    String(row?.message || "").trim().toLowerCase().slice(0, 240),
    String(stackLine || "").trim().toLowerCase().slice(0, 240),
  ].join("|");
}

async function crashFingerprint(row) {
  if (row?.fingerprint) return String(row.fingerprint);
  return sha256Hex(crashSignatureSource(row));
}

async function listCrashGroups(url, env) {
  const limit = safeInt(url.searchParams.get("limit"), 500, 1000);
  const data = await safeSupabaseRead(env, "crash_logs", `select=*&order=happened_at.desc&limit=${limit}`);
  const groups = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    const fingerprint = await crashFingerprint(row);
    const existing = groups.get(fingerprint);
    if (!existing) {
      groups.set(fingerprint, {
        fingerprint,
        count: 1,
        first_seen_at: row.happened_at,
        last_seen_at: row.happened_at,
        error_type: row.error_type,
        message: row.message,
        latest: row,
        affected_hwids: row.hwid ? [row.hwid] : [],
        affected_users: row.user_id || row.subscription_id ? [row.user_id || row.subscription_id] : [],
      });
      continue;
    }
    existing.count += 1;
    if (String(row.happened_at || "") > String(existing.last_seen_at || "")) {
      existing.last_seen_at = row.happened_at;
      existing.latest = row;
    }
    if (String(row.happened_at || "") < String(existing.first_seen_at || "")) existing.first_seen_at = row.happened_at;
    if (row.hwid && !existing.affected_hwids.includes(row.hwid)) existing.affected_hwids.push(row.hwid);
    const userKey = row.user_id || row.subscription_id;
    if (userKey && !existing.affected_users.includes(userKey)) existing.affected_users.push(userKey);
  }
  return {
    success: true,
    items: [...groups.values()]
      .sort((a, b) => String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || "")))
      .slice(0, safeInt(url.searchParams.get("groups"), 50, 200)),
  };
}

async function listAuditLog(url, env) {
  const limit = safeInt(url.searchParams.get("limit"), 100, 500);
  const rows = await safeSupabaseRead(env, "admin_activity", `select=*&order=happened_at.desc&limit=${limit}`);
  if (Array.isArray(rows) && rows.length) return { success: true, items: rows };
  const audit = await loadAudit(env);
  return {
    success: true,
    items: audit
      .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
      .slice(0, limit),
  };
}

async function getUserDetail(userKey, env) {
  if (!userKey) throw new Error("missing_user");
  const key = safeSearchTerm(userKey);
  const subscriptionQuery = isUuid(key)
    ? `select=*&id=eq.${encodeURIComponent(key)}&limit=1`
    : `select=*&or=(user_email.ilike.${encodeURIComponent(key)},firebase_user_id.eq.${encodeURIComponent(key)})&limit=1`;
  const subscriptionRows = await safeSupabaseRead(env, "account_subscriptions", subscriptionQuery);
  const subscription = Array.isArray(subscriptionRows) && subscriptionRows.length ? subscriptionRows[0] : null;
  const subscriptionId = subscription?.id || "";
  const userId = subscription?.firebase_user_id || (!isUuid(key) ? key : "");
  const sessionFilters = subscriptionId
    ? `subscription_id=eq.${encodeURIComponent(subscriptionId)}`
    : `or=(user_email.ilike.${encodeURIComponent(key)},user_id.eq.${encodeURIComponent(userId)})`;
  const crashFilters = subscriptionId
    ? `subscription_id=eq.${encodeURIComponent(subscriptionId)}`
    : subscription?.hwid
      ? `hwid=eq.${encodeURIComponent(subscription.hwid)}`
      : `hwid=eq.__none__`;
  const [sessions, crashes] = await Promise.all([
    safeSupabaseRead(env, "app_sessions", `select=*&${sessionFilters}&order=last_seen_at.desc&limit=50`),
    safeSupabaseRead(env, "crash_logs", `select=*&${crashFilters}&order=happened_at.desc&limit=25`),
  ]);
  const deviceMap = new Map();
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const hwid = session.hwid || "unknown";
    const current = deviceMap.get(hwid) || {
      hwid,
      sessions: 0,
      last_seen_at: "",
      revoked: 0,
      expires_at: session.expires_at || "",
    };
    current.sessions += 1;
    if (session.revoked_at) current.revoked += 1;
    if (String(session.last_seen_at || session.created_at || "") > String(current.last_seen_at || "")) {
      current.last_seen_at = session.last_seen_at || session.created_at || "";
    }
    deviceMap.set(hwid, current);
  }
  return {
    success: true,
    item: subscription,
    sessions: Array.isArray(sessions) ? sessions : [],
    crashes: Array.isArray(crashes) ? crashes : [],
    devices: [...deviceMap.values()],
    last_crash: Array.isArray(crashes) && crashes.length ? crashes[0] : null,
  };
}

async function safeSupabaseRead(env, table, query) {
  try {
    return await supabaseRequest(env, table, "GET", { query });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (isMissingSupabaseTable(message, table)) return [];
    throw error;
  }
}

function isMissingSupabaseTable(message, table) {
  const text = String(message || "").toLowerCase();
  const tableName = String(table || "").toLowerCase();
  return text.includes("schema cache") && text.includes(`public.${tableName}`);
}

async function sha256Hex(value) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function limitString(value, max) {
  const text = String(value || "");
  return text.length > max ? text.slice(0, max) : text;
}

async function resolveCrashIngestAuth(request, env, body) {
  const configuredToken = String(env.CRASH_INGEST_TOKEN || "").trim();
  const auth = String(request.headers.get("Authorization") || "").trim();
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (configuredToken && bearer && timingSafeEqual(bearer, configuredToken)) {
    return { source: "ingest_token", session: null };
  }
  if (bearer) {
    const tokenHash = await sha256Hex(bearer);
    const rows = await supabaseRequest(env, "app_sessions", "GET", {
      query: `select=*&session_token_hash=eq.${encodeURIComponent(tokenHash)}&limit=1`,
    });
    const session = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!session) throw new Error("unauthorized");
    if (session.revoked_at) throw new Error("session_revoked");
    if (session.expires_at && Date.parse(String(session.expires_at)) <= Date.now()) throw new Error("session_expired");
    const requestHwid = String(body?.hwid || "").trim();
    const sessionHwid = String(session.hwid || "").trim();
    return {
      source: "app_session",
      session,
      warning: requestHwid && sessionHwid && requestHwid !== sessionHwid ? "hwid_mismatch" : "",
    };
  }
  if (!configuredToken) return { source: "anonymous", session: null };
  throw new Error("unauthorized");
}

async function ingestCrashLog(request, env) {
  const body = await request.json();
  const auth = await resolveCrashIngestAuth(request, env, body);
  const session = auth.session || {};
  const rawPayload = body && typeof body === "object" ? { ...body } : {};
  rawPayload.auth = {
    source: auth.source,
    firebase_user_id: session.user_id || rawPayload.firebase_user_id || null,
    user_email: session.user_email || rawPayload.user_email || null,
    warning: auth.warning || null,
  };
  const payload = {
    happened_at: body?.happened_at || new Date().toISOString(),
    user_id: isUuid(body?.user_id) ? String(body.user_id) : null,
    subscription_id: body?.subscription_id || session.subscription_id || body?.license_id || null,
    license_id: body?.license_id || null,
    hwid: body?.hwid || session.hwid || null,
    windows_version: body?.windows_version || null,
    device_name: body?.device_name || null,
    cpu: body?.cpu || null,
    ram_gb: body?.ram_gb || null,
    gpu: body?.gpu || null,
    error_type: limitString(String(body?.error_type || "unknown").trim(), 180),
    message: body?.message ? limitString(body.message, 4000) : null,
    stack_trace: limitString(String(body?.stack_trace || "").trim(), 120000),
    app_version: body?.app_version || null,
    tool_channel: body?.tool_channel || null,
    raw_payload: rawPayload,
  };
  if (!payload.stack_trace) throw new Error("missing_stack_trace");
  payload.fingerprint = await crashFingerprint(payload);
  const created = await insertCrashLogPayload(env, payload);
  return { success: true, item: Array.isArray(created) ? created[0] : created };
}

async function insertCrashLogPayload(env, payload) {
  try {
    return await supabaseRequest(env, "crash_logs", "POST", {
      body: payload,
      prefer: "return=representation",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (!message.toLowerCase().includes("fingerprint") && !message.toLowerCase().includes("schema cache")) throw error;
    const fallback = { ...payload };
    delete fallback.fingerprint;
    return supabaseRequest(env, "crash_logs", "POST", {
      body: fallback,
      prefer: "return=representation",
    });
  }
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
