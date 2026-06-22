# Product Completion Dashboard

Date: 2026-06-22

## Current Production Reconciliation - 2026-06-22

- Phase B remains closed as `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.
- Emergency Subscription Grant remains `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED`.
- Phase C is closed as `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` after Supabase migration `010_account_session_subscription_independence` was applied and verified. Account connection and entitlement remain separate.
- Phase D is implemented and deployed with automated verification; manual workflow acceptance remains consolidated in Phase G.
- Phase E is `COMPLETE_EXCEPT_WAITING_EXTERNAL_INTEGRATION`: subscription truth, normalized schema, backend-owned draft catalog, protected-download authorization, and operational commerce visibility are deployed and automatically verified. Real checkout remains disabled because no payment provider is configured.
- The false `monthly` projection root cause was email-based ownership plus implicit legacy defaults. Firebase UID is now the only current-subscription owner; legacy email-only rows remain diagnostic history and cannot grant entitlement.
- Phase F is active. Users and Subscriptions now have separate backend/UI sources; remaining manual-grant and broader Admin IA work stays in Phase F.
- No B.3/B.4 or additional dependency gate was created.

Current deployed Worker versions:

- Auth: `c0a32f1d-076f-4c76-b490-10403824c283`
- Policy: `3b81a537-e485-4af4-8ff9-576d75b1896f`
- Admin: `c098bc19-8457-4637-b66c-5b689ef4abe6`

Phase D production state:

- D1 migration `0013_support_notifications_phase_d.sql` applied with preflight backup and postflight verification.
- Support lifecycle is normalized to `open`, `awaiting_support`, `awaiting_customer`, `closed`, `reopened`, and `blocked`, while legacy values remain readable.
- Customer ownership uses Firebase UID as the primary key; email is auxiliary for delivery and compatibility only.
- Ticket/message mutations have idempotency keys, read tracking, priority, audit history, and deterministic transitions.
- Portal notifications now have a real D1 source, ownership, unread count, read-all, archive, pagination, linked resources, and portal/email delivery state.
- Reply-by-email verifies webhook signatures, token state/expiry, sender ownership, block state, replay, and automated replies. Attachments remain `NOT_IMPLEMENTED` and are not retained; the UI makes no attachment promise.
- Email queue retries, exponential backoff, final failure, locking, provider events, suppression, recipient flags, inbound retry, and retention cleanup are automated and tested.
- Production email flags remain: outbound/inbound/support `true`; auth/billing/release/security/scheduler/admin-alerts `false`.
- OTP production delivery remains prepared but disabled: `EMAIL_AUTH_ENABLED=false` in Auth and Policy. Required Auth delivery secrets are not all configured, so no activation was attempted.
- Desktop Phase C source is committed, but no new Setup/installed binary was built; installed-app acceptance is deferred to Phase G.

This dashboard supplements `feature-completeness-matrix.md`. It does not replace the full matrix. Rows not listed here keep their current status in the full matrix.

## Manual Acceptance Update - 2026-06-21

Phase B is closed with status `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.

Phase B.1 is no longer the active stop point. Do not add another manual acceptance gate after each workstream. Manual acceptance for all Phase B work is consolidated into Phase G unless a hard stop appears. Do not create Phase B.3 or B.4.

Latest manual result: `PHASE_B1_ACCEPTED_WITH_NON_BLOCKING_UX_DEBT`. The B.1 sign-in copy and core skeleton fidelity fixes were accepted for progression, with one low-severity design-system debt deferred to Phase G.

Execution policy:

- Continue through Phase B, C, D, E, F, and G without B.3/B.4-style gates.
- Use automated tests, type checks, builds, security checks, migration preflight/postflight when relevant, deployment, and automated smoke verification inside each phase.
- Stop early only for a real hard stop: required user secret, destructive/irreversible action, high-risk production migration, real payment/refund, unsafe product decision, or security/privacy/data-integrity blocker.

| B.1 criterion | Manual result | Current implementation response |
|---|---|---|
| Subscription state consistency | Accepted | Kept unchanged. |
| Arabic encoding | Accepted | Kept guarded by `check-no-mojibake`. |
| Support role colors | Accepted | Kept unchanged. |
| Contact/support route separation | Accepted for basic behavior | Kept unchanged; copy was tightened without changing routes. |
| Cache isolation between accounts | Accepted | Kept unchanged. |
| Basic async loading model | Accepted | Kept unchanged; normal loading no longer shows retry in admin guard. |
| Product copy / UX writing | Failed B.1 acceptance | Reworked Phase B.1 customer/admin-facing strings to remove redundant subtitles, implementation-facing copy, and state narration. |
| Skeleton visual fidelity | Failed B.1 acceptance | Adjusted skeleton header/section placeholders to avoid skeleton-only subtitles and keep page-specific structures closer to final layouts. |

