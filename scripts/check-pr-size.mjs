import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const maximumChangedFiles = 100;

const statuses = new Set([
  "added",
  "changed",
  "copied",
  "modified",
  "removed",
  "renamed",
  "unchanged",
]);
const validSha = (value) =>
  typeof value === "string" && /^[a-f\d]{40}$/i.test(value);

const metadata = (value) => {
  if (
    !validSha(value?.head?.sha) ||
    !validSha(value?.base?.sha) ||
    !Number.isSafeInteger(value.changed_files) ||
    value.changed_files < 0
  )
    throw new Error("GitHub returned incomplete pull request metadata.");
  return {
    baseSha: value.base.sha,
    changedFiles: value.changed_files,
    headSha: value.head.sha,
  };
};

const parseNextPageLink = (header) => {
  let nextLink;
  for (const segment of header?.split(",") ?? []) {
    const match = /^<([^<>]+)>;\s*rel="next"$/.exec(segment.trim());
    if (match) {
      if (nextLink)
        throw new Error("GitHub returned ambiguous file pagination.");
      nextLink = match[1];
    }
  }
  return nextLink;
};

export const evaluateFiles = (files, expectedCount) => {
  if (!Array.isArray(files))
    throw new Error("GitHub returned an invalid pull request file list.");
  const names = new Set();
  const statusCounts = {};
  for (const file of files) {
    if (
      typeof file?.filename !== "string" ||
      !file.filename ||
      !statuses.has(file.status) ||
      (file.status === "renamed" &&
        (typeof file.previous_filename !== "string" || !file.previous_filename))
    )
      throw new Error("GitHub returned incomplete changed-file metadata.");
    if (names.has(file.filename))
      throw new Error("GitHub returned duplicate changed files across pages.");
    names.add(file.filename);
    statusCounts[file.status] = (statusCounts[file.status] ?? 0) + 1;
  }
  if (files.length !== expectedCount)
    throw new Error(
      "The file list is incomplete or changed during pagination; rerun the check.",
    );
  if (files.length > maximumChangedFiles)
    throw new Error(
      `Pull request changes ${files.length} files; the maximum is ${maximumChangedFiles}. Split the change into smaller pull requests.`,
    );
  return { changedFiles: files.length, maximumChangedFiles, statusCounts };
};

export const inspectPullRequest = async ({
  apiUrl = "https://api.github.com",
  expectedHeadSha,
  fetchImpl = fetch,
  pullNumber,
  repository,
  token,
}) => {
  if (
    typeof repository !== "string" ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    repository.split("/").some((part) => part === "." || part === "..") ||
    !Number.isSafeInteger(pullNumber) ||
    pullNumber < 1 ||
    !validSha(expectedHeadSha)
  )
    throw new Error(
      "An exact repository, PR number and event head are required.",
    );
  const api = new URL(apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`);
  if (
    api.protocol !== "https:" ||
    api.username ||
    api.password ||
    api.search ||
    api.hash
  )
    throw new Error(
      "The GitHub API must use an HTTPS URL without credentials.",
    );
  const [owner, repo] = repository.split("/");
  const endpoint = new URL(
    `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}`,
    api,
  );
  const filesEndpoint = new URL(`${endpoint.href}/files?per_page=100`);
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2026-03-10",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const query = async (url) => {
    const response = await fetchImpl(url.href, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
      throw new Error(`GitHub PR query failed (HTTP ${response.status}).`);
    return { data: await response.json(), link: response.headers.get("link") };
  };
  const before = metadata((await query(endpoint)).data);
  if (before.headSha !== expectedHeadSha)
    throw new Error("This run belongs to an older PR head; rerun the check.");
  if (before.changedFiles > 3000)
    throw new Error(
      `Pull request exceeds the ${maximumChangedFiles}-file limit and GitHub's file-list limit.`,
    );

  const files = [];
  const visited = new Set();
  let next = filesEndpoint;
  while (next) {
    if (
      next.origin !== filesEndpoint.origin ||
      next.pathname !== filesEndpoint.pathname ||
      next.username ||
      next.password ||
      next.hash ||
      visited.has(next.href) ||
      visited.size >= 30
    )
      throw new Error("GitHub returned unsafe or incomplete file pagination.");
    visited.add(next.href);
    // Each next URL comes from the preceding page, so requests must stay sequential.
    const page = await query(next);
    if (!Array.isArray(page.data))
      throw new Error("GitHub returned an invalid pull request file page.");
    files.push(...page.data);
    const nextLink = parseNextPageLink(page.link);
    next = nextLink ? new URL(nextLink, filesEndpoint) : undefined;
  }
  const after = metadata((await query(endpoint)).data);
  if (
    before.headSha !== after.headSha ||
    before.baseSha !== after.baseSha ||
    before.changedFiles !== after.changedFiles
  )
    throw new Error("The PR changed while files were being checked; rerun.");
  return { ...evaluateFiles(files, after.changedFiles), ...after };
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (!process.env.GITHUB_EVENT_PATH)
      throw new Error("Run this check with a GitHub pull request event.");
    const event = JSON.parse(
      await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
    );
    const result = await inspectPullRequest({
      apiUrl: process.env.GITHUB_API_URL,
      expectedHeadSha: event.pull_request?.head?.sha,
      pullNumber: event.pull_request?.number,
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
    });
    console.log(
      `PR file limit passed: ${result.changedFiles}/${maximumChangedFiles}; additions, deletions, renames and binary files all count.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "PR file check failed.",
    );
    process.exitCode = 1;
  }
}
