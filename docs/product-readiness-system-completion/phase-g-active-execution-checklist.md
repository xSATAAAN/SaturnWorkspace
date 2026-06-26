# Phase G Active Execution Checklist

Updated: 2026-06-25

Current state: `PHASE_G_PRE_ACCEPTANCE_COMPLETION_ACTIVE`

This file is the persistent execution source for the current Phase G pre-acceptance continuation. Before each resumed session, read the effective global `AGENTS.md`, the project `AGENTS.md`, this file, and current Git status/HEAD, then continue from the first item not marked `COMPLETE_WITH_EVIDENCE`.

Completion states used here:

- `NOT_STARTED`
- `IN_PROGRESS`
- `BLOCKED_BY_TRUE_DEPENDENCY`
- `COMPLETE_WITH_EVIDENCE`

Do not mark an item complete because code was written, a build passed, or a page shell returned HTTP 200. Completed entries must include files changed, tests, deployment evidence, live verification evidence, and remaining limitation.

## 0. Capability and Environment Discovery

Status: `COMPLETE_WITH_EVIDENCE`

Requirement:

- Inspect the actual Codex environment before code edits.
- Record available and unavailable proof capabilities.
- Use the strongest appropriate tool for each proof without exposing secrets.

Evidence:

- Files changed: `docs/product-readiness-system-completion/phase-g-active-execution-checklist.md`.
- Tests/discovery:
  - Local filesystem and unrestricted terminal access are available.
  - Git is available and the canonical repository is on `main`; local HEAD and `origin/main` both resolve to `dcaab0a55b5259551039ab962bc595e459f0bde6`; working tree was clean at session start.
  - Node `v24.15.0`, npm `10.9.4`, Python 3.11, Wrangler, Chrome, Brave, and PostgreSQL 17 tools under `C:\Program Files\PostgreSQL\17\bin` are available.
  - `gh`, `psql`, `pg_dump`, and `pg_restore` are not on PATH; PostgreSQL tools must be invoked by absolute path when needed.
  - Windows Sandbox feature `Containers-DisposableClientVM` is disabled, so installer/Desktop GUI proof must remain manual acceptance unless another isolated environment is provided.
  - Local Playwright package was not installed in the root or `site` workspace at discovery time; browser proof can use the available Playwright MCP or install/use project tooling only when needed.
  - Tool discovery exposed Node REPL, Playwright browser control, Cloudflare API, Supabase connector, GitHub connector, and multi-agent tools.
  - Regular Chrome exists locally, but no existing authenticated Chrome session was accessed during this discovery.
- Deployment evidence: not applicable.
- Live verification evidence: not applicable.
- Remaining limitation: authenticated browser journeys still require a safe authenticated session; Desktop installer proof requires an isolated environment or remains Phase G manual acceptance.

## 1. Session Continuity and No-Forgetting Protocol

Status: `COMPLETE_WITH_EVIDENCE`

Requirement:

- Keep this checklist current with every numbered requirement in the active Phase G prompt.
- Record files changed, tests, deployment evidence, live verification evidence, and remaining limitation for completed entries.
- On every resume, read global `AGENTS.md`, project `AGENTS.md`, this checklist, Git status, and HEAD.
- Continue from the first unfinished item.

Evidence:

- Files changed: `docs/product-readiness-system-completion/phase-g-active-execution-checklist.md`.
- Tests: Git/HEAD/status and checklist existence were verified at session start.
- Deployment evidence: not applicable for a documentation-only execution-control file.
- Live verification evidence: not applicable.
- Remaining limitation: this file remains active until all later entries are `COMPLETE_WITH_EVIDENCE`.

## 2. Mandatory Global AGENTS.md Addition

Status: `COMPLETE_WITH_EVIDENCE`

Requirement:

- Update `C:\Users\Admin\.codex\AGENTS.md`.
- Insert the requested `Human Comprehension, Product Intent, and Proof of Quality` section.
- Preserve product-quality meaning without introducing mojibake into active instructions.

Evidence:

- Files changed: `C:\Users\Admin\.codex\AGENTS.md`.
- Tests: Node verification confirmed the section `Human Comprehension, Product Intent, and Proof of Quality`, `Every sentence needs a job`, and `Live workflow proof` are present.
- Deployment evidence: not applicable.
- Live verification evidence: not applicable.
- Remaining limitation: global AGENTS is outside the repository and is not committed to Git.

## 3. Mandatory Saturn Workspace AGENTS.md Addition

Status: `COMPLETE_WITH_EVIDENCE`

Requirement:

- Update `D:\SaturnWS\github-deploy\SaturnWorkspace\AGENTS.md`.
- Insert the requested human comprehension section.
- Insert `Saturn Workspace Commerce and Terminology Truth`.
- Preserve correct Arabic terminology and avoid adding mojibake to active project instructions.

