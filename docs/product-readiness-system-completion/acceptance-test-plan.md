# Acceptance Test Plan

This is the required regression plan before declaring product readiness.

## Execution Policy

Manual acceptance is consolidated into `Phase G - Final Product Acceptance`.

Do not request manual acceptance after every workstream or deployment. Earlier phases must rely on automated tests, type checks, builds, security checks, migration preflight/postflight where relevant, deployment, and automated smoke verification.

Stop before Phase G only for a real hard stop:

- User-supplied secret required.
- Destructive or irreversible operation.
- High-risk production migration.
- Real payment/refund.
- Product decision that cannot be inferred safely.
- Security/privacy/data-integrity blocker.

## Phase B.1 Manual Acceptance Checklist

Phase B.1 manual decision: `PHASE_B1_ACCEPTED_WITH_NON_BLOCKING_UX_DEBT`.

Current status: `ACCEPTED_WITH_NON_BLOCKING_UX_DEBT`. Continue Phase B without another manual gate.

### Deferred Phase G Visual Consistency Debt

The following is accepted as non-blocking for Phase B.2 but blocking for final release:

- Skeleton title placeholders can sit too close to subtitle or paragraph placeholders in selected cards.
- Fix must be centralized in shared Skeleton/Typography tokens, not per-page margins.
- Final acceptance requires Public, Account, and Admin coverage; desktop/mobile; RTL/LTR; and visual regression screenshots.

### Product Copy / UX Writing

1. Sign in page does not describe obvious login state and does not repeat the title in the subtitle.
   - `/account/signin` must not show `دخول آمن للحساب`, `تسجيل دخول آمن`, `Secure sign in`, `Secure account access`, or a replacement trust-claim eyebrow.
   - The sign-in card may use only task copy: title, fields, forgot password, submit, Google, and create-account navigation.
2. Sign up page explains only the next useful action and does not describe internal subscription provisioning.
3. Auth loading states do not show retry buttons during normal initialization.
4. Auth errors are understandable and do not expose raw provider/backend codes.
5. Account overview page has no filler subtitle; each visible sentence helps a task, decision, constraint, error, or next action.
6. Subscription page does not show product-decision or backend/source-of-truth wording to the customer.
7. Downloads page does not contain filler text; unavailable/error states explain the usable next step.
8. Public contact page is not an authenticated support form; support routing is clear.
9. Support page copy is concise: ticket creation, ticket list, reply, closed-ticket recovery.
10. Settings page does not repeat the page title or narrate that settings were loaded.
11. Admin overview/subscriptions/email operations avoid raw placeholders in primary headers.
12. No visible customer UI contains: backend required, integration pending, product decision required, source of truth, TODO, lorem ipsum, or mojibake.

### Skeleton Visual Fidelity

1. Account overview skeleton keeps the same shell, grid, card count, column split, and action positions as the loaded page.
   - Header skeleton must use the same `PageHeader` wrapper as the loaded page.
   - No subtitle skeleton should be present when the loaded page has no subtitle.
2. Subscription skeleton keeps the same subscription summary structure as the loaded page and does not include extra cards.
3. Downloads skeleton keeps the same download-card height, icon, content, and button position as the loaded page.
4. Support skeleton keeps the same two-column form/table structure as the loaded page.
5. Settings skeleton keeps the same settings card structure as the loaded page.
6. Admin overview skeleton keeps the same metric strip and activity panel structure as the loaded page.
7. Admin subscriptions skeleton keeps the same toolbar and table columns as the loaded page.
8. Admin email operations skeleton keeps the same metric strip, status panels, form, and table area as the loaded page.
9. Skeletons do not introduce subtitles, cards, columns, or buttons absent from the final page.
10. Manual visual check at desktop width confirms no obvious layout jump after auth/bootstrap loading completes.
11. Phase G final release check: skeleton title/subtitle/paragraph groups match final content vertical rhythm and have no title/subtitle collision.

### Automated Gates For B.1

1. `npm run test:phase-b1`
2. `npm run test:phase-b`
3. `npm run build`
4. Browser/live verification after Pages deploy, because local preview requires production Firebase environment variables.
5. Literal search of live bundle for rejected sign-in phrases.
6. Screenshots for:
   - Sign-in Arabic desktop.
   - Sign-in English desktop.
   - Sign-in Arabic mobile.
   - Account overview skeleton fixture or live controlled loading state if available.

## Phase B: Critical Authentication

Phase B is closed as `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`. OTP/Auth implementation retains its documented state. Do not add B.3/B.4 or request another Phase B manual test; all manual acceptance is deferred to Phase G.

1. Fresh visit to `/account/signin` while signed out.
2. Sign up with email/password.
3. Confirm password mismatch validation.
4. Terms acceptance required.
5. Email verification request creates a verification row.
6. Correct code verifies email.
7. Wrong code returns clean UI error.
8. Refresh `/account` while signed in; must not bounce to login.
9. Sign out clears portal session.
10. Password reset sends provider action or clean provider-disabled state.
11. Google sign-in works and returns to intended page.
12. Admin auth guard does not display admin UI before admin session is ready.

## Phase C: Account & Desktop Linking

Phase C is active and has no dependency gate on the deferred `monthly` projection defect.

