# Saturn Workspace System and Workflow Map

Updated: 2026-06-26

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

1. Browser submits display name, email, locale, and terms acceptance to Auth Worker.
2. Auth Worker creates a pending registration and stores only non-sensitive registration metadata plus OTP hash/reference.
3. Auth Worker queues OTP delivery through Policy Worker.
4. Before OTP verification:
   - no Saturn-created Firebase Email/Password identity is created for a new registration,
   - no `account_profiles` row is auto-provisioned,
   - no normal product session or Desktop session can be issued,
   - `/account/subscription`, `/account/identity`, explicit `/account/provision`, and Policy customer boundaries using Auth `/account/identity` fail closed with `EMAIL_VERIFICATION_REQUIRED`.
5. Successful OTP verification returns a one-time finalization token; it still does not create Firebase identity or profile.
6. Browser collects password only after OTP and submits it with the finalization token.
7. Auth Worker uses a dedicated least-privilege Firebase Auth finalizer identity to create or reconcile the Firebase Email/Password identity, creates the canonical finalized `account_profiles` row with `verification_source = saturnws_otp`, submitted display name, locale, terms metadata, and finalization metadata, sets the minimal finalized custom claim, records `credential_epoch`, enables the identity, and requires fresh sign-in.
8. If a provider-only password Firebase identity exists without a finalized Saturn profile, finalization reconciles that same UID after OTP and creates one canonical profile. Google-only collisions fail closed.
9. Customer portal and desktop linking then require dual trust: valid Firebase token, finalized Saturn claim in the token and account custom attributes, canonical finalized profile, UID agreement, lifecycle allowance, and fresh token auth time after credential reconciliation.
10. Stale password-only provider identities without finalized Saturn authority are quarantined/disabled after the configured retention period and can be re-enabled only through legitimate OTP reconciliation.

### Google Registration / Login

1. Browser authenticates with Firebase Google provider.
2. Trusted Google verified email can finalize directly through Auth Worker profile provisioning and server-side claim assignment.
3. Customer and Desktop paths converge on Firebase UID, finalized claim, and `account_profiles`.

### Customer Portal

1. Shared auth listener hydrates Firebase user.
2. Auth adapter calls `/account/subscription`.
3. Profile verification state, finalized claim, lifecycle, and credential epoch gate protected portal content before page data renders.
4. Subscription summary uses `current_subscription` and `subscription_projection`; no plan is invented for no-subscription users.

### Desktop Device Linking

1. Desktop starts device login and receives device/user code.
2. Browser or password-complete flow authorizes the pending device.
3. Auth Worker blocks unverified or unfinalized email/password identities and rejects stale pre-finalization tokens.
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
- Current source remediation: server-side pending registration, OTP-first password collection, server-side Firebase Auth finalization, minimal finalized custom claim, canonical finalized profile metadata, credential-epoch token freshness, legacy password-identity reconciliation, orphan quarantine/disable for stale provider-only password identities, protected account endpoint gate, explicit provision gate, Policy customer boundary inheritance through Auth `/account/identity`, desktop linking gate, default-on email verification feature flag, and no OTP test-code display/storage in production UI.
- Verification: Auth Worker TypeScript and Phase C behavior checks pass for the current source, including the direct raw Firebase password-identity canary; Site Phase B/Round3B/build checks pass from this continuation; `site/dist` contains no direct Firebase signup API token.
- Deployment/manual status: current source is deployed to Auth Worker version `9585559e-36b4-4908-b95f-e9d0347c2b00`, Policy Worker version `7e134762-5c0e-4562-b96a-e48a8984b839`, and GitHub Pages workflow run `28243052664` for commit `c94801250bc11e022eeca3bcccc979924959ae3b`. The dedicated least-privilege Firebase finalizer identity exists, Auth Worker `FIREBASE_SERVICE_ACCOUNT_JSON` and matching `FIREBASE_PROJECT_ID=saturnws-1` are configured, and live pre-OTP canaries pass. Disposable OTP finalization plus direct-signup quarantine canaries remain pending. Identity Platform selective blocking remains future defense-in-depth only: the approved initialize call was rejected with `BILLING_NOT_ENABLED`, the project remains `FIREBASE_AUTH`, no blocking trigger is configured, and this is not a current Phase G deployment prerequisite.
