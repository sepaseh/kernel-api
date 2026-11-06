import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  coverageSourceFiles,
  validateCoverageData,
} from "./merge-coverage.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));
const testSuites = ["unit", "integration", "governance"];
const suites = new Set([...testSuites, "combined"]);
const auditReportPath = "coverage/governance/audit-lcov.info";
const suiteReportPath = (suite) =>
  suite === "combined" ? "coverage/lcov.info" : `coverage/${suite}/lcov.info`;
const suiteManifestPath = (suite) => `coverage/${suite}/ci-evidence.json`;
const maximumManifestBytes = 1024 * 1024;
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
    !suites.has(environment.CI_EVIDENCE_SUITE) ||
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
    suite: environment.CI_EVIDENCE_SUITE,
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

const regularFile = async (
  root,
  relative,
  optional = false,
  directory = false,
) => {
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
      (index === parts.length - 1 && !directory
        ? !info.isFile()
        : !info.isDirectory())
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

const admittedFiles = async (root) => {
  const { filename } = await regularFile(root, ".github/bootstrap-policy.json");
  const inventory = JSON.parse(await readFile(filename, "utf8"));
  if (
    !Array.isArray(inventory.allowedFiles) ||
    new Set(inventory.allowedFiles).size !== inventory.allowedFiles.length ||
    inventory.allowedFiles.some(
      (file) => typeof file !== "string" || safeRelative(file) !== file,
    )
  )
    throw new Error("Coverage requires a safe admitted source inventory");
  return inventory.allowedFiles;
};

export const readCoverage = async (
  root,
  reportPath = suiteReportPath("governance"),
) => {
  const { filename, info } = await regularFile(root, reportPath);
  if (info.size === 0 || info.size > maximumCoverageBytes)
    throw new Error("Measured LCOV must be nonempty and at most 32 MiB");
  const bytes = await readFile(filename);
  if (bytes.length === 0 || bytes.length > maximumCoverageBytes)
    throw new Error("Measured LCOV must be nonempty and at most 32 MiB");
  const sources = coverageSources(bytes);
  const admitted = await admittedFiles(root);
  if ([...sources].some((source) => !admitted.includes(source)))
    throw new Error(
      "Coverage source is not admitted by the publication inventory",
    );
  if (
    reportPath === auditReportPath &&
    (sources.size !== 1 || !sources.has("scripts/run-audit.mjs"))
  )
    throw new Error(
      "Audit-helper coverage must measure only scripts/run-audit.mjs",
    );
  const checked = await Promise.allSettled(
    [...sources].map((source) => regularFile(root, source)),
  );
  const failure = checked.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  return bytes;
};

const reportEvidence = (path, bytes) => ({
  path,
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
});

export const evidenceManifest = (
  identity,
  bytes,
  auditBytes,
  evidence = {},
) => ({
  schemaVersion: 1,
  identity,
  nodeVersion: process.version,
  coverage: reportEvidence(suiteReportPath(identity.suite), bytes),
  ...(auditBytes
    ? { auditCoverage: reportEvidence(auditReportPath, auditBytes) }
    : {}),
  ...evidence,
});

const readManifest = async (root, suite) => {
  const relative = suiteManifestPath(suite);
  const { filename, info } = await regularFile(root, relative);
  if (info.size > maximumManifestBytes)
    throw new Error("CI evidence manifest is too large");
  const bytes = await readFile(filename);
  if (bytes.length > maximumManifestBytes)
    throw new Error("CI evidence manifest is too large");
  return { bytes, value: JSON.parse(bytes), relative };
};

const verifyManifest = (actual, expected) => {
  if (!isDeepStrictEqual(actual, expected))
    throw new Error(
      "Coverage evidence does not match the exact source, workflow, producer or measured bytes",
    );
};

const requirePinnedRuntime = async (root) => {
  const { filename } = await regularFile(root, ".nvmrc");
  const pinned = (await readFile(filename, "utf8")).trim().replace(/^v/, "");
  if (process.version !== `v${pinned}`)
    throw new Error("Coverage evidence requires the pinned Node runtime");
};

const readMeasuredFile = async (root, relative) => {
  const { filename, info } = await regularFile(root, relative);
  if (!info.size || info.size > maximumCoverageBytes)
    throw new Error("Raw coverage must be nonempty and at most 32 MiB");
  const bytes = await readFile(filename);
  if (!bytes.length || bytes.length > maximumCoverageBytes)
    throw new Error("Raw coverage must be nonempty and at most 32 MiB");
  return bytes;
};

const verifySourceMaps = async (root, data, sourceFiles) => {
  const sources = new Map(
    sourceFiles.map((file) => [
      `file:///kernel-api-source/${file.split("/").map(encodeURIComponent).join("/")}`,
      file,
    ]),
  );
  const results = await Promise.allSettled(
    Object.values(data["source-map-cache"] ?? {}).map(async (entry) => {
      const source = sources.get(entry.data.sources[0]);
      const { filename } = await regularFile(root, source);
      const bytes = await readFile(filename);
      if (!bytes.equals(Buffer.from(entry.data.sourcesContent[0], "utf8")))
        throw new Error(
          "Raw coverage source maps do not match admitted source bytes",
        );
    }),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
};

const readRawEvidence = async (root, directory, sourceFiles) => {
  const { filename } = await regularFile(root, directory, false, true);
  const entries = (await readdir(filename, { withFileTypes: true })).sort(
    (left, right) => {
      if (left.name < right.name) return -1;
      if (left.name > right.name) return 1;
      return 0;
    },
  );
  if (
    !entries.length ||
    entries.some(
      (entry) =>
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        !/^[A-Za-z0-9._-]+\.json$/.test(entry.name),
    )
  )
    throw new Error(
      "Raw coverage requires a complete ordinary JSON file inventory",
    );
  const results = await Promise.allSettled(
    entries.map(async (entry) => {
      const relative = `${directory}/${entry.name}`;
      const bytes = await readMeasuredFile(root, relative);
      const data = validateCoverageData(JSON.parse(bytes), sourceFiles);
      await verifySourceMaps(root, data, sourceFiles);
      return reportEvidence(relative, bytes);
    }),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  return results.map((result) => result.value);
};

const suiteEvidence = async (root, identity) => {
  const suite = identity.suite;
  const bytes = await readCoverage(root, suiteReportPath(suite));
  const sourceFiles = coverageSourceFiles(await admittedFiles(root));
  const rawCoverage = await readRawEvidence(
    root,
    `coverage/${suite}/v8`,
    sourceFiles,
  );
  if (suite !== "governance")
    return evidenceManifest(identity, bytes, undefined, { rawCoverage });
  const auditBytes = await readCoverage(root, auditReportPath);
  const auditRawCoverage = await readRawEvidence(
    root,
    "coverage/governance/audit-v8",
    ["scripts/run-audit.mjs"],
  );
  return evidenceManifest(identity, bytes, auditBytes, {
    rawCoverage,
    auditRawCoverage,
  });
};

const verifiedInputs = async (root, environment, event, git) => {
  const results = await Promise.allSettled(
    testSuites.map(async (suite) => {
      const recorded = await readManifest(root, suite);
      const identity = sourceIdentity({
        environment: { ...environment, CI_EVIDENCE_SUITE: suite },
        event,
        git,
        producerAttempt: recorded.value.identity?.attempt,
      });
      const expected = await suiteEvidence(root, identity);
      verifyManifest(recorded.value, expected);
      return {
        suite,
        identity,
        manifest: reportEvidence(recorded.relative, recorded.bytes),
      };
    }),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  return results.map((result) => result.value);
};

const validateInputAttestations = (inputs, identity) => {
  if (!Array.isArray(inputs) || inputs.length !== testSuites.length)
    throw new Error(
      "Combined coverage requires all three producer attestations",
    );
  return inputs.map((input, index) => {
    const suite = testSuites[index];
    const producer = { ...identity, suite, attempt: input?.identity?.attempt };
    if (
      input?.suite !== suite ||
      !positive(producer.attempt) ||
      BigInt(producer.attempt) > BigInt(identity.attempt) ||
      !isDeepStrictEqual(input.identity, producer) ||
      input.manifest?.path !== suiteManifestPath(suite) ||
      !Number.isSafeInteger(input.manifest.bytes) ||
      input.manifest.bytes < 1 ||
      input.manifest.bytes > maximumManifestBytes ||
      !/^[a-f0-9]{64}$/.test(input.manifest.sha256 ?? "")
    )
      throw new Error(
        "Combined coverage requires exact source and producing suite attestations",
      );
    return {
      suite,
      identity: producer,
      manifest: {
        path: suiteManifestPath(suite),
        bytes: input.manifest.bytes,
        sha256: input.manifest.sha256,
      },
    };
  });
};

const publishEvidence = async (filename, evidence, { environment, output }) => {
  await writeFile(filename, JSON.stringify(evidence, null, 2) + "\n", "utf8");
  const { identity } = evidence;
  const values = {
    artifact: `coverage-${identity.suite}-${identity.runId}-${identity.attempt}`,
    attempt: identity.attempt,
  };
  if (output) await output(values);
  else
    await appendFile(
      environment.GITHUB_OUTPUT,
      `artifact=${values.artifact}\nattempt=${values.attempt}\n`,
    );
};

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
  await requirePinnedRuntime(root);
  const recorded = verifying
    ? await readManifest(root, identity.suite)
    : undefined;
  let expected;
  if (identity.suite === "combined") {
    const inputs = verifying
      ? recorded.value.inputs
      : await verifiedInputs(root, environment, payload, readGit);
    const bytes = await readCoverage(root, "coverage/lcov.info");
    expected = evidenceManifest(identity, bytes, undefined, {
      inputs: validateInputAttestations(inputs, identity),
    });
  } else expected = await suiteEvidence(root, identity);
  const manifestPath = suiteManifestPath(identity.suite);
  if (!verifying)
    await mkdir(path.join(root, `coverage/${identity.suite}`), {
      recursive: true,
    });
  const { filename } = await regularFile(root, manifestPath, !verifying);
  if (verifying) verifyManifest(recorded.value, expected);
  else await publishEvidence(filename, expected, { environment, output });
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
