import { handleCreatePayment, handleGetPaymentStatus } from "./routes/payments.js";
const CHANNELS = ["stable", "beta"];
const ARTIFACT_TYPES = ["portable", "installed"];
const UPDATE_MODES = ["optional", "force", "required", "silent"];
const UNLIMITED_SUBSCRIPTION_EXPIRY = "9999-12-31T23:59:59.000Z";
const CRASH_PAYLOAD_REDACTED = "[redacted]";
const CRASH_SENSITIVE_KEYS = new Set([
  "access_token",
  "refresh_token",
  "id_token",
  "session_token",
  "session_id",
  "password",
  "cookie",
  "cookies",
  "authorization",
  "auth_code",
  "code_verifier",
  "google_drive_token",
  "client_secret",
]);
const CRASH_CONTENT_DUMP_KEYS = new Set([
  "body",
  "html",
  "content",
  "contents",
  "dump",
  "payload_dump",
  "storage_dump",
  "local_storage",
  "user_content",
  "file_contents",
]);
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
  artifacts: {
    portable: {
      url: "",
      sha256: "",
      filename: "",
      size_bytes: 0,
      package_type: "portable_exe",
    },
    installed: {
      url: "",
      sha256: "",
      filename: "",
      size_bytes: 0,
      package_type: "installed_zip",
    },
  },
  notes: "",
  history_reset_at: "",
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

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isUnlimitedExpiry(value) {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) return false;
  return new Date(ts).getUTCFullYear() >= 9999;
}

function subscriptionIdentityKey(row) {
  const userId = String(row?.firebase_user_id || "").trim();
  if (userId) return `uid:${userId}`;
  const email = normalizeEmail(row?.user_email);
  if (email) return `email:${email}`;
  const hwid = String(row?.hwid || "").trim();
  if (hwid) return `hwid:${hwid}`;
  return `id:${String(row?.id || "")}`;
}

function hasOtaBucket(env) {
  return Boolean(env && env.OTA_BUCKET && typeof env.OTA_BUCKET.get === "function" && typeof env.OTA_BUCKET.put === "function");
}

function normalizeCrashKey(value) {
  return String(value || "").trim().toLowerCase().replace(/-/g, "_");
}

function isSensitiveCrashKey(value) {
  const normalized = normalizeCrashKey(value);
  if (!normalized) return false;
  return (
    CRASH_SENSITIVE_KEYS.has(normalized) ||
    CRASH_CONTENT_DUMP_KEYS.has(normalized) ||
    normalized.endsWith("_token") ||
    normalized.endsWith("_secret") ||
    normalized.endsWith("_password") ||
    normalized.endsWith("_cookie")
  );
}

