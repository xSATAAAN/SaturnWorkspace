import assert from "node:assert/strict";
import test from "node:test";

import {
  crashSignatureSource,
  enforceCrashIngestRateLimit,
  ingestCrashLog,
  listCrashGroups,
  listCrashLogs,
  purgeExpiredDiagnostics,
  readCrashIngestBody,
  sanitizeCrashValue,
} from "./index.js";

function diagnosticEnv() {
  return {
    SUPABASE_URL: "https://database.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
    ALLOW_ANON_CRASH_INGEST: "1",
    ADMIN_RATE_LIMIT_CRASH_INGEST: { async limit() { return { success: true }; } },
  };
}

function diagnosticRequest(body, headers = {}) {
  return new Request("https://admin-api.saturnws.com/api/crash-logs/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.20", ...headers },
    body: JSON.stringify({
      event_id: "2ecda24e-2b8f-4381-9d16-15aefde2d32a",
      happened_at: new Date().toISOString(),
      error_type: "ProviderFailure",
      message: "provider_failed",
      stack_trace: "technical trace",
      raw_payload: { component: "desktop-app", context: "provider.start", ...body?.raw_payload },
      ...body,
    }),
  });
}

function diagnosticRow(index, happenedAt, overrides = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    happened_at: happenedAt,
    error_type: "ProviderFailure",
    message: "provider_failed",
    stack_trace: "technical trace",
    raw_payload: { component: "desktop-app", auth: { attribution: "unattributed" } },
    ...overrides,
  };
}

function timestampMicroseconds(value) {
  const match = /^(.*T\d\d:\d\d:\d\d)\.(\d{1,6})(?:Z|\+00:00)$/.exec(value);
  assert.ok(match, `Unexpected fixture timestamp: ${value}`);
  return BigInt(Date.parse(`${match[1]}Z`)) * 1000n + BigInt(match[2].padEnd(6, "0"));
}

async function mockDiagnosticStore(context, sessions = []) {
  const sessionsByHash = new Map();
  for (const [token, session] of sessions) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    sessionsByHash.set([...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join(""), session);
  }
  const store = { rows: new Map(), posts: [], patches: [], beforePatch: null };
  context.mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://database.example.test");
    const table = url.pathname.split("/").at(-1);
    const respond = (rows, status = 200) => new Response(JSON.stringify(rows), { status });
    if (table === "app_sessions") {
      const session = sessionsByHash.get(url.searchParams.get("session_token_hash")?.replace(/^eq\./, ""));
      return respond(session ? [session] : []);
    }
    assert.equal(table, "crash_logs");
    if (init.method === "POST") {
      const incoming = JSON.parse(init.body);
      store.posts.push(incoming);
      assert.equal(url.searchParams.get("on_conflict"), "id");
      assert.match(init.headers.Prefer, /resolution=ignore-duplicates/);
      if (store.rows.has(incoming.id)) return respond([], 201);
      store.rows.set(incoming.id, structuredClone(incoming));
      return respond([incoming], 201);
    }
    const id = url.searchParams.get("id")?.replace(/^eq\./, "");
    const row = store.rows.get(id);
    if (init.method === "GET") return respond(row ? [structuredClone(row)] : []);
    assert.equal(init.method, "PATCH");
    const incoming = JSON.parse(init.body);
    store.patches.push({ id, incoming, query: url.searchParams });
    if (store.beforePatch) store.beforePatch(row, incoming);
    const expected = url.searchParams.get("raw_payload->>occurrence_count");
    const matches = expected === "is.null"
      ? row?.raw_payload?.occurrence_count == null
      : expected === `eq.${row?.raw_payload?.occurrence_count}`;
    if (!row || !matches) return respond([]);
    Object.assign(row, incoming);
    return respond([structuredClone(row)]);
  });
  return store;
}

function assertDiagnosticAcknowledgement(result, eventId) {
  assert.equal(result.success, true);
  assert.equal(result.accepted, true);
  assert.equal(result.event_id, eventId);
  assert.deepEqual(Object.keys(result.item), ["id"]);
}

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

test("anonymous diagnostics stay unattributed even when the body claims an owner", async (context) => {
  let inserted = null;
  context.mock.method(globalThis, "fetch", async (_url, init) => {
    inserted = JSON.parse(init.body);
    return new Response(JSON.stringify([inserted]), { status: 201 });
  });

  const result = await ingestCrashLog(diagnosticRequest({
    raw_payload: { runtime: { firebase_user_id: "unverified-owner" } },
  }), diagnosticEnv());

  assert.equal(result.accepted, true);
  assert.equal(inserted.subscription_id, null);
  assert.equal(inserted.raw_payload.auth.attribution, "unattributed");
  assert.equal(inserted.raw_payload.runtime.firebase_user_id, undefined);
});

