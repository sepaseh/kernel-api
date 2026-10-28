import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  checkGuidance,
  ciCommands,
  isSafeGuidancePath,
  isSafeResolvedGuidancePath,
  validateAssistantGuidanceFiles,
  validateManifest,
  validateNavigation,
  validateStandaloneLockfile,
  validateStandaloneManifest,
} from "./check-guidance.mjs";

const fixture = () => {
  const manifest = {
    schemaVersion: 1,
    checks: [
      {
        id: "types",
        command: "npm run typecheck",
        kind: "required",
        ciJobs: ["check"],
        scopes: ["all"],
      },
      {
        id: "lab",
        command: "npm run lighthouse",
        kind: "advisory",
        ciJobs: ["build"],
        scopes: ["website"],
      },
    ],
    profiles: { full: ["types"], website: ["types"] },
  };
  const settings = {
    navigation: ".agents/navigation.json",
    validation: ".agents/validation.json",
    evaluation: ".agents/evaluation/cases.json",
    recommendedChecks: ["npm run typecheck"],
    recommendedChecksSource: {
      path: ".agents/validation.json",
      profile: "full",
    },
  };
  const ci = ciCommands(`jobs:
  check:
    steps:
      - run: npm run typecheck
  build:
    steps:
      - name: Lighthouse advisory audit
        continue-on-error: true
        run: npm run lighthouse
`);
  return { manifest, settings, ci };
};

test("CI extraction preserves job and advisory boundaries", () => {
  const { ci, manifest, settings } = fixture();
  assert.deepEqual(ci.get("check"), [
    { command: "npm run typecheck", advisory: false },
  ]);
  assert.deepEqual(ci.get("build"), [
    { command: "npm run lighthouse", advisory: true },
  ]);
  assert.deepEqual(validateManifest(manifest, settings, ci), []);
});

test("detects stale projections, missing CI gates and advisory promotion", () => {
  const { manifest, settings, ci } = fixture();
  settings.recommendedChecks = ["npm run stale"];
  manifest.profiles.full.push("lab");
  ci.get("check")[0].advisory = true;
  ci.get("build")[0].command = "npm run other";
  const errors = validateManifest(manifest, settings, ci).join("\n");
  for (const message of [
    "project",
    "every required",
    "advisory policy",
    "exactly once",
    "Unregistered CI",
  ])
    assert.ok(errors.includes(message), message);
});

test("rejects duplicate IDs and unknown profile checks", () => {
  const { manifest, settings, ci } = fixture();
  manifest.checks.push(manifest.checks[0]);
  manifest.profiles.website.push("ghost");
  const errors = validateManifest(manifest, settings, ci).join("\n");
  assert.ok(errors.includes("unique"));
  assert.ok(errors.includes("Unknown check ghost"));
});

test("rejects stale instruction-discovery pointers", () => {
  const { manifest, settings, ci } = fixture();
  for (const key of ["navigation", "validation", "evaluation"])
    settings[key] = ".agents/missing.json";
  const errors = validateManifest(manifest, settings, ci).join("\n");
  for (const key of ["navigation", "validation", "evaluation"])
    assert.ok(errors.includes(`Settings ${key}`));
});

test("required CI checks cannot silently become advisory at job level", () => {
  const { manifest, settings } = fixture();
  const ci = ciCommands(`jobs:
  check:
    continue-on-error: true
    steps:
      - run: npm run typecheck
  build:
    steps:
      - run: npm run lighthouse
        continue-on-error: true
`);
  assert.ok(
    validateManifest(manifest, settings, ci).some((message) =>
      message.includes("advisory policy differs for types"),
    ),
  );
});

test("unsupported step error policies cannot become non-advisory checks", () => {
  for (const value of [" ", "${{ inputs.allow_failure }}"]) {
    const ci = ciCommands(
      [
        "jobs:",
        "  check:",
        "    steps:",
        "      - run: npm run typecheck",
        `        continue-on-error: ${value}`,
      ].join("\n"),
    );
    assert.equal(ci.get("check")[0].advisory, "unsupported");
  }
});

