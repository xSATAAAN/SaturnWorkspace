# SaturnWS Operational Email

Updated transactional email catalog/scheduler details are documented in:

```text
docs/production-integration/transactional-email-platform.md
```

## Scope

This document covers the operational email layer for Saturn Workspace support:

- Outbound support emails through Resend.
- Delivery/bounce/complaint tracking through signed Resend webhooks.
- Reply-by-email support ingestion for support tickets.
- Admin visibility for outbound jobs, inbound messages, and retry/test actions.

The implementation is feature-flagged. Existing support tickets, website APIs, auth, policy checks, and admin actions continue to work if email is disabled.

## Cloudflare Secrets and Vars

Do not place secret values in source, `wrangler.jsonc`, frontend bundles, or docs.

Required Cloudflare Worker secrets:

- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`

Non-secret Worker vars:

- `EMAIL_OUTBOUND_ENABLED=false` by default.
- `EMAIL_INBOUND_ENABLED=false` until Resend Receiving is verified.
- `EMAIL_FROM_SUPPORT=SaturnWS Support <support@mail.saturnws.com>`
- `EMAIL_REPLY_DOMAIN=mail.saturnws.com`
- `APP_PUBLIC_URL=https://saturnws.com`

Example setup commands, without values:

```bash
wrangler secret put RESEND_API_KEY
wrangler secret put RESEND_WEBHOOK_SECRET
```

## Resend Webhook

Webhook URL:

```text
https://api.saturnws.com/api/webhooks/resend
```

Subscribe to:

- `email.sent`
- `email.delivered`
- `email.delivery_delayed`
- `email.bounced`
- `email.complained`
- `email.failed`
- `email.received`

The worker verifies Svix/Resend headers before accepting any webhook payload:

- `svix-id`
- `svix-timestamp`
- `svix-signature`

Inbound `email.received` events are acknowledged but not processed unless `EMAIL_INBOUND_ENABLED=true`.

## D1 Migration

Migration:

```text
workers/policy/migrations/0008_email_operations.sql
```

Tables:

- `email_jobs`
- `email_events`
- `support_reply_tokens`
- `inbound_email_messages`
- `email_recipient_flags`

## Outbound Flow

1. User creates a support ticket from the desktop app or customer portal.
2. The existing support thread/message is saved first.
3. A confirmation email job is inserted into `email_jobs`.
4. Admin replies create an email job for the customer unless the message is an internal note.
5. Status updates create operational emails for `open`, `resolved`, or `closed`.
6. Jobs are processed by `processEmailOutbox`.
7. Failed sends retry with backoff until `max_attempts`.
8. Resend delivery webhooks update job status and recipient flags.

If `EMAIL_OUTBOUND_ENABLED=false` or `RESEND_API_KEY` is missing, jobs may be queued but are not sent.

## Inbound Reply Flow

1. Outbound support emails use a generated reply address:

```text
reply+<random-token>@mail.saturnws.com
```

2. Only the token hash is stored in D1.
3. Resend Receiving sends `email.received`.
4. The worker retrieves the full received email from Resend.
5. The token is matched to `support_reply_tokens`.
6. The sender must match the ticket email.
7. The cleaned text body is inserted as a user support message.
8. The thread status becomes `waiting_for_support`.

Attachments are stored as metadata only. The current support data model has no secure attachment storage path, so attachments are not imported into tickets.

## Admin UI

Admin page:

```text
Email Operations / عمليات البريد
```

Capabilities:

- Show outbound/inbound enabled flags.
- Show whether required secrets exist as booleans only.
- Show sender/reply-domain/webhook path.
- Show queue status counts.
- Show latest outbound jobs.
- Show latest inbound email records.
- Retry a job.
- Process queue manually.
- Send a test email.

## Rollback

Safe rollback path:

1. Set `EMAIL_OUTBOUND_ENABLED=false`.
2. Keep `EMAIL_INBOUND_ENABLED=false`.
3. Leave D1 tables in place.
4. Remove or disable the Resend webhook in the Resend dashboard if needed.

Existing support routes still work without email processing.
