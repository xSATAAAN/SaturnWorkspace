import assert from "node:assert/strict";
import test from "node:test";

import {
  crashSignatureSource,
  enforceCrashIngestRateLimit,
  readCrashIngestBody,
  sanitizeCrashValue,
} from "./index.js";

test("diagnostic sanitizer removes credentials, account email, and user paths", () => {
  const sanitized = sanitizeCrashValue({
    email: "person@example.com",
    password: "private-password",
    totp_secret: "JBSWY3DPEHPK3PXP",
    message: "Failure for person@example.com at C:\\Users\\Personal\\Desktop",
    safe: "update-helper",
  });
  const serialized = JSON.stringify(sanitized);
  assert.equal(sanitized.email, "[redacted]");
  assert.equal(sanitized.password, "[redacted]");
  assert.equal(sanitized.totp_secret, "[redacted]");
  assert.equal(sanitized.safe, "update-helper");
  assert.doesNotMatch(serialized, /person@example\.com|private-password|JBSWY3DPEHPK3PXP|Personal/);
});

test("diagnostic request parser rejects invalid and oversized payloads", async () => {
  const valid = await readCrashIngestBody(new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ error_type: "Probe", stack_trace: "trace" }),
  }));
  assert.equal(valid.error_type, "Probe");

  await assert.rejects(
    readCrashIngestBody(new Request("https://example.test", { method: "POST", body: "[]" })),
    /invalid_diagnostic_payload/,
  );
  await assert.rejects(
    readCrashIngestBody(new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Length": String(300 * 1024) },
      body: "{}",
    })),
    /diagnostic_payload_too_large/,
  );
});

test("diagnostic rate limit uses a hashed stable key", async () => {
  let receivedKey = "";
  const env = {
    ADMIN_RATE_LIMIT_CRASH_INGEST: {
      async limit({ key }) {
        receivedKey = key;
        return { success: true };
      },
    },
  };
  await enforceCrashIngestRateLimit(
    new Request("https://example.test", { headers: { "CF-Connecting-IP": "203.0.113.2" } }),
    env,
    { hwid: "device-identity" },
  );
  assert.match(receivedKey, /^[a-f0-9]{64}$/);
  assert.notEqual(receivedKey, "device-identity");
});

test("crash grouping keeps component and context boundaries", () => {
  const base = { error_type: "OperationalFailure", message: "failed", stack_trace: "trace" };
  const launcher = crashSignatureSource({
    ...base,
    raw_payload: { component: "launcher", context: "launcher_start_failed" },
  });
  const updater = crashSignatureSource({
    ...base,
    raw_payload: { component: "update-helper", context: "update_apply_failed" },
  });
  assert.notEqual(launcher, updater);
});
