# Product Completion Dashboard

Date: 2026-06-20

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
| 20 | Customer support portal | `IMPLEMENTED_NOT_VERIFIED` | Visual support shell and loading states stabilized. | `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED` | Phase G. |
| 21 | Customer create ticket | `IMPLEMENTED_NOT_VERIFIED` | No backend change; support IA clarified. | `UNCHANGED_BACKEND_PENDING_E2E` | Phase D/G. |
| 22 | Customer reply to ticket | `IMPLEMENTED_NOT_VERIFIED` | Message role UI standardized. | `UNCHANGED_BACKEND_PENDING_E2E` | Phase D/G. |
| 23 | Ticket status changes | `IMPLEMENTED_NOT_VERIFIED` | Message/thread presentation improved. | `UNCHANGED_BACKEND_PENDING_E2E` | Phase D/G. |
| 24 | Admin support replies | `IMPLEMENTED_NOT_VERIFIED` | Admin support messages use semantic roles and labels. | `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED` | Phase G. |
| 25 | Admin internal notes | `IMPLEMENTED_NOT_VERIFIED` | Internal notes get distinct visual treatment and remain admin-only in UI. | `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED` | Phase G. |
| 26 | Support sender blocking | `IMPLEMENTED_NOT_VERIFIED` | No backend change. UI remains in support drawer. | `UNCHANGED_BACKEND_PENDING_E2E` | Phase D/G. |
| 27 | Support reply by email | `WAITING_EXTERNAL_INTEGRATION` | No change. | `WAITING_EXTERNAL_INTEGRATION` | Phase D/G after provider rollout. |
| 28 | Support attachments | `NOT_IMPLEMENTED` | No change. | `NOT_IMPLEMENTED` | Decision in Phase D/F if required. |
| 29 | Operational email catalog | `IMPLEMENTED_NOT_VERIFIED` | Admin email operations loading skeleton stabilized. | `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED` | Phase G. |
| 40 | Account portal overview | `PARTIALLY_IMPLEMENTED` | Portal overview skeleton matches final page structure. | `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED_FOR_B1_SCOPE` | Phase G. |
| 77 | Notifications in customer portal | `UI_ONLY` | No backend change; content gate avoids treating it as operational log. | `UI_ONLY` | Later support/notifications phase. |
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
| New/no-subscription user appears as `monthly` | Phase E | Critical for final correctness | Subscription truth/projection defect. It does not block Phase C and has no additional dependency gate. Do not investigate or patch it before Phase E. Final acceptance is Phase G. |
| Users and Subscriptions are conflated in Admin IA | Phase F | High | Track for Admin IA; current Phase B continues. |
| Manual Grant form is too operational and requires too many inputs | Phase F | Medium | Track for Admin operational UX; current deployed function remains not operationally accepted. |
| Recovery action appears as a normal grant action | Phase F | Medium | Move to Advanced actions -> Subscription recovery in Phase F. |
| Deferred skeleton vertical rhythm debt | Phase G | Low | Final-release blocker only. |

## Current Roadmap Continuation

Closed phase: `Phase B - Critical Authentication`.

Phase B status: `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.

- OTP/Auth implementation and automated evidence retain their documented status.
- Emergency Subscription Grant remains `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED` and must not be used automatically on real users.
- No additional Phase B workstream or manual test request is required before progression.

Active phase: `Phase C - Account and Desktop Linking`.

Phase C separates account connection from subscription entitlement. A user may link an account without a subscription; paid functionality remains controlled by canonical entitlement and policy checks.

Phase C implementation status: `IMPLEMENTED_AUTOMATED_VERIFICATION_PENDING_SCHEMA_ROLLOUT_AND_PHASE_G_MANUAL_ACCEPTANCE`.

- Auth, Policy, portal session management, and desktop connection state changes pass automated checks.
- `workers/auth/migrations/010_account_session_subscription_independence.sql` is prepared but not applied because no Supabase database credential is available in the current environment.
- Auth Worker deployed version: `2e68b33a-ab02-4b25-bab0-ae5c11ebdafb`; live `/health` returned `200` and invalid account-session access returned the stable `401 AUTH_SESSION_EXPIRED` contract.
- Policy Worker deployed version: `2b3b5f7c-2089-41f0-af4f-38a9de70b0dd`; live `/health` returned `200` and an invalid app session remained denied.
- No manual acceptance is requested here; consolidated acceptance remains in Phase G.
