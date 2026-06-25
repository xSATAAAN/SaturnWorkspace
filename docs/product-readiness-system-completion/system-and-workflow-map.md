# Saturn Workspace System and Workflow Map

Updated: 2026-06-25

Current state: `PHASE_G_PRE_ACCEPTANCE_COMPLETION_ACTIVE`

This map records the active production architecture and high-value workflows. It is a current-orientation artifact, not a new roadmap phase.

## Canonical Source

- Repository: `D:\SaturnWS\github-deploy\SaturnWorkspace`.
- Branch: `main`.
- Do not use `D:\SaturnWS\web-platform` as source of truth.

## Runtime Surfaces

| Surface | Source | Production host / route | Primary responsibility |
| --- | --- | --- | --- |
| Public and customer site | `site/src/new-ui` | `https://saturnws.com/*` | Public pages, auth entry, customer portal, downloads, support, notifications. |
| Auth Worker | `workers/auth` | `https://auth.saturnws.com/*`, `https://saturnws.com/auth/*` | Firebase token boundary, account projection, email verification, device login, sessions, account deletion request/cancel. |
| Policy Worker | `workers/policy` | `https://api.saturnws.com/*` | Desktop policy, support, notifications, invite validation, email operations, Resend webhooks, scheduler. |
| Admin Worker | `workers/admin` | `https://admin-api.saturnws.com/*`, `https://updates.saturnws.com/*` | Admin API, updates, releases, public plan/download catalog, crash ingest. |
| Admin SPA | `site/src/new-ui` admin routes | `https://admin.saturnws.com/*` | Administrative UI. |
| Supabase/Postgres | migrations under `workers/auth/migrations` and admin schema | External managed database | Account profiles, subscriptions, app sessions, email verification, deletion/recovery records. |
| D1/R2 | Policy/Admin bindings and migrations | Cloudflare | Policy/read models, support/email operational state, releases/artifacts, attachment storage. |
| Desktop app | `D:\SaturnWS\desktop-app` outside this current repo | Installed Windows app | Desktop workflows, AdsPower/Brave automation, local user data. Not modified in this Phase G batch. |

## Trust Boundaries

- Browser UI can request but cannot decide account, entitlement, support ownership, admin authority, or payment state.
- Auth Worker verifies Firebase tokens and owns account/session projection responses.
- Supabase `account_subscriptions` is legal subscription truth.
- Policy D1 can hold projections and operational state but is not billing truth.
- Admin UI visibility is not authorization; Admin Worker/Policy Worker enforce backend permissions.
- Resend/Email providers are external event sources and must be verified through signed webhooks and provider IDs.

## Key Workflows

### Email/Password Registration

1. Browser creates Firebase provider identity with email/password.
2. Browser stores no password after provider call.
3. Browser requests Saturn OTP through Auth Worker with non-sensitive registration metadata: display name, locale, terms version, terms accepted state.
4. Auth Worker stores only OTP hash in Supabase and queues provider delivery through Policy Worker.
5. Before OTP verification:
   - no `account_profiles` row is auto-provisioned,
   - `/account/subscription`, `/account/identity`, and explicit `/account/provision` fail closed with `EMAIL_VERIFICATION_REQUIRED`,
   - device login cannot issue a desktop session.
6. Successful OTP verification creates or updates the existing profile for the same Firebase UID with `verification_source = saturnws_otp`.
7. Customer portal and desktop linking then use the same verified profile and subscription resolver.

### Google Registration / Login

1. Browser authenticates with Firebase Google provider.
2. Trusted Google verified email can finalize directly through Auth Worker profile provisioning.
3. Customer and Desktop paths converge on Firebase UID and `account_profiles`.

### Customer Portal

1. Shared auth listener hydrates Firebase user.
2. Auth adapter calls `/account/subscription`.
3. Profile verification state gates protected portal content before page data renders.
4. Subscription summary uses `current_subscription` and `subscription_projection`; no plan is invented for no-subscription users.

### Desktop Device Linking

1. Desktop starts device login and receives device/user code.
2. Browser or password-complete flow authorizes the pending device.
3. Auth Worker blocks unverified email/password identities.
4. Auth Worker issues a session only after account connection is valid.
5. Entitlement is resolved separately from account connection.

### Support and Notifications

1. Customer support requests go to Policy Worker with Firebase UID ownership.
2. Admin support actions go through Admin/Policy boundaries.
3. Notifications are linked to real support/system events, not routine activity logs.
4. Attachments require private storage and authorization checks.

### Email Operations

1. Auth Worker enqueues auth email events to Policy Worker through an internal token.
2. Policy Worker queues, locks, retries, records provider ID/events, and purges sensitive OTP payloads.
3. Webhooks must pass provider signature verification and idempotency.
4. Billing and release email categories remain disabled until real committed event sources exist.

### Admin Operations

1. Admin SPA calls Admin Worker/Policy routes.
2. Role and permission checks happen server-side.
3. Sensitive operations require preview, reason, confirmation, idempotency, lock, and audit.
4. `ADMIN_ROLE_ASSIGNMENTS` must be configured with UID-based roles before super-admin acceptance.

### Releases / OTA

1. Admin release management is visible but no real production release is published during this Phase G batch.
2. Desktop installer/OTA architecture is not modified unless a hard stop requires it.

## Current Workflow Defect Closed Locally

- Defect: Email/password signup could provision profile and enter protected account state before Saturn OTP.
- Root cause: frontend signup called `/account/provision`; Auth Worker account/bootstrap endpoints and device linking auto-provisioned profile rows for unverified password identities.
- Local remediation: provider-only signup, OTP metadata handoff, OTP-finalize profile creation, protected account endpoint gate, explicit provision gate, desktop linking gate, default-on email verification feature flag, and no OTP test-code display/storage in production UI.
- Verification: Auth Worker TypeScript and Phase C behavior checks pass; Site Phase B/C/F checks and full build pass; `site/dist` contains no `test_code` or local OTP test-code storage key.
- Deployment/manual status: pending production deployment and Phase G manual inbox acceptance.
