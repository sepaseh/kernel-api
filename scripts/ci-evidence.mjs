import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const repository = fileURLToPath(new URL("../", import.meta.url));
const reportPath = "coverage/lcov.info";
const manifestPath = "coverage/ci-evidence.json";
export const maximumCoverageBytes = 32 * 1024 * 1024;
const sha = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{40}$/.test(value) &&
  !/^0+$/.test(value);
const positive = (value) =>
  typeof value === "string" && /^[1-9]\d*$/.test(value);

export const sourceIdentity = ({
  environment,
  event,
  git,
  producerAttempt,
}) => {
  const commit = git(["rev-parse", "HEAD"]).trim();
  const tree = git(["rev-parse", "HEAD^{tree}"]).trim();
  const workflow = git(["rev-parse", "HEAD:.github/workflows/ci.yml"]).trim();
  const repositoryName = environment.GITHUB_REPOSITORY;
  const pullRequest = environment.GITHUB_EVENT_NAME === "pull_request";
  const push = environment.GITHUB_EVENT_NAME === "push";
  const head = pullRequest ? event.pull_request?.head?.sha : commit;
  const pushedBase =
    push && event.before !== "0".repeat(40) ? event.before : null;
  const base = pullRequest ? event.pull_request?.base?.sha : pushedBase;
  const attempt = producerAttempt ?? environment.GITHUB_RUN_ATTEMPT;
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositoryName ?? "") ||
    repositoryName.split("/").some((part) => part === "." || part === "..") ||
    event.repository?.full_name !== repositoryName ||
    !["pull_request", "push", "workflow_dispatch"].includes(
      environment.GITHUB_EVENT_NAME,
    ) ||
    (pullRequest &&
      event.pull_request?.base?.repo?.full_name !== repositoryName) ||
    ![commit, tree, workflow, head].every(sha) ||
    ((pullRequest || push) && base !== null && !sha(base)) ||
    (pullRequest && !sha(base)) ||
    (push && event.after !== commit) ||
    commit !== environment.GITHUB_SHA ||
    !positive(environment.GITHUB_RUN_ID) ||
    !positive(environment.GITHUB_RUN_ATTEMPT) ||
    !positive(attempt) ||
    BigInt(attempt) > BigInt(environment.GITHUB_RUN_ATTEMPT) ||
    git(["diff", "--name-only", "HEAD", "--"]).trim()
  )
    throw new Error(
      "CI evidence requires the exact clean checkout and GitHub event identity",
    );
  return {
    repository: repositoryName,
    head,
    base,
    commit,
    tree,
    workflow,
    runId: environment.GITHUB_RUN_ID,
    attempt,
  };
};

