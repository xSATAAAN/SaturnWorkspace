# Current Issues and Phase Ownership

Updated: 2026-06-23

## Phase closure

- Phase B: `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.
- Phase C: `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.
- Phase D: `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.
- Phase E: `COMPLETE_EXCEPT_WAITING_EXTERNAL_INTEGRATION`.
- Phase F: `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.
- Phase G: `PHASE_G_IMPLEMENTATION_COMPLETION_PENDING_CONSOLIDATED_MANUAL_ACCEPTANCE`.
- No B.3/B.4, F.1/F.2, G.1, or additional dependency gate exists.

## Current tracked items

| ID | Item | Type | Current state | Owner |
| --- | --- | --- | --- | --- |
| PR-001 | Real checkout provider and provider plan mappings | External integration | Backend catalog is authoritative; checkout fails closed until configured. | External / G |
| PR-002 | OTP production email delivery | Operational rollout | Implemented and feature-flag enabled; manual acceptance remains Phase G. | G acceptance |
| PR-003 | Support attachments | Implemented | Private R2 storage, authorization, projections, admin proxy, orphan cleanup, and tests are in place. | G acceptance |
| PR-004 | Administrator role assignments | Configuration | Backend RBAC supports UID assignments; `ADMIN_ROLE_ASSIGNMENTS` is not visible in current secret list and must be configured operationally. | Operations / G |
| PR-005 | Recovery evidence population | Integration contract | Replacement manual grants produce recovery evidence. Enriched fields require the additive Phase G Supabase migration; legacy ledger fallback remains safe. | G / migration channel |
| PR-006 | Safe account deletion requests | Prepared disabled | Non-destructive request/cancel flow is implemented. Production operation waits for the additive `account_deletion_requests` Supabase migration. | G / migration channel |
| PR-007 | Irreversible account deletion | Destructive operation | Not implemented and not approved. Only request/cancel/cooling-off state exists. | Explicit future approval |
| PR-008 | Legal/public content changes | Legal decision | Content remains static and versioned. | Legal approval |
| PR-009 | Frontend main chunk above 500 kB | Performance debt | Build passes with a Vite warning; code splitting is recommended after acceptance. | Post-G optimization |

## Resolved systemic defects

| Defect | Resolution |
| --- | --- |
| New user displayed as `monthly` | Canonical resolver returns exact no-subscription state and ignores email-only legacy rows for ownership. |
| Admin Users referenced nonexistent `account_profiles.firebase_user_id` | Admin queries now use `firebase_uid`; schema-contract test prevents regression. |
| Payment-provider absence hid valid plans | Plan visibility, activity, purchase readiness, provider readiness, and checkout enablement are separate states. |
| Users and subscriptions shared one Admin surface | Separate routes and data sources now exist. |
| Generic subscription PATCH | Removed with `410 explicit_subscription_operation_required`; explicit state transitions replace it. |
| Admin actions lacked deterministic preview/idempotency | Operation requests, preview hashes, request IDs, locks, transition validation, and audit are implemented. |
| Crash data exposed broad payloads | Admin projections redact sensitive fields and limit stack summaries. |
| Invite one-per-user/device race | Atomic D1 claims and conditional consumption prevent concurrent reuse. |
| Policy Controls legacy panel | The structured Policies route is the production control surface. |
| Coverage shell | Readiness reads real health/config state without secret values. |

## Phase G only

Phase G owns consolidated manual acceptance for B/C/D/F and the automated parts of E. It must not perform real payment, real subscription grant, production release publication, live kill-switch activation, or irreversible deletion unless a separate explicit approval is provided.
