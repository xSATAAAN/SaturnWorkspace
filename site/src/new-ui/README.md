# Saturn Workspace New UI

This is an isolated development preview. It is not imported by the current `site/src/main.tsx` or `site/src/App.tsx`, and it is not part of the current production Vite entry.

## Run

From `D:\SaturnWS\web-platform\site`:

```powershell
npm run dev:new-ui -- --host 127.0.0.1
```

Default preview URL:

`http://127.0.0.1:4180/`

## Build

```powershell
npm run build:new-ui
```

The isolated output is written to:

`D:\SaturnWS\web-platform\site\src\new-ui\dist`

The current production build remains:

```powershell
npm run build
```

## Preview Routes

The preview uses query-string routing so it does not add or replace production routes.

| Surface | URL |
|---|---|
| Public home | `/?surface=public&page=home` |
| Features/product | `/?surface=public&page=product` |
| Pricing | `/?surface=public&page=pricing` |
| Download | `/?surface=public&page=download` |
| Releases | `/?surface=public&page=releases` |
| Contact/support | `/?surface=public&page=contact` |
| Sign in | `/?surface=auth&page=signin` |
| Sign up | `/?surface=auth&page=signup` |
| Email verification | `/?surface=auth&page=verify` |
| Forgot password | `/?surface=auth&page=forgot` |
| Checkout | `/?surface=checkout&page=checkout` |
| Payment states | `/?surface=checkout&page=status&state=pending` |
| Customer portal | `/?surface=portal&page=overview` |
| Customer subscription | `/?surface=portal&page=subscription` |
| Customer payments | `/?surface=portal&page=payments` |
| Customer downloads | `/?surface=portal&page=downloads` |
| Customer devices | `/?surface=portal&page=devices` |
| Customer support | `/?surface=portal&page=support` |
| Admin login | `/?surface=admin&page=login` |
| Admin overview | `/?surface=admin&page=overview` |
| Admin users | `/?surface=admin&page=users` |
| Admin subscriptions | `/?surface=admin&page=subscriptions` |
| Admin releases | `/?surface=admin&page=releases` |
| Admin policies | `/?surface=admin&page=policies` |
| Admin coverage | `/?surface=admin&page=coverage` |
| System states | `/?surface=system&page=404` |

## Boundaries

- Light is the first-visit default; Dark is manually selected and persisted.
- English is the first-visit default; Arabic is manually selected and persisted.
- Mock flows use `adapters/mockAdapter.ts` and are development-only.
- No page calls a live payment, auth, OTA, policy, D1, or support mutation.
- No secrets or credentials are stored in this folder.
