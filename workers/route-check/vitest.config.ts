import { cloudflareTest } from "@cloudflare/vitest-pool-workers"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // Keep tests on the newest workerd date bundled with this pinned pool;
        // the production date remains declared in wrangler.jsonc.
        compatibilityDate: "2026-07-02",
        serviceBindings: {
          POLICY_CAPABILITIES: { name: "policy-capability-test", entrypoint: "RouteCapabilityService" },
        },
        workers: [
          {
            name: "policy-capability-test",
            modules: true,
            scriptPath: "./test/policy-capability-worker.mjs",
          },
        ],
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"] },
})
