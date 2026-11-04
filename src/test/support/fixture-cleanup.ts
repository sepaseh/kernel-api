import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";

type CleanupAction = () => void | Promise<void>;

export const cleanupFixtureResources = async (
  closers: ReadonlyArray<CleanupAction>,
  remove: CleanupAction,
): Promise<void> => {
  const errors: unknown[] = [];
  for (const close of closers) {
    try {
      await close();
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await remove();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, "Fixture cleanup failed");
};

export const registerFixtureCleanup = (
  context: TestContext,
  closers: ReadonlyArray<CleanupAction>,
  remove: CleanupAction,
): void => {
  context.after(async () => {
    try {
      await cleanupFixtureResources(closers, remove);
    } catch (error) {
      context.diagnostic(inspect(error, { depth: 4 }));
      throw error;
    }
  });
};

export const isolatedFileFixture = async (
  context: TestContext,
  moduleUrl: string,
  prefix: string,
): Promise<string | undefined> => {
  assert.ok(
    prefix.startsWith("kernel-") &&
      prefix.endsWith("-") &&
      !/[/\\\0]/.test(prefix),
  );
  const temporaryRoot = await realpath(tmpdir());
  const validateOwnedDirectory = async (directory: string) => {
    const actual = await realpath(directory);
    assert.equal(path.dirname(actual), temporaryRoot);
    assert.ok(path.basename(actual).startsWith(prefix));
    return actual;
  };
  const selected = process.env.KERNEL_TEST_FILE_FIXTURE;
  if (selected) {
    const marker = JSON.parse(selected) as {
      moduleUrl: string;
      name: string;
      directory: string;
    };
    assert.equal(marker.moduleUrl, moduleUrl);
    assert.equal(marker.name, context.name);
    const directory = await validateOwnedDirectory(marker.directory);
    await new Promise<void>((resolve, reject) => {
      assert.ok(process.send);
      process.send(
        { event: "fixture.owned", directory },
        (error: Error | null) => (error ? reject(error) : resolve()),
      );
    });
    process.disconnect();
    return directory;
  }

  const directory = await mkdtemp(path.join(temporaryRoot, prefix));
  await cleanupFixtureResources(
    [
      async () => {
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
            "NODE_V8_COVERAGE",
          ].flatMap((key) =>
            process.env[key] === undefined ? [] : [[key, process.env[key]]],
          ),
        );
        const pattern = `^${context.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
        const child = spawn(
          process.execPath,
          [
            "--test",
            "--test-isolation=none",
            "--test-name-pattern",
            pattern,
            fileURLToPath(moduleUrl),
          ],
          {
            cwd: process.cwd(),
            env: {
              ...environment,
              KERNEL_TEST_FILE_FIXTURE: JSON.stringify({
                moduleUrl,
                name: context.name,
                directory,
              }),
            },
            stdio: ["ignore", "pipe", "pipe", "ipc"],
            windowsHide: true,
          },
        );
        let output = "";
        const childErrors: Error[] = [];
        let reported = false;
        assert.ok(child.stdout && child.stderr);
        const streamFailed = (error: Error) => {
          childErrors.push(error);
          child.kill();
        };
        child.stdout.on("error", streamFailed);
        child.stderr.on("error", streamFailed);
        child.stdout.on("data", (chunk: Buffer) => {
          output += chunk;
        });
        child.stderr.on("data", (chunk: Buffer) => {
          output += chunk;
        });
        child.once("error", (error) => {
          childErrors.push(error);
        });
        child.on("message", (message) => {
          const value: unknown = message;
          if (
            value === null ||
            typeof value !== "object" ||
            Array.isArray(value) ||
            !("event" in value) ||
            !("directory" in value) ||
            value.event !== "fixture.owned" ||
            value.directory !== directory
          ) {
            childErrors.push(
              new Error("The fixture child reported unexpected ownership"),
            );
            child.kill();
          } else reported = true;
        });
        const closed = new Promise<number | null>((resolve) =>
          child.once("close", resolve),
        );
        const stop = () => {
          child.kill();
        };
        context.signal.addEventListener("abort", stop, { once: true });
        if (context.signal.aborted) stop();
        try {
          const code = await closed;
          if (childErrors.length === 1) throw childErrors[0];
          if (childErrors.length > 1)
            throw new AggregateError(
              childErrors,
              "Fixture child process failed",
            );
          if (code !== 0)
            throw new Error(`The isolated fixture scenario failed:\n${output}`);
          assert.ok(
            reported,
            "The fixture child must confirm its owned directory",
          );
        } finally {
          context.signal.removeEventListener("abort", stop);
        }
      },
    ],
    async () => {
      await rm(await validateOwnedDirectory(directory), {
        recursive: true,
        force: true,
      });
    },
  );
  return undefined;
};
