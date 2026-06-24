# Saturn Workspace New UI

`site/src/new-ui` is the production UI source for the current Saturn Workspace website, account portal, and admin shell.

The production Vite entry is:

`site/src/main.tsx`

It imports:

`site/src/new-ui/production-main.tsx`

## Build

From the canonical repository:

```powershell
cd D:\SaturnWS\github-deploy\SaturnWorkspace\site
npm run build
```

The production output is written to:

`D:\SaturnWS\github-deploy\SaturnWorkspace\site\dist`

## Local Preview

After a production build:

```powershell
npm run preview -- --host 127.0.0.1
```

The local preview normally opens on a Vite preview port such as:

`http://127.0.0.1:4173/`

## Production Routes

The new UI owns the current public, account, auth, system, and admin route shells. SPA fallback files are generated into `site/dist` by:

```powershell
node tools/publish-static-pages.mjs
```

The cutover check verifies that these fallbacks point at the same React app shell:

```powershell
cd D:\SaturnWS\github-deploy\SaturnWorkspace\site
node scripts/check-frontend-cutover.mjs
```

## Boundaries

- Production code must use production adapters, not development mock adapters.
- Mock preview utilities must not appear in `site/dist`.
- Old static HTML pages must not be copied into `site/dist`.
- Legacy public bundle tokens such as outdated prices, old beta-access wording, old provider-specific copy, or old contact handles must not appear in the production bundle.
- No secrets or credentials are stored in this folder.