test("job and step error policies preserve supported and unsupported values", () => {
  for (const [job, step, expected] of [
    ["false", "false", false],
    ["true", "false", true],
    ["false", "true", true],
    ["invalid", "false", "unsupported"],
    ["false", "invalid", "unsupported"],
  ]) {
    const ci = ciCommands(
      [
        "jobs:",
        "  check:",
        `    continue-on-error: ${job}`,
        "    steps:",
        "      - run: npm run typecheck",
        `        continue-on-error: ${step}`,
      ].join("\n"),
    );
    assert.equal(ci.get("check")[0].advisory, expected);
  }
});

test("navigation/evaluation validate owners, evidence, English prompts and referenced checks", () => {
  const navigation = {
    schemaVersion: 1,
    tasks: [
      {
        id: "account",
        when: "Change profile",
        owners: ["owner.ts"],
        contracts: [],
        tests: ["test.ts"],
        checks: ["types"],
      },
    ],
  };
  const evaluation = {
    schemaVersion: 1,
    cases: [
      {
        id: "profile",
        prompt: { en: "Explain" },
        taskIds: ["account"],
        evidence: ["owner.ts"],
        mustExplain: ["HTTP ownership"],
        mustNot: ["Import persistence"],
        checks: ["types"],
      },
    ],
  };
  const exists = (filename) => ["owner.ts", "test.ts"].includes(filename);
  assert.deepEqual(
    validateNavigation(navigation, evaluation, new Set(["types"]), exists),
    [],
  );
  navigation.tasks[0].owners = ["missing.ts"];
  evaluation.cases[0].prompt.en = "";
  evaluation.cases[0].taskIds = ["unknown"];
  evaluation.cases[0].checks = ["missing-check"];
  const errors = validateNavigation(
    navigation,
    evaluation,
    new Set(["types"]),
    exists,
  ).join("\n");
  for (const message of [
    "missing.ts",
    "English prompt",
    "task reference",
    "missing-check",
  ])
    assert.ok(errors.includes(message), message);
  evaluation.cases[0].prompt = { en: "Explain", fa: "Translated prompt" };
  assert.ok(
    validateNavigation(navigation, evaluation, new Set(["types"]), exists).some(
      (message) => message.includes("only an English prompt"),
    ),
  );
});

test("assistant guidance rejects Persian companions while human docs remain bilingual", () => {
  assert.deepEqual(
    validateAssistantGuidanceFiles([
      "AGENTS.md",
      ".agents/rules/localization.md",
      "docs/localization.fa.md",
      "README.fa.md",
      "deploy/docker/README.fa.md",
    ]),
    [],
  );
  for (const filename of [
    "AGENTS.fa.md",
    "src/AGENTS.fa.md",
    ".agents/README.fa.md",
    ".agents/rules/example.fa.md",
    ".claude/commands/example.fa.md",
    ".agents\\skills\\example\\SKILL.fa.md",
  ]) {
    const errors = validateAssistantGuidanceFiles([filename]);
    assert.equal(errors.length, 1, filename);
    assert.ok(errors[0].includes(filename));
  }
});

test("current guidance paths, instruction entrypoints and canonical check matrix agree", async () => {
  const result = await checkGuidance();
  assert.ok(result.tasks > 0);
  assert.ok(result.cases > 0);
  assert.deepEqual(result.errors, []);
});

