import assert from "node:assert/strict";
import test from "node:test";

import { classifyDiagnostic, isActionableCrash } from "./diagnosticClassification.js";

test("expected prevention and validation states are not crashes", () => {
  for (const message of [
    "cancelled",
    "session_ip_already_used",
    "startup_preload_missing",
    "invalid_email_requires_at",
  ]) {
    assert.equal(classifyDiagnostic({ error_type: "HandledApiError", message }), "expected");
    assert.equal(isActionableCrash({ error_type: "HandledApiError", message }), false);
  }
});

test("recoverable operational failures are warnings", () => {
  assert.equal(classifyDiagnostic({ error_type: "GoogleDriveAutoSyncFailed", message: "Scheduled Google Drive sync failed." }), "warning");
  assert.equal(classifyDiagnostic({ error_type: "UpdateManifestError", message: "Update manifest signature is missing." }), "warning");
  assert.equal(classifyDiagnostic({ error_type: "HandledApiError", message: "[WinError 10060] timed out" }), "warning");
});

test("unknown provider and runtime failures remain actionable", () => {
  assert.equal(classifyDiagnostic({ error_type: "HandledApiError", message: "AdsPower rejected profile start" }), "error");
  assert.equal(classifyDiagnostic({ error_type: "FrontendStartupTimeout", message: "Frontend did not become ready" }), "error");
  assert.equal(classifyDiagnostic({ error_type: "OSError", message: "[Errno 22] Invalid argument" }), "error");
});
