# Discovered Issues, Severity, Root Cause and Recommended Phase

## Roadmap Update - 2026-06-21

Current execution has moved past Phase B.1 remediation. The following were accepted and must not be reopened unless a regression is found: subscription state consistency, Arabic encoding, support role colors, basic contact/support route separation, cache isolation between accounts, and the basic async loading model.

Latest manual result: `PHASE_B1_ACCEPTED_WITH_NON_BLOCKING_UX_DEBT`. Phase B.1 is not a blocker for Phase B.2. Do not start OTP, Phase C, or desktop work.

The failed B.1 criteria are tracked as one organized remediation batch:

| B.1 item | Root issue | Action in this batch | Next gate |
|---|---|---|---|
| Product copy / UX writing | Some customer/admin strings narrated implementation, repeated page titles, or described obvious state. | Rewrite/remove B.1 copy only; strengthen copy gate; record non-B.1 copy as later backlog. | Manual copy review on auth, portal, support/contact, settings, downloads, and admin B.1 surfaces. |
| Skeleton visual fidelity | Some skeletons used generic subtitles/cards not present in final page layout. | Keep page-specific skeletons and remove skeleton-only subtitle/card placeholders. | Manual visual review after production Pages deployment. |

### Phase B.1 fix batch findings

| Finding | Decision |
|---|---|
| `/account/signin` is owned by the production new-ui auth route, not legacy static HTML. | Fix the active production component only; no backend or Worker change. |
| The rejected Arabic auth eyebrow was hardcoded in `EmailPasswordProductionPage`. | Remove sign-in eyebrow entirely; do not replace it with another trust/security claim. |
| The previous copy gate missed Arabic hardcoded customer-facing strings. | Gate must scan runtime new-ui source plus generated dist and include Arabic/English fixtures. |
| Account skeleton used a separate approximation of the final structure. | Skeletons should reuse shared layout/card primitives and swap content for skeleton values. |

Current B.1 status after manual decision: `ACCEPTED_WITH_NON_BLOCKING_UX_DEBT`.

### Non-blocking UX debt accepted from B.1

| Debt | Type | Severity | Blocking now | Blocking final release | Target phase |
|---|---|---|---|---|---|
| Some skeleton text groups have inconsistent vertical rhythm: title placeholders can sit too close to subtitle or paragraph placeholders in selected cards. | UX debt / design-system consistency | Low | No | Yes | Phase G - visual consistency and regression |

Final acceptance criteria for this debt:

- Skeleton title, subtitle, and paragraph spacing follows the same vertical rhythm as final content.
- No title/subtitle collision or visually unnatural proximity.
- Fix is centralized in shared Skeleton/Typography tokens, not per-page margins.
- Coverage includes Public, Account, and Admin surfaces.
- Coverage includes desktop/mobile and RTL/LTR.
- Visual regression screenshots are captured.

Future observations found while reviewing B.1 should be logged by phase instead of patched immediately:

| Observation class | Backlog phase | Criteria to promote |
|---|---|---|
| Pricing/checkout commercial copy or source-of-truth gaps | Phase E | Requires approved payment/provider contract and plan source. |
| Admin dashboard raw data and broader admin IA | Phase F | Requires admin state model and audit/permission pass. |
| Customer notification backend | Phase D/F | Requires notification contract and support/email decision. |
| Desktop linking, OTA, installer, or app runtime issues | Phase C/G | Requires explicit desktop scope approval. |
| Legal/public marketing copy outside B.1 | Phase E/F | Requires production content review, not B.1 remediation. |

Phase B.2 is allowed to start. OTP, Phase C, and desktop work remain blocked until explicitly accepted later.

