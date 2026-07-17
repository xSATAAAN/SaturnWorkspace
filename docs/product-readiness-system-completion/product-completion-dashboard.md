# Saturn Workspace Product Completion Dashboard

Updated: 2026-07-14

## Current Phase Status

| Phase | Status | Evidence |
| --- | --- | --- |
| B - Critical auth and subscription foundations | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Auth, OTP queue, commercial truth, and rollout checks pass. Manual acceptance is deferred to Phase G. |
| C - Account and Desktop Linking | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Account connection and entitlement remain separate; Auth Worker and cross-layer checks pass. |
| D - Support and notifications | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Support ownership, webhook, retry, idempotency, rate-limit, lock, and private attachment contract tests pass. |
| E - Commercial truth | `COMPLETE_EXCEPT_WAITING_EXTERNAL_INTEGRATION` | Plan catalog and entitlement truth are live; checkout remains disabled until a real payment provider is approved and mapped. |
| F - Admin completion | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Admin schema contracts, RBAC paths, account/subscription operations, diagnostics, and readiness checks pass. |
| G - Pre-acceptance completion | `PHASE_G_PRE_ACCEPTANCE_COMPLETION_ACTIVE` | Scale, resilience, supply-chain, and distributed rate-limit remediation is implemented and locally verified. Consolidated manual acceptance and isolated provider-capacity acceptance have not started. |

## Scale, Resilience, and Security Validation

- Local Policy full profile: `VERIFIED_AUTOMATED`. It exercised 10,000 synthetic identities, 20,000-request baseline/spike workloads, 2,500 support mutations, dependency latency/outage, a 100-request idempotency burst, and a five-minute soak of 560,340 requests. All request scenarios had zero failures; the idempotency invariant produced one durable ticket and heap growth was 3.32 MB. Evidence: `scale-evidence/policy-full-20260712-local-pass.json`, SHA256 `EC3908B537267A070A7E8A89BB42B0EB9773CC272F0F82DE54CB5FE611E2EB1E`.
- Provider-capacity classification: `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED`. The local runner uses a synchronous native SQLite D1 adapter, so Cloudflare/D1 event-loop and provider-capacity SLOs remain `STAGING_REQUIRED`; production was not load tested.
- Auth dependency outage handling: `IMPLEMENTED_NOT_DEPLOYED`. Policy source now returns stable `503 identity_service_unavailable` for Auth 5xx/network failure and no longer exposes internal exception messages. Phase D/Phase G tests and Worker dry-run pass.
- Distributed rate limiting: `IMPLEMENTED_NOT_DEPLOYED`. Auth registration/verification/device/OAuth and Admin payment/download paths now use Cloudflare Rate Limiting bindings and fail closed if a binding is unavailable. Auth/Admin tests and Wrangler dry-runs confirm all six bindings.
- Supabase performance migration `20260712191805 scale_foreign_key_indexes`: `PRODUCTION_DEPLOYED`. Nine covering foreign-key indexes are valid and ready; the performance advisor reports zero remaining unindexed foreign keys. No application rows were modified.
- Supply chain: repository secret gate passes for all 338 tracked files; all five npm package roots report zero known vulnerabilities. Desktop `cryptography` was raised above the affected 48.0.0 release, build tooling now requires fixed pip/setuptools versions, and the permanent strict `pip-audit` readiness step reports no known vulnerabilities.
- Production-safe smoke: public site, Auth health, Policy health, public plan catalog with allowed Origin, missing-Origin denial, and OTA manifest all match their expected live status. This is a contract smoke, not a load test.
- Admin identity and renewal remediation: `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE`. User detail diagnostics now join through subscription UUIDs instead of sending Firebase UID text to UUID columns. Current subscription records are separated from entitlement projection, historical expiry correction fails closed, and migration `20260717135012_fix_admin_identity_and_subscription_transition` plus Admin Worker version `48ae0763-1100-433c-a522-ecfbefee07a7` are live. Rollback-only database verification and the Admin Phase F/Phase G suites pass; authenticated UI acceptance remains pending.
- Desktop session network preflight: `VERIFIED_AUTOMATED_PENDING_REAL_PROXY_MANUAL_ACCEPTANCE`. Brave, AdsPower, and Dolphin launch paths now resolve the direct or actual proxy exit IPv4, fail closed when it cannot be verified, reject an IP already present in the local IP database, reserve it against concurrent launch races, and persist it only after the browser/profile starts successfully.
- OTA version contract: `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE`. The administrator explicitly assigns the release version independently of the uploaded filename. The Admin Worker validates the selected artifact type, binary signature, size, SHA256, channel, and rejects normal publication of a version equal to or older than the active channel. Desktop comparison distinguishes prereleases from final releases. Admin Worker version `1d0fa983-8415-4e9a-9614-8cb809f0a2b5` is deployed from canonical commit `5bfd61782585b14510eb0af85ed166104577ee53`.

