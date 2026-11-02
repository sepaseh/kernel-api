import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  evidenceManifest,
  maximumCoverageBytes,
  readCoverage,
  runEvidence,
  sourceIdentity,
} from "./ci-evidence.mjs";

const commit = "a".repeat(40);
const tree = "b".repeat(40);
const workflow = "c".repeat(40);
const head = "d".repeat(40);
const base = "e".repeat(40);
const lcov = (source = "src/example.ts") =>
  `TN:\nSF:${source}\nDA:1,1\nLF:1\nLH:1\nend_of_record\n`;
const identityOptions = () => ({
  environment: {
    GITHUB_REPOSITORY: "example/api",
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_SHA: commit,
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "1",
    CI_EVIDENCE_PRODUCER_ATTEMPT: "1",
  },
  event: {
    repository: { full_name: "example/api" },
    pull_request: {
      head: { sha: head },
      base: { sha: base, repo: { full_name: "example/api" } },
    },
  },
  git: (args) => {
    const commands = {
      "rev-parse HEAD": commit,
      "rev-parse HEAD^{tree}": tree,
      "rev-parse HEAD:.github/workflows/ci.yml": workflow,
      "diff --name-only HEAD --": "",
    };
    assert.ok(Object.hasOwn(commands, args.join(" ")));
    return commands[args.join(" ")];
  },
});
const fixture = async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "kernel-ci-evidence-"));
  context.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith("kernel-ci-evidence-"));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, "coverage"));
  await writeFile(
    path.join(root, "src/example.ts"),
    "export const value = 1;\n",
  );
  await writeFile(path.join(root, "coverage/lcov.info"), lcov());
  const outputs = [];
  return {
    root,
    ...identityOptions(),
    output: (values) => outputs.push(values),
    outputs,
  };
};
const readManifest = async (root) =>
  JSON.parse(
    await readFile(path.join(root, "coverage/ci-evidence.json"), "utf8"),
  );
const putManifest = (root, value) =>
  writeFile(
    path.join(root, "coverage/ci-evidence.json"),
    JSON.stringify(value),
  );

test("records measured bytes and verifies the exact same-run source identity", async (context) => {
  const options = await fixture(context);
  const identity = await runEvidence("--record", options);
  assert.deepEqual(identity, {
    repository: "example/api",
    head,
    base,
    commit,
    tree,
    workflow,
    runId: "123",
    attempt: "1",
  });
  assert.deepEqual(options.outputs, [
    { artifact: "coverage-123-1", attempt: "1" },
  ]);
  assert.deepEqual(
    await readManifest(options.root),
    evidenceManifest(identity, Buffer.from(lcov())),
  );
  await runEvidence("--verify-coverage", options);
  assert.equal(options.outputs.length, 1);
});

test("hashes report bytes without rewriting CRLF or Windows source separators", async (context) => {
  const options = await fixture(context);
  const report = Buffer.from(lcov("src\\example.ts").replaceAll("\n", "\r\n"));
  await writeFile(path.join(options.root, "coverage/lcov.info"), report);
  await runEvidence("--record", options);
  const manifest = await readManifest(options.root);
  assert.equal(manifest.coverage.bytes, report.length);
  assert.equal(
    manifest.coverage.sha256,
    createHash("sha256").update(report).digest("hex"),
  );
  await runEvidence("--verify-coverage", options);
});

test("supports actual push and manual dispatch payloads", () => {
  const options = identityOptions();
  options.environment.GITHUB_EVENT_NAME = "push";
  options.event = {
    repository: { full_name: "example/api" },
    before: base,
    after: commit,
  };
  assert.equal(sourceIdentity(options).base, base);
  assert.equal(sourceIdentity(options).head, commit);
  options.event.before = "0".repeat(40);
  assert.equal(sourceIdentity(options).base, null);
  options.environment.GITHUB_EVENT_NAME = "workflow_dispatch";
  options.event = { repository: { full_name: "example/api" } };
  assert.equal(sourceIdentity(options).base, null);
});

