import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyDeploymentBoundary } from "./check-deployment-boundary.mjs";
import {
  normalizeSourceSha,
  requireSuccessfulProtectedCheck,
} from "./verify-protected-source.mjs";
import { buildPagesProvenance } from "./write-pages-provenance.mjs";

const SOURCE_SHA = "a".repeat(40);

test("source promotion requires an exact commit SHA", () => {
  assert.equal(normalizeSourceSha(SOURCE_SHA), SOURCE_SHA);
  assert.throws(() => normalizeSourceSha("main"), /exact 40-character/);
  assert.throws(() => normalizeSourceSha("A".repeat(40)), /exact 40-character/);
});

test("only the exact successful protected GitHub Actions check is accepted", () => {
  const accepted = requireSuccessfulProtectedCheck(
    {
      check_runs: [
        {
          id: 42,
          name: "web-required",
          head_sha: SOURCE_SHA,
          status: "completed",
          conclusion: "success",
          completed_at: "2026-07-30T00:00:00Z",
          app: { slug: "github-actions" },
        },
      ],
    },
    SOURCE_SHA,
  );
  assert.equal(accepted.checkId, 42);

  assert.throws(
    () =>
      requireSuccessfulProtectedCheck(
        {
          check_runs: [
            {
              name: "web-required",
              head_sha: SOURCE_SHA,
              status: "completed",
              conclusion: "failure",
              app: { slug: "github-actions" },
            },
          ],
        },
        SOURCE_SHA,
      ),
    /does not have a successful/,
  );
});

test("Pages provenance hashes the complete payload without hashing itself", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "saturnws-pages-provenance-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "nested"));
  await writeFile(path.join(root, "index.html"), "index\n", "utf8");
  await writeFile(path.join(root, "nested", "asset.js"), "asset\n", "utf8");

  const evidence = await buildPagesProvenance({
    distRoot: root,
    sourceSha: SOURCE_SHA,
    repository: "xSATAAAN/SaturnWorkspace",
    workflowRunId: "123",
    workflowRunAttempt: "1",
    builtAt: new Date("2026-07-30T00:00:00Z"),
  });

  assert.equal(evidence.payload.file_count, 2);
  assert.equal(evidence.payload.logical_bytes, 12);
  assert.match(evidence.payload.aggregate_sha256, /^[0-9a-f]{64}$/);
  const written = JSON.parse(await readFile(path.join(root, "build-provenance.json"), "utf8"));
  assert.deepEqual(written, evidence);
});

test("the checked-in workflow enforces the deployment boundary", async () => {
  const workflow = await readFile(
    path.join(".github", "workflows", "deploy-pages.yml"),
    "utf8",
  );
  const result = verifyDeploymentBoundary(workflow);
  assert.equal(result.trigger, "workflow_dispatch");
  assert.equal(result.sourceCheck, "web-required");
});

test("a stale main ancestor is not an eligible production candidate", async () => {
  const workflow = await readFile(
    path.join(".github", "workflows", "deploy-pages.yml"),
    "utf8",
  );
  const weakened = workflow.replace(
    'test "$SATURNWS_SOURCE_SHA" = "$(git rev-parse origin/main)"',
    'git merge-base --is-ancestor "$SATURNWS_SOURCE_SHA" origin/main',
  );
  assert.throws(
    () => verifyDeploymentBoundary(weakened),
    /exact current main-tip promotion/,
  );
});
