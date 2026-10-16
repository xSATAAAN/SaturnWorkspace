# Saturn Workspace Web Instructions

- Status: active repository instructions
- Scope: `D:\SaturnWS\github-deploy\SaturnWorkspace`
- Owner: repository maintainer
- Last verified: 2026-08-23
- Verification: protected `web-required` CI and `tools/check-authority-surface.mjs`

When this repository is used inside the full `D:\SaturnWS` workspace, the
workspace-level `AGENTS.md` also applies. A standalone clone or worktree remains
governed by this tracked file and must not assume that the workspace root or a
sibling checkout exists.

## Canonical boundary

- This protected Git repository is the canonical source for the public site,
  customer and administrator UI, shared Web contracts, and Auth, Admin, Policy,
  and Route Check Workers.
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

## Current product context

No cumulative product-decision register or historical project-state log is
active during the context reset. Do not infer current product intent from Git
history, archived documents, old handoffs, rejected designs, or untracked
summaries. Use the Product Owner's current request and verified current product
evidence. If a material cross-repository product meaning is missing, return that
decision to the Product Owner instead of reviving an older decision as current
truth.

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

## Current verification boundary

Choose local verification from the changed code, contract, deployment, and
trust boundaries. Reuse evidence while its source and meaning remain valid.
Current branch protection requires `web-required`; do not bypass it while it
remains enforced. The workflow and its constituent commands are current
engineering controls, not permanent product requirements.

Report the exact commit, PR, CI run, failed or skipped checks, deployment status,
and rollback boundary. A source change is not a deployment authorization.
