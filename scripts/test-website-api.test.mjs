import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { mkdtemp, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createWebsiteTestEnvironment,
  superviseWebsiteApi,
} from "./website-api-runner.mjs";

test("child environment uses its owned fixture instead of inherited temporary paths", () => {
  const environment = createWebsiteTestEnvironment("/isolated/owned-fixture", {
    PATH: "synthetic-path",
    SystemRoot: "synthetic-system-root",
    TEMP: "/shared/unsafe-temp",
    TMP: "/shared/unsafe-tmp",
    SECRET: "must-not-be-inherited",
  });
  assert.equal(environment.TEMP, "/isolated/owned-fixture");
  assert.equal(environment.TMP, "/isolated/owned-fixture");
  assert.equal(environment.PATH, "synthetic-path");
  assert.equal(environment.SystemRoot, "synthetic-system-root");
  assert.equal(Object.hasOwn(environment, "SECRET"), false);
});

test("child environment supports a minimal parent environment", () => {
  const environment = createWebsiteTestEnvironment(
    "/isolated/owned-fixture",
    {},
  );
  assert.equal(environment.PATH, "");
  assert.equal(Object.hasOwn(environment, "SystemRoot"), false);
});

function childFixture() {
  const child = new EventEmitter();
  child.pid = 123;
  child.exitCode = null;
  child.signalCode = null;
  child.unref = () => {};
  return child;
}

test("child failure waits for confirmed exit before removing owned data", async () => {
  const child = childFixture();
  const signals = new EventEmitter();
  const failure = new Error("synthetic child failure");
  let removed = false;
  child.kill = () => true;
  const result = superviseWebsiteApi(
    child,
    () => {
      removed = true;
    },
    { signals },
  );
  child.emit("error", failure);
  await Promise.resolve();
  assert.equal(removed, false);
  child.exitCode = 1;
  child.emit("exit", 1);
  await assert.rejects(result, (error) => error === failure);
  assert.equal(removed, true);
});

test("uncertain stop preserves owned data and both failures", async () => {
  const child = childFixture();
  const failure = new Error("synthetic child failure");
  let removed = false;
  child.kill = () => false;
  const result = superviseWebsiteApi(
    child,
    () => {
      removed = true;
    },
    { signals: new EventEmitter() },
  );
  child.emit("error", failure);
  await assert.rejects(
    result,
    (error) =>
      error instanceof AggregateError &&
      error.errors[0] === failure &&
      /Could not signal/.test(error.errors[1].message),
  );
  assert.equal(removed, false);
});

test("failure to start cleans its owned fixture and preserves cleanup error", async () => {
  const child = childFixture();
  child.pid = undefined;
  const failure = new Error("synthetic start failure");
  const cleanupFailure = new Error("synthetic cleanup failure");
  const result = superviseWebsiteApi(
    child,
    () => {
      throw cleanupFailure;
    },
    { signals: new EventEmitter() },
  );
  child.emit("error", failure);
  await assert.rejects(
    result,
    (error) =>
      error instanceof AggregateError &&
      error.errors[0] === failure &&
      error.errors[1] === cleanupFailure,
  );
});

test("signal cleanup waits for exit and preserves intentional stop result", async () => {
  const child = childFixture();
  const signals = new EventEmitter();
  let removed = false;
  child.kill = () => true;
  const result = superviseWebsiteApi(
    child,
    () => {
      removed = true;
    },
    { signals },
  );
  signals.emit("SIGTERM");
  await Promise.resolve();
  assert.equal(removed, false);
  child.signalCode = "SIGTERM";
  child.emit("exit", null, "SIGTERM");
  assert.equal(await result, 0);
  assert.equal(removed, true);
});

test("a failed child exit is not reported as a successful stop", async () => {
  const child = childFixture();
  const signals = new EventEmitter();
  child.kill = () => true;
  const result = superviseWebsiteApi(child, () => {}, { signals });
  signals.emit("SIGTERM");
  child.exitCode = 1;
  child.emit("exit", 1);
  assert.equal(await result, 1);
});

test("a stop timeout leaves the owned fixture untouched", async () => {
  const child = childFixture();
  const signals = new EventEmitter();
  let removed = false;
  let unreferenced = false;
  child.unref = () => {
    unreferenced = true;
  };
  child.kill = () => true;
  const result = superviseWebsiteApi(
    child,
    () => {
      removed = true;
    },
    { signals, timeoutMs: 5 },
  );
  signals.emit("SIGTERM");
  await assert.rejects(result, /did not exit/);
  assert.equal(removed, false);
  assert.equal(unreferenced, true);
});