## Phase B.1 Fix Batch - 2026-06-21

Status: `ACCEPTED_WITH_NON_BLOCKING_UX_DEBT`.

| Failed criterion | Root cause found | Fix in this batch | Acceptance state |
|---|---|---|---|
| Sign-in copy | Active route `/account/signin` renders `EmailPasswordProductionPage` from `site/src/new-ui/pages/production/ProductionPages.tsx`; the rejected eyebrow was hardcoded there and not covered by the previous gate. | Removed the sign-in eyebrow instead of replacing it with another trust claim. Strengthened copy gate for Arabic and English auth trust claims in source and generated dist. | Deferred to Phase G final acceptance. |
| Copy gate false confidence | The gate checked selected English/internal phrases and missed the Arabic hardcoded auth surface. | Expanded gate coverage across runtime new-ui pages/components/layouts/app/content/i18n and added explicit Arabic/English rejected phrase fixtures. | Deferred to Phase G final acceptance. |
| Skeleton geometry mismatch | Skeleton headers/cards used separate placeholder DOM instead of the final page primitives. | Skeleton headers now use the shared `PageHeader`/`SectionHeader`; subscription/download skeletons now use the same card components as loaded content with skeleton values inside. | Deferred to Phase G final acceptance. |

## Accepted Non-blocking UX Debt - Phase G Target

| Debt | Type | Severity | Blocking now | Blocking final release | Target phase |
|---|---|---|---|---|---|
| Some skeleton title/subtitle/paragraph placeholder groups have inconsistent vertical rhythm in selected cards. | UX debt / design-system consistency | Low | No | Yes | Phase G - visual consistency and regression |

Final release acceptance:

- Skeleton text spacing matches the vertical rhythm of final content.
- No title/subtitle collision or unnatural proximity.
- Shared Skeleton/Typography tokens solve this centrally across Public, Account, and Admin.
- Desktop/mobile and RTL/LTR screenshots are included in visual regression evidence.

## Phase B.1 Current Batch Status - 2026-06-21

| Area | Status | Evidence |
|---|---|---|
| Copy inventory | Completed for B/B.1 surfaces only | Auth, portal overview, subscription, downloads, support, contact, settings, account navigation, admin overview/subscriptions/email operations reviewed. |
| Copy cleanup | Implemented locally | Removed or rewrote implementation-facing copy such as backend/source-of-truth/setup narration from B.1 surfaces. |
| Copy quality gate | Strengthened locally | `site/scripts/check-copy-quality.mjs` now catches redundant state narration and implementation-facing phrases for production UI source and build output. |
| Skeleton fidelity | Implemented locally | `PageHeaderSkeleton` and `SectionHeaderSkeleton` now default to no subtitle placeholder unless explicitly requested; subscription skeleton no longer includes a card absent from the final page. |
| Automated checks | Passed locally | `npm run test:phase-b1`, `npm run test:phase-b`, and `npm run build` pass in `D:\SaturnWS\web-platform\site`. |
| Local visual preview | Blocked by environment | Vite preview renders blank without Firebase env and reports `missing_firebase_env`; production Pages has the required environment. |
| Production deployment | Completed for current B.1/B.2 state | GitHub Pages and Admin Worker deployments completed; further manual checks are deferred to Phase G. |

## Phase B.1 Closure Status