Evidence:

- Files changed: `AGENTS.md`.
- Tests: Node verification confirmed the human comprehension section, `Saturn Workspace Commerce and Terminology Truth`, and Arabic Unicode content are present without mojibake markers.
- Deployment evidence: not applicable.
- Live verification evidence: not applicable.
- Remaining limitation: none for this instruction update.

## 4. Operational Decisions Provided by the User

Status: `IN_PROGRESS`

Requirement:

- Configure the current administrator as UID-based `super_admin` through `ADMIN_ROLE_ASSIGNMENTS`.
- Resolve the current administrator UID securely from trusted admin identity.
- Do not print UID in reports, logs, screenshots, or documentation.
- Ensure at least one working super administrator remains before deployment.
- Configure `EMAIL_ADMIN_ALERT_RECIPIENTS` securely to the approved recipient.
- Do not expose the recipient in public UI or committed source.
- Do not choose or invent an OTP QA recipient.

Evidence:

- Files changed: `workers/policy/wrangler.jsonc`, `workers/auth/wrangler.toml`, `workers/admin/wrangler.toml`.
- Tests: `wrangler secret list` confirmed `EMAIL_ADMIN_ALERT_RECIPIENTS` exists on the Policy Worker and `ADMIN_EMAIL_ENQUEUE_TOKEN` exists on both Policy and Admin Workers. `workers/auth npm run test:phase-c`, `workers/policy npm run test:phase-g`, and `workers/admin npm run check:syntax && npm run test:phase-f` pass after the configuration changes.
- Deployment evidence: Auth Worker active deployment `0186ad21-4c7b-4399-8c92-20a876fd5bee`, Policy Worker active deployment `b79cab4e-bc04-49a0-b1d3-25545f933344` (secret-change version after source deployment `cec58841-cbc9-44e4-853f-054425d29ecc`), and Admin Worker active deployment `85b71833-73d3-445a-a498-d8c1f3b4e9ef` are the current deployed versions relevant to this checklist.
- Live verification evidence: `https://api.saturnws.com/health` and `https://auth.saturnws.com/health` returned 200 after deployment. Post-deploy secret inventory confirmed `EMAIL_ADMIN_ALERT_RECIPIENTS` exists on Policy and `ADMIN_EMAIL_ENQUEUE_TOKEN` exists on Policy/Admin.
- Remaining limitation: `ADMIN_ROLE_ASSIGNMENTS` is not configured. The current admin Firebase UID has not been resolved from a live trusted identity in this session, and it must not be guessed, printed, or derived from stale backups. UID-based super-admin assignment remains an operational blocker for closing this item.

## 4a. Email/Password Registration OTP Boundary

Status: `IN_PROGRESS`

Requirement:

- New email/password registration must not create an active Saturn profile, protected portal state, or Desktop session before Saturn OTP verification.
- The browser must not collect the password until after Saturn OTP verification, and the password must be sent only to the Auth Worker finalization endpoint. It must not be stored in browser storage, Supabase, D1, R2, logs, reports, audit payloads, or telemetry.
- Pending registration may carry only non-sensitive metadata needed to finalize the Saturn account after OTP: display name, locale, terms version, and terms acceptance state.
- Legacy email/password accounts without Saturn OTP must be gated on the next protected validation and resume through the same Firebase UID after OTP.
- Google verified identity may finalize directly only through the trusted-provider path.
- Submitted display name must converge into `account_profiles` and render from the centralized profile source.

Evidence:

- Files changed: `workers/auth/src/index.ts`, `workers/auth/src/types.ts`, `workers/auth/wrangler.toml`, `workers/auth/scripts/check-phase-c-device-linking.mjs`, `site/src/api/emailVerification.ts`, `site/src/new-ui/adapters/contracts.ts`, `site/src/new-ui/adapters/errorContract.ts`, `site/src/new-ui/adapters/productionAdapters.ts`, `site/src/new-ui/adapters/productionFeatureFlags.ts`, `site/src/new-ui/app/navigationIntent.ts`, `site/src/new-ui/pages/production/ProductionPages.tsx`, `site/src/new-ui/foundation/auth.css`, `site/scripts/check-phase-b-production-rollout.mjs`, `docs/product-readiness-system-completion/assurance-baseline.md`, `docs/product-readiness-system-completion/system-and-workflow-map.md`, `docs/product-readiness-system-completion/workflow-assurance-matrix.md`.
- Root cause found:
  - `productionAdapters.auth.signUpWithEmail` created a Firebase password user and immediately called `/account/provision`.
  - Auth Worker `/account/subscription`, `/account/identity`, and device authorization paths auto-provisioned profiles for unverified password identities.
  - Frontend email verification was controlled by a build-time flag that defaulted off when unset.
  - The verification page still allowed a generic editable email route after signup because pending verification context was only treated as a loose email string instead of a registration-bound state object.
  - Live OTP delivery failed at the Auth-to-Policy enqueue handoff before D1 `email_jobs` insert. Direct Policy enqueue with the rotated shared token succeeded, which isolated the failure to Auth's public upstream handoff rather than Resend, scheduler, or D1 schema.
