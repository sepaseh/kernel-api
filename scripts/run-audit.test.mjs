import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { auditArguments, runAudit } from "./run-audit.mjs";

const clean = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
const report = (vulnerabilities = clean) =>
  JSON.stringify({ metadata: { vulnerabilities } });

test("the audit wrapper invokes npm exactly once without a shell and retains strict classification", () => {
  const calls = [];
  const environment = { npm_execpath: "/synthetic/npm.cjs" };
  assert.deepEqual(
    runAudit({
      root: "/synthetic",
      environment,
      execute: (...args) => {
        calls.push(args);
        return { status: 0, stdout: report() };
      },
    }),
    clean,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], process.execPath);
  assert.deepEqual(calls[0][1], [environment.npm_execpath, ...auditArguments]);
  assert.equal(calls[0][2].shell, undefined);
  assert.equal(calls[0][2].cwd, "/synthetic");
  assert.equal(calls[0][2].windowsHide, true);
  assert.throws(() => runAudit({ environment: {} }), /through npm/);
  for (const result of [
    { status: 1, stdout: report({ ...clean, high: 1, total: 1 }) },
    { status: 0, stdout: report({ ...clean, critical: 1, total: 1 }) },
    { status: null, stdout: report() },
    { status: 0, stdout: "" },
    { status: 0, stdout: "not json" },
    {
      status: 0,
      stdout: JSON.stringify({ error: "Synthetic unavailable service" }),
    },
  ])
    assert.throws(() => runAudit({ environment, execute: () => result }));
});

const cases = [
  { name: "clean audit", stdout: report(), status: 0, expected: 0 },
  {
    name: "blocking audit",
    stdout: report({ ...clean, high: 1, total: 1 }),
    status: 1,
    expected: 1,
  },
  { name: "missing output", stdout: "", status: 0, expected: 1 },
  { name: "malformed output", stdout: "not json", status: 0, expected: 1 },
  {
    name: "unavailable service",
    stdout: JSON.stringify({ error: "Synthetic unavailable report" }),
    status: 1,
    expected: 1,
  },
];

for (const scenario of cases)
  test(`the real audit CLI runs once and fails closed for ${scenario.name}`, async (context) => {
    const temporaryRoot = await realpath(tmpdir());
    const directory = await mkdtemp(
      path.join(temporaryRoot, "kernel-audit-cli-"),
    );
    context.after(async () => {
      const ownedDirectory = await realpath(directory);
      assert.equal(path.dirname(ownedDirectory), temporaryRoot);
      assert.ok(path.basename(ownedDirectory).startsWith("kernel-audit-cli-"));
      await rm(ownedDirectory, { recursive: true, force: true });
    });
    const fixture = path.join(directory, "npm.cjs");
    const calls = path.join(directory, "calls.txt");
    await writeFile(
      fixture,
      [
        'const fs = require("node:fs");',
        'fs.appendFileSync(process.env.AUDIT_CALLS, "audit\\n");',
        `if (JSON.stringify(process.argv.slice(2)) !== ${JSON.stringify(JSON.stringify(auditArguments))}) process.exit(2);`,
        `process.stdout.write(${JSON.stringify(scenario.stdout)});`,
        'process.stderr.write("synthetic private diagnostic\\n");',
        `process.exitCode = ${scenario.status};`,
      ].join("\n"),
    );
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./run-audit.mjs", import.meta.url))],
      {
        cwd: directory,
        env: {
          npm_execpath: fixture,
          AUDIT_CALLS: calls,
          ...(process.env.NODE_V8_COVERAGE
            ? { NODE_V8_COVERAGE: process.env.NODE_V8_COVERAGE }
            : {}),
        },
        encoding: "utf8",
        windowsHide: true,
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, scenario.expected);
    assert.equal(await readFile(calls, "utf8"), "audit\n");
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /synthetic private diagnostic|Synthetic unavailable report/,
    );
    if (scenario.expected === 0)
      assert.match(result.stdout, /Online npm audit passed/);
    else assert.match(result.stderr, /Online npm audit/);
  });
