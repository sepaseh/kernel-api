import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

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

test("isolated file fixtures run one selected scenario and remove files after failure and close", async (context) => {
  const temporaryRoot = await realpath(tmpdir());
  const directory = await mkdtemp(
    path.join(temporaryRoot, "kernel-isolation-regression-"),
  );
  context.after(async () => {
    const owned = await realpath(directory);
    assert.equal(path.dirname(owned), temporaryRoot);
    assert.ok(path.basename(owned).startsWith("kernel-isolation-regression-"));
    await rm(owned, { recursive: true, force: true });
  });
  const marker = path.join(directory, "scenario.json");
  const calls = path.join(directory, "calls.txt");
  const module = path.join(directory, "scenario.mjs");
  await writeFile(
    module,
    `
    import { appendFile, writeFile } from 'node:fs/promises';
    import { test } from 'node:test';
    import { isolatedFileFixture, registerFixtureCleanup } from ${JSON.stringify(new URL("./fixture-cleanup.ts", import.meta.url).href)};
    test('selected fixture scenario', async (context) => {
      const directory = await isolatedFileFixture(context, import.meta.url, 'kernel-isolation-owned-');
      if (directory === undefined) return;
      await appendFile(${JSON.stringify(calls)}, 'selected\\n');
      await writeFile(${JSON.stringify(marker)}, JSON.stringify({ directory }));
      registerFixtureCleanup(context, [() => { throw new Error('synthetic isolated close failed'); }], () => {});
      throw new Error('synthetic isolated body failed');
    });
    test('unselected fixture scenario', () => { throw new Error('unselected scenario executed'); });
  `,
  );
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-name-pattern", "^selected fixture scenario$", module],
    {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        NODE_V8_COVERAGE: undefined,
      },
    },
  );
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /synthetic isolated body failed/);
  assert.match(output, /synthetic isolated close failed/);
  assert.doesNotMatch(output, /unselected scenario executed/);
  assert.equal(await readFile(calls, "utf8"), "selected\n");
  const owned = JSON.parse(await readFile(marker, "utf8")) as {
    directory: string;
  };
  await assert.rejects(stat(pathToFileURL(owned.directory)), {
    code: "ENOENT",
  });
});
