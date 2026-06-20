import nacl from "tweetnacl"
import {
  EMAIL_CATALOG,
  RESEND_KNOWN_EVENTS,
  emailCatalogList,
  renderTransactionalEmail,
  resolveEmailEventType,
  sampleTemplateData,
  senderForEvent,
} from "./email_catalog"

type Decision =
  | "allow"
  | "deny_user"
  | "subscription_expired"
  | "mandatory_update"
  | "disabled_version"
  | "global_kill_switch"
  | "plan_feature_not_allowed"
  | "policy_unavailable"

interface Env {
  DB: D1Database
  AUTH_SERVICE?: Fetcher
  POLICY_SIGNING_SEED_B64: string
  POLICY_STAGING_TOKEN?: string
  AUTH_VERIFY_URL?: string
  ALLOW_ORIGIN?: string
  APP_ENV?: string
  DEFAULT_TTL_SECONDS?: string
  ADMIN_TOKEN_SHA256?: string
  RESEND_SEND_API_KEY?: string
  RESEND_RECEIVE_API_KEY?: string
  RESEND_WEBHOOK_SECRET?: string
  EMAIL_OUTBOUND_ENABLED?: string
  EMAIL_INBOUND_ENABLED?: string
  EMAIL_SUPPORT_ENABLED?: string
  EMAIL_AUTH_ENABLED?: string
  EMAIL_BILLING_ENABLED?: string
  EMAIL_RELEASE_ENABLED?: string
  EMAIL_SECURITY_ENABLED?: string
  EMAIL_SCHEDULER_ENABLED?: string
  EMAIL_ADMIN_ALERTS_ENABLED?: string
  EMAIL_FROM_SUPPORT?: string
  EMAIL_REPLY_DOMAIN?: string
  EMAIL_FROM_GENERAL?: string
  EMAIL_FROM_SECURITY?: string
  EMAIL_FROM_BILLING?: string
  EMAIL_FROM_ACCOUNT?: string
  APP_PUBLIC_URL?: string
}

interface PolicyRequest {
  user_id?: string
  email?: string
  install_id?: string
  device_id?: string
  app_version?: string
  app_build_id?: string
  channel?: string
  requested_action?: string
  platform?: string
  build_info?: Record<string, unknown>
  subscription?: Record<string, unknown>
}

interface GlobalPolicyRow {
  id: string
  kill_switch_enabled: number
  mandatory_update_enabled: number
  minimum_supported_version: string | null
  update_mode: string | null
  blocked_actions_json: string | null
  features_json: string | null
  limits_json: string | null
}

interface UserRow {
  id: string
  email: string | null
  status: string
  role: string
  plan_id: string
}

interface SubscriptionRow {
  id: string
  user_id: string
  plan_id: string
  status: string
  expires_at: string | null
}

interface PolicyOverrideRow {
  id: string
  scope: string
  subject: string
  decision: Decision
  reason: string | null
  blocked_actions_json: string | null
  features_json: string | null
  limits_json: string | null
  expires_at: string | null
  sticky: number
}

interface PlanFeaturesRow {
  plan_id: string
  features_json: string | null
  blocked_actions_json: string | null
  limits_json: string | null
}

interface ReleaseCatalogRow {
  version: string
  channel: string
  release_type: string
  visibility: string
  artifact_kind: string
  source: string | null
  notes: string | null
  created_at: string
  updated_at: string
  catalog_event_type?: string | null
  template_key?: string | null
  template_version?: number | null
  email_category?: string | null
  scheduled_notification_id?: string | null
}

interface SupportThreadRow {
  id: string
  user_id: string | null
  email: string | null
  install_id: string | null
  device_id: string | null
  app_version: string | null
  app_build_id: string | null
  channel: string | null
  platform: string | null
  subject: string
  status: string
  user_last_read_at: string | null
  admin_last_read_at: string | null
  created_at: string
  updated_at: string
  last_message_body?: string | null
  last_message_sender?: string | null
  last_message_at?: string | null
  unread_count?: number
  support_blocked?: number
}

interface SupportMessageRow {
  id: string
  thread_id: string
  sender: string
  body: string
  created_at: string
  source?: string | null
  provider_message_id?: string | null
}

interface EmailJobRow {
  id: string
  idempotency_key: string
  email_type: string
  recipient: string
  sender: string
  reply_to: string | null
  subject: string
  html_body: string | null
  text_body: string | null
  template_data_json: string | null
  headers_json: string | null
  linked_user_id: string | null
  linked_ticket_id: string | null
  status: string
  attempt_count: number
  max_attempts: number
  next_attempt_at: string
  provider_message_id: string | null
  last_error: string | null
  last_attempt_at: string | null
  sent_at: string | null
  delivered_at: string | null
  created_at: string
  updated_at: string
}

interface SupportReplyTokenRow {
  id: string
  thread_id: string
  token_hash: string
  active: number
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

interface EmailProviderMessage {
  from: string
  to: string
  replyTo?: string
  subject: string
  html: string
  text: string
  headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }>
}

interface InviteCodeRow {
  id: string
  code_hash: string
  status: string
  expires_at: string | null
  max_uses: number | null
  used_count: number
}

interface AuthResolved {
  ok: boolean
  decision?: Decision
  reason?: string
  user_id?: string
  email?: string
  plan_id?: string
  expires_at?: string | null
  features?: Record<string, unknown>
  limits?: Record<string, unknown>
}

interface FirebaseWebIdentity {
  success: boolean
  user?: {
    id?: string
    email?: string
    display_name?: string | null
    avatar_url?: string | null
    auth_provider?: string | null
  }
  error?: string
}

const DECISIONS = new Set<Decision>([
  "allow",
  "deny_user",
  "subscription_expired",
  "mandatory_update",
  "disabled_version",
  "global_kill_switch",
  "plan_feature_not_allowed",
  "policy_unavailable",
])

function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  })
}

function corsHeaders(env: Env, request?: Request): HeadersInit {
  const origin = String(request?.headers.get("Origin") || "").trim()
  const configured = String(env.ALLOW_ORIGIN || "https://saturnws.com,https://www.saturnws.com,https://admin.saturnws.com")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  const allowOrigin = origin && configured.includes(origin) ? origin : configured[0] || ""
  if (!allowOrigin) return {}
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization,content-type,x-saturn-hwid,x-saturn-install-id,x-saturn-app-version,x-saturn-admin-token",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    Vary: "Origin",
  }
}

function normalizeText(value: unknown): string {
  return String(value || "").trim()
}

function normalizeLower(value: unknown): string {
  return normalizeText(value).toLowerCase()
}

function clampText(value: unknown, maxLength: number): string {
  const text = normalizeText(value).replace(/\s+/g, " ")
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text
}

function clampMultilineText(value: unknown, maxLength: number): string {
  const text = normalizeText(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text
}

function parseJsonObject(value: string | null | undefined, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  if (!value) return fallback
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map((item) => normalizeLower(item)).filter(Boolean) : []
  } catch {
    return []
  }
}

function toJsonText(value: unknown, fallback: unknown): string {
  if (typeof value === "string") {
    try {
      JSON.parse(value)
      return value
    } catch {
      return JSON.stringify(fallback)
    }
  }
  try {
    return JSON.stringify(value ?? fallback)
  } catch {
    return JSON.stringify(fallback)
  }
}

function normalizeListInput(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => normalizeLower(item)).filter(Boolean)
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.map((item) => normalizeLower(item)).filter(Boolean)
    } catch {
      // Fall back to comma/newline separated input.
    }
    return trimmed
      .split(/[,\n]/)
      .map((item) => normalizeLower(item))
      .filter(Boolean)
  }
  return []
}

function parseBooleanInput(value: unknown): boolean {
  if (value === true || value === 1) return true
  const text = normalizeLower(value)
  return ["1", "true", "yes", "on", "enabled", "mandatory"].includes(text)
}

