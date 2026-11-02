import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { format } from "prettier";
import { stringify } from "yaml";

import {
  actions,
  checksForPhase,
  ciProfilesForPhase,
  coveragePlan,
  externalWorkflows,
  foundationDependencies,
  foundationFiles,
  inspectFormatting,
  inspectGuidance,
  inspectPolicy,
  inspectSnapshot,
  packageScripts,
  parseYaml,
  requiredChecks,
  reviewedOverrides,
  runCheck,
  runFull,
  runProfile,
  sourceChecks,
  testFiles,
  validateAuditResult,
  validateCiWorkflow,
  validateCodeRabbit,
  validateCodeqlWorkflow,
  validateInventory,
  validateManifest,
  validateMarkdownLinks,
  validateNavigation,
  validatePackage,
  validateRuleset,
  validateWorkflowTrust,
} from "./check-governance.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));
const readSource = (file) => readFile(path.join(repository, file), "utf8");
const packageFixture = {
  name: "kernel-api",
  private: true,
  version: "1.0.0",
  type: "module",
  scripts: packageScripts("governance"),
  devDependencies: { prettier: "3.9.10", yaml: "2.9.1" },
};
const syntheticIntegrity = "sha512-" + Buffer.alloc(64, 7).toString("base64");
const lockForPackage = (pkg) => ({
  name: pkg.name,
  lockfileVersion: 3,
  packages: {
    "": {
      name: pkg.name,
      version: pkg.version,
      devDependencies: pkg.devDependencies,
    },
    ...Object.fromEntries(
      Object.entries(pkg.devDependencies).map(([name, version]) => [
        `node_modules/${name}`,
        { version, dev: true, integrity: syntheticIntegrity },
      ]),
    ),
  },
});
const lockFixture = lockForPackage(packageFixture);
const checkScripts = {
  snapshot: "check:snapshot",
  "ci-policy": "check:ci",
  "actions-lint": "check:actions",
  audit: "audit",
  boundaries: "check:boundaries",
  typecheck: "typecheck",
  lint: "lint",
  format: "format:check",
  guidance: "check:guidance",
  "coverage-tests": "test:coverage",
  "audit-helper-tests": "test:audit",
};
const manifestForPhase = (phase) => ({
  schemaVersion: 1,
  phase,
  applicationReady: false,
  checks: checksForPhase(phase).map((id) => ({
    id,
    command: `npm run ${checkScripts[id]}`,
    kind: "required",
    ciJobs: [
      id === "audit"
        ? "audit"
        : ["coverage-tests", "audit-helper-tests"].includes(id)
          ? "governance"
          : "quality",
    ],
    scopes: [phase],
  })),
  profiles: { full: [...checksForPhase(phase)], ...ciProfilesForPhase(phase) },
  externalWorkflows: structuredClone(externalWorkflows),
});
const manifestFixture = manifestForPhase("governance");
const ciText = await readSource(".github/workflows/ci.yml");
const codeqlText = await readSource(".github/workflows/codeql.yml");
const files = [
  ".github/bootstrap-policy.json",
  ".agents/validation.json",
  ".agents/settings.json",
  ".agents/navigation.json",
  ".agents/rules/safety.md",
  ".agents/skills/commit/SKILL.md",
  ".github/workflows/ci.yml",
  ".github/workflows/codeql.yml",
  ".github/rulesets/main.json",
  ".coderabbit.yaml",
  ".prettierrc.json",
  "package.json",
  "package-lock.json",
  "sonar-project.properties",
  "README.md",
  ...testFiles,
  ...testFiles.map((file) => file.replace(".test.mjs", ".mjs")),
];
const extraSourceFiles = [
  ...foundationFiles,
  "eslint.config.mjs",
  "tsconfig.json",
  "scripts/check-boundaries.mjs",
  "scripts/check-boundaries.test.mjs",
  "scripts/run-audit.mjs",
  "scripts/run-audit.test.mjs",
  "scripts/merge-coverage.mjs",
  "scripts/merge-coverage.test.mjs",
];
const policy = (phase = "governance") => ({
  schemaVersion: 1,
  phase,
  applicationReady: false,
  allowedFiles: [...files, ...(phase === "governance" ? [] : extraSourceFiles)],
});
const rabbit = () => ({
  reviews: {
    auto_review: {
      enabled: false,
      drafts: false,
      auto_incremental_review: false,
    },
    auto_approvals: { enabled: true, allow_author_approval: false },
    review_status: true,
  },
});
const ruleset = () => ({
  name: "Synthetic main",
  target: "branch",
  enforcement: "active",
  bypass_actors: [],
  conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
  rules: [
    { type: "deletion" },
    { type: "non_fast_forward" },
    { type: "required_linear_history" },
    {
      type: "pull_request",
      parameters: {
        required_approving_review_count: 1,
        dismiss_stale_reviews_on_push: true,
        require_last_push_approval: true,
        required_review_thread_resolution: true,
      },
    },
    {
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: true,
        do_not_enforce_on_create: false,
        required_status_checks: [
          ["check", 15368],
          ["CodeQL", 57789],
          ["SonarQube Cloud analysis", 15368],
          ["SonarCloud Code Analysis", 12526],
          ["CodeRabbit", 347564],
        ].map(([context, integration_id]) => ({ context, integration_id })),
      },
    },
  ],
});
const navigation = () => ({
  schemaVersion: 1,
  tasks: [
    {
      id: "governance",
      when: "Change governance validation or protection.",
      owners: ["scripts/check-governance.mjs"],
      contracts: [".github/bootstrap-policy.json"],
      tests: ["scripts/check-governance.test.mjs"],
      rules: [".agents/rules/safety.md"],
      checks: [...requiredChecks],
    },
  ],
});
const settings = (phase = "governance") => ({
  rules: [".agents/rules/safety.md"],
  skills: [".agents/skills/commit/SKILL.md"],
  optionalHooks: [],
  recommendedChecks: manifestForPhase(phase).checks.map(
    ({ command }) => command,
  ),
  recommendedChecksSource: { path: ".agents/validation.json", profile: "full" },
  navigation: ".agents/navigation.json",
  validation: ".agents/validation.json",
});
const sonar =
  [
    "sonar.sources=scripts",
    "sonar.tests=scripts",
    "sonar.test.inclusions=scripts/*.test.mjs",
    "sonar.exclusions=scripts/*.test.mjs",
    "sonar.javascript.lcov.reportPaths=coverage/lcov.info",
    "sonar.qualitygate.wait=false",
  ].join("\n") + "\n";