- Current source remediation:
  - New email/password signup now starts a server-side pending registration through `/email-verification/start`; it does not call Firebase account creation and does not collect a password before OTP.
  - Pending registration stores only normalized email, display name, locale, terms metadata, OTP hash/reference, expiry, attempt state, and finalization metadata. It stores no password, Firebase token, active account profile, product session, or entitlement.
  - OTP verification returns a one-time finalization token and still does not create a Firebase password identity or `account_profiles` row.
  - Password entry happens after OTP. `/email-verification/finalize` validates the one-time token, creates or reconciles the Firebase Email/Password identity server-side through the Auth Worker finalizer identity, creates exactly one canonical finalized `account_profiles` row, commits verification/name/terms/finalization metadata, sets the minimal finalized custom claim, records `credential_epoch`, consumes the pending registration only after finalization succeeds, and then requires fresh sign-in.
  - If a legacy password Firebase identity exists from the previous implementation without an account profile, finalization reconciles that same UID after OTP, updates the password/verified state server-side, and creates one profile. Google-only provider collisions fail closed instead of silently linking password.
  - Protected account endpoints, explicit `/account/provision`, Policy customer support/notification boundaries through Auth `/account/identity`, and Desktop device authorization require dual trust: valid Firebase token, server-issued finalized claim, canonical finalized profile, UID agreement, lifecycle allowance, and fresh token auth time after credential reconciliation.
  - Raw provider-only Firebase password identities without finalized Saturn authority have no product access, are audited by opaque reference only, are disabled when stale after the configured retention window, and can be re-enabled only through legitimate Saturn OTP finalization for the same email/UID.
  - Portal routes gate unverified email/password users to the verification page before rendering protected portal content.
  - Production UI no longer stores or displays OTP test codes; test transport remains confined to the Auth Worker behavior test.
  - Pending registration context is structured and non-sensitive. The verification page shows the destination email once as non-editable information, renders OTP inputs first, then renders password/confirm fields only after OTP verification. Direct `/account/verify` without context fails safely to signup/sign-in recovery.
  - Change email calls `/email-verification/cancel` for the pending registration, marks it superseded server-side, preserves valid non-sensitive signup fields, and returns to the editable signup step.
  - Auth Worker delivers verification email through the `POLICY_SERVICE` service binding when targeting Policy, avoiding the public HTTP handoff for the internal queue operation.
- Tests:
  - `workers/auth npm run check`: passed.
  - `workers/auth node scripts/check-phase-c-device-linking.mjs`: passed, including no Saturn-created Firebase identity/profile before OTP for new registration, weak-password rejection after OTP without identity creation, `FIREBASE_PROJECT_ID`/service-account project mismatch fail-closed before identity/profile creation, token-bound finalization replay, invalid replay rejection, legacy password identity reconciliation after OTP, Google-only collision fail-closed behavior, direct raw Firebase password-identity rejection/quarantine/reconciliation, stale pre-finalization token rejection, fresh finalized token acceptance, no `/account/subscription`, no `/account/identity`, no explicit `/account/provision`, and no Desktop session before finalization.
  - `workers/auth npm run test:phase-c`: passed on 2026-06-25 after the token-bound replay and project-mismatch reconciliation change.
  - `site npm run test:phase-b`: passed.
  - `site npm run test:phase-c`: passed.
  - `site npm run test:phase-f`: passed.
  - `site npm run build`: passed; known chunk-size warning remains.
  - `rg "test_code|localEmailVerificationCode|LOCAL_EMAIL_VERIFICATION_TEST_CODE_KEY" site/dist site/src/new-ui site/src/api`: no `site/dist` or `site/src/new-ui` matches; only the erased API response type remains in source.
- Deployment evidence:
  - Previous deployed Auth Worker version: `0186ad21-4c7b-4399-8c92-20a876fd5bee`.
  - Previous deployed Pages workflow run: `28174200979` from commit `9da6025189eccfff76509bac6f61d18942489f07`.
  - This continuation's OTP-first account creation and legacy-provider reconciliation source is not yet deployed.
