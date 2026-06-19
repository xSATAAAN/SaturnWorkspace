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

Deployment was completed through the GitHub repository:

- Repository: `xSATAAAN/SaturnWorkspace`
- Branch: `main`
- Commit: `50420df573d3f368e4093228018170dd06e555f4`
- Commit URL: `https://github.com/xSATAAAN/SaturnWorkspace/commit/50420df573d3f368e4093228018170dd06e555f4`
- GitHub Actions run: `https://github.com/xSATAAAN/SaturnWorkspace/actions/runs/27824309770`
- Workflow result: `success`

Live HTTP smoke after deployment returned `200` and served the React app shell for:

- `https://saturnws.com/`
- `https://saturnws.com/pricing`
- `https://saturnws.com/download`
- `https://saturnws.com/account/signin`
- `https://saturnws.com/admin/releases`

## Post-Cutover Verification Updates

Additional frontend-only fixes were deployed during live verification:

- `97cf8f871c2565d1ff6e787478bfce2d8a697feb`
  - Restored production `/product`, `/features`, and `/faq` routing.
  - GitHub Actions: `https://github.com/xSATAAAN/SaturnWorkspace/actions/runs/27826182886`
- `1263bca2449b3aeb63fe6396a1f1a91424450e6b`
  - Replaced raw Firebase invalid sign-in text with a user-safe message.
  - GitHub Actions: `https://github.com/xSATAAAN/SaturnWorkspace/actions/runs/27826385307`
- `09d9dfcf9d80f8e46fd31fd91f2f6b3de429dfef`
  - Hardened production bundle checks and removed preview/development wording from production output.
  - GitHub Actions: `https://github.com/xSATAAAN/SaturnWorkspace/actions/runs/27827122499`

Post-cutover verification report:

- `D:\SaturnWS\web-platform\docs\production-integration\post-cutover-functional-verification.md`

Final post-cutover verdict:

- `Production frontend partially functional`

Reason: public website routing, pricing, auth guards, admin unauth guard, invalid auth messaging, RTL/theme behavior, responsive smoke, build checks, and bundle scans passed. Downloads/releases remain blocked by live release manifest CORS, customer web support returns `404`, and authenticated portal/admin E2E requires test credentials.

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

`Frontend cutover successful; production functional verification partially complete`

Reason: local frontend cutover verification passed, the changes were pushed to `main`, GitHub Pages deployment completed successfully, and live route smoke checks served the new React app shell. The later functional verification identified backend/CORS and credential-gated blockers that require separate follow-up before the whole production experience can be considered fully verified.
