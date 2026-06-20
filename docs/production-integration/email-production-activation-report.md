# SaturnWS Production Email Activation Report

Generated: 2026-06-20

Scope: `D:\SaturnWS\web-platform` only. `D:\SaturnWS\desktop-app` was not touched.

## Production Worker

- Worker: `saturnws-policy`
- Production route: `api.saturnws.com/*`
- Zone: `saturnws.com`
- Route source: `workers/policy/wrangler.jsonc`
- Current Worker `workers.dev` route: disabled
- Current Worker preview URLs: disabled
- Account-level workers.dev subdomain: `saturnws`
- Current schedules: `*/5 * * * *`

## Cron Audit Result

Wrangler configuration was updated to declare:

```jsonc
{
  "workers_dev": false,
  "preview_urls": false,
  "routes": [
    { "pattern": "api.saturnws.com/*", "zone_name": "saturnws.com" }
  ],
  "triggers": {
    "crons": ["*/5 * * * *"]
  }
}
```

Deploy command:

```powershell
npx wrangler deploy
```

Wrangler version:

```text
4.95.0
```

Initial deployment behavior before the account-level workers.dev subdomain existed:

- Worker code and bindings were uploaded and deployed.
- Latest deployed version observed after the attempt: `450a0aac-5bfc-4702-a1a5-0f650edcd17f`.
- Schedule creation failed at Cloudflare API endpoint:

```text
PUT /accounts/0665376659b7e5b47ccc2114b25f75a6/workers/scripts/saturnws-policy/schedules
```

Full relevant error:

```text
You need a workers.dev subdomain in order to proceed.
Please go to the dashboard and open the Workers menu.
Opening the Workers landing page for the first time will create a workers.dev subdomain automatically. [code: 10063]
```

Wrangler log file:

```text
C:\Users\Admin\AppData\Roaming\xdg.config\.wrangler\logs\wrangler-2026-06-19_21-26-31_565.log
```

Follow-up Cloudflare API checks:

- `GET /accounts/{account_id}/workers/subdomain` returned `10007`: account has no workers.dev subdomain.
- `GET /accounts/{account_id}/workers/scripts/saturnws-policy/subdomain` returned:
  - `enabled: false`
  - `previews_enabled: false`
- `GET /accounts/{account_id}/workers/scripts/saturnws-policy/schedules` returned an empty schedule list.

Root cause:

Cloudflare requires the account-level workers.dev subdomain object to exist before it accepts Cron schedules. This is separate from exposing the `saturnws-policy` Worker publicly on `*.workers.dev`.

Resolution after approval:

- Created the account-level workers.dev subdomain: `saturnws`.
- Kept `workers_dev:false` and `preview_urls:false` for `saturnws-policy`.
- Redeployed `saturnws-policy` successfully.
- Current deployed Worker version: `cd25bb65-c703-4cb6-bab8-bc91d031c7c1`.
- Cloudflare API verified `saturnws-policy` workers.dev route is still disabled.
- Cloudflare API verified preview URLs are still disabled.
- Cloudflare API verified the production route is still `api.saturnws.com/*`.
- Cloudflare API verified Cron schedule is now registered:
  - `*/5 * * * *`
- Direct public workers.dev check returned `404 Not Found` for `https://saturnws-policy.saturnws.workers.dev/health`.

## Cron Implementation Safety

Code changes made before attempting production Cron:

- Added `email_cron_locks` D1 table in migration `0010_email_cron_locks.sql`.
- Added a 4-minute cron lock named `email-operations`.
- Updated manual Admin Email Operations processing to run the same locked cron path.
- Fixed outbox job claiming so a job is sent only if the `queued -> processing` update actually changes the row.
- Existing scheduled notification row locks remain in place.

Remote D1:

- Backup/export created before migration:
  - `D:\SaturnWS\web-platform\docs\production-integration\backups\saturnws-policy-before-email-cron-locks-20260620-002521.sql`
- Remote migration `0010_email_cron_locks.sql` applied successfully.

Cron expressions:

```text
*/5 * * * *
```

Rationale:

One trigger is enough for the current implementation because `runEmailCron()` handles:

- queued email jobs
- retries
- stuck job recovery
- scheduled transactional notifications

No separate daily trigger was added because no implemented source currently generates daily reminder rows by itself.

## Current Feature Flags

Current deployed Worker bindings show:

| Flag | Current value |
| --- | --- |
| `EMAIL_OUTBOUND_ENABLED` | `false` |
| `EMAIL_INBOUND_ENABLED` | `false` |
| `EMAIL_SUPPORT_ENABLED` | `false` |
| `EMAIL_AUTH_ENABLED` | `false` |
| `EMAIL_BILLING_ENABLED` | `false` |
| `EMAIL_RELEASE_ENABLED` | `false` |
| `EMAIL_SECURITY_ENABLED` | `false` |
| `EMAIL_SCHEDULER_ENABLED` | `false` |
| `EMAIL_ADMIN_ALERTS_ENABLED` | `false` |

No live sending, inbound processing, or scheduler sending is enabled.

## Required Secrets

Current deployed secrets:

- `ADMIN_TOKEN_SHA256`
- `POLICY_SIGNING_SEED_B64`
- `POLICY_STAGING_TOKEN`

Missing required email secrets:

- `RESEND_SEND_API_KEY`
- `RESEND_RECEIVE_API_KEY`
- `RESEND_WEBHOOK_SECRET`

Commands to add them to the correct Worker, without placing values in source:

