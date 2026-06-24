# Saturn Workspace Engineering Instructions

These instructions govern all work inside the Saturn Workspace repository.

They are project-level instructions and override more general Codex instructions when a rule here is more specific.

The objective is not to satisfy the literal wording of one request with the smallest patch. The objective is to leave the affected Saturn Workspace system coherent, secure, complete, maintainable, testable, and production-ready.

## 1. Canonical Workspace

The canonical working repository is:

`D:\SaturnWS\github-deploy\SaturnWorkspace`

Do not use `D:\SaturnWS\web-platform` as a source of truth. It may contain stale or unsynchronized files.

- Begin from the canonical Git repository.
- Verify the current branch, local HEAD, remote `main`, and working-tree state.
- Do not copy stale directories over the canonical repository.
- Do not run `git init` in unrelated directories.
- Do not force-push.
- Do not commit backups, generated credentials, `.env` files, database dumps, private ledgers, secrets, or QA user credentials.
- Confirm that the commit being reported is the commit actually deployed.
- Confirm that the live frontend bundle corresponds to the intended commit.

When local source, GitHub, production configuration, and reports disagree, investigate and reconcile them before claiming completion.

## 2. Evidence Precedence

Use this evidence order when resolving conflicts:

1. Current production schema and stored data contracts.
2. Current live Worker configuration, routes, flags, and deployed versions.
3. Current GitHub `main`.
4. Current canonical local working tree.
5. Applied migration history.
6. Automated test evidence.
7. Current living project reports.
8. Historical reports and old screenshots.

A report is not more authoritative than the production system it describes. Do not rely on HTTP 200 alone, a build alone, a deployment workflow alone, a visible UI alone, mock-only tests, source file presence, a migration file that was not applied, or a route that production UI does not use.

## 3. Roadmap and Execution Model

Saturn Workspace uses only these major phases: Phase A, Phase B, Phase C, Phase D, Phase E, Phase F, and Phase G.

Do not invent B.3, B.4, C.1, F.1, G.1, micro-phases, or manual approval gates after every workstream. Work batches may be described internally, but must not become roadmap phases.

Execution should continue automatically inside the current phase until the applicable work is complete or a real hard stop is reached. Manual product acceptance is consolidated in Phase G. If Phase G begins and implementation gaps or production defects are found, keep Phase G in a pre-acceptance implementation/remediation state until the required systems are complete.

## 4. Complete-System Standard

Do not interpret a feature request as a request for one button, page, endpoint, field, migration, or isolated patch. Treat every requested feature as a complete product system.

Evaluate all applicable layers: user entry points, frontend, backend, API contracts, database schema, migrations, state models, source of truth, authentication, authorization, ownership, validation, loading, empty states, partial states, success, errors, recovery, retry, idempotency, concurrency, notifications, email, files/storage, admin operations, audit, observability, security, tests, deployment, rollback, production verification, content quality, accessibility, and responsive behavior.

Use explicit completion states such as `VERIFIED_AUTOMATED`, `PRODUCTION_DEPLOYED`, `PENDING_MANUAL_ACCEPTANCE`, `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED`, `PARTIALLY_IMPLEMENTED`, `UI_ONLY`, `BACKEND_ONLY`, `WAITING_EXTERNAL_INTEGRATION`, `OPERATIONAL_CONFIGURATION_REQUIRED`, `PREPARED_DISABLED`, `NOT_IMPLEMENTED`, `DEPRECATED`, and `BROKEN`. Never use `COMPLETE_AND_VERIFIED` before full production and manual acceptance evidence exists.

## 5. Root-Cause Discipline

A visible problem is evidence of a deeper system defect until proven otherwise. Do not fix only the exact symptom reported.

For every defect, inspect the visible symptom, real source of displayed state, state model, data source, API contract, schema assumptions, cache/projection behavior, similar code paths, why tests missed it, and what shared prevention should be added.

Prefer systemic correction and regression prevention over isolated patching.