function adminHtml(): Response {
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Saturn Workspace Admin</title>
  <style>
    :root{color-scheme:dark;--bg:#070b10;--surface:#111820;--panel:#151e28;--border:#263241;--text:#f4f7fb;--muted:#9ca8b7;--accent:#4298ff;--danger:#ff5d66}
    *{box-sizing:border-box}body{margin:0;font-family:Segoe UI,Tahoma,sans-serif;background:var(--bg);color:var(--text)}
    main{max-width:1180px;margin:0 auto;padding:28px;display:grid;gap:18px}
    header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:1px solid var(--border);padding-bottom:18px}
    h1{margin:0;font-size:24px}h2{margin:0 0 12px;font-size:16px}p{margin:6px 0;color:var(--muted)}
    section{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.full{grid-column:1/-1}
    label{display:grid;gap:6px;margin:10px 0;color:var(--muted);font-size:13px}
    input,select,textarea{width:100%;background:#0b1118;color:var(--text);border:1px solid var(--border);border-radius:10px;padding:10px 12px}
    textarea{min-height:72px;resize:vertical}button{border:0;border-radius:10px;background:var(--accent);color:#05101d;font-weight:700;padding:10px 14px;cursor:pointer}
    button.secondary{background:#202b38;color:var(--text);border:1px solid var(--border)}
    button.danger{background:var(--danger);color:#160406}
    table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border-bottom:1px solid var(--border);padding:9px;text-align:right;font-size:13px}th{color:var(--muted)}
    .row{display:flex;gap:10px;align-items:end}.status{font-size:13px;color:var(--muted);white-space:pre-wrap}.pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:3px 8px;color:var(--muted)}
    .support-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}
    .support-list{display:grid;gap:8px;margin-top:10px}
    .support-item{display:grid;gap:5px;background:#0b1118;border:1px solid var(--border);border-radius:12px;padding:12px;text-align:right;color:var(--text);width:100%}
    .support-item:hover{border-color:#3d4c5e}
    .support-item strong{font-size:14px}.support-item span{color:var(--muted);font-size:12px}
    .support-detail{display:grid;gap:10px;margin-top:12px;border-top:1px solid var(--border);padding-top:12px}
    .support-message{max-width:78%;border:1px solid var(--border);border-radius:12px;padding:9px 11px;background:#0b1118;white-space:pre-wrap}
    .support-message.admin{margin-inline-start:auto;background:#102236;border-color:#2c5b8c}
    .support-message.user{margin-inline-end:auto}
    @media(max-width:860px){.grid{grid-template-columns:1fr}header{display:block}.row{display:grid}}
  </style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>Saturn Workspace Admin</h1>
      <p>إدارة سياسة الوصول والتحديثات من Cloudflare D1. التغييرات هنا تؤثر على Worker مباشرة.</p>
    </div>
    <div style="min-width:320px">
      <label>Admin token<input id="token" type="password" placeholder="ضع admin token المحلي" /></label>
      <button class="secondary" onclick="saveToken()">حفظ token محليًا</button>
      <button onclick="loadState()">تحديث البيانات</button>
    </div>
  </header>

  <div class="grid">
    <section>
      <h2>Global Policy</h2>
      <label><input id="kill" type="checkbox" /> Global kill switch</label>
      <label><input id="mandatory" type="checkbox" /> Mandatory update</label>
      <label>Update mode<select id="updateMode"><option value="optional">optional</option><option value="mandatory">mandatory</option></select></label>
      <label>Minimum supported version<input id="minVersion" placeholder="مثال: 1.0.0" /></label>
      <label>Blocked actions<textarea id="globalBlocked" placeholder="JSON array أو comma separated"></textarea></label>
      <button onclick="saveGlobal()">حفظ السياسة العامة</button>
    </section>

    <section>
      <h2>Disabled Versions</h2>
      <div class="row">
        <label>Version<input id="disabledVersion" placeholder="1.0.0" /></label>
        <label>Reason<input id="disabledReason" placeholder="سبب داخلي اختياري" /></label>
        <button onclick="saveDisabled(true)">إضافة</button>
      </div>
      <div id="disabledList"></div>
    </section>

    <section>
      <h2>Users</h2>
      <label>Email<input id="userEmail" placeholder="user@example.com" /></label>
      <label>Status<select id="userStatus"><option value="active">active</option><option value="disabled">disabled</option><option value="banned">banned</option></select></label>
      <label>Plan<input id="userPlan" value="default" /></label>
        <label>Subscription status<select id="subStatus"><option value="">no change</option><option value="active">active</option><option value="expired">expired</option></select></label>
      <button onclick="saveUser()">حفظ المستخدم</button>
      <div id="usersList"></div>
    </section>

    <section>
      <h2>Plan Features / Blocked Actions</h2>
      <label>Plan ID<input id="planId" value="default" /></label>
      <label>Features JSON<textarea id="planFeatures">{}</textarea></label>
      <label>Blocked actions<textarea id="planBlocked">[]</textarea></label>
      <label>Limits JSON<textarea id="planLimits">{}</textarea></label>
      <button onclick="savePlan()">حفظ الخطة</button>
    </section>

    <section class="full">
      <h2>Releases</h2>
      <p>الإصدارات الداخلية القديمة تظهر كمؤرشفة/داخلية ولا تظهر كبداية عامة.</p>
      <div id="releasesList"></div>
      <div class="row">
        <label>Version<input id="releaseVersion" value="1.0.0" /></label>
        <label>Visibility<select id="releaseVisibility"><option value="public">public</option><option value="internal">internal</option><option value="archived">archived</option><option value="hidden">hidden</option></select></label>
        <label>Type<input id="releaseType" value="public_release" /></label>
        <button onclick="saveRelease()">حفظ release</button>
      </div>
    </section>

    <section class="full">
      <div class="support-toolbar">
        <div>
          <h2>Support Messages</h2>
          <p>Messages sent from inside Saturn Workspace. Admin replies appear in the user's notifications.</p>
        </div>
        <button class="secondary" onclick="loadSupport()">Refresh messages</button>
      </div>
      <div id="supportList" class="support-list"></div>
      <div id="supportDetail" class="support-detail" hidden>
        <div id="supportMessages"></div>
        <label>Admin reply<textarea id="supportReply" placeholder="Write the reply that should appear inside the app"></textarea></label>
        <div class="row">
          <button onclick="sendSupportReply()">Send reply</button>
          <button class="secondary" onclick="closeSupportDetail()">Close</button>
        </div>
      </div>
    </section>
  </div>
  <section><h2>Log</h2><div id="status" class="status">جاهز.</div></section>
</main>
<script>
const $ = (id) => document.getElementById(id);
function token(){return $("token").value || localStorage.getItem("saturn_admin_token") || ""}
function saveToken(){localStorage.setItem("saturn_admin_token", $("token").value); log("تم حفظ token في هذا المتصفح فقط.");}
function log(v){$("status").textContent = typeof v === "string" ? v : JSON.stringify(v,null,2)}
async function api(path, options={}){
  const res = await fetch(path,{...options,headers:{"content-type":"application/json","authorization":"Bearer "+token(),...(options.headers||{})}})
  const data = await res.json().catch(()=>({}))
  if(!res.ok) throw new Error(data.error || "request_failed")
  return data
}
function listTable(rows, cols){
  if(!rows || !rows.length) return "<p>لا توجد بيانات.</p>"
  return "<table><thead><tr>"+cols.map(c=>"<th>"+c+"</th>").join("")+"</tr></thead><tbody>"+rows.map(r=>"<tr>"+cols.map(c=>"<td>"+String(r[c]??"")+"</td>").join("")+"</tr>").join("")+"</tbody></table>"
}
let supportThreads = [];
let activeSupportThreadId = "";
function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => {
    if(ch === "&") return "&amp;";
    if(ch === "<") return "&lt;";
    if(ch === ">") return "&gt;";
    if(ch === '"') return "&quot;";
    if(ch === "'") return "&#39;";
    return ch;
  })
}
function renderSupportList(rows){
  supportThreads = Array.isArray(rows) ? rows : [];
  if(!supportThreads.length){
    $("supportList").innerHTML = "<p>No support messages yet.</p>";
    return;
  }
  $("supportList").innerHTML = supportThreads.map(row => {
    const unread = Number(row.unread_count || 0) > 0 ? "<span class='pill'>new</span>" : "";
    const meta = [row.email, row.device_id, row.app_version, row.updated_at].filter(Boolean).join(" · ");
    return "<button class='support-item' onclick='openSupportThread("+JSON.stringify(row.id)+")'>" +
      "<strong>"+escapeHtml(row.subject || "Untitled message")+" "+unread+"</strong>" +
      "<span>"+escapeHtml(meta)+"</span>" +
      "<span>"+escapeHtml(row.last_message_body || "")+"</span>" +
      "</button>";
  }).join("");
}
async function loadSupport(){
  try{
    const data = await api("/v1/admin/support");
    renderSupportList(data.threads || []);
    if(activeSupportThreadId) await openSupportThread(activeSupportThreadId);
  }catch(e){log("Failed to load support messages: "+e.message)}
}
function closeSupportDetail(){
  activeSupportThreadId = "";
  $("supportDetail").hidden = true;
  $("supportMessages").innerHTML = "";
  $("supportReply").value = "";
}
async function openSupportThread(threadId){
  activeSupportThreadId = String(threadId || "");
  if(!activeSupportThreadId) return;
  try{
    const data = await api("/v1/admin/support/messages?thread_id="+encodeURIComponent(activeSupportThreadId));
    const messages = Array.isArray(data.messages) ? data.messages : [];
    $("supportMessages").innerHTML = messages.map(msg =>
      "<div class='support-message "+escapeHtml(msg.sender === "admin" ? "admin" : "user")+"'>" +
      "<span class='pill'>"+escapeHtml(msg.sender || "")+" · "+escapeHtml(msg.created_at || "")+"</span><br />" +
      escapeHtml(msg.body || "") +
      "</div>"
    ).join("");
    $("supportDetail").hidden = false;
  }catch(e){log("Failed to open support thread: "+e.message)}
}
async function sendSupportReply(){
  const body = $("supportReply").value.trim();
  if(!activeSupportThreadId || !body){ log("Reply body is required."); return; }
  try{
    log(await api("/v1/admin/support/reply",{method:"POST",body:JSON.stringify({thread_id:activeSupportThreadId,body})}));
    $("supportReply").value = "";
    await loadSupport();
  }catch(e){log("Failed to send reply: "+e.message)}
}
async function loadState(){
  try{
    const data = await api("/v1/admin/state")
    const g = data.global_policy || {}
    $("kill").checked = !!g.kill_switch_enabled
    $("mandatory").checked = !!g.mandatory_update_enabled
    $("updateMode").value = g.update_mode || "optional"
    $("minVersion").value = g.minimum_supported_version || ""
    $("globalBlocked").value = g.blocked_actions_json || "[]"
    $("disabledList").innerHTML = listTable(data.disabled_versions,["version","reason","created_at"])
    $("usersList").innerHTML = listTable(data.users,["email","status","plan_id","role"])
    $("releasesList").innerHTML = listTable(data.releases,["version","channel","release_type","visibility","artifact_kind","updated_at"])
    renderSupportList(data.support_threads || [])
    log("تم تحميل البيانات.")
  }catch(e){log("فشل تحميل البيانات: "+e.message)}
}
async function saveGlobal(){
  const payload={kill_switch_enabled:$("kill").checked,mandatory_update_enabled:$("mandatory").checked,update_mode:$("updateMode").value,minimum_supported_version:$("minVersion").value,blocked_actions:$("globalBlocked").value}
  log(await api("/v1/admin/global-policy",{method:"POST",body:JSON.stringify(payload)})); await loadState()
}
async function saveDisabled(enabled){
  log(await api("/v1/admin/disabled-versions",{method:"POST",body:JSON.stringify({version:$("disabledVersion").value,reason:$("disabledReason").value,disabled:enabled})})); await loadState()
}
async function saveUser(){
  log(await api("/v1/admin/users",{method:"POST",body:JSON.stringify({email:$("userEmail").value,status:$("userStatus").value,plan_id:$("userPlan").value,subscription_status:$("subStatus").value})})); await loadState()
}
async function savePlan(){
  log(await api("/v1/admin/plan-features",{method:"POST",body:JSON.stringify({plan_id:$("planId").value,features:$("planFeatures").value,blocked_actions:$("planBlocked").value,limits:$("planLimits").value})})); await loadState()
}
async function saveRelease(){
  log(await api("/v1/admin/releases",{method:"POST",body:JSON.stringify({version:$("releaseVersion").value,visibility:$("releaseVisibility").value,release_type:$("releaseType").value,channel:"beta",artifact_kind:"full_setup"})})); await loadState()
}
$("token").value = localStorage.getItem("saturn_admin_token") || "";
if($("token").value) loadState();
</script>
</body>
</html>`
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}

function versionParts(version: string): number[] {
  return normalizeLower(version)
    .match(/\d+/g)
    ?.map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part)) || []
}

function versionLt(left: string, right: string): boolean {
  const a = versionParts(left)
  const b = versionParts(right)
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i += 1) {
    const av = a[i] || 0
    const bv = b[i] || 0
    if (av < bv) return true
    if (av > bv) return false
  }
  return false
}

function versionGt(left: string, right: string): boolean {
  return versionLt(right, left)
}

function pickUpdateManifestPayload(payload: Record<string, unknown>, channel: string): Record<string, unknown> {
  const channels = payload.channels
  if (!channels || typeof channels !== "object" || Array.isArray(channels)) return payload
  const channelMap = channels as Record<string, unknown>
  const selected =
    (channel && channelMap[channel] && typeof channelMap[channel] === "object" && !Array.isArray(channelMap[channel])
      ? channelMap[channel]
      : channelMap.beta || channelMap.stable) as Record<string, unknown> | undefined
  if (!selected || typeof selected !== "object" || Array.isArray(selected)) return payload
  return { ...payload, ...selected }
}

function manifestStringList(value: unknown): Set<string> {
  if (typeof value === "string") {
    return new Set(value.split(/[\s,;]+/g).map((item) => normalizeLower(item)).filter(Boolean))
  }
  if (!Array.isArray(value)) return new Set()
  return new Set(value.map((item) => normalizeLower(item)).filter(Boolean))
}

function manifestTargetContext(body: PolicyRequest): Record<string, Set<string>> {
  const deviceId = normalizeLower(body.device_id)
  const installId = normalizeLower(body.install_id)
  const userId = normalizeLower(body.user_id)
  const email = normalizeLower(body.email)
  const identifiers = new Set<string>()
  for (const value of [deviceId, installId, userId, email]) {
    if (value) identifiers.add(value)
  }
  return {
    device_ids: new Set([deviceId, installId].filter(Boolean)),
    install_ids: new Set(installId ? [installId] : []),
    user_ids: new Set(userId ? [userId] : []),
    user_emails: new Set(email ? [email] : []),
    hwids: new Set(deviceId ? [deviceId] : []),
    identifiers,
  }
}

function manifestTargetRuleMatches(rule: Record<string, unknown>, context: Record<string, Set<string>>, requireExplicitTarget = false, matchAny = false): boolean {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) return false
  if (rule.enabled === false) return false
  const fields: Record<string, string> = {
    device_ids: "device_ids",
    install_ids: "install_ids",
    user_ids: "user_ids",
    user_emails: "user_emails",
    emails: "user_emails",
    hwids: "hwids",
  }
  let hasConstraint = false
  let anyMatch = false
  for (const [field, bucket] of Object.entries(fields)) {
    const expected = manifestStringList(rule[field])
    if (!expected.size) continue
    hasConstraint = true
    const actual = new Set([...(context[bucket] || new Set<string>()), ...(context.identifiers || new Set<string>())])
    const matched = [...expected].some((item) => actual.has(item))
    anyMatch = anyMatch || matched
    if (!matched && !matchAny) return false
  }
  if (matchAny) return hasConstraint ? anyMatch : !requireExplicitTarget
  return hasConstraint || !requireExplicitTarget
}

function manifestReleaseFromRule(rule: Record<string, unknown>): Record<string, unknown> | null {
  const release = rule.release && typeof rule.release === "object" && !Array.isArray(rule.release)
    ? rule.release
    : rule.update
  if (!release || typeof release !== "object" || Array.isArray(release)) return null
  const releaseRecord = release as Record<string, unknown>
  const artifacts = releaseRecord.artifacts && typeof releaseRecord.artifacts === "object" && !Array.isArray(releaseRecord.artifacts)
    ? (releaseRecord.artifacts as Record<string, unknown>)
    : {}
  const installed = artifacts.installed && typeof artifacts.installed === "object" && !Array.isArray(artifacts.installed)
    ? (artifacts.installed as Record<string, unknown>)
    : {}
  const portable = artifacts.portable && typeof artifacts.portable === "object" && !Array.isArray(artifacts.portable)
    ? (artifacts.portable as Record<string, unknown>)
    : {}
  const hasArtifact = Boolean(normalizeText(releaseRecord.download_url) || normalizeText(installed.url) || normalizeText(portable.url))
  return normalizeText(releaseRecord.version) && hasArtifact ? releaseRecord : null
}

function applyTargetedUpdatePayload(scoped: Record<string, unknown>, body: PolicyRequest): Record<string, unknown> {
  const targeting = scoped.targeting
  if (!Array.isArray(targeting)) return scoped
  const context = manifestTargetContext(body)
  for (const item of [...targeting].reverse()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const rule = item as Record<string, unknown>
    const release = manifestReleaseFromRule(rule)
    if (!release) continue
    if (!manifestTargetRuleMatches(rule, context, true, true)) continue
    return { ...scoped, ...release, targeted_update: true, targeting_rule_id: normalizeText(rule.id) }
  }
  return scoped
}

async function updateManifestRequiresAppUpdate(body: PolicyRequest): Promise<boolean> {
  const appVersion = normalizeLower(body.app_version)
  if (!appVersion) return false
  const appBuildId = normalizeText(body.app_build_id)
  const channel = normalizeLower(body.channel || "beta") || "beta"
  const response = await fetch("https://saturnws.com/updates/latest.json", {
    headers: { "Cache-Control": "no-cache" },
  })
  if (!response.ok) return false
  const payload = (await response.json()) as Record<string, unknown>
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false
  const scoped = applyTargetedUpdatePayload(pickUpdateManifestPayload(payload, channel), body)
  const latestVersion = normalizeLower(scoped.version)
  if (!latestVersion) return false
  if (versionGt(latestVersion, appVersion)) return true
  if (versionLt(latestVersion, appVersion)) return false
  const latestBuildId = normalizeText((scoped.build_id as string | undefined) || "")
  return Boolean(latestBuildId && latestBuildId !== appBuildId)
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function sortForCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForCanonical)
  if (!value || typeof value !== "object") return value
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortForCanonical((value as Record<string, unknown>)[key])
  }
  return sorted
}

function canonicalJson(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(sortForCanonical(payload)))
}

function signPayload(payload: Record<string, unknown>, env: Env): Record<string, unknown> {
  const seed = base64ToBytes(env.POLICY_SIGNING_SEED_B64)
  if (seed.length !== 32) throw new Error("policy_signing_seed_invalid")
  const keyPair = nacl.sign.keyPair.fromSeed(seed)
  const unsigned = { ...payload }
  delete unsigned.signature
  const signature = nacl.sign.detached(canonicalJson(unsigned), keyPair.secretKey)
  return { ...unsigned, signature: bytesToBase64(signature) }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}

async function safeEqualHashed(left: string, right: string): Promise<boolean> {
  return safeEqual(await sha256Hex(left), await sha256Hex(right))
}

function envFlag(value: unknown, fallback = false): boolean {
  const text = normalizeLower(value)
  if (!text) return fallback
  if (["1", "true", "yes", "on", "enabled"].includes(text)) return true
  if (["0", "false", "no", "off", "disabled"].includes(text)) return false
  return fallback
}

function emailOutboundEnabled(env: Env): boolean {
  return envFlag(env.EMAIL_OUTBOUND_ENABLED, false) && Boolean(normalizeText(env.RESEND_SEND_API_KEY))
}

function emailInboundEnabled(env: Env): boolean {
  return envFlag(env.EMAIL_INBOUND_ENABLED, false)
}

function emailSchedulerEnabled(env: Env): boolean {
  return envFlag(env.EMAIL_SCHEDULER_ENABLED, false)
}

function appPublicUrl(env: Env): string {
  return normalizeText(env.APP_PUBLIC_URL).replace(/\/+$/, "") || "https://saturnws.com"
}

function emailReplyDomain(env: Env): string {
  return normalizeLower(env.EMAIL_REPLY_DOMAIN) || "mail.saturnws.com"
}

function emailFromSupport(env: Env): string {
  return normalizeText(env.EMAIL_FROM_SUPPORT) || "SaturnWS Support <support@mail.saturnws.com>"
}

function emailFeatureEnabled(env: Env, eventType: string): boolean {
  const event = EMAIL_CATALOG[eventType]
  if (!event) return false
  if (event.category === "support") return envFlag(env.EMAIL_SUPPORT_ENABLED, true)
  if (event.category === "auth") return envFlag(env.EMAIL_AUTH_ENABLED, false)
  if (event.category === "billing") return envFlag(env.EMAIL_BILLING_ENABLED, false)
  if (event.category === "release") return envFlag(env.EMAIL_RELEASE_ENABLED, false)
  if (event.category === "security" || event.category === "policy") return envFlag(env.EMAIL_SECURITY_ENABLED, false)
  return true
}

function configuredSenderForEvent(env: Env, eventType: string, replyToOverride?: string | null): { from: string; reply_to?: string } {
  const sender = senderForEvent(eventType, replyToOverride)
  if (sender.key === "support") return { from: emailFromSupport(env), reply_to: replyToOverride || sender.reply_to }
  if (sender.key === "security") return { from: normalizeText(env.EMAIL_FROM_SECURITY) || sender.from, reply_to: replyToOverride || sender.reply_to }
  if (sender.key === "billing") return { from: normalizeText(env.EMAIL_FROM_BILLING) || sender.from, reply_to: replyToOverride || sender.reply_to }
  if (sender.key === "account") return { from: normalizeText(env.EMAIL_FROM_ACCOUNT) || sender.from, reply_to: replyToOverride || sender.reply_to }
  return { from: normalizeText(env.EMAIL_FROM_GENERAL) || sender.from, reply_to: replyToOverride || sender.reply_to }
}

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function sanitizeHeaderValue(value: unknown, maxLength = 240): string {
  return clampText(String(value || "").replace(/[\r\n]+/g, " "), maxLength)
}

function normalizeEmailAddress(value: unknown): string {
  const text = normalizeText(value).replace(/[<>"'\r\n]/g, "")
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match ? match[0].toLowerCase() : ""
}

function stripDangerousHtml(value: unknown): string {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, "")
}

function htmlToText(value: unknown): string {
  return stripDangerousHtml(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function trimQuotedEmailHistory(value: string): string {
  const lines = String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  const out: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^On .+ wrote:$/i.test(trimmed)) break
    if (/^From:\s/i.test(trimmed) || /^Sent:\s/i.test(trimmed) || /^To:\s/i.test(trimmed)) break
    if (/^>/.test(trimmed)) break
    if (/^--\s*$/.test(trimmed)) break
    out.push(line)
  }
  return clampMultilineText(out.join("\n"), 4000)
}

function randomHex(bytes = 32): string {
  const values = new Uint8Array(bytes)
  crypto.getRandomValues(values)
  return [...values].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function supportTicketNumber(thread: Pick<SupportThreadRow, "id" | "created_at">): string {
  const existing = normalizeText(thread.id)
  if (/^SAT-\d{4}-[A-Z0-9]{6}$/i.test(existing)) return existing.toUpperCase()
  const year = String((thread.created_at || new Date().toISOString()).slice(0, 4) || new Date().getUTCFullYear())
  return `SAT-${year}-${existing.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase().padStart(6, "0")}`
}

function supportTicketUrl(env: Env, threadId: string): string {
  return `${appPublicUrl(env)}/account?section=support&thread=${encodeURIComponent(threadId)}`
}

function emailMessageId(kind: string, id: string): string {
  const safeKind = normalizeLower(kind).replace(/[^a-z0-9-]/g, "-") || "support"
  const safeId = normalizeLower(id).replace(/[^a-z0-9-]/g, "-").slice(0, 64) || crypto.randomUUID()
  return `<${safeKind}.${safeId}@mail.saturnws.com>`
}

async function createSupportReplyAddress(env: Env, threadId: string): Promise<string> {
  const token = randomHex(32)
  const tokenHash = await sha256Hex(token)
  await env.DB.prepare(
    "INSERT INTO support_reply_tokens (id, thread_id, token_hash, active, created_at) VALUES (?1, ?2, ?3, 1, datetime('now'))"
  )
    .bind(crypto.randomUUID(), threadId, tokenHash)
    .run()
  return `reply+${token}@${emailReplyDomain(env)}`
}

function supportEmailLayout(title: string, bodyHtml: string): string {
  const safeTitle = escapeHtml(title)
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title></head><body style="margin:0;background:#f6f7f9;color:#111827;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7f9;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden"><tr><td style="padding:22px 24px;border-bottom:1px solid #e5e7eb"><strong style="font-size:18px">SaturnWS</strong></td></tr><tr><td style="padding:24px;line-height:1.65;font-size:15px">${bodyHtml}</td></tr><tr><td style="padding:18px 24px;background:#f9fafb;color:#6b7280;font-size:12px;line-height:1.6">هذه رسالة تشغيلية من Saturn Workspace. عند تفعيل استقبال البريد، سيتم إضافة الرد على هذه الرسالة إلى نفس تذكرة الدعم تلقائيًا.</td></tr></table></td></tr></table></body></html>`
}

function supportTemplate(input: {
  kind: "ticket_confirmation" | "admin_reply" | "status_update" | "test"
  subject: string
  ticketNumber?: string
  ticketUrl?: string
  message?: string
  status?: string
}): { subject: string; html: string; text: string } {
  const ticketNumber = input.ticketNumber || ""
  const ticketUrl = input.ticketUrl || ""
  const message = input.message || ""
  const escapedMessage = escapeHtml(message).replace(/\n/g, "<br>")
  const action = ticketUrl ? `<p><a href="${escapeHtml(ticketUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;border-radius:999px;padding:10px 16px">فتح التذكرة</a></p>` : ""
  if (input.kind === "ticket_confirmation") {
    const title = `تم استلام تذكرتك ${ticketNumber}`
    return {
      subject: sanitizeHeaderValue(input.subject || title),
      html: supportEmailLayout(title, `<h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(title)}</h1><p>استلمنا طلب الدعم الخاص بك وسنرد عليه من داخل البوابة.</p><p><strong>رقم التذكرة:</strong> ${escapeHtml(ticketNumber)}</p><p><strong>الموضوع:</strong> ${escapeHtml(input.subject)}</p>${action}`),
      text: `SaturnWS\n\nتم استلام تذكرتك.\nرقم التذكرة: ${ticketNumber}\nالموضوع: ${input.subject}\nرابط التذكرة: ${ticketUrl}\n\nعند تفعيل استقبال البريد، سيتم إضافة الرد على هذه الرسالة إلى نفس التذكرة.`,
    }
  }
  if (input.kind === "admin_reply") {
    const title = `رد جديد على تذكرتك ${ticketNumber}`
    return {
      subject: sanitizeHeaderValue(input.subject || title),
      html: supportEmailLayout(title, `<h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(title)}</h1><p><strong>رقم التذكرة:</strong> ${escapeHtml(ticketNumber)}</p><div style="border-right:3px solid #111827;padding:10px 14px;background:#f9fafb">${escapedMessage}</div>${action}`),
      text: `SaturnWS\n\nرد جديد على تذكرتك ${ticketNumber}\n\n${message}\n\nرابط التذكرة: ${ticketUrl}\n\nعند تفعيل استقبال البريد، سيتم إضافة الرد على هذه الرسالة إلى نفس التذكرة.`,
    }
  }
  if (input.kind === "status_update") {
    const title = `تحديث حالة التذكرة ${ticketNumber}`
    return {
      subject: sanitizeHeaderValue(input.subject || title),
      html: supportEmailLayout(title, `<h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(title)}</h1><p><strong>الحالة:</strong> ${escapeHtml(input.status || "")}</p>${action}`),
      text: `SaturnWS\n\nتم تحديث حالة التذكرة ${ticketNumber}: ${input.status || ""}\nرابط التذكرة: ${ticketUrl}`,
    }
  }
  return {
    subject: sanitizeHeaderValue(input.subject || "SaturnWS email test"),
    html: supportEmailLayout("SaturnWS email test", `<p>${escapedMessage || "Email operations test message."}</p>`),
    text: `SaturnWS email test\n\n${message || "Email operations test message."}`,
  }
}

async function emailRecipientAllowsEvent(
  env: Env,
  recipient: string,
  userId: string | null,
  eventType: string
): Promise<{ allowed: boolean; reason?: string }> {
  const catalog = EMAIL_CATALOG[eventType]
  if (!recipient || !catalog) return { allowed: false, reason: "invalid_recipient_or_event" }
  const flag = await env.DB.prepare("SELECT status, reason FROM email_recipient_flags WHERE email = ?1 LIMIT 1")
    .bind(recipient)
    .first<{ status: string; reason: string | null }>()
    .catch(() => null)
  const flaggedStatus = normalizeLower(flag?.status)
  if (["bounced", "complained", "suppressed"].includes(flaggedStatus)) {
    return { allowed: false, reason: `recipient_${flaggedStatus}` }
  }
  if (!catalog.user_can_disable) return { allowed: true }
  const preference = await env.DB.prepare(
    `SELECT enabled FROM notification_preferences
     WHERE (email = ?1 OR (?2 IS NOT NULL AND user_id = ?2))
       AND (event_type = ?3 OR category = ?4)
     ORDER BY CASE WHEN event_type = ?3 THEN 0 ELSE 1 END, datetime(updated_at) DESC
     LIMIT 1`
  )
    .bind(recipient, userId || null, eventType, catalog.category)
    .first<{ enabled: number }>()
    .catch(() => null)
  if (preference && Number(preference.enabled) === 0) return { allowed: false, reason: "notification_preference_disabled" }
  return { allowed: true }
}

async function enqueueEmailJob(
  env: Env,
  input: {
    idempotencyKey: string
    emailType: string
    recipient: string
    sender?: string
    replyTo?: string
    subject: string
    html: string
    text: string
    linkedUserId?: string | null
    linkedTicketId?: string | null
    templateData?: Record<string, unknown>
    headers?: Record<string, string>
  }
): Promise<string | null> {
  const recipient = normalizeEmailAddress(input.recipient)
  if (!recipient) return null
  const eventType = resolveEmailEventType(input.emailType)
  if (!eventType) throw new Error("email_event_not_cataloged")
  if (!emailFeatureEnabled(env, eventType)) return null
  const catalog = EMAIL_CATALOG[eventType]
  const preference = await emailRecipientAllowsEvent(env, recipient, input.linkedUserId || null, eventType)
  const senderInfo = configuredSenderForEvent(env, eventType, input.replyTo || null)
  const sender = sanitizeHeaderValue(input.sender || senderInfo.from, 180)
  const subject = sanitizeHeaderValue(input.subject, 220)
  const jobId = crypto.randomUUID()
  const status = preference.allowed ? "queued" : "suppressed"
  const lastError = preference.allowed ? null : preference.reason
  const templateData = {
    ...(input.templateData || {}),
    event_type: eventType,
    template_key: catalog.template_key,
    template_version: catalog.template_version,
    category: catalog.category,
    integration_status: catalog.integration_status,
  }
  const headers = {
    ...(input.headers || {}),
    "X-SaturnWS-Email-Type": eventType,
    "X-SaturnWS-Template": `${catalog.template_key}@${catalog.template_version}`,
  }
  const baseBind = [
    jobId,
    clampText(input.idempotencyKey, 240),
    eventType,
    recipient,
    sender,
    (input.replyTo || senderInfo.reply_to) ? sanitizeHeaderValue(input.replyTo || senderInfo.reply_to, 220) : null,
    subject,
    input.html,
    input.text,
    toJsonText(templateData, {}),
    toJsonText(headers, {}),
    input.linkedUserId || null,
    input.linkedTicketId || null,
    status,
    EMAIL_MAX_ATTEMPTS,
    lastError,
  ] as const
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO email_jobs
        (id, idempotency_key, email_type, recipient, sender, reply_to, subject, html_body, text_body, template_data_json, headers_json, linked_user_id, linked_ticket_id, status, max_attempts, next_attempt_at, last_error, catalog_event_type, template_key, template_version, email_category, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, datetime('now'), ?16, ?3, ?17, ?18, ?19, datetime('now'), datetime('now'))`
    )
      .bind(...baseBind, catalog.template_key, catalog.template_version, catalog.category)
      .run()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "")
    if (!/catalog_event_type|template_key|email_category|no such column/i.test(message)) throw error
    await env.DB.prepare(
      `INSERT OR IGNORE INTO email_jobs
        (id, idempotency_key, email_type, recipient, sender, reply_to, subject, html_body, text_body, template_data_json, headers_json, linked_user_id, linked_ticket_id, status, max_attempts, next_attempt_at, last_error, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, datetime('now'), ?16, datetime('now'), datetime('now'))`
    )
      .bind(...baseBind)
      .run()
  }
  return jobId
}

async function resendSend(env: Env, message: EmailProviderMessage): Promise<{ id: string }> {
  const apiKey = normalizeText(env.RESEND_SEND_API_KEY)
  if (!apiKey) throw new Error("resend_send_api_key_missing")
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "SaturnWS-Policy-Worker/1.0",
    },
    body: JSON.stringify({
      from: message.from,
      to: [message.to],
      reply_to: message.replyTo ? [message.replyTo] : undefined,
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: message.headers,
      tags: message.tags,
    }),
  })
  const payload = (await response.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const reason = normalizeText(payload?.message || payload?.error || `resend_${response.status}`)
    throw new Error(reason || "resend_send_failed")
  }
  const id = normalizeText(payload.id || (payload.data as Record<string, unknown> | undefined)?.id)
  if (!id) throw new Error("resend_message_id_missing")
  return { id }
}

async function resetStuckEmailJobs(env: Env): Promise<void> {
  await env.DB.prepare("UPDATE email_jobs SET status = 'queued', updated_at = datetime('now'), last_error = 'processing_timeout' WHERE status = 'processing' AND datetime(updated_at) < datetime('now', '-10 minutes')")
    .run()
    .catch(() => null)
}

function dbChanges(result: unknown): number {
  return Number((result as { meta?: { changes?: number } } | null)?.meta?.changes || 0)
}

async function acquireEmailCronLock(env: Env): Promise<{ acquired: boolean; name: string; owner: string }> {
  const name = "email-operations"
  const owner = crypto.randomUUID()
  await env.DB.prepare(
    "INSERT OR IGNORE INTO email_cron_locks (name, owner, locked_until, created_at, updated_at) VALUES (?1, '', datetime('now', '-1 second'), datetime('now'), datetime('now'))"
  )
    .bind(name)
    .run()
  const result = await env.DB.prepare(
    "UPDATE email_cron_locks SET owner = ?2, locked_until = datetime('now', ?3), updated_at = datetime('now') WHERE name = ?1 AND datetime(locked_until) <= datetime('now')"
  )
    .bind(name, owner, `+${EMAIL_CRON_LOCK_SECONDS} seconds`)
    .run()
  return { acquired: dbChanges(result) > 0, name, owner }
}

async function releaseEmailCronLock(env: Env, lock: { name: string; owner: string }): Promise<void> {
  await env.DB.prepare(
    "UPDATE email_cron_locks SET owner = NULL, locked_until = datetime('now', '-1 second'), updated_at = datetime('now') WHERE name = ?1 AND owner = ?2"
  )
    .bind(lock.name, lock.owner)
    .run()
    .catch(() => null)
}

function retryBackoffSeconds(attempt: number): number {
  return Math.min(3600, Math.max(60, 60 * 2 ** Math.max(0, attempt - 1)))
}

async function processEmailOutbox(env: Env, limit = EMAIL_OUTBOX_BATCH_LIMIT): Promise<{ processed: number; sent: number; skipped: number }> {
  if (!emailOutboundEnabled(env)) return { processed: 0, sent: 0, skipped: 0 }
  await resetStuckEmailJobs(env)
  const rows = await env.DB.prepare(
    `SELECT * FROM email_jobs
     WHERE status = 'queued'
       AND datetime(next_attempt_at) <= datetime('now')
       AND attempt_count < max_attempts
     ORDER BY datetime(next_attempt_at) ASC, datetime(created_at) ASC
     LIMIT ?1`
  )
    .bind(limit)
    .all<EmailJobRow>()
    .catch(() => ({ results: [] as EmailJobRow[] }))
  let sent = 0
  let processed = 0
  let skipped = 0
  for (const job of rows.results || []) {
    processed += 1
    const claimed = await env.DB.prepare("UPDATE email_jobs SET status = 'processing', attempt_count = attempt_count + 1, last_attempt_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1 AND status = 'queued'")
      .bind(job.id)
      .run()
      .catch(() => ({ meta: { changes: 0 } }))
    if (!dbChanges(claimed)) {
      skipped += 1
      continue
    }
    try {
      const headers = parseJsonObject(job.headers_json, {}) as Record<string, string>
      const result = await resendSend(env, {
        from: job.sender,
        to: job.recipient,
        replyTo: job.reply_to || undefined,
        subject: job.subject,
        html: job.html_body || "",
        text: job.text_body || "",
        headers,
        tags: [
          { name: "email_type", value: normalizeLower(job.email_type).replace(/[^a-z0-9_-]/g, "_").slice(0, 120) || "support" },
          { name: "job_id", value: job.id.replace(/[^a-z0-9_-]/gi, "_").slice(0, 120) },
        ],
      })
      await env.DB.prepare("UPDATE email_jobs SET status = 'sent', provider_message_id = ?1, sent_at = datetime('now'), updated_at = datetime('now'), last_error = NULL WHERE id = ?2")
        .bind(result.id, job.id)
        .run()
      sent += 1
    } catch (error) {
      const message = clampText(error instanceof Error ? error.message : String(error || "send_failed"), 900)
      const attempts = Number(job.attempt_count || 0) + 1
      if (attempts >= Number(job.max_attempts || EMAIL_MAX_ATTEMPTS)) {
        await env.DB.prepare("UPDATE email_jobs SET status = 'failed', last_error = ?1, updated_at = datetime('now') WHERE id = ?2")
          .bind(message, job.id)
          .run()
      } else {
        await env.DB.prepare("UPDATE email_jobs SET status = 'queued', last_error = ?1, next_attempt_at = datetime('now', ?2), updated_at = datetime('now') WHERE id = ?3")
          .bind(message, `+${retryBackoffSeconds(attempts)} seconds`, job.id)
          .run()
      }
    }
  }
  return { processed, sent, skipped }
}

async function processScheduledEmailNotifications(env: Env, limit = 10): Promise<{ processed: number; queued: number; failed: number }> {
  if (!emailSchedulerEnabled(env)) return { processed: 0, queued: 0, failed: 0 }
  const rows = await env.DB.prepare(
    `SELECT * FROM notification_schedule
     WHERE status = 'scheduled'
       AND datetime(scheduled_for) <= datetime('now')
       AND (locked_until IS NULL OR datetime(locked_until) < datetime('now'))
     ORDER BY datetime(scheduled_for) ASC
     LIMIT ?1`
  )
    .bind(limit)
    .all<Record<string, unknown>>()
    .catch(() => ({ results: [] as Record<string, unknown>[] }))

  let queued = 0
  let failed = 0
  for (const row of rows.results || []) {
    const id = normalizeText(row.id)
    if (!id) continue
    const eventType = resolveEmailEventType(row.event_type)
    const recipient = normalizeEmailAddress(row.recipient)
    const payload = parseJsonObject(normalizeText(row.payload_json), {})
    const locked = await env.DB.prepare(
      "UPDATE notification_schedule SET status = 'processing', attempts = attempts + 1, locked_until = datetime('now', '+5 minutes'), updated_at = datetime('now') WHERE id = ?1 AND status = 'scheduled'"
    )
      .bind(id)
      .run()
      .catch(() => ({ meta: { changes: 0 } }))
    if (!Number(locked.meta?.changes || 0)) continue
    try {
      if (!eventType || !recipient) throw new Error("scheduled_notification_invalid")
      const rendered = renderTransactionalEmail(eventType, { ...payload, recipient }, payload.locale)
      const jobId = await enqueueEmailJob(env, {
        idempotencyKey: normalizeText(row.idempotency_key) || `scheduled:${id}`,
        emailType: eventType,
        recipient,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        linkedUserId: normalizeText(row.linked_user_id) || null,
        linkedTicketId: normalizeText(row.linked_ticket_id) || null,
        templateData: payload,
        headers: {
          "Message-ID": emailMessageId("scheduled", id),
          "Auto-Submitted": "auto-generated",
        },
      })
      await env.DB.prepare(
        "INSERT INTO notification_deliveries (id, schedule_id, email_job_id, event_type, recipient, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))"
      )
        .bind(crypto.randomUUID(), id, jobId || null, eventType, recipient, jobId ? "queued" : "suppressed")
        .run()
        .catch(() => null)
      await env.DB.prepare("UPDATE notification_schedule SET status = ?1, processed_at = datetime('now'), locked_until = NULL, updated_at = datetime('now') WHERE id = ?2")
        .bind(jobId ? "queued" : "suppressed", id)
        .run()
      queued += jobId ? 1 : 0
    } catch (error) {
      failed += 1
      const message = clampText(error instanceof Error ? error.message : String(error || "scheduled_email_failed"), 700)
      await env.DB.prepare("UPDATE notification_schedule SET status = 'failed', last_error = ?1, locked_until = NULL, updated_at = datetime('now') WHERE id = ?2")
        .bind(message, id)
        .run()
        .catch(() => null)
    }
  }
  return { processed: rows.results?.length || 0, queued, failed }
}

async function runEmailCron(env: Env): Promise<{ skipped: boolean; reason?: string; scheduled: { processed: number; queued: number; failed: number }; outbox: { processed: number; sent: number; skipped: number } }> {
  const empty = {
    scheduled: { processed: 0, queued: 0, failed: 0 },
    outbox: { processed: 0, sent: 0, skipped: 0 },
  }
  const lock = await acquireEmailCronLock(env)
  if (!lock.acquired) return { skipped: true, reason: "cron_lock_held", ...empty }
  try {
    const scheduled = await processScheduledEmailNotifications(env)
    const outbox = await processEmailOutbox(env)
    return { skipped: false, scheduled, outbox }
  } finally {
    await releaseEmailCronLock(env, lock)
  }
}

function scheduleEmailProcessing(env: Env, ctx?: ExecutionContext): void {
  if (!ctx || !emailOutboundEnabled(env)) return
  ctx.waitUntil(processEmailOutbox(env).catch((error) => {
    console.error(JSON.stringify({ event: "email_outbox_processing_failed", error: error instanceof Error ? error.message : String(error) }))
  }))
}

async function queueSupportTicketConfirmation(
  env: Env,
  thread: SupportThreadRow,
  userId: string | null,
  messageId: string,
  ctx?: ExecutionContext
): Promise<void> {
  try {
    const recipient = normalizeEmailAddress(thread.email)
    if (!recipient) return
    const ticketNumber = supportTicketNumber(thread)
    const ticketUrl = supportTicketUrl(env, thread.id)
    const replyTo = await createSupportReplyAddress(env, thread.id)
    const rendered = renderTransactionalEmail("support.ticket_created", {
      subject: `SaturnWS Support ${ticketNumber}: ${thread.subject}`,
      support_subject: thread.subject,
      ticket_number: ticketNumber,
      ticket_id: thread.id,
      ticket_url: ticketUrl,
    }, "ar", replyTo)
    await enqueueEmailJob(env, {
      idempotencyKey: `support-confirmation:${thread.id}:${messageId}`,
      emailType: rendered.event_type,
      recipient,
      replyTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      linkedUserId: userId,
      linkedTicketId: thread.id,
      templateData: { ticket_number: ticketNumber, thread_id: thread.id },
      headers: {
        "Message-ID": emailMessageId("support-confirmation", messageId),
        "Auto-Submitted": "auto-generated",
      },
    })
    scheduleEmailProcessing(env, ctx)
  } catch (error) {
    console.error(JSON.stringify({ event: "support_confirmation_enqueue_failed", error: error instanceof Error ? error.message : String(error) }))
  }
}

async function queueSupportAdminReplyEmail(
  env: Env,
  thread: SupportThreadRow,
  messageId: string,
  message: string,
  ctx?: ExecutionContext
): Promise<void> {
  try {
    const recipient = normalizeEmailAddress(thread.email)
    if (!recipient) return
    const ticketNumber = supportTicketNumber(thread)
    const ticketUrl = supportTicketUrl(env, thread.id)
    const replyTo = await createSupportReplyAddress(env, thread.id)
    const rendered = renderTransactionalEmail("support.admin_replied", {
      subject: `SaturnWS Support ${ticketNumber}: ${thread.subject}`,
      support_subject: thread.subject,
      ticket_number: ticketNumber,
      ticket_id: thread.id,
      ticket_url: ticketUrl,
      message,
    }, "ar", replyTo)
    await enqueueEmailJob(env, {
      idempotencyKey: `support-admin-reply:${thread.id}:${messageId}`,
      emailType: rendered.event_type,
      recipient,
      replyTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      linkedUserId: thread.user_id,
      linkedTicketId: thread.id,
      templateData: { ticket_number: ticketNumber, thread_id: thread.id },
      headers: {
        "Message-ID": emailMessageId("support-reply", messageId),
        "In-Reply-To": emailMessageId("support-thread", thread.id),
        References: emailMessageId("support-thread", thread.id),
      },
    })
    scheduleEmailProcessing(env, ctx)
  } catch (error) {
    console.error(JSON.stringify({ event: "support_reply_enqueue_failed", error: error instanceof Error ? error.message : String(error) }))
  }
}

async function queueSupportStatusEmail(env: Env, thread: SupportThreadRow, status: string, ctx?: ExecutionContext): Promise<void> {
  try {
    const recipient = normalizeEmailAddress(thread.email)
    if (!recipient) return
    const normalized = normalizeLower(status)
    if (!["open", "closed", "resolved"].includes(normalized)) return
    const ticketNumber = supportTicketNumber(thread)
    const ticketUrl = supportTicketUrl(env, thread.id)
    const replyTo = await createSupportReplyAddress(env, thread.id)
    const rendered = renderTransactionalEmail("support.status_changed", {
      subject: `SaturnWS Support ${ticketNumber}: status ${normalized}`,
      ticket_number: ticketNumber,
      ticket_id: thread.id,
      ticket_url: ticketUrl,
      status: normalized,
    }, "ar", replyTo)
    await enqueueEmailJob(env, {
      idempotencyKey: `support-status:${thread.id}:${normalized}:${Date.now()}`,
      emailType: rendered.event_type,
      recipient,
      replyTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      linkedUserId: thread.user_id,
      linkedTicketId: thread.id,
      templateData: { ticket_number: ticketNumber, thread_id: thread.id, status: normalized },
      headers: {
        "Message-ID": emailMessageId(`support-${normalized}`, crypto.randomUUID()),
        "In-Reply-To": emailMessageId("support-thread", thread.id),
        References: emailMessageId("support-thread", thread.id),
      },
    })
    scheduleEmailProcessing(env, ctx)
  } catch (error) {
    console.error(JSON.stringify({ event: "support_status_enqueue_failed", error: error instanceof Error ? error.message : String(error) }))
  }
}

async function verifyResendWebhookSignature(request: Request, rawBody: string, env: Env): Promise<{ eventId: string }> {
  const secret = normalizeText(env.RESEND_WEBHOOK_SECRET)
  if (!secret) throw new Error("webhook_secret_missing")
  const svixId = normalizeText(request.headers.get("svix-id") || request.headers.get("webhook-id"))
  const timestamp = normalizeText(request.headers.get("svix-timestamp") || request.headers.get("webhook-timestamp"))
  const signatureHeader = normalizeText(request.headers.get("svix-signature") || request.headers.get("webhook-signature"))
  if (!svixId || !timestamp || !signatureHeader) throw new Error("webhook_signature_missing")
  const timestampSeconds = Number(timestamp)
  if (!Number.isFinite(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > EMAIL_WEBHOOK_TOLERANCE_SECONDS) {
    throw new Error("webhook_timestamp_invalid")
  }
  const keyText = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret
  const cryptoKey = await crypto.subtle.importKey("raw", base64ToBytes(keyText), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const signedContent = `${svixId}.${timestamp}.${rawBody}`
  const expected = bytesToBase64(new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(signedContent))))
  const candidates = signatureHeader
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.includes(",") ? item.split(",").slice(1).join(",") : item)
  for (const candidate of candidates) {
    if (await safeEqualHashed(candidate, expected)) return { eventId: svixId }
  }
  throw new Error("webhook_signature_invalid")
}

async function storeEmailEvent(
  env: Env,
  input: { providerEventId: string; eventType: string; providerMessageId?: string | null; emailJobId?: string | null; payload?: Record<string, unknown> }
): Promise<"created" | "duplicate"> {
  const eventId = crypto.randomUUID()
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO email_events (id, provider, provider_event_id, event_type, provider_message_id, email_job_id, payload_json, created_at)
     VALUES (?1, 'resend', ?2, ?3, ?4, ?5, ?6, datetime('now'))`
  )
    .bind(
      eventId,
      input.providerEventId,
      input.eventType,
      input.providerMessageId || null,
      input.emailJobId || null,
      toJsonText(input.payload || {}, {})
    )
    .run()
  return Number(result.meta?.changes || 0) > 0 ? "created" : "duplicate"
}

function getObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stringListFromUnknown(value: unknown): string[] {
  if (!value) return []
  if (typeof value === "string") return [value]
  if (!Array.isArray(value)) {
    const record = getObject(value)
    const email = normalizeEmailAddress(record.email || record.address || record.value)
    return email ? [email] : []
  }
  return value
    .map((item) => {
      if (typeof item === "string") return item
      const record = getObject(item)
      return normalizeText(record.email || record.address || record.value)
    })
    .filter(Boolean)
}

function providerMessageIdFromPayload(data: Record<string, unknown>): string {
  return normalizeText(data.email_id || data.id || data.message_id || data.messageId || data.emailId)
}

async function findEmailJobByProviderMessage(env: Env, providerMessageId: string): Promise<EmailJobRow | null> {
  if (!providerMessageId) return null
  return await env.DB.prepare("SELECT * FROM email_jobs WHERE provider_message_id = ?1 ORDER BY datetime(created_at) DESC LIMIT 1")
    .bind(providerMessageId)
    .first<EmailJobRow>()
    .catch(() => null)
}

async function handleResendDeliveryEvent(env: Env, eventType: string, data: Record<string, unknown>): Promise<void> {
  const providerMessageId = providerMessageIdFromPayload(data)
  const job = await findEmailJobByProviderMessage(env, providerMessageId)
  const recipient = normalizeEmailAddress(data.to || data.recipient || job?.recipient)

  if (eventType === "email.sent" || eventType === "email.scheduled") {
    await env.DB.prepare(
      "UPDATE email_jobs SET status = 'sent', updated_at = datetime('now'), last_error = NULL WHERE provider_message_id = ?1 AND status <> 'delivered'"
    )
      .bind(providerMessageId)
      .run()
    return
  }

  if (eventType === "email.delivered") {
    await env.DB.prepare(
      "UPDATE email_jobs SET status = 'delivered', delivered_at = datetime('now'), updated_at = datetime('now'), last_error = NULL WHERE provider_message_id = ?1"
    )
      .bind(providerMessageId)
      .run()
    return
  }

  if (eventType === "email.bounced" || eventType === "email.complained") {
    const status = eventType === "email.bounced" ? "bounced" : "complained"
    const reason = clampText(data.reason || data.message || status, 500)
    await env.DB.prepare("UPDATE email_jobs SET status = ?1, updated_at = datetime('now'), last_error = ?2 WHERE provider_message_id = ?3")
      .bind(status, reason, providerMessageId)
      .run()
    if (recipient) {
      await env.DB.prepare(
        "INSERT INTO email_recipient_flags (email, status, reason, provider_message_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now')) ON CONFLICT(email) DO UPDATE SET status = excluded.status, reason = excluded.reason, provider_message_id = excluded.provider_message_id, updated_at = datetime('now')"
      )
        .bind(recipient, status, reason || null, providerMessageId || null)
        .run()
    }
    return
  }

  if (eventType === "email.suppressed") {
    const reason = clampText(data.reason || data.message || "provider_suppressed", 500)
    await env.DB.prepare("UPDATE email_jobs SET status = 'suppressed', updated_at = datetime('now'), last_error = ?1 WHERE provider_message_id = ?2")
      .bind(reason, providerMessageId)
      .run()
    if (recipient) {
      await env.DB.prepare(
        "INSERT INTO email_recipient_flags (email, status, reason, provider_message_id, created_at, updated_at) VALUES (?1, 'suppressed', ?2, ?3, datetime('now'), datetime('now')) ON CONFLICT(email) DO UPDATE SET status = 'suppressed', reason = excluded.reason, provider_message_id = excluded.provider_message_id, updated_at = datetime('now')"
      )
        .bind(recipient, reason || null, providerMessageId || null)
        .run()
    }
    return
  }

  if (eventType === "email.failed") {
    const reason = clampText(data.reason || data.message || "provider_failed", 500)
    await env.DB.prepare("UPDATE email_jobs SET status = 'failed', updated_at = datetime('now'), last_error = ?1 WHERE provider_message_id = ?2")
      .bind(reason, providerMessageId)
      .run()
    return
  }

  if (eventType === "email.delivery_delayed" || eventType === "email.delayed") {
    const reason = clampText(data.reason || data.message || "delivery_delayed", 500)
    await env.DB.prepare("UPDATE email_jobs SET last_error = ?1, updated_at = datetime('now') WHERE provider_message_id = ?2")
      .bind(reason, providerMessageId)
      .run()
  }
}

async function retrieveReceivedEmail(env: Env, emailId: string): Promise<Record<string, unknown>> {
  const apiKey = normalizeText(env.RESEND_RECEIVE_API_KEY)
  if (!apiKey) throw new Error("resend_receive_api_key_missing")
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "SaturnWS-Policy-Worker/1.0",
    },
  })
  const payload = (await response.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(normalizeText(payload.message || payload.error || `resend_receive_${response.status}`) || "received_email_fetch_failed")
  }
  const data = getObject(payload.data)
  return Object.keys(data).length ? data : payload
}