| Matrix # | Feature / flow | Previous status | B.1 implementation status | Product status after B.1 | Deferred acceptance |
|---:|---|---|---|---|---|
| 19 | Public contact page | `PARTIALLY_IMPLEMENTED` | Public contact and authenticated support routing separated. | `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED` | Phase G. |
| 20 | Customer support portal | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Production D1 ownership, lifecycle, idempotency, unread state, and clean errors are deployed. | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Phase G. |
| 21 | Customer create ticket | `IMPLEMENTED_NOT_VERIFIED` | No backend change; support IA clarified. | `UNCHANGED_BACKEND_PENDING_E2E` | Phase D/G. |
| 22 | Customer reply to ticket | `IMPLEMENTED_NOT_VERIFIED` | Message role UI standardized. | `UNCHANGED_BACKEND_PENDING_E2E` | Phase D/G. |
| 23 | Ticket status changes | `IMPLEMENTED_NOT_VERIFIED` | Message/thread presentation improved. | `UNCHANGED_BACKEND_PENDING_E2E` | Phase D/G. |
| 24 | Admin support replies | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Portal/email replies, notes, priority, block state, and audit history are deployed. | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Phase G. |
| 25 | Admin internal notes | `IMPLEMENTED_NOT_VERIFIED` | Internal notes get distinct visual treatment and remain admin-only in UI. | `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED` | Phase G. |
| 26 | Support sender blocking | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Block/unblock is enforced for portal and inbound email with audit. | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Phase G. |
| 27 | Support reply by email | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Signed Resend webhook, expiring reply token, sender ownership, replay protection, and inbound retry are deployed. | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Phase G. |
| 28 | Support attachments | `NOT_IMPLEMENTED` | No change. | `NOT_IMPLEMENTED` | Decision in Phase D/F if required. |
| 29 | Operational email catalog | `IMPLEMENTED_NOT_VERIFIED` | Admin email operations loading skeleton stabilized. | `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED` | Phase G. |
| 40 | Account portal overview | `PARTIALLY_IMPLEMENTED` | Portal overview skeleton matches final page structure. | `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED_FOR_B1_SCOPE` | Phase G. |
| 77 | Notifications in customer portal | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | D1-owned notification list, unread count, read-all, archive, pagination, and linked resources are deployed. | `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE` | Phase G. |
| 78 | Security settings | `PARTIALLY_IMPLEMENTED` | Settings/security skeleton matches final settings pattern. | `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED_FOR_B1_SCOPE` | Phase G. |
| 81 | Admin route cleanup | `IMPLEMENTED_NOT_VERIFIED` | No route change in B.1. | `UNCHANGED_PENDING_VERIFICATION` | Phase F/G. |

## Phase B.1 Done

- Skeleton fidelity pass for portal pages, admin pages, subscription summary, downloads, and support.
- Public contact and authenticated support are separated.
- Support message roles have distinct visual semantics.
- User-facing copy quality gate added to `npm run build` and `npm run test:phase-b1`.
- Existing backend contracts were not changed.

## Still Incomplete After B.1

- Customer support E2E: create ticket, reply, admin reply, status changes, sender block.
- Support attachments.
- Reply by email and inbound email acceptance.
- Real notification backend.

## Phase B.2 - Emergency Subscription Grant

Status: `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED`.

Deployment evidence:

- Git commit: `6602106`.
- Admin Worker version: `06894084-1c56-46de-9e79-d4c0b533845e`.
- GitHub Pages workflow for `6602106` completed successfully.
- Live Admin SPA bundle includes the manual grant UI contracts.
- Unauthenticated access to the manual grant preview endpoint returns `401`.

Operational acceptance is deferred to Phase G. Do not execute grants against real users as part of automated implementation.

## New Roadmap Assignments - 2026-06-21

| Item | Owner phase | Severity now | Current execution effect |
|---|---|---|---|
| New/no-subscription user appears as `monthly` | Phase E/G | Resolved automatically; manual acceptance pending | Canonical resolver returns the exact no-subscription contract and ignores email-only legacy rows for ownership. Production migration `20260622101510` is applied. |
| Users and Subscriptions are conflated in Admin IA | Phase F/G | Implemented automatically; manual acceptance pending | Users now come from `account_profiles`; subscriptions retain current/history projections separately. |
| Manual Grant form is too operational and requires too many inputs | Phase F | Medium | Track for Admin operational UX; current deployed function remains not operationally accepted. |
| Recovery action appears as a normal grant action | Phase F | Medium | Move to Advanced actions -> Subscription recovery in Phase F. |
| Deferred skeleton vertical rhythm debt | Phase G | Low | Final-release blocker only. |

## Current Roadmap Continuation

Closed phase: `Phase B - Critical Authentication`.

Phase B status: `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.

- OTP/Auth implementation and automated evidence retain their documented status.
- Emergency Subscription Grant remains `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED` and must not be used automatically on real users.
- No additional Phase B workstream or manual test request is required before progression.

Active phase: `Phase F - Admin Information Architecture and Operational UX`.

Phase E status: `COMPLETE_EXCEPT_WAITING_EXTERNAL_INTEGRATION`.

- Supabase migration `20260622101510_phase_e_commercial_truth` is applied and postflight verified.
- Auth and Admin use the shared canonical subscription resolver.
- Public pricing consumes the backend catalog; zero plans are public/purchasable until a provider mapping is configured.
- Checkout remains disabled and no subscription can be activated from frontend success.
- Customer downloads use Firebase ownership plus server-side entitlement and an authorized R2 proxy under `customer-downloads/`; OTA routes were not changed.
- Phase F began with distinct Users and Subscriptions sources and structured commerce operations visibility.
- The legacy floating Policy Controls injection is disabled in production; the obsolete script route returns `404` and the structured Policies page remains the only admin policy surface.
- No manual acceptance is requested here; consolidated acceptance remains in Phase G.