## 6. Orthogonal State Modeling

Do not overload one Boolean or enum with several independent concepts.

Important state dimensions must remain separate:

- Account: authentication state, verification state, profile state, lifecycle, and session state.
- Desktop: account connection, session validity, entitlement, network availability, and device policy state.
- Subscription: existence, lifecycle, plan term, renewal behavior, entitlement result, payment state, and integrity state.
- Plan catalog: visible, active, purchasable, provider-ready, and checkout-available. A plan may be visible while purchase is unavailable.
- Support: ticket lifecycle, sender role, read state, delivery channel, email delivery status, and attachment state.
- Email: event source, queue state, delivery state, provider event, suppression state, and sensitive-payload state.

State calculation must be centralized. Do not let several frontend pages independently infer the same business state.

## 7. Source-of-Truth Rules

Every domain must have one explicit authoritative source. Every copy must be documented as a projection, cache, read model, policy override, historical record, provider record, or audit record.

Current durable rules:

- Firebase UID is the canonical account identity.
- Email is display and search data, not account ownership.
- Supabase/Postgres `account_subscriptions` is the legal subscription source.
- Auth Worker is the server boundary for account/subscription projection.
- Policy D1 may hold policy projections or caches, but is not independent billing truth.
- `account_profiles` represents accounts; subscription rows do not represent users.
- Frontend state is never authorization or entitlement truth.
- Default database row order is never a valid current-record selector.
- Email-only legacy rows must not silently grant entitlement.
- Multiple usable current records must fail closed as an integrity conflict.
- Manual grants are not payments, orders, invoices, or provider transactions.

Do not create bidirectional synchronization between two authoritative stores.

## 8. Schema and API Contract Discipline

Never assume a database column, enum, function, view, RPC, route, or response field exists because a mock contains it.

Before implementing a production query, inspect the live schema, applied migrations, column names/types, constraints, indexes, grants, RLS, nullable/default behavior, production row shapes, and legacy compatibility requirements.

Add schema-contract tests for critical production queries. Tests must fail when source code references a nonexistent column, RPC, enum, outdated field, or incompatible response contract. Mocks and fixtures must derive from or be checked against the real schema contract.

Centralize API contracts. Sensitive state transitions must use explicit operations with validated transitions, not arbitrary generic PATCH endpoints.

## 9. State-Aware Content Design

User-facing content is part of feature correctness. A grammatically correct sentence can still be a product bug if it contradicts the current state or available action.

Every rendered text element must be evaluated against current state, available action, user role, user intent, relevant constraint, and next useful step.

Page title, card title, status label, supporting description, CTA, disabled state, error state, and available options must never contradict one another.

Supporting copy is optional. No text is better than filler, repetition, generic marketing language, contradictory guidance, explanation of obvious state, unavailable-action copy, or implementation narration.

Review content separately for normal, loading, empty, unavailable, disabled, partial, permission denied, error, and success states.

Do not expose source of truth, Supabase write, Firebase UID required, provider mapping, backend integration, operation mode, raw enum names, raw error objects, internal route names, or implementation details to end users.

Copy-quality automation should include state fixtures, component snapshots for major states, status/description/CTA consistency assertions, Arabic and English cases, source scanning, production-dist scanning, Mojibake checks, raw-enum checks, and implementation-vocabulary checks.

## Saturn Product Language

Use `Saturn Workspace`, `الأداة`, or `أداة Saturn Workspace` naturally according to sentence context. Do not mechanically translate the product name to `مساحة العمل`.

Use `مساحة العمل` only when the actual concept is a workspace, work area, or workspace category. It must not appear as a repeated substitute for the product name.

Arabic copy must be natural, contemporary, and task-oriented. Avoid literal translation, repeated product-name insertion, excessive reassurance, and AI-style filler.

Pricing content must help the user compare plans: price, billing period, original/current price where relevant, savings, trial terms, renewal behavior, availability, and real differentiators. Shared identical facts should appear once globally, not repeated in every plan card.

