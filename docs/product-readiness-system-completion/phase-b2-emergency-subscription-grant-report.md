# Phase B.2 - Emergency Subscription Grant

Status: `IMPLEMENTED_PENDING_MANUAL_ACCEPTANCE`

Date: 2026-06-21

## Scope

Phase B.2 implements an administrative manual subscription grant flow only. OTP, Phase C, desktop-app, payments, invoices, and provider billing were not started.

## Architecture Findings

- Canonical subscription source remains Supabase/Postgres `public.account_subscriptions`.
- Firebase UID is the required execution identity. Email can assist search/review, but execute requires UID.
- Existing Admin Worker already had direct `GET/POST/PATCH /api/admin/subscriptions` operations, but those wrote immediately and did not provide preview, reason, idempotency, or duplicate usable-row handling.
- Existing audit infrastructure is `appendAudit`, which writes to R2 `updates/audit.json` when available and attempts `admin_activity` as the structured table.
- Current schema supports `subscription_plan` enum values `monthly` and `yearly` only. Phase B.2 therefore does not add random enum values. Requested plan intent such as `weekly`, `lifetime`, `custom`, or `manual` is stored in metadata while the DB plan remains compatible.
- Existing historical duplicate groups are expected. This phase does not delete, merge, or silently normalize duplicate rows.

## Canonical Resolver

The resolver:

- Fetches candidate subscription rows by Firebase UID and/or normalized email.
- Treats usable rows as active/trialing and not expired, with 9999 expiry treated as lifetime.
- Sorts deterministically by usable state, lifetime, expiry, updated time, and created time.
- Selects a current subscription only when exactly one usable row exists.
- Reports historical row count, usable row count, duplicate UID/email groups, and warnings.
- Blocks execution when more than one usable row exists.

It does not rely on first row, default DB order, email alone, or updated_at alone.

## State Model

- Current subscription: exactly one usable row selected by the resolver.
- Historical subscriptions: non-current rows retained for history.
- Entitlement result: derived from proposed expiry/lifetime state.
- Manual grant operation: admin action with reason/idempotency/audit; not a payment/order/invoice.
- Recovery operation: represented by `restore_remaining_time` with source `admin_recovery`.
- Payment history: unchanged and not written by this phase.

Supported operations:

- `extend_current`
- `replace_current`
- `start_from_now`
- `restore_remaining_time`

Supported duration inputs:

- hours
- days
- weeks
- months
- exact expiry ISO/date-time
- lifetime plan intent

## API Contracts

New Admin Worker routes:

- `POST /api/admin/subscriptions/manual-grant/preview`
- `POST /api/admin/subscriptions/manual-grant/execute`

Preview returns:

- target identity summary
- current canonical subscription
- latest historical subscription when no usable current exists
- historical rows summary
- duplicate/integrity warnings
- proposed start/expiry
- plan intent and DB-compatible plan
- affected row IDs
- preview hash

Execute requires:

- authorized admin
- Firebase UID
- operation type
- duration or exact expiry
- plan intent
- required reason
- idempotency key
- preview hash when supplied

## Migration

No migration was applied.

Reason:

- The current schema can support the operational grant via existing fields plus `metadata`.
- A future migration/RPC would be needed for fully atomic multi-row replacement if the product later requires ending an old row and creating a new row in one database transaction.

## Admin UI

The Admin Subscriptions drawer now uses:

- Firebase UID field.
- Email field for review/search context.
- Operation selector.
- Plan selector.
- Duration or exact expiry mode.
- Timezone field.
- Required reason field.
- Preview button.
- Separate confirm action.
- Human-readable result with request reference.

The UI does not expose raw JSON, stack traces, provider internals, or database/source-of-truth copy.

## Audit

Execute records `subscription_manual_grant` with:

- admin actor
- target Firebase UID and email
- request ID
- idempotency key hash
- operation
- source
- reason
- old canonical state
- proposed state
- final state
- affected row IDs
- old/new expiry
- plan
- duration
- warnings
- result

No tokens or secrets are logged.

## Security Review

- Admin authorization uses the existing `requireAdmin` path.
- UI visibility is not treated as authorization.
- Zero/negative duration is rejected.
- Invalid and past exact expiry are rejected except for authorized recovery semantics.
- Execute requires Firebase UID.
- Execute requires reason.
- Execute uses idempotency before replaying a repeated request.
- Multiple usable subscriptions block execution and require human resolution.
- No payment, order, or invoice rows are created.

## Tests

Automated local tests:

- Admin Worker syntax check.
- `npm run test:phase-b2` with mocked Supabase/R2.
- Site TypeScript check.
- `npm run test:phase-b1`.
- `npm run test:phase-b`.
- Full site `npm run build`.

Covered by `test:phase-b2`:

- Grant 1 hour.
- Grant 5 days.
- Grant 3 weeks.
- Grant 2 months.
- Exact expiry.
- No-subscription user preview.
- Active subscription extend.
- Duplicate usable rows blocked.
- Zero duration rejected.
- Negative duration rejected.
- Past expiry rejected.
- Missing reason rejected.
- Duplicate idempotency key replay.
- Audit record.
- No payment/invoice creation.

Not production-verified yet:

- Live admin manual acceptance flow.
- Real Supabase row mutation on a selected test account.
- Concurrent production submissions under real latency.

## Deployment

Pending at report creation. Worker and site must be deployed, then manual acceptance must stop before OTP or Phase C.

## Manual Acceptance Checklist

1. Search for a user.
2. Preview a 5-day grant.
3. Execute the grant.
4. Refresh and verify the subscription appears.
5. Extend by one day.
6. Verify negative value is rejected.
7. Review audit.
8. Confirm no fake payment/order/invoice exists.

## Explicit Non-started Work

- OTP: not started.
- Phase C: not started.
- Desktop app: not touched.