function extractReplyTokenFromRecipients(recipients: string[]): string {
  for (const raw of recipients) {
    const address = normalizeText(raw).toLowerCase()
    const match = address.match(/\breply\+([a-f0-9]{32,128})@/)
    if (match?.[1]) return match[1]
  }
  return ""
}

async function findSupportReplyToken(env: Env, token: string): Promise<SupportReplyTokenRow | null> {
  if (!token) return null
  const tokenHash = await sha256Hex(token)
  return await env.DB.prepare("SELECT * FROM support_reply_tokens WHERE token_hash = ?1 AND active = 1 LIMIT 1")
    .bind(tokenHash)
    .first<SupportReplyTokenRow>()
    .catch(() => null)
}

function emailBodyFromReceivedEmail(message: Record<string, unknown>): { text: string; html: string } {
  const rawText = clampMultilineText(message.text || message.text_body || message.body_text || "", 10000)
  const rawHtml = stripDangerousHtml(message.html || message.html_body || message.body_html || "")
  const text = trimQuotedEmailHistory(rawText || htmlToText(rawHtml))
  return { text, html: rawHtml }
}

async function processInboundSupportReply(
  env: Env,
  input: { providerEventId: string; emailId: string; message: Record<string, unknown> }
): Promise<{ status: string; thread_id?: string; reason?: string }> {
  const message = input.message
  const from = normalizeEmailAddress(message.from || message.sender || getObject(message.from).email)
  const recipients = [
    ...stringListFromUnknown(message.to),
    ...stringListFromUnknown(message.cc),
    ...stringListFromUnknown(message.envelope_to),
    ...stringListFromUnknown(message.recipients),
  ]
  const recipient = recipients.map(normalizeEmailAddress).find(Boolean) || normalizeEmailAddress(message.to)
  const tokenValue = extractReplyTokenFromRecipients(recipients)
  const token = await findSupportReplyToken(env, tokenValue)
  const subject = clampText(message.subject, 300)
  const providerMessageId = normalizeText(message.message_id || message.messageId || message.id)
  const references = clampText(message.references || message.references_header, 1000)
  const inReplyTo = clampText(message.in_reply_to || message.inReplyTo, 500)
  const attachments = Array.isArray(message.attachments) ? message.attachments : []
  const body = emailBodyFromReceivedEmail(message)
  const inboundId = crypto.randomUUID()

  if (!token) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO inbound_email_messages
       (id, provider_email_id, provider_event_id, sender_email, recipient_email, subject, message_id, in_reply_to, references_header, text_body, html_sanitized, attachments_json, status, rejection_reason, received_at, processed_at, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'rejected', 'reply_token_not_found', datetime('now'), datetime('now'), datetime('now'))`
    )
      .bind(inboundId, input.emailId || null, input.providerEventId, from || null, recipient || null, subject || null, providerMessageId || null, inReplyTo || null, references || null, body.text || null, body.html || null, toJsonText(attachments, []))
      .run()
    return { status: "rejected", reason: "reply_token_not_found" }
  }

  const thread = await env.DB.prepare("SELECT * FROM support_threads WHERE id = ?1 LIMIT 1")
    .bind(token.thread_id)
    .first<SupportThreadRow>()
  if (!thread) return { status: "rejected", reason: "thread_not_found" }

  const expectedSender = normalizeEmailAddress(thread.email)
  if (expectedSender && from && expectedSender !== from) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO inbound_email_messages
       (id, provider_email_id, provider_event_id, thread_id, reply_token_id, sender_email, recipient_email, subject, message_id, in_reply_to, references_header, text_body, html_sanitized, attachments_json, status, rejection_reason, received_at, processed_at, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'rejected', 'sender_mismatch', datetime('now'), datetime('now'), datetime('now'))`
    )
      .bind(inboundId, input.emailId || null, input.providerEventId, thread.id, token.id, from || null, recipient || null, subject || null, providerMessageId || null, inReplyTo || null, references || null, body.text || null, body.html || null, toJsonText(attachments, []))
      .run()
    return { status: "rejected", thread_id: thread.id, reason: "sender_mismatch" }
  }

  if (!body.text) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO inbound_email_messages
       (id, provider_email_id, provider_event_id, thread_id, reply_token_id, sender_email, recipient_email, subject, message_id, in_reply_to, references_header, html_sanitized, attachments_json, status, rejection_reason, received_at, processed_at, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'rejected', 'empty_body', datetime('now'), datetime('now'), datetime('now'))`
    )
      .bind(inboundId, input.emailId || null, input.providerEventId, thread.id, token.id, from || null, recipient || null, subject || null, providerMessageId || null, inReplyTo || null, references || null, body.html || null, toJsonText(attachments, []))
      .run()
    return { status: "rejected", thread_id: thread.id, reason: "empty_body" }
  }

  await env.DB.prepare(
    `INSERT OR IGNORE INTO inbound_email_messages
     (id, provider_email_id, provider_event_id, thread_id, reply_token_id, sender_email, recipient_email, subject, message_id, in_reply_to, references_header, text_body, html_sanitized, attachments_json, status, received_at, processed_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'processed', datetime('now'), datetime('now'), datetime('now'))`
  )
    .bind(inboundId, input.emailId || null, input.providerEventId, thread.id, token.id, from || null, recipient || null, subject || null, providerMessageId || null, inReplyTo || null, references || null, body.text, body.html || null, toJsonText(attachments, []))
    .run()
  await env.DB.prepare("INSERT INTO support_messages (id, thread_id, sender, body, created_at) VALUES (?1, ?2, 'user', ?3, datetime('now'))")
    .bind(crypto.randomUUID(), thread.id, body.text)
    .run()
  await env.DB.prepare("UPDATE support_threads SET status = 'waiting_for_support', updated_at = datetime('now') WHERE id = ?1")
    .bind(thread.id)
    .run()
  await env.DB.prepare("UPDATE support_reply_tokens SET last_used_at = datetime('now') WHERE id = ?1")
    .bind(token.id)
    .run()
  return { status: "processed", thread_id: thread.id }
}

async function handleResendWebhook(request: Request, env: Env): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") || 0)
  if (contentLength > EMAIL_WEBHOOK_MAX_BYTES) return json({ success: false, error: "payload_too_large" }, 413)
  const rawBody = await request.text()
  if (rawBody.length > EMAIL_WEBHOOK_MAX_BYTES) return json({ success: false, error: "payload_too_large" }, 413)

  let signature: { eventId: string }
  try {
    signature = await verifyResendWebhookSignature(request, rawBody, env)
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "webhook_signature_invalid" }, 401)
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return json({ success: false, error: "invalid_json" }, 400)
  }
  const eventType = normalizeLower(payload.type || payload.event || payload.event_type)
  const data = getObject(payload.data)
  if (!EMAIL_KNOWN_EVENTS.has(eventType)) return json({ success: true, ignored: true, event_type: eventType })
  const providerMessageId = providerMessageIdFromPayload(data)
  const job = await findEmailJobByProviderMessage(env, providerMessageId)
  const stored = await storeEmailEvent(env, {
    providerEventId: signature.eventId,
    eventType,
    providerMessageId,
    emailJobId: job?.id || null,
    payload,
  })
  if (stored === "duplicate") return json({ success: true, duplicate: true })

  if (eventType === "email.received") {
    if (!emailInboundEnabled(env)) return json({ success: true, inbound_enabled: false })
    const emailId = providerMessageIdFromPayload(data)
    if (!emailId) return json({ success: false, error: "received_email_id_missing" }, 400)
    const message = await retrieveReceivedEmail(env, emailId)
    const result = await processInboundSupportReply(env, { providerEventId: signature.eventId, emailId, message })
    await env.DB.prepare("UPDATE email_events SET processed_at = datetime('now') WHERE provider_event_id = ?1").bind(signature.eventId).run()
    return json({ success: true, inbound_enabled: true, ...result })
  }

  await handleResendDeliveryEvent(env, eventType, data)
  await env.DB.prepare("UPDATE email_events SET processed_at = datetime('now') WHERE provider_event_id = ?1").bind(signature.eventId).run()
  return json({ success: true, event_type: eventType })
}

async function handleAdminEmailStatus(env: Env): Promise<Response> {
  const queued = await env.DB.prepare("SELECT status, COUNT(*) AS count FROM email_jobs GROUP BY status").all<{ status: string; count: number }>().catch(() => ({ results: [] as Array<{ status: string; count: number }> }))
  let jobResults: unknown[] = []
  try {
    const jobs = await env.DB.prepare(
      "SELECT id, email_type, catalog_event_type, template_key, template_version, email_category, recipient, sender, subject, linked_user_id, linked_ticket_id, status, attempt_count, max_attempts, provider_message_id, last_error, last_attempt_at, sent_at, delivered_at, created_at, updated_at FROM email_jobs ORDER BY datetime(created_at) DESC LIMIT 100"
    ).all()
    jobResults = jobs.results || []
  } catch {
    const jobs = await env.DB.prepare(
      "SELECT id, email_type, recipient, sender, subject, linked_user_id, linked_ticket_id, status, attempt_count, max_attempts, provider_message_id, last_error, last_attempt_at, sent_at, delivered_at, created_at, updated_at FROM email_jobs ORDER BY datetime(created_at) DESC LIMIT 100"
    )
      .all()
      .catch(() => ({ results: [] as unknown[] }))
    jobResults = jobs.results || []
  }
  const inbound = await env.DB.prepare(
    "SELECT id, provider_email_id, thread_id, sender_email, recipient_email, subject, status, rejection_reason, received_at, processed_at, created_at FROM inbound_email_messages ORDER BY datetime(created_at) DESC LIMIT 100"
  )
    .all()
    .catch(() => ({ results: [] }))
  const providerEvents = await env.DB.prepare(
    "SELECT id, event_type, provider_message_id, email_job_id, processed_at, created_at FROM email_events ORDER BY datetime(created_at) DESC LIMIT 80"
  )
    .all()
    .catch(() => ({ results: [] }))
  const recipientFlags = await env.DB.prepare(
    "SELECT email, status, reason, provider_message_id, created_at, updated_at FROM email_recipient_flags ORDER BY datetime(updated_at) DESC LIMIT 80"
  )
    .all()
    .catch(() => ({ results: [] }))
  const scheduled = await env.DB.prepare(
    "SELECT id, event_type, recipient, status, scheduled_for, attempts, last_error, linked_user_id, linked_ticket_id, created_at, updated_at FROM notification_schedule ORDER BY datetime(scheduled_for) DESC LIMIT 80"
  )
    .all()
    .catch(() => ({ results: [] }))
  const catalog = emailCatalogList()
  const now = new Date().toISOString()
  return json({
    success: true,
    config: {
      outbound_enabled: emailOutboundEnabled(env),
      inbound_enabled: emailInboundEnabled(env),
      scheduler_enabled: emailSchedulerEnabled(env),
      category_flags: {
        support: envFlag(env.EMAIL_SUPPORT_ENABLED, true),
        auth: envFlag(env.EMAIL_AUTH_ENABLED, false),
        billing: envFlag(env.EMAIL_BILLING_ENABLED, false),
        release: envFlag(env.EMAIL_RELEASE_ENABLED, false),
        security: envFlag(env.EMAIL_SECURITY_ENABLED, false),
      },
      has_resend_send_api_key: Boolean(normalizeText(env.RESEND_SEND_API_KEY)),
      has_resend_receive_api_key: Boolean(normalizeText(env.RESEND_RECEIVE_API_KEY)),
      has_resend_webhook_secret: Boolean(normalizeText(env.RESEND_WEBHOOK_SECRET)),
      from: emailFromSupport(env),
      sender_identities: {
        general: configuredSenderForEvent(env, "admin.email_test").from,
        support: configuredSenderForEvent(env, "support.admin_replied").from,
        security: configuredSenderForEvent(env, "security.new_login").from,
        billing: configuredSenderForEvent(env, "billing.payment_succeeded").from,
        account: configuredSenderForEvent(env, "account.welcome").from,
      },
      reply_domain: emailReplyDomain(env),
      webhook_path: "/api/webhooks/resend",
    },
    generated_at: now,
    catalog,
    metrics: {
      catalog_total: catalog.length,
      catalog_linked: catalog.filter((item) => item.integration_status === "linked").length,
      catalog_prepared: catalog.filter((item) => item.integration_status === "prepared").length,
      catalog_disabled: catalog.filter((item) => item.integration_status === "disabled").length,
      latest_event_at: (providerEvents.results || [])[0]?.created_at || null,
    },
    counts: queued.results || [],
    jobs: jobResults,
    inbound: inbound.results || [],
    provider_events: providerEvents.results || [],
    recipient_flags: recipientFlags.results || [],
    scheduled: scheduled.results || [],
  })
}

async function handleAdminEmailRetry(request: Request, env: Env): Promise<Response> {
  const body = (await request.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
  const jobId = normalizeText(body.job_id || body.id)
  if (!jobId) return json({ success: false, error: "job_id_required" }, 400)
  await env.DB.prepare(
    "UPDATE email_jobs SET status = 'queued', next_attempt_at = datetime('now'), last_error = NULL, updated_at = datetime('now') WHERE id = ?1"
  )
    .bind(jobId)
    .run()
  const processed = await processEmailOutbox(env, 1)
  return json({ success: true, processed })
}

async function handleAdminEmailTest(request: Request, env: Env): Promise<Response> {
  const body = (await request.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
  const recipient = normalizeEmailAddress(body.recipient || body.email || body.to)
  if (!recipient) return json({ success: false, error: "recipient_required" }, 400)
  const eventType = resolveEmailEventType(body.email_type || body.event_type || "admin.email_test")
  if (!eventType) return json({ success: false, error: "email_event_not_cataloged" }, 400)
  const catalog = EMAIL_CATALOG[eventType]
  if (!catalog.admin_test_allowed) return json({ success: false, error: "email_event_test_not_allowed" }, 400)
  const templateData = {
    ...sampleTemplateData(eventType),
    subject: sanitizeHeaderValue(body.subject || ""),
    message: clampMultilineText(body.message || "This is a SaturnWS operational email test from admin panel.", 1000),
    locale: normalizeLower(body.locale || "en") === "ar" ? "ar" : "en",
  }
  const rendered = renderTransactionalEmail(eventType, templateData, templateData.locale)
  const jobId = await enqueueEmailJob(env, {
    idempotencyKey: `admin-test:${recipient}:${Date.now()}`,
    emailType: rendered.event_type,
    recipient,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    templateData,
    headers: {
      "Message-ID": emailMessageId("admin-test", crypto.randomUUID()),
      "Auto-Submitted": "auto-generated",
      "X-SaturnWS-Test": "true",
    },
  })
  if (!jobId) return json({ success: false, error: "email_event_disabled_or_suppressed" }, 409)
  const processed = await processEmailOutbox(env, 1)
  return json({ success: true, job_id: jobId, processed })
}

async function handleAdminEmailPreview(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const body = request.method === "POST" ? ((await request.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>) : {}
  const eventType = resolveEmailEventType(body.email_type || body.event_type || url.searchParams.get("email_type") || url.searchParams.get("event_type") || "admin.email_test")
  if (!eventType) return json({ success: false, error: "email_event_not_cataloged" }, 400)
  const locale = normalizeLower(body.locale || url.searchParams.get("locale") || "en") === "ar" ? "ar" : "en"
  const data = {
    ...sampleTemplateData(eventType),
    ...(getObject(body.template_data)),
    locale,
  }
  const rendered = renderTransactionalEmail(eventType, data, locale)
  return json({
    success: true,
    event: EMAIL_CATALOG[eventType],
    sender: configuredSenderForEvent(env, eventType),
    preview: rendered,
  })
}

async function handleAdminEmailProcess(env: Env): Promise<Response> {
  return json({ success: true, processed: await runEmailCron(env) })
}


async function adminAuthorized(request: Request, env: Env): Promise<boolean> {
  const expected = normalizeLower(env.ADMIN_TOKEN_SHA256)
  if (!expected || expected.length < 64) return false
  const bearer = normalizeText(request.headers.get("Authorization"))
  const headerToken = normalizeText(request.headers.get("X-Saturn-Admin-Token"))
  const token = bearer.toLowerCase().startsWith("bearer ") ? bearer.slice("bearer ".length).trim() : headerToken
  if (!token || token.length < 24) return false
  return safeEqual(await sha256Hex(token), expected)
}

async function requireAdmin(request: Request, env: Env): Promise<Response | null> {
  if (await adminAuthorized(request, env)) return null
  return json({ success: false, error: "admin_unauthorized" }, 401)
}

function decisionResponse(input: {
  decision: Decision
  reason?: string
  message?: string
  features?: Record<string, unknown>
  limits?: Record<string, unknown>
  blockedActions?: string[]
  plan?: string
  ttlSeconds: number
  sticky?: boolean
}): Record<string, unknown> {
  const now = new Date()
  const ttl = Math.max(30, Math.min(300, input.ttlSeconds || 120))
  const expires = new Date(now.getTime() + ttl * 1000)
  return {
    success: true,
    decision: input.decision,
    allow: input.decision === "allow",
    reason: input.reason || input.decision,
    message: input.message || "",
    plan: input.plan || "",
    features: input.features || {},
    limits: input.limits || {},
    blocked_actions: input.blockedActions || [],
    issued_at: now.toISOString(),
    expires_at: expires.toISOString(),
    ttl_seconds: ttl,
    sticky: input.sticky ?? input.decision !== "allow",
  }
}

function mapAuthError(error: string): Decision {
  const key = normalizeLower(error)
  if (["subscription_expired", "subscription_inactive", "subscription_required", "subscription_not_found", "license_expired", "license_inactive"].includes(key)) {
    return "subscription_expired"
  }
  if (/^auth_5\d\d$/.test(key) || ["auth_522", "auth_523", "auth_524", "auth_520", "auth_521", "auth_403"].includes(key)) {
    return "policy_unavailable"
  }
  if (["auth_unreachable", "policy_unavailable", "internal_error"].includes(key)) return "policy_unavailable"
  return "deny_user"
}

function subscriptionIsUsable(row: SubscriptionRow | null | undefined): boolean {
  if (!row) return false
  if (!["active", "trialing"].includes(normalizeLower(row.status))) return false
  if (!row.expires_at) return true
  const ts = Date.parse(row.expires_at)
  return !Number.isFinite(ts) || ts > Date.now()
}

function stagingTokenAllowed(request: Request, env: Env): boolean {
  const configured = normalizeText(env.POLICY_STAGING_TOKEN)
  if (!configured) return false
  const provided = normalizeText(request.headers.get("X-SATURN-POLICY-STAGING-TOKEN"))
  return provided.length >= 24 && provided === configured
}

async function verifyAuthSession(request: Request, env: Env, body: PolicyRequest): Promise<AuthResolved> {
  const bearer = normalizeText(request.headers.get("Authorization"))
  const token = bearer.toLowerCase().startsWith("bearer ") ? bearer.slice("bearer ".length).trim() : ""
  const hwid = normalizeText(body.device_id || request.headers.get("X-SATURN-HWID"))
  const verifyUrl = normalizeText(env.AUTH_VERIFY_URL)
  if (!token || !verifyUrl || !hwid) {
    return { ok: false, decision: "deny_user", reason: "missing_session" }
  }

  try {
    const authRequest = new Request(verifyUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "SaturnWorkspace-DeviceAuth/1",
      },
      body: JSON.stringify({ session_token: token, hwid }),
    })
    const res = env.AUTH_SERVICE ? await env.AUTH_SERVICE.fetch(authRequest) : await fetch(authRequest)
    const payload = await res.json<Record<string, any>>().catch(() => null)
    if (!res.ok || !payload?.success) {
      const error = normalizeText(payload?.error || `auth_${res.status}`)
      return { ok: false, decision: mapAuthError(error), reason: error }
    }
    const policy = payload.policy && typeof payload.policy === "object" ? payload.policy : {}
    return {
      ok: true,
      user_id: normalizeText(payload.user_id || payload.license_id || body.user_id),
      email: normalizeLower(payload.user_email || body.email),
      plan_id: normalizeLower(payload.tier || payload.plan || "default") || "default",
      expires_at: normalizeText(payload.session_expires_at || payload.expires_at) || null,
      features: policy.runtime_payload || {},
      limits: {},
    }
  } catch {
    return { ok: false, decision: "policy_unavailable", reason: "auth_verify_unreachable" }
  }
}

async function lookupUser(env: Env, body: PolicyRequest, auth: AuthResolved): Promise<UserRow | null> {
  const userId = normalizeText(auth.user_id || body.user_id)
  const email = normalizeLower(auth.email || body.email)
  if (userId) {
    const row = await env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(userId).first<UserRow>()
    if (row) return row
  }
  if (email) {
    const row = await env.DB.prepare("SELECT * FROM users WHERE lower(email) = ?1").bind(email).first<UserRow>()
    if (row) return row
  }
  if (userId || email) {
    const id = userId || `email:${email}`
    await env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, email, status, role, plan_id) VALUES (?1, ?2, 'active', 'user', ?3)"
    )
      .bind(id, email || null, normalizeLower(auth.plan_id || "default") || "default")
      .run()
    return await env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(id).first<UserRow>()
  }
  return null
}

async function lookupSubscription(env: Env, user: UserRow | null, auth: AuthResolved): Promise<SubscriptionRow | null> {
  if (!user) return null
  const rows = await env.DB.prepare(
    "SELECT * FROM subscriptions WHERE user_id = ?1 ORDER BY CASE WHEN status IN ('active', 'trialing') AND (expires_at IS NULL OR datetime(expires_at) > datetime('now')) THEN 1 ELSE 0 END DESC, datetime(COALESCE(expires_at, '9999-12-31T00:00:00Z')) DESC, datetime(updated_at) DESC LIMIT 20"
  )
    .bind(user.id)
    .all<SubscriptionRow>()
  const existing = rows.results || []
  const usable = existing.find(subscriptionIsUsable)
  if (auth.ok) {
    const id = `auth:${user.id}`
    await env.DB.prepare(
      "INSERT INTO subscriptions (id, user_id, plan_id, status, expires_at, updated_at) VALUES (?1, ?2, ?3, 'active', ?4, datetime('now')) ON CONFLICT(id) DO UPDATE SET plan_id = excluded.plan_id, status = 'active', expires_at = excluded.expires_at, updated_at = datetime('now')"
    )
      .bind(id, user.id, normalizeLower(auth.plan_id || user.plan_id || "default") || "default", auth.expires_at || null)
      .run()
    const authRow = await env.DB.prepare("SELECT * FROM subscriptions WHERE id = ?1").bind(id).first<SubscriptionRow>()
    if (subscriptionIsUsable(authRow)) return authRow
  }
  return usable || existing[0] || null
}

async function lookupOverride(env: Env, user: UserRow | null, email: string): Promise<PolicyOverrideRow | null> {
  const subjects = [user?.id, email].filter(Boolean)
  for (const subject of subjects) {
    const row = await env.DB.prepare(
      "SELECT * FROM policy_overrides WHERE scope = 'user' AND subject = ?1 ORDER BY datetime(updated_at) DESC LIMIT 1"
    )
      .bind(subject)
      .first<PolicyOverrideRow>()
    if (row) return row
  }
  return null
}

async function auditPolicy(env: Env, body: PolicyRequest, user: UserRow | null, decision: Decision, reason: string): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO policy_audit (id, user_id, email, install_id, device_id, app_version, channel, requested_action, decision, reason) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
    )
      .bind(
        crypto.randomUUID(),
        user?.id || normalizeText(body.user_id) || null,
        user?.email || normalizeLower(body.email) || null,
        normalizeText(body.install_id) || null,
        normalizeText(body.device_id) || null,
        normalizeText(body.app_version) || null,
        normalizeLower(body.channel) || null,
        normalizeLower(body.requested_action || "app_start") || null,
        decision,
        reason || decision
      )
      .run()
  } catch {
    // Audit must not affect policy enforcement.
  }
}

async function rememberInstall(env: Env, body: PolicyRequest, user: UserRow | null): Promise<void> {
  const installId = normalizeText(body.install_id)
  const deviceId = normalizeText(body.device_id)
  if (!installId && !deviceId) return
  const id = installId || `${user?.id || "unknown"}:${deviceId}`
  await env.DB.prepare(
    "INSERT INTO installs (id, user_id, device_id, install_id, status, last_seen_app_version, channel, platform, last_seen_at) VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?6, ?7, datetime('now')) ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, device_id = excluded.device_id, install_id = excluded.install_id, last_seen_app_version = excluded.last_seen_app_version, channel = excluded.channel, platform = excluded.platform, last_seen_at = datetime('now')"
  )
    .bind(
      id,
      user?.id || null,
      deviceId || null,
      installId || null,
      normalizeText(body.app_version) || null,
      normalizeLower(body.channel) || null,
      normalizeLower(body.platform) || null
    )
    .run()
}

async function evaluatePolicy(request: Request, env: Env, body: PolicyRequest): Promise<Record<string, unknown>> {
  const ttlSeconds = Number.parseInt(String(env.DEFAULT_TTL_SECONDS || "120"), 10) || 120
  const action = normalizeLower(body.requested_action || "app_start") || "app_start"
  const appVersion = normalizeLower(body.app_version)
  const global = await env.DB.prepare("SELECT * FROM global_policy WHERE id = 'global'").first<GlobalPolicyRow>()
  const globalBlocked = parseJsonArray(global?.blocked_actions_json)
  const globalFeatures = parseJsonObject(global?.features_json)
  const globalLimits = parseJsonObject(global?.limits_json)

  if (global?.kill_switch_enabled) {
    return decisionResponse({ decision: "global_kill_switch", reason: "kill_switch_enabled", ttlSeconds, sticky: true })
  }

  if (appVersion) {
    const disabled = await env.DB.prepare("SELECT version, reason FROM disabled_versions WHERE lower(version) = ?1")
      .bind(appVersion)
      .first<{ version: string; reason: string | null }>()
    if (disabled) {
      return decisionResponse({ decision: "disabled_version", reason: disabled.reason || "disabled_version", ttlSeconds, sticky: true })
    }
  }

  const minimumSupported = normalizeLower(global?.minimum_supported_version)
  const updateMode = normalizeLower(global?.update_mode || "optional")
  if (appVersion && minimumSupported && versionLt(appVersion, minimumSupported)) {
    return decisionResponse({ decision: "mandatory_update", reason: "minimum_supported_version", ttlSeconds, sticky: true })
  }
  if (global?.mandatory_update_enabled || ["mandatory", "required", "force"].includes(updateMode)) {
    try {
      if (await updateManifestRequiresAppUpdate(body)) {
        return decisionResponse({ decision: "mandatory_update", reason: "mandatory_update", ttlSeconds, sticky: true })
      }
    } catch {
      // The app performs the authoritative update gate from the signed OTA manifest.
      // Do not turn a transient manifest fetch failure into a permanent policy lock.
    }
  }

  const auth = await verifyAuthSession(request, env, body)
  const allowStagingIdentity = stagingTokenAllowed(request, env) && normalizeLower(body.email).endsWith("@saturnws.test")
  if (!auth.ok && !allowStagingIdentity) {
    return decisionResponse({ decision: auth.decision || "deny_user", reason: auth.reason || "unauthorized", ttlSeconds, sticky: true })
  }

  const user = await lookupUser(env, body, auth)
  if (!user) {
    return decisionResponse({ decision: "deny_user", reason: "user_not_found", ttlSeconds, sticky: true })
  }
  await rememberInstall(env, body, user)

  if (["disabled", "banned", "blocked"].includes(normalizeLower(user.status))) {
    return decisionResponse({ decision: "deny_user", reason: "user_disabled", ttlSeconds, sticky: true })
  }

  const email = normalizeLower(auth.email || body.email || user.email)
  const override = await lookupOverride(env, user, email)
  if (override && DECISIONS.has(override.decision) && override.decision !== "allow") {
    return decisionResponse({
      decision: override.decision,
      reason: override.reason || "policy_override",
      ttlSeconds,
      sticky: Boolean(override.sticky),
      features: parseJsonObject(override.features_json),
      limits: parseJsonObject(override.limits_json),
      blockedActions: parseJsonArray(override.blocked_actions_json),
    })
  }

  const subscription = await lookupSubscription(env, user, auth)
  if (!subscription || !["active", "trialing"].includes(normalizeLower(subscription.status))) {
    return decisionResponse({ decision: "subscription_expired", reason: "subscription_inactive", ttlSeconds, sticky: true })
  }
  if (!subscriptionIsUsable(subscription)) {
    return decisionResponse({ decision: "subscription_expired", reason: "subscription_expired", ttlSeconds, sticky: true })
  }

  const planId = normalizeLower(subscription.plan_id || user.plan_id || auth.plan_id || "default") || "default"
  const plan = await env.DB.prepare("SELECT * FROM plan_features WHERE plan_id = ?1").bind(planId).first<PlanFeaturesRow>()
  const planBlocked = parseJsonArray(plan?.blocked_actions_json)
  const blockedActions = [...new Set([...globalBlocked, ...planBlocked])]
  if (blockedActions.includes("*") || blockedActions.includes(action)) {
    return decisionResponse({
      decision: "plan_feature_not_allowed",
      reason: "blocked_action",
      ttlSeconds,
      sticky: false,
      plan: planId,
      blockedActions,
    })
  }

  return decisionResponse({
    decision: "allow",
    reason: "policy_allow",
    ttlSeconds,
    sticky: false,
    plan: planId,
    blockedActions,
    features: { ...globalFeatures, ...parseJsonObject(plan?.features_json), ...(auth.features || {}) },
    limits: { ...globalLimits, ...parseJsonObject(plan?.limits_json), ...(auth.limits || {}) },
  })
}

async function handlePolicyCheck(request: Request, env: Env): Promise<Response> {
  const body = await request.json<PolicyRequest>().catch(() => null)
  if (!body || typeof body !== "object") {
    const payload = signPayload(decisionResponse({ decision: "policy_unavailable", reason: "invalid_payload", ttlSeconds: 60, sticky: true }), env)
    return json(payload, 400)
  }
  const evaluated = await evaluatePolicy(request, env, body)
  const decision = normalizeLower(evaluated.decision) as Decision
  const reason = normalizeText(evaluated.reason || decision)
  const user = await lookupUser(env, body, { ok: false }).catch(() => null)
  await auditPolicy(env, body, user, decision, reason)
  return json(signPayload(evaluated, env))
}

async function requireSupportUser(request: Request, env: Env, body: PolicyRequest): Promise<{ body: PolicyRequest; auth: AuthResolved; user: UserRow; email: string; userId: string; installId: string; deviceId: string } | Response> {
  const auth = await verifyAuthSession(request, env, body)
  if (!auth.ok) return json({ success: false, error: auth.reason || "unauthorized" }, 401)
  const user = await lookupUser(env, body, auth)
  if (!user) return json({ success: false, error: "user_not_found" }, 403)
  await rememberInstall(env, body, user)
  return {
    body,
    auth,
    user,
    email: normalizeLower(auth.email || body.email || user.email),
    userId: normalizeText(user.id || auth.user_id || body.user_id),
    installId: normalizeText(body.install_id),
    deviceId: normalizeText(body.device_id),
  }
}

async function requireWebSupportUser(
  request: Request,
  env: Env,
  body: PolicyRequest & { id_token?: string }
): Promise<{ body: PolicyRequest; email: string; userId: string; installId: string; deviceId: string } | Response> {
  const idToken = normalizeText(body.id_token)
  if (!idToken) return json({ success: false, error: "missing_id_token" }, 401)

  const authRequest = new Request("https://auth.saturnws.com/account/identity", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ id_token: idToken }),
  })
  const response = env.AUTH_SERVICE ? await env.AUTH_SERVICE.fetch(authRequest) : await fetch(authRequest)
  const payload = await response.json<FirebaseWebIdentity>().catch(() => null)
  if (!response.ok || !payload?.success) return json({ success: false, error: payload?.error || "unauthorized" }, 401)

  const userId = normalizeText(payload.user?.id)
  const email = normalizeLower(payload.user?.email)
  if (!userId || !email) return json({ success: false, error: "identity_incomplete" }, 401)
  return { body, email, userId, installId: "", deviceId: "" }
}

function supportScopeBinds(scope: { userId: string; email: string; installId: string; deviceId: string }): [string, string, string, string] {
  return [scope.userId || "", scope.email || "", scope.installId || "", scope.deviceId || ""]
}

const SUPPORT_DAILY_MESSAGE_LIMIT = 5
const SUPPORT_RATE_WINDOW_SECONDS = 24 * 60 * 60
const EMAIL_MAX_ATTEMPTS = 5
const EMAIL_OUTBOX_BATCH_LIMIT = 5
const EMAIL_CRON_LOCK_SECONDS = 4 * 60
const EMAIL_WEBHOOK_MAX_BYTES = 256 * 1024
const EMAIL_WEBHOOK_TOLERANCE_SECONDS = 5 * 60
const EMAIL_KNOWN_EVENTS = RESEND_KNOWN_EVENTS

function supportScopeSql(prefix = "t", startIndex = 2): string {
  const field = (name: string) => (prefix ? `${prefix}.${name}` : name)
  const userIndex = startIndex
  const emailIndex = startIndex + 1
  const installIndex = startIndex + 2
  const deviceIndex = startIndex + 3
  return `((?${userIndex} <> '' AND ${field("user_id")} = ?${userIndex}) OR (?${emailIndex} <> '' AND lower(${field("email")}) = ?${emailIndex}) OR (?${installIndex} <> '' AND ${field("install_id")} = ?${installIndex}) OR (?${deviceIndex} <> '' AND ${field("device_id")} = ?${deviceIndex}))`
}

function supportBlockMatchSql(threadAlias = "t", blockAlias = "b"): string {
  const threadField = (name: string) => (threadAlias ? `${threadAlias}.${name}` : name)
  const blockField = (name: string) => (blockAlias ? `${blockAlias}.${name}` : name)
  return `(
    (${threadField("user_id")} IS NOT NULL AND ${threadField("user_id")} <> '' AND ${blockField("user_id")} = ${threadField("user_id")})
    OR (${threadField("email")} IS NOT NULL AND ${threadField("email")} <> '' AND lower(${blockField("email")}) = lower(${threadField("email")}))
    OR (${threadField("install_id")} IS NOT NULL AND ${threadField("install_id")} <> '' AND ${blockField("install_id")} = ${threadField("install_id")})
    OR (${threadField("device_id")} IS NOT NULL AND ${threadField("device_id")} <> '' AND ${blockField("device_id")} = ${threadField("device_id")})
  )`
}

async function queryActiveSupportBlock(
  env: Env,
  scope: { userId: string; email: string; installId: string; deviceId: string }
): Promise<{ id: string } | null> {
  const [userId, email, installId, deviceId] = supportScopeBinds(scope)
  return await env.DB.prepare(`SELECT id FROM support_message_blocks b WHERE b.active = 1 AND ${supportScopeSql("b", 1)} LIMIT 1`)
    .bind(userId, email, installId, deviceId)
    .first<{ id: string }>()
}

async function querySupportRateLimit(
  env: Env,
  scope: { userId: string; email: string; installId: string; deviceId: string }
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const [userId, email, installId, deviceId] = supportScopeBinds(scope)
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count, MIN(m.created_at) AS oldest_created_at
     FROM support_messages m
     JOIN support_threads t ON t.id = m.thread_id
     WHERE m.sender = 'user'
       AND datetime(m.created_at) > datetime('now', '-24 hours')
       AND ${supportScopeSql("t", 1)}`
  )
    .bind(userId, email, installId, deviceId)
    .first<{ count: number; oldest_created_at: string | null }>()

  const count = Number(row?.count || 0)
  if (count < SUPPORT_DAILY_MESSAGE_LIMIT) return { limited: false, retryAfterSeconds: 0 }
  const oldestMs = row?.oldest_created_at ? Date.parse(`${row.oldest_created_at.replace(" ", "T")}Z`) : Number.NaN
  const retryAfterSeconds = Number.isFinite(oldestMs)
    ? Math.max(60, Math.min(SUPPORT_RATE_WINDOW_SECONDS, Math.ceil((oldestMs + SUPPORT_RATE_WINDOW_SECONDS * 1000 - Date.now()) / 1000)))
    : SUPPORT_RATE_WINDOW_SECONDS
  return { limited: true, retryAfterSeconds }
}

