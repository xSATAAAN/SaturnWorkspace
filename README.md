# Saturn Workspace Web Platform

- Status: canonical source guide
- Scope: public/customer/admin Web surfaces and Auth, Admin, and Policy Workers
- Owner: repository maintainer
- Last verified: 2026-07-31
- Verification: protected `web-required` CI

Canonical Web and control-plane source for Saturn Workspace. The project is
owned and developed by one independent individual/student; the product name
does not imply a registered company or corporate publisher.

## Architecture and ownership

- `site`: React customer, public, and administrator interfaces plus typed API
  adapters and production-cutover checks.
- `workers/auth`: authentication, device linking, account sessions, and OAuth
  configuration delivery.
- `workers/admin`: administrative operations, diagnostics, support, OTA release
  metadata, and provider-disabled commerce routes.
- `workers/policy`: entitlement decisions, notifications, invitations, email
  content, and policy signing.
- `workers/shared`: shared subscription and account-domain behavior.
- `contracts`: machine-readable producer contracts consumed by Desktop.
- `tools`: source-promotion, runtime-contract, provenance, and authority checks.
- `.github/workflows/ci.yml`: protected source qualification.
- `.github/workflows/deploy-pages.yml`: manual exact-commit Pages promotion.

The Desktop source is a separate protected repository at
`D:\SaturnWS\desktop-app`. `contracts/desktop-control-plane.v1.json` is the Web
producer contract; Desktop pins its reviewed content and producer commit.

## Local qualification

Use Node.js 22 and the committed npm lock files:

```powershell
node --test tools/authority-surface.test.mjs tools/deployment-boundary.test.mjs tools/runtime-contract.test.mjs
node tools/check-authority-surface.mjs
node tools/check-deployment-boundary.mjs

Push-Location site
npm ci
npm run lint
npm run build
npm run test:production-integration
npm run test:production-rollout
npm run test:content
npm run test:admin-surface
Pop-Location

Push-Location workers/admin
npm ci
npm run check:syntax
npm run test:required
Pop-Location

Push-Location workers/auth
npm ci
npm run check
npm run test:device-linking
Pop-Location

Push-Location workers/policy
npm ci
npm run test:required
Pop-Location
```

`npm run dev` or `wrangler dev` is a local development surface only. Local
fixtures and tokens must remain synthetic; never copy real customer or
production data into tests.

## Current product boundaries

- Account connection and entitlement are distinct. A linked account can have no
  subscription, while paid operations remain denied.
- No production payment provider is active. Checkout, manual grants, and
  billing communications stay disabled or fail closed until separately
  approved and externally verified.
- Irreversible account deletion is not approved; do not promise hard deletion.
- Gmail read access remains disabled until provider verification and an explicit
  rollout decision.
- Desktop production signing, publisher verification, publication, and release
  remain outside this repository and are deferred.

These boundaries are enforced in runtime code, contracts, and tests. A prose
change cannot activate an integration or authorize an operation.

## Source, deployment, and secrets

Merging a protected pull request adopts source; it does not deploy. GitHub Pages
can be promoted only by manually dispatching `deploy-pages.yml` with the exact
current `main` SHA after `web-required` succeeds. Worker deployment is a separate
operator action and is not automated by this repository.

Expected environment bindings are declared by Worker configuration and code.
Secret values belong only in the approved external platform or local ignored
files. Never commit or print `.dev.vars`, service-role keys, Firebase or OAuth
credentials, signing keys, tokens, production payloads, Wrangler state, or real
user data.

## Documentation authority

`AGENTS.md` and this file are the complete active prose surface. Code, contracts,
migrations, configuration, workflows, and tests remain executable authority.
Applied migrations retain historical filenames because their identity is part
of database history; those names do not define current work or product intent.
Git history preserves superseded guidance instead of in-tree archives.