Automated implementation evidence is complete locally and the Auth/Policy Workers have passed live smoke checks. The additive Supabase session-independence migration remains a rollout prerequisite; manual workflow acceptance remains deferred to Phase G.

Account connection states: `signed_out`, `link_pending`, `linked`, `session_expired`, `revoked`, `offline`, `error`.

Entitlement states: `unknown`, `no_subscription`, `active`, `trial`, `grace`, `expired`, `suspended`, `lifetime`.

1. Desktop starts login and shows device/user code.
2. New account without subscription signs in through web activation.
3. Desktop becomes linked to account but shows `No active subscription`, not `Expired`.
4. Existing active subscriber links desktop and gets authorized state.
5. Expired subscriber links desktop and gets `Expired subscription`.
6. Subscription renewal changes desktop state from expired/no-subscription to authorized.
7. Session verification and refresh are independent from subscription expiry and retain canonical entitlement projection.
8. Logout revokes local session and returns to login-required state.
9. HWID mismatch returns clean message.
10. Offline/network failure returns offline/unavailable state without corrupting session.
11. Wrong code, expired code, replay, and wrong-device polling are rejected deterministically.
12. Revoking a session or device requires Firebase identity ownership.
13. Account switching replaces local identity state without leaking the previous account cache/session.
14. Multiple devices remain independently visible and revocable; linking one device does not silently revoke unrelated sessions.
15. Logs and responses contain no session token, Firebase token, password, or full secret values.

## Phase D: Support & Contact

1. Signed-in customer creates a ticket.
2. Customer sees ticket list with unread counts.
3. Customer opens ticket and replies.
4. Admin sees same ticket.
5. Admin replies portal-only.
6. Admin replies portal + email if email flag/provider enabled.
7. Customer sees admin reply.
8. Admin internal note is hidden from customer.
9. Admin closes ticket.
10. Customer reopens ticket if allowed.
11. Sender block prevents new messages with clean error.

## Phase E: Subscription, Downloads, Pricing & Checkout

Subscription truth normalization must cover:

1. New account with no subscription shows `No subscription`.
2. No plan, expiry, or active status is shown for no-subscription accounts.
3. History-only users are not projected as currently subscribed.
4. Active users show exactly one correct current subscription.
5. Customer portal and Admin agree.
6. No frontend or backend fallback shows fake `monthly`.
7. Tests cover no rows, history only, active, duplicates, and same email with different UID.

1. Public pricing renders correct visible plans.
2. Pricing data source is documented and not frontend-only before production checkout.
3. Checkout disabled state is clean when provider disabled.
4. Checkout creates order only for real supported plan.
5. Payment success creates/updates canonical subscription.
6. Payment failure does not create active subscription.
7. Portal subscription reflects canonical subscription.
8. No-subscription portal shows purchase/renew path.
9. Download page shows latest available package.
10. Download gating matches product rule.

## Phase F: Admin Completion

1. Admin dashboard loads structured KPIs and structured recent activity.
2. Admin user list is separate from subscription list.
3. Users page lists users, identity, status, created date, last activity, subscription presence, devices/sessions, and user details link.
4. Subscriptions page lists real subscription rows only and does not create fake rows for users without subscriptions.
5. Admin user detail shows identity, subscription, sessions, crashes, support.
6. Manual Grant uses a user picker instead of requiring manual Firebase UID entry.
7. Manual Grant uses reason codes with optional note; `other` requires a note.
8. Manual Grant hides internal operation labels from primary copy.
9. Subscription recovery is moved to Advanced actions -> Subscription recovery.
10. Grant subscription handles weekly/monthly/yearly/lifetime/trialing/cancel states as approved.
11. HWID reset revokes affected sessions when requested.
12. Release upload/publish/rollback works for stable and beta in staging.
13. Targeted OTA fields are visible and validated.
14. Policies page has global policy, disabled versions, plan features, invite codes if supported.
15. Old floating Policy Controls is absent.
16. Audit log records admin actions.

## Phase G: Full Regression

Manual Grant:

1. Search/select user.
2. Grant 5 days.
3. Extend one day.
4. Reject zero/negative.
5. Exact expiry.
6. Lifetime.
7. Audit.
8. No payment/order/invoice.
9. Idempotency.
10. Duplicate subscription warning.

Subscription truth:

1. New account has no subscription.
2. Expired history is not current.
3. Active account appears correctly.
4. Customer/Admin consistency.

Admin IA:

1. Users and Subscriptions are separate.
2. No fake subscription rows.
3. User detail is coherent.
4. Operational copy is natural.

Existing deferred UX:

1. Site-wide skeleton title/body vertical spacing.
2. Visual regression.
3. RTL/LTR.
4. Mobile/desktop.
5. Copy quality final sweep.

1. Web site build.
2. Worker type checks/tests.
3. Admin syntax/build.
4. Auth Worker local/staging endpoint tests.
5. Policy Worker local/staging endpoint tests.
6. Email queue cron lock/retry test.
7. Resend webhook test if enabled.
8. Payment provider sandbox E2E if enabled.
9. Desktop auth smoke test.
10. Desktop installed-app linking smoke test.
11. Crash/reporting smoke test.
12. Support ticket full E2E.
13. Download latest manifest smoke test.
14. No production data deletion.
15. Logs contain no secrets.