async function querySupportThreadsForUser(env: Env, scope: { userId: string; email: string; installId: string; deviceId: string }): Promise<SupportThreadRow[]> {
  const [userId, email, installId, deviceId] = supportScopeBinds(scope)
  const rows = await env.DB.prepare(
    `SELECT t.*,
      (SELECT body FROM support_messages m WHERE m.thread_id = t.id AND m.sender <> 'internal' ORDER BY datetime(m.created_at) DESC LIMIT 1) AS last_message_body,
      (SELECT sender FROM support_messages m WHERE m.thread_id = t.id AND m.sender <> 'internal' ORDER BY datetime(m.created_at) DESC LIMIT 1) AS last_message_sender,
      (SELECT created_at FROM support_messages m WHERE m.thread_id = t.id AND m.sender <> 'internal' ORDER BY datetime(m.created_at) DESC LIMIT 1) AS last_message_at,
      (SELECT COUNT(*) FROM support_messages m WHERE m.thread_id = t.id AND m.sender = 'admin' AND (t.user_last_read_at IS NULL OR datetime(m.created_at) > datetime(t.user_last_read_at))) AS unread_count,
      EXISTS(SELECT 1 FROM support_message_blocks b WHERE b.active = 1 AND ${supportBlockMatchSql("t", "b")} LIMIT 1) AS support_blocked
     FROM support_threads t
     WHERE ${supportScopeSql("t")}
     ORDER BY datetime(t.updated_at) DESC
     LIMIT 30`
  )
    .bind("_scope", userId, email, installId, deviceId)
    .all<SupportThreadRow>()
    .catch(() => ({ results: [] as SupportThreadRow[] }))
  return rows.results || []
}