const fixture = async (context, phase = "governance") => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kernel-governance-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const put = async (file, contents) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), contents, "utf8");
  };
  const json = (file, value) =>
    put(file, JSON.stringify(value, null, 2) + "\n");
  const published = policy(phase).allowedFiles;
  await Promise.all(
    published.map((file) => put(file, "// Synthetic fixture.\n")),
  );
  const pkg =
    phase === "governance"
      ? packageFixture
      : {
          ...packageFixture,
          scripts: packageScripts(phase),
          devDependencies: foundationDependencies,
          overrides: reviewedOverrides,
        };
  await json(".github/bootstrap-policy.json", policy(phase));
  await json("package.json", pkg);
  await json("package-lock.json", lockForPackage(pkg));
  await json(".agents/validation.json", manifestForPhase(phase));
  await json(".agents/navigation.json", navigation());
  await json(".agents/settings.json", settings(phase));
  await json(".github/rulesets/main.json", ruleset());
  await json(".prettierrc.json", {});
  await put(".github/workflows/ci.yml", ciText);
  await put(".github/workflows/codeql.yml", codeqlText);
  await put(".coderabbit.yaml", stringify(rabbit()));
  await put(
    "sonar-project.properties",
    phase === "governance"
      ? sonar
      : sonar
          .replaceAll("=scripts\n", "=src,scripts\n")
          .replaceAll(
            "=scripts/*.test.mjs",
            phase === "foundation"
              ? "=src/**/*.test.ts,scripts/*.test.mjs"
              : "=src/**/*.test.ts,src/test/**,scripts/*.test.mjs,scripts/*.test-support.mjs,scripts/test-native-release.mjs,scripts/test-docker-release.mjs",
          ),
  );
  for (const file of files.filter((file) => /\.md$/i.test(file)))
    await put(file, "# Synthetic governance\n");
  await put(
    "README.md",
    "# Synthetic governance\n\nRead the [safety rule](.agents/rules/safety.md).\n",
  );
  return { root, put, json };
};

test("inventory permits explicit governance paths without a file-count limit", () => {
  assert.equal(validateInventory(policy()).size, files.length);
  assert.ok(
    validateInventory({
      ...policy(),
      allowedFiles: [
        ...files,
        ...Array.from(
          { length: 110 },
          (_, index) => `docs/governance-${index}.md`,
        ),
      ],
    }).size > 100,
  );
  for (const change of [
    { phase: "local-runtime" },
    { applicationReady: true },
    { allowedFiles: [] },
    { allowedFiles: [...files, files[0]] },
    {
      allowedFiles: files.filter(
        (file) => file !== "scripts/ci-evidence.test.mjs",
      ),
    },
  ])
    assert.throws(() => validateInventory({ ...policy(), ...change }));
  for (const file of [
    "src/index.ts",
    "drizzle/0000.sql",
    "deploy/api.yml",
    ".env",
    ".agents/settings.local.json",
    "../outside.md",
    "C:/private.md",
    "docs/topic*.md",
    "docs\\topic.md",
    "private.key",
    "docs//topic.md",
  ])
    assert.throws(
      () => validateInventory({ ...policy(), allowedFiles: [...files, file] }),
      file,
    );
});