- Live verification evidence:
  - `https://auth.saturnws.com/health` returned success for `auth-worker`.
  - `https://saturnws.com/account/signin/`, `/account/signup/`, and `/account/verify/` returned 200.
  - Live HTML references `assets/index-rasVfIJe.js`.
  - Live bundle scan found no `test_code` and no `localEmailVerificationCode` token.
  - Auth CORS preflight from `https://saturnws.com` to `/account/provision` returned 204 with the approved origin.
  - Unauthenticated `/account/provision`, `/account/subscription`, and `/email-verification/request` returned stable 4xx JSON contracts rather than 500.
  - Live signup journey reached `/account/verify`; `/email-verification/request` returned `200` with `status:"sent"` after the service-binding deployment.
  - Pending-registration verification rendered one redacted destination email occurrence, six OTP inputs, Continue, Resend, and Change email with no editable email input. Direct `/account/verify` without context rendered no email/OTP form.
  - Change email posted to `/email-verification/cancel` and returned to signup with valid non-sensitive fields preserved.
- Remaining limitation: live finalization requires deploying the current source and running disposable live canaries. The current runtime requires the Worker variable to match the service-account JSON `project_id` and fails closed before Firebase creation on mismatch. Runtime source no longer calls Firebase client signup; any provider-only password identity created outside Saturn has no finalized Saturn claim/profile, no product authority, and is quarantined/disabled when stale. Read-only Google preflight on 2026-06-26 confirmed the project is active, Email/Password and Google providers are enabled, authorized Saturn domains are present, no blocking functions are configured, the project subtype is `FIREBASE_AUTH`, and the authorized account has the tested IAM permissions needed for service-account/custom-role/config updates. The approved Identity Platform initialize call was rejected with `BILLING_NOT_ENABLED`; it is reclassified as `WAITING_EXTERNAL_BILLING_DEFENSE_IN_DEPTH` and is not a current Phase G blocker. The dedicated least-privilege Firebase finalizer role/service account now exists, Auth Worker `FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_PROJECT_ID=saturnws-1` are configured, the temporary local key file was deleted after Cloudflare accepted the secret, and UID-based `ADMIN_ROLE_ASSIGNMENTS` is configured without printing or documenting the UID. Disposable QA inbox/manual OTP acceptance, direct-signup quarantine live proof, Google regression, browser edge cases for case-only/back/multiple-tabs/expired context, and credentialed live happy-path completion remain Phase G; do not claim inbox delivery or manual acceptance from automated tests or safe live checks.

## 5. Pricing Page: Remove the Current Copy Model and Rebuild It

Status: `COMPLETE_WITH_EVIDENCE`

Requirement:

- Rebuild pricing information hierarchy, not individual sentences.
- Communicate weekly, monthly, and annual plans.
- Communicate that every current plan provides full access to the current tool.
- Communicate differences by period, price, approved discount, and monthly/annual trial terms.
- Communicate checkout unavailable until payment integration is active.
- Say each fact once.
- Remove abstract access language, launch-stage language, repeated discounts/trials, repeated unavailable copy, backend/provider narration, and misleading feature lists.
- Rebalance plan card spacing and bidi rendering.
- Review whether the popular badge remains justified.

Evidence:

- Files changed: `site/src/new-ui/pages/production/ProductionPages.tsx`, `site/src/new-ui/pages/public/PublicPages.tsx`, `site/src/new-ui/components/ui/ProductCards.tsx`, `site/src/new-ui/content/publicCopy.ts`, `site/src/new-ui/i18n/messages.ts`, `site/src/new-ui/foundation/components.css`, `site/src/new-ui/foundation/public.css`, `site/scripts/check-copy-quality.mjs`.
- Tests: `site npm run test:phase-b`, `site node scripts/check-copy-quality.mjs`, `site npm run test:phase-f`, `site npx tsc -p src/new-ui/tsconfig.json --noEmit`, and `site npm run build` pass. Build warning: main JS chunk exceeds 500 kB.
- Deployment evidence: GitHub Pages workflow run `28174200979` completed successfully for commit `9da6025189eccfff76509bac6f61d18942489f07`. Live HTML now references `assets/index-rasVfIJe.js` and `assets/index-Bk4Fv71E.css`. Admin Worker catalog CORS was deployed in `85b71833-73d3-445a-a498-d8c1f3b4e9ef`.
- Live verification evidence: live bundle `assets/index-rasVfIJe.js` returns 200 and contains the approved weekly/monthly/annual pricing values. Rendered screenshots under `D:\SaturnWS\build-output\phase-g-live-render` cover Arabic/English desktop, tablet, and mobile pricing. The captured summary records three cards, one shared full-tool statement, monthly/annual trial labels, no weekly trial label, no shared trial strip, no old shared-benefit strip, no large checkout banner, 265px card heights, no console errors, no failed requests, no Service Worker registration, and no Cache Storage entries.
- Remaining limitation: none for the pricing page IA itself. Full product-wide copy route inventory remains item 6 and does not reopen item 5.

## 6. Product-Wide Content Reconstruction

Status: `IN_PROGRESS`

Requirement:

