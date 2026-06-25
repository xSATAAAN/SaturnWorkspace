# Saturn Workspace Product Completion Dashboard

Updated: 2026-06-25

## Current Phase Status

| Phase | Status | Evidence |
| --- | --- | --- |
| B - Critical auth and subscription foundations | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Auth, OTP queue, commercial truth, and rollout checks pass. Manual acceptance is deferred to Phase G. |
| C - Account and Desktop Linking | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Account connection and entitlement remain separate; Auth Worker and cross-layer checks pass. |
| D - Support and notifications | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Support ownership, webhook, retry, idempotency, rate-limit, lock, and private attachment contract tests pass. |
| E - Commercial truth | `COMPLETE_EXCEPT_WAITING_EXTERNAL_INTEGRATION` | Plan catalog and entitlement truth are live; checkout remains disabled until a real payment provider is approved and mapped. |
| F - Admin completion | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Admin schema contracts, RBAC paths, account/subscription operations, diagnostics, and readiness checks pass. |
| G - Pre-acceptance completion | `PHASE_G_PRE_ACCEPTANCE_COMPLETION_ACTIVE` | Phase G pre-acceptance remediation is active again because live product evidence contradicted prior reports. Consolidated manual acceptance has not started. |

## Production Evidence

- Canonical repository: `D:\SaturnWS\github-deploy\SaturnWorkspace`.
- Canonical `main` is the current source of truth. The latest code-bearing public site change in this continuation is commit `3e090fb198429cf26d5f3866f9adc41c1651dfdf`; GitHub Pages workflow run `28120228875` deployed that site source successfully. Later commits in this batch may update only living documentation and captured evidence.
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
  - Security email producers exist in the current worktree for selected committed session, device, and account-lifecycle events. `EMAIL_SECURITY_ENABLED=true` is deployed on Auth `53764ba0-207e-42e7-84f8-4e59741d0a06`, Admin `85b71833-73d3-445a-a498-d8c1f3b4e9ef`, and Policy `cec58841-cbc9-44e4-853f-054425d29ecc`; production-safe event delivery verification remains pending.
  - Admin alert producers exist in the current worktree for final email queue failure, webhook verification failure, cleanup failure, storage configuration failure, schema mismatch, readiness degradation, and high-severity tamper signals. `EMAIL_ADMIN_ALERTS_ENABLED=true` is deployed on Policy `cec58841-cbc9-44e4-853f-054425d29ecc`, `EMAIL_ADMIN_ALERT_RECIPIENTS` is configured as a Policy Worker secret, and safe alert-delivery verification remains pending.
  - Billing and release email categories remain disabled.
- Secret inventory:
  - Policy Worker has `RESEND_SEND_API_KEY`, `RESEND_RECEIVE_API_KEY`, and `RESEND_WEBHOOK_SECRET`.
  - Auth Worker has `AUTH_EMAIL_ENQUEUE_TOKEN` and `EMAIL_VERIFICATION_PEPPER`.
  - Admin Worker does not currently show `ADMIN_ROLE_ASSIGNMENTS`; multi-role RBAC is therefore `OPERATIONAL_CONFIGURATION_REQUIRED`.
  - `ADMIN_EMAIL_ENQUEUE_TOKEN` is configured on Admin and Policy Workers so Admin account lifecycle security emails can use the internal enqueue path after deployment.
