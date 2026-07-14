import { handleCreatePayment, handleGetPaymentStatus, handleListPlans } from "./routes/payments.js";
import { resolveSubscriptionTruth } from "../../shared/subscriptions/resolver.js";
import { handleDownloadCatalog, handleDownloadFile } from "./routes/downloads.js";
import { assertArtifactVersionMatchesFilename } from "./releaseContract.js";
import {
  adminContext,
  adminRoleAssignmentsState,
  executeAccessRevocation,
  executeAccountLifecycle,
  executeSubscriptionTransition,
  listRecoveryEvidence,
  previewAccessRevocation,
  previewAccountLifecycle,
  previewSubscriptionTransition,
  requirePermission,
} from "./routes/adminOperations.js";
const CHANNELS = ["stable", "beta"];
const ARTIFACT_TYPES = ["portable", "installed"];
const UPDATE_MODES = ["optional", "force", "required", "silent"];
const UNLIMITED_SUBSCRIPTION_EXPIRY = "9999-12-31T23:59:59.000Z";
const MANUAL_GRANT_OPERATIONS = ["extend_current", "replace_current", "start_from_now", "restore_remaining_time"];
const MANUAL_GRANT_UNITS = ["hours", "days", "weeks", "months"];
const MANUAL_GRANT_PLAN_INTENTS = ["weekly", "monthly", "annual", "lifetime", "custom", "manual"];
const MANUAL_GRANT_REASON_CODES = ["admin_grant", "compensation", "trial", "technical_support", "subscription_replacement", "subscription_recovery", "other"];
const MANUAL_GRANT_SOURCES = {
  extend_current: "admin_manual",
  replace_current: "admin_manual",
  start_from_now: "admin_manual",
  restore_remaining_time: "admin_recovery",
};
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
      if (host === "saturnws.com" && (url.pathname === "/admin" || url.pathname.startsWith("/admin/"))) {
        return Response.redirect("https://admin.saturnws.com/", 302);
      }
      if (host === "admin.saturnws.com" && request.method === "GET" && !url.pathname.startsWith("/api/")) {
        return proxyAdminFrontend(url);
      }
      if (host === "updates.saturnws.com" && (url.pathname === "/" || url.pathname === "/latest.json") && request.method === "GET") {
        return serveLatestManifest(env);
      }
      if (host === "updates.saturnws.com" && url.pathname.startsWith("/file/") && (request.method === "GET" || request.method === "HEAD")) {
        const updatesUrl = new URL(request.url);
        updatesUrl.pathname = `/updates${url.pathname}`;
        return serveReleaseBinary(request, updatesUrl, env);
      }
      if (host === "admin-api.saturnws.com" && url.pathname === "/api/updates/latest.json" && request.method === "GET") {
        return serveLatestManifest(env);
      }
      if (host === "admin-api.saturnws.com" && url.pathname.startsWith("/api/updates/file/") && (request.method === "GET" || request.method === "HEAD")) {
        const updatesUrl = new URL(request.url);
        updatesUrl.pathname = url.pathname.replace(/^\/api\/updates\//, "/updates/");
        return serveReleaseBinary(request, updatesUrl, env);
      }
      if (url.pathname === "/updates/latest.json" && request.method === "GET") {
        return serveLatestManifest(env);
      }
      if (url.pathname.startsWith("/updates/file/") && (request.method === "GET" || request.method === "HEAD")) {
        return serveReleaseBinary(request, url, env);
      }
      if (url.pathname.startsWith("/api/")) {
        const originRejection = rejectForbiddenBrowserOrigin(request, env);
        if (originRejection) return originRejection;
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
        const context = await requireAdminContext(request, env, "admin:read");
        return json({ success: true, email: context.email, role: context.role, permissions: context.permissions }, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/state" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await loadDashboardState(env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/upload" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "releases:write");
        return json(await uploadReleaseBinary(request, env, context.email), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/publish" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "releases:write");
        return json(await publishRelease(request, env, context.email), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/reset-baseline" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "releases:write");
        return json(await resetOtaBaseline(request, env, context.email), 200, corsHeaders(request, env));
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
        const context = await requireAdminContext(request, env, "policies:write");
        return json(await updateRemoteControls(request, env, context.email), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/state" && request.method === "GET") {
        await requireAdminContext(request, env, "policies:read");
        return json(await proxyPolicyAdmin(request, env, "/v1/admin/state"), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/global-policy" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "policies:write");
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/global-policy", context);
        await appendAudit(env, { type: "policy_global_update", actor: context.email, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/disabled-versions" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "policies:write");
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/disabled-versions", context);
        await appendAudit(env, { type: "policy_disabled_version_update", actor: context.email, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/users" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "policies:write");
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/users", context);
        await appendAudit(env, { type: "policy_user_update", actor: context.email, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/plan-features" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "policies:write");
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/plan-features", context);
        await appendAudit(env, { type: "policy_plan_features_update", actor: context.email, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/releases" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "releases:write");
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/releases", context);
        await appendAudit(env, { type: "policy_release_catalog_update", actor: context.email, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/invites" && request.method === "GET") {
        const context = await requireAdminContext(request, env, "policies:read");
        return json(await proxyPolicyAdmin(request, env, `/v1/admin/invites${url.search || ""}`, context), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/invites/create" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "policies:write");
        return json(await proxyPolicyAdmin(request, env, "/v1/admin/invites/create", context), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/invites/revoke" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "policies:write");
        return json(await proxyPolicyAdmin(request, env, "/v1/admin/invites/revoke", context), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/invites/usage" && request.method === "GET") {
        const context = await requireAdminContext(request, env, "policies:read");
        return json(await proxyPolicyAdmin(request, env, `/v1/admin/invites/usage${url.search || ""}`, context), 200, corsHeaders(request, env));
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
      const supportAttachmentMatch = url.pathname.match(/^\/api\/admin\/policy\/support\/attachments\/([^/]+)$/);
      if (supportAttachmentMatch && request.method === "GET") {
        const context = await requireAdminContext(request, env, "support:write");
        return proxyPolicyAdminDownload(request, env, `/v1/admin/support/attachments/${encodeURIComponent(decodeURIComponent(supportAttachmentMatch[1]))}`, context);
      }
      if (url.pathname === "/api/admin/policy/support/reply" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "support:write");
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/support/reply", context);
        await appendAudit(env, { type: "support_reply", actor: context.email, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/support/status" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "support:write");
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/support/status", context);
        await appendAudit(env, { type: "support_status_update", actor: context.email, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/support/priority" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "support:write");
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/support/priority", context);
        await appendAudit(env, { type: "support_priority_update", actor: context.email, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/support/block" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "support:write");
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/support/block", context);
        await appendAudit(env, { type: "support_block_update", actor: context.email, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/email/status" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await proxyPolicyAdmin(request, env, "/v1/admin/email/status"), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/email/preview" && (request.method === "GET" || request.method === "POST")) {
        await requireAdmin(request, env);
        const target = request.method === "GET"
          ? `/v1/admin/email/preview${url.search || ""}`
          : "/v1/admin/email/preview";
        return json(await proxyPolicyAdmin(request, env, target), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/email/retry" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "communications:write");
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/email/retry", context);
        await appendAudit(env, { type: "email_retry", actor: context.email, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/email/test" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "communications:write");
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/email/test", context);
        await appendAudit(env, { type: "email_test", actor: context.email, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/policy/email/process" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "communications:write");
        const payload = await proxyPolicyAdmin(request, env, "/v1/admin/email/process", context);
        await appendAudit(env, { type: "email_process", actor: context.email, at: new Date().toISOString() });
        return json(payload, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/releases/disable" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "releases:write");
        return json(await disableRelease(request, env, context.email), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/dashboard" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await getAdminDashboard(env), 200, corsHeaders(request, env));
      }
      if ((url.pathname === "/api/admin/subscriptions" || url.pathname === "/api/admin/licenses") && request.method === "GET") {
        await requireAdminContext(request, env, "subscriptions:read");
        return json(await listSubscriptions(url, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/subscriptions/pending-grants" && request.method === "GET") {
        await requireAdminContext(request, env, "subscriptions:read");
        return json(await listPendingSubscriptionGrants(url, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/subscriptions/pending-grants/cancel" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "subscriptions:write");
        return json(await cancelPendingSubscriptionGrant(request, env, context.email), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/subscriptions/manual-grant/preview" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "subscriptions:write");
        return json(await previewManualSubscriptionGrant(request, env, context.email), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/subscriptions/manual-grant/execute" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "subscriptions:write");
        return json(await executeManualSubscriptionGrant(request, env, context.email), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/device-change-requests" && request.method === "GET") {
        await requireAdminContext(request, env, "users:read");
        return json(await listAccountDeviceChangeRequests(url, env), 200, corsHeaders(request, env));
      }
      const deviceChangeMatch = url.pathname.match(/^\/api\/admin\/device-change-requests\/([^/]+)\/(preview|execute)$/);
      if (deviceChangeMatch && request.method === "POST") {
        const context = await requireAdminContext(request, env, "users:write");
        const changeRequestId = decodeURIComponent(deviceChangeMatch[1]).trim();
        const payload = deviceChangeMatch[2] === "preview"
          ? await previewAccountDeviceChange(changeRequestId, request, env)
          : await executeAccountDeviceChange(changeRequestId, request, env, context);
        return json({ success: true, [deviceChangeMatch[2] === "preview" ? "preview" : "result"]: payload }, 200, corsHeaders(request, env));
      }
      const deviceResetMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/device\/reset\/(preview|execute)$/);
      if (deviceResetMatch && request.method === "POST") {
        const context = await requireAdminContext(request, env, "sessions:revoke");
        const firebaseUid = decodeURIComponent(deviceResetMatch[1]).trim();
        const payload = deviceResetMatch[2] === "preview"
          ? await previewAccountDeviceReset(firebaseUid, request, env)
          : await executeAccountDeviceReset(firebaseUid, request, env, context);
        return json({ success: true, [deviceResetMatch[2] === "preview" ? "preview" : "result"]: payload }, 200, corsHeaders(request, env));
      }
      const accountLifecycleMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/lifecycle\/(preview|execute)$/);
      if (accountLifecycleMatch && request.method === "POST") {
        const context = await requireAdminContext(request, env, "users:write");
        const firebaseUid = decodeURIComponent(accountLifecycleMatch[1]).trim();
        const body = await request.json();
        const payload = accountLifecycleMatch[2] === "preview"
          ? await previewAccountLifecycle(env, context, firebaseUid, body)
          : await executeAccountLifecycle(env, context, firebaseUid, body);
        return json({ success: true, [accountLifecycleMatch[2] === "preview" ? "preview" : "result"]: payload }, 200, corsHeaders(request, env));
      }
      const accountAccessMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/access\/(preview|execute)$/);
      if (accountAccessMatch && request.method === "POST") {
        const context = await requireAdminContext(request, env, "sessions:revoke");
        const firebaseUid = decodeURIComponent(accountAccessMatch[1]).trim();
        const body = await request.json();
        const payload = accountAccessMatch[2] === "preview"
          ? await previewAccessRevocation(env, context, firebaseUid, body)
          : await executeAccessRevocation(env, context, firebaseUid, body);
        return json({ success: true, [accountAccessMatch[2] === "preview" ? "preview" : "result"]: payload }, 200, corsHeaders(request, env));
      }
      const subscriptionTransitionMatch = url.pathname.match(/^\/api\/admin\/subscriptions\/([^/]+)\/transition\/(preview|execute)$/);
      if (subscriptionTransitionMatch && request.method === "POST") {
        const context = await requireAdminContext(request, env, "subscriptions:write");
        const subscriptionId = decodeURIComponent(subscriptionTransitionMatch[1]).trim();
        const body = await request.json();
        const payload = subscriptionTransitionMatch[2] === "preview"
          ? await previewSubscriptionTransition(env, context, subscriptionId, body)
          : await executeSubscriptionTransition(env, context, subscriptionId, body);
        return json({ success: true, [subscriptionTransitionMatch[2] === "preview" ? "preview" : "result"]: payload }, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/subscriptions/recovery-evidence" && request.method === "GET") {
        const context = await requireAdminContext(request, env, "subscriptions:write");
        const firebaseUid = String(url.searchParams.get("firebase_uid") || "").trim();
        if (!firebaseUid) throw new Error("firebase_uid_required");
        return json({ success: true, ...(await listRecoveryEvidence(env, context, firebaseUid)) }, 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/access-requests" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await listAccessRequests(url, env), 200, corsHeaders(request, env));
      }
      if ((url.pathname === "/api/admin/subscriptions" || url.pathname === "/api/admin/licenses") && request.method === "POST") {
        await requireAdminContext(request, env, "subscriptions:write");
        return json({ success: false, error: "manual_grant_workflow_required" }, 410, corsHeaders(request, env));
      }
      if (
        (url.pathname.startsWith("/api/admin/subscriptions/") || url.pathname.startsWith("/api/admin/licenses/")) &&
        url.pathname.endsWith("/reset-hwid") &&
        request.method === "POST"
      ) {
        const context = await requireAdminContext(request, env, "sessions:revoke");
        const subscriptionId = decodeURIComponent(
          url.pathname
            .replace("/api/admin/subscriptions/", "")
            .replace("/api/admin/licenses/", "")
            .replace("/reset-hwid", ""),
        ).trim();
        return json(await resetSubscriptionHwid(subscriptionId, request, env, context.email), 200, corsHeaders(request, env));
      }
      if ((url.pathname.startsWith("/api/admin/subscriptions/") || url.pathname.startsWith("/api/admin/licenses/")) && request.method === "PATCH") {
        await requireAdminContext(request, env, "subscriptions:write");
        return json({ success: false, error: "explicit_subscription_operation_required" }, 410, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/users" && request.method === "GET") {
        await requireAdminContext(request, env, "users:read");
        return json(await listAdminUsers(url, env), 200, corsHeaders(request, env));
      }
      if (url.pathname.startsWith("/api/admin/users/") && request.method === "GET") {
        await requireAdminContext(request, env, "users:read");
        const userKey = decodeURIComponent(url.pathname.replace("/api/admin/users/", "")).trim();
        return json(await getUserDetail(userKey, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/promo-codes" && request.method === "GET") {
        await requireAdminContext(request, env, "admin:read");
        return json(await listPromoCodes(url, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/promo-codes" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "promotions:write");
        return json(await createPromoCode(request, env, context.email), 200, corsHeaders(request, env));
      }
      const promoStateMatch = url.pathname.match(/^\/api\/admin\/promo-codes\/([^/]+)\/state$/);
      if (promoStateMatch && request.method === "POST") {
        const context = await requireAdminContext(request, env, "promotions:write");
        return json(await updatePromoCodeState(decodeURIComponent(promoStateMatch[1]).trim(), request, env, context.email), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/commerce/overview" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await getAdminCommerceOverview(env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/ota-updates" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await listOtaUpdates(url, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/ota-updates" && request.method === "POST") {
        const context = await requireAdminContext(request, env, "releases:write");
        return json(await createOtaUpdate(request, env, context.email), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/crash-logs" && request.method === "GET") {
        await requireAdminContext(request, env, "diagnostics:read");
        return json(await listCrashLogs(url, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/crash-groups" && request.method === "GET") {
        await requireAdminContext(request, env, "diagnostics:read");
        return json(await listCrashGroups(url, env), 200, corsHeaders(request, env));
      }
      const crashGroupStateMatch = url.pathname.match(/^\/api\/admin\/crash-groups\/([^/]+)\/state$/);
      if (crashGroupStateMatch && request.method === "POST") {
        const context = await requireAdminContext(request, env, "diagnostics:write");
        const fingerprint = decodeURIComponent(crashGroupStateMatch[1]).trim();
        return json(await updateCrashGroupState(fingerprint, request, env, context), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/tamper-alerts" && request.method === "GET") {
        await requireAdminContext(request, env, "diagnostics:read");
        return json(await listTamperAlerts(url, env), 200, corsHeaders(request, env));
      }
      const tamperResolveMatch = url.pathname.match(/^\/api\/admin\/tamper-alerts\/([^/]+)\/resolve$/);
      if (tamperResolveMatch && request.method === "POST") {
        const context = await requireAdminContext(request, env, "diagnostics:write");
        return json(await resolveTamperAlert(decodeURIComponent(tamperResolveMatch[1]).trim(), request, env, context), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/audit-log" && request.method === "GET") {
        await requireAdminContext(request, env, "audit:read");
        return json(await listAuditLog(url, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/admin/readiness" && request.method === "GET") {
        await requireAdminContext(request, env, "admin:read");
        return json(await getAdminReadiness(env), 200, corsHeaders(request, env));
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
        const context = await requireAdminContext(request, env, "releases:write");
        return json(await rollbackRelease(request, env, context.email), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/plans/catalog" && request.method === "GET") {
        return json(await handleListPlans(request, env), 200, corsHeaders(request, env));
      }
      if (url.pathname === "/api/account/downloads/catalog" && request.method === "GET") {
        return json(await handleDownloadCatalog(request, env), 200, corsHeaders(request, env));
      }
      if (url.pathname.startsWith("/api/account/downloads/file/") && (request.method === "GET" || request.method === "HEAD")) {
        const releaseId = decodeURIComponent(url.pathname.replace("/api/account/downloads/file/", "")).trim();
        const response = await handleDownloadFile(request, releaseId, env);
        const headers = new Headers(response.headers);
        for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
        return new Response(response.body, { status: response.status, headers });
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
        "firebase_token_missing",
        "firebase_user_not_verified",
      ]);
      const forbiddenErrors = new Set(["download_not_entitled", "forbidden_origin", "origin_not_allowed", "admin_permission_denied"]);
      const notFoundErrors = new Set(["release_not_found", "release_artifact_missing", "order_not_found", "account_not_found", "subscription_not_found", "session_not_found", "device_not_found", "pending_grant_not_found", "device_change_request_not_found"]);
      const conflictErrors = new Set(["pending_grant_already_exists", "pending_grant_not_pending", "device_change_request_not_pending", "device_change_request_changed", "preview_changed"]);
      const status = authErrors.has(message) || message.startsWith("admin_email_not_allowed")
        ? 401
        : forbiddenErrors.has(message)
          ? 403
          : notFoundErrors.has(message)
            ? 404
            : conflictErrors.has(message)
              ? 409
            : message === "rate_limited"
              ? 429
              : message === "rate_limit_unavailable"
                ? 503
              : 400;
      const publicMessage = message === "forbidden_origin" ? "origin_not_allowed" : message;
      return json({ success: false, error: publicMessage }, status, corsHeaders(request, env));
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
  root.innerHTML = '<div id="saturn-policy-panel"><div class="sp-head"><div><div class="sp-title">Policy Controls</div><div class="sp-sub">Live controls backed by api.saturnws.com policy API. Secrets stay server-side.</div></div><button class="sp-btn" data-close>Close</button></div><div class="sp-body"><div class="sp-card"><h3>Global policy</h3><div class="sp-grid"><label class="sp-field">Update mode<select data-global-update-mode><option value="optional">optional</option><option value="mandatory">mandatory</option></select></label><label class="sp-field">Minimum supported version<input data-global-min-version placeholder="1.0.0"></label><label class="sp-field">Kill switch<input data-global-kill type="checkbox"></label><label class="sp-field">Mandatory update<input data-global-mandatory type="checkbox"></label><label class="sp-field">Blocked actions<textarea data-global-blocked placeholder="one action per line"></textarea></label><label class="sp-field">Features JSON<textarea data-global-features>{}</textarea></label></div><div class="sp-row" style="margin-top:10px"><button class="sp-btn primary" data-save-global>Save global policy</button></div></div><div class="sp-card"><h3>Disabled versions</h3><div class="sp-grid"><label class="sp-field">Version<input data-disabled-version placeholder="1.0.0"></label><label class="sp-field">Reason<input data-disabled-reason placeholder="reason"></label></div><div class="sp-row" style="margin-top:10px"><button class="sp-btn" data-disable-version>Disable version</button><button class="sp-btn" data-enable-version>Remove disabled version</button></div></div><div class="sp-card"><h3>User policy override</h3><div class="sp-grid"><label class="sp-field">Email<input data-user-email placeholder="user@example.com"></label><label class="sp-field">Status<select data-user-status><option value="active">active</option><option value="disabled">disabled</option><option value="banned">banned</option><option value="blocked">blocked</option></select></label><label class="sp-field">Plan<input data-user-plan value="default"></label><label class="sp-field">Subscription status<select data-sub-status><option value="">no change</option><option value="active">active</option><option value="expired">expired</option><option value="inactive">inactive</option><option value="canceled">canceled</option></select></label></div><div class="sp-row" style="margin-top:10px"><button class="sp-btn primary" data-save-user>Save user policy</button></div></div><div class="sp-card"><h3>Plan features / blocked actions</h3><div class="sp-grid"><label class="sp-field">Plan ID<input data-plan-id value="default"></label><label class="sp-field">Blocked actions<textarea data-plan-blocked placeholder="one action per line"></textarea></label><label class="sp-field">Features JSON<textarea data-plan-features>{}</textarea></label><label class="sp-field">Limits JSON<textarea data-plan-limits>{}</textarea></label></div><div class="sp-row" style="margin-top:10px"><button class="sp-btn primary" data-save-plan>Save plan</button></div></div><div class="sp-card"><h3>Release catalog visibility</h3><div class="sp-grid"><label class="sp-field">Version<input data-release-version value="1.0.0"></label><label class="sp-field">Visibility<select data-release-visibility><option value="public">public</option><option value="internal">internal</option><option value="archived">archived</option><option value="hidden">hidden</option></select></label><label class="sp-field">Release type<input data-release-type value="public_release"></label><label class="sp-field">Artifact kind<input data-release-kind value="full_setup"></label></div><div class="sp-row" style="margin-top:10px"><button class="sp-btn primary" data-save-release>Save release catalog</button></div></div><div class="sp-card"><h3>Current policy state</h3><div class="sp-status" data-policy-log>Not loaded yet.</div><div class="sp-list" data-release-list></div></div></div></div><button id="saturn-policy-toggle">Policy Controls</button>';
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

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function splitConfiguredOrigins(value) {
  return String(value || "")
    .split(",")
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);
}

function uniqueOrigins(items) {
  return [...new Set(items.map((item) => normalizeOrigin(item)).filter(Boolean))];
}

function adminApiOrigins(env) {
  return uniqueOrigins([
    "https://admin.saturnws.com",
    "https://admin-api.saturnws.com",
    ...splitConfiguredOrigins(env.ADMIN_ORIGIN),
  ]);
}

function publicBrowserOrigins(env) {
  return uniqueOrigins([
    "https://saturnws.com",
    "https://www.saturnws.com",
    ...splitConfiguredOrigins(env.PAYMENTS_ALLOWED_ORIGIN),
  ]);
}

function allowedOriginsForRequest(request, env) {
  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/admin/")) return adminApiOrigins(env);
  if (
    path === "/api/plans/catalog" ||
    path.startsWith("/api/payments/") ||
    path.startsWith("/api/account/downloads/")
  ) {
    return publicBrowserOrigins(env);
  }
  return uniqueOrigins([...adminApiOrigins(env), ...publicBrowserOrigins(env)]);
}

function isRequestOriginAllowed(request, env) {
  const origin = normalizeOrigin(request.headers.get("Origin") || "");
  if (!origin) return true;
  return allowedOriginsForRequest(request, env).includes(origin);
}

function corsHeaders(request, env) {
  const origin = normalizeOrigin(request.headers.get("Origin") || "");
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowedOriginsForRequest(request, env).includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

function rejectForbiddenBrowserOrigin(request, env) {
  const origin = normalizeOrigin(request.headers.get("Origin") || "");
  if (!origin || isRequestOriginAllowed(request, env)) return null;
  return json({ success: false, error: "origin_not_allowed" }, 403, corsHeaders(request, env));
}

function handleOptions(request, env) {
  const originRejection = rejectForbiddenBrowserOrigin(request, env);
  if (originRejection) return originRejection;
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

async function requireAdminIdentity(request, env) {
  const bearer = request.headers.get("Authorization") || "";
  const configuredToken = String(env.ADMIN_API_TOKEN || "").trim();
  if (configuredToken && bearer.startsWith("Bearer ")) {
    const provided = bearer.slice("Bearer ".length).trim();
    if (provided === configuredToken) return { email: "token-admin", uid: "token-admin" };
  }

  await requireAdminLayer1(request, env);

  if (bearer.startsWith("Bearer ")) {
    const idToken = bearer.slice("Bearer ".length).trim();
    if (idToken) {
      const firebaseAdminIdentity = await verifyFirebaseAdminIdentity(idToken, env);
      if (firebaseAdminIdentity?.email) {
        return firebaseAdminIdentity;
      }
    }
  }

  const email = (request.headers.get("cf-access-authenticated-user-email") || "").trim().toLowerCase();
  const allowlist = parseAdminAllowlist(env);
  if (!email || !allowlist.includes(email)) {
    throw new Error("unauthorized");
  }
  return { email, uid: null };
}

async function requireAdmin(request, env) {
  const identity = await requireAdminIdentity(request, env);
  return identity.email;
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

async function verifyFirebaseAdminIdentity(idToken, env) {
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
  const uid = String(user?.localId || "").trim();
  const email = String(user?.email || "").trim().toLowerCase();
  const emailVerified = Boolean(user?.emailVerified);

  if (!email || !uid) throw new Error("firebase_token_invalid");
  if (!emailVerified) throw new Error("firebase_email_not_verified");
  if (!allowlist.includes(email)) throw new Error(`admin_email_not_allowed:${email}`);
  return { email, uid };
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

function optionalBuildId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!/^[0-9A-Za-z._:-]{1,120}$/.test(text)) throw new Error("invalid_build_id");
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

async function requireAdminContext(request, env, permission = "admin:read") {
  const identity = await requireAdminIdentity(request, env);
  const context = adminContext(env, identity);
  requirePermission(context, permission);
  return context;
}

function normalizeTargetList(value) {
  const raw = [];
  if (Array.isArray(value)) {
    raw.push(...value);
  } else if (typeof value === "string") {
    raw.push(...value.split(/[\s,;]+/g));
  }
  const seen = new Set();
  const result = [];
  for (const item of raw) {
    const normalized = String(item || "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result.slice(0, 500);
}

function normalizeReleaseTargets(body) {
  const scope = String(body?.target_scope || body?.targeting_scope || "all").trim().toLowerCase();
  const targets = {
    scope,
    selected: ["selected", "targeted", "users", "custom"].includes(scope),
    user_ids: normalizeTargetList(body?.target_user_ids || body?.user_ids),
    user_emails: normalizeTargetList(body?.target_user_emails || body?.target_emails || body?.user_emails || body?.emails),
    install_ids: normalizeTargetList(body?.target_install_ids || body?.install_ids),
    device_ids: normalizeTargetList(body?.target_device_ids || body?.device_ids),
    hwids: normalizeTargetList(body?.target_hwids || body?.hwids),
  };
  targets.count =
    targets.user_ids.length +
    targets.user_emails.length +
    targets.install_ids.length +
    targets.device_ids.length +
    targets.hwids.length;
  if (targets.count > 0) targets.selected = true;
  if (targets.selected && targets.count <= 0) throw new Error("missing_update_targets");
  return targets;
}

function buildTargetedReleaseRule(channel, channelManifest, targets, adminEmail) {
  const now = new Date().toISOString();
  return {
    id: `targeted-release-${channel}-${channelManifest.version}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    type: "release",
    enabled: true,
    channel,
    label: `Targeted OTA ${channelManifest.version}`,
    user_ids: targets.user_ids,
    user_emails: targets.user_emails,
    install_ids: targets.install_ids,
    device_ids: targets.device_ids,
    hwids: targets.hwids,
    release: channelManifest,
    created_at: now,
    created_by: adminEmail,
  };
}

function mergeTargetedReleaseRule(channelManifest, rule) {
  const existing = safePlainObject(channelManifest);
  const targeting = Array.isArray(existing.targeting) ? existing.targeting : [];
  const nextTargeting = [
    ...targeting.filter((item) => item && typeof item === "object"),
    rule,
  ].slice(-100);
  return {
    ...existing,
    targeting: nextTargeting,
  };
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
  assertArtifactVersionMatchesFilename(file.name, artifactType, version);
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
  const buildId = optionalBuildId(body?.build_id || body?.app_build_id || body?.remote_config?.build_id);
  const forceUpdateDeadline = mandatory ? optionalIsoDate(body?.force_update_deadline) : "";
  const targets = normalizeReleaseTargets(body);

  const metaKey = `meta/${channel}/${version}.json`;
  const metaObj = await env.OTA_BUCKET.get(metaKey);
  if (!metaObj) throw new Error("release_not_uploaded");
  const release = normalizeReleaseMeta(channel, version, await metaObj.json());
  const downloadUrlBase = String(env.PUBLIC_UPDATES_BASE_URL || "https://saturnws.com/updates").replace(/\/+$/, "");
  const { portable: portableRelease, installed: installedRelease, primary: primaryRelease } = uploadedReleaseArtifacts(release);
  if (!primaryRelease) throw new Error("release_artifact_not_uploaded");
  if (installedRelease) {
    assertArtifactVersionMatchesFilename(installedRelease.filename, "installed", version);
  }
  if (portableRelease) {
    assertArtifactVersionMatchesFilename(portableRelease.filename, "portable", version);
  }
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
    !targets.selected &&
    currentChannel &&
    typeof currentChannel === "object" &&
    String(currentChannel.version || "").trim() === version &&
    hasActiveArtifact
  ) {
    throw new Error("same_version_already_active");
  }
  const previousRemoteConfig = safePlainObject(manifest.channels?.[channel]?.remote_config);
  const { build_id: _oldBuildId, app_build_id: _oldAppBuildId, ...previousRemoteConfigWithoutBuildId } = previousRemoteConfig;
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
      ...previousRemoteConfigWithoutBuildId,
      update_mode: updateMode,
    },
    published_at: new Date().toISOString(),
  };
  if (buildId) channelManifest.build_id = buildId;
  if (targets.selected) {
    const targetRule = buildTargetedReleaseRule(channel, channelManifest, targets, adminEmail);
    const nextChannel = mergeTargetedReleaseRule(manifest.channels?.[channel] || {}, targetRule);
    const nextManifest = {
      ...manifest,
      channels: {
        stable: manifest.channels?.stable || {},
        beta: manifest.channels?.beta || {},
        [channel]: nextChannel,
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
      type: "publish_targeted",
      channel,
      version,
      update_mode: updateMode,
      rollout_percent: rolloutPercent,
      target_count: targets.count,
      actor: adminEmail,
      at: new Date().toISOString(),
    });
    return { success: true, targeted: true, target_count: targets.count, manifest: signedManifest };
  }
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
  const version = normalizeVersion(body?.version || "1.0.0");
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
    notes: "Current production baseline. No OTA update is available for this baseline.",
    remote_config: remoteConfig,
    published_at: resetAt,
    release_visibility: "public",
    release_type: "public_release",
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
    notes: "Current production baseline. No public OTA update is available yet.",
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

async function proxyPolicyAdmin(request, env, targetPath, context = null) {
  const token = String(env.POLICY_ADMIN_TOKEN || "").trim();
  if (!token) throw new Error("policy_admin_token_missing");
  const base = String(env.POLICY_API_BASE || "https://api.saturnws.com").trim().replace(/\/+$/, "");
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (context?.email) headers["X-Saturn-Admin-Actor"] = String(context.email).slice(0, 160);
  if (context?.role) headers["X-Saturn-Admin-Role"] = String(context.role).slice(0, 80);
  const idempotencyKey = String(request.headers.get("Idempotency-Key") || "").trim();
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey.slice(0, 160);
  const init = {
    method: request.method,
    headers,
  };
  if (!["GET", "HEAD"].includes(request.method)) {
    headers["Content-Type"] = "application/json; charset=utf-8";
    const body = await request.text();
    init.body = body || "{}";
  }
  const policyRequest = new Request(`${base}${targetPath}`, init);
  const response =
    env.POLICY_WORKER && typeof env.POLICY_WORKER.fetch === "function"
      ? await env.POLICY_WORKER.fetch(policyRequest)
      : await fetch(policyRequest);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { success: false, error: compactUpstreamError(text, response.status, targetPath) };
  }
  if (!response.ok) {
    throw new Error(compactUpstreamError(payload?.error || "", response.status, targetPath));
  }
  return payload || { success: true };
}

async function proxyPolicyAdminDownload(request, env, targetPath, context = null) {
  const token = String(env.POLICY_ADMIN_TOKEN || "").trim();
  if (!token) throw new Error("policy_admin_token_missing");
  const base = String(env.POLICY_API_BASE || "https://api.saturnws.com").trim().replace(/\/+$/, "");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/octet-stream" };
  if (context?.email) headers["X-Saturn-Admin-Actor"] = String(context.email).slice(0, 160);
  if (context?.role) headers["X-Saturn-Admin-Role"] = String(context.role).slice(0, 80);
  const response = env.POLICY_WORKER && typeof env.POLICY_WORKER.fetch === "function"
    ? await env.POLICY_WORKER.fetch(new Request(`https://api.saturnws.com${targetPath}`, { method: "GET", headers }))
    : await fetch(`${base}${targetPath}`, { method: "GET", headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(compactUpstreamError(payload?.error || "", response.status, targetPath));
  }
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("Cache-Control", "private, no-store");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

function compactUpstreamError(message, status, targetPath) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();
  if (lower.startsWith("<!doctype") || lower.startsWith("<html") || lower.includes("site not found")) {
    return `policy_admin_upstream_html_${status}:${targetPath}`;
  }
  return text || `policy_admin_${status}:${targetPath}`;
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

function subscriptionResolutionsByUid(rows) {
  const grouped = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const uid = String(row?.firebase_user_id || "").trim();
    if (!uid) continue;
    const ownedRows = grouped.get(uid) || [];
    ownedRows.push(row);
    grouped.set(uid, ownedRows);
  }
  return new Map(
    [...grouped.entries()].map(([uid, ownedRows]) => [
      uid,
      resolveSubscriptionTruth(ownedRows, { firebaseUid: uid }),
    ]),
  );
}

function subscriptionRowsWithProjection(rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const resolutions = subscriptionResolutionsByUid(sourceRows);
  return sourceRows.map((row) => {
    const uid = String(row?.firebase_user_id || "").trim();
    if (!uid) {
      return {
        ...row,
        identity_authority: "legacy_email_only",
        is_current_projection: false,
        subscription_projection: null,
        integrity_warning: "missing_firebase_uid",
      };
    }
    const resolution = resolutions.get(uid);
    return {
      ...row,
      identity_authority: "firebase_uid",
      is_current_projection: resolution?.currentRow?.id === row?.id,
      subscription_projection: resolution?.projection || null,
      integrity_warning: resolution?.diagnostics?.code || null,
    };
  });
}

async function getAdminDashboard(env) {
  const resources = await Promise.allSettled([
    safeSupabaseRead(env, "account_profiles", "select=firebase_uid,account_status,created_at,updated_at&limit=1000"),
    safeSupabaseRead(env, "account_subscriptions", "select=id,firebase_user_id,status,lifecycle_state,plan_term,is_current,integrity_state,expires_at,period_end_at,updated_at,created_at&limit=1000"),
    safeSupabaseRead(env, "app_sessions", "select=id,user_id,revoked_at,expires_at,last_seen_at,created_at&order=last_seen_at.desc&limit=1000"),
    safeSupabaseRead(env, "crash_logs", "select=id,error_type,message,fingerprint,happened_at,app_version,user_id&order=happened_at.desc&limit=500"),
    safeSupabaseRead(env, "tamper_alerts", "select=id,severity,resolved,happened_at,reason,user_id&resolved=is.false&order=happened_at.desc&limit=200"),
    safeSupabaseRead(env, "admin_activity", "select=id,action,entity,entity_id,admin_email,payload,happened_at&order=happened_at.desc&limit=20"),
  ]);
  const [profiles, subscriptions, sessions, crashes, alerts, activity] = resources.map((result) => result.status === "fulfilled" ? result.value : []);
  const resolutions = [...subscriptionResolutionsByUid(subscriptions).values()];
  const activeUsers = resolutions.filter((item) => ["entitled", "grace_period"].includes(item.projection.entitlement)).length;
  const activeSessions = (Array.isArray(sessions) ? sessions : []).filter((session) => !session.revoked_at && Date.parse(session.expires_at) > Date.now()).length;
  const unresolvedCrashes = new Set((Array.isArray(crashes) ? crashes : []).map((row) => row.fingerprint || `${row.error_type}:${row.message || ""}`)).size;
  const degraded = resources.map((result, index) => result.status === "rejected" ? ["profiles", "subscriptions", "sessions", "crashes", "tamper", "activity"][index] : null).filter(Boolean);
  return {
    success: true,
    kpis: {
      total_users: Array.isArray(profiles) ? profiles.length : 0,
      total_active_users: activeUsers,
      active_sessions: activeSessions,
      unresolved_crash_groups: unresolvedCrashes,
      active_tampering_alerts: Array.isArray(alerts) ? alerts.length : 0,
      total_revenue: null,
    },
    recent_activity: (Array.isArray(activity) ? activity : []).map((item) => ({
      id: item.id,
      timestamp: item.happened_at,
      actor: item.admin_email || null,
      action: item.action,
      target_type: item.entity,
      target_id: item.entity_id,
      outcome: item.payload?.outcome || "completed",
      request_id: item.payload?.request_id || null,
    })),
    degraded_resources: degraded,
  };
}

async function listSubscriptions(url, env) {
  const limit = safeInt(url.searchParams.get("limit"), 50);
  const page = safeInt(url.searchParams.get("page"), 1, 5000);
  const lifecycle = String(url.searchParams.get("lifecycle") || url.searchParams.get("status") || "").trim().toLowerCase();
  const planTerm = String(url.searchParams.get("plan_term") || "").trim().toLowerCase();
  const source = String(url.searchParams.get("source") || "").trim().toLowerCase();
  const current = String(url.searchParams.get("current") || "").trim().toLowerCase();
  const integrity = String(url.searchParams.get("integrity") || "").trim().toLowerCase();
  const search = safeSearchTerm(url.searchParams.get("search"));
  const rows = await safeSupabaseRead(env, "account_subscriptions", "select=*&order=created_at.desc&limit=500");
  let items = subscriptionRowsWithProjection(rows);
  if (lifecycle) items = items.filter((item) => String(item?.lifecycle_state || item?.status || "").trim().toLowerCase() === lifecycle);
  if (planTerm) items = items.filter((item) => String(item?.plan_term || "").trim().toLowerCase() === planTerm);
  if (source) items = items.filter((item) => String(item?.source_type || item?.provider || "").trim().toLowerCase() === source);
  if (current === "current") items = items.filter((item) => item.is_current_projection);
  if (current === "history") items = items.filter((item) => !item.is_current_projection);
  if (integrity === "conflict") items = items.filter((item) => Boolean(item.integrity_warning));
  if (search) {
    const normalizedSearch = search.toLowerCase();
    items = items.filter((item) =>
      [item?.user_email, item?.firebase_user_id, item?.hwid, item?.status, item?.tier, item?.plan]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch)),
    );
  }
  items.sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")) || String(a.id).localeCompare(String(b.id)));
  const offset = (page - 1) * limit;
  return { success: true, items: items.slice(offset, offset + limit), total: items.length, page, limit };
}

async function listAdminUsers(url, env) {
  const limit = safeInt(url.searchParams.get("limit"), 50, 100);
  const page = safeInt(url.searchParams.get("page"), 1, 5000);
  const search = safeSearchTerm(url.searchParams.get("search")).toLowerCase();
  const accountStatus = String(url.searchParams.get("account_status") || "").trim().toLowerCase();
  const verification = String(url.searchParams.get("verification") || "").trim().toLowerCase();
  const subscriptionState = String(url.searchParams.get("subscription") || "").trim().toLowerCase();
  const sort = String(url.searchParams.get("sort") || "created_desc").trim().toLowerCase();
  const [profiles, subscriptions, sessions, loginRequests] = await Promise.all([
    safeSupabaseRead(env, "account_profiles", "select=firebase_uid,normalized_email,display_name,locale,account_status,email_verified,email_verified_at,verification_source,created_at,updated_at&limit=1000"),
    safeSupabaseRead(env, "account_subscriptions", "select=*&order=created_at.desc&limit=1000"),
    safeSupabaseRead(env, "app_sessions", "select=id,user_id,hwid,expires_at,revoked_at,created_at,last_seen_at&order=last_seen_at.desc&limit=2000"),
    safeSupabaseRead(env, "device_login_sessions", "select=id,user_id,hwid,status,expires_at,created_at,authorized_at,consumed_at&order=created_at.desc&limit=2000"),
  ]);
  const subscriptionRows = Array.isArray(subscriptions) ? subscriptions : [];
  const sessionRows = Array.isArray(sessions) ? sessions : [];
  const loginRows = Array.isArray(loginRequests) ? loginRequests : [];
  let items = (Array.isArray(profiles) ? profiles : [])
    .map((profile) => {
      const uid = String(profile?.firebase_uid || "").trim();
      const resolution = resolveSubscriptionTruth(subscriptionRows, {
        firebaseUid: uid,
        email: normalizeEmail(profile?.normalized_email),
      });
      const ownedSessions = sessionRows.filter((row) => row.user_id === uid);
      const ownedLogins = loginRows.filter((row) => row.user_id === uid);
      const devices = new Set([...ownedSessions, ...ownedLogins].map((row) => row.hwid).filter(Boolean));
      const lastActivity = [...ownedSessions.map((row) => row.last_seen_at || row.created_at), ...ownedLogins.map((row) => accessRequestLastEventAt(row))]
        .filter(Boolean).sort().at(-1) || null;
      return {
        ...profile,
        email: normalizeEmail(profile?.normalized_email),
        identity_authority: "firebase_uid",
        subscription_projection: resolution.projection,
        current_subscription: resolution.current,
        subscription_integrity: resolution.diagnostics,
        subscription_presence: resolution.diagnostics.integrity !== "ok" ? "integrity_conflict" : resolution.currentRow ? "active" : resolution.history.length ? "history_only" : "none",
        session_count: ownedSessions.filter((row) => !row.revoked_at && Date.parse(row.expires_at) > Date.now()).length,
        device_count: devices.size,
        last_activity_at: lastActivity,
      };
    })
    .filter((profile) => {
      if (!search) return true;
      return [profile.firebase_uid, profile.email, profile.display_name, profile.account_status, profile.subscription_projection?.entitlement]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  if (accountStatus) items = items.filter((item) => String(item.account_status).toLowerCase() === accountStatus);
  if (verification === "verified") items = items.filter((item) => Boolean(item.email_verified || item.email_verified_at));
  if (verification === "unverified") items = items.filter((item) => !item.email_verified && !item.email_verified_at);
  if (subscriptionState) items = items.filter((item) => item.subscription_presence === subscriptionState);
  items.sort((a, b) => {
    if (sort === "name_asc") return String(a.display_name || a.email).localeCompare(String(b.display_name || b.email));
    if (sort === "activity_desc") return String(b.last_activity_at || "").localeCompare(String(a.last_activity_at || ""));
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
  const total = items.length;
  const offset = (page - 1) * limit;
  return { success: true, items: items.slice(offset, offset + limit), total, page, limit };
}

function manualGrantRequestId() {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeManualGrantOperation(value) {
  const operation = String(value || "").trim().toLowerCase();
  if (!MANUAL_GRANT_OPERATIONS.includes(operation)) throw new Error("invalid_operation");
  return operation;
}

function normalizeManualGrantPlan(value) {
  const plan = String(value || "").trim().toLowerCase();
  if (!plan) throw new Error("missing_plan");
  if (!MANUAL_GRANT_PLAN_INTENTS.includes(plan)) throw new Error("invalid_plan");
  return plan;
}

function dbPlanForManualGrant(planIntent) {
  return planIntent === "annual" ? "yearly" : "monthly";
}

function normalizedManualPlanTerm(planIntent) {
  return planIntent === "manual" ? "custom" : planIntent;
}

function addManualGrantDuration(startIso, amount, unit) {
  const start = new Date(startIso || new Date().toISOString());
  if (!Number.isFinite(start.getTime())) throw new Error("invalid_start");
  const output = new Date(start);
  if (unit === "seconds") output.setUTCSeconds(output.getUTCSeconds() + amount);
  else if (unit === "hours") output.setUTCHours(output.getUTCHours() + amount);
  else if (unit === "days") output.setUTCDate(output.getUTCDate() + amount);
  else if (unit === "weeks") output.setUTCDate(output.getUTCDate() + amount * 7);
  else if (unit === "months") output.setUTCMonth(output.getUTCMonth() + amount);
  else throw new Error("invalid_duration_unit");
  return output.toISOString();
}

function normalizeManualGrantInput(raw, { requireReason = false, requireIdempotency = false } = {}) {
  const body = raw && typeof raw === "object" ? raw : {};
  const operation = normalizeManualGrantOperation(body.operation_type || body.operation);
  const plan = normalizeManualGrantPlan(body.plan || body.plan_intent);
  const targetFirebaseUid = String(body.target_firebase_uid || body.firebase_user_id || body.user_id || "").trim();
  const targetEmail = normalizeEmail(body.target_email || body.user_email || body.email);
  if (!targetFirebaseUid && !targetEmail) throw new Error("missing_target_user");
  const durationMode = String(body.duration_mode || (body.exact_expiry || body.exact_expiry_iso ? "exact" : "duration")).trim().toLowerCase();
  const durationUnit = String(body.duration_unit || body.unit || "days").trim().toLowerCase();
  const durationValue = Number(body.duration_value ?? body.duration ?? 0);
  const exactExpiryRaw = String(body.exact_expiry || body.exact_expiry_iso || body.expires_at || "").trim();
  const timezone = String(body.timezone || "UTC").trim().slice(0, 80) || "UTC";
  const legacyReason = String(body.reason || "").trim();
  const reasonCode = String(body.reason_code || (legacyReason ? "other" : "")).trim().toLowerCase();
  const reasonNote = String(body.reason_note || legacyReason || "").trim().slice(0, 1000);
  const recoveryEvidenceId = String(body.recovery_evidence_id || "").trim();
  const idempotencyKey = String(body.idempotency_key || "").trim();
  const previewHash = String(body.preview_hash || body.preview_reference || "").trim();
  if (requireReason && !reasonCode) throw new Error("missing_reason");
  if (requireReason && !MANUAL_GRANT_REASON_CODES.includes(reasonCode)) throw new Error("invalid_reason_code");
  if (requireReason && reasonCode === "other" && reasonNote.length < 3) throw new Error("reason_note_required");
  if (requireIdempotency && idempotencyKey.length < 8) throw new Error("missing_idempotency_key");
  if (!["duration", "exact", "lifetime"].includes(durationMode)) throw new Error("invalid_duration_mode");
  if (durationMode === "duration") {
    if (!MANUAL_GRANT_UNITS.includes(durationUnit)) throw new Error("invalid_duration_unit");
    if (!Number.isFinite(durationValue) || durationValue <= 0) throw new Error("invalid_duration");
  }
  if (durationMode === "exact") {
    const exactTs = Date.parse(exactExpiryRaw);
    if (!Number.isFinite(exactTs)) throw new Error("invalid_exact_expiry");
    if (exactTs <= Date.now() && operation !== "restore_remaining_time") throw new Error("past_expiry");
  }
  return {
    operation,
    plan,
    target_firebase_uid: targetFirebaseUid,
    target_email: targetEmail,
    duration_mode: plan === "lifetime" ? "lifetime" : durationMode,
    duration_unit: durationUnit,
    duration_value: durationValue,
    exact_expiry: exactExpiryRaw,
    timezone,
    reason: reasonNote,
    reason_code: reasonCode || "admin_grant",
    reason_note: reasonNote || null,
    recovery_evidence_id: recoveryEvidenceId || null,
    idempotency_key: idempotencyKey,
    preview_hash: previewHash,
  };
}

function rowIsUsableSubscription(row) {
  const status = String(row?.status || "").trim().toLowerCase();
  if (!["active", "trialing"].includes(status)) return false;
  if (isUnlimitedExpiry(row?.expires_at)) return true;
  return !isExpiredIso(row?.expires_at);
}

function manualGrantSortRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const lUsable = rowIsUsableSubscription(left) ? "1" : "0";
    const rUsable = rowIsUsableSubscription(right) ? "1" : "0";
    const lUnlimited = isUnlimitedExpiry(left?.expires_at) ? "1" : "0";
    const rUnlimited = isUnlimitedExpiry(right?.expires_at) ? "1" : "0";
    const l = `${lUsable}|${lUnlimited}|${String(left?.expires_at || "")}|${String(left?.updated_at || "")}|${String(left?.created_at || "")}`;
    const r = `${rUsable}|${rUnlimited}|${String(right?.expires_at || "")}|${String(right?.updated_at || "")}|${String(right?.created_at || "")}`;
    return r.localeCompare(l);
  });
}

function summarizeSubscriptionRow(row) {
  if (!row) return null;
  return {
    id: row.id || null,
    firebase_user_id: row.firebase_user_id || null,
    user_email: normalizeEmail(row.user_email) || null,
    plan: row.plan || null,
    tier: row.tier || null,
    status: row.status || null,
    starts_at: row.starts_at || null,
    expires_at: row.expires_at || null,
    provider: row.provider || null,
    is_lifetime: isUnlimitedExpiry(row.expires_at) || Boolean(row?.metadata?.is_unlimited),
    usable: rowIsUsableSubscription(row),
  };
}

function replacementRecoverySeconds(row) {
  if (!row || isUnlimitedExpiry(row?.expires_at)) return 0;
  const expiry = Date.parse(String(row.expires_at || ""));
  if (!Number.isFinite(expiry)) return 0;
  return Math.max(0, Math.floor((expiry - Date.now()) / 1000));
}

async function produceReplacementRecoveryEvidence(env, input, preview, current, adminEmail, requestId) {
  if (input.operation !== "replace_current" || !current?.id) return null;
  const remainingSeconds = replacementRecoverySeconds(current);
  if (remainingSeconds <= 0) return null;
  const evidenceReference = `manual_grant:${requestId}:${current.id}`;
  const payload = {
    firebase_uid: current.firebase_user_id || input.target_firebase_uid || null,
    subscription_id: current.id,
    evidence_type: "subscription_replacement",
    evidence_reference: evidenceReference,
    remaining_seconds: remainingSeconds,
    status: "available",
    expires_at: addManualGrantDuration(new Date().toISOString(), 180, "days"),
    source_type: "manual_grant_replace_current",
    source_reference: evidenceReference,
    original_period_start: current.period_start_at || current.starts_at || null,
    original_period_end: current.period_end_at || current.expires_at || null,
    lost_duration_seconds: remainingSeconds,
    created_by: adminEmail,
    creation_reason: input.reason || "subscription_replacement",
    recovery_operation_id: isUuid(requestId) ? requestId : null,
  };
  payload.integrity_hash = await sha256Hex(stableStringify({
    firebase_uid: payload.firebase_uid,
    subscription_id: payload.subscription_id,
    source_reference: payload.source_reference,
    remaining_seconds: payload.remaining_seconds,
    original_period_end: payload.original_period_end,
  }));
  let inserted = null;
  try {
    inserted = await supabaseRequest(env, "subscription_recovery_ledger", "POST", {
      body: payload,
      prefer: "return=representation",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "error");
    if (!/source_type|source_reference|original_period|lost_duration|created_by|creation_reason|integrity_hash|recovery_operation_id|column/i.test(message)) {
      throw new Error(`recovery_evidence_create_failed:${message}`);
    }
    const legacyPayload = {
      firebase_uid: payload.firebase_uid,
      subscription_id: payload.subscription_id,
      evidence_type: payload.evidence_type,
      evidence_reference: payload.evidence_reference,
      remaining_seconds: payload.remaining_seconds,
      status: payload.status,
      expires_at: payload.expires_at,
    };
    inserted = await supabaseRequest(env, "subscription_recovery_ledger", "POST", {
      body: legacyPayload,
      prefer: "return=representation",
    }).catch((legacyError) => {
      throw new Error(`recovery_evidence_create_failed:${legacyError instanceof Error ? legacyError.message : String(legacyError || "error")}`);
    });
  }
  const row = Array.isArray(inserted) ? inserted[0] : inserted;
  await appendAudit(env, {
    type: "subscription_recovery_evidence_created",
    entity: "subscription_recovery_ledger",
    entity_id: row?.id || null,
    actor: adminEmail,
    payload: {
      request_id: requestId,
      source: "manual_grant_replace_current",
      target_firebase_uid: payload.firebase_uid,
      subscription_id: current.id,
      remaining_seconds: remainingSeconds,
      old_expiry: current.expires_at || null,
      replacement_expiry: preview?.proposed_state?.expires_at || null,
    },
    at: new Date().toISOString(),
  });
  return row || null;
}

function detectManualGrantDuplicateGroups(rows) {
  const byUid = new Map();
  const byEmail = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const uid = String(row?.firebase_user_id || "").trim();
    const email = normalizeEmail(row?.user_email);
    if (uid) byUid.set(uid, (byUid.get(uid) || 0) + 1);
    if (email) byEmail.set(email, (byEmail.get(email) || 0) + 1);
  }
  return {
    firebase_uid: [...byUid.entries()].filter(([, count]) => count > 1).map(([key, count]) => ({ key, count })),
    email: [...byEmail.entries()].filter(([, count]) => count > 1).map(([key, count]) => ({ key, count })),
  };
}

async function resolveManualGrantTarget(env, input) {
  const profileFilter = input.target_firebase_uid
    ? `firebase_uid=eq.${encodeURIComponent(input.target_firebase_uid)}`
    : `normalized_email=eq.${encodeURIComponent(input.target_email)}`;
  const profiles = await safeSupabaseRead(
    env,
    "account_profiles",
    `select=firebase_uid,normalized_email,display_name,locale,account_status,updated_at&${profileFilter}&limit=2`,
  );
  if (!Array.isArray(profiles) || profiles.length === 0) {
    if (!input.target_email) throw new Error("account_not_found");
    return {
      target: {
        firebase_user_id: null,
        user_email: input.target_email,
        display_name: null,
        locale: "ar",
      },
      current: null,
      fallback_latest: null,
      rows: [],
      usable: [],
      duplicate_groups: { firebase_uid: [], email: [] },
      warnings: [],
      blocked: false,
      pending_registration: true,
    };
  }
  if (profiles.length > 1) throw new Error("account_identity_conflict");
  const profile = profiles[0];
  const targetUid = String(profile.firebase_uid || "").trim();
  if (!targetUid) throw new Error("firebase_uid_required");
  if (profile.account_status !== "active") throw new Error("account_not_active");
  const rows = await safeSupabaseRead(
    env,
    "account_subscriptions",
    `select=*&firebase_user_id=eq.${encodeURIComponent(targetUid)}&order=created_at.desc&limit=100`,
  );
  const candidates = Array.isArray(rows) ? rows : [];
  const sorted = manualGrantSortRows(candidates);
  const targetEmail = normalizeEmail(profile.normalized_email);
  const resolution = resolveSubscriptionTruth(sorted, { firebaseUid: targetUid, email: targetEmail });
  const ownedRows = sorted.filter((row) => String(row?.firebase_user_id || "").trim() === targetUid);
  const usable = resolution?.currentRow ? [resolution.currentRow] : [];
  const warnings = [];
  const duplicateGroups = detectManualGrantDuplicateGroups(sorted);
  if (ownedRows.length > 1) warnings.push("historical_rows_found");
  if (resolution?.diagnostics?.code === "multiple_current_subscriptions") warnings.push("multiple_usable_subscriptions");
  if (resolution?.diagnostics?.code) warnings.push(resolution.diagnostics.code);
  if (duplicateGroups.firebase_uid.length || duplicateGroups.email.length) warnings.push("duplicate_identity_rows");
  if (input.target_email) {
    const conflictingEmail = sorted.find((row) => normalizeEmail(row?.user_email) && normalizeEmail(row.user_email) !== targetEmail);
    if (conflictingEmail) warnings.push("target_email_differs_from_existing_row");
  }
  return {
    target: {
      firebase_user_id: targetUid,
      user_email: targetEmail,
      display_name: profile.display_name || null,
      locale: String(profile.locale || "ar").toLowerCase().startsWith("en") ? "en" : "ar",
    },
    current: resolution?.currentRow || null,
    fallback_latest: resolution?.currentRow ? null : ownedRows[0] || null,
    rows: ownedRows,
    usable,
    duplicate_groups: duplicateGroups,
    warnings,
    blocked: resolution?.diagnostics?.integrity === "conflict",
    pending_registration: false,
  };
}

function computeManualGrantProposal(input, resolved) {
  const nowIso = new Date().toISOString();
  const current = resolved.current || (resolved.blocked && resolved.usable.length ? resolved.usable[0] : null);
  if (input.operation === "extend_current" && !current) throw new Error("current_subscription_required");
  if (input.operation === "replace_current" && !current && resolved.usable.length > 0) throw new Error("ambiguous_current_subscription");
  if (input.operation === "restore_remaining_time" && input.duration_mode !== "duration" && input.duration_mode !== "exact") throw new Error("restore_duration_required");
  const startBase = input.operation === "extend_current" && current && !isExpiredIso(current.expires_at) && !isUnlimitedExpiry(current.expires_at)
    ? current.expires_at
    : nowIso;
  const startsAt = input.operation === "extend_current" ? (current?.starts_at || nowIso) : nowIso;
  const expiresAt = input.duration_mode === "lifetime" || input.plan === "lifetime"
    ? UNLIMITED_SUBSCRIPTION_EXPIRY
    : input.duration_mode === "exact"
      ? new Date(input.exact_expiry).toISOString()
      : addManualGrantDuration(startBase, input.duration_value, input.duration_unit);
  return {
    operation: input.operation,
    source: MANUAL_GRANT_SOURCES[input.operation] || "admin_manual",
    plan_intent: input.plan,
    db_plan: dbPlanForManualGrant(input.plan),
    tier: "public",
    starts_at: startsAt,
    expires_at: expiresAt,
    is_lifetime: isUnlimitedExpiry(expiresAt),
    duration: input.duration_mode === "duration" ? { value: input.duration_value, unit: input.duration_unit } : null,
    exact: input.duration_mode === "exact" ? { expires_at: expiresAt, timezone: input.timezone } : null,
    resulting_entitlement: isUnlimitedExpiry(expiresAt) || Date.parse(expiresAt) > Date.now() ? "entitled" : "not_entitled",
    affected_rows: current ? [current.id] : [],
  };
}

function computePendingRegistrationGrantProposal(input) {
  if (input.operation !== "start_from_now") throw new Error("pending_grant_requires_start_from_registration");
  const exactExpiry = input.duration_mode === "exact" ? new Date(input.exact_expiry).toISOString() : null;
  return {
    operation: input.operation,
    source: "pending_admin_grant",
    plan_intent: input.plan,
    db_plan: dbPlanForManualGrant(input.plan),
    tier: "public",
    starts_at: null,
    expires_at: exactExpiry,
    is_lifetime: input.duration_mode === "lifetime" || input.plan === "lifetime",
    duration: input.duration_mode === "duration" ? { value: input.duration_value, unit: input.duration_unit } : null,
    exact: input.duration_mode === "exact" ? { expires_at: exactExpiry, timezone: input.timezone } : null,
    resulting_entitlement: "pending_registration",
    affected_rows: [],
    pending_registration: true,
  };
}

async function buildManualGrantPreview(env, rawInput, adminEmail, options = {}) {
  const input = normalizeManualGrantInput(rawInput, options);
  const resolved = await resolveManualGrantTarget(env, input);
  if (input.operation === "restore_remaining_time" && !resolved.pending_registration) {
    if (!input.recovery_evidence_id || !isUuid(input.recovery_evidence_id)) throw new Error("recovery_evidence_required");
    const evidence = await safeSupabaseRead(
      env,
      "subscription_recovery_ledger",
      `select=id,firebase_uid,remaining_seconds,status,expires_at,evidence_type,evidence_reference&id=eq.${encodeURIComponent(input.recovery_evidence_id)}&firebase_uid=eq.${encodeURIComponent(resolved.target.firebase_user_id)}&status=eq.available&limit=1`,
    );
    const recovery = Array.isArray(evidence) ? evidence[0] : null;
    if (!recovery || (recovery.expires_at && Date.parse(recovery.expires_at) <= Date.now())) throw new Error("recovery_evidence_unavailable");
    input.duration_mode = "duration";
    input.duration_value = Number(recovery.remaining_seconds);
    input.duration_unit = "seconds";
    input.reason_code = "subscription_recovery";
  }
  const warnings = [...resolved.warnings];
  if (resolved.blocked) warnings.push("operation_blocked_until_duplicate_usable_rows_are_resolved");
  const proposal = resolved.pending_registration
    ? computePendingRegistrationGrantProposal(input)
    : resolved.blocked
    ? {
        operation: input.operation,
        source: MANUAL_GRANT_SOURCES[input.operation] || "admin_manual",
        plan_intent: input.plan,
        db_plan: dbPlanForManualGrant(input.plan),
        tier: "public",
        starts_at: null,
        expires_at: null,
        is_lifetime: false,
        duration: null,
        exact: null,
        resulting_entitlement: "integrity_conflict",
        affected_rows: [],
      }
    : computeManualGrantProposal(input, resolved);
  const previewPayload = {
    target: resolved.target,
    current_subscription: summarizeSubscriptionRow(resolved.current),
    latest_subscription: summarizeSubscriptionRow(resolved.fallback_latest),
    history_summary: {
      total_rows: resolved.rows.length,
      usable_rows: resolved.usable.length,
      historical_rows: Math.max(0, resolved.rows.length - resolved.usable.length),
      duplicate_groups: resolved.duplicate_groups,
    },
    requested_operation: {
      operation: input.operation,
      plan: input.plan,
      duration_mode: input.duration_mode,
      duration_value: input.duration_value || null,
      duration_unit: input.duration_unit || null,
      exact_expiry: input.exact_expiry || null,
      timezone: input.timezone,
      source: proposal.source,
      reason_code: input.reason_code,
      reason_note: input.reason_note,
    },
    proposed_state: proposal,
    affected_rows: proposal.affected_rows,
    warnings,
    blocked: resolved.blocked,
    pending_registration: resolved.pending_registration,
    admin: adminEmail || null,
  };
  const previewHash = await sha256Hex(stableStringify({
    target: previewPayload.target,
    current_id: previewPayload.current_subscription?.id || null,
    current_updated_at: previewPayload.current_subscription?.updated_at || null,
    latest_id: previewPayload.latest_subscription?.id || null,
    latest_updated_at: previewPayload.latest_subscription?.updated_at || null,
    requested_operation: previewPayload.requested_operation,
    affected_rows: previewPayload.affected_rows,
    blocked: previewPayload.blocked,
    pending_registration: previewPayload.pending_registration,
  }));
  return { input, resolved, preview: { ...previewPayload, preview_hash: previewHash } };
}

async function previewManualSubscriptionGrant(request, env, adminEmail) {
  const body = await request.json();
  const { preview } = await buildManualGrantPreview(env, body, adminEmail);
  return { success: true, preview };
}

async function loadManualGrantIdempotency(env, keyHash) {
  if (!hasOtaBucket(env)) return null;
  const stored = await env.OTA_BUCKET.get(`admin/manual-grants/idempotency/${keyHash}.json`);
  if (!stored) return null;
  try {
    return await stored.json();
  } catch {
    return null;
  }
}

async function saveManualGrantIdempotency(env, keyHash, payload) {
  if (!hasOtaBucket(env)) return;
  await env.OTA_BUCKET.put(`admin/manual-grants/idempotency/${keyHash}.json`, JSON.stringify(payload, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

function manualGrantMetadata(input, preview, adminEmail, requestId) {
  return {
    manual_grant: {
      request_id: requestId,
      operation: input.operation,
      source: preview.proposed_state.source,
      plan_intent: input.plan,
      duration_mode: input.duration_mode,
      duration_value: input.duration_value || null,
      duration_unit: input.duration_unit || null,
      exact_expiry: input.exact_expiry || null,
      timezone: input.timezone,
      reason: input.reason,
      reason_code: input.reason_code,
      reason_note: input.reason_note,
      recovery_evidence_id: input.recovery_evidence_id,
      preview_hash: input.preview_hash,
      applied_by: adminEmail,
      applied_at: new Date().toISOString(),
    },
    is_unlimited: preview.proposed_state.is_lifetime,
  };
}

async function enqueueManualSubscriptionEmail(env, input) {
  const url = String(env.ADMIN_EMAIL_ENQUEUE_URL || "").trim();
  const token = String(env.ADMIN_EMAIL_ENQUEUE_TOKEN || "").trim();
  const recipient = normalizeEmail(input.recipient);
  if (!url || !token) return { queued: false, skipped: "subscription_email_not_configured" };
  if (!recipient) return { queued: false, skipped: "recipient_missing" };
  const eventType = input.pending ? "billing.subscription_grant_reserved" : "billing.subscription_granted";
  try {
    const request = new Request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        event_type: eventType,
        idempotency_key: `manual-subscription-email:${eventType}:${input.requestId}`,
        user_id: input.firebaseUid || "",
        recipient,
        locale: String(input.locale || "ar").toLowerCase().startsWith("en") ? "en" : "ar",
        payload: {
          reason_code: input.reasonCode,
          plan_term: input.planTerm,
          operation: input.operation,
          expires_at: input.expiresAt || null,
          is_lifetime: Boolean(input.isLifetime),
          action_url: input.pending
            ? "https://saturnws.com/account/signup"
            : "https://saturnws.com/account?section=subscription",
        },
      }),
    });
    const response = env.POLICY_WORKER ? await env.POLICY_WORKER.fetch(request) : await fetch(request);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { queued: false, skipped: `subscription_email_enqueue_${response.status}` };
    return { queued: Boolean(payload?.job_id), skipped: payload?.job_id ? undefined : "subscription_email_suppressed" };
  } catch {
    return { queued: false, skipped: "subscription_email_enqueue_failed" };
  }
}

async function createPendingSubscriptionGrant(env, input, preview, adminEmail, requestId, keyHash) {
  const existingForEmail = await safeSupabaseRead(
    env,
    "pending_subscription_grants",
    `select=id,status,request_id,normalized_email&normalized_email=eq.${encodeURIComponent(input.target_email)}&status=eq.pending&limit=1`,
  );
  if (Array.isArray(existingForEmail) && existingForEmail.length) throw new Error("pending_grant_already_exists");

  const claimDeadline = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  let rows;
  try {
    rows = await supabaseRequest(env, "pending_subscription_grants", "POST", {
      query: "select=*",
      body: {
        normalized_email: input.target_email,
        status: "pending",
        plan_term: normalizedManualPlanTerm(input.plan),
        legacy_plan: preview.proposed_state.db_plan,
        tier: preview.proposed_state.tier,
        duration_mode: input.duration_mode,
        duration_value: input.duration_mode === "duration" ? input.duration_value : null,
        duration_unit: input.duration_mode === "duration" ? input.duration_unit : null,
        exact_expiry: input.duration_mode === "exact" ? input.exact_expiry : null,
        claim_deadline: claimDeadline,
        reason_code: input.reason_code,
        reason_note: input.reason_note,
        created_by: adminEmail,
        request_id: requestId,
        idempotency_key_hash: keyHash,
        preview_hash: preview.preview_hash,
      },
      prefer: "return=representation",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("duplicate key") || message.includes("unique constraint")) {
      throw new Error("pending_grant_already_exists");
    }
    throw new Error("pending_grant_create_failed");
  }
  const pendingGrant = Array.isArray(rows) ? rows[0] : rows;
  if (!pendingGrant?.id) throw new Error("pending_grant_create_failed");
  await appendAudit(env, {
    type: "pending_subscription_grant_created",
    entity: "pending_subscription_grants",
    entity_id: pendingGrant.id,
    actor: adminEmail,
    payload: {
      request_id: requestId,
      target_email: input.target_email,
      plan: input.plan,
      duration_mode: input.duration_mode,
      duration_value: input.duration_mode === "duration" ? input.duration_value : null,
      duration_unit: input.duration_mode === "duration" ? input.duration_unit : null,
      reason_code: input.reason_code,
      claim_deadline: claimDeadline,
      result: "pending_registration",
    },
    at: new Date().toISOString(),
  });
  const notification = await enqueueManualSubscriptionEmail(env, {
    pending: true,
    requestId,
    recipient: input.target_email,
    firebaseUid: null,
    locale: preview.target?.locale || "ar",
    reasonCode: input.reason_code,
    planTerm: normalizedManualPlanTerm(input.plan),
    operation: input.operation,
    expiresAt: preview.proposed_state?.expires_at || null,
    isLifetime: Boolean(preview.proposed_state?.is_lifetime),
  });
  return {
    success: true,
    request_id: requestId,
    item: null,
    pending_grant: pendingGrant,
    preview,
    auto_authorized_requests: 0,
    notification,
  };
}

async function executeManualSubscriptionGrant(request, env, adminEmail) {
  const requestId = manualGrantRequestId();
  const body = await request.json();
  const normalizedForIdempotency = normalizeManualGrantInput(body, { requireReason: true, requireIdempotency: true });
  const keyHash = await sha256Hex(`manual-grant:${normalizedForIdempotency.idempotency_key}`);
  const existingIdempotent = await loadManualGrantIdempotency(env, keyHash);
  if (existingIdempotent?.success) return { ...existingIdempotent, idempotent_replay: true };
  const { input, resolved, preview } = await buildManualGrantPreview(env, body, adminEmail, { requireReason: true, requireIdempotency: true });
  if (preview.blocked) throw new Error("multiple_usable_subscriptions");
  if (input.preview_hash && input.preview_hash !== preview.preview_hash) throw new Error("preview_changed");

  if (preview.pending_registration) {
    const result = await createPendingSubscriptionGrant(env, input, preview, adminEmail, requestId, keyHash);
    await saveManualGrantIdempotency(env, keyHash, result);
    return result;
  }

  const targetUid = input.target_firebase_uid || resolved.target.firebase_user_id;
  if (!targetUid) throw new Error("firebase_uid_required");
  const targetEmail = input.target_email || resolved.target.user_email;
  if (!targetEmail) throw new Error("target_email_required");
  const current = resolved.current;
  const metadataPatch = manualGrantMetadata(input, preview, adminEmail, requestId);
  const grantRpc = input.operation === "restore_remaining_time"
    ? "rpc/admin_restore_subscription_time"
    : "rpc/apply_manual_subscription_grant";
  const grantBody = input.operation === "restore_remaining_time"
    ? {
        p_evidence_id: input.recovery_evidence_id,
        p_target_uid: targetUid,
        p_target_email: targetEmail,
        p_plan_term: normalizedManualPlanTerm(input.plan),
        p_legacy_plan: preview.proposed_state.db_plan,
        p_tier: preview.proposed_state.tier,
        p_metadata: metadataPatch,
        p_feature_payload: current?.feature_payload && typeof current.feature_payload === "object" ? current.feature_payload : {},
        p_hwid: current?.hwid || null,
        p_bound_at: current?.bound_at || null,
        p_current_id: current?.id || null,
        p_actor_email: adminEmail,
        p_request_id: requestId,
      }
    : {
        p_target_uid: targetUid,
        p_target_email: targetEmail,
        p_operation: input.operation,
        p_plan_term: normalizedManualPlanTerm(input.plan),
        p_legacy_plan: preview.proposed_state.db_plan,
        p_tier: preview.proposed_state.tier,
        p_starts_at: preview.proposed_state.starts_at,
        p_expires_at: preview.proposed_state.expires_at,
        p_is_lifetime: preview.proposed_state.is_lifetime,
        p_metadata: metadataPatch,
        p_feature_payload: current?.feature_payload && typeof current.feature_payload === "object" ? current.feature_payload : {},
        p_hwid: current?.hwid || null,
        p_bound_at: current?.bound_at || null,
        p_current_id: current?.id || null,
      };
  const changed = await supabaseRequest(env, grantRpc, "POST", {
    body: grantBody,
  });

  const item = Array.isArray(changed) ? changed[0] : changed;
  const recoveryEvidence = await produceReplacementRecoveryEvidence(env, input, preview, current, adminEmail, requestId);
  const autoAuthorized = isActiveSubscription(item)
    ? await authorizeMatchingAccessRequests(env, item).catch(() => 0)
    : 0;
  const result = {
    success: true,
    request_id: requestId,
    item,
    preview,
    recovery_evidence_created: recoveryEvidence ? {
      id: recoveryEvidence.id || null,
      remaining_seconds: recoveryEvidence.remaining_seconds || null,
      status: recoveryEvidence.status || null,
    } : null,
    auto_authorized_requests: autoAuthorized,
  };
  await appendAudit(env, {
    type: "subscription_manual_grant",
    entity: "account_subscriptions",
    entity_id: item?.id || null,
    actor: adminEmail,
    payload: {
      request_id: requestId,
      idempotency_key_hash: keyHash,
      target_firebase_uid: targetUid,
      target_email: targetEmail,
      operation: input.operation,
      source: preview.proposed_state.source,
      reason: input.reason,
      old_canonical_state: preview.current_subscription,
      proposed_state: preview.proposed_state,
      final_state: summarizeSubscriptionRow(item),
      recovery_evidence_created: recoveryEvidence ? recoveryEvidence.id || true : false,
      affected_row_ids: preview.affected_rows,
      old_expiry: preview.current_subscription?.expires_at || null,
      new_expiry: item?.expires_at || null,
      plan: input.plan,
      duration: preview.requested_operation.duration_value
        ? { value: preview.requested_operation.duration_value, unit: preview.requested_operation.duration_unit }
        : null,
      warnings: preview.warnings,
      result: "success",
      auto_authorized_requests: autoAuthorized,
    },
    at: new Date().toISOString(),
  });
  result.notification = await enqueueManualSubscriptionEmail(env, {
    pending: false,
    requestId,
    recipient: targetEmail,
    firebaseUid: targetUid,
    locale: resolved.target.locale || "ar",
    reasonCode: input.reason_code,
    planTerm: normalizedManualPlanTerm(input.plan),
    operation: input.operation,
    expiresAt: item?.period_end_at || item?.expires_at || null,
    isLifetime: Boolean(preview.proposed_state.is_lifetime),
  });
  await saveManualGrantIdempotency(env, keyHash, result);
  return result;
}

async function listPendingSubscriptionGrants(url, env) {
  const status = String(url.searchParams.get("status") || "pending").trim().toLowerCase();
  if (!["pending", "claimed", "cancelled", "expired", "all"].includes(status)) throw new Error("invalid_pending_grant_status");
  const limit = safeInt(url.searchParams.get("limit"), 100, 200);
  const filter = status === "all" ? "" : `&status=eq.${encodeURIComponent(status)}`;
  let items;
  try {
    items = await safeSupabaseRead(
      env,
      "pending_subscription_grants",
      `select=id,normalized_email,status,plan_term,duration_mode,duration_value,duration_unit,exact_expiry,claim_deadline,reason_code,reason_note,created_by,claimed_by_uid,resulting_subscription_id,claimed_at,cancelled_at,cancelled_by,cancellation_reason,created_at,updated_at${filter}&order=created_at.desc&limit=${limit}`,
    );
  } catch {
    throw new Error("pending_grant_list_failed");
  }
  return { success: true, items: Array.isArray(items) ? items : [] };
}

async function cancelPendingSubscriptionGrant(request, env, adminEmail) {
  const body = await request.json();
  const grantId = String(body?.grant_id || body?.id || "").trim();
  const reason = String(body?.reason || "").trim().slice(0, 500);
  if (!isUuid(grantId)) throw new Error("pending_grant_not_found");
  if (reason.length < 3) throw new Error("cancellation_reason_required");
  let rows;
  try {
    rows = await supabaseRequest(env, "pending_subscription_grants", "PATCH", {
      query: `id=eq.${encodeURIComponent(grantId)}&status=eq.pending&select=*`,
      body: {
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: adminEmail,
        cancellation_reason: reason,
      },
      prefer: "return=representation",
    });
  } catch {
    throw new Error("pending_grant_cancel_failed");
  }
  const item = Array.isArray(rows) ? rows[0] : rows;
  if (!item?.id) throw new Error("pending_grant_not_pending");
  await appendAudit(env, {
    type: "pending_subscription_grant_cancelled",
    entity: "pending_subscription_grants",
    entity_id: item.id,
    actor: adminEmail,
    payload: { reason, target_email: item.normalized_email, result: "cancelled" },
    at: new Date().toISOString(),
  });
  return { success: true, item };
}

async function createSubscription(request, env, adminEmail) {
  const body = await request.json();
  const userEmail = String(body?.user_email || body?.email || "").trim().toLowerCase();
  const firebaseUserId = String(body?.firebase_user_id || "").trim() || null;
  const hwid = String(body?.hwid || "").trim() || null;
  const plan = String(body?.plan || "").trim().toLowerCase();
  const tier = String(body?.tier || "public").trim().toLowerCase();
  const { expiresAt, isUnlimited } = normalizeSubscriptionExpiryInput(body);
  const startsAt = body?.starts_at ? String(body.starts_at).trim() : new Date().toISOString();
  if (!userEmail || !firebaseUserId || !plan || !expiresAt) throw new Error("missing_subscription_fields");
  if (!["monthly", "yearly"].includes(plan)) throw new Error("invalid_plan");
  const existing = await findExistingSubscriptionForIdentity(env, { userEmail, firebaseUserId });
  const existingMetadata = existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
  const payload = {
    firebase_user_id: firebaseUserId || existing?.firebase_user_id || null,
    user_email: userEmail,
    plan,
    tier,
    status: "active",
    lifecycle_state: "active",
    plan_term: isUnlimited ? "lifetime" : plan === "yearly" ? "annual" : "monthly",
    renewal_state: isUnlimited ? "not_applicable" : "manual",
    source_type: "admin_manual",
    starts_at: startsAt,
    expires_at: expiresAt,
    period_start_at: startsAt,
    period_end_at: isUnlimited ? null : expiresAt,
    cancel_at_period_end: false,
    is_current: true,
    integrity_state: "ok",
    metadata_version: 1,
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
  if (body?.status) {
    patch.status = String(body.status).trim().toLowerCase();
    patch.lifecycle_state = patch.status === "canceled" ? "cancelled" : patch.status;
    patch.is_current = ["active", "past_due"].includes(patch.status);
  }
  if (body?.tier) patch.tier = String(body.tier).trim().toLowerCase();
  if (body?.hwid !== undefined) patch.hwid = body.hwid ? String(body.hwid).trim() : null;
  const expiryInput = normalizeSubscriptionExpiryInput(body);
  if (expiryInput.expiresAt) {
    patch.expires_at = expiryInput.expiresAt;
    patch.period_end_at = expiryInput.isUnlimited ? null : expiryInput.expiresAt;
    if (expiryInput.isUnlimited) {
      patch.plan_term = "lifetime";
      patch.renewal_state = "not_applicable";
    }
  }
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
  const autoAuthorized = isActiveSubscription(item)
    ? await authorizeMatchingAccessRequests(env, item).catch(() => 0)
    : 0;
  await appendAudit(env, {
    type: "subscription_update",
    entity: "account_subscriptions",
    entity_id: subscriptionId,
    actor: adminEmail,
    payload: { ...patch, auto_authorized_requests: autoAuthorized },
    at: new Date().toISOString(),
  });
  return { success: true, item, auto_authorized_requests: autoAuthorized };
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
    entity_id: item?.id || null,
    actor: adminEmail,
    payload: { code_hint: payload.code.slice(-4), discount_type: payload.discount_type, private_tier: payload.is_private_tier_trigger },
    at: new Date().toISOString(),
  });
  return { success: true, item };
}

async function updatePromoCodeState(promoId, request, env, adminEmail) {
  if (!isUuid(promoId)) throw new Error("invalid_promo_code");
  const body = await request.json();
  const active = Boolean(body?.active);
  const reason = String(body?.reason || "").trim().slice(0, 1000);
  if (reason.length < 3) throw new Error("reason_required");
  const rows = await supabaseRequest(env, "promo_codes", "PATCH", {
    query: `id=eq.${encodeURIComponent(promoId)}&select=id,code,discount_type,discount_value,is_active,max_uses,used_count,expires_at`,
    body: { is_active: active, updated_at: new Date().toISOString() },
    prefer: "return=representation",
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error("promo_code_not_found");
  await appendAudit(env, { type: active ? "promo_code_activated" : "promo_code_deactivated", entity: "promo_codes", entity_id: promoId, actor: adminEmail, payload: { reason }, at: new Date().toISOString() });
  return { success: true, item: rows[0] };
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
  if (!publicItems.some((item) => String(item?.version || "") === "1.0.0")) {
    publicItems.unshift({
      id: "baseline-1.0.0",
      version: "1.0.0",
      channel: "beta",
      release_notes: "First public baseline.",
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

async function getAdminCommerceOverview(env) {
  const [plans, orders, integrityEvents, releases, accessLogs] = await Promise.all([
    safeSupabaseRead(env, "commercial_plans", "select=plan_id,version,display_name,term,price_minor,original_price_minor,currency,active,public_visible,purchasable,provider,trial_days,config_status,updated_at&order=display_order.asc,plan_id.asc,version.desc&limit=100"),
    safeSupabaseRead(env, "commercial_orders", "select=id,firebase_uid,plan_id,plan_version,status,currency,amount_minor,provider,created_at,updated_at,expires_at&order=created_at.desc&limit=100"),
    safeSupabaseRead(env, "subscription_integrity_events", "select=id,firebase_uid,subscription_id,code,severity,source,resolved_at,created_at&resolved_at=is.null&order=created_at.desc&limit=100"),
    safeSupabaseRead(env, "download_releases", "select=id,version,channel,platform,architecture,filename,size_bytes,sha256,active,published_at,created_at&order=created_at.desc&limit=100"),
    safeSupabaseRead(env, "download_access_logs", "select=id,release_id,firebase_uid,decision,entitlement,request_id,created_at&order=created_at.desc&limit=100"),
  ]);
  const providerStatus = {
    stripe: Boolean(String(env.STRIPE_SECRET_KEY || "").trim()),
    nowpayments: Boolean(String(env.NOWPAYMENTS_API_KEY || "").trim()),
  };
  const planRows = Array.isArray(plans) ? plans : [];
  const orderRows = Array.isArray(orders) ? orders : [];
  return {
    success: true,
    provider_status: providerStatus,
    checkout_available: planRows.some((plan) => {
      const provider = String(plan?.provider || "").trim().toLowerCase();
      return Boolean(plan?.active && plan?.public_visible && plan?.purchasable && provider && providerStatus[provider]);
    }),
    reconciliation_status: orderRows.length ? "provider_integration_required" : "no_provider_orders",
    plans: planRows,
    orders: orderRows,
    integrity_events: Array.isArray(integrityEvents) ? integrityEvents : [],
    releases: Array.isArray(releases) ? releases : [],
    download_access_logs: Array.isArray(accessLogs) ? accessLogs : [],
  };
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
    `select=id,happened_at,user_id,subscription_id,hwid,device_name,windows_version,cpu,gpu,ram_gb,error_type,message,stack_trace,app_version,tool_channel,fingerprint&order=happened_at.desc&limit=${limit}&offset=${offset}${filters.length ? `&${filters.join("&")}` : ""}`,
  );
  const items = (Array.isArray(data) ? data : []).map((row) => ({
    ...row,
    message: sanitizeCrashString(row.message || ""),
    stack_trace: sanitizeCrashString(String(row.stack_trace || "").split(/\r?\n/).slice(0, 12).join("\n")),
  }));
  return { success: true, items, page, limit };
}

function isExpiredIso(value) {
  const ts = Date.parse(String(value || ""));
  return Number.isFinite(ts) ? ts <= Date.now() : false;
}

function isActiveSubscription(row) {
  return Boolean(row) && String(row?.status || "").toLowerCase() === "active" && !isExpiredIso(row?.expires_at);
}

function accessRequestLastEventAt(row) {
  return String(row?.consumed_at || row?.authorized_at || row?.created_at || row?.expires_at || "");
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
  const uid = String(firebaseUserId || "").trim();
  if (!uid) return null;
  const rows = await safeSupabaseRead(
    env,
    "account_subscriptions",
    `select=*&firebase_user_id=eq.${encodeURIComponent(uid)}&order=created_at.desc&limit=50`,
  );
  const resolution = resolveSubscriptionTruth(Array.isArray(rows) ? rows : [], {
    firebaseUid: uid,
    email: normalizeEmail(userEmail),
  });
  if (resolution.diagnostics.integrity === "conflict") throw new Error("subscription_integrity_conflict");
  return resolution.currentRow;
}

function pickMatchingSubscription(row, subscriptions) {
  if (!Array.isArray(subscriptions) || !subscriptions.length) return null;
  const userId = String(row?.user_id || "").trim();
  if (!userId) return null;
  const resolution = resolveSubscriptionTruth(subscriptions, {
    firebaseUid: userId,
    email: normalizeEmail(row?.user_email),
  });
  return resolution.diagnostics.integrity === "ok" ? resolution.currentRow : null;
}

function accessRequestNeedsAttention(row, subscription) {
  if (isActiveSubscription(subscription)) return false;
  const status = String(row?.status || "").trim().toLowerCase();
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

  const orderedSubscriptions = Array.isArray(subscriptionRows) ? subscriptionRows : [];

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
  const statusFilter = String(url.searchParams.get("status") || "").trim().toLowerCase();
  const search = safeSearchTerm(url.searchParams.get("search")).toLowerCase();
  const [data, states] = await Promise.all([
    safeSupabaseRead(env, "crash_logs", `select=id,happened_at,user_id,subscription_id,hwid,error_type,message,stack_trace,app_version,fingerprint&order=happened_at.desc&limit=${limit}`),
    safeSupabaseRead(env, "admin_crash_group_state", "select=fingerprint,status,assignee,note,updated_by,updated_at&limit=1000"),
  ]);
  const statesByFingerprint = new Map((Array.isArray(states) ? states : []).map((state) => [state.fingerprint, state]));
  const groups = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    const fingerprint = await crashFingerprint(row);
    const existing = groups.get(fingerprint);
    if (!existing) {
      const state = statesByFingerprint.get(fingerprint) || {};
      groups.set(fingerprint, {
        fingerprint,
        count: 1,
        first_seen_at: row.happened_at,
        last_seen_at: row.happened_at,
        error_type: row.error_type,
        message: sanitizeCrashString(row.message || ""),
        status: state.status || "open",
        assignee: state.assignee || null,
        note: state.note || null,
        state_updated_at: state.updated_at || null,
        affected_hwids: new Set(row.hwid ? [row.hwid] : []),
        affected_users: new Set(row.user_id || row.subscription_id ? [row.user_id || row.subscription_id] : []),
        affected_versions: new Set(row.app_version ? [row.app_version] : []),
      });
      continue;
    }
    existing.count += 1;
    if (String(row.happened_at || "") > String(existing.last_seen_at || "")) {
      existing.last_seen_at = row.happened_at;
    }
    if (String(row.happened_at || "") < String(existing.first_seen_at || "")) existing.first_seen_at = row.happened_at;
    if (row.hwid) existing.affected_hwids.add(row.hwid);
    const userKey = row.user_id || row.subscription_id;
    if (userKey) existing.affected_users.add(userKey);
    if (row.app_version) existing.affected_versions.add(row.app_version);
  }
  let items = [...groups.values()].map((group) => ({
    ...group,
    affected_device_count: group.affected_hwids.size,
    affected_user_count: group.affected_users.size,
    affected_versions: [...group.affected_versions].sort(),
    affected_hwids: undefined,
    affected_users: undefined,
  }));
  if (statusFilter) items = items.filter((group) => group.status === statusFilter);
  if (search) items = items.filter((group) => [group.error_type, group.message, group.fingerprint, group.assignee].filter(Boolean).some((value) => String(value).toLowerCase().includes(search)));
  return {
    success: true,
    items: items
      .sort((a, b) => String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || "")))
      .slice(0, safeInt(url.searchParams.get("groups"), 50, 200)),
  };
}

async function listAuditLog(url, env) {
  const limit = safeInt(url.searchParams.get("limit"), 100, 500);
  const page = safeInt(url.searchParams.get("page"), 1, 5000);
  const offset = (page - 1) * limit;
  const action = safeSearchTerm(url.searchParams.get("action"));
  const actor = safeSearchTerm(url.searchParams.get("actor"));
  const targetType = safeSearchTerm(url.searchParams.get("target_type"));
  const from = String(url.searchParams.get("from") || "").trim();
  const to = String(url.searchParams.get("to") || "").trim();
  const filters = [];
  if (action) filters.push(`action=ilike.${encodeURIComponent(`*${action}*`)}`);
  if (actor) filters.push(`admin_email=ilike.${encodeURIComponent(`*${actor}*`)}`);
  if (targetType) filters.push(`entity=eq.${encodeURIComponent(targetType)}`);
  if (Number.isFinite(Date.parse(from))) filters.push(`happened_at=gte.${encodeURIComponent(new Date(from).toISOString())}`);
  if (Number.isFinite(Date.parse(to))) filters.push(`happened_at=lte.${encodeURIComponent(new Date(to).toISOString())}`);
  const rows = await safeSupabaseRead(env, "admin_activity", `select=id,action,entity,entity_id,admin_email,payload,happened_at&order=happened_at.desc&limit=${limit}&offset=${offset}${filters.length ? `&${filters.join("&")}` : ""}`);
  if (Array.isArray(rows) && rows.length) {
    return {
      success: true,
      items: rows.map((row) => ({
        id: row.id,
        timestamp: row.happened_at,
        actor: row.admin_email || null,
        actor_role: row.payload?.actor_role || null,
        action: row.action,
        target_type: row.entity,
        target_id: row.entity_id,
        request_id: row.payload?.request_id || null,
        reason_code: row.payload?.reason_code || null,
        reason_note: row.payload?.reason_note || null,
        outcome: row.payload?.outcome || "completed",
        previous_summary: row.payload?.previous_summary || null,
        resulting_summary: row.payload?.resulting_summary || null,
        source_service: "admin_worker",
      })),
      page,
      limit,
      retention: "Supabase admin_activity is canonical; R2 is a compatibility fallback for legacy events.",
    };
  }
  const audit = await loadAudit(env);
  return {
    success: true,
    items: audit
      .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
      .slice(offset, offset + limit)
      .map((row, index) => ({
        id: row.id || `legacy-${page}-${index}`,
        timestamp: row.at || null,
        actor: row.actor || null,
        action: row.type || "legacy_admin_event",
        target_type: row.entity || null,
        target_id: row.entity_id || null,
        outcome: "completed",
        source_service: "r2_legacy_audit",
      })),
    page,
    limit,
    retention: "Supabase admin_activity is canonical; R2 is a compatibility fallback for legacy events.",
  };
}

async function updateCrashGroupState(fingerprint, request, env, context) {
  if (!/^[a-f0-9]{16,128}$/i.test(fingerprint)) throw new Error("invalid_crash_fingerprint");
  const body = await request.json();
  const status = String(body?.status || "").trim().toLowerCase();
  const assignee = String(body?.assignee || "").trim().slice(0, 160) || null;
  const note = String(body?.note || "").trim().slice(0, 2000) || null;
  if (!["open", "investigating", "resolved", "ignored"].includes(status)) throw new Error("invalid_crash_group_status");
  const rows = await supabaseRequest(env, "admin_crash_group_state", "POST", {
    query: "on_conflict=fingerprint",
    body: { fingerprint, status, assignee, note, updated_by: context.email, updated_at: new Date().toISOString() },
    prefer: "resolution=merge-duplicates,return=representation",
  });
  await appendAudit(env, { type: "crash_group_state_update", entity: "crash_group", entity_id: fingerprint, actor: context.email, payload: { status, assignee }, at: new Date().toISOString() });
  return { success: true, item: Array.isArray(rows) ? rows[0] : rows };
}

async function listTamperAlerts(url, env) {
  const limit = safeInt(url.searchParams.get("limit"), 50, 200);
  const page = safeInt(url.searchParams.get("page"), 1, 5000);
  const resolved = String(url.searchParams.get("resolved") || "").trim();
  const severity = String(url.searchParams.get("severity") || "").trim().toLowerCase();
  const filters = [];
  if (["true", "false"].includes(resolved)) filters.push(`resolved=is.${resolved}`);
  if (severity) filters.push(`severity=eq.${encodeURIComponent(severity)}`);
  const offset = (page - 1) * limit;
  const rows = await safeSupabaseRead(env, "tamper_alerts", `select=id,happened_at,user_id,subscription_id,hwid,severity,reason,details,resolved,resolved_at&order=happened_at.desc&limit=${limit}&offset=${offset}${filters.length ? `&${filters.join("&")}` : ""}`);
  return {
    success: true,
    items: (Array.isArray(rows) ? rows : []).map((row) => ({ ...row, details: sanitizeCrashValue(row.details || {}) })),
    page,
    limit,
  };
}

async function resolveTamperAlert(alertId, request, env, context) {
  if (!isUuid(alertId)) throw new Error("invalid_tamper_alert");
  const body = await request.json();
  const reason = String(body?.reason || "").trim().slice(0, 1000);
  if (reason.length < 3) throw new Error("reason_required");
  const rows = await supabaseRequest(env, "tamper_alerts", "PATCH", {
    query: `id=eq.${encodeURIComponent(alertId)}&select=id,severity,reason,resolved,resolved_at`,
    body: { resolved: true, resolved_at: new Date().toISOString() },
    prefer: "return=representation",
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error("tamper_alert_not_found");
  await appendAudit(env, { type: "tamper_alert_resolved", entity: "tamper_alert", entity_id: alertId, actor: context.email, payload: { reason }, at: new Date().toISOString() });
  return { success: true, item: rows[0] };
}

async function getAdminReadiness(env) {
  const checks = await Promise.allSettled([
    safeSupabaseRead(env, "account_profiles", "select=firebase_uid&limit=1"),
    safeSupabaseRead(env, "admin_operation_requests", "select=id&limit=1"),
    safeSupabaseRead(env, "admin_crash_group_state", "select=fingerprint&limit=1"),
  ]);
  return {
    success: true,
    generated_at: new Date().toISOString(),
    services: {
      supabase: checks[0].status === "fulfilled" ? "ready" : "degraded",
      phase_f_schema: checks.slice(1).every((check) => check.status === "fulfilled") ? "ready" : "migration_pending",
      policy_worker_binding: env.POLICY_WORKER ? "configured" : "missing",
      ota_bucket_binding: hasOtaBucket(env) ? "configured" : "missing",
    },
    integrations: {
      payment_provider: String(env.STRIPE_SECRET_KEY || env.NOWPAYMENTS_API_KEY || "").trim() ? "configured" : "waiting_external_integration",
      email_auth: String(env.EMAIL_AUTH_ENABLED || "false").toLowerCase() === "true" ? "enabled" : "disabled",
    },
    admin_security: {
      layer1: adminLayer1Configured(env) ? "configured" : "not_configured",
      role_assignments: adminRoleAssignmentsState(env),
      firebase_allowlist: parseAdminAllowlist(env).length ? "configured" : "missing",
    },
  };
}

const ACCOUNT_DEVICE_CHANGE_SELECT = [
  "id",
  "firebase_uid",
  "current_binding_id",
  "resulting_binding_id",
  "requested_device_key",
  "device_name",
  "platform",
  "os_version",
  "app_version",
  "user_reason",
  "status",
  "requested_at",
  "resolved_at",
  "resolved_by",
  "resolution_note",
  "created_at",
  "updated_at",
].join(",");

const ACCOUNT_DEVICE_BINDING_SELECT = [
  "id",
  "firebase_uid",
  "device_key",
  "device_name",
  "platform",
  "os_version",
  "app_version",
  "status",
  "bound_at",
  "last_seen_at",
  "released_at",
  "created_at",
  "updated_at",
].join(",");

function accountDeviceChangeInput(body) {
  const action = String(body?.action || "").trim().toLowerCase();
  const reason = String(body?.reason || body?.resolution_note || "").trim().slice(0, 1000);
  if (!["approve", "reject"].includes(action)) throw new Error("invalid_device_change_action");
  if (reason.length < 3) throw new Error("reason_required");
  return { action, reason };
}

async function accountProfilesByUid(env, firebaseUids) {
  const ids = [...new Set(firebaseUids.map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 100);
  if (!ids.length) return new Map();
  const rows = await safeSupabaseRead(
    env,
    "account_profiles",
    `select=firebase_uid,normalized_email,display_name,account_status&firebase_uid=in.(${ids.map((id) => encodeURIComponent(id)).join(",")})&limit=${ids.length}`,
  );
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [row.firebase_uid, row]));
}

async function listAccountDeviceChangeRequests(url, env) {
  const status = String(url.searchParams.get("status") || "pending").trim().toLowerCase();
  if (!["pending", "approved", "rejected", "cancelled", "all"].includes(status)) throw new Error("invalid_device_change_status");
  const page = safeInt(url.searchParams.get("page"), 1, 5000);
  const limit = safeInt(url.searchParams.get("limit"), 25, 100);
  const offset = (page - 1) * limit;
  const rows = await supabaseRequest(env, "account_device_change_requests", "GET", {
    query: `select=${ACCOUNT_DEVICE_CHANGE_SELECT}${status === "all" ? "" : `&status=eq.${encodeURIComponent(status)}`}&order=requested_at.asc&limit=${limit}&offset=${offset}`,
  });
  const items = Array.isArray(rows) ? rows : [];
  const profiles = await accountProfilesByUid(env, items.map((item) => item.firebase_uid));
  return {
    success: true,
    items: items.map((item) => ({ ...item, account: profiles.get(item.firebase_uid) || null })),
    page,
    limit,
    has_more: items.length === limit,
  };
}

async function readAccountDeviceChangeInternal(changeRequestId, env) {
  if (!isUuid(changeRequestId)) throw new Error("device_change_request_not_found");
  const rows = await supabaseRequest(env, "account_device_change_requests", "GET", {
    query: `select=${ACCOUNT_DEVICE_CHANGE_SELECT},resolution_request_id&id=eq.${encodeURIComponent(changeRequestId)}&limit=1`,
  });
  const item = Array.isArray(rows) ? rows[0] : null;
  if (!item) throw new Error("device_change_request_not_found");
  return item;
}

async function buildAccountDeviceChangePreview(changeRequestId, body, env, existing = null) {
  const input = accountDeviceChangeInput(body);
  const item = existing || await readAccountDeviceChangeInternal(changeRequestId, env);
  if (item.status !== "pending") throw new Error("device_change_request_not_pending");
  const profiles = await accountProfilesByUid(env, [item.firebase_uid]);
  const previewHash = await sha256Hex(stableStringify({
    request_id: item.id,
    request_updated_at: item.updated_at,
    current_binding_id: item.current_binding_id,
    requested_device_key: item.requested_device_key,
    action: input.action,
    reason: input.reason,
  }));
  return {
    request: Object.fromEntries(Object.entries(item).filter(([key]) => key !== "resolution_request_id")),
    account: profiles.get(item.firebase_uid) || null,
    action: input.action,
    reason: input.reason,
    preview_hash: previewHash,
  };
}

async function previewAccountDeviceChange(changeRequestId, request, env) {
  return buildAccountDeviceChangePreview(changeRequestId, await request.json(), env);
}

async function executeAccountDeviceChange(changeRequestId, request, env, context) {
  const body = await request.json();
  const requestId = String(body?.request_id || body?.idempotency_key || "").trim();
  const expectedPreviewHash = String(body?.preview_hash || "").trim();
  if (requestId.length < 8 || requestId.length > 200) throw new Error("invalid_request_id");
  const existing = await readAccountDeviceChangeInternal(changeRequestId, env);
  if (existing.status !== "pending" && existing.resolution_request_id === requestId) {
    return { item: Object.fromEntries(Object.entries(existing).filter(([key]) => key !== "resolution_request_id")), idempotent: true };
  }
  const preview = await buildAccountDeviceChangePreview(changeRequestId, body, env, existing);
  if (!expectedPreviewHash || expectedPreviewHash !== preview.preview_hash) throw new Error("preview_changed");
  const rows = await supabaseRequest(env, "rpc/resolve_account_device_change", "POST", {
    body: {
      p_request_id: changeRequestId,
      p_action: preview.action,
      p_actor: context.email,
      p_resolution_note: preview.reason,
      p_expected_updated_at: preview.request.updated_at,
      p_resolution_request_id: requestId,
    },
  });
  const item = Array.isArray(rows) ? rows[0] : null;
  if (!item?.id) throw new Error("device_change_resolution_failed");
  await appendAudit(env, {
    type: `account_device_change_${preview.action === "approve" ? "approved" : "rejected"}`,
    entity: "account_device_change_request",
    entity_id: changeRequestId,
    actor: context.email,
    payload: { firebase_uid: preview.request.firebase_uid, reason: preview.reason, request_id: requestId },
    at: new Date().toISOString(),
  });
  return { item: Object.fromEntries(Object.entries(item).filter(([key]) => !["requested_hwid_hash", "resolution_request_id"].includes(key))), idempotent: false };
}

async function buildAccountDeviceResetPreview(firebaseUid, body, env) {
  const uid = String(firebaseUid || "").trim();
  const reason = String(body?.reason || "").trim().slice(0, 1000);
  if (!uid) throw new Error("account_not_found");
  if (reason.length < 3) throw new Error("reason_required");
  const rows = await supabaseRequest(env, "account_device_bindings", "GET", {
    query: `select=${ACCOUNT_DEVICE_BINDING_SELECT}&firebase_uid=eq.${encodeURIComponent(uid)}&status=eq.active&limit=1`,
  });
  const binding = Array.isArray(rows) ? rows[0] : null;
  if (!binding) throw new Error("device_not_found");
  const sessions = await safeSupabaseRead(env, "app_sessions", `select=id&user_id=eq.${encodeURIComponent(uid)}&revoked_at=is.null&limit=200`);
  return {
    binding,
    active_session_count: Array.isArray(sessions) ? sessions.length : 0,
    reason,
    preview_hash: await sha256Hex(stableStringify({ firebase_uid: uid, binding_id: binding.id, binding_updated_at: binding.updated_at, reason })),
  };
}

async function previewAccountDeviceReset(firebaseUid, request, env) {
  return buildAccountDeviceResetPreview(firebaseUid, await request.json(), env);
}

async function executeAccountDeviceReset(firebaseUid, request, env, context) {
  const body = await request.json();
  const requestId = String(body?.request_id || body?.idempotency_key || "").trim();
  if (requestId.length < 8 || requestId.length > 200) throw new Error("invalid_request_id");
  const expectedPreviewHash = String(body?.preview_hash || "").trim();
  let preview;
  try {
    preview = await buildAccountDeviceResetPreview(firebaseUid, body, env);
  } catch (error) {
    if (String(error instanceof Error ? error.message : error) !== "device_not_found") throw error;
    const events = await safeSupabaseRead(env, "account_device_events", `select=id,details&firebase_uid=eq.${encodeURIComponent(firebaseUid)}&event_type=eq.device_binding_reset&order=created_at.desc&limit=20`);
    if ((Array.isArray(events) ? events : []).some((event) => event?.details?.request_id === requestId)) return { reset: true, idempotent: true };
    throw error;
  }
  if (!expectedPreviewHash || expectedPreviewHash !== preview.preview_hash) throw new Error("preview_changed");
  const reset = await supabaseRequest(env, "rpc/reset_account_device", "POST", {
    body: { p_firebase_uid: firebaseUid, p_actor: context.email, p_reason: preview.reason, p_request_id: requestId },
  });
  if (reset !== true) throw new Error("device_reset_failed");
  await appendAudit(env, {
    type: "account_device_binding_reset",
    entity: "account_device_binding",
    entity_id: preview.binding.id,
    actor: context.email,
    payload: { firebase_uid: firebaseUid, reason: preview.reason, request_id: requestId, active_session_count: preview.active_session_count },
    at: new Date().toISOString(),
  });
  return { reset: true, idempotent: false };
}

async function getUserDetail(userKey, env) {
  if (!userKey) throw new Error("missing_user");
  const key = safeSearchTerm(userKey);
  const emailKey = key.includes("@") ? normalizeEmail(key) : "";
  const profileQuery = emailKey
    ? `select=firebase_uid,normalized_email,display_name,email_verified,email_verified_at,verification_source,auth_providers,locale,account_status,created_at,updated_at&normalized_email=eq.${encodeURIComponent(emailKey)}&limit=2`
    : `select=firebase_uid,normalized_email,display_name,email_verified,email_verified_at,verification_source,auth_providers,locale,account_status,created_at,updated_at&firebase_uid=eq.${encodeURIComponent(key)}&limit=1`;
  const profiles = await safeSupabaseRead(env, "account_profiles", profileQuery);
  if (!Array.isArray(profiles) || profiles.length === 0) throw new Error("account_not_found");
  if (profiles.length > 1) throw new Error("account_identity_conflict");
  const profile = profiles[0];
  const userId = String(profile.firebase_uid || "").trim();
  const userEmail = normalizeEmail(profile.normalized_email);
  const subscriptionRows = await safeSupabaseRead(
    env,
    "account_subscriptions",
    `select=*&firebase_user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=100`,
  );
  const resolution = resolveSubscriptionTruth(subscriptionRows, { firebaseUid: userId, email: userEmail });
  const subscriptionIds = (Array.isArray(subscriptionRows) ? subscriptionRows : []).map((row) => row.id).filter(Boolean);
  const crashFilter = subscriptionIds.length
    ? `subscription_id=in.(${subscriptionIds.map((id) => encodeURIComponent(id)).join(",")})`
    : `user_id=eq.__none__`;
  const [sessions, crashes, loginRequests, tamperAlerts, recentAudit, recoveryEvidence, deviceBindings, deviceChangeRequests] = await Promise.all([
    safeSupabaseRead(env, "app_sessions", `select=id,user_id,user_email,subscription_id,hwid,expires_at,revoked_at,created_at,last_seen_at&user_id=eq.${encodeURIComponent(userId)}&order=last_seen_at.desc&limit=100`),
    safeSupabaseRead(env, "crash_logs", `select=id,happened_at,user_id,subscription_id,hwid,device_name,windows_version,error_type,message,stack_trace,app_version,tool_channel,fingerprint&${crashFilter}&order=happened_at.desc&limit=50`),
    safeSupabaseRead(env, "device_login_sessions", `select=id,hwid,status,user_id,user_email,subscription_id,expires_at,authorized_at,consumed_at,created_at&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=50`),
    safeSupabaseRead(env, "tamper_alerts", `select=id,happened_at,user_id,subscription_id,hwid,severity,reason,details,resolved,resolved_at&user_id=eq.${encodeURIComponent(userId)}&order=happened_at.desc&limit=50`),
    safeSupabaseRead(env, "admin_activity", `select=id,action,entity,entity_id,admin_email,payload,happened_at&order=happened_at.desc&limit=200`),
    safeSupabaseRead(env, "subscription_recovery_ledger", `select=id,firebase_uid,subscription_id,evidence_type,evidence_reference,remaining_seconds,status,created_at,expires_at,consumed_at&firebase_uid=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=50`),
    safeSupabaseRead(env, "account_device_bindings", `select=${ACCOUNT_DEVICE_BINDING_SELECT}&firebase_uid=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=20`),
    safeSupabaseRead(env, "account_device_change_requests", `select=${ACCOUNT_DEVICE_CHANGE_SELECT}&firebase_uid=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=20`),
  ]);
  const supportPayload = await proxyPolicyAdmin(
    new Request("https://admin.saturnws.com/api/admin/internal-support", { method: "GET" }),
    env,
    "/v1/admin/support",
  ).catch(() => ({ threads: [] }));
  const supportThreads = (Array.isArray(supportPayload?.threads) ? supportPayload.threads : []).filter((thread) =>
    String(thread?.user_id || "").trim() === userId || normalizeEmail(thread?.email) === userEmail,
  );
  const safeCrashes = (Array.isArray(crashes) ? crashes : []).map((row) => ({
    ...row,
    message: sanitizeCrashString(row.message || ""),
    stack_trace: sanitizeCrashString(String(row.stack_trace || "").split(/\r?\n/).slice(0, 8).join("\n")),
  }));
  const safeSessions = await Promise.all((Array.isArray(sessions) ? sessions : []).map(async (row) => {
    const { hwid, ...safe } = row;
    return { ...safe, device_key: hwid ? (await sha256Hex(`saturnws-device:${hwid}`)).slice(0, 16) : null };
  }));
  const safeLoginRequests = await Promise.all((Array.isArray(loginRequests) ? loginRequests : []).map(async (row) => {
    const { hwid, ...safe } = row;
    return { ...safe, device_key: hwid ? (await sha256Hex(`saturnws-device:${hwid}`)).slice(0, 16) : null };
  }));
  const userAudit = (Array.isArray(recentAudit) ? recentAudit : []).filter((row) =>
    row.entity_id === userId || row.payload?.firebase_uid === userId || row.payload?.target_firebase_uid === userId,
  ).slice(0, 50);
  const deviceMap = new Map();
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const hwid = session.hwid || "unknown";
    const current = deviceMap.get(hwid) || {
      device_key: hwid === "unknown" ? null : (await sha256Hex(`saturnws-device:${hwid}`)).slice(0, 16),
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
      device_key: hwid === "unknown" ? null : (await sha256Hex(`saturnws-device:${hwid}`)).slice(0, 16),
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
    profile,
    item: resolution.currentRow || null,
    subscription_projection: resolution.projection,
    subscription_integrity: resolution.diagnostics,
    subscription_history: resolution.history,
    sessions: safeSessions,
    crashes: safeCrashes,
    login_requests: safeLoginRequests,
    devices: [...deviceMap.values()],
    device_binding: (Array.isArray(deviceBindings) ? deviceBindings : []).find((binding) => binding.status === "active") || null,
    device_binding_history: Array.isArray(deviceBindings) ? deviceBindings : [],
    device_change_requests: Array.isArray(deviceChangeRequests) ? deviceChangeRequests : [],
    tamper_alerts: Array.isArray(tamperAlerts) ? tamperAlerts : [],
    audit: userAudit,
    recovery_evidence: Array.isArray(recoveryEvidence) ? recoveryEvidence : [],
    support_threads: supportThreads.slice(0, 50),
    last_crash: safeCrashes.length ? safeCrashes[0] : null,
    request: latestLoginRequest
      ? {
          user_id: latestLoginRequest.user_id || userId || null,
          user_email: normalizeEmail(latestLoginRequest.user_email) || userEmail || null,
          device_key: latestLoginRequest.hwid ? (await sha256Hex(`saturnws-device:${latestLoginRequest.hwid}`)).slice(0, 16) : null,
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
  const subscriptionWaitStates = new Set(["pending", "subscription_required", "subscription_expired", "subscription_inactive", "subscription_missing"]);
  for (const row of Array.isArray(rows) ? rows : []) {
    const status = String(row?.status || "").trim().toLowerCase();
    if (!subscriptionWaitStates.has(status)) continue;
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
