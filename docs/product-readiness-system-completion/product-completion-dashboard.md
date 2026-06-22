# Saturn Workspace Product Completion Dashboard

Updated: 2026-06-22

## Current phase status

| Phase | Status | Evidence |
| --- | --- | --- |
| B - Critical auth and subscription foundations | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Automated Auth, subscription, email, and rollout checks pass. |
| C - Account and Desktop Linking | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Phase C is closed as `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`; connection and entitlement remain separate. |
| D - Support and notifications | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Ownership, webhook, idempotency, rate-limit, and lock checks pass. |
| E - Commercial truth | `COMPLETE_EXCEPT_WAITING_EXTERNAL_INTEGRATION` | Canonical subscription truth, catalog, and download authorization are live; real checkout remains disabled until a payment provider is approved and configured. |
| F - Admin completion | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Schema, Workers, Admin UI, migrations, builds, and automated checks are complete. |
| G - Consolidated acceptance | `PHASE_G_READY_FOR_CONSOLIDATED_ACCEPTANCE` | One consolidated manual acceptance gate; no intermediate manual gate remains. |

## Production evidence

- Supabase migrations: `phase_f_admin_operations`, `phase_f_admin_privilege_hardening`.
- Policy D1 migrations: `0014_invite_admin_controls.sql`, `0015_invite_atomic_claims.sql`.
- Policy Worker: `ed78fe79-292f-4cd7-9fa0-efcf14d46a90`.
- Admin Worker: `b6553308-4a84-4b98-b26e-5459503e7fc6`.
- Policy route: `api.saturnws.com/*`; Workers.dev and preview URLs remain disabled.
- Cron: `*/5 * * * *`.
- Site production build: passed locally; GitHub Pages deployment evidence is recorded after the Phase F commit workflow finishes.

## State and source-of-truth decisions

- Firebase UID is the canonical account and subscription owner. Email is display/search data only.
- A user without a UID-owned current subscription resolves to `No subscription`; no default plan, expiry, or lifecycle is invented.
- Users come from `account_profiles`. Subscriptions come from real `account_subscriptions` rows and are split into current/history projections.
- Account lifecycle and subscription lifecycle are independent.
- Admin mutations use explicit preview/execute operations, reason codes, stale-preview checks, idempotency, advisory locks, and audit records.
- Audit reads use `admin_activity` as the canonical Supabase source with the existing R2 audit as a bounded legacy fallback.
- Content remains static and versioned in source. No empty CMS route is exposed.

## Phase F delivered surfaces

- Distinct Overview, Users, Subscriptions, Commerce, Releases, Promotions, Support, Communications, Diagnostics, Policies, Audit, Readiness, and Settings routes.
- User search/filter/pagination and detail view with identity, subscription projection, sessions, devices, access requests, support, diagnostics, audit counts, and recovery evidence.
- Explicit account lifecycle, session/device revocation, subscription transition, manual grant, and recovery flows.
- Structured dashboard activity and partial-resource degradation reporting; no raw JSON dashboard.
- Crash-group workflow, tamper review, invite administration, structured policy controls, and readiness diagnostics.
- Content route omitted because no operational CMS exists.

## Feature flags and external dependencies

- `EMAIL_AUTH_ENABLED=false` remains unchanged.
- Real payment checkout remains unavailable until a payment provider and plan mappings are approved.
- Support attachments remain `NOT_IMPLEMENTED` and are not promised by the UI.
- Role enforcement is implemented. `ADMIN_ROLE_ASSIGNMENTS` must be configured to move allowlisted administrators away from compatibility `super_admin` defaults.
- Recovery execution is implemented, but recovery evidence must come from an approved evidence-producing workflow.

## Deferred live or destructive checks

- No real subscription grant was executed.
- No real release was uploaded or published.
- No live kill switch or mandatory-update policy was enabled.
- No irreversible account deletion was implemented or performed.
- No payment was attempted.
- No Setup was built and no Desktop, Launcher, Updater, Installer, OTA client, or `APP_VERSION` file was changed.

Active gate: `PHASE_G_READY_FOR_CONSOLIDATED_ACCEPTANCE`.
