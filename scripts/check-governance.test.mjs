import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
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
  inspectFormatting,
  inspectGuidance,
  inspectPolicy,
  inspectSnapshot,
  parseYaml,
  requiredChecks,
  runCheck,
  runFull,
  testFiles,
  validateAuditResult,
  validateCiWorkflow,
  validateCodeRabbit,
  validateInventory,
  validateManifest,
  validateMarkdownLinks,
  validateNavigation,
  validatePackage,
  validateRuleset,
} from "./check-governance.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));
const readSource = (file) => readFile(path.join(repository, file), "utf8");
const packageFixture = JSON.parse(await readSource("package.json"));
const lockFixture = JSON.parse(await readSource("package-lock.json"));
const manifestFixture = JSON.parse(await readSource(".agents/validation.json"));
const ciText = await readSource(".github/workflows/ci.yml");
const files = [
  ".github/bootstrap-policy.json",
  ".agents/validation.json",
  ".agents/settings.json",
  ".agents/navigation.json",
  ".agents/rules/safety.md",
  ".agents/skills/commit/SKILL.md",
  ".github/workflows/ci.yml",
  ".github/workflows/pr-policy.yml",
  ".github/rulesets/main.json",
  ".github/rulesets/bootstrap.json",
  ".coderabbit.yaml",
  ".prettierrc.json",
  "package.json",
  "package-lock.json",
  "sonar-project.properties",
  "README.md",
  ...testFiles,
  ...testFiles.map((file) => file.replace(".test.mjs", ".mjs")),
];
const policy = () => ({
  schemaVersion: 1,
  phase: "governance",
  applicationReady: false,
  maximumChangedFiles: 100,
  targetChangedFiles: 80,
  allowedFiles: [...files],
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
const ruleset = (bootstrap = false) => ({
  name: bootstrap ? "Synthetic bootstrap" : "Synthetic main",
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
          ["Bootstrap PR file limit", 15368],
          ["SonarQube Cloud analysis", 15368],
          ["SonarCloud Code Analysis", 12526],
          ["CodeRabbit", 347564],
          ...(!bootstrap
            ? [
                ["PR file limit", 15368],
                ["CodeRabbit approval", 15368],
              ]
            : []),
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
const settings = () => ({
  rules: [".agents/rules/safety.md"],
  skills: [".agents/skills/commit/SKILL.md"],
  optionalHooks: [],
  recommendedChecks: manifestFixture.checks.map(({ command }) => command),
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

const fixture = async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kernel-governance-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const put = async (file, contents) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), contents, "utf8");
  };
  const json = (file, value) =>
    put(file, JSON.stringify(value, null, 2) + "\n");
  for (const file of files) await put(file, "// Synthetic fixture.\n");
  await json(".github/bootstrap-policy.json", policy());
  await json("package.json", packageFixture);
  await json("package-lock.json", lockFixture);
  await json(".agents/validation.json", manifestFixture);
  await json(".agents/navigation.json", navigation());
  await json(".agents/settings.json", settings());
  await json(".github/rulesets/main.json", ruleset());
  await json(".github/rulesets/bootstrap.json", ruleset(true));
  await json(".prettierrc.json", {});
  await put(".github/workflows/ci.yml", ciText);
  await put(
    ".github/workflows/pr-policy.yml",
    stringify({
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
    }),
  );
  await put(".coderabbit.yaml", stringify(rabbit()));
  await put("sonar-project.properties", sonar);
  await put(
    "scripts/check-pr-size.mjs",
    "export const maximumChangedFiles = 100;\n",
  );
  for (const file of files.filter((file) => /\.md$/i.test(file)))
    await put(file, "# Synthetic governance\n");
  await put(
    "README.md",
    "# Synthetic governance\n\nRead the [safety rule](.agents/rules/safety.md).\n",
  );
  return { root, put, json };
};

test("inventory permits only explicit governance paths and preserves the 80/100 budget", () => {
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
    { maximumChangedFiles: 101 },
    { targetChangedFiles: 100 },
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
      manifest.profiles.full.pop();
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
    6,
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
  assert.equal(failed.length, 3);
  await assert.rejects(
    runFull(root, async () => ({
      status: null,
      error: new Error("synthetic launch failure"),
    })),
    /snapshot/,
  );
  await assert.rejects(runCheck("workspace", root), /Usage/);
});

test("CI policy rejects conditional, filtered, duplicated, advisory, or redirected full validation", () => {
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
      ci.jobs.check["continue-on-error"] = true;
    },
    (ci) => {
      ci.jobs.check.steps[3].if = "github.event_name != 'pull_request'";
    },
    (ci) => {
      ci.jobs.check.steps[3]["working-directory"] = "another-project";
    },
    (ci) => {
      ci.jobs.check.steps[3].run += " || true";
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
      ci.jobs.check.steps[5].with["if-no-files-found"] = "warn";
    },
    (ci) => {
      ci.jobs["bootstrap-file-limit"].permissions.contents = "write";
    },
    (ci) => {
      ci.jobs["bootstrap-file-limit"].steps[2].env.SECRET =
        "${{ secrets.PRIVATE_TOKEN }}";
    },
  ]) {
    const changed = structuredClone(healthy);
    mutate(changed);
    assert.throws(() => validateCiWorkflow(changed));
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

test("both protection plans require real provider checks and current independent approval", () => {
  validateRuleset(ruleset());
  validateRuleset(ruleset(true), true);
  for (const mutate of [
    (rules) => {
      rules.enforcement = "disabled";
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
  assert.throws(() => validateRuleset(ruleset(true)), /provider identities/);
});

test("policy integration rejects untrusted guard checkout, floating actions, and suppressed Sonar coverage", async (context) => {
  const { root, put, json } = await fixture(context);
  assert.deepEqual(await inspectPolicy(root), { workflows: 2 });
  const guard = parseYaml(
    await readFile(path.join(root, ".github/workflows/pr-policy.yml"), "utf8"),
  );
  const targetEvent = structuredClone(guard.on);
  delete guard.on.pull_request_target.branches;
  await put(".github/workflows/pr-policy.yml", stringify(guard));
  await assert.rejects(inspectPolicy(root), /target main explicitly/);
  guard.on = ["pull_request_target"];
  await put(".github/workflows/pr-policy.yml", stringify(guard));
  await assert.rejects(inspectPolicy(root), /target main explicitly/);
  guard.on = targetEvent;
  guard.jobs.guard.steps[0].with.ref =
    "${{ github.event.pull_request.head.sha }}";
  await put(".github/workflows/pr-policy.yml", stringify(guard));
  await assert.rejects(inspectPolicy(root), /trusted default-branch code/);
  guard.jobs.guard.steps[0].with.ref = "${{ github.workflow_sha }}";
  guard.jobs.guard.steps[0].uses = "actions/checkout@main";
  await put(".github/workflows/pr-policy.yml", stringify(guard));
  await assert.rejects(inspectPolicy(root), /immutable commit/);
  guard.jobs.guard.steps[0].uses = actions.checkout;
  await put(".github/workflows/pr-policy.yml", stringify(guard));
  await put(
    "sonar-project.properties",
    sonar + "sonar.coverage.exclusions=**/*\n",
  );
  await assert.rejects(inspectPolicy(root), /suppress/);
  await put("sonar-project.properties", sonar + "sonar.scanner.skip=true\n");
  await assert.rejects(inspectPolicy(root), /suppress/);
  await put("sonar-project.properties", sonar);
  await json(".github/rulesets/main.json", ruleset(true));
  await assert.rejects(inspectPolicy(root), /provider identities/);
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
  assert.ok((await inspectFormatting(root)) > 20);
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
