import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import {
  finishNativeSmoke,
  stopNativeSmokeServer,
} from "./native-smoke-cleanup.mjs";

test("native smoke cleans up both resources after server exit", async () => {
  const actions = [];
  await finishNativeSmoke(
    [],
    () => actions.push("stop"),
    () => actions.push("release"),
    () => actions.push("state"),
  );
  assert.deepEqual(actions, ["stop", "release", "state"]);
});

test("native smoke attempts both owned removals and preserves every failure", async () => {
  const operation = new Error("synthetic operation failure");
  const release = new Error("synthetic release cleanup failure");
  const state = new Error("synthetic state cleanup failure");
  const actions = [];
  await assert.rejects(
    finishNativeSmoke(
      [operation],
      () => actions.push("stop"),
      () => {
        actions.push("release");
        throw release;
      },
      () => {
        actions.push("state");
        throw state;
      },
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [operation, release, state]);
      return true;
    },
  );
  assert.deepEqual(actions, ["stop", "release", "state"]);
});

test("native smoke preserves its owned files if server stop cannot be confirmed", async () => {
  const operation = new Error("synthetic operation failure");
  const stop = new Error("synthetic stop failure");
  const removed = [];
  await assert.rejects(
    finishNativeSmoke(
      [operation],
      () => {
        throw stop;
      },
      () => removed.push("release"),
      () => removed.push("state"),
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [operation, stop]);
      return true;
    },
  );
  assert.deepEqual(removed, []);
});

test("native smoke rethrows one failure without replacing it", async () => {
  const failure = new Error("synthetic failure");
  await assert.rejects(
    finishNativeSmoke(
      [],
      () => {},
      () => {},
      () => {
        throw failure;
      },
    ),
    (error) => error === failure,
  );
});

test("native smoke waits for server exit after signalling it", async () => {
  const server = Object.assign(new EventEmitter(), {
    pid: 123,
    exitCode: null,
    signalCode: null,
    kill(signal) {
      assert.equal(signal, "SIGTERM");
      queueMicrotask(() => this.emit("exit", 0, null));
      return true;
    },
  });
  await stopNativeSmokeServer(server, 1_000);
  assert.equal(server.listenerCount("exit"), 0);
});

test("native smoke reports an unconfirmed server exit and does not remove data", async () => {
  const server = Object.assign(new EventEmitter(), {
    pid: 123,
    exitCode: null,
    signalCode: null,
    kill() {
      return true;
    },
  });
  let removed = false;
  await assert.rejects(
    finishNativeSmoke(
      [],
      () => stopNativeSmokeServer(server, 10),
      () => {
        removed = true;
      },
      () => {
        removed = true;
      },
    ),
    /did not exit/,
  );
  assert.equal(removed, false);
  assert.equal(server.listenerCount("exit"), 0);
});

test("native smoke leaves already exited or never started servers alone", async () => {
  let signalled = false;
  await stopNativeSmokeServer(undefined);
  await stopNativeSmokeServer({
    pid: 123,
    exitCode: 0,
    signalCode: null,
    kill() {
      signalled = true;
    },
  });
  assert.equal(signalled, false);
});

test("native smoke refuses to remove resources if signalling fails", async () => {
  const server = Object.assign(new EventEmitter(), {
    pid: 123,
    exitCode: null,
    signalCode: null,
    kill() {
      return false;
    },
  });
  let removed = false;
  await assert.rejects(
    finishNativeSmoke(
      [],
      () => stopNativeSmokeServer(server),
      () => {
        removed = true;
      },
      () => {
        removed = true;
      },
    ),
    /Could not signal/,
  );
  assert.equal(removed, false);
  assert.equal(server.listenerCount("exit"), 0);
  assert.equal(server.listenerCount("error"), 0);
});

test("native smoke reports an error while signalling without deleting files", async () => {
  const failure = new Error("synthetic signalling failure");
  const server = Object.assign(new EventEmitter(), {
    pid: 123,
    exitCode: null,
    signalCode: null,
    kill() {
      throw failure;
    },
  });
  let removed = false;
  await assert.rejects(
    finishNativeSmoke(
      [],
      () => stopNativeSmokeServer(server),
      () => {
        removed = true;
      },
      () => {
        removed = true;
      },
    ),
    (error) => error === failure,
  );
  assert.equal(removed, false);
  assert.equal(server.listenerCount("exit"), 0);
  assert.equal(server.listenerCount("error"), 0);
});
