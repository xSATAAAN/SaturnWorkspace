# Content Quality Matrix

Updated: 2026-06-25

Scope: public website, customer portal, admin UI, operational email, and rendered runtime copy. This matrix records the current quality rules; historical mojibake examples were removed from the living document so that current documentation does not preserve corrupted text.

## Current Gate State

| Gate | Status | Evidence |
| --- | --- | --- |
| Repository mojibake guard | `VERIFIED_AUTOMATED` | `node scripts/check-no-mojibake.mjs` passes. |
| Site copy quality guard | `ACTIVE` | Production build runs `site/scripts/check-copy-quality.mjs` against source and generated `dist`. |
| Frontend cutover guard | `ACTIVE` | `site/scripts/check-frontend-cutover.mjs` verifies SPA fallbacks and blocks development-preview tokens plus legacy public bundle tokens such as outdated prices, old contact handles, provider-specific public copy, and old beta-access wording. |
| Email content guard | `VERIFIED_AUTOMATED` | `workers/policy/scripts/check-phase-g-email-content.mjs` renders Arabic/English HTML and plain text for catalog events. |
| Public pricing visual fixture | `VERIFIED_LOCAL_FIXTURE` | Arabic/English pricing cards were rendered at desktop, tablet, and mobile sizes with a local static catalog fixture. No horizontal overflow was found after the responsive header fix. |
| Public pricing reconstruction | `PRODUCTION_VERIFIED_AUTOMATED` | Pricing source now presents weekly, monthly, and annual plans as full-tool subscriptions differentiated by period, approved price/discount, and monthly/annual trial terms. Checkout remains honestly disabled until payment provider integration exists. Live bundle `assets/index-rasVfIJe.js` contains the current values, omits the old pricing strip/banner implementation, and has no provider-name public copy or mojibake markers. |
| Email verification state model | `PRODUCTION_DEPLOYED_PENDING_MANUAL_ACCEPTANCE` | Pending-registration verification now displays the destination email once as non-editable account-flow information, renders only OTP inputs, and offers resend/change-email actions. Direct `/account/verify` without context no longer renders a generic editable email form. Change-email cancellation supersedes the old request server-side. |
| Live public rendered route evidence | `RECORDED_PUBLIC_ONLY` | Live screenshots under `docs/product-readiness-system-completion/visual-evidence/phase-g-20260624-live-public` cover `/`, `/pricing`, `/downloads`, `/contact`, and `/account/signin` in Arabic/English at desktop, tablet, and mobile sizes. The first pass found Contact mobile overflow; the current captured summary records 30/30 route/locale/viewport combinations with 200 responses, correct RTL/LTR direction, no console errors, no real resource failures, and zero horizontal overflow. |
| Admin raw error prevention | `PENDING_DEPLOYMENT_VERIFICATION` | Admin Release/source CORS contract was repaired to avoid exposing raw `forbidden_origin` in normal UI paths; authenticated live route sweep remains required before acceptance. |
| Security/admin alert email copy | `VERIFIED_AUTOMATED` | Phase G email content tests render Arabic/English templates and now run alongside security producer/admin alert lifecycle checks. Billing and release templates remain prepared but disabled. |
| Semantic contradiction review | `IN_PHASE_G_PRE_ACCEPTANCE` | Automated checks cover known high-risk copy patterns; manual semantic acceptance remains Phase G. |

## Copy Classification Rules

| Classification | Keep? | Rule |
| --- | ---: | --- |
| Required task copy | Yes | Labels, actions, form prompts, and recovery instructions needed to complete the task. |
| Decision copy | Yes | Helps the user choose between meaningful options. |
| Error copy | Yes | Explains what happened and the next useful action without raw backend codes. |
| Constraint copy | Yes | States a real limitation that affects the user's next step. |
| Help copy | Yes, sparingly | Use progressive disclosure only when it reduces uncertainty. |
| Redundant copy | No | Repeats the page title, button, or obvious state. |
| Implementation-facing copy | No | Mentions backend internals, source-of-truth mechanics, provider setup, contracts, queues, or internal IDs in customer UI. |
| Marketing filler | No in task surfaces | Adds trust claims or broad promises without helping the task. |
| Placeholder/remove | No | TODO, demo-only hints, lorem ipsum, no-op explanations, raw codes, or unapproved production promises. |

