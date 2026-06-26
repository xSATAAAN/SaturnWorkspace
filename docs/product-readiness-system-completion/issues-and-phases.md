# Current Issues and Phase Ownership

Updated: 2026-06-26

## Phase Closure

- Phase B: `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.
- Phase C: `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.
- Phase D: `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.
- Phase E: `COMPLETE_EXCEPT_WAITING_EXTERNAL_INTEGRATION`.
- Phase F: `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.
- Phase G: `PHASE_G_PRE_ACCEPTANCE_COMPLETION_ACTIVE`.
- No B.3/B.4, C.1, F.1/F.2, G.1, or additional dependency gate exists.

## Current Tracked Items

| ID | Item | Type | Current state | Owner |
| --- | --- | --- | --- | --- |
| PR-001 | Real checkout provider and provider plan mappings | External integration | Backend catalog is authoritative; checkout fails closed until configured. | External / Phase E-G |
| PR-002 | OTP production email delivery | Operational rollout | Auth and Policy queue path is implemented and enabled; provider delivery remains pending QA recipient acceptance. | Phase G acceptance |
| PR-003 | Support attachments | Implemented contract | Private R2 storage, authorization, projections, admin proxy, orphan cleanup, and tests are in place. Production manual acceptance remains Phase G. | Phase G acceptance |
| PR-004 | Administrator role assignments | Configuration | Source supports UID-based assignments and least-privilege role matrix; `ADMIN_ROLE_ASSIGNMENTS` is not configured in the Admin Worker secret list. | Operations / Phase G |
| PR-005 | Recovery evidence population | Schema and integration contract | Enriched ledger schema is applied. Replacement-grant evidence is tested without executing a real grant. | Phase G acceptance |
| PR-006 | Safe account deletion requests | Implemented non-destructive workflow | Supabase table is applied; request/cancel/cooling-off state and session revocation contract are implemented. Disposable QA acceptance remains Phase G. | Phase G acceptance |
| PR-007 | Irreversible account deletion | Destructive operation | Not implemented and not approved. Only request/cancel/cooling-off state exists. | Explicit future approval |
| PR-008 | Legal/public content changes | Legal decision | Content remains static and versioned. | Legal approval |
| PR-009 | Frontend main chunk above 500 kB | Performance debt | Build can pass with a Vite warning; code splitting remains a post-acceptance optimization unless it blocks release. | Post-G optimization |
| PR-010 | Desktop QA Setup | Distribution QA | Local QA setup was built at `D:\SaturnWS\build-output\phase-g-qa-installed-channel-20260624-131944\setup\SaturnWorkspace-Setup-1.0.7-beta-phase-g-qa.exe`; SHA256 `527C21D6A87720DB31E0EC4A8F59EA6FF2299C928C1B83447E2AC1E6AAA45DDD`; not published to OTA, GitHub Releases, or R2. Install/uninstall acceptance remains Phase G manual. | Phase G acceptance |
| PR-011 | Arabic mojibake | Content/storage defect | Supabase plan catalog values and desktop startup/OAuth copy repaired; runtime/source/dist/package guards added. | Phase G prevention |
| PR-012 | Automatic billing/release/security/admin-alert emails | Event activation | Billing/release remain disabled without real committed events. Security email producers and admin alert producers have deployed flags and local lifecycle tests passing; safe event-delivery verification is pending. `ADMIN_ROLE_ASSIGNMENTS` remains separate operational configuration. | Phase G |
| PR-013 | Public plan catalog CORS for production pricing | Production verified | Source CORS allowlist includes Saturn public origins, Admin Worker is deployed, and live plan catalog CORS returns the Saturn public origin. | Phase G |
| PR-014 | Public pricing copy and card layout | Production verified | The current pricing IA states the shared full-tool truth once, puts the seven-day trial only inside Monthly and Annual, removes the old redundant strip/banner content, and keeps checkout honestly disabled. GitHub Pages deployed commit `9da6025189eccfff76509bac6f61d18942489f07`, and live bundle `assets/index-rasVfIJe.js` contains the approved prices with no provider-name public copy or mojibake markers. | Phase G |
| PR-015 | Public Contact mobile overflow | Resolved with live evidence | Live public screenshot pass found `/contact?lang=en` mobile had `21px` horizontal overflow caused by the page-specific contact grid overriding the generic mobile grid and email links lacking defensive wrapping. `site/src/new-ui/foundation/public.css` now forces the contact-page grid to one column on mobile and wraps contact email links; recaptured live evidence shows zero horizontal overflow. | Phase G |
| PR-016 | Email/password signup bypassed Saturn OTP boundary | Production deployed pending final QA | Root cause: frontend email signup provisioned profile immediately, Auth Worker account/bootstrap/device paths auto-provisioned unverified password identities, and the frontend email verification flag defaulted off when unset. Current deployed source now requires OTP before any Saturn profile/protected portal/Desktop session for password identities, blocks explicit provision before OTP, finalizes profile on OTP, sets a server-controlled finalized custom claim, requires finalized profile plus claim on protected boundaries, quarantines stale raw provider-only password identities, and does not ship OTP test-code display/storage logic in the production bundle. Local Auth/Site checks and the direct-signup quarantine canary pass; least-privilege finalizer credentials are configured and deployed; production pre-OTP canaries passed; disposable QA inbox finalization acceptance remains pending. | Phase G |
| PR-017 | Verification page pending-registration state and OTP delivery handoff | Production deployed pending QA/manual acceptance | Live evidence showed `/account/verify` was still acting like a generic email form and the OTP delivery handoff failed before Policy D1 queue insert. The page now binds to structured pending-registration context, shows the destination once, has no editable email input, routes direct visits safely, and Change email supersedes the old server request. Auth now enqueues verification email through the `POLICY_SERVICE` binding. | Phase G |
| PR-018 | Identity Platform upgrade for blocking functions | `WAITING_EXTERNAL_BILLING_DEFENSE_IN_DEPTH` | User approved upgrading Firebase project `saturnws-1`, but Google rejected the initialize call with `BILLING_NOT_ENABLED`. The project remains `FIREBASE_AUTH` with no blocking trigger. This is future defense-in-depth after Billing is available and is not a current Phase G blocker for the custom-claim/finalized-profile OTP remediation. | Operations / post-deploy hardening |
| PR-019 | Google sign-in verification loop and OTP resend/email UX | Production deployed pending manual acceptance | Live QA showed an old Google account could sign in, reach account OTP, then loop back to verification with unclear resend throttling and weak OTP email content. Root causes were incomplete customer-profile provisioning/hydration on Google sign-in, stale profile state after account OTP, dropped retry-after metadata, and generic email rendering. Commit `27aeee1` deploys profile provisioning for customer Google sign-in, keeps admin Google sign-in separate, refreshes profile state after OTP, returns/renders cooldown metadata, and replaces the OTP email body with concise branded validity copy. | Phase G |