test("snapshot validates owned inventory while leaving ambient unpublished API source alone", async (context) => {
  const { root, put } = await fixture(context);
  await put(
    "src/index.ts",
    "Unpublished local material is never parsed or executed.",
  );
  assert.deepEqual(
    await inspectSnapshot(root, { trackedFiles: ["README.md"] }),
    { phase: "governance", files: files.length, applicationReady: false },
  );
  await assert.rejects(
    inspectSnapshot(root, { trackedFiles: ["src/index.ts"] }),
    /outside the declared/,
  );
  await rm(path.join(root, "scripts/ci-evidence.mjs"));
  await assert.rejects(inspectSnapshot(root), { code: "ENOENT" });
});

test("snapshot rejects directory junctions or symlinks in published paths", async (context) => {
  const { root } = await fixture(context);
  const original = path.join(root, "original-scripts");
  await rename(path.join(root, "scripts"), original);
  await symlink(
    original,
    path.join(root, "scripts"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(inspectSnapshot(root), /symbolic links/);
});

test("tooling manifest and lock cannot silently publish APIs, install hooks, or dependency drift", () => {
  validatePackage(packageFixture, lockFixture);
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
    "workspaces",
    "overrides",
  ])
    assert.throws(() =>
      validatePackage({ ...packageFixture, [field]: {} }, lockFixture),
    );
  for (const change of [
    { private: false },
    { type: "commonjs" },
    { devDependencies: { prettier: "*", yaml: "2.9.1" } },
    { scripts: { ...packageFixture.scripts, preinstall: "node install.mjs" } },
  ])
    assert.throws(() =>
      validatePackage({ ...packageFixture, ...change }, lockFixture),
    );
  for (const mutate of [
    (lock) => {
      lock.lockfileVersion = 2;
    },
    (lock) => {
      lock.packages[""].devDependencies.yaml = "*";
    },
    (lock) => {
      lock.packages["node_modules/runtime-api"] = { version: "1.0.0" };
    },
    (lock) => {
      delete lock.packages["node_modules/yaml"].integrity;
    },
  ]) {
    const lock = structuredClone(lockFixture);
    mutate(lock);
    assert.throws(() => validatePackage(packageFixture, lock));
  }
});

test("the canonical full profile cannot omit, duplicate, demote, or replace a real check", () => {
  validateManifest(manifestFixture, packageFixture);
  for (const mutate of [
    (manifest) => {
      manifest.phase = "local-runtime";
    },
    (manifest) => {
      manifest.externalWorkflows.pop();
    },
    (manifest) => {
      manifest.externalWorkflows[1].mode = "ci";
    },
    (manifest) => {
      manifest.profiles.full.pop();
    },
    (manifest) => {
      manifest.profiles["ci-quality"].pop();
    },
    (manifest) => {
      manifest.profiles["ci-quality"].push("coverage-tests");
    },
    (manifest) => {
      manifest.checks[0].ciJobs = ["quality", "governance"];
    },
    (manifest) => {
      manifest.profiles.full.push("snapshot");
    },
    (manifest) => {
      manifest.checks[0].kind = "advisory";
    },
    (manifest) => {
      manifest.checks[0].ciJobs = ["other-job"];
    },
    (manifest) => {
      manifest.checks[0].scopes = ["http-transport"];
    },
    (manifest) => {
      manifest.checks[0].command = "npm run echo-success";
    },
  ]) {
    const manifest = structuredClone(manifestFixture);
    mutate(manifest);
    assert.throws(() => validateManifest(manifest, packageFixture));
  }
  const pkg = structuredClone(packageFixture);
  pkg.scripts["check:snapshot"] = 'node -e "process.exit(0)"';
  assert.throws(() => validateManifest(manifestFixture, pkg), /no-op/);
});

test("full execution runs each canonical check once and stops at its first failure", async (context) => {
  const { root } = await fixture(context);
  const executed = [];
  assert.equal(
    await runFull(root, async (name) => {
      executed.push(name);
      return { status: 0 };
    }),
    7,
  );
  assert.deepEqual(
    executed,
    manifestFixture.checks.map(({ command }) =>
      command.slice("npm run ".length),
    ),
  );
  const failed = [];
  await assert.rejects(
    runFull(root, async (name) => {
      failed.push(name);
      return { status: name === "audit" ? 1 : 0 };
    }),
    /audit/,
  );
  assert.equal(failed.length, 4);
  await assert.rejects(
    runFull(root, async () => ({
      status: null,
      error: new Error("synthetic launch failure"),
    })),
    /snapshot/,
  );
  await assert.rejects(runCheck("workspace", root), /Usage/);
});

