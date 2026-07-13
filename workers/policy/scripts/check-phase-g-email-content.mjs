import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import * as esbuild from "esbuild"

const ROOT = process.cwd()
const BUILD_DIR = path.resolve(ROOT, ".phase-g-email-test-build")
if (!BUILD_DIR.startsWith(`${path.resolve(ROOT)}${path.sep}`)) throw new Error("unsafe_email_test_build_path")
fs.rmSync(BUILD_DIR, { recursive: true, force: true })
fs.mkdirSync(BUILD_DIR, { recursive: true })

const bundlePath = path.join(BUILD_DIR, "email-catalog.mjs")
await esbuild.build({
  entryPoints: [path.join(ROOT, "src/email_catalog.ts")],
  outfile: bundlePath,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
})

const catalogModule = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`)
const {
  EMAIL_CATALOG,
  emailCatalogList,
  renderTransactionalEmail,
  sampleTemplateData,
} = catalogModule

const catalog = emailCatalogList()
const byEvent = new Map(catalog.map((item) => [item.event_type, item]))
const mojibake = new RegExp(
  String.raw`(?:\u00C3.|\u00C2.|\u00E2.|\u00D8.|\u00D9.|\uFFFD|&Os` + String.raw`lash;|&#216;|&#217;)`,
  "u",
)
const arabic = /[\u0600-\u06FF]/
const implementationWords = /\b(?:Supabase|Firebase UID|Worker|provider mapping|source of truth|raw enum)\b/i
const operationalCategories = new Set(["auth", "support", "security", "admin", "billing", "release"])

assert.ok(catalog.length >= 15, "email catalog should expose a meaningful operational matrix")
for (const category of operationalCategories) {
  assert.ok(catalog.some((item) => item.category === category), `missing email category: ${category}`)
}

const realEventStatus = new Set(["linked", "prepared", "disabled", "backend_missing"])
for (const item of catalog) {
  assert.equal(item.event_type in EMAIL_CATALOG, true, `catalog key mismatch for ${item.event_type}`)
  assert.equal(realEventStatus.has(item.integration_status), true, `invalid integration status for ${item.event_type}`)
  assert.ok(item.template_key, `missing template key for ${item.event_type}`)
  assert.ok(item.sender_identity, `missing sender identity for ${item.event_type}`)

  if (item.integration_status === "disabled" || item.integration_status === "prepared") {
    assert.equal(item.admin_test_allowed, false, `${item.event_type} must not be sendable from Admin test while ${item.integration_status}`)
  }

  for (const locale of ["en", "ar"]) {
    const malicious = {
      ...sampleTemplateData(item.event_type),
      locale,
      message: "<script>alert('xss')</script>",
      support_subject: "A very long support subject ".repeat(12).trim(),
      action_url: item.integration_status === "disabled" ? "" : "https://saturnws.com/account",
    }
    const rendered = renderTransactionalEmail(item.event_type, malicious, locale)
    assert.equal(rendered.event_type, item.event_type, `rendered event mismatch: ${item.event_type}`)
    assert.ok(rendered.subject.trim(), `missing subject for ${item.event_type}/${locale}`)
    assert.ok(rendered.html.includes('<meta charset="utf-8">'), `missing utf-8 meta for ${item.event_type}/${locale}`)
    assert.ok(rendered.text.trim(), `missing plain text for ${item.event_type}/${locale}`)
    assert.equal(mojibake.test(rendered.subject), false, `mojibake subject for ${item.event_type}/${locale}`)
    assert.equal(mojibake.test(rendered.html), false, `mojibake html for ${item.event_type}/${locale}`)
    assert.equal(mojibake.test(rendered.text), false, `mojibake text for ${item.event_type}/${locale}`)
    assert.equal(rendered.html.includes("<script>"), false, `unescaped script in html for ${item.event_type}/${locale}`)
    assert.equal(rendered.html.includes("href=\"\""), false, `empty CTA URL for ${item.event_type}/${locale}`)
    assert.equal(implementationWords.test(rendered.subject + rendered.html + rendered.text), false, `implementation wording leaked in ${item.event_type}/${locale}`)
    if (locale === "ar") {
      assert.ok(rendered.html.includes('dir="rtl"'), `missing RTL wrapper for ${item.event_type}`)
      assert.ok(arabic.test(rendered.subject + rendered.text), `Arabic render has no Arabic text for ${item.event_type}`)
    } else {
      assert.ok(rendered.html.includes('dir="ltr"'), `missing LTR wrapper for ${item.event_type}`)
    }
  }
}

for (const required of [
  "auth.email_verification",
  "auth.verification_resend",
  "support.ticket_created",
  "support.admin_replied",
  "support.status_changed",
  "security.new_login",
  "security.session_revoked",
  "security.device_revoked",
  "security.all_sessions_revoked",
  "account.deletion_requested",
  "account.deletion_cancelled",
  "account.suspended",
  "account.reactivated",
  "billing.subscription_expiring",
  "billing.subscription_expired",
  "billing.subscription_granted",
  "billing.subscription_grant_reserved",
  "admin.email_queue_final_failure",
  "admin.webhook_repeated_failure",
  "admin.email_cleanup_failure",
  "admin.storage_config_failure",
  "admin.schema_mismatch",
  "admin.readiness_degraded",
  "admin.tamper_detected",
  "admin.email_test",
]) {
  assert.ok(byEvent.has(required), `required event missing: ${required}`)
  assert.equal(byEvent.get(required).integration_status, "linked", `required linked event is not linked: ${required}`)
}

for (const disabled of ["billing.payment_succeeded", "billing.payment_failed"]) {
  assert.equal(byEvent.get(disabled)?.integration_status, "disabled", `payment-provider event must remain disabled: ${disabled}`)
}

const compensation = renderTransactionalEmail("billing.subscription_granted", {
  reason_code: "compensation",
  plan_term: "monthly",
  expires_at: "2026-08-01T00:00:00.000Z",
  action_url: "https://saturnws.com/account?section=subscription",
}, "en")
const recovery = renderTransactionalEmail("billing.subscription_granted", {
  reason_code: "subscription_recovery",
  plan_term: "monthly",
  expires_at: "2026-08-01T00:00:00.000Z",
  action_url: "https://saturnws.com/account?section=subscription",
}, "en")
assert.notEqual(compensation.text, recovery.text, "manual grant content must reflect the committed reason")
const reserved = renderTransactionalEmail("billing.subscription_grant_reserved", {
  reason_code: "trial",
  plan_term: "monthly",
  action_url: "https://saturnws.com/account/signup",
}, "ar")
assert.match(reserved.text, /إنشاء الحساب|أنشئ حسابًا/, "reserved grant must direct the recipient to create the matching account")

fs.rmSync(BUILD_DIR, { recursive: true, force: true })
console.log("Phase G email content checks passed.")
