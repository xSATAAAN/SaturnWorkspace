# Phase G Consolidated Acceptance Plan

Status: `PHASE_G_IMPLEMENTATION_COMPLETION_PENDING_CONSOLIDATED_MANUAL_ACCEPTANCE`

This is the only manual acceptance gate. Phase B, Phase C, Phase D, and Phase F are closed as `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`. Phase E is complete except for the external payment-provider integration.

## Safety rules

- Use dedicated QA accounts and fixture records.
- Do not execute a real payment or refund.
- Do not grant a real customer subscription.
- Do not publish a real release, change the live stable artifact, enable a live kill switch, or force a production update.
- Do not perform irreversible account deletion.
- Do not build or modify Desktop, Launcher, Updater, Installer, OTA client, or `APP_VERSION` as part of this plan.

## 1. Public and authentication

- Verify direct routes, refresh, sign-in, sign-out, return paths, verified/unverified states, Arabic/English, RTL/LTR, and loading/error behavior.
- Confirm account switching clears user-scoped cache.
- Confirm a user without a subscription can authenticate and link but receives no paid entitlement.
- Test OTP email delivery on a QA account and confirm OTP values do not appear in Admin logs, queue JSON, or UI responses.

## 2. Account and Desktop linking

- Test device login success, wrong code, expired code, replay, wrong device, polling interruption, refresh, revocation, logout, unlink, multiple devices, and account switching using QA devices.
- Confirm connection and entitlement states remain independent.

## 3. Subscription truth and downloads

- Test no subscription, active, trial, grace, expired, suspended, lifetime, history-only, and integrity-conflict fixtures.
- Confirm Customer and Admin projections agree and no plan is inferred from email or row order.
- Verify protected downloads allow only entitled QA users.

## 4. Admin users and account operations

- Verify user list search/filter/pagination and direct-route refresh.
- Inspect identity, subscription, sessions, devices, access requests, support, diagnostics, and audit sections.
- Use fixtures or rollback-only operations to review suspend/reactivate/pending-deletion and session/device revocation previews.
- Confirm unauthorized roles receive 403 and cannot mutate through direct API calls.
- After the additive account-deletion migration is applied, test request/cancel/cooling-off state on a disposable QA account only. Do not test irreversible purge.

## 5. Admin subscriptions

- Verify current/history, lifecycle, plan, source, and integrity filters.
- Review valid and invalid transition previews, stale-preview rejection, duplicate request replay, and lifetime restrictions.
- Review Manual Grant user picker, context-aware defaults, reason model, preview, and double-submit protection without confirming a real customer grant.
- Verify replacement-grant recovery evidence is created on a fixture-only grant path and restore uses a valid fixture ledger record.

## 6. Support, communications, and email

- Verify ticket creation, reply, internal note, status/priority changes, blocking, notifications, inbound/outbound events, retries, and ownership.
- Verify support attachments with allowed files, rejected file types/sizes, customer ownership, admin access, deletion, and orphan cleanup.
- Verify reply-by-email replay protection and provider event idempotency.

## 7. Diagnostics and audit

- Verify deterministic crash groups, affected counts, redaction, occurrence summaries, state changes, and tamper resolution notes using fixtures.
- Verify audit filters, actor/target/action/outcome, request references, bounded pagination, and absence of tokens, authorization headers, raw content dumps, or private file paths.

## 8. Policies, invites, releases, and promotions

- Review policy previews and two-step confirmation without applying a live kill switch or mandatory update.
- Test invite creation on a fixture scope, shown-once behavior, invalid/expired/blocked/already-used, per-user/device restrictions, max uses, revoke, and audit.
- Validate release upload metadata and publish preview with a fixture object only; do not publish a production release.
- Verify promotions are backend-owned and never activate entitlement from frontend state.

## 9. Readiness and settings

- Confirm Worker health, migration status, feature flags, external integrations, role/permission display, and degraded states without secret values.
- Configure and verify `ADMIN_ROLE_ASSIGNMENTS` before multi-role operational use.
- Confirm account deletion shows an honest unavailable state until its Supabase migration is applied.

## 10. Accessibility and visual acceptance

- Keyboard navigation, focus trapping/restoration, labels, contrast, reduced motion, responsive desktop/tablet/mobile behavior, RTL/LTR, light/dark themes, loading/empty/error/success states, and no mojibake.

## Exit evidence

- Record tester, timestamp, QA identity, environment, route, expected/actual result, screenshots without secrets, request IDs, and any rollback performed.
- Any defect must be assigned to its owning domain without reopening completed implementation phases unless the underlying contract is incorrect.
