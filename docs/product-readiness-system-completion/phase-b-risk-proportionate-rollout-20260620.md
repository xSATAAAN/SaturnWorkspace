# Phase B Risk-Proportionate Rollout - 2026-06-20

## Status

Phase B Supabase additive migrations were applied after a migration-scoped subscription recovery ledger was created.

Stop point: manual Auth baseline acceptance tests. Phase C was not started. Desktop app was not touched.

## 1. Additive Migration Confirmation

Reviewed:

- `workers/auth/migrations/008_email_verification_core.sql`
- `workers/auth/migrations/009_account_profiles.sql`

Result:

- Both migrations are additive only.
- No writes to `account_subscriptions`.
- No writes to `app_sessions`.
- No writes to `device_login_sessions`.
- No drop/rename/delete/truncate/backfill against existing production tables.
- `drop trigger if exists` appears only for triggers on newly created tables.

Migration file hashes:

- `008_email_verification_core.sql`: `87E3C907B1E439472940BD5B2C81590332865B8B1169BF2F243B5B738D9ABCDD`
- `009_account_profiles.sql`: `5EBF2765D83BC14A3EAACB75A36A00F67359C61C960C7183B3C8E37BDEBC7086`

Supabase changelog was checked on 2026-06-20. The relevant note is that new public tables may not be automatically exposed to the Data API; these migrations explicitly enable RLS and revoke direct `anon`/`authenticated` access.

## 2. Recovery Ledger

Path:

`D:\SaturnWS\private-backups\subscription-recovery-20260620-165654Z`

Files:

- `account-subscriptions-full.json`
- `account-subscriptions-recovery.csv`
- `account-subscriptions-recovery.sql`
- `duplicate-subscription-groups.json`
- `manifest.json`
- `restore-instructions.md`
- `row-counts.json`
- `schema-metadata.json`
- `sha256.txt`

This is a migration-scoped recovery package, not a full database dump.

## 3. File Hashes

```text
5303F2BF4BBD22C1C22547CE303B332D7FEFE3F5FD3D2A927F93D6D6CE8D1054  account-subscriptions-full.json
0D3B6B550C740CD039994D7747279F60B7C692D7F0E7C78AACC10EEFD261DDF7  account-subscriptions-recovery.csv
36367610AC67E533F9018AFBD0E5F5941D6878C836BA8B173980215B166C7C4A  account-subscriptions-recovery.sql
6333F40EDAF50C7D00302A6DC357FA57728959F149619695B781C90C2CFB9BC3  duplicate-subscription-groups.json
828BDFC24B75194F08272604198F0F7E64CDC226668BBF0B23344FB85D3B494E  manifest.json
DB4B1E5BC2767DABA60723BF2AF53B179107FCFF8D5AC16E0CF6A54EDEC5DFD3  restore-instructions.md
D3DDDE5F32846EA2728AF53233D855DC06C2350C7CEDE2268BF638711A12750F  row-counts.json
A399EAAD8376030960449131481D591D41F93FAEAE9C5E4B984DDA1E9C66F6B1  schema-metadata.json
```

## 4. Duplicate Subscription Assessment

Snapshot counts:

- `account_subscriptions`: 16
- Duplicate email groups: 2
- Duplicate Firebase UID groups: 2

No duplicate rows were deleted, merged, or modified.

Duplicate group details are stored only in:

`D:\SaturnWS\private-backups\subscription-recovery-20260620-165654Z\duplicate-subscription-groups.json`

Assessment summary:

- One duplicate group has no active/usable row at snapshot time.
- One duplicate group has exactly one active/usable row at snapshot time.
- No duplicate group had more than one active/usable row at snapshot time.

## 5. Preflight

Preflight before migrations:

- `account_subscriptions`: 16 rows
- `app_sessions`: 30 rows
- `device_login_sessions`: 74 rows
- `account_email_verifications`: absent
- `account_email_verification_audit`: absent
- `account_profiles`: absent
- `public.touch_updated_at()`: exists
- `pgcrypto`: available

## 6. Migration Results

Applied via Supabase Connector:

- `email_verification_core`
  - Recorded migration version: `20260620170150`
  - Result: success
- `account_profiles`
  - Recorded migration version: `20260620170223`
  - Result: success

## 7. Postflight

Existing table row counts after migrations:

- `account_subscriptions`: 16
- `app_sessions`: 30
- `device_login_sessions`: 74

New table row counts:

- `account_email_verifications`: 0
- `account_email_verification_audit`: 0
- `account_profiles`: 0

New table security:

- RLS enabled on all three new tables.
- `anon` has no direct DML privileges.
- `authenticated` has no direct DML privileges.
- `service_role` has required DML privileges.

New table metadata:

- `account_email_verifications`: 19 columns, 4 indexes, 2 constraints.
- `account_email_verification_audit`: 10 columns, 3 indexes, 2 constraints.
- `account_profiles`: 15 columns, 4 indexes, 6 constraints.

## 8. Auth Worker Deployment

Auth Worker deployed with:

- `EMAIL_AUTH_ENABLED=false`
- Worker version: `16b4d3a3-356d-4b1a-bc36-0dbcba0bf191`
- Previous deploy rollback candidate: `b15be2f6-ead4-460e-9285-fdcabc7a1ecc`

Health check:

- `https://auth.saturnws.com/health`: HTTP 200

## 9. Site Build / Deployment

Site build:

- `npm run build`: success
- `node tools/publish-static-pages.mjs`: success
- `npm run test:phase-b`: success

Production GitHub Pages deployment was not triggered from this workspace because `D:\SaturnWS\web-platform` is not a Git repository and the local machine does not have `gh` installed. The current deploy mechanism is `.github/workflows/deploy-pages.yml`, which runs on push or `workflow_dispatch`.

Site revision:

- Local `site/dist` refreshed on 2026-06-20.
- Production Pages revision not changed by this run.

## 10. Tests

Passed:

- Supabase preflight.
- Supabase 008 postflight.
- Supabase full postflight.
- Auth Worker TypeScript check: `npx tsc --noEmit`.
- Auth Worker dry-run deploy.
- Auth Worker production deploy.
- Auth Worker health check.
- Site production build.
- Static page fallback publish.
- Phase B production rollout contract check.

Not run automatically:

- Google login manual test.
- Refresh manual test.
- Direct account routes manual test.
- Profile provisioning manual test.
- No active subscription manual test.

## 11. Emergency Subscription Grant

Status: not implemented in this run.

Reason: the requirement says this operation is after successful Auth baseline tests and before Phase C. Current stop point is before those manual baseline tests.

Design intent to preserve:

- Use `account_subscriptions` as source of truth.
- Use Firebase UID as primary identity.
- Support duration mode, exact expiry mode, and mutation mode.
- Require preview, reason, idempotency key, audit trail, and recovery-ledger restore mode.
- Do not create fake payments or invoices.
- Do not clean duplicate subscriptions automatically.

## 12. Rollback

Auth Worker rollback:

```powershell
cd D:\SaturnWS\web-platform\workers\auth
wrangler rollback b15be2f6-ead4-460e-9285-fdcabc7a1ecc
```

Database rollback:

- No destructive rollback was executed.
- New tables are additive and empty at deployment time.
- If rollback is required before any OTP/profile writes, disable worker paths and drop only the three new tables after explicit approval.
- Subscription recovery ledger is available at the private backup path above.

## 13. Explicit Non-Actions

- Phase C was not started.
- Desktop app was not touched.
- OTP was not enabled.
- Duplicate subscriptions were not modified.
- No full database dump was created.
- No secrets were printed.