async function queryAdminSupportThreads(env: Env): Promise<SupportThreadRow[]> {
  const rows = await env.DB.prepare(
    `SELECT t.*,
      (SELECT body FROM support_messages m WHERE m.thread_id = t.id ORDER BY datetime(m.created_at) DESC LIMIT 1) AS last_message_body,
      (SELECT sender FROM support_messages m WHERE m.thread_id = t.id ORDER BY datetime(m.created_at) DESC LIMIT 1) AS last_message_sender,
      (SELECT created_at FROM support_messages m WHERE m.thread_id = t.id ORDER BY datetime(m.created_at) DESC LIMIT 1) AS last_message_at,
      (SELECT COUNT(*) FROM support_messages m WHERE m.thread_id = t.id AND m.sender = 'user' AND (t.admin_last_read_at IS NULL OR datetime(m.created_at) > datetime(t.admin_last_read_at))) AS unread_count,
      EXISTS(SELECT 1 FROM support_message_blocks b WHERE b.active = 1 AND ${supportBlockMatchSql("t", "b")} LIMIT 1) AS support_blocked
     FROM support_threads t
     ORDER BY datetime(t.updated_at) DESC
     LIMIT 100`
  )
    .all<SupportThreadRow>()
    .catch(() => ({ results: [] as SupportThreadRow[] }))
  return rows.results || []
}

