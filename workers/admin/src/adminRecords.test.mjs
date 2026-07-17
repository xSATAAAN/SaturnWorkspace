import assert from "node:assert/strict";
import test from "node:test";

import {
  subscriptionDiagnosticFilter,
  subscriptionRowsWithProjection,
} from "./index.js";

test("durable current subscription state is separate from entitlement projection", () => {
  const rows = subscriptionRowsWithProjection([
    {
      id: "11111111-1111-4111-8111-111111111111",
      firebase_user_id: "firebase-user-1",
      is_current: true,
      lifecycle_state: "active",
      status: "active",
      plan_term: "monthly",
      starts_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2026-02-01T00:00:00.000Z",
      period_end_at: "2026-02-01T00:00:00.000Z",
      integrity_state: "ok",
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      firebase_user_id: "firebase-user-1",
      is_current: false,
      lifecycle_state: "cancelled",
      status: "canceled",
      plan_term: "monthly",
      starts_at: "2025-01-01T00:00:00.000Z",
      expires_at: "2025-02-01T00:00:00.000Z",
      period_end_at: "2025-02-01T00:00:00.000Z",
      integrity_state: "ok",
      created_at: "2025-01-01T00:00:00.000Z",
    },
  ]);

  assert.equal(rows[0].is_current_record, true);
  assert.equal(rows[1].is_current_record, false);
  assert.equal(rows[0].is_current_projection, false);
});

test("diagnostic queries use subscription UUIDs and skip users without subscriptions", () => {
  assert.equal(subscriptionDiagnosticFilter([]), "");
  assert.equal(
    subscriptionDiagnosticFilter([{ id: "11111111-1111-4111-8111-111111111111" }]),
    "subscription_id=in.(11111111-1111-4111-8111-111111111111)",
  );
});