## State-Aware Content Rules

- Title, status, description, data, CTA, and disabled state must agree.
- Supporting copy is optional; remove it when it does not help a task, decision, constraint, result, or recovery path.
- Normal-state copy must not be reused for unavailable, disabled, partial, error, or empty states when the meaning changes.
- A disabled feature must explain the user-relevant state without implementation jargon.
- No payment, billing, release, grant, recovery, or deletion success may be stated before the underlying committed event exists.
- Public pricing may display approved plan names and prices while checkout is honestly disabled. It must not expose raw backend feature text or provider-readiness narration to customers.

## Terminology Baseline

| Concept | English | Arabic | Rule |
| --- | --- | --- | --- |
| Subscription | Subscription | اشتراك | Customer access state. Do not use trial/beta wording unless it is the actual state. |
| Plan | Plan | خطة | Commercial plan display only. |
| Account | Account | حساب | Customer identity, independent from subscription rows. |
| Support ticket | Support ticket | تذكرة دعم | Customer/admin support thread. |
| Contact | Contact | تواصل معنا | Public contact routing, not an authenticated support ticket form. |
| Download | Download | تنزيل | Customer installer/release access. |
| Release | Release | إصدار | Public/admin release metadata. |
| Needs review | Needs review | يحتاج مراجعة | Product-friendly phrase for states that need attention. |
| Not available | Not available | غير متاح حاليًا | Product-facing phrase for honest unavailable states. |
| Setup pending | Setup pending | الإعداد غير مكتمل | Use only when setup is truly incomplete. |

## Email Content Rules

- Email copy is product UI.
- Every email must have a real event source, recipient rule, queue contract, retry/failure behavior, provider event handling, and audit.
- Subject, preheader, heading, body, CTA, and state must be semantically consistent.
- Arabic templates require RTL structure, natural Arabic, correct punctuation, and safe variable ordering.
- English templates require LTR structure and professional task-oriented copy.
- HTML and plain text alternatives must both render correctly.
- Variables must be escaped.
- Billing and release emails remain disabled until real committed provider/release events exist.

## Remaining Content Acceptance

| Item | Status | Reason |
| --- | --- | --- |
| Full manual semantic review | `DEFERRED_TO_PHASE_G_MANUAL_ACCEPTANCE` | Manual acceptance has not started. |
| Legal copy approval | `WAITING_EXTERNAL` | Requires legal/product approval separate from implementation. |
| Payment copy after provider mapping | `WAITING_EXTERNAL` | Requires real payment provider and approved checkout flow. |
| Pricing fixture screenshots | `RECORDED` | `D:\SaturnWS\build-output\phase-g-live-render` contains the 2026-06-25 Arabic/English desktop, tablet, and mobile live pricing evidence for the current pricing IA. |
| Live pricing bundle after current reconstruction | `RECORDED` | GitHub Pages workflow run `28174200979` deployed commit `9da6025189eccfff76509bac6f61d18942489f07`; live HTML loads `assets/index-rasVfIJe.js`. |
| Email verification rendered evidence | `RECORDED` | `D:\SaturnWS\build-output\phase-g-live-render` contains direct-route and pending-registration screenshots plus a redacted summary proving no editable email input, one destination email occurrence, six OTP inputs, and working Change email return to signup. |
| Authenticated Admin Releases after origin repair | `PENDING_DEPLOYMENT_VERIFICATION` | Requires authenticated Admin route sweep after Admin Worker deployment; an unauthenticated 401 or page shell is not sufficient evidence. |
| Legacy root static website artifacts | `REMOVED_FROM_SOURCE` | Root `index.html`, legacy root legal/contact HTML pages, and root generated `assets/index-*` bundles were removed from Git-tracked source. The active GitHub Pages workflow publishes only `site/dist`. |
