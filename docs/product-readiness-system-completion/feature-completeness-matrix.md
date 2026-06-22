# Feature Completeness Matrix

Updated: 2026-06-22

Status meanings: `VERIFIED_AUTOMATED`, `PRODUCTION_DEPLOYED`, `WAITING_EXTERNAL`, `DEFERRED_TO_G`, `NOT_IMPLEMENTED`.

| Domain | Feature | Status | Evidence / limitation |
| --- | --- | --- | --- |
| Auth | Shared bootstrap and verified Firebase UID identity | `PRODUCTION_DEPLOYED` | Auth Worker and portal contracts; manual route/session acceptance in G. |
| Auth | OTP production delivery | `WAITING_EXTERNAL` | Core exists; `EMAIL_AUTH_ENABLED=false`. |
| Subscription truth | No-subscription projection | `VERIFIED_AUTOMATED` | No default plan or fake expiry; UID ownership only. |
| Subscription truth | Current/history separation | `PRODUCTION_DEPLOYED` | Canonical resolver and Admin projections. |
| Desktop linking | Connection/entitlement separation | `VERIFIED_AUTOMATED` | Phase C tests pass; installed-app acceptance in G. |
| Support | Customer tickets, admin replies, email operations | `PRODUCTION_DEPLOYED` | Phase D automated suite passes. |
| Support | Attachments | `NOT_IMPLEMENTED` | Intentionally absent from UI. |
| Admin IA | Distinct operational routes | `PRODUCTION_DEPLOYED` | No duplicate Content shell or legacy Policy panel. |
| Users | Search/filter/pagination | `VERIFIED_AUTOMATED` | `account_profiles` source. |
| Users | Detail, sessions, devices, access requests, support | `VERIFIED_AUTOMATED` | Safe projections; no session tokens or device codes. |
| Account lifecycle | Suspend/reactivate/pending deletion | `PRODUCTION_DEPLOYED` | Preview/execute RPCs, locks, audit; hard delete excluded. |
| Access | Revoke session/device/all account access | `PRODUCTION_DEPLOYED` | Explicit scope and UID ownership. |
| Subscriptions | List/filter/pagination/detail | `VERIFIED_AUTOMATED` | Real subscription rows only. |
| Subscriptions | Explicit lifecycle transitions | `PRODUCTION_DEPLOYED` | Invalid transitions fail closed; arbitrary PATCH removed. |
| Manual grant | User picker, context-aware action, preview, confirm | `VERIFIED_AUTOMATED` | No manual UID input in normal UI; no real grant test. |
| Recovery | Evidence-led remaining-time restore | `PRODUCTION_DEPLOYED` | Atomic ledger consumption; live evidence population remains controlled. |
| Dashboard | Structured KPIs/activity and partial failure | `VERIFIED_AUTOMATED` | No raw JSON. |
| Audit | Unified bounded Admin read contract | `PRODUCTION_DEPLOYED` | Supabase canonical; R2 bounded fallback. |
| Diagnostics | Crash grouping/state workflow | `PRODUCTION_DEPLOYED` | Safe summaries, statuses, assignee/note. |
| Diagnostics | Tamper visibility/resolution | `PRODUCTION_DEPLOYED` | Explicit resolution note and audit. |
| Policies | Structured policy controls | `PRODUCTION_DEPLOYED` | Two-step confirmation; no live destructive test. |
| Invites | List/create/revoke/usage/restrictions | `PRODUCTION_DEPLOYED` | Hash storage, shown-once code, atomic claims. |
| Releases | Admin review and publish management plane | `VERIFIED_AUTOMATED` | No real artifact or live publish test. |
| Promotions | Structured list/create/state controls | `VERIFIED_AUTOMATED` | No client-authoritative discount; checkout provider absent. |
| Content | Operational CMS | `NOT_IMPLEMENTED` | Route omitted; static versioned content retained. |
| Admin security | Roles and backend permissions | `PRODUCTION_DEPLOYED` | Role mapping secret/config still requires operational assignment. |
| Readiness | Health/config/integration status | `PRODUCTION_DEPLOYED` | Secret presence only, never values. |
| Payments | Real checkout | `WAITING_EXTERNAL` | Provider and mappings are required. |
| Phase G | Consolidated manual acceptance | `DEFERRED_TO_G` | `PHASE_G_READY_FOR_CONSOLIDATED_ACCEPTANCE`. |

All Phase B rows retain `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`. Phase C and Phase D are closed after automated verification. Phase F is closed after automated verification. No manual acceptance was requested during implementation.
