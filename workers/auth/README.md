# Saturn Workspace License Worker

Cloudflare Worker serving:

- `POST /verify` : desktop app verifies/binds `license_key` with `hwid`.
- `POST /device/start` : desktop app starts browser-based account login.
- `POST /device/poll` : desktop app polls for account authorization and receives an app session token.
- `POST /device/complete` : website completes device login after Firebase Google sign-in.
- `POST /session/verify` : desktop app validates its stored app session token.
- `GET /oauth/google-drive-config` : returns Google Drive OAuth client config after authorization.
- `GET /health` : basic health endpoint.

`POST /webhook/enot` is present but disabled unless `ENOT_WEBHOOK_SECRET` is configured.

## 1) Install and run locally

```bash
cd license-worker
npm install
cp .dev.vars.example .dev.vars
npx wrangler dev
```

## 2) Configure secrets in Cloudflare

```bash
npx wrangler secret put SUPABASE_API_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put GOOGLE_DRIVE_CLIENT_CONFIG_JSON
npx wrangler secret put FIREBASE_WEB_API_KEY
```

Optional:

```bash
npx wrangler secret put OAUTH_CONFIG_ACCESS_TOKEN
npx wrangler secret put VERIFY_RATE_LIMIT_PER_MIN
npx wrangler secret put ALLOW_ORIGIN
```

## 3) Deploy

```bash
npx wrangler deploy
```

The route for `auth.saturnws.com/*` is configured in `wrangler.toml`.

## 4) Supabase SQL

Run:

- `migrations/001_hardening.sql`
- `migrations/002_license_events.sql` (optional but recommended)
- `migrations/003_unified_admin_license_schema.sql`
- `migrations/004_device_login_sessions.sql`

## 5) Request/response contracts

### POST /verify

Request:

```json
{ "license_key": "SATURN-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX", "hwid": "machine-id" }
```

Responses:

- `{"success":true,"status":"activated","policy":{"allow":true}}`
- `{"success":true,"status":"verified","policy":{"allow":true}}`
- `{"success":false,"error":"hwid_mismatch"}`

### POST /webhook/enot

- Disabled unless `ENOT_WEBHOOK_SECRET` is configured.
