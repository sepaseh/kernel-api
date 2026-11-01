import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  guidanceAssetPaths,
  optionalHookPaths,
  validateGuidanceAssets,
  validateGuidanceInventory,
} from "./check-guidance-assets.mjs";

const readJson = async (relative) =>
  JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
const [workingCases, workingTemplate, workingNavigation, workingManifest] =
  await Promise.all([
    readJson("../.agents/evaluation/cases.json"),
    readJson("../.agents/evaluation/run-template.json"),
    readJson("../.agents/navigation.json"),
    readJson("../.agents/validation.json"),
  ]);

const fixture = () => ({
  policy: {
    phase: "local-runtime",
    guidanceAssets: true,
    allowedFiles: [...guidanceAssetPaths, "AGENTS.md", "src/owned.ts"],
  },
  settings: {
    optionalHooks: [...optionalHookPaths],
    evaluation: ".agents/evaluation/cases.json",
  },
  navigation: { schemaVersion: 1, tasks: [{ id: "synthetic-live-task" }] },
  manifest: {
    schemaVersion: 1,
    phase: "local-runtime",
    checks: [
      { id: "guidance", kind: "required" },
      { id: "coverage-tests", kind: "required" },
    ],
    profiles: { full: ["guidance", "coverage-tests"] },
  },
  cases: {
    schemaVersion: 1,
    cases: [
      {
        id: "synthetic-case",
        prompt: {
          en: "Without editing files, trace the declared owner using synthetic evidence.",
        },
        taskIds: ["synthetic-live-task"],
        checks: ["guidance"],
        evidence: ["src/owned.ts"],
        mustExplain: ["Identify the declared owner."],
        mustNot: ["Read private runtime data."],
      },
    ],
  },
  template: structuredClone(workingTemplate),
});

test("the complete declared asset group registers optional hooks and read-only cases", () => {
  const input = fixture();
  assert.equal(guidanceAssetPaths.length, 10);
  assert.equal(new Set(guidanceAssetPaths).size, 10);
  assert.equal(optionalHookPaths.length, 4);
  assert.equal(validateGuidanceInventory(input.policy), true);
  assert.deepEqual(validateGuidanceAssets(input), { enabled: true, cases: 1 });
});

test("disabled assets ignore unpublished drafts but reject publication or registrations", () => {
  const unavailable = new Proxy(
    {},
    {
      get() {
        throw new Error("An unpublished draft was inspected.");
      },
    },
  );
  for (const enabled of [undefined, false]) {
    const policy = {
      phase: "foundation",
      allowedFiles: ["AGENTS.md"],
      ...(enabled === undefined ? {} : { guidanceAssets: enabled }),
    };
    const input = {
      policy,
      settings: { optionalHooks: [] },
      cases: unavailable,
      template: unavailable,
    };
    assert.equal(validateGuidanceInventory(policy), false);
    assert.deepEqual(validateGuidanceAssets(input), {
      enabled: false,
      cases: 0,
    });
    for (const asset of guidanceAssetPaths)
      assert.throws(
        () =>
          validateGuidanceInventory({
            ...policy,
            allowedFiles: [...policy.allowedFiles, asset],
          }),
        /explicit flag/,
      );
    assert.throws(
      () =>
        validateGuidanceAssets({
          ...input,
          settings: { optionalHooks: [optionalHookPaths[0]] },
        }),
      /must not register hooks/,
    );
    assert.throws(
      () =>
        validateGuidanceAssets({
          ...input,
          settings: {
            optionalHooks: [],
            evaluation: ".agents/evaluation/cases.json",
          },
        }),
      /must not register evaluation/,
    );
  }
});

test("flags and all asset declarations fail closed on invalid, partial or extra groups", () => {
  const { policy } = fixture();
  for (const guidanceAssets of [null, "true", 1, [], {}])
    assert.throws(
      () => validateGuidanceInventory({ ...policy, guidanceAssets }),
      /boolean/,
    );
  assert.throws(
    () => validateGuidanceInventory({ ...policy, phase: "http-composition" }),
    /local-runtime/,
  );
  for (const omitted of guidanceAssetPaths)
    assert.throws(
      () =>
        validateGuidanceInventory({
          ...policy,
          allowedFiles: policy.allowedFiles.filter((file) => file !== omitted),
        }),
      /exact ten/,
    );
  for (const extra of [
    ".agents/hooks/unknown.sh",
    ".agents/evaluation/actual-report.json",
    guidanceAssetPaths[0],
  ])
    assert.throws(
      () =>
        validateGuidanceInventory({
          ...policy,
          allowedFiles: [...policy.allowedFiles, extra],
        }),
      /exact ten/,
    );
  assert.throws(
    () => validateGuidanceInventory({ ...policy, allowedFiles: null }),
    /explicit publication inventory/,
  );
});

test("settings must register the exact optional hooks and canonical evaluation pointer", () => {
  for (const settings of [
    {},
    { optionalHooks: [] },
    {
      optionalHooks: [...optionalHookPaths].reverse(),
      evaluation: ".agents/evaluation/cases.json",
    },
    {
      optionalHooks: [...optionalHookPaths, "unknown.sh"],
      evaluation: ".agents/evaluation/cases.json",
    },
    {
      optionalHooks: [...optionalHookPaths],
      evaluation: ".agents/evaluation/run-template.json",
    },
  ])
    assert.throws(() => validateGuidanceAssets({ ...fixture(), settings }));
});

