import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PINNED_ACTIONS = new Map([
  ["actions/checkout", "11d5960a326750d5838078e36cf38b85af677262"],
  ["actions/setup-node", "49933ea5288caeca8642d1e84afbd3f7d6820020"],
  ["actions/configure-pages", "983d7736d9b0ae728b81ab479565c72886d7745b"],
  ["actions/upload-pages-artifact", "56afc609e74202658d3ffba0e8f6dda462b719fa"],
  ["actions/deploy-pages", "d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e"],
]);

function requirePattern(text, pattern, description) {
  if (!pattern.test(text)) {
    throw new Error(`deployment boundary is missing ${description}`);
  }
}

export function verifyDeploymentBoundary(text) {
  requirePattern(text, /^on:\s*$/m, "an explicit trigger block");
  requirePattern(text, /^  workflow_dispatch:\s*$/m, "manual workflow dispatch");
  requirePattern(text, /^      source_sha:\s*$/m, "the exact source SHA input");
  requirePattern(text, /^        required: true\s*$/m, "the required source SHA input");
  if (/^  push:\s*$/m.test(text)) {
    throw new Error("production deployment must not run on source pushes");
  }

  requirePattern(text, /cancel-in-progress: false/, "non-cancelling production concurrency");
  requirePattern(text, /if: github\.ref == 'refs\/heads\/main'/, "the main-ref restriction");
  requirePattern(text, /runs-on: ubuntu-24\.04/g, "the fixed runner image");
  if (/runs-on: ubuntu-latest/.test(text)) {
    throw new Error("production deployment must not use a floating runner image");
  }
  requirePattern(text, /node-version: "22"/, "the CI-aligned Node.js runtime");
  requirePattern(text, /persist-credentials: false/, "non-persistent checkout credentials");
  requirePattern(text, /fetch-depth: 0/, "complete source ancestry");
  requirePattern(
    text,
    /\[\[ "\$SATURNWS_SOURCE_SHA" =~ \^\[0-9a-f\]\{40\}\$ \]\]/,
    "source SHA validation before Git operations",
  );
  requirePattern(text, /verify-protected-source\.mjs/, "protected-check verification");
  requirePattern(text, /write-pages-provenance\.mjs/, "artifact source provenance");
  requirePattern(text, /check-frontend-cutover\.mjs/, "frontend cutover verification");
  requirePattern(text, /checks: read/, "read-only check-run access");
  requirePattern(text, /pages: write/, "Pages deployment permission");
  requirePattern(text, /id-token: write/, "Pages identity-token permission");

  const uses = [...text.matchAll(/uses:\s*([^\s#]+)/g)].map((match) => match[1]);
  for (const [action, expectedSha] of PINNED_ACTIONS) {
    const expected = `${action}@${expectedSha}`;
    if (!uses.includes(expected)) {
      throw new Error(`${action} is not pinned to the approved immutable revision`);
    }
  }
  for (const use of uses) {
    const separator = use.lastIndexOf("@");
    const revision = separator >= 0 ? use.slice(separator + 1) : "";
    if (!/^[0-9a-f]{40}$/.test(revision)) {
      throw new Error(`workflow action is not immutably pinned: ${use}`);
    }
  }

  return {
    trigger: "workflow_dispatch",
    actions: uses.length,
    sourceCheck: "web-required",
  };
}

async function main() {
  const workflowPath = process.argv[2] || path.join(".github", "workflows", "deploy-pages.yml");
  const result = verifyDeploymentBoundary(await readFile(workflowPath, "utf8"));
  console.log(
    `Deployment boundary verified: ${result.trigger}; ${result.actions} pinned actions; ` +
      `${result.sourceCheck} required.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Deployment boundary verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
