# SaturnWS Transactional Email Platform

## Scope

This pass expands the existing Email Operations layer instead of introducing a parallel email engine.

Existing retained foundations:

- `email_jobs`
- `email_events`
- `support_reply_tokens`
- `inbound_email_messages`
- `email_recipient_flags`
- Resend provider integration
- signed Resend webhook verification
- support reply-by-email
- Admin Email Operations
- `EMAIL_OUTBOUND_ENABLED` and `EMAIL_INBOUND_ENABLED`

Desktop app code was not touched.

## Current Event Sources

| Area | Current state | Email integration state |
| --- | --- | --- |
| Support ticket created | Existing Policy Worker support flow | Linked |
| Admin support reply | Existing Policy Worker admin support flow | Linked |
| Support status changed | Existing Policy Worker admin support flow | Linked |
| Inbound support reply | Existing Resend Receiving webhook flow | Linked |
| Admin email test | Existing Admin Email Operations | Linked |
| Auth verification/password reset | Auth/Firebase flows exist, server-side transactional emission is not wired here | Prepared |
| Billing/payment receipt/failure | Payment provider is not approved/live | Disabled/prepared only |
| Subscription reminders | Requires subscription event scheduling source | Prepared |
| Release/update notifications | Requires admin campaign scheduling decision | Prepared |
| Policy/security notices | Requires explicit admin/system event source | Prepared |

## Sender Identities

| Purpose | Sender | Reply-To |
| --- | --- | --- |
| General/system | `SaturnWS <no-reply@mail.saturnws.com>` | none |
| Security/auth | `SaturnWS Security <security@mail.saturnws.com>` | `security@saturnws.com` |
| Billing | `SaturnWS Billing <billing@mail.saturnws.com>` | `billing@saturnws.com` |
| Support | `SaturnWS Support <support@mail.saturnws.com>` | ticket-specific `reply+token@mail.saturnws.com` when applicable |
| Account/welcome | `SaturnWS <hello@mail.saturnws.com>` | `hello@saturnws.com` |

`admin@saturnws.com` is not used as an automated sender.

## Event Catalog

The canonical catalog is defined in:

```text
workers/policy/src/email_catalog.ts
```

The D1 seed table is created by:

```text
workers/policy/migrations/0009_transactional_email_catalog.sql
```

Current catalog count: 16.

Linked events:

- `support.ticket_created`
- `support.admin_replied`
- `support.status_changed`
- `support.inbound_received`
- `admin.email_test`

Prepared events:

- `account.welcome`
- `auth.email_verification_requested`
- `auth.password_reset_requested`
- `security.new_login`
- `billing.subscription_expiring`
- `billing.subscription_expired`
- `release.update_available`
- `release.mandatory_update`
- `policy.kill_switch_notice`

Disabled until payment provider approval:

- `billing.payment_succeeded`
- `billing.payment_failed`

Legacy aliases are mapped internally only:

- `support_ticket_confirmation` -> `support.ticket_created`
- `support_admin_reply` -> `support.admin_replied`
- `support_open` / `support_closed` / `support_resolved` -> `support.status_changed`
- `admin_test` -> `admin.email_test`

New arbitrary email type strings are rejected.

## Templates

Templates are rendered centrally in `email_catalog.ts`.

Rules:

- HTML and plain text are generated for every catalog event.
- Arabic and English are supported.
- Arabic HTML uses `dir="rtl"`.
- Template variables are escaped before insertion.
- Support emails use ticket-specific reply addresses.
- Prepared/disabled events can be previewed, but are not emitted by fake backend events.

## Preferences and Suppression

New table:

```text
notification_preferences
```

Behavior:

- Essential emails cannot be disabled by user preferences.
- Non-essential catalog entries may be disabled per user/email/category/event.
- Provider bounce/complaint/suppressed flags in `email_recipient_flags` prevent future sends to that recipient.

## Scheduling

New tables:

- `notification_schedule`
- `notification_deliveries`
- `email_domain_events`

