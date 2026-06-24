# Content Quality Matrix

Updated: 2026-06-24

Scope: public website, customer portal, admin UI, operational email, and rendered runtime copy. This matrix records the current quality rules; historical mojibake examples were removed from the living document so that current documentation does not preserve corrupted text.

## Current Gate State

| Gate | Status | Evidence |
| --- | --- | --- |
| Repository mojibake guard | `VERIFIED_AUTOMATED` | `node scripts/check-no-mojibake.mjs` passes. |
| Site copy quality guard | `ACTIVE` | Production build runs `site/scripts/check-copy-quality.mjs` against source and generated `dist`. |
| Email content guard | `VERIFIED_AUTOMATED` | `workers/policy/scripts/check-phase-g-email-content.mjs` renders Arabic/English HTML and plain text for catalog events. |
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
