# Saturn Workspace Auth Worker

Cloudflare Worker serving the desktop account-login gate:

- `POST /device/start` : desktop app starts browser-based account login.
- `POST /device/complete` : website completes device login after Firebase Google sign-in.
- `POST /device/poll` : desktop app polls for account authorization and receives an app session token.
- `POST /session/verify` : desktop app validates its stored app session token and account subscription.
- `POST /session/logout` : revokes the stored app session token.
- `GET /oauth/google-drive-config` : returns Google Drive OAuth client config after authorization.
- `GET /health` : basic health endpoint.

`POST /verify` is intentionally deprecated. The tool no longer accepts public activation codes; access is decided by `account_subscriptions` linked to the signed-in account.

## 1) Install and run locally

```bash
cd workers/auth
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
npx wrangler secret put OAUTH_CONFIG_ACCESS_TOKEN
```

Optional:

```bash
npx wrangler secret put VERIFY_RATE_LIMIT_PER_MIN
npx wrangler secret put ALLOW_ORIGIN
```

## 3) Deploy

```bash
npx wrangler deploy
```

The route for `auth.saturnws.com/*` is configured in `wrangler.toml`.

## 4) Supabase SQL

For a clean database, run:

- `migrations/001_hardening.sql`
- `migrations/002_license_events.sql` (legacy compatibility, optional)
- `migrations/003_unified_admin_license_schema.sql` (legacy compatibility, optional)
- `migrations/004_device_login_sessions.sql`
- `migrations/005_account_subscriptions.sql`

The important production table for the new model is `account_subscriptions`. The website/payment flow should create or update a row for the user's Firebase account email, and the desktop app will only open when that row is active, not expired, and bound to the current HWID.
