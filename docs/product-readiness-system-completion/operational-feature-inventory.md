# Operational Feature Inventory

Updated: 2026-06-25

Status: `PHASE_G_PRE_ACCEPTANCE_COMPLETION_ACTIVE`

This inventory classifies visible or callable product capabilities by operational state. It is not consolidated manual acceptance; manual acceptance remains deferred to Phase G.

## State Legend

- `FULLY_OPERATIONAL_ENABLED`: source and backend contract exist, automated checks pass, and the feature is intended to be available.
- `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE`: source, build, deployment, and production-safe automated/live checks pass for the stated scope, but consolidated Phase G manual acceptance has not started.
- `COMPLETE_EXTERNALLY_BLOCKED`: implementation is present but a real external provider, recipient, or operational secret is required before enablement.
- `INTENTIONALLY_HIDDEN_OR_REMOVED`: not presented as a callable production capability.
- `DESTRUCTIVE_APPROVAL_GATED`: implementation or UI is gated because executing it would publish, force, delete, grant, recover, or otherwise mutate production state materially.

## Inventory

| Surface | Capability group | Frontend handler / route | Backend route / worker | Storage | Permission | Required flag/config | Current production state | Automated evidence | Manual acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public | Landing, product, FAQ, contact, legal, downloads shell | `site/src/new-ui/pages/production/ProductionPages.tsx` | Static site / Admin download catalog for downloads | Static / release metadata | Public | Firebase public config for runtime boot | `FULLY_OPERATIONAL_ENABLED` except protected downloads require entitlement | `site npm run build`, `test:phase-b1` | Phase G |
| Public | Pricing display | `/pricing`, `PricingSection` | `GET /api/plans/catalog` on Admin Worker | Supabase `commercial_plans` | Public read | Payment provider not required for display | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE`; checkout remains disabled | Admin Phase E catalog tests, public catalog CORS smoke, live bundle scan, pricing fixture, live public screenshots, 2026-06-25 pricing IA evidence | Phase G |
| Public | Checkout action | `CheckoutDialog` / `createPaymentIntent` | `POST /api/payments/create` | Supabase orders/payments | Authenticated customer | Real payment provider and mappings | `COMPLETE_EXTERNALLY_BLOCKED` | Admin order tests fail closed when provider unavailable | Phase G after provider |
| Auth | Email/password and Google sign-in | `/account/signin`, `/account/signup` | Firebase + Auth Worker account APIs | Firebase, Supabase account profile | Customer | Firebase public config, Auth Worker secrets | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Site Phase C, Auth Phase C, Phase G pending-registration checks | Phase G |
| Auth | Email verification OTP | Auth production adapter | Auth Worker -> Policy service-binding email enqueue | Supabase OTP hash, D1 email queue | Customer | `EMAIL_AUTH_ENABLED=true`, email secrets, QA recipient for acceptance | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE`; provider inbox acceptance pending | Policy Phase D/G, Auth Phase C, live enqueue request returned sent | Phase G |
| Account | Account overview and subscription projection | `/account`, `/account/subscription` | `POST https://auth.saturnws.com/account/subscription` | Supabase `account_subscriptions` | UID owner | Firebase token | `FULLY_OPERATIONAL_ENABLED` | Site Phase C, Admin resolver tests | Phase G |
| Account | Desktop sessions/devices | `/account/devices` | Auth Worker `/account/sessions`, `/account/sessions/revoke`, `/account/sessions/revoke-all` | Supabase desktop sessions/devices | UID owner | Firebase token | `FULLY_OPERATIONAL_ENABLED` | Auth Phase C | Phase G |
| Account | Account deletion request/cancel | `/account/settings` | Auth Worker `/account/deletion/*` | Supabase `account_deletion_requests` | UID owner, recent auth where required | Applied Phase G migrations | `DESTRUCTIVE_APPROVAL_GATED`; request/cancel implemented, purge absent | Auth Phase C, migration postflight | Disposable QA only |
| Account | Support tickets, replies, status, notifications | `/account/support`, `/account/notifications` | Policy `/v1/web/support/*`, `/v1/web/notifications/*` | D1 support/notifications, private R2 attachments | UID owner | Policy support flags and R2 binding | `FULLY_OPERATIONAL_ENABLED` | Policy Phase D/G | Phase G |
| Account | Support attachments | Support adapter upload/download/remove | Policy `/v1/web/support/attachments*` | Private R2, D1 metadata | UID owner or admin proxy | R2 binding | `FULLY_OPERATIONAL_ENABLED` | Policy Phase D attachment tests | Phase G |
| Account | Protected downloads | `/account/downloads` | Admin Worker `/api/account/downloads/*` | Release metadata/R2 | Entitled UID owner | Current entitlement | `FULLY_OPERATIONAL_ENABLED` for entitled users; no-subscription denied | Admin download tests | Phase G |
| Admin | Preauth, Firebase admin session, RBAC | Admin production shell | Admin Worker `/api/admin/preauth/*`, `/api/admin/session` | Cookies, admin role config | Admin | `ADMIN_ROLE_ASSIGNMENTS` for role granularity | `COMPLETE_EXTERNALLY_BLOCKED` for multi-role assignment; super-admin compatibility remains | Admin Phase F RBAC tests | Phase G after secret |
| Admin | Dashboard, users, subscriptions, manual grant | Admin pages | `/api/admin/dashboard`, `/api/admin/users*`, `/api/admin/subscriptions*`, manual grant routes | Supabase | Admin role | Admin auth | `FULLY_OPERATIONAL_ENABLED`; no real customer grant executed | Admin Phase B2/E/F/G | Phase G |
| Admin | Account lifecycle and access operations | Admin user detail drawers | `/api/admin/users/:id/lifecycle/*`, `/access/*` | Supabase, Auth sessions | Admin role | Admin auth | `FULLY_OPERATIONAL_ENABLED`; destructive impacts require preview/confirm | Admin Phase F | Phase G |
| Admin | Recovery evidence | Admin subscriptions | `/api/admin/subscriptions/recovery-evidence` and recovery flow | Supabase recovery ledger | Admin role | Applied Phase G migrations | `DESTRUCTIVE_APPROVAL_GATED`; evidence path implemented, no real recovery executed | Admin Phase G, migration postflight | Phase G fixture |
| Admin | Support and communications | `/communications`, `/support` | Admin Worker proxy to Policy `/v1/admin/support*`, `/v1/admin/email*` | D1 support/email queue/events | Admin role | Policy email flags/secrets | `FULLY_OPERATIONAL_ENABLED` for support/email operations already enabled; QA delivery pending | Policy Phase D/G | Phase G |
| Admin | Email admin test/retry/process | Communications | Policy `/v1/admin/email/test`, `/retry`, `/process`, `/status` | D1 email jobs/events | Admin role | Email secrets and category flags | `FULLY_OPERATIONAL_ENABLED` for auth/support/admin-test paths | Policy Phase D/G | Phase G |
| Admin | Security email producers | Auth/Admin lifecycle/session operations | Auth/Admin producers -> Policy internal enqueue | D1 email jobs/events | Event owner/admin | `EMAIL_SECURITY_ENABLED`, enqueue token | `DEPLOYED_PENDING_SAFE_EVENT_VERIFICATION`; flags and enqueue secrets deployed, no real lifecycle mutation executed | Auth/Admin/Policy checks | Phase G |
| Admin | Admin alert producer: email queue final failure | Policy scheduler/outbox | Policy internal enqueue to `admin.email_queue_final_failure` | D1 email jobs/events | System/admin recipient | `EMAIL_ADMIN_ALERTS_ENABLED`, `EMAIL_ADMIN_ALERT_RECIPIENTS` | `DEPLOYED_PENDING_SAFE_EVENT_VERIFICATION`; flag and recipient secret deployed, no false incident generated | Policy Phase G alert checks | Phase G |
| Admin | Admin alert producers: webhook, cleanup, storage, schema, readiness, tamper | Policy webhook verifier, scheduler, cleanup, status diagnostics | Policy internal enqueue to `admin.webhook_repeated_failure`, `admin.email_cleanup_failure`, `admin.storage_config_failure`, `admin.schema_mismatch`, `admin.readiness_degraded`, `admin.tamper_detected` | D1 email jobs/events | System/admin recipient | `EMAIL_ADMIN_ALERTS_ENABLED`, `EMAIL_ADMIN_ALERT_RECIPIENTS` | `DEPLOYED_PENDING_SAFE_EVENT_VERIFICATION`; flag and recipient secret deployed, no false incident generated | Policy Phase G alert checks | Phase G |
| Admin | Diagnostics and tamper resolution | Admin diagnostics | `/api/admin/crash-*`, `/api/admin/tamper-alerts*` | Supabase/R2 fallback | Admin role | Admin auth | `FULLY_OPERATIONAL_ENABLED` | Admin Phase F | Phase G |
| Admin | Policy, invite, release, promotions management | Admin policy/release/commerce pages | Admin/Policy routes | Supabase, D1, R2 | Admin role | Admin auth | `FULLY_OPERATIONAL_ENABLED` for previews/metadata; live publish/force/kill actions are gated | Admin/Policy Phase F/G | Phase G |
| Admin | Live release publish, forced update, kill switch | Admin confirmation modals | Admin/Policy update routes | R2/D1/Supabase | Admin role | Explicit user approval | `DESTRUCTIVE_APPROVAL_GATED` | Review-step tests | Separate approval |
| System | Invite validation | Signup/device unlock flows | Policy `/v1/invite/validate` | D1 invite codes/audit | Public with policy checks | D1 binding | `FULLY_OPERATIONAL_ENABLED` | Policy Phase F | Phase G |
| System | Crash ingest / OTA manifest / update downloads | Desktop/Admin Worker routes | Admin Worker crash/update routes | Supabase/R2 | Desktop/admin | Existing config | `FULLY_OPERATIONAL_ENABLED` for existing contracts; no live OTA publication in this batch | Admin Phase F | Phase G |
| Desktop | QA setup artifact | External desktop source | Existing build output only | Local artifact | QA only | No rebuild requested | `DESTRUCTIVE_APPROVAL_GATED` for publishing; local QA artifact recorded | Reproducibility manifest | Phase G manual |