test("rejects missing or inconsistent trusted event and checkout identity", () => {
  const changes = [
    (o) => {
      o.environment.GITHUB_SHA = head;
    },
    (o) => {
      o.environment.GITHUB_REPOSITORY = "foreign/repo";
    },
    (o) => {
      o.environment.GITHUB_REPOSITORY = "../repo";
    },
    (o) => {
      o.event.pull_request.head.sha = "0".repeat(40);
    },
    (o) => {
      o.event.pull_request.base.sha = undefined;
    },
    (o) => {
      o.event.pull_request.base.repo.full_name = "foreign/repo";
    },
    (o) => {
      o.environment.GITHUB_RUN_ID = "123\nartifact=foreign";
    },
    (o) => {
      o.environment.GITHUB_RUN_ATTEMPT = "0";
    },
    (o) => {
      o.environment.GITHUB_EVENT_NAME = "pull_request_target";
    },
    (o) => {
      o.git = (args) =>
        args[0] === "diff" ? "src/changed.ts" : identityOptions().git(args);
    },
    (o) => {
      o.git = (args) =>
        args[1] === "HEAD:.github/workflows/ci.yml"
          ? "invalid"
          : identityOptions().git(args);
    },
    (o) => {
      o.environment.GITHUB_EVENT_NAME = "push";
      o.event.before = base;
      o.event.after = head;
    },
  ];
  for (const change of changes) {
    const options = identityOptions();
    change(options);
    assert.throws(() => sourceIdentity(options), /exact clean checkout/);
  }
});

test("rejects tampered identity, report metadata and measured bytes", async (context) => {
  const options = await fixture(context);
  await runEvidence("--record", options);
  const original = await readManifest(options.root);
  for (const key of Object.keys(original.identity)) {
    const manifest = structuredClone(original);
    manifest.identity[key] = "tampered";
    await putManifest(options.root, manifest);
    await assert.rejects(
      runEvidence("--verify-coverage", options),
      /does not match/,
    );
  }
  for (const change of [
    (m) => {
      m.schemaVersion = 2;
    },
    (m) => {
      m.coverage.path = "../lcov.info";
    },
    (m) => {
      m.coverage.bytes++;
    },
    (m) => {
      m.coverage.sha256 = "0".repeat(64);
    },
    (m) => {
      m.identity.extra = "not-attested";
    },
  ]) {
    const manifest = structuredClone(original);
    change(manifest);
    await putManifest(options.root, manifest);
    await assert.rejects(
      runEvidence("--verify-coverage", options),
      /does not match/,
    );
  }
  await putManifest(options.root, original);
  await writeFile(
    path.join(options.root, "coverage/lcov.info"),
    lcov().replace("DA:1,1", "DA:1,0"),
  );
  await assert.rejects(
    runEvidence("--verify-coverage", options),
    /does not match/,
  );
});

test("revalidates the actual current head, merge base, tested tree and workflow", async (context) => {
  const options = await fixture(context);
  await runEvidence("--record", options);
  for (const key of ["head", "base"]) {
    const changed = structuredClone(options.event);
    changed.pull_request[key].sha = "f".repeat(40);
    await assert.rejects(
      runEvidence("--verify-coverage", { ...options, event: changed }),
      /does not match/,
    );
  }
  for (const command of ["HEAD^{tree}", "HEAD:.github/workflows/ci.yml"]) {
    await assert.rejects(
      runEvidence("--verify-coverage", {
        ...options,
        git: (args) =>
          args[1] === command ? "f".repeat(40) : options.git(args),
      }),
      /does not match/,
    );
  }
});

test("analysis reruns accept only the exact successful producer attempt output", async (context) => {
  const options = await fixture(context);
  await runEvidence("--record", options);
  options.environment.GITHUB_RUN_ATTEMPT = "2";
  await runEvidence("--verify-coverage", options);
  for (const attempt of [undefined, "0", "3", "2"]) {
    await assert.rejects(
      runEvidence("--verify-coverage", {
        ...options,
        environment: {
          ...options.environment,
          CI_EVIDENCE_PRODUCER_ATTEMPT: attempt,
        },
      }),
      attempt === "2"
        ? /does not match/
        : /producer attempt|exact clean checkout/,
    );
  }
  await assert.rejects(
    runEvidence("--verify-coverage", {
      ...options,
      environment: { ...options.environment, GITHUB_RUN_ID: "124" },
    }),
    /does not match/,
  );
});