## Production Evidence

- Canonical repository: `D:\SaturnWS\github-deploy\SaturnWorkspace`.
- Canonical `main` is the current source of truth. Commit `253a4ae8ebc4d33d955b9fbc68119a38bd8459f3` is deployed to the Auth Worker. It adds the authenticated Gmail read-only capability contract while keeping the feature disabled until Google restricted-scope verification. No public-site source changed in that commit, so the current live public bundle remains the previously verified site deployment.
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
  - Security email producers exist in the current worktree for selected committed session, device, and account-lifecycle events. `EMAIL_SECURITY_ENABLED=true` is deployed on Auth, Admin, and Policy; production-safe event delivery verification remains pending.
  - Admin alert producers exist in the current worktree for final email queue failure, webhook verification failure, cleanup failure, storage configuration failure, schema mismatch, readiness degradation, and high-severity tamper signals. `EMAIL_ADMIN_ALERTS_ENABLED=true` is active on Policy deployment `b79cab4e-bc04-49a0-b1d3-25545f933344` (secret-change version after source deployment `cec58841-cbc9-44e4-853f-054425d29ecc`), `EMAIL_ADMIN_ALERT_RECIPIENTS` is configured as a Policy Worker secret, and safe alert-delivery verification remains pending.
  - Billing and release email categories remain disabled.
  - Auth `GMAIL_READONLY_OAUTH_ENABLED=false` is deployed. `GET /oauth/google-gmail-status` requires an authenticated app session and returns the gated `gmail.readonly` capability state without exposing OAuth credentials. Auth Worker version: `a599057b-5398-4630-a45a-bdf7a1efb497`.
- Secret inventory:
  - Policy Worker has `RESEND_SEND_API_KEY`, `RESEND_RECEIVE_API_KEY`, and `RESEND_WEBHOOK_SECRET`.
  - Auth Worker has `AUTH_EMAIL_ENQUEUE_TOKEN`, `EMAIL_VERIFICATION_PEPPER`, and `FIREBASE_SERVICE_ACCOUNT_JSON`.
  - Admin Worker has UID-based `ADMIN_ROLE_ASSIGNMENTS` configured for the currently authorized administrator; authenticated route sweep remains pending.
  - `ADMIN_EMAIL_ENQUEUE_TOKEN` is configured on Admin and Policy Workers so Admin account lifecycle security emails can use the internal enqueue path after deployment.
- Tests run during Phase G continuation:
  - Repository mojibake scan: passed.
  - Policy `test:phase-g`: passed.
  - Auth `check` and `test:phase-c`: passed.
  - Admin `check:syntax` and `test:phase-g`: passed.
  - Desktop full Python suite: `199 passed, 30 subtests passed`; frontend production build, startup-surface matrix `5/5`, package/source parity, dependency audit, secret scan, and QA Setup build passed.
  - Packaged Desktop UI matrix: `72/72` Arabic/English light/dark/mono page cases passed with no horizontal overflow, low-contrast finding, unlabeled control, duplicate ID, or browser runtime error. Local account/email/IP journeys and safe-control restoration passed.
  - Site Phase B.1, Phase B, Phase C, and Phase F checks: passed.
  - Local visual QA generated pricing-card fixture screenshots. Live public-route visual evidence now covers Arabic/English desktop, tablet, and mobile layouts for `/`, `/pricing`, `/downloads`, `/contact`, and `/account/signin`.

## State and Source-of-Truth Decisions