test("evaluation cases use live task and full-profile check identities rather than a fixed historical vocabulary", () => {
  const input = fixture();
  input.navigation.tasks[0].id = "newly-renamed-live-task";
  input.cases.cases[0].taskIds = ["newly-renamed-live-task"];
  validateGuidanceAssets(input);
  for (const mutate of [
    (data) => {
      data.cases.cases[0].taskIds = ["retired-task"];
    },
    (data) => {
      data.cases.cases[0].checks = ["missing-check"];
    },
    (data) => {
      data.manifest.profiles.full = ["coverage-tests"];
    },
    (data) => {
      data.manifest.profiles.full = ["unknown"];
    },
    (data) => {
      data.navigation.tasks.push({ id: data.navigation.tasks[0].id });
    },
    (data) => {
      data.manifest.checks.push({ id: "guidance" });
    },
    (data) => {
      data.manifest.phase = "governance";
    },
  ]) {
    const changed = fixture();
    mutate(changed);
    assert.throws(() => validateGuidanceAssets(changed));
  }
});

test("prompts, case identities, criteria and evidence remain nonempty and unambiguous", () => {
  for (const mutate of [
    (data) => {
      data.cases.cases = [];
    },
    (data) => {
      data.cases.cases.push(structuredClone(data.cases.cases[0]));
    },
    (data) => {
      data.cases.cases[0].prompt = { fa: "نمونه" };
    },
    (data) => {
      data.cases.cases[0].prompt.fr = "Autre texte";
    },
    (data) => {
      data.cases.cases[0].prompt.en = " ";
    },
    (data) => {
      data.cases.cases[0].mustExplain = [];
    },
    (data) => {
      data.cases.cases[0].mustNot = [""];
    },
    (data) => {
      data.cases.cases[0].evidence = [];
    },
    (data) => {
      data.cases.cases[0].taskIds = [];
    },
    (data) => {
      data.cases.cases[0].checks = ["guidance", "guidance"];
    },
  ]) {
    const changed = fixture();
    mutate(changed);
    assert.throws(() => validateGuidanceAssets(changed));
  }
});

test("evidence must identify published files and cannot refer to private state or escape paths", () => {
  for (const evidence of [
    "src/unpublished.ts",
    "src",
    "../outside.md",
    "C:/private.md",
    "src\\owned.ts",
    ".env",
    ".env.local",
    ".agents/settings.local.json",
    "credentials.json",
    "state.sqlite",
    "state.db-wal",
    "node_modules/package/index.js",
    "test-results/report.json",
    "uploads/object.txt",
    "server/data/file.json",
  ]) {
    const input = fixture();
    input.cases.cases[0].evidence = [evidence];
    if (evidence !== "src/unpublished.ts" && evidence !== "src")
      input.policy.allowedFiles.push(evidence);
    assert.throws(() => validateGuidanceAssets(input), /safe published files/);
  }
});

test("the maintained template never claims recorded execution, discovery or benchmark evidence", () => {
  for (const mutate of [
    (template) => {
      template.state = "passed";
    },
    (template) => {
      template.startedAt = "2026-11-01";
    },
    (template) => {
      template.repositoryCommit = "a".repeat(40);
    },
    (template) => {
      template.assistant.model = "measured-model";
    },
    (template) => {
      template.instructionDiscovery.status = "loaded";
    },
    (template) => {
      template.instructionDiscovery.reportedLoadedFiles = ["AGENTS.md"];
    },
    (template) => {
      template.index.generatedAt = "2026-11-01";
    },
    (template) => {
      template.index.sourceScope = ["src"];
    },
    (template) => {
      template.caseResults = [{ outcome: "passed" }];
    },
    (template) => {
      template.exactPrompt = "An observed prompt";
    },
    (template) => {
      template.assistedDiscovery.attempted = true;
    },
    (template) => {
      template.assistedDiscovery.evidence = "An observed trace";
    },
    (template) => {
      template.limitations = [];
    },
    (template) => {
      template.hiddenResult = "passed";
    },
  ]) {
    const input = fixture();
    mutate(input.template);
    assert.throws(() => validateGuidanceAssets(input));
  }
});

test("current working cases validate against live navigation and checks in a complete synthetic publication", () => {
  const input = fixture();
  input.cases = structuredClone(workingCases);
  input.template = structuredClone(workingTemplate);
  input.navigation = structuredClone(workingNavigation);
  input.manifest = {
    ...structuredClone(workingManifest),
    phase: "local-runtime",
  };
  input.policy.allowedFiles = [
    ...new Set([
      ...guidanceAssetPaths,
      ...workingCases.cases.flatMap(({ evidence }) => evidence),
    ]),
  ];
  const before = structuredClone(input);
  assert.deepEqual(validateGuidanceAssets(input), {
    enabled: true,
    cases: workingCases.cases.length,
  });
  assert.deepEqual(input, before);
});
