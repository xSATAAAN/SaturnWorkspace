# Full Production Auth, Session, Support Audit

Date: 2026-06-20

## Scope

- Website and admin UI: `D:\SaturnWS\web-platform\site`
- Policy/support Worker: `D:\SaturnWS\web-platform\workers\policy`
- Desktop auth/linking audit only: `D:\SaturnWS\desktop-app\src\backend\security\device_auth.py`

No launcher, updater, installer, OTA, or unrelated desktop behavior was modified.

## Architecture Map

### Website authentication

- UI entry: `site/src/new-ui/pages/production/ProductionPages.tsx`
- Runtime adapter: `site/src/new-ui/adapters/productionAdapters.ts`
- Firebase client: `site/src/lib/firebase`
- Account subscription API client: `site/src/api/account.ts`
- Auth backend: `https://auth.saturnws.com/account/subscription`
- Account identity backend used by support: `https://auth.saturnws.com/account/identity`

### Desktop linking

- Desktop starts a device flow from `desktop-app/src/backend/security/device_auth.py`.
- Desktop calls:
  - `POST https://auth.saturnws.com/device/start`
  - opens `https://saturnws.com/activate?...`
  - polls `POST https://auth.saturnws.com/device/poll`
  - verifies stored app session through `POST https://auth.saturnws.com/session/verify`
- Website must complete linking through `POST https://auth.saturnws.com/device/complete`.

### Customer support

- Customer UI: `/account/support`
- API client: `site/src/api/support.ts`
- Worker routes:
  - `POST https://api.saturnws.com/v1/web/support/messages`
  - `POST https://api.saturnws.com/v1/web/support/threads`
  - `POST https://api.saturnws.com/v1/web/support/thread`
  - `POST https://api.saturnws.com/v1/web/support/reply`
  - `POST https://api.saturnws.com/v1/web/support/status`
- Storage: D1 tables `support_threads`, `support_messages`, `support_message_blocks`, email outbox/events tables.

### Admin support

- Admin UI: `/admin/support`
- API client: `site/src/api/admin.ts`
- Admin proxy routes: `/api/admin/policy/support*`
- Policy Worker routes:
  - `GET /v1/admin/support`
  - `GET /v1/admin/support/messages`
  - `POST /v1/admin/support/reply`
  - `POST /v1/admin/support/status`
  - `POST /v1/admin/support/block`

## Root Causes Found

1. **Desktop linking regression in the new production UI**
   - `/activate` routed to the generic sign-in page.
   - The old implementation in `site/src/components/AuthPage.tsx` completed `POST /device/complete`, but that flow was not present in the new UI.

2. **Support auth contract was body-only**
   - `site/src/api/support.ts` sent `id_token` only in JSON body.
   - The Policy Worker accepted only `body.id_token`.
   - This worked in a narrow case but did not match the production contract expectation of an auth header.

3. **Support email status mismatch**
   - Policy Worker production config has `EMAIL_SUPPORT_ENABLED=true`.
   - The production UI had a hardcoded `EMAIL_SUPPORT_ENABLED=false`, causing misleading “email not configured” messages.

4. **Admin reply mode was not enforced by backend**
   - Admin UI exposed “Portal only” and “Portal + email”.
   - Worker queued support reply email for every non-internal admin reply.

5. **Raw support errors reached users**
   - Some support failures surfaced technical codes such as `thread_not_found` or generic request codes.

## Changes Made

- Restored device activation in the new UI:
  - `/activate?device_code=...&code=...` stores a short-lived activation payload.
  - after email/password or Google sign-in, the UI calls `POST /device/complete`.
  - successful completion routes to `/account/linked`.
- Added `/account/linked` as a real production route.
- Support API client now sends `Authorization: Bearer <idToken>` and keeps `id_token` in body for backward compatibility.
- Policy Worker support auth now accepts either Bearer token or body `id_token`.
- Admin support reply email is now controlled by `email_requested`:
  - missing field defaults to email for backward compatibility.
  - explicit `email_requested:false` means portal-only.
- Production UI support text now reflects that portal replies may also arrive by email.
- User-facing support errors are mapped to safe Arabic/English messages.
- Account subscription and email verification clients now include Bearer headers while keeping current body payloads.

## Validation So Far

- `npm run check` in `workers/policy`: passed.
- `npm run build` in `site`: passed.
- `https://api.saturnws.com/health`: returned success.
- Anonymous support request to `/v1/web/support/threads`: rejected with 401, as expected.

## Production Deployment Verification

- Git commit pushed to GitHub: `c63ceef`.
- Policy Worker deployed successfully.
- Policy Worker version: `7d1c3577-3aaa-4119-8836-7507bde21b45`.
- Cron remained registered: `*/5 * * * *`.
- `https://api.saturnws.com/health`: returned `{"success":true,"service":"saturnws-policy","status":"ok"}`.
- `OPTIONS https://api.saturnws.com/v1/web/support/threads` from `https://saturnws.com` returned 204 and allowed `authorization,content-type`.
- `POST /v1/web/support/threads` without a session returned 401.
- `POST /v1/web/support/threads` with an invalid Bearer token returned 401.
- `https://saturnws.com/activate?device_code=...&code=...`: returned 200.
- `https://saturnws.com/account/support`: returned 200.
- `https://admin.saturnws.com/support`: returned 200.
- Admin subdomain clean paths such as `/support` and `/communications` are routed directly without requiring a duplicated `/admin/...` prefix.
- Live site bundle contains the restored desktop linking flow (`/device/complete`).

## Additional Local Checks

- `node scripts/check-round3b-production-integration.mjs`: passed, with known missing optional migration files in this checkout reported as skipped by the script.
- `node tools/publish-static-pages.mjs` then `node site/scripts/check-frontend-cutover.mjs`: passed with 27 SPA fallbacks.
- Auth Worker TypeScript check was run after installing local dependencies in the GitHub checkout: passed.

## Not Tested Without User Login

The following require an authenticated Firebase user session and were not bypassed:

- Creating a real customer support ticket from `/account/support`.
- Reading an existing customer support thread.
- Completing `/activate` with a real live device code from the desktop app.
- Admin replying to a real thread with “Portal only” vs “Portal + email”.

## Rollback

- Revert the website changes in:
  - `site/src/new-ui/app/productionRouter.ts`
  - `site/src/new-ui/pages/production/ProductionPages.tsx`
  - `site/src/api/support.ts`
  - `site/src/api/account.ts`
  - `site/src/api/emailVerification.ts`
  - `site/src/new-ui/adapters/errorContract.ts`
- Revert the Worker change in:
  - `workers/policy/src/index.ts`
- Redeploy `saturnws-policy` and the site from the previous commit if production regression appears.
