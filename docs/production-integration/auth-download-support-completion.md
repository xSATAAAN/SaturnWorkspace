# Auth, Download and Support Completion

Date: 2026-06-19

## Verdict

`Support portal complete; email provider required`

## Auth layout

Root cause: the production auth routes in `site/src/new-ui/pages/production/ProductionPages.tsx` were using a simplified production-only layout instead of the approved shared auth structure. The preview auth pages used `AuthShell` with the CSS hooks expected by `auth.css`, while production rendered a generic `auth-shell` page without the same `auth-header`, `auth-main`, `auth-form-wrap`, `auth-card`, and `auth-form` composition. That caused the form to stretch and lose the centered card layout after cutover.

Fixed by adding a production shared auth shell and applying it to:

- `/account/signin`
- `/account/signup`
- `/account/verify`
- password reset / verification flows that share the same production auth component path

The fixed production auth page now uses a centered card, constrained width, integrated language/theme controls, validation/loading/error states, Google sign-in, forgot password, and create-account switching.

Preview/production comparison after the fix: production now uses the same structural hooks and visual rhythm as the approved preview auth pages, while keeping production adapters and Firebase auth behavior.

## Download page

The public `/download` page is now a simple product download page:

- Saturn Workspace identity and app icon.
- Short description.
- One primary `Download for Windows` action.
- Metadata from the real update manifest only.
- No public release history, OTA details, long changelog, or internal release list.

Release metadata source:

- Same-origin manifest: `/updates/latest.json?channel=beta`
- Current manifest result used during validation:
  - version: `1.0.7-beta`
  - file: `SaturnWorkspace-app-1.0.7-beta.zip`
  - size: `39,624,505` bytes (`37.8 MB`)
  - SHA256 exists in the manifest, but the page does not display it yet.
  - Architecture is omitted because the manifest/filename does not prove `32-bit` or `64-bit`.
  - Digital signing is not claimed.

The download action navigates directly to the manifest download URL. The page no longer depends on cross-origin `admin-api` manifest fetches, which were blocked by browser CORS during local smoke testing.

Public navigation cleanup:

- Removed public footer links to release history/changelog-style pages.
- Kept product, pricing, download, FAQ, contact, account and legal links.
- Admin release/OTA tooling remains untouched.

## Support desk

Ticket display IDs are generated as stable user-facing IDs:

- Format: `SAT-YYYY-XXXXXX`
- Derived from the support thread id and timestamp.
- Visible in customer portal, admin table/details, copy action, and search.
- The database UUID remains internal.

Implemented statuses:

- `open`
- `waiting_for_support`
- `waiting_for_customer`
- `resolved`
- `closed`

Customer portal routes and behavior:

- Create ticket.
- List tickets.
- Search/filter tickets.
- Open thread.
- Reply to thread.
- Close ticket.
- Reopen closed ticket.
- See support replies and system status entries.
- Internal notes are filtered out from customer-facing queries and UI.

Admin support routes and behavior:

- List tickets.
- Search by ticket number, email, subject, install id, device id, or last message.
- Filter by status.
- Open ticket details.
- Reply to portal.
- Select `Portal + email`, with warning when email provider is not configured.
- Add internal note, stored with sender `internal`.
- Internal notes are admin-only.
- Change status and store a system history entry.
- Close/reopen via status changes.
- Block/unblock sender identity.
- Copy ticket number.
- Show customer email and basic platform context where available.
- Assigned admin and priority are represented in the UI shell, but no database columns exist yet for full persistence.

Support routes:

- Customer app support:
  - `POST /v1/support/messages`
  - `POST /v1/support/threads`
  - `POST /v1/support/thread`
  - `POST /v1/support/read`
- Customer web support:
  - `POST /v1/web/support/messages`
  - `POST /v1/web/support/threads`
  - `POST /v1/web/support/thread`
  - `POST /v1/web/support/reply`
  - `POST /v1/web/support/status`
- Admin support:
  - `GET /v1/admin/support`
  - `GET /v1/admin/support/messages`
  - `POST /v1/admin/support/reply`
  - `POST /v1/admin/support/status`
  - `POST /v1/admin/support/block`
- Admin proxy routes:
  - `GET /api/admin/policy/support`
  - `GET /api/admin/policy/support/messages`
  - `POST /api/admin/policy/support/reply`
  - `POST /api/admin/policy/support/status`
  - `POST /api/admin/policy/support/block`