## Findings From This Continuation

- Public pricing had a production-risk CORS dependency: live `admin-api.saturnws.com` allowed only the Admin origin. Source now includes Saturn public origins in the Admin Worker CORS allowlist, and production-safe verification confirmed the public origin is allowed.
- Public Arabic pricing previously trusted raw backend `features` text. Public pricing now uses localized plan differentiators from the content layer while keeping backend catalog as price/status truth.
- Live pricing later showed redundant information architecture even after price/content source correction. Current pricing IA now states the shared full-tool truth once, places trial terms only inside Monthly/Annual cards, removes the large unavailable banner, and records current live evidence under `D:\SaturnWS\build-output\phase-g-live-render`.
- Email verification later showed an incorrect generic editable email form and OTP delivery failure. Current implementation binds verification to pending registration state, supersedes old requests on Change email, and uses the Auth Worker `POLICY_SERVICE` binding for queue handoff.
- Tablet public header overflow at 768px was caused by the secondary header CTA. A responsive header rule removes that CTA before it can create horizontal scroll.
- Live Contact mobile overflow was found during public rendered evidence capture. The page-specific contact grid overrode the generic mobile one-column rule, and long contact email links lacked defensive wrapping. `site/src/new-ui/foundation/public.css` now fixes both conditions, and recaptured live screenshots report zero horizontal overflow.

## Explicit Non-Operational Items

- Real checkout, billing emails, invoices, refunds, and payment webhooks remain externally blocked.
- Irreversible account purge is not implemented.
- Real production release publication, forced update, and kill switch activation require explicit approval.
- Multi-role admin acceptance still requires `ADMIN_ROLE_ASSIGNMENTS` configuration; security/admin-alert email rollout is deployed and now needs safe event-delivery verification.
