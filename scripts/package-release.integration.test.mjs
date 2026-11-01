import assert from "node:assert/strict";
import {
  access,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { finishNativeSmoke } from "./native-smoke-cleanup.mjs";
import { packageRelease } from "./package-release.mjs";
import { fixture } from "./package-release.test-support.mjs";
test("native smoke can clean an owned partial release when packaging fails", async (context) => {
  const { repository } = await fixture(context);
  let owned;
  const failures = [];
  try {
    await packageRelease({
      repositoryRoot: repository,
      releaseId: "partial-owned",
      onOutputCreated: async (directory) => {
        owned = directory;
        await mkdir(path.join(directory, "api"));
        await writeFile(path.join(directory, "api/package.json"), "synthetic");
      },
    });
  } catch (error) {
    failures.push(error);
  }
  assert.equal(failures.length, 1);
  assert.equal(failures[0].code, "EEXIST");
  assert.equal(
    owned,
    path.join(await realpath(repository), "dist/releases/partial-owned"),
  );
  let stateRemoved = false;
  await assert.rejects(
    finishNativeSmoke(
      failures,
      () => {},
      () => rm(owned, { recursive: true, force: true }),
      () => {
        stateRemoved = true;
      },
    ),
    (error) => error === failures[0],
  );
  assert.equal(stateRemoved, true);
  await assert.rejects(access(owned), { code: "ENOENT" });
});
test("native smoke preserves packaging and partial-release cleanup failures", async (context) => {
  const { repository } = await fixture(context);
  let owned;
  const failures = [];
  try {
    await packageRelease({
      repositoryRoot: repository,
      releaseId: "partial-cleanup-failure",
      onOutputCreated: async (directory) => {
        owned = directory;
        await mkdir(path.join(directory, "api"));
        await writeFile(path.join(directory, "api/package.json"), "synthetic");
      },
    });
  } catch (error) {
    failures.push(error);
  }
  assert.equal(failures.length, 1);
  assert.equal(failures[0].code, "EEXIST");
  assert.equal(
    owned,
    path.join(
      await realpath(repository),
      "dist/releases/partial-cleanup-failure",
    ),
  );
  const cleanupFailure = new Error("synthetic removal failure");
  let stateRemoved = false;
  await assert.rejects(
    finishNativeSmoke(
      failures,
      () => {},
      () => {
        throw cleanupFailure;
      },
      () => {
        stateRemoved = true;
      },
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [failures[0], cleanupFailure]);
      return true;
    },
  );
  assert.equal(stateRemoved, true);
  await access(owned);
});
test("native smoke never claims or deletes a preexisting release", async (context) => {
  const { repository } = await fixture(context);
  const existing = path.join(repository, "dist/releases/preexisting");
  await mkdir(existing, { recursive: true });
  await writeFile(path.join(existing, "keep.txt"), "synthetic original");
  let owned;
  const failures = [];
  try {
    await packageRelease({
      repositoryRoot: repository,
      releaseId: "preexisting",
      onOutputCreated: (directory) => {
        owned = directory;
      },
    });
  } catch (error) {
    failures.push(error);
  }
  assert.equal(failures.length, 1);
  assert.equal(failures[0].code, "EEXIST");
  assert.equal(owned, undefined);
  let stateRemoved = false;
  await assert.rejects(
    finishNativeSmoke(
      failures,
      () => {},
      async () => {
        if (owned) await rm(owned, { recursive: true });
      },
      () => {
        stateRemoved = true;
      },
    ),
    (error) => error === failures[0],
  );
  assert.equal(stateRemoved, true);
  assert.equal(
    await readFile(path.join(existing, "keep.txt"), "utf8"),
    "synthetic original",
  );
});