test("a valid app session attributes only the matching captured operator", async (context) => {
  const session = {
    user_id: "firebase-owner",
    subscription_id: "0711767d-e3c2-4e39-b75c-35c9c8309bd2",
    license_id: "8a593a86-9160-437d-8674-f9cb924255ab",
    hwid: "verified-device",
    expires_at: "2099-01-01T00:00:00Z",
  };
  let inserted = null;
  context.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).includes("/app_sessions")) return new Response(JSON.stringify([session]), { status: 200 });
    inserted = JSON.parse(init.body);
    return new Response(JSON.stringify([inserted]), { status: 201 });
  });

  const result = await ingestCrashLog(diagnosticRequest({
    raw_payload: { runtime: { firebase_user_id: "firebase-owner" } },
  }, { Authorization: "Bearer app-session-token" }), diagnosticEnv());

  assert.equal(result.accepted, true);
  assert.equal(inserted.subscription_id, session.subscription_id);
  assert.equal(inserted.raw_payload.auth.attribution, "verified");
  assert.equal(inserted.raw_payload.auth.firebase_user_id, "firebase-owner");
  assert.equal(inserted.raw_payload.runtime.firebase_user_id, undefined);
});

test("an account switch cannot reattribute a queued report", async (context) => {
  const session = {
    user_id: "later-owner",
    subscription_id: "0711767d-e3c2-4e39-b75c-35c9c8309bd2",
    hwid: "verified-device",
    expires_at: "2099-01-01T00:00:00Z",
  };
  let inserted = null;
  context.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).includes("/app_sessions")) return new Response(JSON.stringify([session]), { status: 200 });
    inserted = JSON.parse(init.body);
    return new Response(JSON.stringify([inserted]), { status: 201 });
  });

  await ingestCrashLog(diagnosticRequest({
    raw_payload: { runtime: { firebase_user_id: "original-owner" } },
  }, { Authorization: "Bearer later-session-token" }), diagnosticEnv());

  assert.equal(inserted.subscription_id, null);
  assert.equal(inserted.raw_payload.auth.attribution, "unattributed");
  assert.equal(inserted.raw_payload.auth.warning, "captured_owner_mismatch");
});

test("retention cleanup deletes reports older than ninety days", async (context) => {
  let deletion = null;
  context.mock.method(globalThis, "fetch", async (url, init) => {
    deletion = { url: String(url), method: init.method };
    return new Response(null, { status: 204 });
  });

  const result = await purgeExpiredDiagnostics(diagnosticEnv(), Date.parse("2026-10-10T00:00:00Z"));
  assert.equal(result.retention_days, 90);
  assert.equal(deletion.method, "DELETE");
  assert.match(deletion.url, /happened_at=lt\./);
});

test("diagnostic pages preserve microseconds and the ID tie-break without skipping reports", async (context) => {
  const second = new Date(Date.now() - 10000).toISOString().slice(0, 19);
  const rows = [
    diagnosticRow(5, `${second}.123900+00:00`),
    diagnosticRow(4, `${second}.123456+00:00`),
    diagnosticRow(3, `${second}.123456+00:00`),
    diagnosticRow(2, `${second}.123001+00:00`),
    diagnosticRow(1, `${second}.122999+00:00`),
  ];
  const boundaries = [];
  context.mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://database.example.test");
    assert.ok(url.pathname.endsWith("/crash_logs"));
    assert.equal(init.method, "GET");
    assert.equal(url.searchParams.get("order"), "happened_at.desc,id.desc");
    const filter = url.searchParams.get("and") || "";
    const cursor = /happened_at\.lt\.([^,)]+),and\(happened_at\.eq\.([^,)]+),id\.lt\.([^,)]+)/.exec(filter);
    let selected = rows;
    if (cursor) {
      assert.equal(cursor[1], cursor[2]);
      assert.match(cursor[1], /\.\d{6}\+00:00$/);
      boundaries.push({ at: cursor[1], id: cursor[3] });
      const boundary = timestampMicroseconds(cursor[1]);
      selected = rows.filter((row) => timestampMicroseconds(row.happened_at) < boundary
        || (timestampMicroseconds(row.happened_at) === boundary && row.id < cursor[3]));
    }
    return new Response(JSON.stringify(selected), { status: 200 });
  });

  const collected = [];
  let cursor = null;
  for (let page = 0; page < 3; page += 1) {
    const url = new URL("https://admin.example.test/api/admin/crash-logs?limit=2");
    if (cursor) url.searchParams.set("cursor", cursor);
    const result = await listCrashLogs(url, diagnosticEnv());
    collected.push(...result.items.map((row) => row.id));
    cursor = result.next_cursor;
    assert.equal(result.has_more, page < 2);
  }
  assert.deepEqual(collected, rows.map((row) => row.id));
  assert.deepEqual(boundaries, [
    { at: rows[1].happened_at, id: rows[1].id },
    { at: rows[3].happened_at, id: rows[3].id },
  ]);
  assert.equal(cursor, null);
});