test("an unexpected child signal is not reported as a successful stop", async () => {
  const child = childFixture();
  const signals = new EventEmitter();
  child.kill = () => true;
  const result = superviseWebsiteApi(child, () => {}, { signals });
  signals.emit("SIGTERM");
  child.signalCode = "SIGSEGV";
  child.emit("exit", null, "SIGSEGV");
  assert.equal(await result, 1);
});

test("a real synthetic child exits before fixture cleanup", async () => {
  const child = spawn(
    process.execPath,
    ["--eval", "setInterval(() => {}, 1000)"],
    {
      env: {
        NODE_V8_COVERAGE: undefined,
        ...(process.env.SystemRoot
          ? { SystemRoot: process.env.SystemRoot }
          : {}),
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  const signals = new EventEmitter();
  let removed = false;
  const result = superviseWebsiteApi(
    child,
    () => {
      assert.ok(child.exitCode !== null || child.signalCode !== null);
      removed = true;
    },
    { signals },
  );
  signals.emit("SIGTERM");
  assert.equal(await result, 0);
  assert.equal(removed, true);
});

test("an unconfirmed real child is unreferenced and explicitly reaped by the test", async () => {
  const child = spawn(
    process.execPath,
    ["--eval", "setInterval(() => {}, 1000)"],
    {
      env: {
        NODE_V8_COVERAGE: undefined,
        ...(process.env.SystemRoot
          ? { SystemRoot: process.env.SystemRoot }
          : {}),
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  const realKill = child.kill.bind(child);
  const realUnref = child.unref.bind(child);
  const signals = new EventEmitter();
  let unreferenced = false;
  let removed = false;
  child.kill = () => true;
  child.unref = () => {
    unreferenced = true;
    return realUnref();
  };
  const exited = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("synthetic child not reaped")),
      5000,
    );
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  try {
    const result = superviseWebsiteApi(
      child,
      () => {
        removed = true;
      },
      { signals, timeoutMs: 10 },
    );
    signals.emit("SIGTERM");
    await assert.rejects(result, /did not exit/);
    assert.equal(unreferenced, true);
    assert.equal(removed, false);
  } finally {
    realKill("SIGKILL");
    await exited;
  }
});

test("CLI supervises a synthetic child and removes its owned fixture", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "kernel-website-cli-test-"));
  const preload = path.join(parent, "preload.mjs");
  try {
    await writeFile(
      preload,
      `
      import childProcess from "node:child_process";
      import { EventEmitter } from "node:events";
      import { syncBuiltinESMExports } from "node:module";
      childProcess.spawn = (executable, args, options) => {
        if (executable !== process.execPath || args[0] !== "src/index.ts" ||
            options.env.NODE_ENV !== "test" || options.env.STORAGE_DRIVER !== "local" ||
            options.env.TEMP !== options.env.TMP ||
            !options.env.DATABASE_URL.includes("test.sqlite") ||
            options.env.CLI_TEST_SECRET !== undefined) {
          throw new Error("Unexpected synthetic child configuration");
        }
        const child = new EventEmitter();
        child.exitCode = 0;
        child.signalCode = null;
        setImmediate(() => child.emit("exit", 0, null));
        return child;
      };
      syncBuiltinESMExports();
    `,
    );
    const child = spawn(
      process.execPath,
      [
        "--import",
        pathToFileURL(preload).href,
        fileURLToPath(new URL("./website-api-runner.mjs", import.meta.url)),
      ],
      {
        env: {
          NODE_V8_COVERAGE: process.env.NODE_V8_COVERAGE,
          PATH: process.env.PATH ?? "",
          ...(process.env.SystemRoot
            ? { SystemRoot: process.env.SystemRoot }
            : {}),
          TEMP: parent,
          TMP: parent,
          TMPDIR: parent,
          CLI_TEST_SECRET: "do-not-inherit",
        },
        stdio: "ignore",
        windowsHide: true,
      },
    );
    const timeout = setTimeout(() => child.kill(), 10_000);
    try {
      const [code, signal] = await once(child, "exit");
      assert.equal(signal, null);
      assert.equal(code, 0);
    } finally {
      clearTimeout(timeout);
    }
    assert.deepEqual(await readdir(parent), ["preload.mjs"]);
  } finally {
    await unlink(preload);
    await rmdir(parent);
  }
});
