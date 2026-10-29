import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

async function withRecoveryCleanup(
  operation: () => void | Promise<void>,
  cleanup: () => void | Promise<void>,
) {
  const errors: unknown[] = [];
  try {
    await operation();
  } catch (error) {
    errors.push(error);
  }
  try {
    await cleanup();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, "Recovery worker and cleanup failed");
}

test("recovery parent preserves worker and removal failures together", async () => {
  const workerFailure = new Error("synthetic worker failure");
  const removalFailure = new Error("synthetic removal failure");
  let cleanupCalled = false;
  await assert.rejects(
    withRecoveryCleanup(
      () => {
        throw workerFailure;
      },
      () => {
        cleanupCalled = true;
        throw removalFailure;
      },
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [workerFailure, removalFailure]);
      return true;
    },
  );
  assert.equal(cleanupCalled, true);
});

const cases = [
  [
    "recovery cleanup closes all clients when a close fails",
    "recovery cleanup attempts all client closes",
  ],
  [
    "matched DB/object recovery preserves real authenticated behavior",
    "isolated recovery restores",
  ],
  [
    "a mismatched or damaged recovery point is rejected",
    "the recovery manifest rejects",
  ],
  [
    "a synthetic storage incident is correlated and recovered",
    "a synthetic storage incident correlates",
  ],
] as const;

for (const [name, pattern] of cases) {
  test(name, async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "kernel-recovery-drill-"),
    );
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
        "HOME",
      ].flatMap((key) =>
        process.env[key] === undefined ? [] : [[key, process.env[key]]],
      ),
    );
    await withRecoveryCleanup(
      () => {
        const result = spawnSync(
          process.execPath,
          [
            "--test",
            "--test-reporter=tap",
            `--test-name-pattern=^${pattern}`,
            fileURLToPath(
              new URL("./test/recovery-drill-cases.ts", import.meta.url),
            ),
          ],
          {
            env: { ...environment, KERNEL_RECOVERY_DRILL_ROOT: directory },
            encoding: "utf8",
            timeout: 60_000,
            windowsHide: true,
          },
        );
        assert.equal(result.error, undefined, result.error?.message);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /^# tests 1\r?$/m);
        assert.match(result.stdout, /^# pass 1\r?$/m);
      },
      async () => {
        assert.equal(
          path.dirname(await realpath(directory)),
          await realpath(tmpdir()),
        );
        assert.ok(
          path.basename(directory).startsWith("kernel-recovery-drill-"),
        );
        await rm(directory, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100,
        });
      },
    );
    await assert.rejects(access(directory), { code: "ENOENT" });
  });
}

test("recovery worker reports both operation and cleanup failures", () => {
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
      "HOME",
    ].flatMap((key) =>
      process.env[key] === undefined ? [] : [[key, process.env[key]]],
    ),
  );
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-reporter=tap",
      "--test-name-pattern=^recovery cleanup failure probe",
      fileURLToPath(new URL("./test/recovery-drill-cases.ts", import.meta.url)),
    ],
    {
      env: { ...environment, KERNEL_RECOVERY_CLEANUP_FAILURE_PROBE: "true" },
      encoding: "utf8",
      timeout: 60_000,
      windowsHide: true,
    },
  );
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /synthetic-operation-failure/);
  assert.match(result.stdout, /synthetic-close-failure/);
});