- Create a rendered-content inventory for all live routes and states.
- For every visible sentence record route, state, user task, information job, repetition, keep/rewrite/remove, and reason.
- Review homepage, product sections, pricing, downloads, contact, auth, verification, account pages, support, notifications, settings, account deletion, every Admin route, modals, drawers, emails, and loading/empty/disabled/unavailable/error/success states.
- Replace or remove abstract and mechanically translated phrases, including the known account-management sentence family.
- Implement corrections, not observations only.

Evidence:

- Files changed: `workers/admin/src/index.js`, `workers/admin/src/security/payments.js`, `workers/admin/src/routes/downloads.test.mjs`, `workers/admin/src/adminCors.test.mjs`, `workers/admin/package.json`, `site/src/new-ui/adapters/productionAdapters.ts`, `site/src/new-ui/pages/production/ProductionPages.tsx`, `site/scripts/check-phase-f-admin.mjs`.
- Tests: `workers/admin npm run check:syntax`, `workers/admin npm run test:phase-f`, `site npm run test:phase-f`, `site npx tsc -p src/new-ui/tsconfig.json --noEmit`, and `site npm run build` pass. Admin CORS tests cover approved admin preflight, unknown-origin rejection, public catalog origin, and customer-download rejection from admin origin.
- Deployment evidence: Admin Worker `85b71833-73d3-445a-a498-d8c1f3b4e9ef` and GitHub Pages workflow run `28174200979` are deployed.
- Live verification evidence: safe Admin/Public CORS checks passed, and live public routes load `assets/index-rasVfIJe.js`. Public rendered route evidence covers `/`, `/pricing`, `/downloads`, `/contact`, and `/account/signin` in Arabic/English desktop, tablet, and mobile. The first live pass found Contact mobile overflow; the shared contact CSS was fixed and recaptured evidence shows 30/30 route/locale/viewport captures with 200 responses, correct RTL/LTR direction, no console errors, no real resource failures, and zero horizontal overflow. Current 2026-06-25 pricing/verification evidence is recorded under `D:\SaturnWS\build-output\phase-g-live-render`.
- Remaining limitation: product-wide rendered route inventory across authenticated customer/Admin surfaces and authenticated live Admin route verification remain required.

## 7. Fix Admin Releases `forbidden_origin` as a Shared Contract Defect

Status: `IN_PROGRESS`

Requirement:

- Reproduce the live authenticated Admin Releases failure through the real Admin flow.
- Record method, target host, path, origin, preflight, credentials mode, and response headers without exposing tokens.
- Inspect Admin SPA endpoint selection, Admin Worker origin validation, Admin API CORS, Policy proxy origin checks, preflight handling, origin normalization, approved origins, credentials mode, redirect behavior, direct routes, environment host values, and shared middleware.
- Implement one canonical Admin API origin policy with exact approved origins, credentialed CORS, correct preflight, unknown-origin rejection, stable user-facing errors, and reuse across Admin route families.
- Run authenticated Admin route sweep after the fix.

Evidence:

- Files changed: `workers/admin/src/index.js`, `workers/admin/src/security/payments.js`, `workers/admin/src/routes/downloads.test.mjs`, `workers/admin/src/adminCors.test.mjs`, `workers/admin/package.json`, `site/src/new-ui/adapters/productionAdapters.ts`, `site/src/new-ui/pages/production/ProductionPages.tsx`, `site/scripts/check-phase-f-admin.mjs`.
- Tests: `workers/admin npm run check:syntax && npm run test:phase-f` passes and covers approved Admin preflight, unknown-origin rejection, public catalog origin, and customer-download rejection from Admin origin. `site npm run test:phase-f` passes and asserts Admin Releases uses the admin endpoint contract and maps origin errors before rendering.
- Deployment evidence: Admin Worker `85b71833-73d3-445a-a498-d8c1f3b4e9ef` was deployed on 2026-06-24.
- Live verification evidence: Admin Releases preflight from `https://admin.saturnws.com` returned 204 with credentialed CORS; unknown origin returned 403 `origin_not_allowed`; unauthenticated Admin Releases GET returned 401 `preauth_required` with the approved Admin origin. Public plan catalog from `https://saturnws.com` returned 200 through `admin-api.saturnws.com`.
- Remaining limitation: authenticated Admin route sweep still requires a real Admin session. An unauthenticated 401 is not treated as proof that the protected UI/data flow is accepted.

## 8. Activate Security Emails

Status: `IN_PROGRESS`

Requirement:

- Review and complete reliable producers for new desktop device linked, session revoked, device revoked, all sessions revoked, account deletion requested/cancelled, account suspended/reactivated.
- Enable `EMAIL_SECURITY_ENABLED=true` only after lifecycle verification.
- Verify committed mutation timing, recipient, idempotency, deduplication, cooldown where needed, no preview send, no sensitive tokens/codes, Arabic/English templates, queue/retry, provider-event tracking, audit, and safe failure.

Evidence:

