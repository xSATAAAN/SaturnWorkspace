# Saturn Workspace Product Completion Dashboard

Updated: 2026-06-24

## Current Phase Status

| Phase | Status | Evidence |
| --- | --- | --- |
| B - Critical auth and subscription foundations | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Auth, OTP queue, commercial truth, and rollout checks pass. Manual acceptance is deferred to Phase G. |
| C - Account and Desktop Linking | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Account connection and entitlement remain separate; Auth Worker and cross-layer checks pass. |
| D - Support and notifications | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Support ownership, webhook, retry, idempotency, rate-limit, lock, and private attachment contract tests pass. |
| E - Commercial truth | `COMPLETE_EXCEPT_WAITING_EXTERNAL_INTEGRATION` | Plan catalog and entitlement truth are live; checkout remains disabled until a real payment provider is approved and mapped. |
| F - Admin completion | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Admin schema contracts, RBAC paths, account/subscription operations, diagnostics, and readiness checks pass. |
| G - Pre-acceptance completion | `PHASE_G_IMPLEMENTATION_COMPLETE_WITH_EXPLICIT_OPERATIONAL_CONFIGURATION_ITEMS` | Implementation remediation is complete for this batch. Consolidated manual acceptance has not started. |

## Production Evidence

- Canonical repository: `D:\SaturnWS\github-deploy\SaturnWorkspace`.
- Current local HEAD and `origin/main`: `c3ae2689a9d2ce6ba285d51e5f5ac957f2de4b64` before the current Phase G worktree changes.
- Supabase project: `Saturn Workspace` / ref `iqvwoivlamglyblftwez`.
- Applied Supabase migrations:
  - `20260623214309 phase_g_recovery_deletion`
  - `20260623214410 phase_g_account_deletion_grants_least_privilege`
  - `20260623214533 phase_g_fix_commercial_plan_arabic`
- Supabase postflight:
  - `account_deletion_requests` exists with RLS enabled.
  - `subscription_recovery_ledger` contains enriched recovery evidence columns.
  - `account_deletion_requests` and `subscription_recovery_ledger` have zero existing rows at postflight, so no existing rows were lost.
  - `service_role` has only `SELECT`, `INSERT`, and `UPDATE` on `account_deletion_requests`; no `anon` or `authenticated` grants were found.
  - Arabic plan names in `commercial_plans.localized_content.ar.name` now round-trip as valid UTF-8 for weekly, monthly, and annual plans.
- Worker flags in source:
  - Auth: `EMAIL_AUTH_ENABLED=true`.
  - Policy: `EMAIL_OUTBOUND_ENABLED=true`, `EMAIL_INBOUND_ENABLED=true`, `EMAIL_SUPPORT_ENABLED=true`, `EMAIL_AUTH_ENABLED=true`, `EMAIL_SCHEDULER_ENABLED=true`.
  - Policy billing, release, security, and admin-alert email categories remain disabled.
- Secret inventory:
  - Policy Worker has `RESEND_SEND_API_KEY`, `RESEND_RECEIVE_API_KEY`, and `RESEND_WEBHOOK_SECRET`.
  - Auth Worker has `AUTH_EMAIL_ENQUEUE_TOKEN` and `EMAIL_VERIFICATION_PEPPER`.
  - Admin Worker does not currently show `ADMIN_ROLE_ASSIGNMENTS`; multi-role RBAC is therefore `OPERATIONAL_CONFIGURATION_REQUIRED`.
- Tests run during Phase G continuation:
  - Repository mojibake scan: passed.
  - Policy `test:phase-g`: passed.
  - Auth `check` and `test:phase-c`: passed.
  - Admin `check:syntax` and `test:phase-g`: passed.
  - Desktop Python compile, frontend build, and QA Setup build: passed.

## State and Source-of-Truth Decisions

- Firebase UID is the canonical account identity. Email is display/search data only.
- Supabase/Postgres `account_subscriptions` is the legal subscription source.
- Auth Worker is the server boundary for account/subscription projection.
- Users come from `account_profiles`; subscription rows do not represent users.
- Account connection, lifecycle, session validity, network availability, and entitlement remain separate states.
- A user with no UID-owned current subscription resolves to exact no-subscription semantics. No default plan, expiry, or lifecycle is invented.
- Manual grants are not payments, orders, invoices, or provider transactions.
- Payment-provider absence leaves plans visible but checkout disabled.

## Phase G Remediation State

- `AGENTS.md` was upgraded to permanent project rules covering canonical workspace, complete-system work, root-cause discipline, state modeling, schema contracts, state-aware content, encoding integrity, email content design, QA setup rules, and Supabase connector handling.
- Supabase account deletion schema is live. The old account-deletion `schema_pending` status fallback has been removed from the status path; request/cancel still fail safely if a real backend schema error occurs.
- Recovery ledger schema is enriched in production. No real recovery or grant was executed.
- Arabic mojibake root cause identified for plan catalog: stored Supabase data, not transport charset. Deterministic values were repaired by migration.
- Desktop QA source also contained recoverable mojibake in startup and Google Drive OAuth copy; it was repaired in the external desktop source and the QA package product files scan clean.
- Repository-wide mojibake guard now scans runtime source, Workers, AGENTS, and generated `site/dist` when requested.
- Email catalog Phase G test renders Arabic/English HTML and plain text for each template and blocks mojibake, missing charset, missing RTL/LTR wrappers, empty CTA URLs, unsafe interpolation, disabled test sends, and implementation vocabulary leakage.
- Billing and release email templates remain disabled because no real committed payment/release event source is active.
- Security/admin-alert email categories remain disabled until reliable actionable event producers, deduplication/cooldown, and destination rules are accepted.

## Operational Configuration Required

| Item | State | Required action |
| --- | --- | --- |
| `ADMIN_ROLE_ASSIGNMENTS` | `OPERATIONAL_CONFIGURATION_REQUIRED` | Configure UID-based role JSON as a Worker secret before multi-role operations. Do not use email identity. |
| Real payment provider | `WAITING_EXTERNAL` | Approve provider, plan mappings, webhook contract, and rollout before checkout or billing emails are enabled. |
| QA email delivery acceptance | `PENDING_MANUAL_ACCEPTANCE` | Use a dedicated QA recipient in Phase G to confirm provider delivery without exposing OTP values. |
| QA Desktop Setup artifact | `QA_ARTIFACT_BUILT_PENDING_MANUAL_ACCEPTANCE` | Local artifact: `D:\SaturnWS\build-output\phase-g-qa-installed-channel-20260624-131944\setup\SaturnWorkspace-Setup-1.0.7-beta-phase-g-qa.exe`; SHA256 `527C21D6A87720DB31E0EC4A8F59EA6FF2299C928C1B83447E2AC1E6AAA45DDD`. Not published. |

## Explicit Non-Actions

- No real subscription grant was executed.
- No real recovery operation was executed.
- No payment, refund, invoice, or receipt event was created.
- No release was published.
- No live kill switch or forced-update policy was enabled.
- No irreversible account deletion or purge endpoint was implemented.

Active state: `PHASE_G_IMPLEMENTATION_COMPLETE_WITH_EXPLICIT_OPERATIONAL_CONFIGURATION_ITEMS`.