Provider/backend/payment readiness is not customer-facing narration. Plans may remain visible while checkout is unavailable, but unavailable actions must use honest disabled states and copy that does not imply payment can be completed now.

## 10. Encoding Integrity

UTF-8 is mandatory end-to-end.

Mojibake is a release-blocking content defect. A visible corrupted string triggers investigation of source files, storage, transport, build output, frontend rendering, Worker responses, API serialization, email MIME output, and database round trip.

Do not patch individual strings without correcting the encoding boundary. Determine whether corruption first occurs in source, storage, transport, decoding, build output, or rendered output.

Source, generated build, database round trip, Worker/API JSON, and email HTML/plain text require automated encoding checks. Checks must scan for known UTF-8, Latin-1, Windows-1252, double-encoding, HTML-escaped, and replacement-character signatures in user-visible content without placing corrupted examples in ordinary product copy.

If corrupted values are stored in Supabase or D1, run a read-only inventory first, repair only deterministic recoverable values, back up or migration-track the change, do not guess unknown original content, and record preflight/postflight evidence.

## 11. Design System and UX Consistency

Implement reusable patterns through shared components and tokens for buttons, inputs, selects, tables, filters, pagination, drawers, modals, confirmations, danger zones, cards, tabs, alerts, toasts, tooltips, empty/error/loading states, message roles, navigation, typography, spacing, focus, motion, and color semantics.

Do not solve the same visual pattern independently on every page. Skeletons must reflect final layout and must not introduce skeleton-only copy or layout shifts. Administrative UI must meet the same quality standard as customer UI.

## 12. Authentication, Sessions, and Cache

Use one shared auth bootstrap per application. Do not allow header signed in while page is signed out, premature auth redirect before Firebase hydration, direct routes behaving differently from navigation, visiting another page to initialize a session, cache from one user appearing for another, subscription state determining account connection, or uncontrolled token refresh loops.

Do not log Firebase tokens, session tokens, passwords, device codes, OTP values, or authorization headers.

## 13. Subscription and Entitlement

Maintain exact no-subscription semantics:

- `current_subscription = null`
- `plan = null`
- `status = null`
- `starts_at = null`
- `expires_at = null`
- `renewal = not_applicable`
- `entitlement = no_subscription`

Never use `monthly` as a default plan, `expired` as a substitute for no subscription, first email match, default row ordering, historical expiry as current state, frontend fallback that implies a subscription, or email-only ownership.

Manual Grant must use user picker, preview, context-aware action, reason code, optional reason note, stale-preview detection, idempotency, lock, and audit.

Recovery must be evidence-led and one-time. It must not manufacture payment, order, invoice, or provider event.

## 14. External Integrations and Feature Activation

Do not present an integration as available before it is operational. For every external or flag-controlled feature, distinguish code prepared, secrets configured, provider ready, event source active, Worker flag enabled, production verified, and manually accepted.

External integrations include payment, Resend, storage, OAuth, Firebase, Supabase, Cloudflare D1, R2, and GitHub deployment.

Do not activate subscriptions from frontend success. Payment-provider absence must produce an honest disabled purchase state, not fake success and not necessarily hidden plans.

## 15. Email, Notifications, and Support

Email copy is product UI and follows the same content-quality standard as web UI.

Every email requires a real event source and a clear user purpose. Subject, preheader, heading, body, CTA, and state must be semantically consistent. Supporting paragraphs are optional.

No filler, repeated title, implementation jargon, raw enums, provider details, internal Worker names, queue details, Firebase UID, Supabase, provider mapping, or contradictory action may appear in user-facing email.

Arabic and English templates require separate professional review. Arabic messages require correct RTL structure, punctuation, variable ordering, grammar, and natural Arabic rather than literal translation. Email HTML and plain text must both be valid. Variables must be escaped and safe. A message must not claim success before the underlying transaction commits. A message must not invite an unavailable action.

