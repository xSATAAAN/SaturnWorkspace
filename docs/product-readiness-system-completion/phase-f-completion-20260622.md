# Phase F Completion Report

Final automated status: `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.

## Implemented

- Canonical Users and Subscriptions Admin sources and routes.
- Explicit account, access, subscription, manual grant, and recovery operation contracts.
- Admin roles and backend permission checks.
- Idempotency, stale-preview validation, concurrency locks, reason model, and audit.
- Structured Overview, Diagnostics, Policies, Invites, Audit, Readiness, and Settings surfaces.
- Release publication review and structured promotions management.
- Supabase operation/recovery/crash-state schema with RLS and least-privilege service grants.
- D1 invite administration and atomic one-per-user/device claims.

## Production rollout

- Supabase migrations applied and postflight verified.
- D1 migrations 0014 and 0015 applied; no pending migrations.
- Policy Worker deployed as `ed78fe79-292f-4cd7-9fa0-efcf14d46a90`.
- Admin Worker deployed as `b6553308-4a84-4b98-b26e-5459503e7fc6`.
- Site build and automated checks passed before GitHub Pages rollout.

## Not executed

- No real manual grant, payment, release publish, kill switch, mandatory update, or irreversible deletion.
- No Desktop or distribution component was touched.
- No Setup was built.

## Recovery

- Supabase rollback is additive: revoke RPC execution, drop Phase F functions, then drop the three Phase F tables only if no Phase F records must be retained.
- D1 rollback is forward-only: disable invite administration routes first; preserve invite claims/audit history unless an explicit destructive migration is approved.
- Worker rollback uses the previous Cloudflare versions recorded in the dashboard.

Next gate: `PHASE_G_READY_FOR_CONSOLIDATED_ACCEPTANCE`.
