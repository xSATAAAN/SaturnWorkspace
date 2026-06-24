# Phase G Live Public Visual Evidence

Captured: 2026-06-24

Source commit: `3e090fb198429cf26d5f3866f9adc41c1651dfdf`

GitHub Pages workflow: `28120228875`

Live assets observed:

- `assets/index-CWMQLj65.js`
- `assets/index-C_PYWi_F.css`

Scope:

- Public routes only.
- No authenticated customer or Admin session was used.
- No secrets, tokens, private user data, or operational IDs were captured.

Routes captured:

- `/`
- `/pricing`
- `/downloads`
- `/contact`
- `/account/signin`

Locales and viewports:

- Arabic RTL: desktop `1440x900`, tablet `834x1112`, mobile `390x844`
- English LTR: desktop `1440x900`, tablet `834x1112`, mobile `390x844`

Automated rendered checks recorded in `summary.json`:

- 30 screenshots captured.
- All route responses returned `200`.
- Arabic pages rendered with `dir="rtl"`.
- English pages rendered with `dir="ltr"`.
- Horizontal overflow was `0` for every captured route/viewport.
- No page console errors were recorded.
- No real resource request failures were recorded. Cloudflare RUM aborts were excluded from the failure count because they are an external beacon teardown effect and not a page asset/runtime failure.

Finding from first capture:

- `/contact?lang=en` on mobile initially had `21px` horizontal overflow because the contact page-specific two-column grid overrode the generic mobile one-column grid, and contact email links did not wrap defensively.
- The shared contact CSS was corrected in `site/src/new-ui/foundation/public.css`.
- The live evidence in this folder was recaptured after deployment of the fix and shows `overflow=0`.

Remaining limitation:

- This folder satisfies public rendered-route evidence only.
- Authenticated customer and Admin rendered evidence still requires safe authenticated sessions and must not be inferred from these screenshots.
