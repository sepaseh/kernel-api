import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import { superviseWebsiteApi } from "./test-website-api.mjs";

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
