# Phase G Pre-Acceptance Completion

Updated: 2026-06-24

Status: `PHASE_G_IMPLEMENTATION_COMPLETE_WITH_EXPLICIT_OPERATIONAL_CONFIGURATION_ITEMS`

Consolidated manual acceptance has not started. This report records implementation, deployment, and automated verification evidence for the pre-acceptance completion batch only.

## Effective Instructions

- Effective project instructions: `D:\SaturnWS\github-deploy\SaturnWorkspace\AGENTS.md`.
- The file was updated with canonical workspace rules, evidence precedence, complete-system standard, root-cause discipline, orthogonal state modeling, schema/API contracts, state-aware content, encoding integrity, email content design, QA setup rules, Supabase connector handling, and A-G-only phase rules.

## Supabase Migration Evidence

- Project: `iqvwoivlamglyblftwez`.
- Applied migrations:
  - `20260623214309 phase_g_recovery_deletion`
  - `20260623214410 phase_g_account_deletion_grants_least_privilege`
  - `20260623214533 phase_g_fix_commercial_plan_arabic`
- Postflight:
  - `account_deletion_requests` exists and has RLS enabled.
  - `subscription_recovery_ledger` has enriched evidence columns for source reference, original period, lost duration, creator, reason, integrity hash, and recovery operation.
  - `account_deletion_requests` row count was zero at postflight.
  - `subscription_recovery_ledger` row count was zero at postflight.
  - No existing rows were deleted.
  - `service_role` has only `SELECT`, `INSERT`, and `UPDATE` on the Phase G deletion/recovery tables; no `anon` or `authenticated` grants were found.

## Recovery and Account Deletion

- Recovery evidence schema is live and verified structurally.
- No real recovery, replacement grant, payment, order, or invoice was executed.
- Account deletion request/cancel/cooling-off state is implemented as a non-destructive workflow.
- No purge endpoint or irreversible deletion was implemented.
- Disposable-account manual acceptance remains deferred to Phase G.

## RBAC

- Admin Worker role matrix supports only:
  - `super_admin`
  - `support`
  - `billing`
  - `release_manager`
  - `security_auditor`
  - `read_only`
- Legacy `security` and `auditor` inputs normalize to `security_auditor` for compatibility.
- `ADMIN_ROLE_ASSIGNMENTS` was not present in the Admin Worker secret list, so operational multi-role assignment remains `OPERATIONAL_CONFIGURATION_REQUIRED`.
- Direct API fixture tests cover supported roles, unassigned admin behavior, and non-admin behavior.

## OTP and Email Operations

- Auth verification email is linked to the real Auth flow and queues through Policy email operations.
- OTP remains hash-only in Supabase and sensitive payload remains temporary/encrypted in D1.
- No OTP value is returned in normal API responses or Admin queue projection.
- Provider delivery acceptance still requires a dedicated QA recipient in consolidated Phase G manual acceptance.
- Billing and release email categories remain `PREPARED_DISABLED` because no real payment or production-release event source exists.
- Security/admin-alert categories remain `PREPARED_DISABLED` until reliable actionable event producers, destination rules, deduplication, and cooldown are accepted.

## Encoding and Content

- Root cause for public plan-name mojibake: stored Supabase localized content, not HTTP transport. Deterministic plan names were repaired by migration.
- Root cause for Desktop QA startup/OAuth mojibake: external desktop source files contained recoverable incorrectly decoded UTF-8 text. `D:\SaturnWS\desktop-app\src\app.py` and `D:\SaturnWS\desktop-app\src\backend\adapters\cloud_sync.py` were repaired.
- Repository mojibake guard scans runtime source, Workers, `AGENTS.md`, and generated `site/dist`.
- Desktop source/package product scan is clean, excluding the intentional detector in `vault.py` and third-party library metadata.
- Email content guard renders Arabic/English HTML and plain text and blocks mojibake, missing charset, missing RTL/LTR wrappers, empty CTA URLs, unsafe interpolation, disabled test sends, and implementation wording.

## Support Attachments

- Support attachment contracts remain production-deployed and pending consolidated manual acceptance.
- Existing automated coverage verifies private storage behavior, ownership/admin authorization, projections, validation policy, deletion/orphan cleanup contracts, and email integration boundaries.
- No public R2 object URL exposure was introduced in this batch.

## Desktop Source Reconciliation and QA Setup