test("CI profiles partition the canonical full gate and execute each check once", async (context) => {
  const { root } = await fixture(context);
  const executed = [];
  for (const profile of Object.keys(ciProfilesForPhase("governance"))) {
    await runProfile(profile, root, async (name) => {
      executed.push(name);
      return { status: 0 };
    });
  }
  assert.equal(executed.length, manifestFixture.profiles.full.length);
  assert.equal(new Set(executed).size, executed.length);
  assert.deepEqual(
    new Set(executed),
    new Set(
      Object.values(checkScripts).filter((name) =>
        manifestFixture.checks.some(
          (check) => check.command === `npm run ${name}`,
        ),
      ),
    ),
  );
  await assert.rejects(
    runProfile("ci-missing", root, async () => ({ status: 0 })),
    /declared validation profile/,
  );
  const failed = [];
  await assert.rejects(
    runProfile("ci-quality", root, async (name) => {
      failed.push(name);
      return { status: name === "check:ci" ? 1 : 0 };
    }),
    /ci-policy/,
  );
  assert.deepEqual(failed, ["check:snapshot", "check:ci"]);
});

test("the actual aggregate rejects missing, failed, skipped and cancelled suites", () => {
  const command = parseYaml(ciText).jobs.check.steps[0].run;
  const script = /^node -e "(.*)"$/.exec(command)?.[1];
  assert.ok(script);
  const healthy = Object.fromEntries(
    ["quality", "audit", "governance"].map((job) => [
      job,
      { result: "success" },
    ]),
  );
  const execute = (needs) =>
    spawnSync(process.execPath, ["-e", script], {
      env: { CI_NEEDS: JSON.stringify(needs) },
      windowsHide: true,
    }).status;
  assert.equal(execute(healthy), 0);
  for (const job of Object.keys(healthy)) {
    for (const result of [
      undefined,
      "failure",
      "skipped",
      "cancelled",
      "pending",
    ]) {
      const needs = structuredClone(healthy);
      needs[job] = { result };
      assert.equal(execute(needs), 1);
    }
    const missing = structuredClone(healthy);
    delete missing[job];
    assert.equal(execute(missing), 1);
  }
  assert.equal(execute({}), 1);
});

test("CI policy rejects conditional, filtered, duplicated, advisory, or redirected validation", () => {
  const healthy = parseYaml(ciText);
  validateCiWorkflow(healthy);
  for (const mutate of [
    (ci) => {
      ci.on.pull_request.paths = ["docs/**"];
    },
    (ci) => {
      ci.on.pull_request.branches = ["main"];
    },
    (ci) => {
      ci.jobs.check.if = "false";
    },
    (ci) => {
      ci.jobs.check.needs.pop();
    },
    (ci) => {
      ci.jobs.governance.if = "false";
    },
    (ci) => {
      ci.jobs.audit["continue-on-error"] = true;
    },
    (ci) => {
      ci.jobs.check["continue-on-error"] = true;
    },
    (ci) => {
      ci.jobs.quality.steps[3].if = "github.event_name != 'pull_request'";
    },
    (ci) => {
      ci.jobs.quality.steps[3]["working-directory"] = "another-project";
    },
    (ci) => {
      ci.jobs.quality.steps[3].run += " || true";
    },
    (ci) => {
      ci.jobs.check.steps.push({ run: "npm run validate -- full" });
    },
    (ci) => {
      ci.jobs.hidden = { steps: [{ run: "npm test" }] };
    },
    (ci) => {
      ci.defaults = { run: { shell: "custom-shell" } };
    },
  ]) {
    const changed = structuredClone(healthy);
    mutate(changed);
    assert.throws(() => validateCiWorkflow(changed));
  }
});

test("Sonar policy protects secret isolation, scanner execution, and same-run measured coverage", () => {
  const healthy = parseYaml(ciText);
  for (const mutate of [
    (ci) => {
      delete ci.jobs.analysis.needs;
    },
    (ci) => {
      delete ci.jobs.analysis.if;
    },
    (ci) => {
      ci.jobs.analysis.steps[0].with.ref = "main";
    },
    (ci) => {
      ci.jobs.analysis.steps[3].with.name = "unrelated-coverage";
    },
    (ci) => {
      ci.jobs.analysis.steps[3].with["digest-mismatch"] = "warn";
    },
    (ci) => {
      ci.jobs.analysis.steps[4].run = "echo verified";
    },
    (ci) => {
      ci.jobs.analysis.steps[5].run = "npm test";
    },
    (ci) => {
      ci.jobs.analysis.steps[6].uses = "SonarSource/sonarqube-scan-action@main";
    },
    (ci) => {
      ci.jobs.analysis.steps[6].with.args =
        "-Dsonar.projectKey=${{ vars.SONAR_PROJECT_KEY }} -Dsonar.scm.revision=${{ github.sha }}";
    },
    (ci) => {
      ci.jobs.governance.steps[5].with["if-no-files-found"] = "warn";
    },
  ]) {
    const changed = structuredClone(healthy);
    mutate(changed);
    assert.throws(() => validateCiWorkflow(changed));
  }
});

