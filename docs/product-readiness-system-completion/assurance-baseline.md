# Phase G Assurance Baseline

Updated: 2026-06-25

Current state: `PHASE_G_PRE_ACCEPTANCE_COMPLETION_ACTIVE`

This baseline defines the proof bar used for Phase G pre-acceptance remediation. It is not a manual acceptance record.

## Evidence Order

1. Production schema and stored data contracts.
2. Live Worker configuration, routes, flags, and deployed versions.
3. GitHub `main`.
4. Canonical local repository at `D:\SaturnWS\github-deploy\SaturnWorkspace`.
5. Applied migration history.
6. Automated tests and contract checks.
7. Living readiness documents.
8. Historical reports and screenshots.

## Required Proof Levels

| Area | Baseline proof |
| --- | --- |
| Public website | Build, copy/encoding scan, direct route checks, rendered route evidence, live bundle check after deployment. |
| Auth and account | Firebase UID ownership, server-side profile/subscription projection, email verification gate, cache isolation, direct-route refresh, logout/account switching checks. |
| Desktop linking | Device code lifecycle, wrong/expired/replayed code, wrong device, session issue/verify/refresh/revoke, no paid entitlement without valid subscription. |
| Subscription truth | Supabase-owned current/history resolution, exact no-subscription semantics, no email/default-row ownership, Admin and Customer projection consistency. |
| Admin operations | Backend authorization, role assignment, preview/execute contracts, idempotency, lock, audit, unauthorized direct API tests. |
| Support and email | Ownership, sender role, queue/lock/retry/final failure, provider IDs/events, webhook verification, suppression, no sensitive payload leakage. |
| Files/storage | Private storage, type/size validation, owner/admin authorization, short-lived access, orphan cleanup. |
| Content and UI | State/title/description/CTA consistency, no implementation narration, Arabic/English, RTL/LTR, loading/empty/error/success variants. |
| Deployment | Local checks, secret scan, Worker deploy evidence, site workflow evidence, live health/protected route smoke where safe. |

## Security Baseline

- Firebase UID is the canonical account identity.
- Email is display/search data only.
- No password, OTP, token, device code, session token, authorization header, or secret value may appear in source, logs, reports, screenshots, or normal API responses.
- Email/password registration must remain pending until Saturn OTP verification succeeds.
- Google registration may finalize directly only when the trusted provider confirms verified email.
- Frontend state is never an authorization or entitlement source.
- Feature flags do not prove operational readiness.
- Missing providers must fail closed with honest disabled/unavailable states.

## Content Baseline

- Every visible sentence must support a decision, action, constraint, result, or recovery.
- Do not repeat facts across headings, badges, descriptions, and CTAs.
- Do not expose implementation details such as source of truth, provider mapping, routes, queues, schemas, or internal operation names to customers.
- Email copy is product UI and follows the same state/content rules as web screens.

## Current Known Limits

- Consolidated manual acceptance has not started.
- `ADMIN_ROLE_ASSIGNMENTS` remains an operational configuration item until a UID-based super administrator secret is configured and verified.
- Real payment-provider integration is not active.
- OTP inbox delivery requires a disposable QA recipient during Phase G manual acceptance; current automated checks prove server-side queue and no-secret behavior, not human inbox receipt.
- Desktop installer acceptance still requires a safe isolated environment or manual Phase G acceptance.
