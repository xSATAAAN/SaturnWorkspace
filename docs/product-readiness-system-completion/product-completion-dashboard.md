# Saturn Workspace Product Completion Dashboard

Updated: 2026-06-23

## Current phase status

| Phase | Status | Evidence |
| --- | --- | --- |
| B - Critical auth and subscription foundations | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Auth, subscription, OTP queue, commercial truth, and rollout checks pass. |
| C - Account and Desktop Linking | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Connection and entitlement remain separate; device/session tests pass. |
| D - Support and notifications | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Support ownership, webhook, retry, idempotency, rate-limit, lock, and private attachment tests pass. |
| E - Commercial truth | `COMPLETE_EXCEPT_WAITING_EXTERNAL_INTEGRATION` | Plan catalog and entitlement truth are live; checkout remains disabled until a real payment provider is approved and mapped. |
| F - Admin completion | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Admin schema contracts, RBAC paths, account/subscription operations, diagnostics, and readiness checks pass. |
| G - Consolidated acceptance | `PHASE_G_IMPLEMENTATION_COMPLETION_PENDING_CONSOLIDATED_MANUAL_ACCEPTANCE` | Implementation remediation is deployed or prepared; consolidated manual acceptance remains deferred. |

## Production evidence

- Auth Worker deployment: `a5118677-1159-419e-8258-050d47816a3f` on 2026-06-23.
- Policy Worker deployment: `0ba7732a-3684-4fe8-aff5-f253f8660432` on 2026-06-23.
- Admin Worker deployment: `8f37583d-9cb4-4dbb-853a-d5b700dc7e55` on 2026-06-23.
- Auth health: `https://auth.saturnws.com/health` returns success.
- Policy health: `https://api.saturnws.com/health` returns success.
- Protected Auth/Policy/Admin checks return `401` for invalid credentials.
- Plan catalog returns weekly/monthly/annual visible plans with provider checkout disabled. Current prices: weekly $10 discounted from $15, monthly $35 discounted from $50 with 7 trial days, annual $350 discounted from $600 with 7 trial days.
- D1 remote migrations: no pending migrations.
- Policy route: `api.saturnws.com/*`; Workers.dev and preview URLs remain disabled.
- Cron: `*/5 * * * *`.
- Local checks: Admin `test:phase-g`, Auth `check` + `test:phase-c`, Policy `check` + `test:phase-c/d/f`, Site `npm run build`.

## State and source-of-truth decisions

- Firebase UID is the canonical account and subscription owner. Email is display/search data only.
- A user without a UID-owned current subscription resolves to `No subscription`; no default plan, expiry, or lifecycle is invented.
- Users come from `account_profiles`. Subscriptions come from real `account_subscriptions` rows and are split into current/history projections.
- Account connection, account lifecycle, session validity, and entitlement are independent state dimensions.
- Admin mutations use explicit preview/execute operations, reason codes, stale-preview checks, idempotency, advisory locks, and audit records.
- Manual grant recovery evidence is now produced for replacement grants. It uses the enriched ledger schema when available and falls back to the legacy ledger shape until the additive Phase G Supabase migration is applied.
- Audit reads use `admin_activity` as the canonical Supabase source with the existing R2 audit as a bounded legacy fallback.
- Content remains static and versioned in source. No empty CMS route is exposed.

## Delivered or prepared in Phase G remediation

- Admin `account_profiles` contract was corrected to use `firebase_uid`, with a schema-contract test preventing regression.
- Plan catalog visibility and checkout availability are separate; payment-provider absence no longer hides valid plans.
- OTP production delivery is enabled through Auth -> Policy email queue with OTP values excluded from jobs/logs.
- Support attachments are implemented as private R2 objects with upload/download/delete authorization, customer/admin projections, orphan cleanup, and automated tests.
- Safe account deletion request/cancel flow is implemented as a non-destructive workflow with recent-auth requirement, cooling-off state, session revocation, and no purge endpoint.
- Account deletion UI degrades honestly to `unavailable` until the additive Supabase table migration is applied.
- Admin role assignment parsing supports UID-based assignments. `ADMIN_ROLE_ASSIGNMENTS` is still operationally required because the current secret list does not show it configured.

## Feature flags and external dependencies

- Auth email flag: `EMAIL_AUTH_ENABLED=true`.
- Policy email flags currently enabled: outbound, inbound, support, auth, scheduler.
- Billing, release, security, and admin-alert email flags remain disabled.
- Real payment checkout remains unavailable until a payment provider and plan mappings are approved.
- `ADMIN_ROLE_ASSIGNMENTS` must be configured before multi-role operational use.
- Additive Supabase migration `workers/auth/migrations/20260622215206_phase_g_recovery_deletion.sql` still requires an authenticated Supabase migration channel before account deletion requests become operational in production.

## Deferred live or destructive checks

- No real subscription grant was executed.
- No real release was uploaded or published.
- No live kill switch or mandatory-update policy was enabled.
- No irreversible account deletion was implemented or performed.
- No payment was attempted.
- No Setup was built and no Desktop, Launcher, Updater, Installer, OTA client, or `APP_VERSION` file was changed.

Active gate: `PHASE_G_IMPLEMENTATION_COMPLETION_PENDING_CONSOLIDATED_MANUAL_ACCEPTANCE`.
