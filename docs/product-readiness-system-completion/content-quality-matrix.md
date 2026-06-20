# Phase B.1 Content Quality Matrix

Date: 2026-06-20

Scope: website/customer portal/admin UI copy and support/contact semantics only. No backend, Worker, D1, Supabase, Cloudflare, or desktop code was changed in this pass.

## Manual Acceptance Remediation - 2026-06-21

Scope stays limited to Phase B/B.1 surfaces: sign in, sign up, auth loading/error states, account overview, subscription, downloads, support, contact, settings, account navigation, empty/error/success states, buttons, tooltips, admin overview, admin subscriptions, and admin email operations.

Latest manual result: `PHASE_B1_NEEDS_FIXES`. This matrix is updated for the focused fix batch and remains `IMPLEMENTED_PENDING_MANUAL_ACCEPTANCE` until the live sign-in copy and account skeleton are accepted manually.

### Forensic Correction

| Item | Result |
|---|---|
| Active sign-in route | `/account/signin` and `/login` resolve to `surface: auth`, `page: signin` in `site/src/new-ui/app/productionRouter.ts`. |
| Active component | `EmailPasswordProductionPage` in `site/src/new-ui/pages/production/ProductionPages.tsx`. |
| Rejected copy source | Hardcoded `copyByLocale(locale, 'Secure account access', 'دخول آمن للحساب')` in the active component, not `messages.ts` or `publicCopy.ts`. |
| Why the prior gate passed | The gate did not include this Arabic phrase or trust-claim class and relied on a narrower set of English/internal phrases. |
| Production behavior | The live bundle contained both the Arabic and English trust-claim strings before this fix batch. |

### Copy Classification Rules

| Classification | Keep? | Rule |
|---|---:|---|
| Required task copy | Yes | Labels, actions, form prompts, and recovery instructions needed to complete the task. |
| Decision copy | Yes | Helps the user choose between meaningful options. |
| Error copy | Yes | Explains what happened and the next useful action without raw backend codes. |
| Constraint copy | Yes | States a real limitation that affects the user's next step. |
| Help copy | Yes, sparingly | Progressive disclosure only when it reduces uncertainty. |
| Redundant copy | No | Repeats the page title, button, or obvious state. |
| Implementation-facing copy | No | Mentions backend, source of truth, integration pending, provider setup, contracts, or internal mechanics in customer UI. |
| Marketing filler | No in B.1 surfaces | Adds trust claims or broad promises without helping the task. |
| Placeholder/remove | No | TODO, demo, lorem ipsum, no-op explanations, raw codes, or unapproved production promises. |

### Inventory Summary

| Surface | Rewritten/removed | Left unchanged |
|---|---|---|
| Sign in / sign up | Removed the visible sign-in eyebrow entirely. Reduced generic sign-in body to direct continuation copy; signup body avoids subscription-management explanation. | Field labels, password requirements, terms acknowledgement, Google action, and signup-only setup context. |
| Auth loading/error | Admin normal loading no longer shows a retry action. Errors continue to use stable user-facing messages. | Email verification body remains because it explains a real action: enter the 6-digit code. |
| Account overview | Removed generic overview subtitle; notification empty copy now describes where important messages appear. | Subscription/download cards and retry actions for real recoverable failures. |
| Subscription | Removed generic account subtitle and product-decision alert. | Subscription state projection and no-active-subscription CTA. |
| Downloads | Removed generic download subtitle from portal page. | Release unavailable/download errors because they are task-relevant constraints. |
| Support / contact | Public contact now uses concise channel selection copy; support card states the sign-in requirement directly; ticket form copy is shortened. | Ticket creation form labels, reply controls, closed-ticket recovery instruction. |
| Settings | Removed generic settings subtitle. | Profile/security form labels and password reset action. |
| Admin overview/subscriptions | Removed generic admin subtitles. | Operational table labels and grant-subscription drawer description. |
| Admin email operations | Left mostly unchanged in this batch because operational diagnostics are admin-facing and Phase B.1 only required skeleton fidelity there. | Send/receive/webhook status labels remain. |

### Copy Moved To Progressive Disclosure / Later Phases

| Copy topic | Destination |
|---|---|
| Full pricing/source-of-truth explanation | Phase E commercial/payment source-of-truth pass. |
| Legal policy text | Separate legal/content pass. |
| Full admin operational guidance | Phase F admin completion. |
| Email provider rollout explanations | Email operations acceptance/Phase G. |

### Copy Quality Gate Additions

`site/scripts/check-copy-quality.mjs` now blocks B.1-facing production UI phrases that indicate:

