# Post-Cutover Production Functional Verification

Date: 2026-06-19

Scope: live frontend verification for `https://saturnws.com` after frontend-only cutover.

No changes were made to:

- `D:\SaturnWS\desktop-app`
- Cloudflare Workers
- D1/R2
- OTA live data
- Backend routes
- Auth/payment/provider configuration
- Production secrets

## Deployed Fixes During Verification

The verification found and fixed frontend-only issues:

1. Public `/product`, `/features`, and `/faq` routes were rendering the homepage content.
   - Fixed in commit `97cf8f871c2565d1ff6e787478bfce2d8a697feb`.
   - GitHub Actions: `https://github.com/xSATAAAN/SaturnWorkspace/actions/runs/27826182886`
   - Result: success.

2. Invalid sign-in showed raw Firebase error text.
   - Fixed in commit `1263bca2449b3aeb63fe6396a1f1a91424450e6b`.
   - GitHub Actions: `https://github.com/xSATAAAN/SaturnWorkspace/actions/runs/27826385307`
   - Result: success.

3. Production bundle checks did not scan the real `site/dist` output and allowed preview wording to remain in the final bundle.
   - Fixed in commit `09d9dfcf9d80f8e46fd31fd91f2f6b3de429dfef`.
   - GitHub Actions: `https://github.com/xSATAAAN/SaturnWorkspace/actions/runs/27827122499`
   - Result: success.

## Build Verification

Passed from `D:\SaturnWS\web-platform\site`:

- `npm run build`
- `node tools/publish-static-pages.mjs` from `D:\SaturnWS\web-platform`
- `node scripts/check-frontend-cutover.mjs`
- `npm run test:new-ui:production`

Passed from GitHub checkout:

- `npm run build`
- `node tools/publish-static-pages.mjs`
- `node scripts/check-frontend-cutover.mjs`
- `npm run test:new-ui:production`

Bundle scan results after the final build:

- `Development preview`: 0
- `معاينة تطويرية`: 0
- `This preview does not publish`: 0
- `preview-switcher`: 0
- `mockPlans`: 0
- `mockUsers`: 0
- `mockData`: 0
- `FIREBASE_PRIVATE`: 0
- `service-role`: 0
- `private_update_signing_key`: 0
- `invite unlock`: 0

Note: the final JavaScript bundle still contains the string `localhost` from Firebase SDK internals, not from a Saturn API endpoint or local development endpoint.

## Public Website Verification

Live browser verification passed for:

- `https://saturnws.com/`
- `https://saturnws.com/pricing`
- `https://saturnws.com/product`
- `https://saturnws.com/features`
- `https://saturnws.com/faq`
- `https://saturnws.com/contact`
- Legal routes served the React app shell.
- Unknown route served the React app shell with 404 HTTP status.

Pricing content verified:

- Weekly plan shows `$10`.
- Monthly plan shows `$35`.
- Monthly trial copy shows `7 days free`.
- Annual discounted plan content is present from the prior pricing cutover.
- The highlighted label is `Popular` / `رائج`, not `Recommended`.

RTL/theme verification:

- `?lang=ar` sets `html lang="ar"` and `dir="rtl"`.
- `?lang=en` sets `dir="ltr"`.
- `?theme=dark` and `?theme=light` both render without breaking layout.

Responsive smoke:

- Desktop `1366x768`: no horizontal overflow on pricing.
- Mobile `390x844`: no horizontal overflow on pricing, menu button present.

## Auth Verification

Unauthenticated account guard:

- `https://saturnws.com/account` shows a sign-in/create-account prompt.
- No private customer data is exposed.

Invalid sign-in:

- Submitting invalid credentials stays on the sign-in page.
- User-facing error is now: `Email or password is incorrect.`
- Raw `Firebase: Error (...)` text is not shown.

Positive sign-in, real customer portal data, subscription state, and sign-out were not tested because no production test credentials were supplied during this verification pass.

## Admin Verification

Unauthenticated admin shell:

- `https://saturnws.com/admin` shows the admin preauth screen.
- No dashboard/private admin data is exposed before authentication.

Admin API checks:

- `GET https://admin.saturnws.com/api/admin/preauth/state`
  - Status: `200`
  - CORS: `https://saturnws.com`
  - Response indicates unauthenticated state.
- `GET https://admin.saturnws.com/api/admin/dashboard`
  - Status: `401`
  - CORS: `https://saturnws.com`
  - Correct unauthenticated guard.

Authenticated admin flows were not tested because no admin credentials were supplied.

## Download And Release Verification

Current live result:

- `https://saturnws.com/download` renders the new UI.
- The page shows `Failed / Failed to fetch`.

Root cause:

- `GET https://admin-api.saturnws.com/api/updates/latest.json?channel=beta`
  - Status: `200`
  - Content-Type: `application/json`
  - Missing `Access-Control-Allow-Origin`
- Browser fetch from `https://saturnws.com` is blocked by CORS.

Related checks:

- `https://admin.saturnws.com/api/updates/latest.json?channel=beta` returns `404` with CORS.
- `https://api.saturnws.com/api/updates/latest.json?channel=beta` returns `404` with CORS.
- `https://saturnws.com/api/updates/latest.json?channel=beta` returns `404`.

This cannot be fixed safely as frontend-only without either:

- allowing CORS for `https://saturnws.com` on `admin-api.saturnws.com`, or
- exposing the release manifest through an existing same-origin/public endpoint, or
- publishing a static release manifest with the website artifact.

No backend or OTA live changes were made.

## Support Verification

Public contact/support pages render.

Backend route check:

- `POST https://api.saturnws.com/v1/web/support/threads`
  - Status: `404`
  - CORS: `https://saturnws.com`

Expected behavior for an existing protected support endpoint would normally be an auth error, validation error, or controlled response, not `404`.

Customer web support is therefore not fully functional on production until the existing backend route/contract is confirmed or exposed. No backend change was made.

## Payments Verification

Public checkout remains disabled/gated as intended.

Observed:

- No fake payment checkout was enabled.
- `POST https://saturnws.com/api/payments/create` returns `405` because the public site is static.

This is acceptable for the current frontend-only cutover because payment provider activation remains a separate decision.

## Legal Content Verification

Legal routes render through the new UI:

- `/privacy`
- `/terms`
- `/refund`
- `/acceptable-use`
- `/cookies`

The current content is still generic/product placeholder copy and should be treated as content incomplete until final legal text is approved.

## Remaining Blockers

1. Downloads/releases are blocked by release manifest CORS or endpoint routing.
   - Area: backend/API configuration.
   - Impact: public download page cannot load live release data.
   - Frontend-only fix: not recommended.

2. Customer web support endpoint returns `404`.
   - Area: backend route/contract.
   - Impact: public/customer support creation is not confirmed functional.
   - Frontend-only fix: not possible without changing the real endpoint contract.

3. Full authenticated customer portal verification needs production test credentials.
   - Area: verification access.
   - Impact: cannot confirm subscription/account/download states after sign-in.

4. Full authenticated admin verification needs admin test credentials.
   - Area: verification access.
   - Impact: cannot confirm users/subscriptions/releases/support/policy actions end-to-end.

5. Legal copy needs final approved content.
   - Area: product/legal content.
   - Impact: public routes exist but content is not final.

## Verdict

`Production frontend partially functional`

Reason: the public shell, pricing, routing, RTL/theme behavior, auth guards, admin unauth guard, invalid auth error handling, and production bundle checks are functioning after deployment. However, the download/release page is blocked by a live CORS/manifest issue, customer web support returns `404`, and authenticated portal/admin flows still require credentials for real end-to-end verification.
