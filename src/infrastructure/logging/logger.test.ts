import assert from "node:assert/strict";
import { test } from "node:test";

import { DrizzleQueryError } from "drizzle-orm/errors";

import type { LoggingConfig } from "../config.ts";
import { loadLoggingConfig } from "../config.ts";
import { createAuthLogger, createLogger, requestLogContext } from "./logger.ts";
import { sanitizeLogText, serializeLogError } from "./sanitization.ts";

const captureLogs = (
  config: LoggingConfig = {
    environment: "test",
    level: "debug",
    pretty: false,
    release: "test-release",
  },
) => {
  const lines: string[] = [];
  const logger = createLogger(config, {
    write(chunk) {
      lines.push(chunk);
    },
  });
  return {
    lines,
    logger,
    records: () =>
      lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
};

test("redacts real Drizzle query errors and their causes", () => {
  const output = captureLogs();
  const error = new DrizzleQueryError(
    "select synthetic-query",
    ["synthetic-param"],
    new Error("synthetic-driver"),
  );
  output.logger.error({ err: error }, "Operation failed");
  assert.doesNotMatch(output.lines.join(""), /synthetic-|select /);
  assert.equal(
    (output.records()[0].err as Record<string, unknown>).type,
    "Error",
  );
});

test("writes JSON with standard levels, UTC time, environment, and release", () => {
  const output = captureLogs();
  for (const level of ["debug", "info", "warn", "error"] as const) {
    output.logger[level]({ event: "test.event" }, "Test event");
  }
  assert.deepEqual(
    output.records().map((record) => record.level),
    [20, 30, 40, 50],
  );
  for (const record of output.records()) {
    assert.equal(record.environment, "test");
    assert.equal(record.release, "test-release");
    assert.equal(record.service, "kernel-api");
    assert.match(String(record.time), /^\d{4}-\d{2}-\d{2}T.*Z$/);
  }
  const filtered = captureLogs({
    environment: "test",
    level: "warn",
    pretty: false,
    release: "test",
  });
  filtered.logger.debug("Hidden debug");
  filtered.logger.info("Hidden info");
  filtered.logger.warn("Visible warning");
  assert.equal(filtered.records().length, 1);
});

test("limits pretty output to development and validates logging configuration", () => {
  assert.equal(loadLoggingConfig({}).pretty, true);
  assert.equal(loadLoggingConfig({ NODE_ENV: "test" }).pretty, false);
  assert.equal(
    loadLoggingConfig({ SERVER_ENVIRONMENT: "staging" }).pretty,
    false,
  );
  const production = loadLoggingConfig({
    NODE_ENV: "production",
    SERVER_RELEASE_ID: "commit-123",
  });
  assert.equal(production.pretty, false);
  assert.equal(production.level, "info");
  assert.throws(() => loadLoggingConfig({ LOG_LEVEL: "verbose" }), /LOG_LEVEL/);
  assert.throws(
    () => loadLoggingConfig({ NODE_ENV: "production" }),
    /SERVER_RELEASE_ID/,
  );
  assert.throws(
    () => loadLoggingConfig({ SERVER_RELEASE_ID: "invalid\nrelease" }),
    /invalid/,
  );
});

test("redacts nested credentials, cookies, OTP, database and storage data including child bindings", () => {
  const output = captureLogs();
  const fields = {
    AUTHORIZATION: "synthetic-auth",
    access_token: "synthetic-access",
    currentPassword: "synthetic-current",
    databaseUrl: "file:synthetic-private.sqlite",
    deep: [
      {
        cookie: "synthetic-cookie",
        safe: { OTP_CODE: "synthetic-otp", secretKey: "synthetic-secret" },
      },
    ],
    minio: {
      endPoint: "synthetic-internal-host",
      secretKey: "synthetic-minio",
    },
    new_password: "synthetic-new",
    refreshToken: "synthetic-refresh",
    safe: "retained",
    "set-cookie": "synthetic-set-cookie",
  };
  const child = output.logger.child({
    password: "synthetic-child",
    requestId: "request-123",
  });
  child.info(fields, "Safe message");
  assert.doesNotMatch(output.lines.join(""), /synthetic-/);
  assert.equal(output.records()[0].safe, "retained");
  assert.equal(output.records()[0].requestId, "request-123");
  assert.equal(fields.currentPassword, "synthetic-current");
});

test("removes credentials and URLs from text and never interpolates arbitrary arguments", () => {
  const output = captureLogs();
  output.logger.info(
    {
      detail:
        "Bearer synthetic-bearer https://internal.example/private?token=synthetic-query",
    },
    "password=synthetic-password",
  );
  output.logger.info("message %s", "synthetic-interpolation");
  assert.doesNotMatch(output.lines.join(""), /synthetic-|internal\.example/);
});

test("normalizes control characters and Unicode line separators in log messages and fields", () => {
  const output = captureLogs();
  output.logger.info(
    { detail: "safe\r\n\u2028\u2029tail" },
    "event\u2028line\u2029tail",
  );
  assert.equal(output.records().length, 1);
  assert.equal(output.records()[0].detail, "safe    tail");
  assert.equal(output.records()[0].msg, "event line tail");
});

test("credential assignments redact quoted and unquoted values while retaining public metadata", () => {
  const text = `password="synthetic quoted secret"; token='synthetic quoted token'; api-key=synthetic-key, access_key: synthetic-access&database_url=synthetic-db safe=retained`;
  const sanitized = sanitizeLogText(text);
  assert.doesNotMatch(sanitized, /synthetic/);
  assert.match(sanitized, /safe=retained/);
  assert.equal(
    sanitizeLogText("result=retained release=commit123"),
    "result=retained release=commit123",
  );
  assert.equal(
    sanitizeLogText("safe=password=synthetic-private"),
    "safe=password=[Redacted]",
  );
  assert.equal(
    sanitizeLogText("prefixPassword=synthetic-private"),
    "prefixPassword=[Redacted]",
  );
  assert.equal(sanitizeLogText("x".repeat(8_192)), "x".repeat(2_048));
});

test("serialized JSON credentials and escaped quoted values stay private in Pino messages and fields", () => {
  const text = JSON.stringify({
    token: 'synthetic-token"synthetic-tail',
    apiKey: "synthetic-key\\synthetic-tail",
    password: "",
    secret: 'https://internal.example/private"synthetic-url-tail',
    safe: "retained",
  });
  const expected =
    '{"token":[Redacted],"apiKey":[Redacted],"password":[Redacted],"secret":[Redacted],"safe":"retained"}';
  assert.equal(sanitizeLogText(text), expected);
  assert.equal(
    sanitizeLogText(String.raw`{'token':'synthetic\'tail','safe':'retained'}`),
    "{'token':[Redacted],'safe':'retained'}",
  );
  const output = captureLogs();
  output.logger.info({ detail: text }, text);
  assert.equal(output.records()[0].detail, expected);
  assert.equal(output.records()[0].msg, expected);
  assert.doesNotMatch(output.lines.join(""), /synthetic/);
});

test("credential assignments redact complete authorization schemes before generic text masks", () => {
  const output = captureLogs();
  for (const [scheme, spacing] of [
    ["Bearer", " "],
    ["Basic", "\t  "],
    ["bearer", "   "],
    ["BASIC", "\t"],
  ]) {
    const text = `Authorization: ${scheme}${spacing}synthetic-credential; safe=retained`;
    const expected = "Authorization: [Redacted]; safe=retained";
    assert.equal(sanitizeLogText(text), expected);
    output.logger.info({ detail: text }, text);
    assert.equal(output.records().at(-1)?.detail, expected);
    assert.equal(output.records().at(-1)?.msg, expected);
  }
  assert.doesNotMatch(output.lines.join(""), /synthetic/);
});

test("unterminated quoted credentials redact the remaining bounded text", () => {
  for (const text of [
    'password="synthetic private suffix',
    String.raw`token='synthetic\'private suffix`,
    'apiKey="synthetic-trailing\\',
  ]) {
    const sanitized = sanitizeLogText(text);
    assert.doesNotMatch(sanitized, /synthetic|private|suffix|trailing/);
    assert.match(sanitized, /=\[Redacted\]$/);
  }
});

test("serializes safe stack locations and synthetic query-error causes without private fields", () => {
  const output = captureLogs();
  const sql = Object.assign(
    new Error("select synthetic-query", {
      cause: new Error("synthetic-driver"),
    }),
    {
      name: "DrizzleQueryError",
      query: "select synthetic-query",
      params: ["synthetic-param"],
    },
  );
  const outer = new Error("synthetic-wrapper", { cause: sql });
  Object.assign(outer, {
    code: "ECONNREFUSED",
    request: { url: "synthetic-url" },
    password: "synthetic-password",
  });
  output.logger.error({ err: outer }, "Operation failed");
  output.logger.error(outer);
  assert.doesNotMatch(output.lines.join(""), /synthetic-|select /);
  const serialized = output.records()[0].err as Record<string, unknown>;
  assert.equal(serialized.type, "Error");
  assert.equal(serialized.code, "ECONNREFUSED");
  assert.match(String(serialized.stack), /logger.test.ts:\d+:\d+/);
  assert.ok(serialized.cause);
  assert.ok((output.records()[1].err as Record<string, unknown>).stack);
});

test("handles aggregate errors, cycles, deep metadata, getters and non-Error throws", () => {
  const output = captureLogs();
  const cyclic = new Error("synthetic-cycle");
  cyclic.cause = cyclic;
  output.logger.error({
    err: new AggregateError(
      [cyclic, "synthetic-non-error"],
      "synthetic-aggregate",
    ),
  });
  output.logger.error({ err: "synthetic-raw-throw" });
  const circular: Record<string, unknown> = { safe: 7 };
  circular.self = circular;
  Object.defineProperty(circular, "getter", {
    enumerable: true,
    get() {
      throw new Error("Must not call getters");
    },
  });
  output.logger.info({ circular, buffer: Buffer.from("synthetic-buffer") });
  assert.doesNotMatch(output.lines.join(""), /synthetic-/);
  assert.equal(serializeLogError("synthetic-throw").type, "NonError");
  assert.equal(
    (output.records()[2].circular as Record<string, unknown>).safe,
    7,
  );
});

test("hostile Error accessors cannot throw through serialization or expose raw diagnostics", () => {
  for (const property of ["name", "stack", "cause", "code"]) {
    const error = new Error("synthetic-original-error");
    Object.defineProperty(error, property, {
      configurable: true,
      get() {
        throw new Error("synthetic-private-getter");
      },
    });
    assert.deepEqual(serializeLogError(error), {
      message: "Error details withheld",
      type: "Error",
    });
    const output = captureLogs();
    assert.doesNotThrow(() =>
      output.logger.error({ err: error }, "Safe event"),
    );
    assert.doesNotMatch(output.lines.join(""), /synthetic-/);
    assert.deepEqual(output.records()[0].err, {
      message: "Error details withheld",
      type: "Error",
    });
  }
});

test("routes Better Auth diagnostics through the active request logger without raw arguments", async () => {
  const output = captureLogs();
  const authLogger = createAuthLogger(output.logger);
  await Promise.all(
    ["first", "second"].map((requestId) =>
      requestLogContext.run(
        { logger: output.logger.child({ requestId }) },
        async () => {
          await Promise.resolve();
          authLogger.log(
            "error",
            "synthetic-provider-message",
            new Error("synthetic-provider-error"),
          );
        },
      ),
    ),
  );
  authLogger.log("warn", "synthetic-startup-message");
  assert.deepEqual(
    output
      .records()
      .slice(0, 2)
      .map((record) => record.requestId)
      .sort(),
    ["first", "second"],
  );
  assert.equal(output.records()[2].requestId, undefined);
  assert.doesNotMatch(output.lines.join(""), /synthetic-/);
});
