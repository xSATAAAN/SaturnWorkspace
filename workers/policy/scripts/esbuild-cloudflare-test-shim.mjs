export const cloudflareWorkersTestShim = {
  name: "cloudflare-workers-test-shim",
  setup(build) {
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "cloudflare:workers", namespace: "saturn-test" }))
    build.onLoad({ filter: /.*/, namespace: "saturn-test" }, () => ({
      contents: "export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }",
      loader: "js",
    }))
  },
}