OTP requirements:

- OTP never appears in logs or normal API responses.
- Store only a hash in Supabase.
- Store encrypted sensitive payload temporarily in D1.
- Purge after send, final failure, or expiry.
- Resend invalidates previous requests for the same UID, normalized email, and purpose.
- Rate limits and cooldown are required.
- Disabled delivery must never return fake success.

Support requirements:

- Firebase UID ownership.
- Ticket lifecycle.
- Sender roles.
- Customer/admin unread state.
- Internal notes hidden from customer.
- Idempotent messages.
- Block enforcement.
- Reply-by-email ownership and replay protection.
- Notifications linked to real support events.
- Audit.

Attachments require private storage, type/size validation, ownership, short-lived access, sanitized filenames, rate limits, orphan cleanup, retention, audit, no public object URL, and no executable/script types by default.

## 16. Admin and RBAC

Administrative operations require backend authorization. UI visibility is not authorization.

Use least privilege and explicit roles corresponding to real product responsibilities. Sensitive operations should use preview, explicit scope, confirmation, reason, idempotency, lock, audit, and recovery where appropriate.

Do not leave all allowlisted admins permanently as compatibility `super_admin` when role assignments are available. Prevent admin lockout by ensuring at least one valid super administrator remains.

Do not expose session tokens, device-link secrets, raw authorization data, full private paths, unbounded payloads, or raw provider responses.

## 17. Account Deletion

Account deletion is a system, not one destructive button. A safe workflow may include request deletion, recent authentication, confirmation, cooling-off period, cancellation, pending-deletion state, session revocation, data inventory, delete/anonymize/retain classification, dependency order, audit, and user notification.

Hard deletion, irreversible purge, or destruction of legal/security/audit records requires explicit approval. Do not execute irreversible deletion automatically. Implement preview and dry-run contracts before any purge capability.

## 18. Database and Migration Discipline

Before any production migration, inspect schema, applied migration history, drift, row counts, duplicates, integrity conflicts, orphan rows, constraints, indexes, RLS, grants, risk, backup, preflight, postflight, and rollback or recovery.

Prefer additive migrations. Do not edit an applied migration. Do not delete or merge production rows merely to make a constraint pass. Stop on the first migration error.

Supabase connector disconnection is not automatically a permanent hard stop. When the user reconnects Supabase, treat the dependency as available and continue the pending migration or verification. Do not request a raw database password when the approved connector can perform the required operation.

## 19. Security by Default

Always evaluate authentication, authorization, ownership, least privilege, input validation, output encoding, rate limiting, abuse prevention, replay protection, CSRF, CORS, open redirects, injection, XSS, path traversal, file validation, webhook signatures, idempotency, race conditions, locks, token expiration, session revocation, PII minimization, audit integrity, and secret exposure.

Never expose secrets in source, Git, frontend bundle, logs, reports, screenshots, documentation, URLs, query strings, test snapshots, or exception messages. Refer to secret names only. Never weaken authorization to pass a test.

## 20. Testing Standard

Tests must validate behavior and production contracts. Cover happy path, loading, empty, partial, unavailable, disabled, permission denied, validation failure, provider failure, network failure, retry, expiry, revocation, duplicate request, idempotency, concurrent mutation, stale preview, replay, account switching, cache isolation, direct route, refresh, Arabic, English, RTL, LTR, mobile, desktop, light/dark theme, accessibility, migration preflight/postflight, rollback, and secret scans where applicable.

Mock tests are insufficient for critical database and API contracts. Include live schema-contract checks, production-safe authenticated smoke tests, unauthorized direct API tests, real route contract checks, bundle inspection, and applied migration verification where possible.

Known errors must return stable 4xx contracts, not 500. An HTTP 200 page shell does not prove its authenticated data works.

## 21. Desktop, Setup, and Distribution

Desktop source, installed binaries, Setup, Launcher, Updater, Installer, and OTA are related but separate artifacts.