async function handleSupportCreate(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const body = await request.json<PolicyRequest & { subject?: string; body?: string; message?: string }>().catch(() => null)
  if (!body || typeof body !== "object") return json({ success: false, error: "invalid_payload" }, 400)
  const scope = await requireSupportUser(request, env, body)
  if (scope instanceof Response) return scope
  const subject = clampText(body.subject, 160)
  const message = clampMultilineText(body.body || body.message, 4000)
  if (!subject) return json({ success: false, error: "subject_required" }, 400)
  if (!message) return json({ success: false, error: "message_required" }, 400)
  const activeBlock = await queryActiveSupportBlock(env, scope)
  if (activeBlock) return json({ success: false, error: "support_blocked" }, 403)
  const rateLimit = await querySupportRateLimit(env, scope)
  if (rateLimit.limited) {
    return json(
      {
        success: false,
        error: "support_rate_limited",
        retry_after_seconds: rateLimit.retryAfterSeconds,
        limit: SUPPORT_DAILY_MESSAGE_LIMIT,
      },
      429
    )
  }
  const threadId = crypto.randomUUID()
  const messageId = crypto.randomUUID()
  await env.DB.prepare(
    "INSERT INTO support_threads (id, user_id, email, install_id, device_id, app_version, app_build_id, channel, platform, subject, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'open', datetime('now'), datetime('now'))"
  )
    .bind(
      threadId,
      scope.userId || null,
      scope.email || null,
      scope.installId || null,
      scope.deviceId || null,
      normalizeText(body.app_version) || null,
      normalizeText(body.app_build_id) || null,
      normalizeLower(body.channel) || null,
      normalizeLower(body.platform) || null,
      subject
    )
    .run()
  await env.DB.prepare("INSERT INTO support_messages (id, thread_id, sender, body, created_at) VALUES (?1, ?2, 'user', ?3, datetime('now'))")
    .bind(messageId, threadId, message)
    .run()
  const thread = await env.DB.prepare("SELECT * FROM support_threads WHERE id = ?1").bind(threadId).first<SupportThreadRow>()
  if (thread) await queueSupportTicketConfirmation(env, thread, scope.userId || null, messageId, ctx)
  return json({ success: true, thread_id: threadId })
}