- State narration: "You are logged in", "A Windows session was verified", repeated title/subtitle patterns.
- Implementation vocabulary: backend required, integration pending, commercial source of truth, provider setup wording in customer UI.
- Placeholder/filler: TODO, lorem ipsum, demo placeholders.
- Raw or weak production copy: plan-data placeholders and mojibake markers.
- Obvious auth trust claims in English and Arabic, including `Secure sign in`, `Secure account access`, `دخول آمن للحساب`, `تسجيل دخول آمن`, and direct equivalents.

The gate scans runtime new-ui source under `app`, `components`, `layouts`, `pages`, `content`, and `i18n`, plus generated `dist` during production build.

## Terminology Baseline

| Concept | English | Arabic | Rule |
|---|---|---|---|
| Subscription | Subscription | اشتراك | Use for customer access state. Do not call it "trial request" or "beta access" unless it is a real subscription state. |
| Plan | Plan | خطة | Use for commercial plan display only. |
| Account | Account | حساب | Customer identity, independent from subscription row. |
| Support ticket | Ticket / support ticket | تذكرة دعم | Use for customer/admin support threads. |
| Contact | Contact | تواصل معنا | Public contact information and routing, not an authenticated ticket form. |
| Download | Download | تنزيل | Customer installer/release access. |
| Release | Release | إصدار | Public/admin release metadata. |
| Review needed | Needs review | يحتاج مراجعة | Product/customer-friendly replacement for internal "decision required" copy. |
| Not available | Not available yet | غير متاح حاليًا | Product/customer-friendly replacement for "backend required". |
| Setup pending | Setup pending | الإعداد غير مكتمل | Product/customer-friendly replacement for "integration pending". |

## Updated Copy and UI Semantics

| Area | Previous risk | B.1 change | Files |
|---|---|---|---|
| Public contact | Contact/support was blurred and support implied an authenticated support flow from the public page. | `/contact` now presents public routing cards and sends authenticated support requests to `/account/support` or sign-in with return target. | `site/src/new-ui/pages/production/ProductionPages.tsx`, `site/src/new-ui/foundation/public.css`, `site/src/new-ui/layouts/SharedChrome.tsx` |
| Footer support link | Public footer linked support as if it were a public page. | Footer now sends signed-in users to support center and signed-out users to sign-in with `/account/support` return target. | `site/src/new-ui/layouts/SharedChrome.tsx` |
| Subscription summary loading | Generic card placeholders did not match final card structure. | Added subscription-card skeleton matching title/status/details/action structure. | `site/src/new-ui/pages/production/ProductionPages.tsx`, `site/src/new-ui/foundation/components.css` |
| Portal skeletons | Generic skeletons did not reflect real page density. | Added page-specific skeletons for overview, subscription, downloads, support, settings/security. | `site/src/new-ui/pages/production/ProductionPages.tsx` |
| Admin skeletons | Admin loading states used generic cards and could shift after data loads. | Added admin overview, subscriptions table, and email operations skeletons using final page patterns. | `site/src/new-ui/pages/production/ProductionPages.tsx` |
| Support messages | Sender roles were visually ambiguous. | Customer, support agent, internal note, and system messages now have distinct semantic classes. | `site/src/new-ui/pages/production/ProductionPages.tsx`, `site/src/new-ui/foundation/portal.css` |
| Technical copy | UI messages exposed implementation terms such as backend required/product decision/integration pending. | Replaced with product-facing messages and added a copy quality gate. | `site/src/new-ui/i18n/messages.ts`, `site/scripts/check-copy-quality.mjs`, `site/package.json` |
| Checkout unavailable | Arabic text used weak "يمكنك مراجعة" phrasing. | Replaced with direct plan-status copy that does not sound like a page description. | `site/src/new-ui/components/CheckoutDialog.tsx` |

## Copy Gate

New check:

```powershell
npm run test:phase-b1
```

Now runs:

- Mojibake guard.
- User-facing copy quality guard.
- Phase B.1 baseline source contract guard.

The production build also runs copy quality validation against the generated `dist`.

## Remaining Content Items

| Item | Status | Reason |
|---|---|---|
| Full legal/content rewrite | Not part of B.1 | Legal pages remain static and need a separate production content pass. |
| Real pricing source copy | Not part of B.1 | Current plan copy still depends on approved commercial source of truth. |
| Email support copy after live rollout | Pending manual acceptance | Support email/inbound remains an external integration area. |
| Support attachments copy | Blocked by feature decision | Attachments are not implemented yet. |
