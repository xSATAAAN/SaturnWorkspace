# Frontend Cutover Report

Date: 2026-06-19

## Scope

Frontend-only cutover for `D:\SaturnWS\web-platform`.

No changes were made to:

- `D:\SaturnWS\desktop-app`
- Cloudflare Workers
- D1/R2
- OTA live data
- Backend routes
- Auth/payment/provider configuration
- Production secrets

## Backup

Created before modification:

- `D:\SaturnWS\web-platform\backups\frontend-cutover-pre-newui-20260619-142827.zip`
- SHA256: `991F7B84C346C6BA9AF5C2A83CAD6924A6D09AAE6C882E989165345E559C2AA3`

## Files Changed

- `D:\SaturnWS\web-platform\site\index.html`
  - Production entry now points directly to `src/new-ui/production-main.tsx`.
- `D:\SaturnWS\web-platform\site\src\main.tsx`
  - Legacy entry is bridged to the new production UI entry.
- `D:\SaturnWS\web-platform\site\package.json`
  - Main `npm run build` now type-checks the new UI and runs the existing production runtime exclusion check.
- `D:\SaturnWS\web-platform\tools\publish-static-pages.mjs`
  - Stops copying old root HTML pages over production routes.
  - Creates GitHub Pages clean-route SPA fallbacks from `site/dist/index.html`.
- `D:\SaturnWS\web-platform\site\src\new-ui\app\productionRouter.ts`
  - Added clean route aliases for `/downloads` and `/release-notes`.
- `D:\SaturnWS\web-platform\site\scripts\check-frontend-cutover.mjs`
  - New output verification for SPA fallbacks, legacy HTML leakage, preview router leakage, mock adapter leakage, and query-surface leakage.
- `D:\SaturnWS\web-platform\site\scripts\check-production-env.mjs`
  - New CI guard for required public Firebase frontend configuration.
- `D:\SaturnWS\web-platform\.github\workflows\deploy-pages.yml`
  - Keeps the same GitHub Pages deployment target.
  - Keeps the same existing `VITE_FIREBASE_*` GitHub Secrets.
  - Adds production env verification before build.
  - Adds frontend cutover output verification before artifact upload.

## Deployment Workflow

Current workflow file:

- `D:\SaturnWS\web-platform\.github\workflows\deploy-pages.yml`

Deployment target remains GitHub Pages:

- Build command: `npm run build`
- Static fallback command: `node tools/publish-static-pages.mjs`
- Output directory: `site/dist`
- Artifact upload path: `site/dist`

No new deployment provider was introduced.

## Existing Runtime Integrations Reused

The new production UI uses the existing adapters and API clients:

- Firebase Auth client config from existing GitHub Secrets:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_APP_ID`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
- Account subscription:
  - `https://auth.saturnws.com/account/subscription`
- Admin API:
  - `https://admin.saturnws.com/api/admin`
- Policy/support API:
  - default `https://api.saturnws.com`
- Update manifest:
  - `https://admin-api.saturnws.com/api/updates/latest.json?channel=...`

## Disabled Or Gated Production Features

These remain disabled/gated until their external provider decision is complete:

- Public checkout/payment actions:
  - Controlled by `VITE_ENABLE_PAYMENTS` and `VITE_ENABLE_PUBLIC_CHECKOUT`.
  - Default state remains disabled/decision-required.
- Email verification sending:
  - Controlled by `VITE_ENABLE_EMAIL_VERIFICATION`.
  - Default state remains external-service-required.

No fake payment checkout or fake transactional email provider was enabled.

## Local Verification

Passed:

- `npm run build`
- `node tools/publish-static-pages.mjs`
- `node scripts/check-frontend-cutover.mjs`
- `npm run test:new-ui:round3b`
- `npm run test:new-ui:production`
- Bundle secret scan for private/service tokens: no matches.
- Bundle preview/mock scan:
  - `?surface`: `0`
  - `PreviewSwitcher`: `0`
  - `mockAdapter`: `0`
  - `mockData`: `0`
  - `developmentMockAdapter`: `0`
  - `development-mock`: `0`
  - `ui-complete-mock`: `0`
  - `NewUiApp`: `0`
  - `usePreviewRouter`: `0`
- HTTP route fallback smoke through local Vite preview:
  - `/`
  - `/pricing`
  - `/download`
  - `/privacy`
  - `/account/signin`
  - `/account`
  - `/admin`
  - `/admin/releases`
  - `/404`
  - `/503`

Each returned HTTP 200 and served the React app shell.

## Local Runtime Smoke Limitation

A full local browser runtime smoke could not complete without the existing GitHub production Firebase configuration. The app reported:

- `missing_firebase_env:apiKey,authDomain,projectId,appId,messagingSenderId`

This is expected for this local workspace because no production frontend Firebase env values were added locally. The GitHub Pages workflow already receives these values from existing GitHub Secrets, and `check-production-env.mjs` now fails the workflow early if they are missing.

No secret values were printed or stored.

## Deployment Status

Deployment was not executed from this machine because neither `D:\SaturnWS\web-platform` nor `D:\SaturnWS` is a Git repository:

- `git status` returned: `fatal: not a git repository`
- No GitHub remote is available locally.

The workflow and site output are prepared locally, but pushing/triggering GitHub Pages is blocked until these changes are applied inside the actual GitHub working copy or a remote is provided.

## Rollback

Rollback options:

1. Restore the backup:
   - `D:\SaturnWS\web-platform\backups\frontend-cutover-pre-newui-20260619-142827.zip`
2. Or revert these files manually:
   - `D:\SaturnWS\web-platform\site\index.html`
   - `D:\SaturnWS\web-platform\site\src\main.tsx`
   - `D:\SaturnWS\web-platform\site\package.json`
   - `D:\SaturnWS\web-platform\tools\publish-static-pages.mjs`
   - `D:\SaturnWS\web-platform\.github\workflows\deploy-pages.yml`
   - `D:\SaturnWS\web-platform\site\src\new-ui\app\productionRouter.ts`
   - remove `D:\SaturnWS\web-platform\site\scripts\check-frontend-cutover.mjs`
   - remove `D:\SaturnWS\web-platform\site\scripts\check-production-env.mjs`

## Verdict

`Frontend cutover blocked`

Reason: local frontend cutover and verification succeeded, but production deployment could not be executed from this workspace because the local `D:\SaturnWS` tree is not connected to a Git repository or GitHub remote.