async function handleSupportThreads(request: Request, env: Env): Promise<Response> {
  const body = await request.json<PolicyRequest>().catch(() => null)
  if (!body || typeof body !== "object") return json({ success: false, error: "invalid_payload" }, 400)
  const scope = await requireSupportUser(request, env, body)
  if (scope instanceof Response) return scope
  return json({ success: true, threads: await querySupportThreadsForUser(env, scope) })
}

async function handleSupportMessages(request: Request, env: Env): Promise<Response> {
  const body = await request.json<PolicyRequest & { thread_id?: string }>().catch(() => null)
  if (!body || typeof body !== "object") return json({ success: false, error: "invalid_payload" }, 400)
  const scope = await requireSupportUser(request, env, body)
  if (scope instanceof Response) return scope
  const threadId = normalizeText(body.thread_id)
  if (!threadId) return json({ success: false, error: "thread_id_required" }, 400)
  const [userId, email, installId, deviceId] = supportScopeBinds(scope)
  const thread = await env.DB.prepare(`SELECT * FROM support_threads t WHERE t.id = ?1 AND ${supportScopeSql("t")} LIMIT 1`)
    .bind(threadId, userId, email, installId, deviceId)
    .first<SupportThreadRow>()
  if (!thread) return json({ success: false, error: "thread_not_found" }, 404)
  const messages = await env.DB.prepare("SELECT id, thread_id, sender, body, created_at FROM support_messages WHERE thread_id = ?1 AND sender <> 'internal' ORDER BY datetime(created_at) ASC")
    .bind(threadId)
    .all<SupportMessageRow>()
    .catch(() => ({ results: [] as SupportMessageRow[] }))
  await env.DB.prepare("UPDATE support_threads SET user_last_read_at = datetime('now') WHERE id = ?1").bind(threadId).run()
  return json({ success: true, thread, messages: messages.results || [] })
}

async function handleSupportRead(request: Request, env: Env): Promise<Response> {
  const body = await request.json<PolicyRequest & { thread_id?: string }>().catch(() => null)
  if (!body || typeof body !== "object") return json({ success: false, error: "invalid_payload" }, 400)
  const scope = await requireSupportUser(request, env, body)
  if (scope instanceof Response) return scope
  const threadId = normalizeText(body.thread_id)
  if (!threadId) return json({ success: false, error: "thread_id_required" }, 400)
  const [userId, email, installId, deviceId] = supportScopeBinds(scope)
  await env.DB.prepare(`UPDATE support_threads SET user_last_read_at = datetime('now') WHERE id = ?1 AND ${supportScopeSql("")}`)
    .bind(threadId, userId, email, installId, deviceId)
    .run()
  return json({ success: true })
}

async function handleSupportRequest(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === "POST" && url.pathname === "/v1/support/messages") return handleSupportCreate(request, env, ctx)
  if (request.method === "POST" && url.pathname === "/v1/support/threads") return handleSupportThreads(request, env)
  if (request.method === "POST" && url.pathname === "/v1/support/thread") return handleSupportMessages(request, env)
  if (request.method === "POST" && url.pathname === "/v1/support/read") return handleSupportRead(request, env)
  return json({ success: false, error: "support_not_found" }, 404)
}

async function handleWebSupportCreate(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const body = await request.json<PolicyRequest & { id_token?: string; subject?: string; body?: string; message?: string }>().catch(() => null)
  if (!body || typeof body !== "object") return json({ success: false, error: "invalid_payload" }, 400)
  const scope = await requireWebSupportUser(request, env, body)
  if (scope instanceof Response) return scope
  const subject = clampText(body.subject, 160)
  const message = clampMultilineText(body.body || body.message, 4000)
  if (!subject) return json({ success: false, error: "subject_required" }, 400)
  if (!message) return json({ success: false, error: "message_required" }, 400)
  const activeBlock = await queryActiveSupportBlock(env, scope)
  if (activeBlock) return json({ success: false, error: "support_blocked" }, 403)
  const rateLimit = await querySupportRateLimit(env, scope)
  if (rateLimit.limited) {
    return json({ success: false, error: "support_rate_limited", retry_after_seconds: rateLimit.retryAfterSeconds, limit: SUPPORT_DAILY_MESSAGE_LIMIT }, 429)
  }
  const threadId = crypto.randomUUID()
  const messageId = crypto.randomUUID()
  await env.DB.prepare(
    "INSERT INTO support_threads (id, user_id, email, install_id, device_id, app_version, app_build_id, channel, platform, subject, status, created_at, updated_at) VALUES (?1, ?2, ?3, NULL, NULL, NULL, NULL, 'web', 'web', ?4, 'open', datetime('now'), datetime('now'))"
  )
    .bind(threadId, scope.userId, scope.email, subject)
    .run()
  await env.DB.prepare("INSERT INTO support_messages (id, thread_id, sender, body, created_at) VALUES (?1, ?2, 'user', ?3, datetime('now'))")
    .bind(messageId, threadId, message)
    .run()
  const thread = await env.DB.prepare("SELECT * FROM support_threads WHERE id = ?1").bind(threadId).first<SupportThreadRow>()
  if (thread) await queueSupportTicketConfirmation(env, thread, scope.userId || null, messageId, ctx)
  return json({ success: true, thread_id: threadId })
}

async function handleWebSupportThreads(request: Request, env: Env): Promise<Response> {
  const body = await request.json<PolicyRequest & { id_token?: string }>().catch(() => null)
  if (!body || typeof body !== "object") return json({ success: false, error: "invalid_payload" }, 400)
  const scope = await requireWebSupportUser(request, env, body)
  if (scope instanceof Response) return scope
  return json({ success: true, threads: await querySupportThreadsForUser(env, scope) })
}

async function handleWebSupportMessages(request: Request, env: Env): Promise<Response> {
  const body = await request.json<PolicyRequest & { id_token?: string; thread_id?: string }>().catch(() => null)
  if (!body || typeof body !== "object") return json({ success: false, error: "invalid_payload" }, 400)
  const scope = await requireWebSupportUser(request, env, body)
  if (scope instanceof Response) return scope
  const threadId = normalizeText(body.thread_id)
  if (!threadId) return json({ success: false, error: "thread_id_required" }, 400)
  const [userId, email, installId, deviceId] = supportScopeBinds(scope)
  const thread = await env.DB.prepare(`SELECT * FROM support_threads t WHERE t.id = ?1 AND ${supportScopeSql("t")} LIMIT 1`)
    .bind(threadId, userId, email, installId, deviceId)
    .first<SupportThreadRow>()
  if (!thread) return json({ success: false, error: "thread_not_found" }, 404)
  const messages = await env.DB.prepare("SELECT id, thread_id, sender, body, created_at FROM support_messages WHERE thread_id = ?1 AND sender <> 'internal' ORDER BY datetime(created_at) ASC")
    .bind(threadId)
    .all<SupportMessageRow>()
    .catch(() => ({ results: [] as SupportMessageRow[] }))
  await env.DB.prepare("UPDATE support_threads SET user_last_read_at = datetime('now') WHERE id = ?1").bind(threadId).run()
  return json({ success: true, thread, messages: messages.results || [] })
}

async function handleWebSupportReply(request: Request, env: Env): Promise<Response> {
  const body = await request.json<PolicyRequest & { id_token?: string; thread_id?: string; body?: string; message?: string }>().catch(() => null)
  if (!body || typeof body !== "object") return json({ success: false, error: "invalid_payload" }, 400)
  const scope = await requireWebSupportUser(request, env, body)
  if (scope instanceof Response) return scope
  const threadId = normalizeText(body.thread_id)
  const message = clampMultilineText(body.body || body.message, 4000)
  if (!threadId) return json({ success: false, error: "thread_id_required" }, 400)
  if (!message) return json({ success: false, error: "message_required" }, 400)
  const activeBlock = await queryActiveSupportBlock(env, scope)
  if (activeBlock) return json({ success: false, error: "support_blocked" }, 403)
  const [userId, email, installId, deviceId] = supportScopeBinds(scope)
  const thread = await env.DB.prepare(`SELECT id FROM support_threads t WHERE t.id = ?1 AND ${supportScopeSql("t")} LIMIT 1`)
    .bind(threadId, userId, email, installId, deviceId)
    .first<{ id: string }>()
  if (!thread) return json({ success: false, error: "thread_not_found" }, 404)
  const rateLimit = await querySupportRateLimit(env, scope)
  if (rateLimit.limited) {
    return json({ success: false, error: "support_rate_limited", retry_after_seconds: rateLimit.retryAfterSeconds, limit: SUPPORT_DAILY_MESSAGE_LIMIT }, 429)
  }
  await env.DB.prepare("INSERT INTO support_messages (id, thread_id, sender, body, created_at) VALUES (?1, ?2, 'user', ?3, datetime('now'))")
    .bind(crypto.randomUUID(), threadId, message)
    .run()
  await env.DB.prepare("UPDATE support_threads SET status = 'open', updated_at = datetime('now'), user_last_read_at = datetime('now') WHERE id = ?1")
    .bind(threadId)
    .run()
  return json({ success: true })
}

async function handleWebSupportStatus(request: Request, env: Env): Promise<Response> {
  const body = await request.json<PolicyRequest & { id_token?: string; thread_id?: string; status?: string }>().catch(() => null)
  if (!body || typeof body !== "object") return json({ success: false, error: "invalid_payload" }, 400)
  const scope = await requireWebSupportUser(request, env, body)
  if (scope instanceof Response) return scope
  const threadId = normalizeText(body.thread_id)
  const status = normalizeLower(body.status)
  if (!threadId) return json({ success: false, error: "thread_id_required" }, 400)
  if (!["open", "closed"].includes(status)) return json({ success: false, error: "invalid_status" }, 400)
  const [userId, email, installId, deviceId] = supportScopeBinds(scope)
  await env.DB.prepare(`UPDATE support_threads SET status = ?1, updated_at = datetime('now') WHERE id = ?2 AND ${supportScopeSql("", 3)}`)
    .bind(status, threadId, userId, email, installId, deviceId)
    .run()
  return json({ success: true, status })
}

async function handleWebSupportRequest(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === "POST" && url.pathname === "/v1/web/support/messages") return handleWebSupportCreate(request, env, ctx)
  if (request.method === "POST" && url.pathname === "/v1/web/support/threads") return handleWebSupportThreads(request, env)
  if (request.method === "POST" && url.pathname === "/v1/web/support/thread") return handleWebSupportMessages(request, env)
  if (request.method === "POST" && url.pathname === "/v1/web/support/reply") return handleWebSupportReply(request, env)
  if (request.method === "POST" && url.pathname === "/v1/web/support/status") return handleWebSupportStatus(request, env)
  return json({ success: false, error: "support_not_found" }, 404)
}

type InviteValidationStatus = "valid" | "invalid" | "expired" | "already_used" | "blocked" | "policy_unavailable"

function normalizeInviteCode(value: unknown): string {
  return normalizeText(value).toUpperCase()
}

function inviteValidationPayload(status: InviteValidationStatus): Record<string, unknown> {
  return {
    success: status !== "policy_unavailable",
    valid: status === "valid",
    status,
  }
}

async function auditInviteValidation(
  env: Env,
  scope: { userId: string; email: string; installId: string; deviceId: string },
  body: PolicyRequest,
  result: InviteValidationStatus,
  inviteCodeId: string | null
): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO invite_code_validations (id, invite_code_id, user_id, email, install_id, device_id, app_version, channel, result, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))"
    )
      .bind(
        crypto.randomUUID(),
        inviteCodeId || null,
        scope.userId || null,
        scope.email || null,
        scope.installId || null,
        scope.deviceId || null,
        normalizeText(body.app_version) || null,
        normalizeLower(body.channel) || null,
        result
      )
      .run()
  } catch {
    // Invite audit must not affect the user's validation result.
  }
}

async function handleInviteValidate(request: Request, env: Env): Promise<Response> {
  const body = await request.json<PolicyRequest & { invite_code?: string; code?: string }>().catch(() => null)
  if (!body || typeof body !== "object") return json(inviteValidationPayload("invalid"), 400)

  const auth = await verifyAuthSession(request, env, body)
  if (!auth.ok) {
    const unavailable = auth.decision === "policy_unavailable"
    return json(inviteValidationPayload(unavailable ? "policy_unavailable" : "blocked"), unavailable ? 503 : 403)
  }

  const user = await lookupUser(env, body, auth)
  if (!user) return json(inviteValidationPayload("blocked"), 403)
  await rememberInstall(env, body, user)

  const scope = {
    userId: normalizeText(user.id || auth.user_id || body.user_id),
    email: normalizeLower(auth.email || body.email || user.email),
    installId: normalizeText(body.install_id),
    deviceId: normalizeText(body.device_id),
  }
  const inviteCode = normalizeInviteCode(body.invite_code || body.code)
  if (!inviteCode) {
    await auditInviteValidation(env, scope, body, "invalid", null)
    return json(inviteValidationPayload("invalid"))
  }

  const codeHash = await sha256Hex(inviteCode)
  const row = await env.DB.prepare("SELECT * FROM invite_codes WHERE code_hash = ?1 LIMIT 1").bind(codeHash).first<InviteCodeRow>()
  if (!row) {
    await auditInviteValidation(env, scope, body, "invalid", null)
    return json(inviteValidationPayload("invalid"))
  }

  const status = normalizeLower(row.status || "active")
  if (!["active", "enabled"].includes(status)) {
    await auditInviteValidation(env, scope, body, "blocked", row.id)
    return json(inviteValidationPayload("blocked"))
  }

  const expiresAt = _parseInviteExpiresAt(row.expires_at)
  if (expiresAt > 0 && expiresAt <= Date.now()) {
    await auditInviteValidation(env, scope, body, "expired", row.id)
    return json(inviteValidationPayload("expired"))
  }

  const maxUses = row.max_uses === null || row.max_uses === undefined ? 0 : Number(row.max_uses)
  const usedCount = Number(row.used_count || 0)
  if (Number.isFinite(maxUses) && maxUses > 0 && usedCount >= maxUses) {
    await auditInviteValidation(env, scope, body, "already_used", row.id)
    return json(inviteValidationPayload("already_used"))
  }

  await env.DB.prepare("UPDATE invite_codes SET used_count = used_count + 1, updated_at = datetime('now') WHERE id = ?1").bind(row.id).run()
  await auditInviteValidation(env, scope, body, "valid", row.id)
  return json(inviteValidationPayload("valid"))
}

