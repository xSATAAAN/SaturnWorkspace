# Saturn Workspace Web Instructions

- Status: active repository instructions
- Scope: `D:\SaturnWS\github-deploy\SaturnWorkspace`
- Owner: repository maintainer
- Last verified: 2026-08-01
- Verification: protected `web-required` CI and `tools/check-authority-surface.mjs`

When this repository is used inside the full `D:\SaturnWS` workspace, the
workspace-level `AGENTS.md` also applies. A standalone clone or worktree remains
governed by this tracked file and must not assume that the workspace root or a
sibling checkout exists.

## Canonical boundary

- This protected Git repository is the canonical source for the public site,
  customer and administrator UI, shared Web contracts, and Auth, Admin, and
  Policy Workers.
- Desktop is the separate protected repository
  `xSATAAAN/SaturnWorkspace-Desktop`.
  The producer contract is `contracts/desktop-control-plane.v1.json`; Desktop
  pins an exact reviewed copy and producer commit.
- Other workspace trees, generated Pages output, Wrangler state, screenshots,
  reports, dependency directories, and preserved copies are evidence or
  artifacts, not Web source.
- Git history and the verified preservation baseline are the historical record.

## Active authority

The complete human-maintained prose authority is:

1. `AGENTS.md` for repository-specific engineering instructions.
2. `README.md` for current architecture, supported commands, and operating
   boundaries.

Contracts, migrations, configuration, workflows, code, and tests are executable
authority. Prose must agree with them. Do not add nested instruction files,
editor- or model-specific rules, task journals, readiness dashboards, dated
reports, generated evidence, or in-tree documentation archives. Durable facts
belong in the applicable root file only when they have a current consumer and a
named verification path.

Applied migration filenames are immutable operational history. Their names do
not establish current roadmap, product, or engineering authority.

## Cross-repository product decisions

The single cumulative owner-approved product decision register is the
`Approved product decision register` section at
https://github.com/xSATAAAN/SaturnWorkspace-Desktop/blob/main/README.md#approved-product-decision-register.
An authenticated product-design or review context must read it before changing
cross-repository product intent or capability boundaries. If that private
register is unavailable, stop that work explicitly; do not infer intent from
legacy Web code and do not create a local copy or fallback register. Web CI
enforces repository-local executable contracts and the uniqueness of this
pointer without receiving cross-repository credentials.

## Product and ownership facts

Saturn Workspace is owned and developed by one independent individual/student.
There is no registered company, institutional publisher, or multi-person team.
Do not invent one or disclose the owner's private legal identity.

- Account connection and entitlement are separate states. A linked account
  without an active subscription is valid and must fail closed only for paid
  operations.
- No production payment provider is active. Checkout, grants, and billing email
  stay disabled or fail closed until a separately approved provider rollout.
- Irreversible account deletion is not approved. Current account-management
  surfaces must not claim that hard deletion occurs.
- Gmail read access remains disabled until external verification and an explicit
  rollout decision.
- Real grants, production toggles, destructive migrations, Worker deployment,
  Pages promotion, publication, and release require operation-specific approval.

## Change and deployment boundaries

- Use a branch, pull request, and the protected `web-required` check.
- Merging source does not deploy it. Pages promotion is a manual workflow for
  the exact current `main` commit after its protected check succeeds.
- Worker deployment is separate from source adoption and has no automatic
  workflow in this repository.
- Never weaken authentication, entitlement, ownership, replay protection,
  rate-limit, signature, migration, promotion, or secret-handling gates to make
  a test pass.
- Do not commit `.dev.vars`, Wrangler state, credentials, service-role keys,
  tokens, private keys, production payloads, or real user data. Fixture tokens
  must remain unmistakably synthetic and confined to tests.

## Required verification

Run the narrow relevant checks while iterating, then reproduce protected CI:

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

Report the exact commit, PR, CI run, failed or skipped checks, deployment status,
and rollback boundary. A source change is not a deployment authorization.
