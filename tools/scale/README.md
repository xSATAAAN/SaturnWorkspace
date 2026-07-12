# Saturn Workspace Scale Validation

This harness executes the bundled Policy Worker module against a temporary native SQLite database through a D1-compatible adapter. Existing Policy tests retain Miniflare/Workerd wiring coverage. It never sends load to production.

Profiles:

- `npm run test:quick`: 2,500 synthetic identities, baseline, reads, mutations, spike, dependency faults, and a 30-second soak.
- `npm run test:full`: 10,000 synthetic identities and a 5-minute soak.
- `npm run test:production-smoke`: one low-rate request per public production surface. This is not a load test.

Reports are written below `tools/scale/reports` and are intentionally excluded from Git.

Run `npm ci` before the first execution. Use `node --expose-gc policy-load.mjs --profile quick --output <path>` when a fixed evidence path is required.

Production or provider-capacity testing requires isolated Cloudflare staging Workers and a Supabase development branch. Do not point this load runner at production.

The report keeps local pass/fail separate from `productionTargetStatus`. The native SQLite D1 adapter is synchronous, while Cloudflare D1 calls are asynchronous, so a local pass does not prove provider capacity or production event-loop SLOs. Those remain `STAGING_REQUIRED` until tested on isolated Cloudflare Workers and a Supabase development branch.
