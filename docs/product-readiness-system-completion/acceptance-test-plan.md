# Phase G Consolidated Acceptance Plan

Status: `PHASE_G_PRE_ACCEPTANCE_COMPLETION_ACTIVE`

This is the only manual acceptance gate. It has not started. Phase B, Phase C, Phase D, and Phase F are closed as `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`. Phase E is complete except for the external payment-provider integration.

Operational precondition: the Auth Worker finalizer configuration (`FIREBASE_SERVICE_ACCOUNT_JSON` and matching `FIREBASE_PROJECT_ID`) is set and deployed. The live OTP-first email/password acceptance flow has passed pre-OTP canaries and still requires disposable QA finalization/provider-regression canaries. Firebase Identity Platform blocking functions are future defense-in-depth under `WAITING_EXTERNAL_BILLING_DEFENSE_IN_DEPTH`; they are not a current Phase G manual-acceptance prerequisite.

## Safety Rules

- Use dedicated QA accounts and fixture records.
- Do not execute a real payment or refund.
- Do not grant a real customer subscription.
- Do not publish a real release, change the live stable artifact, enable a live kill switch, or force a production update.
- Do not perform irreversible account deletion.
- Account deletion acceptance may only use a disposable QA account and request/cancel/cooling-off flow.
- Desktop QA Setup may be built and smoked locally, but must not be published through OTA, GitHub Releases, or production R2.

## 1. Public and Authentication

- Verify direct routes, refresh, sign-in, sign-out, return paths, verified/unverified states, Arabic/English, RTL/LTR, and loading/error behavior.
- Verify new email/password signup does not create a Saturn-created Firebase Email/Password identity, enter the account portal, create an active Saturn profile, or issue a Desktop session before OTP.
- Verify that after OTP the password step appears, finalization creates or reconciles the Firebase identity, creates one finalized `account_profiles` row, sets the finalized Saturn custom claim, requires fresh sign-in, and the submitted display name persists after refresh, logout, and login.
- Verify a raw provider-only Firebase password identity created outside Saturn has no finalized claim/profile and cannot access account, support, downloads, notifications, or Desktop linking; after legitimate Saturn OTP finalization for the same email, stale pre-finalization tokens remain rejected and a fresh token is accepted.
- Verify the email verification page belongs to the pending registration: the destination email appears once, is not editable, OTP inputs render before the password step, direct `/account/verify` without context does not create a generic verification form, and Change email supersedes the old request before returning to signup.
- Verify a legacy email/password identity created by the previous implementation but missing Saturn OTP is gated on next protected access and reconciles to the same UID after OTP without duplicate profile.
- Verify an existing Google account that predates OTP can sign in, complete the required account verification once, and land on the correct account area without returning to another verification loop. Resend must show a visible cooldown or retry time when throttled, invalid/expired/reused codes must show stable user-safe errors, and the received OTP email must use the current concise branded template with relative validity text rather than a raw absolute expiry timestamp.
- Confirm account switching clears user-scoped cache.
- Confirm a user without a subscription can authenticate and link but receives no paid entitlement.
- Test OTP email delivery on a QA account and confirm OTP values do not appear in Admin logs, queue JSON, or UI responses.

## 2. Account and Desktop Linking

- Test device login success, wrong code, expired code, replay, wrong device, polling interruption, refresh, revocation, logout, unlink, multiple devices, and account switching using QA devices.
- Confirm connection and entitlement states remain independent.

## 3. Subscription Truth and Downloads

- Test no subscription, active, trial, grace, expired, suspended, lifetime, history-only, and integrity-conflict fixtures.
- Confirm Customer and Admin projections agree and no plan is inferred from email or row order.
- Verify protected downloads allow only entitled QA users.
- Verify public pricing displays the approved weekly, monthly, and annual discount/trial presentation in Arabic and English, while checkout remains honestly disabled until the provider is configured. Monthly and Annual must show the seven-day trial in-card; Weekly must not. The shared full-tool statement must appear once, and the old shared strip/large unavailable banner must not return.
- Verify live public plan catalog CORS from `https://saturnws.com` after Admin Worker deployment.
- Public rendered-route evidence for `/`, `/pricing`, `/downloads`, `/contact`, and `/account/signin` is recorded for Arabic/English desktop, tablet, and mobile under `docs/product-readiness-system-completion/visual-evidence/phase-g-20260624-live-public`; manual acceptance still needs human review of the screenshots and authenticated account/Admin surfaces.