- Canonical Git repository does not contain Desktop source or setup scripts.
- External Desktop source used for QA build: `D:\SaturnWS\desktop-app`.
- `D:\SaturnWS\desktop-app` is not a Git repository; source revision is recorded as external local source.
- `APP_VERSION` remained `1.0.7-beta`; no version bump was made for QA.
- A non-force `npm audit fix` was applied in `D:\SaturnWS\desktop-app\src\frontend` to remove high-severity frontend build-tool advisories. One low-severity esbuild dev-server advisory remains.
- QA setup was built locally only and was not uploaded to OTA, GitHub Releases, R2, or a live manifest.

Artifact:

- Path: `D:\SaturnWS\build-output\phase-g-qa-installed-channel-20260624-131944\setup\SaturnWorkspace-Setup-1.0.7-beta-phase-g-qa.exe`
- Size: `42469032`
- SHA256: `527C21D6A87720DB31E0EC4A8F59EA6FF2299C928C1B83447E2AC1E6AAA45DDD`
- Build log: `D:\SaturnWS\build-output\logs\phase-g-qa-setup-20260624-131944.log`
- Package checks: launcher present, update helper present, app executable present, install manifest present, extension zip present, no `.new`/temporary leftovers.
- Update helper ACL self-check: `valid=true`.
- Secret filename scan: no `.env`, private signing key, OAuth local JSON file, or local secret file was present. Public verification keys and CA bundle are present by design.
- Product package mojibake scan: clean.

Install/uninstall smoke was not executed because it would modify the real local installed application and user environment. It remains part of consolidated Phase G manual acceptance.

## Automated Verification

- `node scripts/check-no-mojibake.mjs`
- `node scripts/check-no-mojibake.mjs --include-dist`
- `npm audit --audit-level=high` in `site`, `workers/auth`, `workers/admin`, and `workers/policy`
- `npm run test:phase-g` in `workers/policy`
- `npm run check` and `npm run test:phase-c` in `workers/auth`
- `npm run check:syntax` and `npm run test:phase-g` in `workers/admin`
- `npm run test:phase-c` and `npm run test:phase-f` in `site`
- `npm run build` in `site`
- Desktop Python compile
- Desktop frontend build
- Desktop high-severity npm audit
- Desktop QA setup build and helper self-check

Known warnings:

- Site production build has a Vite chunk-size warning above 500 kB.
- Desktop production frontend build has a Vite chunk-size warning above 500 kB.
- Desktop frontend audit has one low-severity esbuild dev-server advisory.

## Production Deployments

- Auth Worker version deployed during this batch: `13f5516e-bec4-41fb-99d5-0fa4f81b1c18`.
- Policy Worker version deployed during this batch: `59c737d8-426b-4292-879e-b981a9640ac8`.
- Admin Worker version deployed during this batch: `ea20ecb1-9d3c-48b1-b0b1-8430a709d219`.
- Live health checks:
  - `https://auth.saturnws.com/health`: 200.
  - `https://api.saturnws.com/health`: 200.
- Unauthorized account deletion status smoke: 401 as expected.
- Live plan catalog smoke: 200 JSON, UTF-8, no mojibake.

## Explicit Non-Actions

- No real payment, refund, invoice, or receipt was created.
- No real production subscription grant was executed.
- No real recovery operation was executed.
- No production release was published.
- No live kill switch or forced update was enabled.
- No irreversible account deletion or hard purge was executed.
- No Desktop QA artifact was published to OTA, GitHub Releases, R2, or a live manifest.

## Remaining Operational Configuration

| Item | State | Required later |
| --- | --- | --- |
| `ADMIN_ROLE_ASSIGNMENTS` | `OPERATIONAL_CONFIGURATION_REQUIRED` | Configure UID-based role JSON as an Admin Worker secret and redeploy Admin Worker before multi-role acceptance. |
| QA email recipient | `PENDING_MANUAL_ACCEPTANCE` | Use a dedicated QA recipient to confirm provider delivery without exposing OTP values. |
| Payment provider | `WAITING_EXTERNAL` | Approve and configure real provider, mappings, webhooks, rollback, and billing email activation. |
| Manual Desktop install/uninstall acceptance | `PENDING_MANUAL_ACCEPTANCE` | Test install, launch, shortcuts, Add/Remove Programs, repair/upgrade, uninstall, logs, and data retention in Phase G manual acceptance. |

Final implementation state: `PHASE_G_IMPLEMENTATION_COMPLETE_WITH_EXPLICIT_OPERATIONAL_CONFIGURATION_ITEMS`.
