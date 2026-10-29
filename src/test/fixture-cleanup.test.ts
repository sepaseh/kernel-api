import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { cleanupFixtureResources } from "./fixture-cleanup.ts";

test("fixture cleanup attempts every close and removal and preserves failures", async () => {
  const calls: string[] = [];
  const firstError = new Error("first close failed");
  const removeError = new Error("remove failed");
  await assert.rejects(
    cleanupFixtureResources(
      [
        () => {
          calls.push("first");
          throw firstError;
        },
        async () => {
          calls.push("second");
        },
      ],
      () => {
        calls.push("remove");
        throw removeError;
      },
    ),
    (error: unknown) =>
      error instanceof AggregateError &&
      error.errors[0] === firstError &&
      error.errors[1] === removeError,
  );
  assert.deepEqual(calls, ["first", "second", "remove"]);
});

test("fixture cleanup propagates one failure and attempts removal", async () => {
  const failure = new Error("close failed");
  let removed = false;
  await assert.rejects(
    cleanupFixtureResources([() => Promise.reject(failure)], () => {
      removed = true;
    }),
    (error: unknown) => error === failure,
  );
  assert.equal(removed, true);
});

test("body and cleanup failures remain visible in the real Node test runner", () => {
  const moduleUrl = new URL("./fixture-cleanup.ts", import.meta.url).href;
  const script = `
    import assert from "node:assert/strict";
    import { test } from "node:test";
    import { registerFixtureCleanup } from ${JSON.stringify(moduleUrl)};
    test("synthetic", (context) => {
      assert.equal(process.env.KERNEL_FIXTURE_PARENT_ONLY, undefined);
      assert.equal(process.env.NODE_V8_COVERAGE, undefined);
      assert.equal(process.env.NODE_OPTIONS, undefined);
      registerFixtureCleanup(context, [
        () => { throw new Error("synthetic close failed"); },
      ], () => { throw new Error("synthetic remove failed"); });
      throw new Error("synthetic operation failed");
    });
  `;
  const previousMarker = process.env.KERNEL_FIXTURE_PARENT_ONLY;
  process.env.KERNEL_FIXTURE_PARENT_ONLY = "synthetic-parent-only";
  let result: ReturnType<typeof spawnSync>;
  try {
    const environment = Object.fromEntries(
      [
        "PATH",
        "Path",
        "SystemRoot",
        "WINDIR",
        "PATHEXT",
        "TEMP",
        "TMP",
        "TMPDIR",
      ].flatMap((key) =>
        process.env[key] === undefined ? [] : [[key, process.env[key]]],
      ),
    );
    result = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", script],
      {
        encoding: "utf8",
        env: { ...environment, NODE_V8_COVERAGE: undefined },
        timeout: 10_000,
      },
    );
  } finally {
    if (previousMarker === undefined)
      delete process.env.KERNEL_FIXTURE_PARENT_ONLY;
    else process.env.KERNEL_FIXTURE_PARENT_ONLY = previousMarker;
  }
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /synthetic operation failed/);
  assert.match(output, /synthetic close failed/);
  assert.match(output, /synthetic remove failed/);
});