- Firebase UID is the provider identity key. Saturn account authority additionally requires a server-issued finalized account custom claim and a canonical finalized `account_profiles` row for the same UID. Email is display/search data only.
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
- Billing and release email templates remain disabled. The `1.1.5` publication was not wired to release email delivery, and no communications rollout was activated.
- Security email producers were added in source for new desktop device link, session revoke, device revoke, revoke-all, deletion request/cancel, account suspend, and account reactivate. Local producer tests pass, category flags are deployed, and no production lifecycle mutation was executed for verification.
- Admin alert producer coverage is implemented in source for the required operational families with deterministic idempotency/cooldown. The approved recipient is configured as a Worker secret, category flags are deployed, and no false production incident was generated.
- Public pricing copy and card presentation were rebuilt again after live evidence showed the previous section still had redundant IA. The current hierarchy states the shared full-tool truth once, places the seven-day trial only in monthly/annual cards, removes the large checkout-unavailable banner and repeated strip content, and reduces dead card space. Live bundle `assets/index-rasVfIJe.js` contains the approved weekly/monthly/annual price values and no old pricing strip/banner tokens.
- Email/password registration OTP boundary was tightened again after the prior deployment and deployed to Auth Worker version `9585559e-36b4-4908-b95f-e9d0347c2b00`. The deployed source does not create a Saturn-created Firebase Email/Password identity before Saturn OTP. Signup creates a server-side pending registration, OTP verification returns a one-time finalization token, password is collected only after OTP, and Auth Worker finalization creates or reconciles the Firebase identity, writes one finalized `account_profiles` row, sets the minimal finalized custom claim, records a credential epoch, enables the identity, and requires a fresh sign-in. Raw provider-only Firebase password identities without the Saturn claim/profile have no product authority, cannot access protected account/Policy/Desktop boundaries, and are quarantined/disabled when stale; legitimate OTP finalization can reconcile the same UID. Google-only collisions fail closed. Current checks pass, including fail-closed handling for `FIREBASE_PROJECT_ID`/service-account JSON project mismatch and the direct-signup bypass canary. The least-privilege Firebase finalizer identity and Auth Worker secret/config are configured. Production pre-OTP canaries confirmed pending registration returns `sent`, does not expose `test_code`, and does not create a Firebase user before OTP. Full credentialed OTP finalization and provider-regression acceptance remain pending in Phase G.
- Email verification page state was corrected as a pending-registration workflow: the destination email is shown once as non-editable information, `/account/verify` without context no longer renders a generic editable email form, and Change email calls the server cancellation endpoint, supersedes the old OTP, preserves non-sensitive signup fields, and returns to signup.
- Google sign-in and account email verification were corrected after live QA showed an old Google account could enter an OTP loop with unclear resend throttling. Customer Google sign-in now provisions/hydrates the account profile through the production adapter, admin Google sign-in avoids customer provisioning, account verification finalization refreshes server-side profile state before routing, resend cooldown/retry metadata is preserved from API errors and rendered in the verification UI, and Auth Worker rate-limit responses include `Retry-After` plus `retry_after_seconds`. Auth Worker version `7f833195-8056-4a57-bf0b-35a735fd885f`, Policy Worker version `bdc2ce17-7131-445a-ba13-7ce21d4f17d7`, and live bundle `assets/index-BJRDMlYx.js` are deployed. Automated checks passed; manual retry of the affected Google account remains Phase G acceptance.
- Auth OTP email rendering was rebuilt as product UI: the email uses a concise subject, branded icon, one verification code block, relative validity text, and no raw absolute expiry timestamp or repeated product-name filler. The Policy email content gate passes for Arabic/English HTML and plain text.
- Auth OTP delivery latency was corrected after live QA showed repeated resends could supersede queued verification jobs before the five-minute email scheduler sent them. Policy Worker version `fa47730d-a037-4af8-981c-84f7672268a1` now processes newly queued auth verification jobs immediately in the enqueue request, keeps the D1 queue/cron as fallback, and uses `Saturn Workspace <no-reply@mail.saturnws.com>` for auth verification messages.
- Earlier live public rendered evidence for commit `3e090fb198429cf26d5f3866f9adc41c1651dfdf` found and fixed a Contact mobile overflow defect. Recaptured screenshots under `docs/product-readiness-system-completion/visual-evidence/phase-g-20260624-live-public` show 30/30 public route/locale/viewport captures returning 200 with correct RTL/LTR direction and zero horizontal overflow.
- Public plan catalog CORS source was repaired to allow Saturn public origins as well as Admin origins. Post-deploy verification confirmed `https://admin-api.saturnws.com/api/plans/catalog` returns 200 with `Access-Control-Allow-Origin: https://saturnws.com` for the public origin.
- Legacy root static website artifacts were removed from source. GitHub Pages continues to publish `site/dist`, and the cutover guard blocks known legacy public bundle tokens from returning. Live HTML references `assets/index-rasVfIJe.js` and `assets/index-Bk4Fv71E.css` from workflow run `28174200979`.
- Desktop blocked/pre-entry states now provide a read-only local data explorer and bounded export path without weakening account connection or entitlement gates. The export control recovers after native errors and the packaged startup matrix proves one continuous loading segment before the React application.
- SaturnWS extension management now uses a native folder chooser, validates the selected unpacked extension, maintains a versioned packaged ZIP, and replaces stale copies deterministically. The removed Trust Wallet integration was not restored.
- Desktop What's New is release-note driven and does not invent content. Gmail read-only inbox, local read/unread/archive/pin/mute state, Windows toast activation, and deep-open behavior are implemented behind the disabled Auth capability. Toast activation URIs contain opaque one-time tokens only; message IDs and email content remain in protected local activation records.
- Browser launch IP ownership now has one shared Desktop contract. AdsPower and Dolphin inspect the selected profile's effective proxy configuration, Brave uses the current public IPv4, all three paths block known IPs before launch, and no clean IP is written to the database until launch succeeds. Stable Arabic/English errors reach the existing single toast path without exposing proxy credentials or resolved IP values in audit logs.
- AdsPower launch compatibility now uses the provider readiness endpoint, validates provider response codes, resolves legacy profile numbers to canonical profile IDs, keeps startup URLs out of `launch_args`, and falls back from unsupported V2 operations to V1. Real QA created, started, checked, stopped, and deleted temporary AdsPower profiles through both canonical and legacy identifiers without changing user vault or IP data.
- Desktop diagnostics no longer report expected prevention/validation outcomes (`cancelled`, `session_ip_already_used`, `startup_preload_missing`, and `invalid_email_requires_at`) as crashes. Recoverable Drive/update/network events are operational warnings, while unknown provider and startup failures remain actionable errors. Admin dashboard, user details, groups, and diagnostics tabs use the same classification.
- Optional OTA visibility uses semantic prerelease comparison. Production beta now publishes `1.1.5` as optional at 100% rollout; an isolated `1.1.4` probe resolves it as available with `mandatory=false`, while `1.1.5` resolves as current and the three public manifest endpoints expose the same signed channel projection. Admin displays the selected channel instead of the legacy stable root and keeps the entered release version when the artifact filename differs.

