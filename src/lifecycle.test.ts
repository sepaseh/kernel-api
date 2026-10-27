import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const environment = {
  NODE_ENV: "test",
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
};
const childProcessTimeout = 15_000;
const child = (source: string) =>
  spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd,
    encoding: "utf8",
    env: environment,
    timeout: childProcessTimeout,
  });

for (const failure of ["throw", "rejection"] as const) {
  test(`logs a process ${failure} without leaking stderr and exits unsuccessfully`, () => {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import { createLogger } from './src/infrastructure/logging/logger.ts';
      import { installFatalErrorHandlers } from './src/infrastructure/lifecycle.ts';
      const logger = createLogger({ environment: 'test', level: 'info', pretty: false, release: 'test-release' });
      installFatalErrorHandlers(logger);
      setTimeout(() => {
        ${failure === "throw" ? "throw new Error('synthetic-process-secret');" : "void Promise.reject(new Error('synthetic-process-secret'));"}
      }, 0);
    `,
      ],
      { cwd, encoding: "utf8", env: environment, timeout: childProcessTimeout },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    const records = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(records.length, 1);
    assert.equal(records[0].event, "server.crashed");
    assert.equal(records[0].release, "test-release");
    assert.equal(records[0].level, 60);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /synthetic-process-secret/,
    );
  });
}

test("development pretty printing preserves the same redaction policy", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { createLogger } from './src/infrastructure/logging/logger.ts';
    const logger = createLogger({ environment: 'development', level: 'debug', pretty: true, release: 'local-test' });
    logger.info({ password: 'synthetic-pretty-secret', event: 'test.pretty' }, 'Readable event');
  `,
    ],
    { cwd, encoding: "utf8", env: environment, timeout: childProcessTimeout },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Readable event/);
  assert.match(result.stdout, /INFO/);
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-pretty-secret/);
});

for (const [name, flush] of [
  ["never completes", "flush() {}"],
  ["throws", "flush() { throw new Error('synthetic-private-flush'); }"],
]) {
  test(`fatal termination remains unsuccessful and private when flushing ${name}`, () => {
    const result = child(`
      import { flushAndExit } from './src/infrastructure/lifecycle.ts';
      flushAndExit({ ${flush} }, 1);
    `);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout + result.stderr, "");
  });
}

for (const flush of ["flush() {}", "flush(done) { done(); }"]) {
  test(`a throwing fatal logger cannot expose the failure or prevent exit with ${flush}`, () => {
    const result = child(`
      import { installFatalErrorHandlers } from './src/infrastructure/lifecycle.ts';
      installFatalErrorHandlers({
        fatal() { throw new Error('synthetic-private-log'); },
        ${flush}
      });
      process.emit('uncaughtException', new Error('synthetic-private-input'));
    `);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout + result.stderr, "");
  });
}

test("a stalled flush exits by its deadline and repeated fatal signals log once", () => {
  const result = child(`
    import { installFatalErrorHandlers } from './src/infrastructure/lifecycle.ts';
    installFatalErrorHandlers({
      fatal() { process.stdout.write('safe-fatal-event'); },
      flush() {}
    });
    setInterval(() => {}, 50);
    process.emit('uncaughtException', new Error('synthetic-private-first'));
    process.emit('unhandledRejection', new Error('synthetic-private-second'));
  `);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "safe-fatal-event");
  assert.equal(result.stderr, "");
});

for (const failure of ["throw", "rejection"] as const) {
  test(`repeated ${failure} failures during a stalled flush stay private and log once`, () => {
    const result = child(`
      import { installFatalErrorHandlers } from './src/infrastructure/lifecycle.ts';
      installFatalErrorHandlers({
        fatal() { process.stdout.write('safe-fatal-event'); },
        flush() {}
      });
      setInterval(() => {}, 50);
      setTimeout(() => {
        ${failure === "throw" ? "throw new Error('synthetic-private-first');" : "void Promise.reject(new Error('synthetic-private-first'));"}
      }, 0);
      setTimeout(() => {
        ${failure === "throw" ? "throw new Error('synthetic-private-second');" : "void Promise.reject(new Error('synthetic-private-second'));"}
      }, 20);
    `);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "safe-fatal-event");
    assert.equal(result.stderr, "");
  });
}
