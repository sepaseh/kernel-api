import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "node:test";

import {
  finishNativeSmoke,
  stopNativeSmokeServer,
  waitForNativeSmokeReady,
} from "./native-smoke-cleanup.mjs";

const readinessServer = () =>
  Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    exitCode: null,
    signalCode: null,
  });

test("native smoke readiness follows a complete startup log event", async () => {
  const server = readinessServer();
  let ready = false;
  const result = waitForNativeSmokeReady(server).then(() => {
    ready = true;
  });
  server.stdout.write('unstructured output\n{"event":"server.initializing"}\n');
  server.stdout.write('{"event":"server.');
  await Promise.resolve();
  assert.equal(ready, false);
  server.stdout.end('started"}\n');
  await result;
  assert.equal(ready, true);
  assert.equal(server.listenerCount("exit"), 0);
  assert.equal(server.listenerCount("error"), 0);
});

test("native smoke readiness reports early exit and process or output errors", async () => {
  for (const event of ["exit", "error", "output-error"]) {
    const server = readinessServer();
    const result = waitForNativeSmokeReady(server);
    const failure = new Error("synthetic readiness failure");
    if (event === "output-error") server.stdout.emit("error", failure);
    else server.emit(event, failure);
    await assert.rejects(
      result,
      event === "exit"
        ? /exited before readiness/
        : (error) => error === failure,
    );
    assert.equal(server.listenerCount("exit"), 0);
    assert.equal(server.listenerCount("error"), 0);
    server.stdout.destroy();
  }
});

test("native smoke readiness can be cancelled without elapsed time", async () => {
  const server = readinessServer();
  const cancellation = new AbortController();
  const failure = new Error("synthetic readiness cancellation");
  const result = waitForNativeSmokeReady(server, {
    signal: cancellation.signal,
  });
  cancellation.abort(failure);
  await assert.rejects(result, (error) => error === failure);
  assert.equal(server.listenerCount("exit"), 0);
  server.stdout.destroy();
});

test("native smoke rejects terminal output before readiness while the child remains alive", async () => {
  for (const completion of ["end", "destroy"]) {
    const server = readinessServer();
    const result = waitForNativeSmokeReady(server);
    server.stdout[completion]();
    await assert.rejects(result, /output ended before readiness/);
    assert.equal(server.exitCode, null);
    assert.equal(server.listenerCount("exit"), 0);
    assert.equal(server.listenerCount("error"), 0);
    assert.equal(server.stdout.listenerCount("error"), 0);
  }
});

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

test("native smoke runs independent removals together and retains failures in resource order", async () => {
  const releaseFailure = new Error("synthetic release cleanup failure");
  const stateFailure = new Error("synthetic state cleanup failure");
  let rejectRelease;
  const actions = [];
  await assert.rejects(
    finishNativeSmoke(
      [],
      () => {},
      () => {
        actions.push("release");
        return new Promise((_resolve, reject) => {
          rejectRelease = reject;
        });
      },
      () => {
        actions.push("state");
        assert.equal(typeof rejectRelease, "function");
        rejectRelease(releaseFailure);
        throw stateFailure;
      },
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [releaseFailure, stateFailure]);
      return true;
    },
  );
  assert.deepEqual(actions, ["release", "state"]);
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
      queueMicrotask(() => this.emit("close", 0, null));
      return true;
    },
  });
  await stopNativeSmokeServer(server);
  assert.equal(server.listenerCount("exit"), 0);
});

test("native smoke retains files until an exited child's captured streams close", async () => {
  const stream = { closed: false };
  const server = Object.assign(new EventEmitter(), {
    pid: 123,
    exitCode: null,
    signalCode: null,
    stdio: [stream],
    kill: () => true,
  });
  let removed = false;
  const result = finishNativeSmoke(
    [],
    () => stopNativeSmokeServer(server),
    () => {
      removed = true;
    },
    () => {},
  );
  server.exitCode = 0;
  server.emit("exit", 0, null);
  await Promise.resolve();
  assert.equal(removed, false);
  stream.closed = true;
  server.emit("close", 0, null);
  await result;
  assert.equal(removed, true);
  assert.equal(server.listenerCount("close"), 0);
});

test("cancelling an unconfirmed server stop preserves its owned data", async () => {
  const cancellation = new AbortController();
  const server = Object.assign(new EventEmitter(), {
    pid: 123,
    exitCode: null,
    signalCode: null,
    kill() {
      return true;
    },
  });
  let removed = false;
  const result = finishNativeSmoke(
    [],
    () => stopNativeSmokeServer(server, { signal: cancellation.signal }),
    () => {
      removed = true;
    },
    () => {
      removed = true;
    },
  );
  cancellation.abort(new Error("synthetic operator cancellation"));
  await assert.rejects(result, /did not exit/);
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