- Files changed: `workers/policy/wrangler.jsonc`, `workers/policy/package.json`, `workers/policy/scripts/check-phase-g-admin-alerts.mjs`.
- Tests: `workers/policy npm run test:phase-g` passes and now includes admin alert checks for tamper-signature deduplication, email final-failure alerting, final-failure loop prevention, configured recipient path, provider message storage, and required producer source coverage.
- Deployment evidence: Auth Worker `0186ad21-4c7b-4399-8c92-20a876fd5bee`, Admin Worker `85b71833-73d3-445a-a498-d8c1f3b4e9ef`, and Policy Worker `cec58841-cbc9-44e4-853f-054425d29ecc` were deployed with `EMAIL_SECURITY_ENABLED=true` visible in deploy bindings.
- Live verification evidence: `https://auth.saturnws.com/health` and `https://api.saturnws.com/health` returned 200 after deployment. No real account lifecycle mutation was executed for this verification.
- Remaining limitation: live alert delivery should be verified with a safe fixture only; no alert storm or routine-success alert was generated.

## 9. Configure and Activate Admin Alerts

Status: `IN_PROGRESS`

Requirement:

- Configure approved admin alert recipient using Worker secret/config mechanism.
- Complete and verify alert producers for email queue final failure, repeated webhook verification failure, cleanup failure, storage configuration failure, schema mismatch, readiness degradation, and high-severity tamper signal.
- Verify severity, actionability, deduplication, cooldown, loop prevention, destination route, reference ID, audit, no secrets, no routine-success alert, and no alert storm.
- Enable `EMAIL_ADMIN_ALERTS_ENABLED=true`.
- Deploy Policy Worker and verify configuration without generating a false production incident.

Evidence:

- Files changed: `workers/auth/scripts/check-phase-c-device-linking.mjs`, `workers/policy/scripts/check-phase-g-admin-alerts.mjs`, `workers/policy/package.json`, `workers/admin/src/adminCors.test.mjs`, `site/scripts/check-copy-quality.mjs`, `site/scripts/check-phase-f-admin.mjs`.
- Tests: `workers/auth npm run test:phase-c`, `workers/policy npm run test:phase-g`, `workers/admin npm run check:syntax && npm run test:phase-f`, and `site npm run build` pass.
- Deployment evidence: Policy Worker `cec58841-cbc9-44e4-853f-054425d29ecc` was deployed with `EMAIL_ADMIN_ALERTS_ENABLED=true` visible in deploy bindings.
- Live verification evidence: `https://api.saturnws.com/health` returned 200 after deployment, and post-deploy Policy secret inventory confirmed `EMAIL_ADMIN_ALERT_RECIPIENTS` remains configured. No false production incident was generated.
- Remaining limitation: product-wide rendered route/control inventory and authenticated Admin route sweep remain unfinished.

## 10. Email Copy Review Must Use the Same Human Standard

Status: `IN_PROGRESS`

Requirement:

- Review active email templates as product UI: OTP request/resend, ticket created, support reply, support status changed, security emails, account lifecycle emails, and admin alerts.
- Review prepared templates without enabling them: subscription grant, extension, replacement, recovery completion, billing, and release.
- Remove repeated headings, generic greetings when unnecessary, filler, implementation narration, vague reassurance, raw operation names, unavailable CTAs, and repeated state explanations.

Evidence:

- Files changed: no template-copy file was changed in this continuation beyond the producer/alert tests already listed in items 8 and 9.
- Tests: `workers/policy npm run test:phase-g` passes and includes `scripts/check-phase-g-email-content.mjs`, rendering Arabic/English HTML and plain text for active/prepared catalog events.
- Deployment evidence: Policy Worker `cec58841-cbc9-44e4-853f-054425d29ecc` is deployed; billing and release email categories remain disabled.
- Live verification evidence: no live email was sent for this review. Admin alert/security producer flags are live at Worker configuration level, but content acceptance remains pre-manual.
- Remaining limitation: full human editorial review of every active and prepared template is still not complete; this item remains open.

## 11. Real Feature and Control Verification

Status: `IN_PROGRESS`

Requirement:

- Revalidate every operational inventory row using the correct proof level.
- Public: verify rendered page and real live data.
- Authenticated customer: verify authenticated QA/customer session where safe.
- Admin: verify authenticated current super administrator.
- Mutations: use preview, fixture, rollback, or reversible QA action.
- External/destructive: classify honestly.
- For every visible control, safely click/invoke, verify handler, backend response, state update, error behavior, direct refresh, and authorization.
- Remove or reclassify no-op, hidden 500, raw backend error, `forbidden_origin`, shell-only action, fake success, unexplained permanently disabled control, and unused backend route.

Evidence:

