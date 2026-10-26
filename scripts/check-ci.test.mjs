import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseWorkflow, validateCiWorkflow } from "./check-ci.mjs";

const workflow = () => ({
  on: {
    pull_request: {
      types: ["opened", "synchronize", "reopened", "ready_for_review"],
    },
    push: { branches: ["main"] },
  },
  jobs: {
    check: {
      "runs-on": "ubuntu-latest",
      steps: [
        { uses: "actions/checkout@synthetic" },
        {
          if: "github.event_name == 'pull_request'",
          run: "node scripts/check-pr-size.mjs",
        },
        { run: "npm ci" },
        { run: "npm run validate -- full" },
        { if: "!cancelled()", uses: "actions/upload-artifact@synthetic" },
      ],
    },
  },
});
const manifest = () => ({
  checks: [
    { ciJobs: ["check"], id: "audit", kind: "required" },
    { ciJobs: ["check"], id: "coverage", kind: "required" },
    { ciJobs: [], id: "manual-smoke", kind: "manual" },
  ],
  phase: "application-services",
});

test("the actual workflow runs every required published check through the canonical full gate", () => {
  const read = (file) =>
    readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const declared = JSON.parse(read(".agents/validation.json"));
  assert.deepEqual(
    validateCiWorkflow(
      parseWorkflow(read(".github/workflows/ci.yml")),
      declared,
    ),
    {
      checks: declared.checks.filter((check) => check.kind === "required")
        .length,
      phase: declared.phase,
    },
  );
  assert.deepEqual(validateCiWorkflow(workflow(), manifest()), {
    checks: 2,
    phase: "application-services",
  });
});

test("the YAML reader rejects malformed syntax and duplicate policy keys", () => {
  for (const source of [
    "on: [pull_request\n",
    "on: pull_request\non: push\n",
    "jobs:\n  check:\n    if: false\n    if: true\n",
  ])
    assert.throws(() => parseWorkflow(source), /valid YAML with unique keys/);
});

test("PR CI rejects routing filters and omitted activity types", () => {
  for (const field of [
    "paths",
    "paths-ignore",
    "branches",
    "branches-ignore",
  ]) {
    const candidate = workflow();
    candidate.on.pull_request[field] = ["src/**"];
    assert.throws(() => validateCiWorkflow(candidate, manifest()), /filters/);
  }
  for (const type of [
    "opened",
    "synchronize",
    "reopened",
    "ready_for_review",
  ]) {
    const candidate = workflow();
    candidate.on.pull_request.types = candidate.on.pull_request.types.filter(
      (value) => value !== type,
    );
    assert.throws(() => validateCiWorkflow(candidate, manifest()), /activity/);
  }
  const candidate = workflow();
  delete candidate.on.pull_request;
  assert.throws(
    () => validateCiWorkflow(candidate, manifest()),
    /pull_request/,
  );
});

test("PR trigger shorthand and unrestricted activity configurations remain valid", () => {
  for (const trigger of [
    "pull_request",
    ["push", "pull_request"],
    { pull_request: null },
  ]) {
    const candidate = workflow();
    candidate.on = trigger;
    assert.equal(validateCiWorkflow(candidate, manifest()).checks, 2);
  }
});

test("missing, conditional, advisory or dependent check jobs cannot stand in for full CI", () => {
  const missing = workflow();
  delete missing.jobs.check;
  assert.throws(() => validateCiWorkflow(missing, manifest()), /check job/);
  for (const policy of [
    { if: "github.event.pull_request.draft == false" },
    { "continue-on-error": true },
    { needs: ["changed-files"] },
    { strategy: { matrix: { os: [] } } },
  ]) {
    const candidate = workflow();
    Object.assign(candidate.jobs.check, policy);
    assert.throws(() => validateCiWorkflow(candidate, manifest()));
  }
});

test("install and full execution cannot be conditional, advisory or redirected", () => {
  for (const position of [2, 3]) {
    for (const policy of [
      { if: "!github.event.pull_request.draft" },
      { "continue-on-error": true },
      { "working-directory": "../other" },
      { shell: "bash {0}; exit 0" },
    ]) {
      const candidate = workflow();
      Object.assign(candidate.jobs.check.steps[position], policy);
      assert.throws(() => validateCiWorkflow(candidate, manifest()));
    }
  }
});

test("CI requires one install and one complete gate in the correct order", () => {
  for (const command of ["npm ci", "npm run validate -- full"]) {
    const omitted = workflow();
    omitted.jobs.check.steps = omitted.jobs.check.steps.filter(
      (step) => step.run !== command,
    );
    assert.throws(() => validateCiWorkflow(omitted, manifest()), /exactly one/);
    const duplicated = workflow();
    duplicated.jobs.check.steps.push({ run: command });
    assert.throws(
      () => validateCiWorkflow(duplicated, manifest()),
      /exactly one/,
    );
  }
  const reordered = workflow();
  [reordered.jobs.check.steps[2], reordered.jobs.check.steps[3]] = [
    reordered.jobs.check.steps[3],
    reordered.jobs.check.steps[2],
  ];
  assert.throws(() => validateCiWorkflow(reordered, manifest()), /before/);
  const ignoredFailure = workflow();
  ignoredFailure.jobs.check.steps[3].run = "npm run validate -- full || true";
  assert.throws(
    () => validateCiWorkflow(ignoredFailure, manifest()),
    /exactly one/,
  );
});

test("unexpected default directories and a runner transition require explicit CI policy work", () => {
  for (const owner of ["workflow", "job"]) {
    const candidate = workflow();
    const target = owner === "workflow" ? candidate : candidate.jobs.check;
    target.defaults = { run: { "working-directory": "src" } };
    assert.throws(() => validateCiWorkflow(candidate, manifest()), /root/);
    target.defaults = { run: { shell: 'bash -c "{0}; true"' } };
    assert.throws(
      () => validateCiWorkflow(candidate, manifest()),
      /default shell/,
    );
  }
  const candidate = workflow();
  candidate.jobs.check["runs-on"] = "windows-latest";
  assert.throws(() => validateCiWorkflow(candidate, manifest()), /runner/);
});

test("new required checks cannot silently claim another CI job", () => {
  for (const ciJobs of [undefined, [], ["build"], ["check", "visual"]]) {
    const declared = manifest();
    declared.checks[0].ciJobs = ciJobs;
    assert.throws(
      () => validateCiWorkflow(workflow(), declared),
      /multi-job phase/,
    );
  }
});