| ID | Issue | Severity | Root cause | Recommended phase | Required migration? |
|---|---|---|---|---|---|
| PR-001 | Signed-in users can be routed to auth gate during refresh/hydration. | Critical | `productionAdapters.auth.subscribe` calls callback with `ready: Boolean(firebaseAuth.currentUser)` before `onAuthStateChanged`; initial null user is treated as ready=false/unauth in some route paths. | B | No |
| PR-002 | Desktop account linking requires an active subscription. | Critical | `authorizePendingDeviceLogin` calls `getActiveSubscriptionForUser` and fails with `subscription_required` before creating/authorizing account link. | C | Possibly, if session schema must allow account-linked/no-entitlement sessions |
| PR-003 | No-subscription accounts are shown as expired in desktop. | Critical | `desktop-app/src/backend/security/device_auth.py` maps `subscription_required` and related errors to `state: expired`. | B/C | No |
| PR-004 | Subscription source of truth is split between Supabase and D1. | Critical | Auth/Admin use Supabase `account_subscriptions`; Policy uses D1 `subscriptions`; no ownership rule documented/enforced. | A/B/C/F | Possibly |
| PR-005 | Subscription status vocabulary is incomplete. | High | Auth migration enum lacks `trialing`, `cancel_at_period_end`, `lifetime`, explicit `none`, and status normalization rules. | E | Yes, if adding enum values |
| PR-006 | Admin grant flow can create/update subscriptions but does not model full production lifecycle. | High | Admin `createSubscription` takes plan/tier/expires and metadata `is_unlimited`; no unified state model or provider ownership. | F | Possibly |
| PR-007 | Admin users view is not a real user management surface. | High | Router maps `users` and `subscriptions` to `AdminSubscriptions`; user details API exists but no dedicated page. | F | No |
| PR-008 | Admin dashboard recent activity is raw and mixes unrelated rows. | Medium | `getAdminDashboard` merges crash and update rows directly into `recent_activity`, and UI renders JSON. | F | No |
| PR-009 | Old floating `Policy Controls` panel still exists. | High | Admin Worker serves injected standalone policy admin JavaScript while new Admin Policies page exists. | F | No |
| PR-010 | Pricing uses static frontend plans, not backend plan source. | High | `productionAdapters.listStaticPlans` returns static plans; no canonical plans endpoint verified. | E | Maybe, if plans table/API needed |
| PR-011 | Checkout is only partially production. | High | Payment code creates manual fallback order and feature flags may disable checkout; provider completion not verified. | E | Possibly |
| PR-012 | Customer portal payments and invoices are UI shells. | Medium | `PortalPayments` renders empty state/backend required. | E | Yes if invoices are required |
| PR-013 | Devices page is UI shell, despite backend app session data existing. | Medium | Portal devices page shows backend required; admin user detail reads sessions. | C | No |
| PR-014 | Notifications page is UI shell. | Medium | No customer notification API identified beyond support/email operational jobs. | D/F | Possibly |
| PR-015 | Contact page requires sign-in and does not provide public contact form. | Medium | `PublicContact` displays sign-in alert only. | D | No |
| PR-016 | Support attachments not implemented. | Low | No attachment storage/upload flow found in Policy support routes. | D/F | Yes if required |
| PR-017 | Email operations need full E2E confirmation after auth changes. | High | Policy Worker has queue/webhook/scheduler, but this audit did not execute provider/live tests. | G | No |
| PR-018 | Admin content management is shell only. | Low | Admin router lists content; production implementation not first-class. | F | Maybe |
| PR-019 | Legacy static public pages still exist at web-platform root. | Medium | Root HTML files coexist with new UI app; route/deploy ownership needs cleanup. | E | No |
| PR-020 | Policy release catalog and OTA signed manifest responsibilities overlap. | High | Admin Worker/R2 and Policy Worker both hold release/update concepts. | F/G | No, ownership documentation first |
| PR-021 | Trial and lifetime product logic is not normalized. | High | Lifetime stored as metadata; trial not in Auth subscription enum. | E/F | Yes if status/tables change |
| PR-022 | Auth signup does not clearly provision internal account profile. | High | Frontend creates Firebase user; Auth Worker can verify identity but no profile creation flow found. | B | Possibly |
| PR-023 | Account subscription endpoint returns `subscription_required` for no subscription. | Medium | Auth Worker uses same error vocabulary for no subscription and blocked entitlement. | B/C | No |
| PR-024 | Admin payment management page is shell only. | Medium | `AdminCommerce` returns decision-required empty state. | E/F | Depends on provider |
| PR-025 | Policy admin state is accessible through old and new paths. | Medium | New Admin Policies page plus old injected panel/proxy endpoints. | F | No |
| PR-026 | Product readiness requires tests for desktop auth paths but current phase did not run desktop E2E. | High | Audit-only phase; desktop build/test excluded from implementation. | G | No |

## Phase ordering recommendation

1. Phase B: Fix auth readiness and account status vocabulary at web/auth boundary.
2. Phase C: Decouple desktop link/session from subscription entitlement.
3. Phase D: Stabilize support/contact and confirm email operations after auth is stable.
4. Phase E: Normalize pricing/plans/checkout/download gates.
5. Phase F: Complete admin users/subscription/policy/dashboard surfaces.
6. Phase G: Full regression including desktop installed app, policy, support, email, checkout, OTA, and downloads.