- Files changed: Admin CORS/source files and site adapter files listed in item 7.
- Tests: Admin CORS and site contract tests pass for the fixed Releases path and origin-error mapping.
- Deployment evidence: Admin Worker `85b71833-73d3-445a-a498-d8c1f3b4e9ef` is deployed.
- Live verification evidence: safe unauthenticated boundary checks passed for Admin Releases CORS, unknown-origin rejection, public catalog CORS, and protected-download origin separation.
- Remaining limitation: the full authenticated current-super-admin route/control sweep is not complete and cannot be replaced by unauthenticated CORS checks.

## 12. Rendered Visual and Content Evidence

Status: `IN_PROGRESS`

Requirement:

- Capture real rendered evidence after corrections.
- Public evidence: Arabic/English desktop, tablet, and mobile.
- Representative authenticated evidence: Account overview, Subscription, Support, Admin Overview, Admin Users, Admin Releases after origin correction, Admin Communications.
- For each reviewed page record user task, heading, retained copy, removed copy, repetition removed, state/action consistency, line wrapping, empty space, main action, live data success, and remaining manual acceptance item.
- Screenshots must not contain secrets or sensitive user data.

Evidence:

- Files changed: pricing layout/copy files listed in item 5 and verification-page files listed in item 4a.
- Tests: local pricing/source copy checks, `workers/auth npm run test:phase-c`, `site npm run test:phase-b`, and `site npm run build` pass.
- Deployment evidence: GitHub Pages workflow run `28174200979` deployed commit `9da6025189eccfff76509bac6f61d18942489f07`; Auth Worker version `0186ad21-4c7b-4399-8c92-20a876fd5bee` is deployed.
- Live verification evidence: local pricing fixture screenshots exist under `docs/product-readiness-system-completion/visual-evidence/phase-g-20260624-pricing-fixture`. Older public screenshots exist under `docs/product-readiness-system-completion/visual-evidence/phase-g-20260624-live-public`. Current 2026-06-25 live pricing and verification-page screenshots/summaries are recorded under `D:\SaturnWS\build-output\phase-g-live-render`; sensitive email values in summaries are redacted.
- Remaining limitation: authenticated representative page evidence for Account overview, Subscription, Support, Admin Overview, Admin Users, Admin Releases, and Admin Communications is not complete.

## 13. Preserve Completed Safe Boundaries

Status: `IN_PROGRESS`

Requirement:

- Do not integrate a real payment provider.
- Do not send billing or release emails.
- Do not execute a real customer grant or real recovery.
- Do not publish a release.
- Do not enable kill switch or force update.
- Do not perform irreversible account deletion.
- Do not publish QA Setup.
- Keep billing and release categories disabled.
- Do not block on user-run OTP manual delivery acceptance.

Evidence:

- Files changed: no payment, release, kill-switch, forced-update, hard-delete, recovery, real grant, or QA Setup publication files were changed in this continuation.
- Tests: `git diff --check`, Worker tests, and site build passed; billing and release email flags remain disabled in source/deploy configuration.
- Deployment evidence: Policy/Auth/Admin Workers were deployed with billing/release email categories still disabled; no production release or OTA publication occurred.
- Live verification evidence: no payment/refund, real customer grant, recovery, production release, kill switch, forced update, hard deletion, or QA Setup publication was executed.
- Remaining limitation: this boundary remains active until Phase G pre-acceptance work ends.

## 14. Required Tests

Status: `IN_PROGRESS`

Requirement:

- Run relevant existing tests.
- Add/run tests for authenticated Admin origin, Admin preflight, Admin route-family origin, Admin Releases live contract, raw `forbidden_origin` UI prevention, current super-admin role assignment, security email producers and flag-enabled behavior, admin-alert recipient and flag-enabled behavior, alert deduplication/cooldown/loop prevention, pricing information-once, trial/discount duplication prevention, no launch-language, natural subscription terminology, contextual workspace terminology, rendered Arabic/English fixtures, real live bundle copy scan, product-wide no-op inventory validation, and existing Auth/Policy/Admin/Site/Support/Attachment/RBAC/Recovery/Deletion/Pricing/encoding/email/schema suites.

Evidence:

- Files changed: `workers/auth/scripts/check-phase-c-device-linking.mjs`, `workers/policy/scripts/check-phase-g-admin-alerts.mjs`, `workers/admin/src/adminCors.test.mjs`, `site/scripts/check-copy-quality.mjs`, `site/scripts/check-phase-b-production-rollout.mjs`, `site/scripts/check-phase-f-admin.mjs`.
- Tests: `workers/auth npm run check`, `workers/auth npm run test:phase-c`, `workers/policy npm run test:phase-g`, `workers/admin npm run check:syntax`, `workers/admin npm run test:phase-f`, `site node scripts/check-phase-b-production-rollout.mjs`, `site node scripts/check-round3b-production-integration.mjs` with the known missing `workers/admin/migrations/008_payment_core_model.sql` skip, `site npx tsc -p src/new-ui/tsconfig.json --noEmit`, `site npm run build`, and `git diff --check` pass.
- Deployment evidence: tests ran before Worker deployment and GitHub Pages deployment.
- Live verification evidence: live bundle, CORS checks, pricing browser evidence, direct verify browser evidence, and pending-registration Change email browser evidence provide additional deployed evidence for the relevant test families.
- Remaining limitation: authenticated Admin route sweep, current super-admin role-assignment proof, full product-wide no-op inventory validation, and authenticated rendered page evidence remain unfinished. Public route and verification-route rendered evidence is recorded separately in item 12.