## 4. Admin Users and Account Operations

- Verify user list search/filter/pagination and direct-route refresh.
- Inspect identity, subscription, sessions, devices, access requests, support, diagnostics, and audit sections.
- Verify suspend/reactivate/pending-deletion and session/device revocation previews with fixtures or rollback-only operations.
- Configure `ADMIN_ROLE_ASSIGNMENTS` before multi-role acceptance; then confirm unauthorized roles receive 403 through direct API calls.
- Test request/cancel/cooling-off on a disposable QA account. Do not test irreversible purge.

## 5. Admin Subscriptions

- Verify current/history, lifecycle, plan, source, and integrity filters.
- Review valid and invalid transition previews, stale-preview rejection, duplicate request replay, and lifetime restrictions.
- Review Manual Grant user picker, context-aware defaults, reason model, preview, and double-submit protection without confirming a real customer grant.
- Verify replacement-grant recovery evidence through a fixture-only path and restore uses a valid fixture ledger record.

## 6. Support, Communications, and Email

- Verify ticket creation, reply, internal note, status/priority changes, blocking, notifications, inbound/outbound events, retries, and ownership.
- Verify support attachments with allowed files, rejected file types/sizes, customer ownership, admin access, deletion, and orphan cleanup.
- Verify reply-by-email replay protection and provider event idempotency.
- Confirm billing and release emails remain disabled until real committed provider/release events exist.
- Confirm security email producers enqueue only for committed events, with deterministic idempotency and no session tokens or device codes in payloads.
- Confirm admin alert delivery uses the configured recipient, dedupes repeated incidents, and does not recursively alert on its own final failure.

## 7. Diagnostics and Audit

- Verify deterministic crash groups, affected counts, redaction, occurrence summaries, state changes, and tamper resolution notes using fixtures.
- Verify audit filters, actor/target/action/outcome, request references, bounded pagination, and absence of tokens, authorization headers, raw content dumps, or private file paths.

## 8. Policies, Invites, Releases, and Promotions

- Review policy previews and two-step confirmation without applying a live kill switch or mandatory update.
- Test invite creation on a fixture scope, shown-once behavior, invalid/expired/blocked/already-used, per-user/device restrictions, max uses, revoke, and audit.
- Validate release upload metadata and publish preview with a fixture object only; do not publish a production release.
- Verify promotions are backend-owned and never activate entitlement from frontend state.

## 9. Encoding, Copy, and Content

- Confirm public, account, admin, Worker JSON, email HTML/plain text, and built bundle contain no mojibake.
- Confirm Arabic email uses RTL structure and English email uses LTR structure.
- Confirm status/title/description/CTA do not contradict each other in normal, loading, empty, unavailable, disabled, error, and success states.

## 10. Accessibility and Visual Acceptance

- Keyboard navigation, focus trapping/restoration, labels, contrast, reduced motion, responsive desktop/tablet/mobile behavior, RTL/LTR, light/dark themes, loading/empty/error/success states.

## 11. Scale, Resilience, and Supply Chain

- Run the quick and full Policy profiles from `tools/scale` and retain JSON evidence. Confirm zero unexpected statuses, bounded memory growth, one durable idempotent ticket, and stable Auth-outage `503` behavior.
- Provision isolated Cloudflare staging Workers and a Supabase development branch before provider-capacity testing. Never point the load runner at production.
- Verify Cloudflare Rate Limiting bindings for Auth and Admin in staging, including allowed traffic, `429` exhaustion, and fail-closed behavior when a binding is unavailable.
- Run npm audit for Site/Auth/Admin/Policy/scale tools, the tracked-file repository security gate, and Desktop strict pip-audit before producing a QA Setup.
- Confirm all nine Supabase foreign-key indexes remain valid/ready and the performance advisor has no unindexed-foreign-key finding.

## Exit Evidence

- Record tester, timestamp, QA identity, environment, route, expected/actual result, screenshots without secrets, request IDs, and any rollback performed.
- Any defect must be assigned to its owning domain without reopening completed implementation phases unless the underlying contract is incorrect.
