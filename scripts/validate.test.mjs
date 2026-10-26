import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { commandArguments, runProfile } from "./validate.mjs";

test("the current full gate covers every required published check once", () => {
  const read = (file) =>
    readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const manifest = JSON.parse(read(".agents/validation.json"));
  const publication = JSON.parse(read(".github/bootstrap-policy.json"));
  const pkg = JSON.parse(read("package.json"));
  const required = manifest.checks.filter((check) => check.kind === "required");
  assert.equal(manifest.phase, publication.phase);
  assert.equal(manifest.applicationReady, publication.applicationReady);
  assert.deepEqual(
    manifest.profiles.full,
    required.map((check) => check.id),
  );
  assert.equal(new Set(manifest.profiles.full).size, required.length);
  const commands = required.map((check) => check.command);
  for (const command of commands) {
    const [, script] = commandArguments(command);
    assert.equal(typeof pkg.scripts[script], "string");
  }
  const executed = [];
  assert.equal(
    runProfile(manifest, "full", (_args, check) => {
      executed.push(check.command);
      return 0;
    }),
    0,
  );
  assert.deepEqual(executed, commands);
});
test("validation runner preserves arguments without a shell", () => {
  assert.deepEqual(commandArguments("npm run test:e2e -- --project=chromium"), [
    "run",
    "test:e2e",
    "--",
    "--project=chromium",
  ]);
  for (const command of [
    "npm run lint && git push",
    "npm run lint; echo bad",
    "node script.mjs",
    "npm run lint | cat",
    "npm run lint > output",
    "npm run lint $SECRET",
    "npm run test --workspace=other",
    "npm run test --workspaces",
    "npm run test --prefix=../other",
    "npm run --workspaces test",
    "npm run --prefix ../other test",
    "npm run --prefix=../other test",
    "npm run -w other test",
    "npm run test -w other",
    "npm run test -w=other",
    "npm run test -wother",
    "npm run test -C ../other",
    "npm run test --pref=../other",
    "npm run test positional",
    'npm run test -- "unfinished',
    "npm run test -- 'unfinished",
  ])
    assert.throws(() => commandArguments(command));
});
test("validation runner accepts script names and forwards root-looking script arguments after the separator", () => {
  for (const script of [
    "test",
    "type-check",
    "test:coverage",
    "_internal",
    "2fa",
  ])
    assert.deepEqual(commandArguments(`npm run ${script}`), ["run", script]);
  assert.deepEqual(
    commandArguments("npm run test -- --prefix=fixture -w value -C fixture"),
    ["run", "test", "--", "--prefix=fixture", "-w", "value", "-C", "fixture"],
  );
  assert.deepEqual(
    commandArguments('npm run test -- "two words" --label="quoted value" \'\''),
    ["run", "test", "--", "two words", "--label=quoted value", ""],
  );
});
test("validation profiles stop at the first failed required command", () => {
  const manifest = {
    checks: [
      { id: "first", kind: "required", command: "npm run lint" },
      { id: "second", kind: "required", command: "npm run typecheck" },
    ],
    profiles: { full: ["first", "second"] },
  };
  const seen = [];
  assert.equal(
    runProfile(manifest, "full", (_args, check) => {
      seen.push(check.id);
      return 7;
    }),
    7,
  );
  assert.deepEqual(seen, ["first"]);
  assert.throws(() => runProfile(manifest, "missing", () => 0), /Unknown/);
  assert.throws(
    () =>
      runProfile(
        { ...manifest, profiles: { full: ["unknown"] } },
        "full",
        () => 0,
      ),
    /Unknown validation check/,
  );
});

const profileFixture = () => ({
  checks: [
    { command: "npm run lint", id: "first", kind: "required" },
    { command: "npm run typecheck", id: "second", kind: "required" },
    { command: "npm run smoke", id: "operator", kind: "manual" },
  ],
  profiles: { focused: ["second"], full: ["first", "second"] },
});

test("the full profile rejects omissions, optional substitutions and duplicate entries before running anything", () => {
  for (const ids of [
    ["first"],
    ["first", "operator"],
    ["first", "second", "operator"],
    ["first", "second", "first"],
    ["first", "unknown"],
    [],
  ]) {
    const manifest = profileFixture();
    manifest.profiles.full = ids;
    let calls = 0;
    assert.throws(() =>
      runProfile(manifest, "full", () => {
        calls++;
        return 0;
      }),
    );
    assert.equal(calls, 0);
  }
  const manifest = profileFixture();
  delete manifest.profiles.full;
  assert.throws(() => runProfile(manifest, "focused", () => 0), /full profile/);
});

test("duplicate check IDs and missing kinds cannot silently shadow required commands", () => {
  const duplicate = profileFixture();
  duplicate.checks.push({
    command: "npm run fake-pass",
    id: "second",
    kind: "required",
  });
  assert.throws(() => runProfile(duplicate, "full", () => 0), /Duplicate/);
  const missingKind = profileFixture();
  delete missingKind.checks[0].kind;
  assert.throws(
    () => runProfile(missingKind, "full", () => 0),
    /explicit supported kind/,
  );
});

test("focused profiles keep their declared scope while the complete full profile remains mandatory", () => {
  const manifest = profileFixture();
  const seen = [];
  assert.equal(
    runProfile(manifest, "focused", (_args, check) => {
      seen.push(check.id);
      return 0;
    }),
    0,
  );
  assert.deepEqual(seen, ["second"]);
  manifest.profiles.full = ["first"];
  assert.throws(() => runProfile(manifest, "focused", () => 0), /full profile/);
});

test("focused and full profile entries must name unique known checks", () => {
  for (const ids of [["second", "second"], ["unknown"], []]) {
    const manifest = profileFixture();
    manifest.profiles.focused = ids;
    assert.throws(() => runProfile(manifest, "focused", () => 0));
  }
});

test("every declared command is validated before an earlier command can have effects", () => {
  const manifest = profileFixture();
  manifest.checks[1].command = "npm run typecheck || true";
  let calls = 0;
  assert.throws(() =>
    runProfile(manifest, "full", () => {
      calls++;
      return 0;
    }),
  );
  assert.equal(calls, 0);
});

test("a complete full profile preserves its deliberate execution order", () => {
  const manifest = profileFixture();
  manifest.profiles.full = ["second", "first"];
  const seen = [];
  assert.equal(
    runProfile(manifest, "full", (_args, check) => {
      seen.push(check.id);
      return 0;
    }),
    0,
  );
  assert.deepEqual(seen, ["second", "first"]);
});