The Worker contains a `scheduled()` handler and the scheduling tables are ready.

Cloudflare cron deployment is not active yet because the current Cloudflare account returned:

```text
workers.dev subdomain required for schedules
```

Until the Cloudflare account has a workers.dev subdomain or another approved schedule trigger, the scheduler can be run manually through the existing Admin Email Operations process route. It is still safe by default because:

```text
EMAIL_SCHEDULER_ENABLED=false
```

When enabled, the scheduler only processes due rows already present in `notification_schedule`; it does not invent renewal/trial/reminder events by itself.

## Resend Webhook Events

Known provider events:

- `email.sent`
- `email.delivered`
- `email.delivery_delayed`
- `email.delayed`
- `email.bounced`
- `email.complained`
- `email.failed`
- `email.received`
- `email.scheduled`
- `email.suppressed`

Inbound support processing still requires:

```text
EMAIL_INBOUND_ENABLED=true
```

Outbound sending still requires:

```text
EMAIL_OUTBOUND_ENABLED=true
RESEND_API_KEY
```

## Admin Operations

Existing Admin Email Operations was expanded through the same endpoint:

```text
GET /v1/admin/email/status
```

It now returns:

- config and feature flags
- sender identities
- event catalog
- queue counts
- latest jobs
- inbound email messages
- provider events
- recipient flags
- scheduled notifications
- catalog metrics

New preview endpoint:

```text
GET|POST /v1/admin/email/preview
```

Admin proxy route:

```text
/api/admin/policy/email/preview
```

The admin test email route now supports:

- `email_type`
- `locale`

If an event is disabled or suppressed, the API returns a failure instead of pretending it sent.

## Cloudflare Vars and Secrets

Secrets required for live sending/receiving:

- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`

Non-secret vars added/used:

- `EMAIL_SUPPORT_ENABLED=true`
- `EMAIL_AUTH_ENABLED=false`
- `EMAIL_BILLING_ENABLED=false`
- `EMAIL_RELEASE_ENABLED=false`
- `EMAIL_SECURITY_ENABLED=false`
- `EMAIL_SCHEDULER_ENABLED=false`
- `EMAIL_ADMIN_ALERTS_ENABLED=false`
- `EMAIL_FROM_GENERAL`
- `EMAIL_FROM_SECURITY`
- `EMAIL_FROM_BILLING`
- `EMAIL_FROM_ACCOUNT`
- `EMAIL_FROM_SUPPORT`
- `EMAIL_REPLY_DOMAIN`

## Local Verification

Completed locally:

- Policy Worker TypeScript check passed.
- Admin Worker syntax check passed.
- Site build passed.
- Policy Worker dry-run deploy passed.
- D1 local migration applied successfully.
- Local D1 catalog row count: 16.

Remote production migration was applied after a D1 export backup.

Remote Worker deployment:

- Policy Worker deployed: `saturnws-policy`
- Admin Worker deployed: `saturnws-admin`

Cloudflare cron trigger deployment is still pending the workers.dev subdomain requirement noted above.

## Remaining Production Steps

Before turning on live sending:

1. Confirm Resend webhook is subscribed to the listed events.
2. Set Cloudflare secrets:
   - `RESEND_API_KEY`
   - `RESEND_WEBHOOK_SECRET`
3. Apply D1 migration `0009_transactional_email_catalog.sql` remotely after taking a D1 backup/export.
4. Deploy policy/admin/site changes.
5. Keep `EMAIL_OUTBOUND_ENABLED=false` for smoke verification.
6. Send one admin test email after enabling outbound.
7. Enable `EMAIL_INBOUND_ENABLED=true` only after Receiving is verified.
8. Enable category flags one-by-one only after each event source is confirmed.

## Explicit Non-Goals

- No marketing/bulk email campaigns were added.
- No payment provider was activated.
- No fake billing success email source was added.
- No desktop app files were modified.
- No new secrets were committed to source.