- Tests run during Phase G continuation:
  - Repository mojibake scan: passed.
  - Policy `test:phase-g`: passed.
  - Auth `check` and `test:phase-c`: passed.
  - Admin `check:syntax` and `test:phase-g`: passed.
  - Desktop Python compile, frontend build, and QA Setup build: passed.
  - Site Phase B.1, Phase C, and Phase F checks: passed.
  - Local visual QA generated pricing-card fixture screenshots. Live public-route visual evidence now covers Arabic/English desktop, tablet, and mobile layouts for `/`, `/pricing`, `/downloads`, `/contact`, and `/account/signin`.

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
- Security email producers were added in source for new desktop device link, session revoke, device revoke, revoke-all, deletion request/cancel, account suspend, and account reactivate. Local producer tests pass, category flags are deployed, and no production lifecycle mutation was executed for verification.
- Admin alert producer coverage is implemented in source for the required operational families with deterministic idempotency/cooldown. The approved recipient is configured as a Worker secret, category flags are deployed, and no false production incident was generated.
- Public pricing copy and card presentation were updated to the approved current prices and promotional trial language. Backend catalog remains price/status truth, while user-facing plan differentiators are localized in the content layer. Live bundle `assets/index-CWMQLj65.js` contains the approved weekly/monthly/annual price values and no provider-name public copy or mojibake markers.
- Email/password registration OTP boundary defect was found and fixed and deployed: signup no longer provisions a Saturn profile before OTP, Auth account endpoints, explicit provision, and Desktop device linking now fail closed for unverified password identities, OTP verification finalizes the same Firebase UID profile with `verification_source = saturnws_otp`, the frontend verification gate defaults on, and the production site bundle no longer contains OTP test-code display/storage logic. Auth Worker version `f068253f-4a8b-492f-babc-5f2adfdf6cba` and GitHub Pages run `28165825916` are live. Local Auth Worker/Site checks and safe live contract checks pass. Disposable QA inbox acceptance remains pending.
- Live public rendered evidence for commit `3e090fb198429cf26d5f3866f9adc41c1651dfdf` found and fixed a Contact mobile overflow defect. Recaptured screenshots under `docs/product-readiness-system-completion/visual-evidence/phase-g-20260624-live-public` show 30/30 public route/locale/viewport captures returning 200 with correct RTL/LTR direction and zero horizontal overflow.
- Public plan catalog CORS source was repaired to allow Saturn public origins as well as Admin origins. Post-deploy verification confirmed `https://admin-api.saturnws.com/api/plans/catalog` returns 200 with `Access-Control-Allow-Origin: https://saturnws.com` for the public origin.
- Legacy root static website artifacts were removed from source. GitHub Pages continues to publish `site/dist`, and the cutover guard blocks known legacy public bundle tokens from returning. Live HTML references `assets/index-CWMQLj65.js` and `assets/index-C_PYWi_F.css` from workflow run `28120228875`.

## Operational Configuration Required

| Item | State | Required action |
| --- | --- | --- |
| `ADMIN_ROLE_ASSIGNMENTS` | `OPERATIONAL_CONFIGURATION_REQUIRED` | Configure UID-based role JSON as an Admin Worker secret before multi-role acceptance. Do not use email identity. The current UID was not guessed or printed. |
| Email/password OTP remediation credentialed QA | `PENDING_MANUAL_ACCEPTANCE` | Auth Worker and site are deployed. Live health, route, bundle, CORS, and stable unauthenticated error contracts pass. Credentialed disposable QA registration/OTP proof remains deferred to Phase G without exposing password, OTP, UID, token, or cookies. |
| Real payment provider | `WAITING_EXTERNAL` | Approve provider, plan mappings, webhook contract, and rollout before checkout or billing emails are enabled. |
| QA email delivery acceptance | `PENDING_MANUAL_ACCEPTANCE` | Use a dedicated QA recipient in Phase G to confirm provider delivery without exposing OTP values. |
| QA Desktop Setup artifact | `QA_ARTIFACT_BUILT_PENDING_MANUAL_ACCEPTANCE` | Local artifact: `D:\SaturnWS\build-output\phase-g-qa-installed-channel-20260624-131944\setup\SaturnWorkspace-Setup-1.0.7-beta-phase-g-qa.exe`; SHA256 `527C21D6A87720DB31E0EC4A8F59EA6FF2299C928C1B83447E2AC1E6AAA45DDD`. Not published. |
| Desktop reproducibility inventory | `RECORDED_PENDING_MANUAL_ACCEPTANCE` | Source manifest and artifact record are under `docs/product-readiness-system-completion/desktop-reproducibility`; no Desktop rebuild was performed in this continuation. |
| Public plan CORS live verification | `PRODUCTION_VERIFIED_AUTOMATED` | Admin Worker was redeployed and `https://admin-api.saturnws.com/api/plans/catalog` returns `Access-Control-Allow-Origin: https://saturnws.com` for the public origin. |

## Explicit Non-Actions

- No real subscription grant was executed.
- No real recovery operation was executed.
- No payment, refund, invoice, or receipt event was created.
- No release was published.
- No live kill switch or forced-update policy was enabled.
- No irreversible account deletion or purge endpoint was implemented.

Current state: `PHASE_G_PRE_ACCEPTANCE_COMPLETION_ACTIVE`.