test("rejects empty, truncated and malformed LCOV", async (context) => {
  const options = await fixture(context);
  for (const bytes of [
    "",
    "not a report",
    "SF:src/example.ts\nDA:1,1\n",
    "SF:src/example.ts\nend_of_record\n",
    "DA:1,1\nend_of_record\n",
    lcov().replace("DA:1,1", "DA:1,-1"),
    lcov().replace("DA:1,1", "DA:0,1"),
    lcov().replace("end_of_record", "SF:src/example.ts"),
    Buffer.from([255]),
  ]) {
    await writeFile(path.join(options.root, "coverage/lcov.info"), bytes);
    await assert.rejects(readCoverage(options.root));
  }
});

test("rejects oversized coverage before reading report contents", async (context) => {
  const options = await fixture(context);
  await truncate(
    path.join(options.root, "coverage/lcov.info"),
    maximumCoverageBytes + 1,
  );
  await assert.rejects(readCoverage(options.root), /at most 32 MiB/);
});

test("validates every source in a report containing multiple records", async (context) => {
  const options = await fixture(context);
  await writeFile(path.join(options.root, "src/another.ts"), "export {};\n");
  const report = lcov() + lcov("src/another.ts");
  await writeFile(path.join(options.root, "coverage/lcov.info"), report);
  assert.equal((await readCoverage(options.root)).toString(), report);

  await writeFile(
    path.join(options.root, "coverage/lcov.info"),
    report + lcov("src/missing.ts"),
  );
  await assert.rejects(readCoverage(options.root), { code: "ENOENT" });
});

test("rejects absolute, escaping, ambiguous and missing source paths", async (context) => {
  const options = await fixture(context);
  for (const source of [
    "../example.ts",
    "/src/example.ts",
    "C:\\src\\example.ts",
    "\\\\host\\src\\example.ts",
    "file:src/example.ts",
    "src/../example.ts",
    "src//example.ts",
    "src/./example.ts",
    "src/missing.ts",
  ]) {
    await writeFile(
      path.join(options.root, "coverage/lcov.info"),
      lcov(source),
    );
    await assert.rejects(readCoverage(options.root));
  }
});

test("rejects linked coverage and source directories without following their contents", async (context) => {
  const options = await fixture(context);
  await mkdir(path.join(options.root, "linked-source"));
  await writeFile(
    path.join(options.root, "linked-source/example.ts"),
    "synthetic source",
  );
  await symlink(
    path.join(options.root, "linked-source"),
    path.join(options.root, "src/link"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await writeFile(
    path.join(options.root, "coverage/lcov.info"),
    lcov("src/link/example.ts"),
  );
  await assert.rejects(readCoverage(options.root), /must not contain links/);
  await rm(path.join(options.root, "coverage"), { recursive: true });
  await mkdir(path.join(options.root, "linked-coverage"));
  await writeFile(path.join(options.root, "linked-coverage/lcov.info"), lcov());
  await symlink(
    path.join(options.root, "linked-coverage"),
    path.join(options.root, "coverage"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(readCoverage(options.root), /must not contain links/);
});

test("fails closed for missing, oversized, invalid or non-file manifests", async (context) => {
  const options = await fixture(context);
  await assert.rejects(runEvidence("--verify-coverage", options), {
    code: "ENOENT",
  });
  const filename = path.join(options.root, "coverage/ci-evidence.json");
  await writeFile(filename, "invalid JSON");
  await assert.rejects(runEvidence("--verify-coverage", options), SyntaxError);
  await truncate(filename, 16 * 1024 + 1);
  await assert.rejects(runEvidence("--verify-coverage", options), /too large/);
  await rm(filename);
  await mkdir(filename);
  await assert.rejects(
    runEvidence("--record", options),
    /must not contain links/,
  );
});

test("CLI handler publishes the artifact and rejects tampering in an isolated subprocess", async (context) => {
  const options = await fixture(context);
  const eventPath = path.join(options.root, "event.json");
  const outputPath = path.join(options.root, "output.txt");
  await writeFile(eventPath, JSON.stringify(options.event));
  const environment = {
    ...options.environment,
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_OUTPUT: outputPath,
  };
  const script = `import { runEvidence } from ${JSON.stringify(new URL("./ci-evidence.mjs", import.meta.url).href)};
    const input = JSON.parse(process.argv[1]);
    const values = ${JSON.stringify({ "rev-parse HEAD": commit, "rev-parse HEAD^{tree}": tree, "rev-parse HEAD:.github/workflows/ci.yml": workflow, "diff --name-only HEAD --": "" })};
    await runEvidence(process.argv[2], { ...input, git: args => values[args.join(" ")] });`;
  const run = (mode) =>
    spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        script,
        JSON.stringify({ root: options.root, environment }),
        mode,
      ],
      { cwd: options.root, encoding: "utf8", windowsHide: true },
    );
  assert.equal(run("--record").status, 0);
  assert.equal(
    await readFile(outputPath, "utf8"),
    "artifact=coverage-123-1\nattempt=1\n",
  );
  assert.equal(run("--verify-coverage").status, 0);
  await writeFile(
    path.join(options.root, "coverage/lcov.info"),
    lcov().replace("DA:1,1", "DA:1,0"),
  );
  const failed = run("--verify-coverage");
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /does not match/);
  const invalid = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./ci-evidence.mjs", import.meta.url)), "--invalid"],
    { cwd: options.root, encoding: "utf8", windowsHide: true },
  );
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Usage:/);
});