## Resolved Systemic Defects

| Defect | Resolution |
| --- | --- |
| New user displayed as `monthly` | Canonical resolver returns exact no-subscription state and ignores email-only legacy rows for ownership. |
| Admin Users referenced nonexistent identity field | Admin queries use `firebase_uid`; schema-contract tests prevent regression. |
| Payment-provider absence hid valid plans | Plan visibility, activity, purchase readiness, provider readiness, and checkout enablement are separate states. |
| Users and subscriptions shared one Admin surface | Separate routes and data sources now exist. |
| Generic subscription PATCH | Removed with `410 explicit_subscription_operation_required`; explicit state transitions replace it. |
| Admin actions lacked deterministic preview/idempotency | Operation requests, preview hashes, request IDs, locks, transition validation, and audit are implemented. |
| Invite one-per-user/device race | Atomic D1 claims and conditional consumption prevent concurrent reuse. |
| Account deletion schema pending state | Supabase schema is applied and status path now projects real none/pending/cancelled states instead of a prepared-disabled projection. |
| Arabic plan catalog mojibake | Stored Supabase values repaired; API transport uses UTF-8 and repository guard prevents reintroduction. |
| Email/password pre-OTP profile/session access | Current source blocks unverified/unfinalized password identities from account subscription/identity, explicit provision, Policy customer boundaries, and Desktop device authorization; finalization happens only after Saturn OTP and sets a finalized claim plus finalized profile. Raw provider-only password identities have no Saturn authority and are quarantined when stale. Credentialed live QA acceptance is pending. |
| Verification page generic editable email form | Pending-registration verification is now state-bound. Direct `/account/verify` without valid context no longer creates arbitrary verification requests, and Change email performs a server-side supersede transition before returning to signup. |
| Google sign-in account-verification loop | Customer Google sign-in now provisions/hydrates through the production adapter, account OTP completion refreshes profile state before routing, retry-after metadata is preserved, resend cooldown is visible, and Auth/Policy/email template changes are deployed. Manual re-test of the affected account remains in Phase G acceptance. |

## Phase G Boundary

Phase G owns consolidated manual acceptance. It must not perform real payment, real subscription grant, production release publication, live kill-switch activation, or irreversible deletion unless a separate explicit approval is provided.
