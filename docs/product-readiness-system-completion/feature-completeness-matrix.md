# Feature Completeness Matrix

Updated: 2026-06-23

Status meanings: `VERIFIED_AUTOMATED`, `PRODUCTION_DEPLOYED`, `PREPARED_DISABLED`, `WAITING_EXTERNAL`, `DEFERRED_TO_G`, `NOT_IMPLEMENTED`.

| Domain | Feature | Status | Evidence / limitation |
| --- | --- | --- | --- |
| Auth | Shared bootstrap and verified Firebase UID identity | `PRODUCTION_DEPLOYED` | Auth Worker and portal contracts; manual route/session acceptance in G. |
| Auth | OTP production delivery | `PRODUCTION_DEPLOYED` | Auth email flag is enabled; sensitive OTP payloads are queued server-side without logging values. |
| Subscription truth | No-subscription projection | `VERIFIED_AUTOMATED` | No default plan or fake expiry; UID ownership only. |
| Subscription truth | Current/history separation | `PRODUCTION_DEPLOYED` | Canonical resolver and Admin projections. |
| Plan catalog | Visible plans without provider checkout | `PRODUCTION_DEPLOYED` | Weekly/monthly/annual plans are visible; checkout disabled until provider mappings exist. |
| Desktop linking | Connection/entitlement separation | `VERIFIED_AUTOMATED` | Phase C tests pass; installed-app acceptance in G. |
| Support | Customer tickets, admin replies, email operations | `PRODUCTION_DEPLOYED` | Phase D automated suite passes. |
| Support | Private attachments | `PRODUCTION_DEPLOYED` | R2 private objects, ownership/admin authorization, projections, and orphan cleanup are implemented. |
| Admin IA | Distinct operational routes | `PRODUCTION_DEPLOYED` | No duplicate Content shell or legacy Policy panel. |
| Users | Search/filter/pagination | `VERIFIED_AUTOMATED` | `account_profiles.firebase_uid` source contract enforced. |
| Users | Detail, sessions, devices, access requests, support | `VERIFIED_AUTOMATED` | Safe projections; no session tokens or device codes. |
| Account lifecycle | Suspend/reactivate/pending deletion | `PRODUCTION_DEPLOYED` | Preview/execute RPCs, locks, audit; hard delete excluded. |
| Account deletion | Request/cancel/cooling-off state | `PREPARED_DISABLED` | Worker/UI implemented; production operation waits for additive Supabase table migration. |
| Account deletion | Irreversible purge | `NOT_IMPLEMENTED` | Requires explicit destructive approval and a separate purge design. |
| Access | Revoke session/device/all account access | `PRODUCTION_DEPLOYED` | Explicit scope and UID ownership. |
| Subscriptions | List/filter/pagination/detail | `VERIFIED_AUTOMATED` | Real subscription rows only. |
| Subscriptions | Explicit lifecycle transitions | `PRODUCTION_DEPLOYED` | Invalid transitions fail closed; arbitrary PATCH removed. |
| Manual grant | User picker, context-aware action, preview, confirm | `VERIFIED_AUTOMATED` | No manual UID input in normal UI; no real customer grant test. |
| Recovery | Evidence-led remaining-time restore | `PRODUCTION_DEPLOYED` | Atomic ledger consumption; replacement-grant evidence producer implemented with legacy fallback. |
| Dashboard | Structured KPIs/activity and partial failure | `VERIFIED_AUTOMATED` | No raw JSON. |
| Audit | Unified bounded Admin read contract | `PRODUCTION_DEPLOYED` | Supabase canonical; R2 bounded fallback. |
| Diagnostics | Crash grouping/state workflow | `PRODUCTION_DEPLOYED` | Safe summaries, statuses, assignee/note. |
| Diagnostics | Tamper visibility/resolution | `PRODUCTION_DEPLOYED` | Explicit resolution note and audit. |
| Policies | Structured policy controls | `PRODUCTION_DEPLOYED` | Two-step confirmation; no live destructive test. |
| Invites | List/create/revoke/usage/restrictions | `PRODUCTION_DEPLOYED` | Hash storage, shown-once code, atomic claims. |
| Releases | Admin review and publish management plane | `VERIFIED_AUTOMATED` | No real artifact or live publish test. |
| Promotions | Structured list/create/state controls | `VERIFIED_AUTOMATED` | No client-authoritative discount; checkout provider absent. |
| Content | Operational CMS | `NOT_IMPLEMENTED` | Route omitted; static versioned content retained. |
| Admin security | Roles and backend permissions | `PRODUCTION_DEPLOYED` | UID role mapping supported; operational secret assignment still required. |
| Readiness | Health/config/integration status | `PRODUCTION_DEPLOYED` | Secret presence only, never values. |
| Payments | Real checkout | `WAITING_EXTERNAL` | Provider and mappings are required. |
| Phase G | Consolidated manual acceptance | `DEFERRED_TO_G` | `PHASE_G_IMPLEMENTATION_COMPLETION_PENDING_CONSOLIDATED_MANUAL_ACCEPTANCE`. |

All Phase B/C/D/F rows retain automated completion pending Phase G manual acceptance. No manual acceptance was requested during implementation.
