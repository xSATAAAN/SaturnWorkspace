# Feature Completeness Matrix

Updated: 2026-06-25

Status meanings: `VERIFIED_AUTOMATED`, `PRODUCTION_DEPLOYED`, `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE`, `DEPLOYED_PENDING_SAFE_EVENT_VERIFICATION`, `OPERATIONAL_CONFIGURATION_REQUIRED`, `WAITING_EXTERNAL`, `PREPARED_DISABLED`, `PREPARED_DISABLED_WITH_PRODUCER`, `PARTIALLY_IMPLEMENTED`, `PENDING_DEPLOYMENT_VERIFICATION`, `NOT_IMPLEMENTED`, `DEFERRED_TO_PHASE_G_MANUAL_ACCEPTANCE`, `QA_ARTIFACT_BUILT_PENDING_MANUAL_ACCEPTANCE`.

| Domain | Feature | Status | Evidence / limitation |
| --- | --- | --- | --- |
| Auth | Shared bootstrap and verified Firebase UID identity | `PENDING_DEPLOYMENT_VERIFICATION` | Current source now gates unverified email/password users before protected portal rendering and uses profile source for display name. Local Site/Auth checks pass; deployment verification is pending for this remediation batch. |
| Auth | OTP request/queue/hash/purge contract | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Current production source makes email/password signup provider-only until OTP, stores only hashed OTP plus non-sensitive registration metadata, and finalizes the same Firebase UID profile on OTP. Auth/Site checks pass; Auth Worker version `f068253f-4a8b-492f-babc-5f2adfdf6cba` and Pages run `28165825916` are deployed; provider inbox acceptance still needs QA recipient. |
| Auth | Email/password pre-OTP protected-access block | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Auth Worker tests prove no profile, no account subscription/identity access, no explicit provision, and no Desktop session before OTP; verified profile/session after OTP. Deployed live contract checks passed for health, auth routes, CORS, and stable unauthenticated errors; disposable credentialed QA verification remains pending. |
| Auth | OTP no-secret exposure | `VERIFIED_AUTOMATED` | Tests and source checks assert no OTP in normal API response/log/admin queue projection. Site production bundle scan confirms no OTP test-code display/storage token remains in `dist`. |
| Subscription truth | No-subscription projection | `VERIFIED_AUTOMATED` | No default plan or fake expiry; UID ownership only. |
| Subscription truth | Current/history separation | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Canonical resolver and Admin projections are implemented. |
| Plan catalog | Visible plans without provider checkout | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Weekly/monthly/annual plans remain visible while checkout is disabled until provider mappings exist. Public pricing copy/cards are deployed; live bundle, public catalog CORS, and public rendered screenshot verification passed for the public-route scope. |
| Payments | Real checkout | `WAITING_EXTERNAL` | Provider, plan mappings, webhook source, rollback, and billing email contracts are required before enablement. |
| Desktop linking | Connection/entitlement separation | `VERIFIED_AUTOMATED` | Phase C cross-layer and Auth Worker tests pass; installed-app acceptance remains Phase G. |
| Support | Customer tickets, admin replies, email operations | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Phase D automated suite passes. |
| Support | Private attachments | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | R2 private objects, ownership/admin authorization, projections, and orphan cleanup are implemented. Production fixture acceptance remains Phase G. |
| Admin IA | Distinct operational routes | `PRODUCTION_DEPLOYED` | No duplicate Content shell or legacy Policy panel. |
| Users | Search/filter/pagination | `VERIFIED_AUTOMATED` | `account_profiles.firebase_uid` source contract enforced. |
| Users | Detail, sessions, devices, access requests, support | `VERIFIED_AUTOMATED` | Safe projections; no session tokens or device codes. |
| Account lifecycle | Suspend/reactivate/pending deletion | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Preview/execute contracts, locks, audit; hard delete excluded. |
| Account deletion | Request/cancel/cooling-off state | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Supabase migration applied; non-destructive request/cancel is operational. Disposable QA acceptance remains Phase G. |
| Account deletion | Irreversible purge | `NOT_IMPLEMENTED` | Requires explicit destructive approval and separate purge design. |
| Access | Revoke session/device/all account access | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Explicit scope and UID ownership. |
| Subscriptions | List/filter/pagination/detail | `VERIFIED_AUTOMATED` | Real subscription rows only. |
| Subscriptions | Explicit lifecycle transitions | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Invalid transitions fail closed; arbitrary PATCH removed. |
| Manual grant | User picker, context-aware action, preview, confirm | `VERIFIED_AUTOMATED` | No manual UID input in normal UI; no real customer grant test. |
| Recovery | Evidence-led remaining-time restore | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Enriched schema applied; replacement-grant producer covered by automated checks without real grant. |
| Dashboard | Structured KPIs/activity and partial failure | `VERIFIED_AUTOMATED` | No raw JSON. |
| Audit | Unified bounded Admin read contract | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Supabase canonical; R2 bounded fallback. |
| Diagnostics | Crash grouping/state workflow | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Safe summaries, statuses, assignee/note. |
| Diagnostics | Tamper visibility/resolution | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Explicit resolution note and audit. |
| Policies | Structured policy controls | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Two-step confirmation; no live destructive test. |
| Invites | List/create/revoke/usage/restrictions | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Hash storage, shown-once code, atomic claims. |
| Releases | Admin review and publish management plane | `VERIFIED_AUTOMATED` | No real artifact or live publish test. |
| Promotions | Structured list/create/state controls | `VERIFIED_AUTOMATED` | No client-authoritative discount; checkout provider absent. |
| Content | Operational CMS | `NOT_IMPLEMENTED` | Route omitted; static versioned content retained. |
| Admin security | UID role assignments and backend permissions | `OPERATIONAL_CONFIGURATION_REQUIRED` | Code supports `super_admin`, `support`, `billing`, `release_manager`, `security_auditor`, and `read_only`; Worker secret is not configured. |
| Email | Auth messages | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | `auth.email_verification` and resend are linked; QA delivery acceptance remains. |
| Email | Support messages | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Ticket confirmation, admin reply, and status change are linked; internal notes do not send email. |
| Email | Billing messages | `PREPARED_DISABLED` | Disabled because no payment provider or committed payment event exists. |
| Email | Release messages | `PREPARED_DISABLED` | Disabled until a real production release publication event exists. |
| Email | Security messages | `DEPLOYED_PENDING_SAFE_EVENT_VERIFICATION` | Source producers exist for selected committed account/session events, `EMAIL_SECURITY_ENABLED=true` is deployed on Auth/Admin/Policy, and lifecycle/idempotency/no-secret tests pass. No real lifecycle mutation was executed for verification. |
| Email | Admin alert: email queue final failure | `DEPLOYED_PENDING_SAFE_EVENT_VERIFICATION` | Source producer exists with deterministic idempotency and loop prevention. `EMAIL_ADMIN_ALERTS_ENABLED=true` is deployed on Policy, the recipient secret is configured, and local alert tests pass. No false production incident was generated. |
| Email | Other admin alert families | `DEPLOYED_PENDING_SAFE_EVENT_VERIFICATION` | Source producers cover webhook verification failure, cleanup failure, storage configuration failure, schema mismatch, readiness degradation, and high-severity tamper signals. Policy flag and recipient secret are deployed; safe alert-delivery verification is pending. |
| Encoding | Arabic UTF-8 integrity | `VERIFIED_AUTOMATED` | Supabase plan data repaired; repository and email guards pass. |
| Desktop distribution | Phase G QA Setup | `QA_ARTIFACT_BUILT_PENDING_MANUAL_ACCEPTANCE` | Built from `D:\SaturnWS\desktop-app` without changing `APP_VERSION`; artifact `D:\SaturnWS\build-output\phase-g-qa-installed-channel-20260624-131944\setup\SaturnWorkspace-Setup-1.0.7-beta-phase-g-qa.exe`; SHA256 `527C21D6A87720DB31E0EC4A8F59EA6FF2299C928C1B83447E2AC1E6AAA45DDD`; not published. |
| Phase G | Consolidated manual acceptance | `DEFERRED_TO_PHASE_G_MANUAL_ACCEPTANCE` | Manual acceptance has not started. |

No row may be upgraded to full manual acceptance before Phase G consolidated acceptance evidence exists.