test("guidance indexes reject traversal, private state and generated dependencies", () => {
  for (const value of [
    "../kernel/AGENTS.md",
    "C:/private/key",
    ".env.local",
    "src/.env.production",
    "server/data/test.sqlite",
    "node_modules/pkg/index.js",
    ".git/config",
    ".next/server.js",
  ])
    assert.equal(isSafeGuidancePath(value), false, value);
  for (const value of [
    "src/index.ts",
    "src/contracts/account.ts",
    "deploy/docker/.env.example",
    "deploy/native/api.env.example",
  ])
    assert.equal(isSafeGuidancePath(value), true, value);
});
test("resolved guidance paths reject links to private or external files", async (t) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), "kernel-guidance-fixture-"),
  );
  t.after(async () => {
    assert.equal(
      path.dirname(path.resolve(fixtureRoot)),
      path.resolve(tmpdir()),
    );
    assert.ok(
      path.basename(fixtureRoot).startsWith("kernel-guidance-fixture-"),
    );
    await rm(fixtureRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  });
  const root = path.join(fixtureRoot, "root");
  await mkdir(root);
  await writeFile(path.join(root, "valid.md"), "synthetic guide");
  await writeFile(path.join(root, ".env.local"), "synthetic-only");
  await writeFile(
    path.join(fixtureRoot, "outside.md"),
    "synthetic external guide",
  );
  assert.equal(await isSafeResolvedGuidancePath(root, "valid.md"), true);
  assert.equal(await isSafeResolvedGuidancePath(root, ".env.local"), false);
  assert.equal(await isSafeResolvedGuidancePath(root, "../outside.md"), false);
  try {
    await symlink(
      path.join(root, ".env.local"),
      path.join(root, "private-link.md"),
    );
    await symlink(
      path.join(fixtureRoot, "outside.md"),
      path.join(root, "outside-link.md"),
    );
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES")
      return t.skip("File symlinks unavailable");
    throw error;
  }
  assert.equal(
    await isSafeResolvedGuidancePath(root, "private-link.md"),
    false,
  );
  assert.equal(
    await isSafeResolvedGuidancePath(root, "outside-link.md"),
    false,
  );
});
test("guidance rejects a fixed input linked to private state before reading it", async (t) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), "kernel-guidance-input-"),
  );
  t.after(async () => {
    assert.equal(
      path.dirname(path.resolve(fixtureRoot)),
      path.resolve(tmpdir()),
    );
    assert.ok(path.basename(fixtureRoot).startsWith("kernel-guidance-input-"));
    await rm(fixtureRoot, { recursive: true, force: true });
  });
  const root = path.join(fixtureRoot, "root");
  await mkdir(path.join(root, ".agents/evaluation"), { recursive: true });
  await mkdir(path.join(root, ".github/workflows"), { recursive: true });
  for (const file of [
    ".agents/settings.json",
    ".agents/navigation.json",
    ".agents/evaluation/cases.json",
    "package.json",
    "package-lock.json",
    ".github/workflows/ci.yml",
  ])
    await writeFile(path.join(root, file), file.endsWith(".json") ? "{}" : "");
  await writeFile(path.join(root, ".env.local"), "not-json-synthetic-secret");
  try {
    await symlink(
      path.join(root, ".env.local"),
      path.join(root, ".agents/validation.json"),
    );
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES")
      return t.skip("File symlinks unavailable");
    throw error;
  }
  await assert.rejects(
    checkGuidance(root),
    /Unsafe guidance input: \.agents\/validation\.json/,
  );
});

test("guidance rejects a fixed input through an external parent directory", async (t) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), "kernel-guidance-parent-"),
  );
  t.after(async () => {
    assert.equal(
      path.dirname(path.resolve(fixtureRoot)),
      path.resolve(tmpdir()),
    );
    assert.ok(path.basename(fixtureRoot).startsWith("kernel-guidance-parent-"));
    await rm(fixtureRoot, { recursive: true, force: true });
  });
  const root = path.join(fixtureRoot, "root");
  const outside = path.join(fixtureRoot, "outside");
  await mkdir(path.join(root, ".github/workflows"), { recursive: true });
  await mkdir(path.join(outside, "evaluation"), { recursive: true });
  for (const file of [
    "validation.json",
    "settings.json",
    "navigation.json",
    "evaluation/cases.json",
  ])
    await writeFile(path.join(outside, file), "{}");
  for (const file of ["package.json", "package-lock.json"])
    await writeFile(path.join(root, file), "{}");
  await writeFile(path.join(root, ".github/workflows/ci.yml"), "");
  try {
    await symlink(
      outside,
      path.join(root, ".agents"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES")
      return t.skip("Directory symlinks unavailable");
    throw error;
  }
  await assert.rejects(
    checkGuidance(root),
    /Unsafe guidance input: \.agents\//,
  );
});