test("CodeQL cannot skip stacked PRs, weaken queries, run source or broaden upload permissions", () => {
  const healthy = parseYaml(codeqlText);
  validateCodeqlWorkflow(healthy);
  for (const mutate of [
    (workflow) => {
      delete workflow.on.pull_request;
    },
    (workflow) => {
      workflow.on.pull_request = { branches: ["main"] };
    },
    (workflow) => {
      workflow.on.pull_request = { paths: ["src/**"] };
    },
    (workflow) => {
      workflow.on.pull_request = { types: ["opened"] };
    },
    (workflow) => {
      delete workflow.on.schedule;
    },
    (workflow) => {
      delete workflow.on.workflow_dispatch;
    },
    (workflow) => {
      workflow.permissions.contents = "write";
    },
    (workflow) => {
      workflow.jobs.analyze.permissions.contents = "write";
    },
    (workflow) => {
      delete workflow.jobs.analyze.permissions["security-events"];
    },
    (workflow) => {
      workflow.jobs.analyze.if = "false";
    },
    (workflow) => {
      workflow.jobs.analyze["continue-on-error"] = true;
    },
    (workflow) => {
      workflow.jobs.analyze.steps[0].with["persist-credentials"] = true;
    },
    (workflow) => {
      workflow.jobs.analyze.steps[1].uses = "github/codeql-action/init@main";
    },
    (workflow) => {
      workflow.jobs.analyze.steps[1].with.queries = "default";
    },
    (workflow) => {
      workflow.jobs.analyze.steps[1].with.languages = "javascript-typescript";
    },
    (workflow) => {
      workflow.jobs.analyze.steps[1].with["build-mode"] = "autobuild";
    },
    (workflow) => {
      workflow.jobs.analyze.steps[2].if = "false";
    },
    (workflow) => {
      workflow.jobs.analyze.steps.push({ run: "npm install" });
    },
  ]) {
    const changed = structuredClone(healthy);
    mutate(changed);
    assert.throws(() => validateCodeqlWorkflow(changed), /CodeQL must analyze/);
  }
});

test("duplicate YAML keys and automatic CodeRabbit reviews cannot hide a policy bypass", () => {
  assert.throws(() => parseYaml("jobs: {}\njobs: {}\n"), /unique keys/);
  validateCodeRabbit(rabbit());
  for (const mutate of [
    (config) => {
      config.reviews.auto_review.enabled = true;
    },
    (config) => {
      config.reviews.auto_review.drafts = true;
    },
    (config) => {
      config.reviews.auto_review.auto_incremental_review = true;
    },
    (config) => {
      config.reviews.auto_approvals.allow_author_approval = true;
    },
    (config) => {
      config.reviews.auto_approvals.enabled = false;
    },
  ]) {
    const changed = rabbit();
    mutate(changed);
    assert.throws(() => validateCodeRabbit(changed));
  }
});

test("native protection requires real provider checks and current independent approval", () => {
  validateRuleset(ruleset());
  for (const mutate of [
    (rules) => {
      rules.enforcement = "disabled";
    },
    (rules) => {
      const checks = rules.rules.find(
        ({ type }) => type === "required_status_checks",
      );
      checks.parameters.required_status_checks =
        checks.parameters.required_status_checks.filter(
          ({ context }) => context !== "CodeQL",
        );
    },
    (rules) => {
      rules.bypass_actors.push({ actor_type: "RepositoryRole", actor_id: 5 });
    },
    (rules) => {
      rules.conditions.ref_name.exclude.push("refs/heads/main");
    },
    (rules) => {
      rules.rules = rules.rules.filter(
        ({ type }) => type !== "non_fast_forward",
      );
    },
    (rules) => {
      rules.rules.find(
        ({ type }) => type === "pull_request",
      ).parameters.dismiss_stale_reviews_on_push = false;
    },
    (rules) => {
      rules.rules.find(
        ({ type }) => type === "pull_request",
      ).parameters.require_last_push_approval = false;
    },
    (rules) => {
      rules.rules
        .find(({ type }) => type === "required_status_checks")
        .parameters.required_status_checks.pop();
    },
    (rules) => {
      rules.rules.find(
        ({ type }) => type === "required_status_checks",
      ).parameters.required_status_checks[0].integration_id = 1;
    },
  ]) {
    const changed = ruleset();
    mutate(changed);
    assert.throws(() => validateRuleset(changed));
  }
  const custom = ruleset();
  custom.rules
    .find(({ type }) => type === "required_status_checks")
    .parameters.required_status_checks.push({
      context: "CodeRabbit approval",
      integration_id: 15368,
    });
  assert.throws(() => validateRuleset(custom), /provider identities/);
});

