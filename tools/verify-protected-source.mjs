import { pathToFileURL } from "node:url";

const FULL_SHA = /^[0-9a-f]{40}$/;

export function normalizeSourceSha(value) {
  const sha = String(value || "").trim();
  if (!FULL_SHA.test(sha)) {
    throw new Error("source_sha must be an exact 40-character lowercase Git commit SHA");
  }
  return sha;
}

export function requireSuccessfulProtectedCheck(payload, sourceSha) {
  const runs = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
  const matchingRuns = runs.filter(
    (run) =>
      run?.name === "web-required" &&
      run?.head_sha === sourceSha &&
      run?.app?.slug === "github-actions",
  );
  const successful = matchingRuns.find(
    (run) => run?.status === "completed" && run?.conclusion === "success",
  );

  if (!successful) {
    throw new Error(
      "the exact source commit does not have a successful web-required GitHub Actions check",
    );
  }

  return {
    checkId: successful.id,
    completedAt: successful.completed_at || null,
  };
}

export async function verifyProtectedSource({
  repository,
  sourceSha,
  token,
  fetchImpl = fetch,
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || "")) {
    throw new Error("GITHUB_REPOSITORY is invalid");
  }
  if (!token) {
    throw new Error("GITHUB_TOKEN is unavailable");
  }

  const sha = normalizeSourceSha(sourceSha);
  const endpoint =
    `https://api.github.com/repos/${repository}/commits/${sha}/check-runs` +
    "?check_name=web-required&filter=latest&per_page=100";
  const response = await fetchImpl(endpoint, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub check lookup failed with HTTP ${response.status}`);
  }

  return {
    sourceSha: sha,
    ...requireSuccessfulProtectedCheck(await response.json(), sha),
  };
}

async function main() {
  const result = await verifyProtectedSource({
    repository: process.env.GITHUB_REPOSITORY,
    sourceSha: process.env.SATURNWS_SOURCE_SHA,
    token: process.env.GITHUB_TOKEN,
  });
  console.log(
    `Protected source accepted: ${result.sourceSha}; web-required check ${result.checkId}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Protected source verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