## Operational Configuration Required

| Item | State | Required action |
| --- | --- | --- |
| `ADMIN_ROLE_ASSIGNMENTS` | `DEPLOYED_PENDING_SAFE_EVENT_VERIFICATION` | UID-based `super_admin` assignment is configured as an Admin Worker secret for the currently authorized administrator. The UID was resolved from Firebase and was not printed or documented. Authenticated route sweep remains pending. |
| Email/password OTP-first finalization | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Dedicated Firebase Auth finalizer role/service account exists with only `firebaseauth.users.create`, `firebaseauth.users.get`, and `firebaseauth.users.update`; Auth Worker `FIREBASE_SERVICE_ACCOUNT_JSON` and matching `FIREBASE_PROJECT_ID=saturnws-1` are configured and deployed. Production pre-OTP canaries passed. Full disposable QA inbox/finalization, direct-signup quarantine, Google regression, and existing-password regression remain pending without exposing password, OTP, UID, token, or cookies. |
| Firebase Identity Platform blocking functions | `WAITING_EXTERNAL_BILLING_DEFENSE_IN_DEPTH` | Approved upgrade attempt on 2026-06-26 was rejected by Google with `BILLING_NOT_ENABLED`. The project remains `FIREBASE_AUTH`, no blocking trigger is configured, and authorized domains remain present. This is no longer a prerequisite for the current Phase G OTP-first remediation; it remains future defense-in-depth after Billing is available. |
| Firebase public client signup bypass | `MITIGATED_BY_SATURN_DUAL_TRUST_PENDING_DEPLOYMENT` | Saturn source no longer calls client signup. A raw provider-only Firebase password identity may still exist outside Saturn, but it receives no server-issued finalized claim, has no canonical finalized profile, cannot access protected Saturn boundaries, and is quarantined/disabled when stale. Identity Platform selective blocking remains future defense-in-depth, not the current Phase G gate. |
| Email/password OTP remediation credentialed QA | `PENDING_MANUAL_ACCEPTANCE` | Previous live health, route, bundle, CORS, stable unauthenticated error contracts, pending-registration UI, and server enqueue path passed for the earlier deployed model. The current OTP-first source requires the Firebase Admin configuration above before live completion can be tested. |
| Real payment provider | `WAITING_EXTERNAL` | Approve provider, plan mappings, webhook contract, and rollout before checkout or billing emails are enabled. |
| QA email delivery acceptance | `PENDING_MANUAL_ACCEPTANCE` | Use a dedicated QA recipient in Phase G to confirm provider delivery without exposing OTP values. |
| QA Desktop Setup artifact | `QA_ARTIFACT_BUILT_PENDING_MANUAL_ACCEPTANCE` | Local artifact: `D:\SaturnWS\desktop-app\qa-builds\1.1.5-20260714-adspower-diagnostics\setup\SaturnWorkspace-Setup-1.1.5.exe`; size `41,492,180` bytes; SHA256 `F38123D5EE58AE1272FC018A215481915F8F4D8FE4E50F04230CBAFF2681A79A`. Source/package payload hashes match and the isolated packaged runtime remained healthy for the full 15-second observation window. |
| Desktop source reproducibility | `RECORDED_PENDING_MANUAL_ACCEPTANCE` | `D:\SaturnWS\desktop-app` is not a Git repository. Current source/package parity covers `105/105` runtime payload files; the current source snapshot covers `424` files with aggregate SHA256 `32E8BE683ABBBE7E191E63C21B5B938FA144DB6DC6A260925FCCAAC9380E0E4D`. |
| Published Desktop OTA artifact | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | `D:\SaturnWS\desktop-app\qa-builds\1.1.5-20260714-adspower-diagnostics\updates\SaturnWorkspace-app-1.1.5.zip`; size `44,957,459` bytes; SHA256 `5E13ABA8F8401D1EF294C7B3E4ED4C57659BB42ADF491EE1876ADDC374B879A6`. Internal version/build ID are `1.1.5` / `2026-07-14-adspower-diagnostics`; beta publication is optional, non-mandatory, and has no minimum-version constraint. |
| Gmail read-only Desktop integration | `WAITING_EXTERNAL` | Product code, capability endpoint, local state, safe Windows toast activation, tests, and disabled-state UI are implemented. Production activation requires Google verification for the restricted `gmail.readonly` scope and an explicit later rollout; Auth flag remains false. |
| Public plan CORS live verification | `PRODUCTION_VERIFIED_AUTOMATED` | Admin Worker was redeployed and `https://admin-api.saturnws.com/api/plans/catalog` returns `Access-Control-Allow-Origin: https://saturnws.com` for the public origin. |
| Public pricing Pages deployment | `PRODUCTION_VERIFIED_AUTOMATED` | GitHub Pages run `28174200979` deployed commit `9da6025189eccfff76509bac6f61d18942489f07`. Live bundle `assets/index-rasVfIJe.js` contains the approved weekly/monthly/annual prices and omits the old redundant pricing IA. |
| Email verification pending-registration state | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Auth Worker `0186ad21-4c7b-4399-8c92-20a876fd5bee` and Pages run `28174200979` are deployed. Browser evidence under `D:\SaturnWS\build-output\phase-g-live-render` records direct-route safe handling, one destination email occurrence, no editable email field, and Change email return to signup. |
| Google sign-in verification loop and OTP resend/email UX | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Customer Google sign-in profile provisioning, post-OTP profile refresh, resend cooldown display, retry-after propagation, stable rate-limit contract, and OTP email template were deployed in commit `27aeee1`. Auth Worker `7f833195-8056-4a57-bf0b-35a735fd885f`, Policy Worker `bdc2ce17-7131-445a-ba13-7ce21d4f17d7`, and live bundle `assets/index-BJRDMlYx.js` are verified. |
| Auth OTP immediate delivery | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Auth verification enqueue now attempts immediate send before returning to Auth, while retaining queued retry/fallback behavior. Deployed Policy Worker `fa47730d-a037-4af8-981c-84f7672268a1`; TypeScript, Phase D, Phase G, dry-run deploy, and health checks pass. |

## Explicit Non-Actions

- No real subscription grant was executed.
- No real recovery operation was executed.
- No payment, refund, invoice, or receipt event was created.
- Production beta `1.1.5` is published as an optional update at 100% rollout. The full public download matches the local ZIP SHA256, and no forced-update or minimum-version policy was enabled.
- No live kill switch or forced-update policy was enabled.
- No irreversible account deletion or purge endpoint was implemented.

Current state: `PHASE_G_PRE_ACCEPTANCE_COMPLETION_ACTIVE`.