test("policy integration keeps native checks and rejects suppressed Sonar coverage", async (context) => {
  const { root, put, json } = await fixture(context);
  assert.deepEqual(await inspectPolicy(root), { workflows: 2 });
  await put(
    "sonar-project.properties",
    sonar + "sonar.coverage.exclusions=**/*\n",
  );
  await assert.rejects(inspectPolicy(root), /suppress/);
  await put("sonar-project.properties", sonar + "sonar.scanner.skip=true\n");
  await assert.rejects(inspectPolicy(root), /suppress/);
  await put("sonar-project.properties", sonar);
  const missing = ruleset();
  missing.rules
    .find(({ type }) => type === "required_status_checks")
    .parameters.required_status_checks.pop();
  await json(".github/rulesets/main.json", missing);
  await assert.rejects(inspectPolicy(root), /provider identities/);
});

const trustedWorkflow = () => ({
  on: {
    pull_request_target: {
      branches: ["main"],
      types: [
        "opened",
        "synchronize",
        "reopened",
        "edited",
        "ready_for_review",
      ],
    },
  },
  permissions: { contents: "read", "pull-requests": "read" },
  jobs: {
    guard: {
      steps: [
        {
          uses: actions.checkout,
          with: {
            ref: "${{ github.workflow_sha }}",
            "persist-credentials": false,
          },
        },
      ],
    },
  },
});

test("privileged workflows reject untrusted checkouts and floating actions", () => {
  validateWorkflowTrust(trustedWorkflow());
  for (const mutate of [
    (workflow) => {
      delete workflow.on.pull_request_target.branches;
    },
    (workflow) => {
      workflow.on = ["pull_request_target"];
    },
    (workflow) => {
      workflow.jobs.guard.steps[0].with.ref =
        "${{ github.event.pull_request.head.sha }}";
    },
    (workflow) => {
      workflow.jobs.guard.steps[0].uses = "actions/checkout@main";
    },
    (workflow) => {
      workflow.jobs.guard.steps[0].with["persist-credentials"] = true;
    },
  ]) {
    const workflow = trustedWorkflow();
    mutate(workflow);
    assert.throws(() => validateWorkflowTrust(workflow));
  }
});

test("workflow checkout trust follows effective job write permissions", () => {
  const workflow = trustedWorkflow();
  workflow.on = { pull_request: {} };
  const job = workflow.jobs.guard;
  const checkout = job.steps[0];
  checkout.with.ref = "${{ github.event.pull_request.head.sha }}";

  validateWorkflowTrust(workflow);
  job.permissions = { checks: "write" };
  assert.throws(
    () => validateWorkflowTrust(workflow),
    /trusted default-branch code/,
  );
  checkout.with.ref = "${{ github.workflow_sha }}";
  validateWorkflowTrust(workflow);

  checkout.with.ref = "${{ github.event.pull_request.head.sha }}";
  delete job.permissions;
  workflow.permissions.checks = "write";
  assert.throws(
    () => validateWorkflowTrust(workflow),
    /trusted default-branch code/,
  );
  job.permissions = { contents: "read" };
  validateWorkflowTrust(workflow);
  job.permissions = { contents: "write" };
  assert.throws(
    () => validateWorkflowTrust(workflow),
    /trusted default-branch code/,
  );
  job.permissions = "write-all";
  assert.throws(() => validateWorkflowTrust(workflow), /explicit and minimal/);
});

test("guidance resolves only published task paths, canonical commands, and safe Markdown links", async (context) => {
  const { root, json, put } = await fixture(context);
  assert.deepEqual(await inspectGuidance(root), {
    markdownFiles: 3,
    rules: 1,
    skills: 1,
  });
  const invalid = settings();
  invalid.recommendedChecks.pop();
  await json(".agents/settings.json", invalid);
  await assert.rejects(inspectGuidance(root), /project the canonical/);
  await json(".agents/settings.json", settings());
  await put("README.md", "Read [unpublished API](src/index.ts).\n");
  await assert.rejects(inspectGuidance(root), /published inventory/);
  await put("README.md", "Read [guide][setup].\n\n[setup]: ../missing.md\n");
  await assert.rejects(inspectGuidance(root), /published inventory/);
  const published = new Set(files);
  validateMarkdownLinks(
    "README.md",
    "[Rule](.agents/rules/safety.md#section) [External](https://example.invalid) [Anchor](#section)",
    published,
  );
  for (const link of [
    "../secret.md",
    "/private.md",
    ".env",
    "%zz",
    "javascript:alert",
    "src/index.ts",
  ])
    assert.throws(() =>
      validateMarkdownLinks("README.md", `[Bad](${link})`, published),
    );
  validateNavigation(navigation(), published);
  for (const mutate of [
    (map) => {
      map.tasks[0].owners = ["src/index.ts"];
    },
    (map) => {
      map.tasks[0].checks = ["typecheck"];
    },
    (map) => {
      map.tasks.push(structuredClone(map.tasks[0]));
    },
  ]) {
    const map = navigation();
    mutate(map);
    assert.throws(() => validateNavigation(map, published));
  }
});