test("group states are fetched by page fingerprints even beyond the first thousand states", async (context) => {
  const target = "f".repeat(64);
  const states = Array.from({ length: 1000 }, (_, index) => ({
    fingerprint: index.toString(16).padStart(64, "0"), status: "open",
  }));
  states.push({ fingerprint: target, status: "resolved", assignee: "support-operator", note: "Resolved in a newer version" });
  let stateReads = 0;
  context.mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://database.example.test");
    assert.equal(init.method, "GET");
    if (url.pathname.endsWith("/crash_logs")) {
      return new Response(JSON.stringify([diagnosticRow(1, new Date().toISOString(), { fingerprint: target })]), { status: 200 });
    }
    assert.ok(url.pathname.endsWith("/admin_crash_group_state"));
    stateReads += 1;
    assert.equal(url.searchParams.get("fingerprint"), `in.(${target})`);
    const selected = states.filter((row) => row.fingerprint === target);
    return new Response(JSON.stringify(selected), { status: 200 });
  });

  const result = await listCrashGroups(new URL("https://admin.example.test/api/admin/crash-groups"), diagnosticEnv());
  assert.equal(stateReads, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].fingerprint, target);
  assert.equal(result.items[0].status, "resolved");
  assert.equal(result.items[0].assignee, "support-operator");
});

test("repeated and reordered event deliveries keep one row and the greatest absolute count", async (context) => {
  const store = await mockDiagnosticStore(context);
  const eventId = "2ecda24e-2b8f-4381-9d16-15aefde2d32a";
  const first = new Date(Date.now() - 30000).toISOString();
  const later = new Date(Date.now() - 10000).toISOString();
  const counts = [1, 1, 7, 3, 7];
  const acknowledgements = [];
  for (const count of counts) {
    const result = await ingestCrashLog(diagnosticRequest({
      event_id: eventId,
      first_happened_at: first,
      last_happened_at: count === 7 ? later : first,
      occurrence_count: count,
    }), diagnosticEnv());
    assertDiagnosticAcknowledgement(result, eventId);
    acknowledgements.push(result.item.id);
  }
  assert.equal(new Set(acknowledgements).size, 1);
  assert.equal(store.rows.size, 1);
  const stored = [...store.rows.values()][0];
  assert.equal(stored.raw_payload.occurrence_count, 7);
  assert.equal(stored.raw_payload.first_happened_at, first);
  assert.equal(stored.raw_payload.last_happened_at, later);
  assert.equal(store.patches.length, 1);
});

test("a competing count update is retried without losing the higher count", async (context) => {
  const store = await mockDiagnosticStore(context);
  const eventId = "2ecda24e-2b8f-4381-9d16-15aefde2d32a";
  await ingestCrashLog(diagnosticRequest({ occurrence_count: 1 }), diagnosticEnv());
  store.beforePatch = (row) => {
    row.raw_payload.occurrence_count = 4;
    store.beforePatch = null;
  };
  const result = await ingestCrashLog(diagnosticRequest({ occurrence_count: 8 }), diagnosticEnv());
  assertDiagnosticAcknowledgement(result, eventId);
  assert.equal([...store.rows.values()][0].raw_payload.occurrence_count, 8);
  assert.equal(store.patches.length, 2);
  assert.equal(store.patches[0].query.get("raw_payload->>occurrence_count"), "eq.1");
  assert.equal(store.patches[1].query.get("raw_payload->>occurrence_count"), "eq.4");
});