```powershell
cd D:\SaturnWS\web-platform\workers\policy
npx wrangler secret put RESEND_SEND_API_KEY
npx wrangler secret put RESEND_RECEIVE_API_KEY
npx wrangler secret put RESEND_WEBHOOK_SECRET
```

Resend API key requirement:

- Name: `SaturnWS Production Email`
- Permission: `Sending access`
- Restricted domain: `mail.saturnws.com`

Full Access is not needed by the current code for outbound sending.

Inbound note:

- The inbound flow verifies the webhook, then calls `GET https://api.resend.com/emails/receiving/{emailId}` to retrieve the received message body.
- Resend documentation defines `sending_access` as send-only.
- Therefore Stage 2 outbound should use the restricted Sending access key.
- Before Stage 3 inbound, confirm whether Resend offers a narrow receiving-read permission. If not, inbound processing needs an explicit decision to use a broader API key for the same Worker secret.

## Resend Webhook

Production endpoint:

```text
POST https://api.saturnws.com/api/webhooks/resend
```

Required events:

- `email.sent`
- `email.delivered`
- `email.delivery_delayed`
- `email.bounced`
- `email.complained`
- `email.failed`
- `email.received`

Additional known events handled safely:

- `email.delayed`
- `email.scheduled`
- `email.suppressed`

Signature handling:

- The Worker reads `await request.text()` first.
- Svix signature validation signs the exact raw body string.
- Signing secret is read from `RESEND_WEBHOOK_SECRET`.
- Invalid or missing signatures return `401`.

## Smoke Test Status

Completed:

- Policy TypeScript check passed.
- Local D1 migration passed.
- Remote D1 migration `0010_email_cron_locks.sql` passed.
- `wrangler deploy --dry-run` passed.
- Production Worker health endpoint returned OK.
- Cloudflare API verified Worker subdomain and preview URLs are disabled.
- Cloudflare API verified Cron schedule `*/5 * * * *` is active.
- `wrangler dev --test-scheduled` manual scheduled-handler invocation returned `200` with `Ran scheduled event`.
- Remote D1 lock test passed:
  - first isolated test acquire: `1`
  - second concurrent acquire while locked: `0`
- Site build passed after Admin Email Operations status field changes.
- Admin Worker syntax check passed.
- Active source and site dist scan found no usage of the legacy single Resend key name.
- Active source and site dist scan found no private key/token patterns.

Blocked:

- Admin test email: blocked until `RESEND_SEND_API_KEY` is set and outbound is explicitly enabled.
- Delivery webhook: blocked until `RESEND_WEBHOOK_SECRET` is set and Resend webhook is registered.
- Bounce simulation: blocked until outbound/webhook are active.
- Duplicate webhook replay: blocked until a real signed webhook event exists.
- Inbound support reply: blocked until webhook secret is set and inbound is enabled.
- Unknown reply token: blocked until inbound test can be performed with signed webhook.
- Queue retry: can be exercised after outbound is enabled with a controlled failed job.

## Rollout Plan

Stage 1:

- Add `RESEND_SEND_API_KEY`.
- Add `RESEND_RECEIVE_API_KEY`.
- Add `RESEND_WEBHOOK_SECRET`.
- Keep all email feature flags false.
- Verify health and Admin Email Operations status.

Stage 2:

- Set:
  - `EMAIL_OUTBOUND_ENABLED=true`
  - `EMAIL_SUPPORT_ENABLED=true`
- Send one admin test email to a controlled test mailbox.
- Verify job creation, provider message ID, sent/delivered webhook storage, SPF/DKIM/DMARC, and no duplicates.

Stage 3:

- Set `EMAIL_INBOUND_ENABLED=true`.
- Test support thread email reply flow end-to-end.
- Confirm duplicate inbound events are ignored by `provider_event_id`.
- Confirm internal notes are never emailed.

Stage 4:

- Set `EMAIL_SCHEDULER_ENABLED=true` only after outbound/inbound rollout is approved.
- Create one safe scheduled test record.
- Verify it queues once, sends once, and records delivery.
- Delete test data.

Stage 5:

- Enable Auth/Security/Release/Billing categories only when real event sources exist.
- Do not enable billing/payment emails until the payment provider integration is live.

## Rollback Plan

Immediate rollback without code revert:

1. Keep or set:
   - `EMAIL_OUTBOUND_ENABLED=false`
   - `EMAIL_INBOUND_ENABLED=false`
   - `EMAIL_SCHEDULER_ENABLED=false`
2. Disable or remove the Resend webhook in Resend dashboard if needed.
3. Leave D1 tables in place; they are inert while flags are false.
4. If Cron schedules are later activated and need rollback, remove `triggers.crons` from Wrangler config and deploy, or set it to an empty array to remove schedules.

## Final State

- Worker code: deployed.
- D1 lock migration: applied.
- Cron schedule: active.
- Cron Dashboard/API visibility: Cloudflare API returns `*/5 * * * *`.
- Last scheduled invocation test: local Wrangler scheduled test returned `200` and did not send mail because flags/secrets are disabled.
- Latest Worker version: `cd25bb65-c703-4cb6-bab8-bc91d031c7c1`.
- Secrets: missing `RESEND_SEND_API_KEY`, `RESEND_RECEIVE_API_KEY`, and `RESEND_WEBHOOK_SECRET`.
- Feature flags: all email sending/receiving/scheduler flags off.
- `workers.dev`: not enabled for `saturnws-policy`.
- Account-level workers.dev subdomain exists only as Cloudflare account prerequisite: `saturnws`.
- Public workers.dev endpoint for `saturnws-policy`: not available, `404 Not Found`.
- Desktop app: not touched.
