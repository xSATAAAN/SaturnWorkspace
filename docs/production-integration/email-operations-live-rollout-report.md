# Email Operations Live Rollout Report

Date: 2026-06-20

## Scope

Production email operations rollout for `saturnws-policy` using the existing Cloudflare Workers/D1/R2 architecture.

`D:\SaturnWS\desktop-app` was not touched.

## Current Feature Flags

- `EMAIL_OUTBOUND_ENABLED=true`
- `EMAIL_INBOUND_ENABLED=true`
- `EMAIL_SUPPORT_ENABLED=true`
- `EMAIL_SCHEDULER_ENABLED=false`
- `EMAIL_AUTH_ENABLED=false`
- `EMAIL_BILLING_ENABLED=false`
- `EMAIL_SECURITY_ENABLED=false`
- `EMAIL_RELEASE_ENABLED=false`
- `EMAIL_ADMIN_ALERTS_ENABLED=false`

## Worker Deployment

- Latest deployed Worker version after enabling inbound:
  `c0272004-e817-4223-ac8a-33fd1f305d76`
- `https://api.saturnws.com/health`: HTTP 200
- Cron schedule remains registered:
  `*/5 * * * *`

## Outbound Test Email Verification

The admin Test Email sent from:

`https://admin.saturnws.com/admin/communications`

was verified in D1.

### `email_jobs`

- Job id: `8cd71df7-273a-4580-8715-f1a61081089f`
- Type: `admin.email_test`
- Recipient: `mashroh.499@gmail.com`
- Final status: `delivered`
- Attempts: `1 / 5`
- Provider message id stored:
  `82805f93-1794-4b0e-8d25-f1daebabb6ab`
- `sent_at`: `2026-06-20 10:22:13`
- `delivered_at`: `2026-06-20 10:22:16`

### State Transitions

The final D1 row shows successful movement through the outbox lifecycle to `delivered`.

Current schema stores the current status and timestamps, not a per-status transition history table. Evidence available:

- Job was created and processed.
- `sent_at` was set.
- Resend `email.sent` event was recorded.
- `delivered_at` was set.
- Resend `email.delivered` event was recorded.

## Resend Webhook Events

Events recorded in `email_events` for the provider message id:

- `email.sent`
- `email.delivered`

Both events are linked back to the D1 email job.

## Duplicate Checks

Last 24 hours:

- Duplicate jobs by idempotency key: none found.
- Duplicate events by `provider_event_id`: none found.
- Duplicate events by `(provider_message_id, event_type)`: none found.

## Queue, Retry, and Locking

### Atomic Claim Test

A safe dummy queued job was inserted with a future `next_attempt_at`.

- First claim: `changes = 1`
- Second claim on the same job: `changes = 0`

This confirms atomic claim behavior prevents double-processing the same job.

The dummy job was removed after the test.

### Retry / Final Failure Test

A safe invalid-recipient test job was inserted with `max_attempts = 2`.

Observed through production Cron:

- First attempt: job stayed `queued`, `attempt_count = 1`, `next_attempt_at` was advanced with backoff.
- Second attempt: job moved to `failed`, `attempt_count = 2`.
- No provider events were created, as expected, because the email was rejected before provider send.
- The test job was removed after verification.

### Cron Lock

`email_cron_locks` updated during each Cron run and released after processing. No stuck lock was found.

## Inbound Status

Inbound has been enabled in production:

`EMAIL_INBOUND_ENABLED=true`

The public customer support endpoint correctly rejects unauthenticated ticket creation:

- Endpoint: `POST https://api.saturnws.com/v1/web/support/messages`
- Result without `id_token`: `401 missing_id_token`

## Support Ticket Test Status

Blocked from terminal-only automation because creating a real web support ticket requires a Firebase web `id_token` from an authenticated customer browser session.

No local bypass, D1-only ticket creation, or staging token was used.

Next manual step required:

1. Sign in on `https://saturnws.com/account/support`.
2. Create a test support ticket from the customer portal.
3. Reply from Admin with "Portal + email".
4. After the admin reply email reaches Gmail, stop and reply manually from Gmail to the unique `reply+...@mail.saturnws.com` address.

After that, D1 should be verified for:

- New `support_threads` row.
- New `support_messages` rows for user/admin/inbound user reply.
- `support_reply_tokens` token activity.
- `email_jobs` rows for `support.ticket_created` and `support.admin_replied`.
- Resend webhook events for sent/delivered.
- `inbound_email_messages` row for the Gmail reply.

## UX Note

The repeated Admin route issue is tracked separately:

`docs/production-integration/admin-communications-route-ux-note.md`

Route cleanup is deferred until the email operations live test is complete.