const safeRelative = (value) => {
  const normalized = value.replaceAll("\\", "/");
  if (
    !normalized ||
    /[:\0\r\n]/.test(normalized) ||
    normalized.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error(
      "Coverage source paths must be safe relative repository paths",
    );
  return normalized;
};

const regularFile = async (root, relative, optional = false) => {
  const parts = safeRelative(relative).split("/");
  let filename = path.resolve(root);
  const rootInfo = await lstat(filename);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
    throw new Error("CI evidence root must be an ordinary directory");
  for (const [index, part] of parts.entries()) {
    filename = path.join(filename, part);
    let info;
    try {
      info = await lstat(filename);
    } catch (error) {
      if (optional && index === parts.length - 1 && error.code === "ENOENT")
        return { filename };
      throw error;
    }
    if (
      info.isSymbolicLink() ||
      (index === parts.length - 1 ? !info.isFile() : !info.isDirectory())
    )
      throw new Error(
        "CI evidence and source paths must not contain links or special files",
      );
    if (index === parts.length - 1) return { filename, info };
  }
};

const parseCoverageLine = (line, record) => {
  if (line.startsWith("SF:")) {
    if (record.source)
      throw new Error("LCOV records must end before another source");
    record.source = safeRelative(line.slice(3));
    record.sources.add(record.source);
    return;
  }
  if (line.startsWith("DA:")) {
    if (!record.source || !/^DA:[1-9]\d*,\d+(?:,[^,\s]+)?$/.test(line))
      throw new Error("LCOV requires valid measured line records");
    record.measured = true;
    return;
  }
  if (line === "end_of_record") {
    if (!record.source)
      throw new Error("LCOV records require an existing source");
    record.source = undefined;
    record.records++;
    return;
  }
  if (line && !/^[A-Z][A-Z0-9_]*:/.test(line))
    throw new Error("LCOV contains a malformed record");
};

const coverageSources = (bytes) => {
  const record = {
    source: undefined,
    measured: false,
    records: 0,
    sources: new Set(),
  };
  const lines = new TextDecoder("utf-8", { fatal: true })
    .decode(bytes)
    .split(/\r?\n/);
  for (const line of lines) parseCoverageLine(line, record);
  if (record.source || !record.records || !record.measured)
    throw new Error("LCOV must contain complete measured source records");
  return record.sources;
};

export const readCoverage = async (root) => {
  const { filename, info } = await regularFile(root, reportPath);
  if (info.size === 0 || info.size > maximumCoverageBytes)
    throw new Error("Measured LCOV must be nonempty and at most 32 MiB");
  const bytes = await readFile(filename);
  if (bytes.length === 0 || bytes.length > maximumCoverageBytes)
    throw new Error("Measured LCOV must be nonempty and at most 32 MiB");
  await Promise.all(
    [...coverageSources(bytes)].map((source) => regularFile(root, source)),
  );
  return bytes;
};

export const evidenceManifest = (identity, bytes) => ({
  schemaVersion: 1,
  identity,
  coverage: {
    path: reportPath,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  },
});

export const runEvidence = async (
  mode,
  { root = repository, environment = process.env, event, git, output } = {},
) => {
  if (!["--record", "--verify-coverage"].includes(mode))
    throw new Error("Usage: ci-evidence.mjs --record|--verify-coverage");
  const readGit =
    git ??
    ((args) =>
      // The evidence CLI runs on Ubuntu; never resolve Git through a writable PATH.
      execFileSync("/usr/bin/git", args, {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      }));
  const payload =
    event ?? JSON.parse(await readFile(environment.GITHUB_EVENT_PATH, "utf8"));
  const verifying = mode === "--verify-coverage";
  if (verifying && !positive(environment.CI_EVIDENCE_PRODUCER_ATTEMPT))
    throw new Error("Analysis requires the successful producer attempt output");
  if (!verifying && !output && !environment.GITHUB_OUTPUT)
    throw new Error("GITHUB_OUTPUT is required to publish coverage evidence");
  const identity = sourceIdentity({
    environment,
    event: payload,
    git: readGit,
    producerAttempt: verifying
      ? environment.CI_EVIDENCE_PRODUCER_ATTEMPT
      : undefined,
  });
  const bytes = await readCoverage(root);
  const expected = evidenceManifest(identity, bytes);
  const { filename, info } = await regularFile(root, manifestPath, !verifying);
  if (verifying) {
    if (info.size > 16 * 1024)
      throw new Error("CI evidence manifest is too large");
    if (
      !isDeepStrictEqual(JSON.parse(await readFile(filename, "utf8")), expected)
    )
      throw new Error(
        "Coverage evidence does not match the exact source, workflow, producer or measured bytes",
      );
  } else {
    await writeFile(filename, JSON.stringify(expected, null, 2) + "\n", "utf8");
    const values = {
      artifact: `coverage-${identity.runId}-${identity.attempt}`,
      attempt: identity.attempt,
    };
    if (output) await output(values);
    else {
      await appendFile(
        environment.GITHUB_OUTPUT,
        `artifact=${values.artifact}\nattempt=${values.attempt}\n`,
      );
    }
  }
  return identity;
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 3)
      throw new Error("Exactly one evidence mode is required");
    await runEvidence(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