test("formatting checks the inventory directly without an ignore-file escape or ambient source", async (context) => {
  const { root, put } = await fixture(context);
  for (const file of files.filter((file) =>
    /\.(?:json|ya?ml|mjs|md)$/i.test(file),
  ))
    await put(
      file,
      await format(await readFile(path.join(root, file), "utf8"), {
        filepath: file,
      }),
    );
  await put(
    "src/index.ts",
    "Unpublished code does not become part of a governance format check.",
  );
  assert.equal(
    await inspectFormatting(root),
    files.filter((file) => /\.(?:json|ya?ml|mjs|md)$/i.test(file)).length,
  );
  await put("package.json", JSON.stringify(packageFixture));
  await assert.rejects(inspectFormatting(root), /package.json/);
});

test("online audit fails closed on incomplete reports, service errors, or severe findings", () => {
  const clean = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  const report = (counts = clean) =>
    JSON.stringify({ metadata: { vulnerabilities: counts } });
  assert.deepEqual(validateAuditResult({ status: 0, stdout: report() }), clean);
  for (const result of [
    { status: 0, stdout: "not JSON" },
    { status: 0, stdout: "{}" },
    { status: null, stdout: report() },
    { status: 1, stdout: report({ ...clean, high: 1 }) },
    { status: 0, stdout: report({ ...clean, critical: 1 }) },
    {
      status: 0,
      stdout: JSON.stringify({
        error: { code: "service unavailable" },
        metadata: { vulnerabilities: clean },
      }),
    },
  ])
    assert.throws(() => validateAuditResult(result));
});

test("foundation restores the complete gate and requires the entire pure source closure", async (context) => {
  const { root } = await fixture(context, "foundation");
  const result = await inspectSnapshot(root);
  assert.equal(result.phase, "foundation");
  assert.equal(result.files, files.length + extraSourceFiles.length);
  const executed = [];
  assert.equal(
    await runFull(root, async (name) => {
      executed.push(name);
      return { status: 0 };
    }),
    11,
  );
  assert.deepEqual(
    executed,
    sourceChecks.map((id) => checkScripts[id]),
  );
  const sourcePolicy = policy("foundation");
  sourcePolicy.allowedFiles = sourcePolicy.allowedFiles.filter(
    (file) => file !== "src/application/validation.test.ts",
  );
  assert.throws(() => validateInventory(sourcePolicy), /cannot omit/);
  assert.throws(
    () =>
      validateInventory({
        ...policy("foundation"),
        allowedFiles: [...policy("foundation").allowedFiles, "src/index.ts"],
      }),
    /pure source closure/,
  );
  const sourceManifest = manifestForPhase("foundation");
  sourceManifest.profiles.full = [...requiredChecks];
  const pkg = {
    ...packageFixture,
    scripts: packageScripts("foundation"),
    devDependencies: foundationDependencies,
    overrides: reviewedOverrides,
  };
  assert.throws(() => validateManifest(sourceManifest, pkg), /full profile/);
  await inspectPolicy(root);
  await inspectGuidance(root);
});

test("coverage selects every published Node suite once and keeps audit records separate", () => {
  const published = validateInventory(policy("foundation"));
  const plan = coveragePlan(published, "foundation");
  assert.equal(plan.node.length, 7);
  assert.deepEqual(plan.audit, ["scripts/run-audit.test.mjs"]);
  assert.ok(plan.node.includes("src/application/foundation.test.ts"));
  assert.ok(!plan.node.includes("scripts/run-audit.test.mjs"));
  assert.ok(!plan.sources.includes("scripts/run-audit.mjs"));
  assert.ok(!plan.sources.some((file) => file.includes(".test.")));
  published.add("scripts/test-native-release.mjs");
  published.add("scripts/test-docker-release.mjs");
  const optional = coveragePlan(published, "runtime-operations");
  assert.ok(
    !optional.node.some(
      (file) =>
        file === "scripts/test-native-release.mjs" ||
        file === "scripts/test-docker-release.mjs",
    ),
  );
  assert.ok(
    !optional.sources.some(
      (file) =>
        file === "scripts/test-native-release.mjs" ||
        file === "scripts/test-docker-release.mjs",
    ),
  );
  published.add("scripts/validate-workflow-targets.test.mjs");
  published.add("scripts/validate-workflow-targets.mjs");
  assert.ok(
    coveragePlan(published, "configured-storage").node.includes(
      "scripts/validate-workflow-targets.test.mjs",
    ),
  );
  assert.ok(
    coveragePlan(published, "configured-storage").sources.includes(
      "scripts/validate-workflow-targets.mjs",
    ),
  );
  published.delete("scripts/run-audit.test.mjs");
  assert.throws(() => coveragePlan(published, "foundation"), /never skipped/);
});