test("logout and another operator cannot change an already attributed event", async (context) => {
  const owner = { user_id: "original-owner", hwid: "original-device", expires_at: "2099-01-01T00:00:00Z" };
  const other = { user_id: "later-owner", hwid: "later-device", expires_at: "2099-01-01T00:00:00Z" };
  const store = await mockDiagnosticStore(context, [["original-token", owner], ["later-token", other]]);
  const eventId = "2ecda24e-2b8f-4381-9d16-15aefde2d32a";
  const first = await ingestCrashLog(diagnosticRequest({
    raw_payload: { runtime: { firebase_user_id: owner.user_id } },
  }, { Authorization: "Bearer original-token" }), diagnosticEnv());
  const afterLogout = await ingestCrashLog(diagnosticRequest({ occurrence_count: 8 }), diagnosticEnv());
  const afterSwitch = await ingestCrashLog(diagnosticRequest({
    occurrence_count: 12,
    raw_payload: { runtime: { firebase_user_id: other.user_id } },
  }, { Authorization: "Bearer later-token" }), diagnosticEnv());
  for (const result of [first, afterLogout, afterSwitch]) assertDiagnosticAcknowledgement(result, eventId);
  assert.deepEqual(afterLogout.item, first.item);
  assert.deepEqual(afterSwitch.item, first.item);
  assert.equal(store.rows.size, 1);
  assert.equal(store.patches.length, 0);
  const stored = [...store.rows.values()][0];
  assert.equal(stored.raw_payload.auth.firebase_user_id, owner.user_id);
  assert.equal(stored.raw_payload.auth.attribution, "verified");
  assert.equal(stored.raw_payload.occurrence_count, 1);
  assert.doesNotMatch(JSON.stringify(afterLogout), /original-owner|original-device|technical trace/);
  assert.doesNotMatch(JSON.stringify(afterSwitch), /original-owner|original-device|technical trace/);
});

test("an anonymous event cannot become verified on a later authenticated retry", async (context) => {
  const owner = { user_id: "later-owner", hwid: "later-device", expires_at: "2099-01-01T00:00:00Z" };
  const store = await mockDiagnosticStore(context, [["later-token", owner]]);
  const eventId = "2ecda24e-2b8f-4381-9d16-15aefde2d32a";
  const anonymous = await ingestCrashLog(diagnosticRequest({
    raw_payload: { runtime: { firebase_user_id: owner.user_id } },
  }), diagnosticEnv());
  const authenticated = await ingestCrashLog(diagnosticRequest({
    occurrence_count: 9,
    raw_payload: { runtime: { firebase_user_id: owner.user_id } },
  }, { Authorization: "Bearer later-token" }), diagnosticEnv());
  assertDiagnosticAcknowledgement(authenticated, eventId);
  assert.deepEqual(authenticated.item, anonymous.item);
  assert.equal(store.rows.size, 1);
  assert.equal(store.patches.length, 0);
  const stored = [...store.rows.values()][0];
  assert.equal(stored.raw_payload.auth.attribution, "unattributed");
  assert.equal(stored.raw_payload.auth.firebase_user_id, null);
});

test("diagnostic redaction removes nested notes and request or response contents", () => {
  const privateFields = {
    note: "private managed note",
    notes: ["private managed notes"],
    text: "private editor text",
    request_body: { account: "private request content" },
    response_body: "private response content",
  };
  const sanitized = sanitizeCrashValue({
    raw_payload: { extra: { ...privateFields, provider: "provider-name", status: 503 } },
  });
  for (const key of Object.keys(privateFields)) {
    assert.equal(sanitized.raw_payload.extra[key], "[redacted]");
  }
  assert.equal(sanitized.raw_payload.extra.provider, "provider-name");
  assert.equal(sanitized.raw_payload.extra.status, 503);
  assert.doesNotMatch(JSON.stringify(sanitized), /private managed|private editor|private request|private response/);
});

test("legacy groups preserve their original signatures and triage after report projection", async (context) => {
  const now = new Date().toISOString();
  const rows = [
    diagnosticRow(2, now, {
      raw_payload: { component: "launcher", context: "launcher_start_failed" },
    }),
    diagnosticRow(1, now, {
      raw_payload: { component: "update-helper", context: "update_apply_failed" },
    }),
  ];
  const fingerprints = await Promise.all(rows.map(async (row) => {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(crashSignatureSource(row)));
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }));
  assert.notEqual(fingerprints[0], fingerprints[1]);
  context.mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://database.example.test");
    assert.equal(init.method, "GET");
    if (url.pathname.endsWith("/crash_logs")) return new Response(JSON.stringify(rows), { status: 200 });
    assert.ok(url.pathname.endsWith("/admin_crash_group_state"));
    const filter = url.searchParams.get("fingerprint");
    assert.ok(filter?.startsWith("in.(") && filter.endsWith(")"));
    assert.deepEqual(filter.slice(4, -1).split(",").sort(), [...fingerprints].sort());
    return new Response(JSON.stringify([
      { fingerprint: fingerprints[0], status: "resolved" },
      { fingerprint: fingerprints[1], status: "investigating" },
    ]), { status: 200 });
  });

  const result = await listCrashGroups(new URL("https://admin.example.test/api/admin/crash-groups"), diagnosticEnv());
  assert.equal(result.items.length, 2);
  const states = new Map(result.items.map((row) => [row.fingerprint, row.status]));
  assert.equal(states.get(fingerprints[0]), "resolved");
  assert.equal(states.get(fingerprints[1]), "investigating");
});
