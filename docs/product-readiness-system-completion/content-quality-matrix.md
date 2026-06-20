# Phase B.1 Content Quality Matrix

Date: 2026-06-20

Scope: website/customer portal/admin UI copy and support/contact semantics only. No backend, Worker, D1, Supabase, Cloudflare, or desktop code was changed in this pass.

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