test("guidance rejects an external guide directory before walking it", async (t) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), "kernel-guidance-dir-"),
  );
  t.after(async () => {
    assert.equal(
      path.dirname(path.resolve(fixtureRoot)),
      path.resolve(tmpdir()),
    );
    assert.ok(path.basename(fixtureRoot).startsWith("kernel-guidance-dir-"));
    await rm(fixtureRoot, { recursive: true, force: true });
  });
  const root = path.join(fixtureRoot, "root");
  await mkdir(path.join(root, ".agents/evaluation"), { recursive: true });
  await mkdir(path.join(root, ".github/workflows"), { recursive: true });
  const { manifest, settings } = fixture();
  Object.assign(settings, { rules: [], skills: [], optionalHooks: [] });
  const inputs = {
    ".agents/validation.json": manifest,
    ".agents/settings.json": settings,
    ".agents/navigation.json": { schemaVersion: 1, tasks: [] },
    ".agents/evaluation/cases.json": { schemaVersion: 1, cases: [] },
    "package.json": {
      name: "fixture",
      scripts: { typecheck: "tsc", lighthouse: "test" },
    },
    "package-lock.json": { name: "fixture", packages: { "": {} } },
  };
  for (const [file, value] of Object.entries(inputs))
    await writeFile(path.join(root, file), JSON.stringify(value));
  await writeFile(
    path.join(root, ".github/workflows/ci.yml"),
    "jobs:\n  check:\n    steps:\n      - run: npm run typecheck\n",
  );
  const outside = path.join(fixtureRoot, "outside");
  await mkdir(outside);
  await writeFile(path.join(outside, "external.md"), "synthetic external file");
  try {
    await symlink(
      outside,
      path.join(root, ".claude"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES")
      return t.skip("Directory symlinks unavailable");
    throw error;
  }
  await assert.rejects(
    checkGuidance(root),
    /Unsafe guidance directory: \.claude/,
  );
});
test("single-project manifest rejects local package dependencies and workspace scripts", () => {
  assert.deepEqual(
    validateStandaloneManifest({
      name: "kernel-project",
      scripts: { build: "tsc", test: "node --test src/example.test.ts" },
      dependencies: { hono: "^4.0.0" },
    }),
    [],
  );
  const errors = validateStandaloneManifest({
    workspaces: [],
    dependencies: { "@kernel/contracts": "*", outside: "file:../kernel" },
    devDependencies: { local: "workspace:*", linked: "link:../shared" },
    scripts: { test: "npm run test --workspace=other" },
  });
  assert.equal(errors.length, 6);
  assert.ok(errors.some((message) => message.includes("root package")));
  for (const name of ["@kernel/contracts", "outside", "local", "linked"])
    assert.ok(
      errors.some((message) => message.endsWith(name)),
      name,
    );
});

test("lockfile proves root dependency ownership and rejects stale local links", () => {
  const pkg = { name: "kernel-project", dependencies: { hono: "^4.0.0" } };
  const lock = {
    name: pkg.name,
    packages: {
      "": { dependencies: pkg.dependencies },
      "node_modules/hono": { version: "4.0.0" },
    },
  };
  assert.deepEqual(validateStandaloneLockfile(lock, pkg), []);
  lock.packages[""].dependencies = { hono: "^3.0.0" };
  lock.packages["apps/old"] = { name: "old" };
  lock.packages["node_modules/local"] = {
    link: true,
    resolved: "packages/old",
  };
  const errors = validateStandaloneLockfile(lock, pkg);
  assert.equal(errors.length, 3);
  assert.ok(errors.some((message) => message.includes("dependency drift")));
  assert.ok(errors.some((message) => message.endsWith("apps/old")));
  assert.ok(errors.some((message) => message.endsWith("node_modules/local")));
});

test("a full-gate wrapper is accepted once and duplicate or advisory wrappers are rejected", () => {
  const { manifest, settings } = fixture();
  manifest.checks = manifest.checks.filter((check) => check.id === "types");
  const good = ciCommands(
    `jobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run validate -- full\n`,
  );
  assert.deepEqual(validateManifest(manifest, settings, good), []);
  const duplicate = ciCommands(
    `jobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run validate -- full\n      - run: npm run typecheck\n`,
  );
  assert.match(
    validateManifest(manifest, settings, duplicate).join("\n"),
    /duplicates/,
  );
  const advisory = ciCommands(
    `jobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run validate -- full\n        continue-on-error: true\n`,
  );
  assert.notDeepEqual(validateManifest(manifest, settings, advisory), []);
});
