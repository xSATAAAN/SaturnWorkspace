# Phase G Consolidated Acceptance Plan

Status: `PHASE_G_IMPLEMENTATION_COMPLETE_WITH_EXPLICIT_OPERATIONAL_CONFIGURATION_ITEMS`

This is the only manual acceptance gate. It has not started. Phase B, Phase C, Phase D, and Phase F are closed as `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`. Phase E is complete except for the external payment-provider integration.

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

## Exit Evidence

- Record tester, timestamp, QA identity, environment, route, expected/actual result, screenshots without secrets, request IDs, and any rollback performed.
- Any defect must be assigned to its owning domain without reopening completed implementation phases unless the underlying contract is incorrect.
