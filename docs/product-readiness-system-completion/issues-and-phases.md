# Discovered Issues, Severity, Root Cause and Recommended Phase

## Roadmap Update - 2026-06-21

Current execution has moved past Phase B.1 remediation. The following were accepted and must not be reopened unless a regression is found: subscription state consistency, Arabic encoding, support role colors, basic contact/support route separation, cache isolation between accounts, and the basic async loading model.

Latest manual result: `PHASE_B1_ACCEPTED_WITH_NON_BLOCKING_UX_DEBT`. Phase B.1 is not a blocker.

Phase B final automated status: `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`. Phase B is closed. There is no B.3, B.4, or additional dependency gate.

Execution policy update:

- Do not create more manual acceptance gates after each workstream, deployment, or feature.
- Continue through the major phases only: Phase A, Phase B, Phase C, Phase D, Phase E, Phase F, and Phase G.
- Each phase must include the relevant automated tests, type checks, build, security checks, migration preflight/postflight, deployment, and automated smoke verification.
- Consolidate deferred manual checks into Phase G - Final Product Acceptance.
- Stop before Phase G only for a real hard stop: user-supplied secret, destructive/irreversible operation, high-risk production migration, real payment/refund, unsafe product decision, or security/privacy/data-integrity blocker.
- Do not create B.3, B.4, or a new manual gate for every feature.

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

Phase B.2 Emergency Subscription Grant status: `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED`.

- The implementation is deployed and protected, but it must not be treated as `COMPLETE_AND_VERIFIED`.
- Do not use it automatically on real users during ongoing implementation.
- Operational manual checks are deferred to Phase G.
- Its UX and IA issues are recorded under Phase F and do not block the rest of Phase B.

Current roadmap continuation:

1. Phase B is closed after automated verification; retain the documented OTP/Auth state.
2. Execute Phase C account and desktop linking without another manual gate.
3. Continue D, E, and F in order.
4. Perform consolidated manual product acceptance in Phase G.

Phase C implementation note: automated Auth/Policy/portal/desktop checks pass. The additive `010_account_session_subscription_independence.sql` migration is prepared and pending a valid Supabase database credential; this is a deployment prerequisite, not a new manual acceptance gate.

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
| PR-027 | New/no-subscription users can appear as `monthly` in admin projections. Type: subscription truth/projection defect. Blocking Phase C now: No. Final acceptance: Phase G. | Critical for final correctness | Root-cause investigation is intentionally deferred. Phase E must produce `No subscription`, no default plan, no fake expiry/status, separate current/history, unified Customer/Admin projection, Firebase UID identity, and no email/default-row-order current selection. | E | Decision deferred to Phase E |
| PR-028 | Admin users and subscriptions IA are conflated. | High | Production admin routes map `users` and `subscriptions` to the same subscription-centered surface, so users can look like subscription rows. | F | No |
| PR-029 | Manual Grant UI is implemented but too operational for daily admin use. | Medium | The current drawer requires manual Firebase UID entry, exposes internal operation labels, and requires free-text reason for routine actions. | F | No |
| PR-030 | Subscription recovery is exposed as a normal grant operation. | Medium | `restore_remaining_time` is available in the primary grant operation selector, but it should be an advanced recovery action only when recovery context exists. | F | No |

## Phase ordering recommendation

1. Phase B: Closed as `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.
2. Phase C: Active. Decouple desktop link/session from subscription entitlement.
3. Phase D: Stabilize support/contact and confirm email operations after auth is stable.
4. Phase E: Normalize subscription truth, plan lifecycle, pricing/plans/checkout/download gates.
5. Phase F: Complete admin IA and operational UX: users vs subscriptions, manual grant simplification, recovery actions, policy/dashboard surfaces.
6. Phase G: Consolidated manual product acceptance and full regression including desktop installed app, policy, support, email, checkout, OTA, downloads, skeleton rhythm, RTL/LTR, and visual regression.

## Phase E - Subscription Truth and Lifecycle Normalization

Phase E critical item: a new user with no current subscription must never appear as `monthly`. It does not block Phase C and must not be investigated before Phase E.

Rule when no current subscription exists:

- `current_subscription = null`
- `plan = null`
- `status = null`
- `expires_at = null`
- `entitlement = no_subscription`

Forbidden fallbacks:

- `monthly` as a default plan.
- `expired` as a replacement for no subscription.
- An old date from a historical row.
- First row matching an email address.
- Frontend fallback implying a subscription exists.

Scope to review in Phase E:

- Supabase `account_subscriptions`.
- Canonical current-subscription resolver.
- Admin Worker API.
- API adapters.
- Admin Users UI.
- Admin Subscriptions UI.
- Default/fallback plan values.
- Legacy compatibility fields.
- Caches.

Acceptance criteria:

- New account with no subscription shows `No subscription`.
- No plan, expiry, or active status is shown.
- Expired historical subscriptions are not shown as current.
- Active users show exactly the correct active subscription.
- Customer portal and Admin agree.
- No fake fallback plan.
- Tests cover no rows, history only, active, duplicates, and same email with different UID.

## Phase F - Admin Information Architecture and Operational UX

Phase F must split Users from Subscriptions.

Users page:

- Lists users, name, email, status, created date, last activity, subscription presence, devices/sessions, and user details link.
- Must not represent every user as a subscription row.

Subscriptions page:

- Lists real subscription rows only: linked user, plan, status, start, expiry, source, current/history, manual/provider, and integrity warnings.
- Accounts without subscriptions must not appear as fake subscription records.

Manual Grant simplification:

- Admin must select a user by name/email/optional UID search and user picker.
- Firebase UID is used internally and can appear only in details or copy action.
- Normal form shows user, plan, duration, unit, action, prepared reason, preview, and confirm.
- Audit reason remains required, but routine use should use reason codes: admin grant, compensation, trial, technical support, subscription replacement, subscription recovery, and other.
- `other` requires a note; other codes can have an optional note.
- Audit must store `reason_code` and optional `reason_note`.
- UI must use human copy such as: choose user, choose subscription duration, review changes, confirm grant, subscription extended until..., and operation could not be completed.
- Internal labels such as `start_from_now`, `extend_current`, `replace_current`, `restore_remaining_time`, Firebase UID required, source of truth, Supabase write, and operation mode must not appear as primary admin copy.

Recovery mode:

- Move `restore_remaining_time` to Advanced actions -> Subscription recovery.
- Display as "Restore previous subscription time" / "استعادة مدة اشتراك سابقة".
- Show only with suitable recovery ledger or history, sufficient admin permission, and explicit recovery mode.
- Explain only inside the recovery screen: it restores documented time after an error or data loss.

## Phase G - Consolidated Manual Acceptance

Manual acceptance items are consolidated here and must not block earlier phases unless a hard stop appears.

Manual Grant:

- Search/select user.
- Grant 5 days.
- Extend one day.
- Reject zero/negative.
- Exact expiry.
- Lifetime.
- Audit.
- No payment/order/invoice.
- Idempotency.
- Duplicate subscription warning.

Subscription truth:

- New account has no subscription.
- Expired history is not current.
- Active account appears correctly.
- Customer/Admin consistency.

Admin IA:

- Users and Subscriptions are separate.
- No fake subscription rows.
- User detail is coherent.
- Operational copy is natural.

Existing deferred UX:

- Site-wide skeleton title/body vertical spacing.
- Visual regression.
- RTL/LTR.
- Mobile/desktop.
- Copy quality final sweep.