function _parseInviteExpiresAt(value: string | null | undefined): number {
  const text = normalizeText(value)
  if (!text) return 0
  const normalized = text.includes("T") ? text : `${text.replace(" ", "T")}Z`
  const ms = Date.parse(normalized)
  return Number.isFinite(ms) ? ms : 0
}

async function handleInviteRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === "POST" && url.pathname === "/v1/invite/validate") return handleInviteValidate(request, env)
  return json({ success: false, error: "invite_not_found" }, 404)
}

async function handleAdminState(env: Env): Promise<Response> {
  const global = await env.DB.prepare("SELECT * FROM global_policy WHERE id = 'global'").first<GlobalPolicyRow>()
  const disabled = await env.DB.prepare("SELECT version, reason, created_at FROM disabled_versions ORDER BY created_at DESC, version ASC").all()
  const users = await env.DB.prepare("SELECT id, email, status, role, plan_id, created_at, updated_at FROM users ORDER BY updated_at DESC LIMIT 200").all()
  const plans = await env.DB.prepare("SELECT * FROM plan_features ORDER BY plan_id ASC").all()
  const releases = await env.DB.prepare(
    "SELECT version, channel, release_type, visibility, artifact_kind, source, notes, created_at, updated_at FROM release_catalog ORDER BY datetime(updated_at) DESC, version DESC"
  )
    .all<ReleaseCatalogRow>()
    .catch(() => ({ results: [] as ReleaseCatalogRow[] }))
  const supportThreads = await queryAdminSupportThreads(env)
  return json({
    success: true,
    global_policy: global || null,
    disabled_versions: disabled.results || [],
    users: users.results || [],
    plan_features: plans.results || [],
    releases: releases.results || [],
    support_threads: supportThreads,
  })
}

async function handleAdminGlobalPolicy(request: Request, env: Env): Promise<Response> {
  const body = (await request.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
  const updateMode = normalizeLower(body.update_mode || "optional")
  const safeUpdateMode = ["optional", "mandatory"].includes(updateMode) ? updateMode : "optional"
  await env.DB.prepare(
    "UPDATE global_policy SET kill_switch_enabled = ?1, mandatory_update_enabled = ?2, minimum_supported_version = ?3, update_mode = ?4, blocked_actions_json = ?5, features_json = ?6, limits_json = ?7, updated_at = datetime('now') WHERE id = 'global'"
  )
    .bind(
      parseBooleanInput(body.kill_switch_enabled) ? 1 : 0,
      parseBooleanInput(body.mandatory_update_enabled) ? 1 : 0,
      normalizeText(body.minimum_supported_version),
      safeUpdateMode,
      JSON.stringify(normalizeListInput(body.blocked_actions)),
      toJsonText(body.features, {}),
      toJsonText(body.limits, {})
    )
    .run()
  return json({ success: true })
}

async function handleAdminDisabledVersions(request: Request, env: Env): Promise<Response> {
  const body = (await request.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
  const version = normalizeLower(body.version)
  if (!version) return json({ success: false, error: "version_required" }, 400)
  if (body.disabled === false || normalizeLower(body.action) === "remove") {
    await env.DB.prepare("DELETE FROM disabled_versions WHERE lower(version) = ?1").bind(version).run()
  } else {
    await env.DB.prepare(
      "INSERT INTO disabled_versions (version, reason, created_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(version) DO UPDATE SET reason = excluded.reason"
    )
      .bind(version, normalizeText(body.reason) || null)
      .run()
  }
  return json({ success: true })
}

async function handleAdminUser(request: Request, env: Env): Promise<Response> {
  const body = (await request.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
  const email = normalizeLower(body.email)
  const id = normalizeText(body.id) || (email ? `email:${email}` : "")
  if (!id && !email) return json({ success: false, error: "user_required" }, 400)
  const status = ["active", "disabled", "banned", "blocked"].includes(normalizeLower(body.status)) ? normalizeLower(body.status) : "active"
  const role = normalizeLower(body.role || "user") || "user"
  const planId = normalizeLower(body.plan_id || "default") || "default"
  await env.DB.prepare(
    "INSERT INTO users (id, email, status, role, plan_id, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now')) ON CONFLICT(id) DO UPDATE SET email = excluded.email, status = excluded.status, role = excluded.role, plan_id = excluded.plan_id, updated_at = datetime('now')"
  )
    .bind(id, email || null, status, role, planId)
    .run()
  const subscriptionStatus = normalizeLower(body.subscription_status)
  if (subscriptionStatus) {
    const safeStatus = ["active", "trialing", "expired", "canceled", "inactive"].includes(subscriptionStatus) ? subscriptionStatus : "active"
    await env.DB.prepare(
      "INSERT INTO subscriptions (id, user_id, plan_id, status, expires_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now')) ON CONFLICT(id) DO UPDATE SET plan_id = excluded.plan_id, status = excluded.status, expires_at = excluded.expires_at, updated_at = datetime('now')"
    )
      .bind(`admin:${id}`, id, planId, safeStatus, normalizeText(body.subscription_expires_at) || null)
      .run()
  }
  return json({ success: true })
}

async function handleAdminPlanFeatures(request: Request, env: Env): Promise<Response> {
  const body = (await request.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
  const planId = normalizeLower(body.plan_id || "default") || "default"
  await env.DB.prepare(
    "INSERT INTO plan_features (plan_id, features_json, blocked_actions_json, limits_json, updated_at) VALUES (?1, ?2, ?3, ?4, datetime('now')) ON CONFLICT(plan_id) DO UPDATE SET features_json = excluded.features_json, blocked_actions_json = excluded.blocked_actions_json, limits_json = excluded.limits_json, updated_at = datetime('now')"
  )
    .bind(planId, toJsonText(body.features, {}), JSON.stringify(normalizeListInput(body.blocked_actions)), toJsonText(body.limits, {}))
    .run()
  return json({ success: true })
}

async function handleAdminRelease(request: Request, env: Env): Promise<Response> {
  const body = (await request.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
  const version = normalizeText(body.version)
  if (!version) return json({ success: false, error: "version_required" }, 400)
  const visibility = ["public", "internal", "archived", "hidden"].includes(normalizeLower(body.visibility)) ? normalizeLower(body.visibility) : "internal"
  await env.DB.prepare(
    "INSERT INTO release_catalog (version, channel, release_type, visibility, artifact_kind, source, notes, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now')) ON CONFLICT(version) DO UPDATE SET channel = excluded.channel, release_type = excluded.release_type, visibility = excluded.visibility, artifact_kind = excluded.artifact_kind, source = excluded.source, notes = excluded.notes, updated_at = datetime('now')"
  )
    .bind(
      version,
      normalizeLower(body.channel || "beta") || "beta",
      normalizeLower(body.release_type || "internal") || "internal",
      visibility,
      normalizeLower(body.artifact_kind || "installed_zip") || "installed_zip",
      normalizeText(body.source) || null,
      normalizeText(body.notes) || null
    )
    .run()
  return json({ success: true })
}

async function handleAdminSupportList(env: Env): Promise<Response> {
  return json({ success: true, threads: await queryAdminSupportThreads(env) })
}

async function handleAdminSupportMessages(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const threadId = normalizeText(url.searchParams.get("thread_id"))
  if (!threadId) return json({ success: false, error: "thread_id_required" }, 400)
  const thread = await env.DB.prepare(
    `SELECT t.*,
      EXISTS(SELECT 1 FROM support_message_blocks b WHERE b.active = 1 AND ${supportBlockMatchSql("t", "b")} LIMIT 1) AS support_blocked
     FROM support_threads t
     WHERE t.id = ?1`
  )
    .bind(threadId)
    .first<SupportThreadRow>()
  if (!thread) return json({ success: false, error: "thread_not_found" }, 404)
  const messages = await env.DB.prepare("SELECT id, thread_id, sender, body, created_at FROM support_messages WHERE thread_id = ?1 ORDER BY datetime(created_at) ASC")
    .bind(threadId)
    .all<SupportMessageRow>()
    .catch(() => ({ results: [] as SupportMessageRow[] }))
  await env.DB.prepare("UPDATE support_threads SET admin_last_read_at = datetime('now') WHERE id = ?1").bind(threadId).run()
  return json({ success: true, thread, messages: messages.results || [] })
}

async function handleAdminSupportBlock(request: Request, env: Env): Promise<Response> {
  const body = (await request.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
  const threadId = normalizeText(body.thread_id)
  if (!threadId) return json({ success: false, error: "thread_id_required" }, 400)
  const thread = await env.DB.prepare("SELECT * FROM support_threads WHERE id = ?1").bind(threadId).first<SupportThreadRow>()
  if (!thread) return json({ success: false, error: "thread_not_found" }, 404)

  const scope = {
    userId: normalizeText(thread.user_id),
    email: normalizeLower(thread.email),
    installId: normalizeText(thread.install_id),
    deviceId: normalizeText(thread.device_id),
  }
  if (!scope.userId && !scope.email && !scope.installId && !scope.deviceId) {
    return json({ success: false, error: "support_identity_missing" }, 400)
  }
  const [userId, email, installId, deviceId] = supportScopeBinds(scope)
  const blocked = parseBooleanInput(body.blocked)

  if (blocked) {
    await env.DB.prepare(
      `INSERT INTO support_message_blocks (id, user_id, email, install_id, device_id, reason, active, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, datetime('now'), datetime('now'))`
    )
      .bind(
        crypto.randomUUID(),
        userId || null,
        email || null,
        installId || null,
        deviceId || null,
        clampText(body.reason, 300) || "admin_block"
      )
      .run()
    return json({ success: true, blocked: true })
  }

  await env.DB.prepare(`UPDATE support_message_blocks SET active = 0, updated_at = datetime('now') WHERE active = 1 AND ${supportScopeSql("", 1)}`)
    .bind(userId, email, installId, deviceId)
    .run()
  return json({ success: true, blocked: false })
}

async function handleAdminSupportReply(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const body = (await request.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
  const threadId = normalizeText(body.thread_id)
  const message = clampMultilineText(body.body || body.message, 4000)
  const internalNote = parseBooleanInput(body.internal_note)
  if (!threadId) return json({ success: false, error: "thread_id_required" }, 400)
  if (!message) return json({ success: false, error: "message_required" }, 400)
  const thread = await env.DB.prepare("SELECT * FROM support_threads WHERE id = ?1").bind(threadId).first<SupportThreadRow>()
  if (!thread) return json({ success: false, error: "thread_not_found" }, 404)
  const messageId = crypto.randomUUID()
  await env.DB.prepare("INSERT INTO support_messages (id, thread_id, sender, body, created_at) VALUES (?1, ?2, ?3, ?4, datetime('now'))")
    .bind(messageId, threadId, internalNote ? "internal" : "admin", message)
    .run()
  await env.DB.prepare(internalNote
    ? "UPDATE support_threads SET admin_last_read_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1"
    : "UPDATE support_threads SET status = 'waiting_for_customer', admin_last_read_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1")
    .bind(threadId)
    .run()
  if (!internalNote) await queueSupportAdminReplyEmail(env, thread, messageId, message, ctx)
  return json({ success: true })
}

async function handleAdminSupportStatus(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const body = (await request.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
  const threadId = normalizeText(body.thread_id)
  const status = normalizeLower(body.status)
  const reason = clampText(body.reason, 300)
  if (!threadId) return json({ success: false, error: "thread_id_required" }, 400)
  if (!["open", "waiting_for_support", "waiting_for_customer", "resolved", "closed"].includes(status)) {
    return json({ success: false, error: "invalid_status" }, 400)
  }
  const thread = await env.DB.prepare("SELECT * FROM support_threads WHERE id = ?1").bind(threadId).first<SupportThreadRow>()
  if (!thread) return json({ success: false, error: "thread_not_found" }, 404)
  await env.DB.prepare("UPDATE support_threads SET status = ?1, updated_at = datetime('now') WHERE id = ?2")
    .bind(status, threadId)
    .run()
  const bodyText = reason ? `status:${status}; reason:${reason}` : `status:${status}`
  await env.DB.prepare("INSERT INTO support_messages (id, thread_id, sender, body, created_at) VALUES (?1, ?2, 'system', ?3, datetime('now'))")
    .bind(crypto.randomUUID(), threadId, bodyText)
    .run()
  await queueSupportStatusEmail(env, { ...thread, status }, status, ctx)
  return json({ success: true, status })
}

async function handleAdminRequest(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const authError = await requireAdmin(request, env)
  if (authError) return authError
  const url = new URL(request.url)
  if (request.method === "GET" && url.pathname === "/v1/admin/state") return handleAdminState(env)
  if (request.method === "POST" && url.pathname === "/v1/admin/global-policy") return handleAdminGlobalPolicy(request, env)
  if (request.method === "POST" && url.pathname === "/v1/admin/disabled-versions") return handleAdminDisabledVersions(request, env)
  if (request.method === "POST" && url.pathname === "/v1/admin/users") return handleAdminUser(request, env)
  if (request.method === "POST" && url.pathname === "/v1/admin/plan-features") return handleAdminPlanFeatures(request, env)
  if (request.method === "POST" && url.pathname === "/v1/admin/releases") return handleAdminRelease(request, env)
  if (request.method === "GET" && url.pathname === "/v1/admin/support") return handleAdminSupportList(env)
  if (request.method === "GET" && url.pathname === "/v1/admin/support/messages") return handleAdminSupportMessages(request, env)
  if (request.method === "POST" && url.pathname === "/v1/admin/support/block") return handleAdminSupportBlock(request, env)
  if (request.method === "POST" && url.pathname === "/v1/admin/support/reply") return handleAdminSupportReply(request, env, ctx)
  if (request.method === "POST" && url.pathname === "/v1/admin/support/status") return handleAdminSupportStatus(request, env, ctx)
  if (request.method === "GET" && url.pathname === "/v1/admin/email/status") return handleAdminEmailStatus(env)
  if ((request.method === "GET" || request.method === "POST") && url.pathname === "/v1/admin/email/preview") return handleAdminEmailPreview(request, env)
  if (request.method === "POST" && url.pathname === "/v1/admin/email/retry") return handleAdminEmailRetry(request, env)
  if (request.method === "POST" && url.pathname === "/v1/admin/email/test") return handleAdminEmailTest(request, env)
  if (request.method === "POST" && url.pathname === "/v1/admin/email/process") return handleAdminEmailProcess(env)
  return json({ success: false, error: "admin_not_found" }, 404)
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runEmailCron(env).catch((error) => {
      console.error(JSON.stringify({ event: "email_cron_failed", error: error instanceof Error ? error.message : String(error) }))
    }))
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const cors = corsHeaders(env, request)
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors })

    try {
      if (url.pathname.startsWith("/v1/admin/")) {
        const res = await handleAdminRequest(request, env, ctx)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "POST" && url.pathname === "/api/webhooks/resend") {
        return await handleResendWebhook(request, env)
      }
      if (url.pathname.startsWith("/v1/web/support/")) {
        const res = await handleWebSupportRequest(request, env, ctx)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (url.pathname.startsWith("/v1/support/")) {
        const res = await handleSupportRequest(request, env, ctx)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (url.pathname.startsWith("/v1/invite/")) {
        const res = await handleInviteRequest(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ success: true, service: "saturnws-policy", status: "ok" }, 200, cors)
      }
      if (request.method === "POST" && url.pathname === "/v1/policy/check") {
        const res = await handlePolicyCheck(request, env)
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers.entries()), ...cors } })
      }
      return json({ success: false, error: "not_found" }, 404, cors)
    } catch (error) {
      const payload = signPayload(
        decisionResponse({
          decision: "policy_unavailable",
          reason: error instanceof Error ? error.message : "policy_error",
          ttlSeconds: 60,
          sticky: true,
        }),
        env
      )
      return json(payload, 500, cors)
    }
  },
}