function sanitizeCrashString(value) {
  return String(value || "")
    .replace(/\b(authorization)\s*:\s*bearer\s+[^\s,;]+/gi, `$1: Bearer ${CRASH_PAYLOAD_REDACTED}`)
    .replace(/\b(set-cookie|cookie)\s*:\s*[^\r\n]+/gi, (_, key) => `${key}: ${CRASH_PAYLOAD_REDACTED}`)
    .replace(/([?&](?:access_token|refresh_token|id_token|session_token|session_id|auth_code|code_verifier|password|cookie)=)[^&#\s]+/gi, (_, prefix) => `${prefix}${CRASH_PAYLOAD_REDACTED}`)
    .replace(/\b(access_token|refresh_token|id_token|session_token|session_id|auth_code|code_verifier|password|cookie|google_drive_token|client_secret)\b\s*([:=])\s*([^\s,;]+)/gi, (_, key, separator) => `${key}${separator}${separator === ":" ? " " : ""}${CRASH_PAYLOAD_REDACTED}`);
}

function sanitizeCrashValue(value, key = "") {
  const normalized = normalizeCrashKey(key);
  if (isSensitiveCrashKey(normalized)) return CRASH_PAYLOAD_REDACTED;
  if (normalized && CRASH_CONTENT_DUMP_KEYS.has(normalized)) return CRASH_PAYLOAD_REDACTED;
  if (Array.isArray(value)) return value.map((item) => sanitizeCrashValue(item, normalized));
  if (value && typeof value === "object") {
    const output = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      output[childKey] = sanitizeCrashValue(childValue, childKey);
    }
    return output;
  }
  if (typeof value === "string") return sanitizeCrashString(value);
  return value;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = (url.hostname || "").toLowerCase();
    if (request.method === "OPTIONS") return handleOptions(request, env);

    try {
      if (host === "admin.saturnws.com" && url.pathname === "/admin-policy-controls.js" && request.method === "GET") {
        return serveAdminPolicyControlsScript();
      }
      if (host === "admin.saturnws.com" && request.method === "GET" && !url.pathname.startsWith("/api/")) {
        return proxyAdminFrontend(url);
      }
      if (url.pathname === "/updates/latest.json" && request.method === "GET") {
        return serveLatestManifest(env);
      }
      if (url.pathname.startsWith("/updates/file/") && (request.method === "GET" || request.method === "HEAD")) {
        return serveReleaseBinary(request, url, env);
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
      if (url.pathname === "/api/admin/reset-baseline" && request.method === "POST") {
        const adminEmail = await requireAdmin(request, env);
        return json(await resetOtaBaseline(request, env, adminEmail), 200, corsHeaders(request, env));
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
      if (url.pathname === "/api/admin/policy/state" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await proxyPolicyAdmin(request, env, "/v1/admin/state"), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/global-policy" && request.method === "POST") {
        const adminEmail = await requireAdmin(request, env);
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/global-policy");
        await appendAudit(env, { type: "policy_global_update", actor: adminEmail, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/disabled-versions" && request.method === "POST") {
        const adminEmail = await requireAdmin(request, env);
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/disabled-versions");
        await appendAudit(env, { type: "policy_disabled_version_update", actor: adminEmail, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/users" && request.method === "POST") {
        const adminEmail = await requireAdmin(request, env);
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/users");
        await appendAudit(env, { type: "policy_user_update", actor: adminEmail, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/plan-features" && request.method === "POST") {
        const adminEmail = await requireAdmin(request, env);
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/plan-features");
        await appendAudit(env, { type: "policy_plan_features_update", actor: adminEmail, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/releases" && request.method === "POST") {
        const adminEmail = await requireAdmin(request, env);
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/releases");
        await appendAudit(env, { type: "policy_release_catalog_update", actor: adminEmail, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/support" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await proxyPolicyAdmin(request, env, "/v1/admin/support"), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/support/messages" && request.method === "GET") {
        await requireAdmin(request, env);
        const threadId = url.searchParams.get("thread_id") || "";
        return json(
          await proxyPolicyAdmin(request, env, `/v1/admin/support/messages?thread_id=${encodeURIComponent(threadId)}`),
          200,
          corsHeaders(request, env),
        );
      }
      if (url.pathname === "/api/admin/policy/support/reply" && request.method === "POST") {
        const adminEmail = await requireAdmin(request, env);
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/support/reply");
        await appendAudit(env, { type: "support_reply", actor: adminEmail, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
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
      if (url.pathname === "/api/admin/access-requests" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await listAccessRequests(url, env), 200, corsHeaders(request, env));
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
  const contentType = headers.get("Content-Type") || "";
  if (contentType.includes("text/html")) {
    const html = await finalUpstream.text();
    const injected = html.includes("/admin-policy-controls.js")
      ? html
      : html.replace("</body>", '<script src="/admin-policy-controls.js" defer></script></body>');
    headers.delete("Content-Length");
    return new Response(injected, {
      status: finalUpstream.status,
      headers,
    });
  }
  return new Response(finalUpstream.body, {
    status: finalUpstream.status,
    headers,
  });
}

function serveAdminPolicyControlsScript() {
  const source = String.raw`
(function () {
  if (window.__saturnPolicyControlsLoaded) return;
  window.__saturnPolicyControlsLoaded = true;

  const styles = document.createElement("style");
  styles.textContent = [
    "#saturn-policy-admin{position:fixed;left:18px;bottom:18px;z-index:2147483000;font-family:Inter,Arial,sans-serif;color:#e5edf8;direction:ltr}",
    "#saturn-policy-admin *{box-sizing:border-box}",
    "#saturn-policy-toggle{border:1px solid rgba(96,165,250,.35);background:linear-gradient(135deg,#1d4ed8,#0f172a);color:white;border-radius:999px;padding:10px 14px;font-weight:800;font-size:12px;box-shadow:0 16px 42px rgba(0,0,0,.35);cursor:pointer}",
    "#saturn-policy-panel{display:none;width:min(760px,calc(100vw - 36px));max-height:min(760px,calc(100vh - 96px));overflow:auto;margin-bottom:12px;border:1px solid rgba(148,163,184,.22);background:#0f141c;border-radius:22px;box-shadow:0 22px 70px rgba(0,0,0,.55)}",
    "#saturn-policy-admin.open #saturn-policy-panel{display:block}",
    ".sp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 18px;border-bottom:1px solid rgba(148,163,184,.18);background:#151b25}",
    ".sp-title{font-weight:900;font-size:15px;color:#f8fafc}.sp-sub{margin-top:4px;font-size:12px;color:#94a3b8}",
    ".sp-body{display:grid;gap:12px;padding:16px}.sp-card{border:1px solid rgba(148,163,184,.16);background:#121821;border-radius:16px;padding:14px}",
    ".sp-card h3{margin:0 0 10px;font-size:13px;color:#e2e8f0}.sp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}",
    ".sp-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.sp-field{display:grid;gap:5px;font-size:11px;color:#94a3b8}.sp-field input,.sp-field select,.sp-field textarea{min-height:36px;border:1px solid rgba(148,163,184,.2);background:#0b1118;color:#e5edf8;border-radius:10px;padding:8px 10px;outline:none}.sp-field textarea{min-height:70px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px}.sp-field input[type=checkbox]{min-height:auto;width:18px;height:18px}",
    ".sp-btn{border:1px solid rgba(148,163,184,.22);background:#1b2430;color:#e5edf8;border-radius:10px;padding:9px 12px;font-size:12px;font-weight:800;cursor:pointer}.sp-btn.primary{border-color:rgba(59,130,246,.45);background:#2563eb;color:white}.sp-btn:disabled{opacity:.55;cursor:not-allowed}",
    ".sp-status{white-space:pre-wrap;border:1px solid rgba(148,163,184,.16);background:#0b1118;border-radius:12px;padding:10px;font-size:11px;color:#a7b4c7;max-height:180px;overflow:auto}",
    ".sp-list{display:grid;gap:6px;max-height:160px;overflow:auto}.sp-pill{display:flex;justify-content:space-between;gap:10px;border:1px solid rgba(148,163,184,.13);background:#0b1118;border-radius:10px;padding:8px 10px;font-size:11px;color:#cbd5e1}",
    "@media(max-width:760px){.sp-grid{grid-template-columns:1fr}}"
  ].join("");
  document.head.appendChild(styles);

  const root = document.createElement("div");
  root.id = "saturn-policy-admin";
  root.innerHTML = '<div id="saturn-policy-panel"><div class="sp-head"><div><div class="sp-title">Policy Controls</div><div class="sp-sub">Live controls backed by api.saturnws.com policy API. Secrets stay server-side.</div></div><button class="sp-btn" data-close>Close</button></div><div class="sp-body"><div class="sp-card"><h3>Global policy</h3><div class="sp-grid"><label class="sp-field">Update mode<select data-global-update-mode><option value="optional">optional</option><option value="mandatory">mandatory</option></select></label><label class="sp-field">Minimum supported version<input data-global-min-version placeholder="1.0.0-beta"></label><label class="sp-field">Kill switch<input data-global-kill type="checkbox"></label><label class="sp-field">Mandatory update<input data-global-mandatory type="checkbox"></label><label class="sp-field">Blocked actions<textarea data-global-blocked placeholder="one action per line"></textarea></label><label class="sp-field">Features JSON<textarea data-global-features>{}</textarea></label></div><div class="sp-row" style="margin-top:10px"><button class="sp-btn primary" data-save-global>Save global policy</button></div></div><div class="sp-card"><h3>Disabled versions</h3><div class="sp-grid"><label class="sp-field">Version<input data-disabled-version placeholder="1.0.0-beta"></label><label class="sp-field">Reason<input data-disabled-reason placeholder="reason"></label></div><div class="sp-row" style="margin-top:10px"><button class="sp-btn" data-disable-version>Disable version</button><button class="sp-btn" data-enable-version>Remove disabled version</button></div></div><div class="sp-card"><h3>User policy override</h3><div class="sp-grid"><label class="sp-field">Email<input data-user-email placeholder="user@example.com"></label><label class="sp-field">Status<select data-user-status><option value="active">active</option><option value="disabled">disabled</option><option value="banned">banned</option><option value="blocked">blocked</option></select></label><label class="sp-field">Plan<input data-user-plan value="default"></label><label class="sp-field">Subscription status<select data-sub-status><option value="">no change</option><option value="active">active</option><option value="trialing">trialing</option><option value="expired">expired</option><option value="inactive">inactive</option><option value="canceled">canceled</option></select></label></div><div class="sp-row" style="margin-top:10px"><button class="sp-btn primary" data-save-user>Save user policy</button></div></div><div class="sp-card"><h3>Plan features / blocked actions</h3><div class="sp-grid"><label class="sp-field">Plan ID<input data-plan-id value="default"></label><label class="sp-field">Blocked actions<textarea data-plan-blocked placeholder="one action per line"></textarea></label><label class="sp-field">Features JSON<textarea data-plan-features>{}</textarea></label><label class="sp-field">Limits JSON<textarea data-plan-limits>{}</textarea></label></div><div class="sp-row" style="margin-top:10px"><button class="sp-btn primary" data-save-plan>Save plan</button></div></div><div class="sp-card"><h3>Release catalog visibility</h3><div class="sp-grid"><label class="sp-field">Version<input data-release-version value="1.0.0-beta"></label><label class="sp-field">Visibility<select data-release-visibility><option value="public">public</option><option value="internal">internal</option><option value="archived">archived</option><option value="hidden">hidden</option></select></label><label class="sp-field">Release type<input data-release-type value="public_beta"></label><label class="sp-field">Artifact kind<input data-release-kind value="full_setup"></label></div><div class="sp-row" style="margin-top:10px"><button class="sp-btn primary" data-save-release>Save release catalog</button></div></div><div class="sp-card"><h3>Current policy state</h3><div class="sp-status" data-policy-log>Not loaded yet.</div><div class="sp-list" data-release-list></div></div></div></div><button id="saturn-policy-toggle">Policy Controls</button>';
  document.body.appendChild(root);

  const $ = (sel) => root.querySelector(sel);
  const log = (message) => { $("[data-policy-log]").textContent = typeof message === "string" ? message : JSON.stringify(message, null, 2); };
  const token = () => window.sessionStorage.getItem("st_admin_firebase_token") || "";
  const api = async (path, options) => {
    const headers = new Headers((options && options.headers) || {});
    if (!headers.has("Content-Type") && options && options.body) headers.set("Content-Type", "application/json");
    const bearer = token();
    if (bearer) headers.set("Authorization", "Bearer " + bearer);
    const res = await fetch(path, { ...(options || {}), headers, credentials: "same-origin" });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error((payload && payload.error) || ("request_failed_" + res.status));
    return payload;
  };
  const listFromText = (value) => String(value || "").split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);
  const parseJson = (value, fallback) => {
    try { return JSON.parse(value || JSON.stringify(fallback)); } catch { return fallback; }
  };
  const render = (state) => {
    const global = state.global_policy || {};
    $("[data-global-update-mode]").value = global.update_mode || "optional";
    $("[data-global-min-version]").value = global.minimum_supported_version || "";
    $("[data-global-kill]").checked = Boolean(global.kill_switch_enabled);
    $("[data-global-mandatory]").checked = Boolean(global.mandatory_update_enabled);
    $("[data-global-blocked]").value = JSON.parse(global.blocked_actions_json || "[]").join("\n");
    $("[data-global-features]").value = JSON.stringify(JSON.parse(global.features_json || "{}"), null, 2);
    const releases = Array.isArray(state.releases) ? state.releases : [];
    $("[data-release-list]").innerHTML = releases.slice(0, 10).map((r) => '<div class="sp-pill"><span>' + r.version + '</span><span>' + r.visibility + ' / ' + r.release_type + '</span></div>').join("");
    log(state);
  };
  const load = async () => {
    try { render(await api("/api/admin/policy/state")); } catch (err) { log("Policy state failed: " + (err && err.message ? err.message : err)); }
  };

  $("#saturn-policy-toggle").addEventListener("click", () => { root.classList.toggle("open"); if (root.classList.contains("open")) void load(); });
  $("[data-close]").addEventListener("click", () => root.classList.remove("open"));
  $("[data-save-global]").addEventListener("click", async () => {
    try {
      log(await api("/api/admin/policy/global-policy", { method: "POST", body: JSON.stringify({
        update_mode: $("[data-global-update-mode]").value,
        minimum_supported_version: $("[data-global-min-version]").value,
        kill_switch_enabled: $("[data-global-kill]").checked,
        mandatory_update_enabled: $("[data-global-mandatory]").checked,
        blocked_actions: listFromText($("[data-global-blocked]").value),
        features: parseJson($("[data-global-features]").value, {}),
        limits: {}
      }) }));
      await load();
    } catch (err) { log("Save failed: " + (err && err.message ? err.message : err)); }
  });
  $("[data-disable-version]").addEventListener("click", async () => {
    try { log(await api("/api/admin/policy/disabled-versions", { method: "POST", body: JSON.stringify({ version: $("[data-disabled-version]").value, reason: $("[data-disabled-reason]").value }) })); await load(); } catch (err) { log("Disable failed: " + (err && err.message ? err.message : err)); }
  });
  $("[data-enable-version]").addEventListener("click", async () => {
    try { log(await api("/api/admin/policy/disabled-versions", { method: "POST", body: JSON.stringify({ version: $("[data-disabled-version]").value, disabled: false }) })); await load(); } catch (err) { log("Enable failed: " + (err && err.message ? err.message : err)); }
  });
  $("[data-save-user]").addEventListener("click", async () => {
    try { log(await api("/api/admin/policy/users", { method: "POST", body: JSON.stringify({ email: $("[data-user-email]").value, status: $("[data-user-status]").value, plan_id: $("[data-user-plan]").value, subscription_status: $("[data-sub-status]").value }) })); await load(); } catch (err) { log("User save failed: " + (err && err.message ? err.message : err)); }
  });
  $("[data-save-plan]").addEventListener("click", async () => {
    try { log(await api("/api/admin/policy/plan-features", { method: "POST", body: JSON.stringify({ plan_id: $("[data-plan-id]").value, blocked_actions: listFromText($("[data-plan-blocked]").value), features: parseJson($("[data-plan-features]").value, {}), limits: parseJson($("[data-plan-limits]").value, {}) }) })); await load(); } catch (err) { log("Plan save failed: " + (err && err.message ? err.message : err)); }
  });
  $("[data-save-release]").addEventListener("click", async () => {
    try { log(await api("/api/admin/policy/releases", { method: "POST", body: JSON.stringify({ version: $("[data-release-version]").value, channel: "beta", visibility: $("[data-release-visibility]").value, release_type: $("[data-release-type]").value, artifact_kind: $("[data-release-kind]").value }) })); await load(); } catch (err) { log("Release save failed: " + (err && err.message ? err.message : err)); }
  });
})();
`;
  return new Response(source, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
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
  const requestedRemoteConfig = safePlainObject(body.remote_config);
  const nextRemoteConfig = {
    ...remoteConfig,
    update_mode:
      body.update_mode || requestedRemoteConfig.update_mode
        ? normalizeUpdateMode(body.update_mode || requestedRemoteConfig.update_mode)
        : normalizeUpdateMode(remoteConfig.update_mode),
    kill_switch_enabled:
      body.kill_switch_enabled !== undefined || requestedRemoteConfig.kill_switch_enabled !== undefined
        ? Boolean(body.kill_switch_enabled ?? requestedRemoteConfig.kill_switch_enabled)
        : Boolean(remoteConfig.kill_switch_enabled),
    kill_switch_message:
      body.kill_switch_message !== undefined || requestedRemoteConfig.kill_switch_message !== undefined
        ? String(body.kill_switch_message ?? requestedRemoteConfig.kill_switch_message ?? "").trim().slice(0, 600)
        : String(remoteConfig.kill_switch_message || ""),
    feature_flags:
      body.feature_flags !== undefined || requestedRemoteConfig.feature_flags !== undefined
        ? safePlainObject(body.feature_flags ?? requestedRemoteConfig.feature_flags)
        : safePlainObject(remoteConfig.feature_flags),
    announcements:
      body.announcements !== undefined || requestedRemoteConfig.announcements !== undefined
        ? normalizeAnnouncements(body.announcements ?? requestedRemoteConfig.announcements)
        : normalizeAnnouncements(remoteConfig.announcements),
  };
  const nextUpdateMode = normalizeUpdateMode(nextRemoteConfig.update_mode);
  const nextForceDeadline =
    body.force_update_deadline !== undefined ? optionalIsoDate(body.force_update_deadline) : String(existing.force_update_deadline || "");
  return {
    ...existing,
    rollout_percent:
      body.rollout_percent !== undefined ? clampRolloutPercent(body.rollout_percent) : clampRolloutPercent(existing.rollout_percent, 100),
    minimum_supported_version:
      body.minimum_supported_version !== undefined
        ? optionalVersion(body.minimum_supported_version)
        : String(existing.minimum_supported_version || ""),
    force_update_deadline:
      nextUpdateMode === "force" || nextUpdateMode === "required" ? nextForceDeadline : "",
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

function normalizeArtifactType(value) {
  const normalized = String(value || "portable").trim().toLowerCase();
  return ARTIFACT_TYPES.includes(normalized) ? normalized : "portable";
}

function artifactPackageType(artifactType) {
  return artifactType === "installed" ? "installed_zip" : "portable_exe";
}

function artifactContentType(artifactType) {
  return artifactType === "installed" ? "application/zip" : "application/vnd.microsoft.portable-executable";
}

function releaseObjectKeyForArtifact(channel, version, artifactType, filename) {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  return `releases/${channel}/${version}/${artifactType}/${now}_${sanitizeFilename(filename)}`;
}

function normalizeReleaseMeta(channel, version, payload) {
  const base = {
    channel,
    version,
    artifacts: {},
  };
  if (!payload || typeof payload !== "object") return base;
  if (payload.artifacts && typeof payload.artifacts === "object") {
    for (const artifactType of ARTIFACT_TYPES) {
      const value = payload.artifacts[artifactType];
      if (!value || typeof value !== "object") continue;
      base.artifacts[artifactType] = {
        key: String(value.key || "").trim(),
        channel,
        version,
        filename: sanitizeFilename(value.filename || (artifactType === "installed" ? "SaturnWorkspace-app.zip" : "SaturnWS.exe")),
        size: Number(value.size || 0),
        sha256: String(value.sha256 || "").trim().toLowerCase(),
        uploaded_at: String(value.uploaded_at || "").trim(),
        uploaded_by: String(value.uploaded_by || "").trim(),
        package_type: String(value.package_type || artifactPackageType(artifactType)).trim().toLowerCase(),
      };
    }
    return base;
  }

  if (payload.key && payload.sha256) {
    base.artifacts.portable = {
      key: String(payload.key || "").trim(),
      channel,
      version,
      filename: sanitizeFilename(payload.filename || "SaturnWS.exe"),
      size: Number(payload.size || 0),
      sha256: String(payload.sha256 || "").trim().toLowerCase(),
      uploaded_at: String(payload.uploaded_at || "").trim(),
      uploaded_by: String(payload.uploaded_by || "").trim(),
      package_type: "portable_exe",
    };
  }
  return base;
}

function manifestArtifactsForRelease(release, downloadUrlBase) {
  const artifacts = {
    portable: {
      url: "",
      sha256: "",
      filename: "",
      size_bytes: 0,
      package_type: "portable_exe",
    },
    installed: {
      url: "",
      sha256: "",
      filename: "",
      size_bytes: 0,
      package_type: "installed_zip",
    },
  };
  if (!release || typeof release !== "object" || !release.artifacts || typeof release.artifacts !== "object") {
    return artifacts;
  }
  for (const artifactType of ARTIFACT_TYPES) {
    const record = release.artifacts[artifactType];
    if (!record || typeof record !== "object") continue;
    const key = String(record.key || "").trim();
    if (!key) continue;
    artifacts[artifactType] = {
      url: `${downloadUrlBase}/file/${encodeURIComponent(key)}`,
      sha256: String(record.sha256 || "").trim().toLowerCase(),
      filename: String(record.filename || "").trim(),
      size_bytes: Number(record.size || 0),
      package_type: String(record.package_type || artifactPackageType(artifactType)).trim().toLowerCase(),
    };
  }
  return artifacts;
}

function uploadedReleaseArtifacts(release) {
  const artifacts = release && typeof release === "object" && release.artifacts && typeof release.artifacts === "object"
    ? release.artifacts
    : {};
  const portable = artifacts.portable && artifacts.portable.key && artifacts.portable.sha256 ? artifacts.portable : null;
  const installed = artifacts.installed && artifacts.installed.key && artifacts.installed.sha256 ? artifacts.installed : null;
  return { portable, installed, primary: portable || installed };
}

function artifactDownloadUrl(record, downloadUrlBase) {
  const key = String(record?.key || "").trim();
  return key ? `${downloadUrlBase}/file/${encodeURIComponent(key)}` : "";
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
  const artifactType = normalizeArtifactType(form.get("artifact_type"));
  const lowerName = String(file.name || "").toLowerCase();
  if (artifactType === "installed") {
    if (!lowerName.endsWith(".zip")) throw new Error("invalid_file_type");
  } else if (!lowerName.endsWith(".exe")) {
    throw new Error("invalid_file_type");
  }
  if (file.size <= 0) throw new Error("empty_file");
  if (file.size > maxMb * 1024 * 1024) throw new Error("file_too_large");

  const channel = normalizeChannel(form.get("channel"));
  const version = normalizeVersion(form.get("version"));
  const key = releaseObjectKeyForArtifact(channel, version, artifactType, file.name);
  const fileBytes = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", fileBytes);
  const hashHex = [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

  await env.OTA_BUCKET.put(key, fileBytes, {
    httpMetadata: {
      contentType: artifactContentType(artifactType),
      contentDisposition: `attachment; filename="${sanitizeFilename(file.name)}"`,
    },
    customMetadata: {
      version,
      channel,
      artifactType,
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
    package_type: artifactPackageType(artifactType),
  };
  const metaKey = `meta/${channel}/${version}.json`;
  const existingMetaObj = await env.OTA_BUCKET.get(metaKey);
  const existingMeta = existingMetaObj ? normalizeReleaseMeta(channel, version, await existingMetaObj.json()) : normalizeReleaseMeta(channel, version, null);
  const mergedMeta = {
    ...existingMeta,
    channel,
    version,
    artifacts: {
      ...(existingMeta.artifacts || {}),
      [artifactType]: releaseRecord,
    },
  };
  await env.OTA_BUCKET.put(metaKey, JSON.stringify(mergedMeta, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  await appendAudit(env, {
    type: "upload",
    channel,
    version,
    key,
    artifact_type: artifactType,
    actor: adminEmail,
    at: new Date().toISOString(),
  });
  return { success: true, release: releaseRecord, artifact_type: artifactType, meta: mergedMeta };
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
  const forceUpdateDeadline = mandatory ? optionalIsoDate(body?.force_update_deadline) : "";

  const metaKey = `meta/${channel}/${version}.json`;
  const metaObj = await env.OTA_BUCKET.get(metaKey);
  if (!metaObj) throw new Error("release_not_uploaded");
  const release = normalizeReleaseMeta(channel, version, await metaObj.json());
  const downloadUrlBase = String(env.PUBLIC_UPDATES_BASE_URL || "https://saturnws.com/updates").replace(/\/+$/, "");
  const { portable: portableRelease, primary: primaryRelease } = uploadedReleaseArtifacts(release);
  if (!primaryRelease) throw new Error("release_artifact_not_uploaded");
  const downloadUrl = portableRelease ? artifactDownloadUrl(portableRelease, downloadUrlBase) : "";
  const recordDownloadUrl = artifactDownloadUrl(primaryRelease, downloadUrlBase);
  const artifacts = manifestArtifactsForRelease(release, downloadUrlBase);

  const manifest = await loadManifest(env);
  const currentChannel = manifest.channels?.[channel];
  const hasActiveArtifact = Boolean(
    String(currentChannel?.download_url || "").trim() ||
    String(currentChannel?.artifacts?.portable?.url || "").trim() ||
    String(currentChannel?.artifacts?.installed?.url || "").trim()
  );
  if (
    currentChannel &&
    typeof currentChannel === "object" &&
    String(currentChannel.version || "").trim() === version &&
    hasActiveArtifact
  ) {
    throw new Error("same_version_already_active");
  }
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
    download_sha256: portableRelease?.sha256 || "",
    filename: portableRelease?.filename || "",
    artifacts,
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
    download_sha256: channel === "stable" ? portableRelease?.sha256 || "" : manifest.download_sha256 || "",
    filename: channel === "stable" ? channelManifest.filename : manifest.filename || "",
    artifacts: channel === "stable" ? artifacts : manifest.artifacts || structuredClone(DEFAULT_MANIFEST.artifacts),
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
    download_url: recordDownloadUrl,
    checksum_sha256: primaryRelease.sha256 || null,
    file_size_bytes: primaryRelease.size || null,
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
  const release = normalizeReleaseMeta(channel, version, await metaObj.json());

  const manifest = await loadManifest(env);
  const existing = manifest.channels?.[channel] || {};
  const downloadUrlBase = String(env.PUBLIC_UPDATES_BASE_URL || "https://saturnws.com/updates").replace(/\/+$/, "");
  const { portable: portableRelease, primary: primaryRelease } = uploadedReleaseArtifacts(release);
  if (!primaryRelease) throw new Error("release_artifact_not_uploaded");
  const downloadUrl = portableRelease ? artifactDownloadUrl(portableRelease, downloadUrlBase) : "";
  const artifacts = manifestArtifactsForRelease(release, downloadUrlBase);
  const updatedChannel = {
    ...existing,
    version,
    available: true,
    disabled: false,
    disabled_reason: "",
    download_url: downloadUrl,
    download_sha256: portableRelease?.sha256 || existing.download_sha256 || "",
    filename: portableRelease?.filename || existing.filename || "",
    artifacts,
    published_at: new Date().toISOString(),
  };

  const nextManifest = {
    ...manifest,
    version: channel === "stable" ? version : manifest.version,
    available: channel === "stable" ? true : Boolean(manifest.available),
    disabled: channel === "stable" ? false : Boolean(manifest.disabled),
    disabled_reason: channel === "stable" ? "" : String(manifest.disabled_reason || ""),
    download_url: channel === "stable" ? downloadUrl : manifest.download_url,
    download_sha256: channel === "stable" ? portableRelease?.sha256 || "" : manifest.download_sha256 || "",
    filename: channel === "stable" ? updatedChannel.filename : manifest.filename,
    artifacts: channel === "stable" ? artifacts : manifest.artifacts || structuredClone(DEFAULT_MANIFEST.artifacts),
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

async function resetOtaBaseline(request, env, adminEmail) {
  if (!hasOtaBucket(env)) throw new Error("r2_not_enabled");
  const body = await request.json().catch(() => ({}));
  const channel = normalizeChannel(body?.channel);
  const version = normalizeVersion(body?.version || "1.0.0-beta");
  const resetAt = new Date().toISOString();
  const manifest = await loadManifest(env);
  const remoteConfig = {
    ...safePlainObject(manifest.remote_config),
    ...safePlainObject(manifest.channels?.[channel]?.remote_config),
    update_mode: "optional",
  };
  const baselineChannel = {
    version,
    available: false,
    disabled: false,
    disabled_reason: "",
    mandatory: false,
    rollout_percent: 0,
    minimum_supported_version: "",
    force_update_deadline: "",
    download_url: "",
    download_sha256: "",
    filename: "",
    artifacts: structuredClone(DEFAULT_MANIFEST.artifacts),
    notes: "Public beta baseline. No OTA update is available for this baseline.",
    remote_config: remoteConfig,
    published_at: resetAt,
    release_visibility: "public",
    release_type: "public_beta",
  };
  const nextManifest = {
    ...structuredClone(DEFAULT_MANIFEST),
    ...manifest,
    version,
    available: false,
    mandatory: false,
    disabled: false,
    disabled_reason: "",
    rollout_percent: 0,
    minimum_supported_version: "",
    force_update_deadline: "",
    download_url: "",
    download_sha256: "",
    filename: "",
    artifacts: structuredClone(DEFAULT_MANIFEST.artifacts),
    notes: "Public beta baseline. No public OTA update is available yet.",
    history_reset_at: resetAt,
    remote_config: remoteConfig,
    channels: {
      stable: {},
      beta: {},
      [channel]: baselineChannel,
    },
  };
  const signedManifest = await saveManifest(env, nextManifest);
  await appendAudit(env, {
    type: "ota_baseline_reset",
    channel,
    version,
    actor: adminEmail,
    at: resetAt,
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
    artifacts: channelManifest.artifacts && typeof channelManifest.artifacts === "object"
      ? channelManifest.artifacts
      : structuredClone(DEFAULT_MANIFEST.artifacts),
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

async function proxyPolicyAdmin(request, env, targetPath) {
  const token = String(env.POLICY_ADMIN_TOKEN || "").trim();
  if (!token) throw new Error("policy_admin_token_missing");
  const base = String(env.POLICY_API_BASE || "https://api.saturnws.com").trim().replace(/\/+$/, "");
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  const init = {
    method: request.method,
    headers,
  };
  if (!["GET", "HEAD"].includes(request.method)) {
    headers["Content-Type"] = "application/json; charset=utf-8";
    const body = await request.text();
    init.body = body || "{}";
  }
  const response = await fetch(`${base}${targetPath}`, init);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { success: false, error: text || `policy_admin_${response.status}` };
  }
  if (!response.ok) {
    throw new Error(payload?.error || `policy_admin_${response.status}`);
  }
  return payload || { success: true };
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
  const manifest = await loadManifest(env);
  const resetAt = Date.parse(String(manifest.history_reset_at || ""));
  const audit = await loadAudit(env);
  const filtered = audit
    .filter((event) => !channel || event.channel === channel)
    .filter((event) => !Number.isFinite(resetAt) || Date.parse(String(event.at || "")) >= resetAt)
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  return { success: true, events: filtered };
}

async function loadDashboardState(env) {
  const manifest = await loadManifest(env);
  const resetAt = Date.parse(String(manifest.history_reset_at || ""));
  const audit = await loadAudit(env);
  const recentEvents = audit
    .filter((event) => !Number.isFinite(resetAt) || Date.parse(String(event.at || "")) >= resetAt)
    .slice(-50)
    .reverse();
  return {
    success: true,
    manifest,
    recent_events: recentEvents,
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
      artifacts: {
        ...structuredClone(DEFAULT_MANIFEST.artifacts),
        ...(parsed.artifacts && typeof parsed.artifacts === "object" ? parsed.artifacts : {}),
      },
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

async function serveReleaseBinary(request, url, env) {
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
  return new Response(request.method === "HEAD" ? null : obj.body, { status: 200, headers });
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
    safeSupabaseRead(env, "account_subscriptions", "select=id,firebase_user_id,user_email,hwid,status,tier,expires_at,updated_at,created_at&limit=500"),
    safeSupabaseRead(env, "crash_logs", "select=id,error_type,happened_at,user_id&order=happened_at.desc&limit=20"),
    supabaseRequest(env, "tamper_alerts", "GET", { query: "select=id,severity,resolved,happened_at,reason&resolved=is.false&order=happened_at.desc&limit=50" }),
    supabaseRequest(env, "ota_updates", "GET", { query: "select=id,version,channel,is_mandatory,is_published,created_at&order=created_at.desc&limit=20" }),
  ]);
  const uniqueSubscriptions = dedupeSubscriptions(Array.isArray(subscriptions) ? subscriptions : []);
  const activeUsers = Array.isArray(uniqueSubscriptions) ? uniqueSubscriptions.filter((x) => x.status === "active" && !isExpiredIso(x.expires_at)).length : 0;
  const churnedUsers = Array.isArray(uniqueSubscriptions)
    ? uniqueSubscriptions.filter((x) => x.status === "expired" || x.status === "canceled" || isExpiredIso(x.expires_at)).length
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
  const status = String(url.searchParams.get("status") || "").trim();
  const tier = String(url.searchParams.get("tier") || "").trim();
  const search = safeSearchTerm(url.searchParams.get("search"));
  const rows = await safeSupabaseRead(env, "account_subscriptions", "select=*&order=created_at.desc&limit=500");
  let items = dedupeSubscriptions(Array.isArray(rows) ? rows : []);
  if (status) items = items.filter((item) => String(item?.status || "").trim().toLowerCase() === status.toLowerCase());
  if (tier) items = items.filter((item) => String(item?.tier || "").trim().toLowerCase() === tier.toLowerCase());
  if (search) {
    const normalizedSearch = search.toLowerCase();
    items = items.filter((item) =>
      [item?.user_email, item?.firebase_user_id, item?.hwid, item?.status, item?.tier, item?.plan]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch)),
    );
  }
  const offset = (page - 1) * limit;
  return { success: true, items: items.slice(offset, offset + limit), total: items.length, page, limit };
}

async function createSubscription(request, env, adminEmail) {
  const body = await request.json();
  const userEmail = String(body?.user_email || body?.email || "").trim().toLowerCase();
  const firebaseUserId = String(body?.firebase_user_id || "").trim() || null;
  const hwid = String(body?.hwid || "").trim() || null;
  const plan = String(body?.plan || "monthly").trim().toLowerCase();
  const tier = String(body?.tier || "public").trim().toLowerCase();
  const { expiresAt, isUnlimited } = normalizeSubscriptionExpiryInput(body);
  if (!userEmail || !expiresAt) throw new Error("missing_subscription_fields");
  const existing = await findExistingSubscriptionForIdentity(env, { userEmail, firebaseUserId });
  const existingMetadata = existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
  const payload = {
    firebase_user_id: firebaseUserId || existing?.firebase_user_id || null,
    user_email: userEmail,
    plan,
    tier,
    status: "active",
    starts_at: body?.starts_at ? String(body.starts_at).trim() : new Date().toISOString(),
    expires_at: expiresAt,
    hwid: hwid || existing?.hwid || null,
    bound_at: hwid ? new Date().toISOString() : existing?.bound_at || null,
    provider: String(body?.provider || existing?.provider || "manual").trim().toLowerCase(),
    provider_customer_id: String(body?.provider_customer_id || existing?.provider_customer_id || "").trim() || null,
    provider_subscription_id: String(body?.provider_subscription_id || existing?.provider_subscription_id || "").trim() || null,
    feature_payload:
      body?.feature_payload && typeof body.feature_payload === "object"
        ? body.feature_payload
        : existing?.feature_payload && typeof existing.feature_payload === "object"
          ? existing.feature_payload
          : {},
    metadata: {
      ...existingMetadata,
      ...(body?.metadata && typeof body.metadata === "object" ? body.metadata : {}),
      is_unlimited: isUnlimited,
      ...(existing ? { updated_by: adminEmail } : { created_by: adminEmail }),
    },
  };
  const changed = existing
    ? await supabaseRequest(env, "account_subscriptions", "PATCH", {
        query: `id=eq.${encodeURIComponent(existing.id)}&select=*`,
        body: { ...payload, updated_at: new Date().toISOString() },
        prefer: "return=representation",
      })
    : await supabaseRequest(env, "account_subscriptions", "POST", {
        body: payload,
        prefer: "return=representation",
      });
  const item = Array.isArray(changed) ? changed[0] : changed;
  const autoAuthorized = await authorizeMatchingAccessRequests(env, item).catch(() => 0);
  await appendAudit(env, {
    type: existing ? "subscription_upsert" : "subscription_create",
    entity: "account_subscriptions",
    entity_id: item?.id || null,
    actor: adminEmail,
    payload: {
      user_email: userEmail,
      firebase_user_id: firebaseUserId,
      hwid,
      plan,
      tier,
      expires_at: expiresAt,
      is_unlimited: isUnlimited,
      reused_existing_subscription: Boolean(existing),
      auto_authorized_requests: autoAuthorized,
    },
    at: new Date().toISOString(),
  });
  return { success: true, item, auto_authorized_requests: autoAuthorized };
}

async function updateSubscription(subscriptionId, request, env, adminEmail) {
  if (!subscriptionId) throw new Error("missing_subscription_id");
  const body = await request.json();
  const patch = {};
  if (body?.status) patch.status = String(body.status).trim().toLowerCase();
  if (body?.tier) patch.tier = String(body.tier).trim().toLowerCase();
  if (body?.hwid !== undefined) patch.hwid = body.hwid ? String(body.hwid).trim() : null;
  const expiryInput = normalizeSubscriptionExpiryInput(body);
  if (expiryInput.expiresAt) patch.expires_at = expiryInput.expiresAt;
  if (body?.user_email) patch.user_email = String(body.user_email).trim().toLowerCase();
  if (body?.firebase_user_id !== undefined) patch.firebase_user_id = body.firebase_user_id ? String(body.firebase_user_id).trim() : null;
  patch.metadata = {
    ...(body?.metadata && typeof body.metadata === "object" ? body.metadata : {}),
    ...(body?.expires_at || body?.is_unlimited === true || String(body?.duration || "").trim().toLowerCase() === "unlimited"
      ? { is_unlimited: expiryInput.isUnlimited }
      : {}),
    updated_by: adminEmail,
  };
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
  const manifest = await loadManifest(env);
  const resetAt = Date.parse(String(manifest.history_reset_at || ""));
  const data = await supabaseRequest(env, "ota_updates", "GET", {
    query: `select=*&order=created_at.desc&limit=${limit}`,
  });
  const publicItems = (Array.isArray(data) ? data : [])
    .filter((item) => !isInternalTestRelease(item?.version))
    .filter((item) => {
      if (!Number.isFinite(resetAt)) return true;
      const itemAt = Date.parse(String(item?.created_at || item?.published_at || ""));
      return Number.isFinite(itemAt) && itemAt >= resetAt;
    });
  if (!publicItems.some((item) => String(item?.version || "") === "1.0.0-beta")) {
    publicItems.unshift({
      id: "baseline-1.0.0-beta",
      version: "1.0.0-beta",
      channel: "beta",
      release_notes: "First public beta baseline.",
      download_url: "",
      is_mandatory: false,
      is_published: true,
      rollout_percent: 0,
      minimum_supported_version: null,
      force_update_deadline: null,
      created_at: Number.isFinite(resetAt) ? new Date(resetAt).toISOString() : "2026-05-28T20:46:41.605Z",
    });
  }
  return { success: true, items: publicItems.slice(0, limit) };
}

function isInternalTestRelease(version) {
  const value = String(version || "").trim().toLowerCase();
  return value.includes("-test") || value === "1.0.8-beta";
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

function isExpiredIso(value) {
  const ts = Date.parse(String(value || ""));
  return Number.isFinite(ts) ? ts <= Date.now() : false;
}

function accessRequestLastEventAt(row) {
  return String(row?.consumed_at || row?.authorized_at || row?.created_at || row?.expires_at || "");
}

function subscriptionSortScore(row) {
  const active = String(row?.status || "").toLowerCase() === "active" && !isExpiredIso(row?.expires_at);
  const bound = String(row?.firebase_user_id || "").trim() ? "1" : "0";
  const unlimited = isUnlimitedExpiry(row?.expires_at) ? "1" : "0";
  return `${active ? "1" : "0"}|${bound}|${unlimited}|${String(row?.expires_at || "")}|${String(row?.updated_at || "")}|${String(row?.created_at || "")}`;
}

function compareSubscriptions(left, right) {
  return subscriptionSortScore(right).localeCompare(subscriptionSortScore(left));
}

function dedupeSubscriptions(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const byIdentity = new Map();
  for (const row of [...rows].sort(compareSubscriptions)) {
    const key = subscriptionIdentityKey(row);
    if (!byIdentity.has(key)) byIdentity.set(key, row);
  }
  return [...byIdentity.values()];
}

function normalizeSubscriptionExpiryInput(body) {
  const requestedUnlimited =
    body?.is_unlimited === true || String(body?.duration || "").trim().toLowerCase() === "unlimited";
  if (requestedUnlimited) {
    return { expiresAt: UNLIMITED_SUBSCRIPTION_EXPIRY, isUnlimited: true };
  }
  const expiresAt = String(body?.expires_at || "").trim();
  return {
    expiresAt,
    isUnlimited: isUnlimitedExpiry(expiresAt),
  };
}

async function findExistingSubscriptionForIdentity(env, { userEmail, firebaseUserId }) {
  const filters = [];
  const normalizedEmail = normalizeEmail(userEmail);
  if (normalizedEmail) filters.push(`user_email.ilike.${encodeURIComponent(normalizedEmail)}`);
  if (firebaseUserId) filters.push(`firebase_user_id.eq.${encodeURIComponent(firebaseUserId)}`);
  if (!filters.length) return null;
  const rows = await safeSupabaseRead(
    env,
    "account_subscriptions",
    `select=*&or=(${filters.join(",")})&order=created_at.desc&limit=50`,
  );
  const candidates = dedupeSubscriptions(Array.isArray(rows) ? rows : []).filter((row) => {
    if (firebaseUserId && String(row?.firebase_user_id || "").trim() === firebaseUserId) return true;
    return normalizedEmail && normalizeEmail(row?.user_email) === normalizedEmail;
  });
  return candidates[0] || null;
}

function pickMatchingSubscription(row, subscriptions) {
  if (!Array.isArray(subscriptions) || !subscriptions.length) return null;
  const userId = String(row?.user_id || "").trim();
  const userEmail = normalizeEmail(row?.user_email);
  return subscriptions.find((item) => userId && String(item?.firebase_user_id || "").trim() === userId)
    || subscriptions.find((item) => userEmail && normalizeEmail(item?.user_email) === userEmail)
    || null;
}

function accessRequestNeedsAttention(row, subscription) {
  const status = String(row?.status || "").trim().toLowerCase();
  const activeSubscription = subscription && String(subscription.status || "").toLowerCase() === "active" && !isExpiredIso(subscription.expires_at);
  if (!activeSubscription) return true;
  return !["authorized", "consumed"].includes(status);
}

async function listAccessRequests(url, env) {
  const limit = safeInt(url.searchParams.get("limit"), 100, 500);
  const search = safeSearchTerm(url.searchParams.get("search"));
  const [requestRows, subscriptionRows] = await Promise.all([
    safeSupabaseRead(
      env,
      "device_login_sessions",
      `select=id,user_id,user_email,hwid,status,subscription_id,created_at,authorized_at,consumed_at,expires_at&order=created_at.desc&limit=${Math.max(limit * 4, 200)}`,
    ),
    safeSupabaseRead(
      env,
      "account_subscriptions",
      "select=id,firebase_user_id,user_email,status,expires_at,plan,tier,hwid,created_at&order=created_at.desc&limit=500",
    ),
  ]);

  const orderedSubscriptions = dedupeSubscriptions(Array.isArray(subscriptionRows) ? subscriptionRows : []).sort((a, b) =>
    subscriptionSortScore(b).localeCompare(subscriptionSortScore(a)),
  );

  const grouped = new Map();
  for (const row of Array.isArray(requestRows) ? requestRows : []) {
    const userId = String(row?.user_id || "").trim();
    const userEmail = normalizeEmail(row?.user_email);
    if (!userId && !userEmail) continue;
    const key = userEmail || userId || String(row?.hwid || "").trim() || String(row?.id || "");
    const matchedSubscription = pickMatchingSubscription(row, orderedSubscriptions);
    if (!accessRequestNeedsAttention(row, matchedSubscription)) continue;

    const entry = grouped.get(key);
    const lastEventAt = accessRequestLastEventAt(row);
    if (!entry) {
      grouped.set(key, {
        id: String(row?.id || key),
        user_id: userId || null,
        user_email: userEmail || null,
        hwid: String(row?.hwid || "").trim() || null,
        status: String(row?.status || "").trim() || "unknown",
        created_at: row?.created_at || null,
        authorized_at: row?.authorized_at || null,
        consumed_at: row?.consumed_at || null,
        expires_at: row?.expires_at || null,
        request_count: 1,
        last_event_at: lastEventAt,
        has_subscription: Boolean(matchedSubscription),
        subscription_status: matchedSubscription?.status || null,
        subscription_expires_at: matchedSubscription?.expires_at || null,
        subscription_id: matchedSubscription?.id || row?.subscription_id || null,
      });
      continue;
    }

    entry.request_count += 1;
    if (lastEventAt > String(entry.last_event_at || "")) {
      entry.id = String(row?.id || entry.id);
      entry.user_id = userId || entry.user_id;
      entry.user_email = userEmail || entry.user_email;
      entry.hwid = String(row?.hwid || "").trim() || entry.hwid;
      entry.status = String(row?.status || "").trim() || entry.status;
      entry.created_at = row?.created_at || entry.created_at;
      entry.authorized_at = row?.authorized_at || entry.authorized_at;
      entry.consumed_at = row?.consumed_at || entry.consumed_at;
      entry.expires_at = row?.expires_at || entry.expires_at;
      entry.last_event_at = lastEventAt;
    }
    if (matchedSubscription) {
      entry.has_subscription = true;
      entry.subscription_status = matchedSubscription.status || entry.subscription_status;
      entry.subscription_expires_at = matchedSubscription.expires_at || entry.subscription_expires_at;
      entry.subscription_id = matchedSubscription.id || entry.subscription_id;
    }
  }

  const items = [...grouped.values()]
    .filter((item) => {
      if (!search) return true;
      return [item.user_email, item.user_id, item.hwid, item.status, item.subscription_status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    })
    .sort((a, b) => String(b.last_event_at || "").localeCompare(String(a.last_event_at || "")))
    .slice(0, limit);

  return { success: true, items };
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
    : `select=*&or=(user_email.ilike.${encodeURIComponent(key)},firebase_user_id.eq.${encodeURIComponent(key)})&order=created_at.desc&limit=50`;
  const subscriptionRows = await safeSupabaseRead(env, "account_subscriptions", subscriptionQuery);
  const subscription = isUuid(key)
    ? Array.isArray(subscriptionRows) && subscriptionRows.length
      ? subscriptionRows[0]
      : null
    : dedupeSubscriptions(Array.isArray(subscriptionRows) ? subscriptionRows : [])[0] || null;
  const subscriptionId = subscription?.id || "";
  const requestedEmail = key.includes("@") ? key : "";
  const userId = subscription?.firebase_user_id || (!isUuid(key) && !requestedEmail ? key : "");
  const userEmail = normalizeEmail(subscription?.user_email || requestedEmail);
  const sessionFilters = subscriptionId
    ? `subscription_id=eq.${encodeURIComponent(subscriptionId)}`
    : requestedEmail
      ? `user_email.ilike.${encodeURIComponent(requestedEmail)}`
      : userId
        ? `or=(user_email.ilike.${encodeURIComponent(key)},user_id.eq.${encodeURIComponent(userId)})`
        : `user_email.ilike.${encodeURIComponent(key)}`;
  const loginFilters = subscriptionId
    ? `subscription_id=eq.${encodeURIComponent(subscriptionId)}`
    : requestedEmail
      ? `user_email.ilike.${encodeURIComponent(requestedEmail)}`
      : userId
        ? `or=(user_email.ilike.${encodeURIComponent(key)},user_id.eq.${encodeURIComponent(userId)})`
        : `user_email.ilike.${encodeURIComponent(key)}`;
  const crashFilters = subscriptionId
    ? `subscription_id=eq.${encodeURIComponent(subscriptionId)}`
    : subscription?.hwid
      ? `hwid=eq.${encodeURIComponent(subscription.hwid)}`
      : `hwid=eq.__none__`;
  const [sessions, crashes, loginRequests] = await Promise.all([
    safeSupabaseRead(env, "app_sessions", `select=*&${sessionFilters}&order=last_seen_at.desc&limit=50`),
    safeSupabaseRead(env, "crash_logs", `select=*&${crashFilters}&order=happened_at.desc&limit=25`),
    safeSupabaseRead(env, "device_login_sessions", `select=*&${loginFilters}&order=created_at.desc&limit=25`),
  ]);
  const deviceMap = new Map();
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const hwid = session.hwid || "unknown";
    const current = deviceMap.get(hwid) || {
      hwid,
      sessions: 0,
      login_requests: 0,
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
  for (const request of Array.isArray(loginRequests) ? loginRequests : []) {
    const hwid = request.hwid || "unknown";
    const current = deviceMap.get(hwid) || {
      hwid,
      sessions: 0,
      login_requests: 0,
      last_seen_at: "",
      revoked: 0,
      expires_at: request.expires_at || "",
    };
    current.login_requests += 1;
    if (String(accessRequestLastEventAt(request) || "") > String(current.last_seen_at || "")) {
      current.last_seen_at = accessRequestLastEventAt(request);
    }
    deviceMap.set(hwid, current);
  }
  const latestLoginRequest = Array.isArray(loginRequests) && loginRequests.length ? loginRequests[0] : null;
  return {
    success: true,
    item: subscription,
    sessions: Array.isArray(sessions) ? sessions : [],
    crashes: Array.isArray(crashes) ? crashes : [],
    login_requests: Array.isArray(loginRequests) ? loginRequests : [],
    devices: [...deviceMap.values()],
    last_crash: Array.isArray(crashes) && crashes.length ? crashes[0] : null,
    request: latestLoginRequest
      ? {
          user_id: latestLoginRequest.user_id || userId || null,
          user_email: normalizeEmail(latestLoginRequest.user_email) || userEmail || null,
          hwid: latestLoginRequest.hwid || null,
          status: latestLoginRequest.status || null,
          last_event_at: accessRequestLastEventAt(latestLoginRequest),
          expires_at: latestLoginRequest.expires_at || null,
        }
      : null,
  };
}

async function authorizeMatchingAccessRequests(env, subscription) {
  if (!subscription?.id) return 0;
  const userId = String(subscription?.firebase_user_id || "").trim();
  const userEmail = normalizeEmail(subscription?.user_email);
  if (!userId && !userEmail) return 0;

  const filters = [];
  if (userId) filters.push(`user_id.eq.${encodeURIComponent(userId)}`);
  if (userEmail) filters.push(`user_email.ilike.${encodeURIComponent(userEmail)}`);
  const rows = await safeSupabaseRead(
    env,
    "device_login_sessions",
    `select=*&or=(${filters.join(",")})&order=created_at.desc&limit=20`,
  );

  let authorizedCount = 0;
  let resolvedHwid = String(subscription?.hwid || "").trim() || null;
  for (const row of Array.isArray(rows) ? rows : []) {
    const status = String(row?.status || "").trim().toLowerCase();
    if (["consumed", "expired"].includes(status)) continue;
    if (isExpiredIso(row?.expires_at)) continue;
    const rowUserId = String(row?.user_id || "").trim();
    const rowUserEmail = normalizeEmail(row?.user_email);
    if (userId && rowUserId && rowUserId !== userId) continue;
    if (userEmail && rowUserEmail && rowUserEmail !== userEmail) continue;

    const patch = {
      status: "authorized",
      subscription_id: subscription.id,
      user_id: userId || rowUserId || null,
      user_email: userEmail || rowUserEmail || null,
      authorized_at: new Date().toISOString(),
      license_id: null,
    };
    await supabaseRequest(env, "device_login_sessions", "PATCH", {
      query: `id=eq.${encodeURIComponent(row.id)}&select=id`,
      body: patch,
      prefer: "return=minimal",
    });
    if (!resolvedHwid && row?.hwid) {
      await supabaseRequest(env, "account_subscriptions", "PATCH", {
        query: `id=eq.${encodeURIComponent(subscription.id)}&select=id`,
        body: { hwid: String(row.hwid).trim(), bound_at: new Date().toISOString() },
        prefer: "return=minimal",
      }).catch(() => null);
      resolvedHwid = String(row.hwid).trim();
    }
    authorizedCount += 1;
  }
  return authorizedCount;
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
  const allowAnonymous = String(env.ALLOW_ANON_CRASH_INGEST || "1").trim() !== "0";
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
  if (!configuredToken || allowAnonymous) return { source: "anonymous", session: null };
  throw new Error("unauthorized");
}

async function ingestCrashLog(request, env) {
  const body = await request.json();
  const auth = await resolveCrashIngestAuth(request, env, body);
  const session = auth.session || {};
  const safeBody = body && typeof body === "object" ? sanitizeCrashValue(body) : {};
  const rawPayload = safeBody && typeof safeBody === "object" ? { ...safeBody } : {};
  rawPayload.auth = {
    source: auth.source,
    firebase_user_id: session.user_id || rawPayload.firebase_user_id || null,
    user_email: session.user_email || rawPayload.user_email || null,
    warning: auth.warning || null,
  };
  rawPayload.request = {
    ip: String(request.headers.get("CF-Connecting-IP") || "").trim() || null,
    user_agent: String(request.headers.get("User-Agent") || "").trim() || null,
    colo: String(request.cf?.colo || "").trim() || null,
    country: String(request.cf?.country || "").trim() || null,
  };
  const payload = {
    happened_at: safeBody?.happened_at || new Date().toISOString(),
    user_id: isUuid(safeBody?.user_id) ? String(safeBody.user_id) : null,
    subscription_id: safeBody?.subscription_id || session.subscription_id || safeBody?.license_id || null,
    license_id: safeBody?.license_id || null,
    hwid: safeBody?.hwid || session.hwid || null,
    windows_version: safeBody?.windows_version || null,
    device_name: safeBody?.device_name || null,
    cpu: safeBody?.cpu || null,
    ram_gb: safeBody?.ram_gb || null,
    gpu: safeBody?.gpu || null,
    error_type: limitString(String(safeBody?.error_type || "unknown").trim(), 180),
    message: safeBody?.message ? limitString(String(safeBody.message), 4000) : null,
    stack_trace: limitString(String(safeBody?.stack_trace || "").trim(), 120000),
    app_version: safeBody?.app_version || null,
    tool_channel: safeBody?.tool_channel || null,
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
    const lower = message.toLowerCase();
    if (
      !lower.includes("fingerprint") &&
      !lower.includes("schema cache") &&
      !lower.includes("crash_logs_license_id_fkey")
    ) {
      throw error;
    }
    const fallback = { ...payload };
    if (lower.includes("fingerprint") || lower.includes("schema cache")) delete fallback.fingerprint;
    if (lower.includes("crash_logs_license_id_fkey")) delete fallback.license_id;
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