## 15. Deployment and Live Verification

Status: `IN_PROGRESS`

Requirement:

- Deploy required Workers after local tests.
- Deploy site.
- Verify health, authenticated Admin routes, Releases, security email flags, admin alert configuration and flag, public Pricing, live bundle, no mojibake, no secrets, unknown origins rejected, approved Admin origin succeeds.
- Do not use unauthenticated 401 alone as protected-route evidence.

Evidence:

- Files changed: `workers/policy/wrangler.jsonc`, `workers/auth/wrangler.toml`, `workers/auth/src/types.ts`, `workers/admin/wrangler.toml`, Admin CORS/source files, pricing/site verification files, and living documentation.
- Tests: local Worker/Site checks listed in item 14 pass.
- Deployment evidence: Policy/Admin Workers deployed on 2026-06-24; Auth Worker version `0186ad21-4c7b-4399-8c92-20a876fd5bee` deployed on 2026-06-25. GitHub Pages workflow run `28174200979` completed successfully for commit `9da6025189eccfff76509bac6f61d18942489f07`.
- Live verification evidence: policy/auth health checks returned 200; Admin Releases approved-origin preflight returned 204; unknown origins remain rejected; public catalog returned 200 from the public origin; live public routes load `assets/index-rasVfIJe.js` and `assets/index-Bk4Fv71E.css`; live pricing/verification screenshots captured in `D:\SaturnWS\build-output\phase-g-live-render` show the current pricing hierarchy and pending-registration verification state.
- Remaining limitation: authenticated Admin routes, rendered visual evidence, safe event-delivery verification, and manual acceptance remain pending.

## 16. Living Documentation

Status: `IN_PROGRESS`

Requirement:

- Update `phase-g-active-execution-checklist.md`, `product-completion-dashboard.md`, `issues-and-phases.md`, `feature-completeness-matrix.md`, `operational-feature-inventory.md`, `acceptance-test-plan.md`, `content-quality-matrix.md`, `email-notification-matrix.md`, and `phase-g-pre-acceptance-completion.md`.
- Correct prior false confidence.
- Record Releases `forbidden_origin`, why previous verification missed it, shared origin fix, authenticated Admin route sweep, pricing reconstruction, product-wide copy findings, security email activation, admin alert activation, current super-admin configuration, and remaining manual/external items.
- Do not keep unsupported `FULLY_OPERATIONAL_ENABLED` classifications.

Evidence:

- Files changed: this checklist, product dashboard, issue tracker, feature/content/email matrices, operational inventory, acceptance plan, Phase G summary, and the redacted email rollout report.
- Tests: documentation changes are covered by `git diff --check` plus the source/build checks in item 14.
- Deployment evidence: site-source updates were deployed through `9da6025189eccfff76509bac6f61d18942489f07`; live-public-visual-evidence documentation and screenshots from 2026-06-24 remain committed, while 2026-06-25 verification/pricing evidence is recorded under build output to avoid committing screenshots that include synthetic registration context.
- Live verification evidence: deployment, live bundle, and CORS evidence is recorded in the relevant entries.
- Remaining limitation: current-super-admin `ADMIN_ROLE_ASSIGNMENTS`, authenticated Admin route sweep, authenticated rendered evidence, and feature/control inventory are not yet closed.

## 17. Completion Standard

Status: `NOT_STARTED`

Requirement:

- Do not begin consolidated manual acceptance.
- Use `PHASE_G_IMPLEMENTATION_COMPLETE_WITH_EXPLICIT_OPERATIONAL_CONFIGURATION_ITEMS` only when all completion criteria are met.
- Otherwise retain `PHASE_G_PRE_ACCEPTANCE_COMPLETION_ACTIVE`.
- Final report must include checklist completion, both AGENTS files, admin role configuration, admin alert configuration, Releases root cause/fix, authenticated Admin route results, pricing rationale, product-wide copy defects/corrections, security email activation, admin alert activation, email copy review, feature/control verification, visual evidence, tests, deployments, remaining manual/external items, and explicit non-actions.

Evidence:

- Files changed: pending.
- Tests: pending.
- Deployment evidence: pending.
- Live verification evidence: pending.
- Remaining limitation: pending.