test(
  "direct CLI records and verifies evidence from a real synthetic Git checkout",
  {
    skip: existsSync("/usr/bin/git")
      ? false
      : "The Ubuntu CI evidence CLI requires /usr/bin/git, which is unavailable on this host.",
  },
  async (context) => {
    const { root } = await fixture(context);
    await mkdir(path.join(root, ".github/workflows"), { recursive: true });
    await mkdir(path.join(root, "scripts"));
    await writeFile(
      path.join(root, ".github/workflows/ci.yml"),
      "name: Synthetic CI\non: push\njobs: {}\n",
    );
    const scriptPath = path.join(root, "scripts/ci-evidence.mjs");
    await copyFile(new URL("./ci-evidence.mjs", import.meta.url), scriptPath);
    const git = (...args) => {
      const result = spawnSync("/usr/bin/git", args, {
        cwd: root,
        encoding: "utf8",
        env: { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
        windowsHide: true,
      });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    git("init");
    git("config", "user.name", "Synthetic CI Fixture");
    git("config", "user.email", "ci-fixture@example.invalid");
    git("config", "commit.gpgSign", "false");
    git("config", "core.hooksPath", "/dev/null");
    git(
      "add",
      ".github/workflows/ci.yml",
      "src/example.ts",
      "coverage/lcov.info",
    );
    git("commit", "-m", "test: create synthetic CI evidence fixture");
    const fixtureCommit = git("rev-parse", "HEAD");
    const fixtureTree = git("rev-parse", "HEAD^{tree}");
    const fixtureWorkflow = git("rev-parse", "HEAD:.github/workflows/ci.yml");
    const eventPath = path.join(root, "event.json");
    const outputPath = path.join(root, "output.txt");
    await writeFile(
      eventPath,
      JSON.stringify({
        repository: { full_name: "example/api" },
        pull_request: {
          head: { sha: fixtureCommit },
          base: { sha: fixtureCommit, repo: { full_name: "example/api" } },
        },
      }),
    );
    const environment = {
      CI_EVIDENCE_PRODUCER_ATTEMPT: "2",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      GITHUB_REPOSITORY: "example/api",
      GITHUB_RUN_ATTEMPT: "2",
      GITHUB_RUN_ID: "456",
      GITHUB_SHA: fixtureCommit,
    };
    const run = (mode) =>
      spawnSync(process.execPath, [scriptPath, mode], {
        cwd: root,
        encoding: "utf8",
        env: environment,
        windowsHide: true,
      });

    const recorded = run("--record");
    assert.equal(recorded.status, 0, recorded.stderr);
    assert.equal(
      await readFile(outputPath, "utf8"),
      "artifact=coverage-456-2\nattempt=2\n",
    );
    assert.deepEqual((await readManifest(root)).identity, {
      repository: "example/api",
      head: fixtureCommit,
      base: fixtureCommit,
      commit: fixtureCommit,
      tree: fixtureTree,
      workflow: fixtureWorkflow,
      runId: "456",
      attempt: "2",
    });
    const verified = run("--verify-coverage");
    assert.equal(verified.status, 0, verified.stderr);
  },
);
