# OTA Admin Worker

Cloudflare Worker + R2 backend for secure Saturn Workspace OTA publishing and admin operations.

## Endpoints

- Public:
  - `GET /updates/latest.json`
  - `GET /updates/file/:encodedKey`
- Future payments (disabled in beta UI):
  - `POST /api/payments/create`
  - `GET /api/payments/:orderId`
- Admin (protected by Cloudflare Access):
  - `GET /api/admin/preauth/state`
  - `POST /api/admin/preauth`
  - `POST /api/admin/preauth/logout`
  - `GET /api/admin/state`
  - `POST /api/admin/upload` (multipart form: `file`, `version`, `channel`)
  - `POST /api/admin/publish`
  - `GET /api/admin/history?channel=stable|beta`
  - `POST /api/admin/rollback`

## Required Cloudflare Setup

1. Create R2 bucket: `saturn-workspace-ota`
2. Set Worker routes:
   - `saturnws.com/updates/*`
   - `admin-api.saturnws.com/api/*`
3. Configure vars/secrets:
   - `ADMIN_EMAIL_ALLOWLIST` (comma separated)
   - `ADMIN_ORIGIN` (for admin UI origin)
   - `ADMIN_LAYER1_USERNAME` (secret)
   - `ADMIN_LAYER1_PASSWORD` (secret)
   - `ADMIN_LAYER1_SESSION_SECRET` (secret, random 32+ bytes)
   - `PUBLIC_UPDATES_BASE_URL` (default `https://saturnws.com/updates`)
   - `PAYMENTS_ALLOWED_ORIGIN` (public website origin allowed to create/check future payment requests)
4. Protect admin API host with Cloudflare Access (Google login + allowlist). The in-app layer-1 login is an additional server-side gate, not a replacement for Access/Firebase allowlisting.

## Future Payment Security Notes

- Price and plan authority live server-side only (`src/services/orders.js`).
- Checkout payload is normalized and sanitized in `src/validation/payments.js`.
- The public site does not expose payment UI during beta. These routes are retained for the replacement gateway.
- Public payment endpoints have request rate limits and origin restrictions.

## Deploy

```bash
npm install
npm run check:syntax
npm run deploy
```
