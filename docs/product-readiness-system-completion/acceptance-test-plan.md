# Acceptance Test Plan

This is the required regression plan before declaring product readiness.

## Phase B.1 Manual Acceptance Checklist

Phase B.1 manual decision: `PHASE_B1_ACCEPTED_WITH_NON_BLOCKING_UX_DEBT`.

Current status: `ACCEPTED_WITH_NON_BLOCKING_UX_DEBT`. Phase B.2 can proceed. OTP, Phase C, and desktop work remain blocked until separate approval.

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

1. Desktop starts login and shows device/user code.
2. New account without subscription signs in through web activation.
3. Desktop becomes linked to account but shows `No active subscription`, not `Expired`.
4. Existing active subscriber links desktop and gets authorized state.
5. Expired subscriber links desktop and gets `Expired subscription`.
6. Subscription renewal changes desktop state from expired/no-subscription to authorized.
7. Session verify renews expiry from canonical subscription.
8. Logout revokes local session and returns to login-required state.
9. HWID mismatch returns clean message.
10. Offline/network failure returns offline/unavailable state without corrupting session.

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
3. Admin user detail shows identity, subscription, sessions, crashes, support.
4. Grant subscription handles weekly/monthly/yearly/lifetime/trialing/cancel states as approved.
5. HWID reset revokes affected sessions when requested.
6. Release upload/publish/rollback works for stable and beta in staging.
7. Targeted OTA fields are visible and validated.
8. Policies page has global policy, disabled versions, plan features, invite codes if supported.
9. Old floating Policy Controls is absent.
10. Audit log records admin actions.

## Phase G: Full Regression

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