Storage:

- Existing D1 tables:
  - `support_threads`
  - `support_messages`
  - `support_message_blocks`
- No migration was added in this pass.

## Email support

No transactional email provider is currently configured for support replies.

Current architecture:

- Portal support works.
- Admin can choose `Portal only` or `Portal + email`.
- If `Portal + email` is selected while the provider is off, the UI warns that the reply will be saved in the portal only.
- The frontend does not show false email-success states.
- Email provider secrets are not present in frontend code.

Required before real email delivery:

- Choose provider: Resend, Postmark, Mailgun, or another approved provider.
- Add Worker-side provider adapter and secret.
- Store delivery status/provider message id.
- Add idempotency for email sends.
- Add inbound email routing/webhook only if the provider supports it and it is explicitly approved.

Inbound reply status: not implemented. Customers must reply inside the Customer Portal for now.

## Security controls

Implemented/confirmed:

- Customer support requires authenticated user token.
- Web support ownership is scoped to authenticated user identity.
- Admin support routes require admin session through the admin worker.
- User A cannot query User B tickets through scoped support SQL.
- Internal notes are filtered from customer thread/list queries.
- Message and subject length limits are enforced in UI and backend.
- Daily support rate limit remains active: 5 support messages per user identity per 24 hours.
- Sender blocking remains active through `support_message_blocks`.
- Admin status and block actions are audited by the admin worker.
- Stable error codes are returned instead of stack traces.

Not implemented in this pass:

- Attachments.
- Persistent assigned admin column.
- Persistent priority/category columns.
- Email delivery idempotency/status table.

## Worker deployment

Deployed affected Workers only:

- `saturnws-policy`
  - Version ID: `3a89d62a-1da6-4754-aa30-ca72a104dcdc`
  - Route: `api.saturnws.com/*`
- `saturnws-admin`
  - Version ID: `56fb4e85-7a55-4867-ba08-4746b40556f7`
  - Routes include `admin.saturnws.com/*`, `saturnws.com/admin/*`, `saturnws.com/updates/*`, and `admin-api.saturnws.com/api/*`

## Validation

Build/tests:

- `npm run build` in `site`: passed.
- `npm run build:new-ui:production` in `site`: passed.
- `npm run test:new-ui:round3b` in `site`: passed.
- `npm run check` in `workers/policy`: passed.
- `npm run check:syntax` in `workers/admin`: passed.
- `node tools/publish-static-pages.mjs`: passed.
- `node site/scripts/check-frontend-cutover.mjs`: passed.

Local visual smoke:

- `/account/signin` direct refresh: passed.
- English + dark at desktop width: passed.
- Arabic + light mobile width: passed.
- `/download` simple page: passed with local same-origin manifest fixture.
- `/account/support` logged-out guard: passed.
- `/admin/support` admin login shell: passed. Localhost CORS errors are expected for admin API because live CORS allows `https://admin.saturnws.com`, not localhost.

Live smoke after frontend publish:

- `https://saturnws.com/account/signin?lang=en&theme=dark`: passed. The production auth card is centered and no longer renders as a full-width generic form.
- `https://saturnws.com/download?lang=en&theme=light`: passed. The page loads the same-origin update manifest and shows `1.0.7-beta`, `37.8 MB`, and `SaturnWorkspace-app-1.0.7-beta.zip`.
- `https://admin.saturnws.com/admin/support?lang=en&theme=dark`: passed as an unauthenticated smoke test. It shows the admin login shell. The `401` response from `/api/admin/session` is expected without an admin session.

GitHub deployment:

- Commit: `a52fcb2` (`Repair production auth download and support`)
- Workflow: `Deploy site to GitHub Pages`
- Run: `27830090323`
- Result: success.

## Files changed

- `site/src/new-ui/pages/production/ProductionPages.tsx`
- `site/src/new-ui/adapters/productionAdapters.ts`
- `site/src/new-ui/adapters/contracts.ts`
- `site/src/new-ui/layouts/SharedChrome.tsx`
- `site/src/new-ui/foundation/public.css`
- `site/src/new-ui/foundation/portal.css`
- `site/src/api/admin.ts`
- `site/src/api/support.ts`
- `workers/policy/src/index.ts`
- `workers/admin/src/index.js`
- `docs/production-integration/auth-download-support-completion.md`

Desktop app untouched:

- `D:\SaturnWS\desktop-app` was not modified.