test("source packages allow only the reviewed minimatch override and require the locked fix", () => {
  const pkg = {
    ...packageFixture,
    scripts: packageScripts("foundation"),
    devDependencies: foundationDependencies,
    overrides: reviewedOverrides,
  };
  const lock = lockForPackage(pkg);
  validatePackage(pkg, lock, "foundation");
  for (const phase of ["configured-storage", "database-persistence"])
    validatePackage({ ...pkg, scripts: packageScripts(phase) }, lock, phase);
  for (const overrides of [
    undefined,
    {},
    { "minimatch@10.2.6": "10.2.6" },
    { ...reviewedOverrides, unknown: "1.0.0" },
  ])
    assert.throws(
      () => validatePackage({ ...pkg, overrides }, lock, "foundation"),
      /reviewed minimatch/,
    );
  assert.throws(
    () =>
      validatePackage(
        {
          ...pkg,
          scripts: packageScripts("configured-storage"),
          overrides: { unsafe: "1.0.0" },
        },
        lock,
        "configured-storage",
      ),
    /reviewed minimatch/,
  );
  const unsafeLock = structuredClone(lock);
  unsafeLock.packages["node_modules/minimatch"] = {
    version: "10.2.6",
    integrity: syntheticIntegrity,
  };
  assert.throws(
    () => validatePackage(pkg, unsafeLock, "foundation"),
    /reflected in the lockfile/,
  );
  assert.throws(
    () =>
      validatePackage(
        { ...packageFixture, overrides: reviewedOverrides },
        lockFixture,
      ),
    /must not introduce dependency overrides/,
  );
});

test("plain validation exports are supported but a broken existing Git repository fails closed", async (context) => {
  const { root } = await fixture(context);
  assert.equal((await runCheck("snapshot", root)).files, files.length);
  await mkdir(path.join(root, ".git"));
  await assert.rejects(runCheck("snapshot", root), /existing Git repository/);
});

test("Markdown link scanning handles malformed long input and checks angle destinations and titles", () => {
  const published = new Set(files);
  validateMarkdownLinks(
    "README.md",
    '[Rule](<.agents/rules/safety.md> "title")',
    published,
  );
  validateMarkdownLinks(
    "README.md",
    "[".repeat(100_000) + "](".repeat(1_000),
    published,
  );
  assert.throws(
    () =>
      validateMarkdownLinks(
        "README.md",
        '[Bad](<src/index.ts> "title")',
        published,
      ),
    /published inventory/,
  );
});

test("Markdown reference definitions validate local destinations, encoding, angles, and titles", () => {
  const published = new Set(files);
  validateMarkdownLinks(
    "README.md",
    '[guide][setup]\n[setup]: <.agents/rules/safety.md#section> "Safety guide"\n' +
      "[safety]:\n  .agents/rules/safety.md 'Safety'\n" +
      '[external]: https://example.invalid "External"\n[anchor]: #section\n',
    published,
  );
  for (const target of [
    "../missing.md",
    "src/index.ts",
    "/private.md",
    ".env",
    "%zz",
    "<src/index.ts>",
    '<../missing.md> "Missing guide"',
  ])
    assert.throws(() =>
      validateMarkdownLinks(
        "README.md",
        `[guide][setup]\n[setup]: ${target}\n`,
        published,
      ),
    );
});

test("catalog duplication exceptions cover only the ten published literal data files", async (context) => {
  const { root, put, json } = await fixture(context, "localization-data");
  const catalogFiles = Array.from(
    { length: 10 },
    (_, index) =>
      `src/infrastructure/localization/catalogs/a${String.fromCharCode(97 + index)}.ts`,
  );
  const registry = "src/infrastructure/localization/catalogs/index.ts";
  const integrityTest = "src/infrastructure/localization/catalogs.test.ts";
  const inventory = policy("localization-data");
  inventory.allowedFiles.push(...catalogFiles, registry, integrityTest);
  await json(".github/bootstrap-policy.json", inventory);
  await Promise.all(
    [...catalogFiles, registry, integrityTest].map((file) =>
      put(file, "export {};\n"),
    ),
  );
  const configFile = path.join(root, "sonar-project.properties");
  const config = await readFile(configFile, "utf8");
  const complete = config + `sonar.cpd.exclusions=${catalogFiles.join(",")}\n`;
  await put("sonar-project.properties", complete);
  await inspectPolicy(root);
  await put(
    "sonar-project.properties",
    complete.replace(catalogFiles[0], registry),
  );
  await assert.rejects(inspectPolicy(root), /actual published source/);
  await put(
    "sonar-project.properties",
    complete.replace(catalogFiles[0], "src/contracts/locales.ts"),
  );
  await assert.rejects(inspectPolicy(root), /actual published source/);
  await put("sonar-project.properties", complete);
  inventory.allowedFiles = inventory.allowedFiles.filter(
    (file) => file !== catalogFiles[0],
  );
  await json(".github/bootstrap-policy.json", inventory);
  await assert.rejects(inspectPolicy(root), /all ten literal catalogs/);
});
