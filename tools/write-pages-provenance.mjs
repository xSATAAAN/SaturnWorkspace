import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { normalizeSourceSha } from "./verify-protected-source.mjs";

const PROVENANCE_NAME = "build-provenance.json";

async function collectFiles(root, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const childRelative = path.join(relative, entry.name);
    if (!relative && entry.name === PROVENANCE_NAME) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`deployment output contains a symbolic link: ${childRelative}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, childRelative)));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`deployment output contains an unsupported entry: ${childRelative}`);
    }
    files.push(childRelative);
  }

  return files;
}

export async function buildPagesProvenance({
  distRoot,
  sourceSha,
  repository,
  workflowRunId,
  workflowRunAttempt,
  builtAt = new Date(),
}) {
  const root = path.resolve(distRoot);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) {
    throw new Error("Pages output root is not a directory");
  }

  const files = await collectFiles(root);
  const aggregate = createHash("sha256");
  let logicalBytes = 0;

  for (const relativePath of files) {
    const content = await readFile(path.join(root, relativePath));
    const fileHash = createHash("sha256").update(content).digest("hex");
    const portablePath = relativePath.replaceAll("\\", "/");
    logicalBytes += content.length;
    aggregate.update(portablePath);
    aggregate.update("\0");
    aggregate.update(String(content.length));
    aggregate.update("\0");
    aggregate.update(fileHash);
    aggregate.update("\n");
  }

  const evidence = {
    schema: "saturnws.web.pages-provenance.v1",
    source_commit: normalizeSourceSha(sourceSha),
    repository: String(repository || ""),
    workflow_run_id: String(workflowRunId || ""),
    workflow_run_attempt: String(workflowRunAttempt || ""),
    built_at_utc: builtAt.toISOString(),
    payload: {
      file_count: files.length,
      logical_bytes: logicalBytes,
      aggregate_sha256: aggregate.digest("hex"),
    },
  };

  await mkdir(root, { recursive: true });
  await writeFile(
    path.join(root, PROVENANCE_NAME),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { encoding: "utf8", flag: "w" },
  );
  return evidence;
}

async function main() {
  const evidence = await buildPagesProvenance({
    distRoot: process.argv[2] || path.join("site", "dist"),
    sourceSha: process.env.SATURNWS_SOURCE_SHA,
    repository: process.env.SATURNWS_REPOSITORY,
    workflowRunId: process.env.SATURNWS_WORKFLOW_RUN_ID,
    workflowRunAttempt: process.env.SATURNWS_WORKFLOW_RUN_ATTEMPT,
  });
  console.log(
    `Pages provenance written for ${evidence.source_commit}: ` +
      `${evidence.payload.file_count} files, ${evidence.payload.logical_bytes} bytes.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Pages provenance failed: ${error.message}`);
    process.exitCode = 1;
  });
}
