# OTA Admin Worker

Cloudflare Worker + R2 backend for secure SATAN Toolkit OTA publishing and payment orchestration.

## Endpoints

- Public:
  - `GET /updates/latest.json`
  - `GET /updates/file/:encodedKey`
- Payments:
  - `POST /api/payments/create`
  - `GET /api/payments/:orderId`
  - `POST /api/payments/webhook`
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

1. Create R2 bucket: `satan-toolkit-ota`
2. Set Worker routes:
   - `satantoolkit.com/updates/*`
   - `admin-api.satantoolkit.com/api/*`
3. Configure vars/secrets:
   - `ADMIN_EMAIL_ALLOWLIST` (comma separated)
   - `ADMIN_ORIGIN` (for admin UI origin)
   - `ADMIN_LAYER1_USERNAME` (secret)
   - `ADMIN_LAYER1_PASSWORD` (secret)
   - `ADMIN_LAYER1_SESSION_SECRET` (secret, random 32+ bytes)
   - `PUBLIC_UPDATES_BASE_URL` (default `https://satantoolkit.com/updates`)
   - `PAYMENTS_ALLOWED_ORIGIN` (public website origin allowed to create/check payment intents)
   - `ENOT_CREATE_URL` (optional override)
   - `ENOT_SUCCESS_URL`, `ENOT_FAIL_URL`
4. Configure payment secrets using `wrangler secret put`:
   - `ENOT_API_KEY`
   - `ENOT_MERCHANT_ID`
   - `ENOT_WEBHOOK_SECRET`
5. Protect admin API host with Cloudflare Access (Google login + allowlist). The in-app layer-1 login is an additional server-side gate, not a replacement for Access/Firebase allowlisting.

## Payment Security Notes

- Price and plan authority live server-side only (`src/services/orders.js`).
- Checkout payload is normalized and sanitized in `src/validation/payments.js`.
- Webhook signatures are verified using HMAC SHA-256 (`src/security/payments.js`).
- Replay events are blocked and duplicate webhook events are rejected.
- Public payment endpoints have request rate-limits and origin restrictions.

## Deploy

```bash
npm install
npm run check:syntax
npm run deploy
```