When a QA build is required:

- Use current canonical Desktop source.
- Use existing build and installer pipeline.
- Mark the artifact clearly as QA.
- Do not publish it to Production OTA.
- Do not replace the live stable artifact.
- Do not create a GitHub Release unless explicitly requested.
- Do not change `APP_VERSION` merely for an internal QA build.
- Scan the artifact for secrets and excluded files.
- Record source commit, path, size, and SHA256.
- Verify clean install, launch, repair/upgrade where safe, uninstall, shortcuts, install manifest, and Add/Remove Programs registration.

Packaging defects that prevent building or running the QA artifact may be fixed. Do not redesign Launcher/Updater/Installer/OTA architecture unless a verified defect requires it and the task scope permits it.

## 22. Performance

Do not hide real slowness behind better loading animation. Investigate sequential requests, duplicate requests, token-refresh loops, repeated provisioning, missing cache, incorrect cache keys, large bundles, route overlap, excessive polling, expensive rendering, unbounded queries, and missing pagination. Use measured evidence.

## 23. Production Rollout

Use a staged compatible sequence:

1. Reproduce and audit.
2. Define state/source-of-truth changes.
3. Implement.
4. Run local automated checks.
5. Build.
6. Run security and secret scans.
7. Prepare backup/preflight.
8. Apply schema changes.
9. Run postflight.
10. Deploy backend with backward-compatible contracts.
11. Verify health and protected behavior.
12. Deploy frontend.
13. Verify live bundle and direct routes.
14. Run production-safe authenticated smoke tests.
15. Enable feature flags only after prerequisites are live.
16. Monitor.
17. Keep rollback ready.

Do not say fixed before verifying production behavior. Do not enable dependent functionality before prerequisites exist.

## 24. Living Documentation

Current project status is maintained under:

`docs/product-readiness-system-completion`

Maintain living documents instead of creating repeated contradictory reports. Update relevant files including:

- `product-completion-dashboard.md`
- `issues-and-phases.md`
- `feature-completeness-matrix.md`
- `acceptance-test-plan.md`

Documentation must distinguish source implementation, deployed implementation, production-verified behavior, automated verification, manual acceptance, prepared but disabled, external blocker, and operational configuration requirement.

## 25. Stop Conditions

Stop and request user input only for a real hard stop such as destructive or irreversible migration, irreversible production data deletion, real payment/refund, real production subscription grant, live release publication, live kill-switch or forced-update activation, required legal approval, required secret/configuration value, security/privacy decision that cannot be inferred, data-integrity conflict with no safe deterministic resolution, or unrelated critical distribution infrastructure outside scope.

Do not stop for minor copy polish, spacing, noncritical visual debt, historical report mismatch that can be reconciled, temporary connector disconnect after the user can reconnect it, manual acceptance intentionally deferred, missing external provider when provider-independent work can continue, or a single recoverable test failure that can be diagnosed safely.

## 26. Reporting Standard

After substantial work, report current-state reconciliation, root causes, systemic findings, files changed, state models, source-of-truth decisions, schema/API contract changes, migrations/backups, security implications, tests/results, production smoke evidence, deployment versions, commit/workflow IDs, feature flags, external blockers, operational configuration, deferred manual tests, rollback/recovery, known limitations, and features still incomplete.

Do not overstate completion. Continue until the defined execution batch is complete or a real hard stop exists.

## 27. Final Working Principle

Be proactive, precise, and evidence-driven. Prefer shared architecture over duplication, explicit contracts over assumptions, stable IDs over email ownership, state-aware content over static filler, prevention over repeated patching, production evidence over reports, honest disabled states over fake success, complete workflows over isolated controls, no text over useless text, and root-cause repair over cosmetic fixes.

The task is complete only when the affected system behaves coherently across frontend, backend, storage, permissions, state lifecycle, failures, recovery, content, tests, deployment, and production evidence.
