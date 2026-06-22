# Current Issues and Phase Ownership

Updated: 2026-06-22

## Phase closure

- Phase B: `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.
- Phase C: `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.
- Phase C and Phase D are closed after automated verification; manual acceptance is consolidated in Phase G.
- Phase E: `COMPLETE_EXCEPT_WAITING_EXTERNAL_INTEGRATION`.
- Phase F: `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`.
- Phase G: `PHASE_G_READY_FOR_CONSOLIDATED_ACCEPTANCE`.
- No B.3/B.4, F.1/F.2, or additional dependency gate exists.

## Current tracked items

| ID | Item | Type | Current state | Owner |
| --- | --- | --- | --- | --- |
| PR-001 | Real checkout provider and provider plan mappings | External integration | Backend catalog is authoritative; checkout fails closed until configured. | External / G |
| PR-002 | OTP production email delivery | Feature flag | Prepared but disabled; `EMAIL_AUTH_ENABLED=false`. | G / later rollout |
| PR-003 | Support attachments | Not implemented | No backend storage contract and no UI promise. | Product decision |
| PR-004 | Administrator role assignments | Configuration | Backend RBAC is active; absent `ADMIN_ROLE_ASSIGNMENTS` keeps allowlisted admins in compatibility `super_admin`. | Operations / G |
| PR-005 | Recovery evidence population | Integration contract | Ledger and atomic recovery are implemented; evidence producers must be approved before live recovery. | Product / G |
| PR-006 | Irreversible account deletion | Destructive operation | Only suspend, reactivate, pending-deletion, and access revocation exist. | Explicit future approval |
| PR-007 | Legal/public content changes | Legal decision | Content remains static and versioned. | Legal approval |
| PR-008 | Frontend main chunk above 500 kB | Performance debt | Build passes with a Vite warning; code splitting is recommended after acceptance. | Post-G optimization |

## Resolved systemic defects

| Defect | Resolution |
| --- | --- |
| New user displayed as `monthly` | Canonical resolver now returns exact no-subscription state and ignores email-only legacy rows for ownership. |
| Users and subscriptions shared one Admin surface | Separate routes and data sources now exist. |
| Generic subscription PATCH | Removed with `410 explicit_subscription_operation_required`; explicit state transitions replace it. |
| Admin actions lacked deterministic preview/idempotency | Operation requests, preview hashes, request IDs, locks, transition validation, and audit are implemented. |
| Crash data exposed broad payloads | Admin projections redact sensitive fields and limit stack summaries. |
| Invite one-per-user/device race | Atomic D1 claims and conditional consumption prevent concurrent reuse. |
| Policy Controls legacy panel | The structured Policies route is the only production control surface. |
| Coverage shell | Readiness now reads real health/config state without secret values. |

## Phase G only

Phase G owns consolidated manual acceptance for B/C/D/F and the automated parts of E. It must not perform real payment, real subscription grant, production release publication, live kill-switch activation, or irreversible deletion unless a separate explicit approval is provided.
