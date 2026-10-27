import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";

import { createInitialAdmin } from "../src/infrastructure/admin/bootstrap.ts";
import { createAuth } from "../src/infrastructure/auth/better-auth.ts";
import { createAuthGateway } from "../src/infrastructure/auth/gateway.ts";
import { createOtpGateway } from "../src/infrastructure/auth/otp.ts";
import { loadConfig } from "../src/infrastructure/config.ts";
import { createDatabase } from "../src/infrastructure/db/client.ts";
import { otpCodes } from "../src/infrastructure/db/schema.ts";
import { createLogger } from "../src/infrastructure/logging/logger.ts";
import { createAuthPersistence } from "../src/infrastructure/persistence/auth.ts";

const input = {
  first_name: "Test",
  last_name: "Admin",
  mobile: "09120000001",
  password: "synthetic-password",
  username: "test-admin",
};

async function setup(context, extra = {}) {
  const config = loadConfig({
    BETTER_AUTH_SECRET: "synthetic-test-secret-with-at-least-32-characters",
    DATABASE_URL: "file::memory:",
    NODE_ENV: "test",
    ...extra,
  });
  const { client, database } = createDatabase(config);
  context.after(() => client.close());
  await migrate(database, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  const auth = createAuth(
    config,
    database,
    createLogger(config.logging, { write() {} }),
  );
  return { auth, config, database };
}

test("bootstrap creates one credential without a session and refuses a rerun", async (context) => {
  const { auth, database } = await setup(context);
  await createInitialAdmin(database, auth, input);
  assert.equal((await database.query.user.findMany()).length, 1);
  assert.equal((await database.query.account.findMany()).length, 1);
  assert.equal((await database.query.session.findMany()).length, 0);
  await assert.rejects(createInitialAdmin(database, auth, input));
  assert.equal((await database.query.user.findMany()).length, 1);
});

test("OTP consumption is single-use under concurrent requests", async (context) => {
  const { config, database } = await setup(context, {
    OTP_FIXED_CODE: "123456",
  });
  const otp = createOtpGateway(config, database);
  await otp.issue("09120000002", "register");
  const attempt = otp.prepare("09120000002", "register", "123456");
  const results = await Promise.allSettled([
    otp.consume(attempt),
    otp.consume(attempt),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
});

test("concurrent OTP issuance is throttled and cannot create two usable codes", async (context) => {
  const { config, database } = await setup(context, {
    OTP_FIXED_CODE: "123456",
  });
  const otp = createOtpGateway(config, database);
  const results = await Promise.allSettled([
    otp.issue("09120000011", "register"),
    otp.issue("09120000011", "register"),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(rejected.reason.kind, "rate-limited");
  assert.equal(rejected.reason.key, "otpThrottled");
  assert.equal((await database.query.otpCodes.findMany()).length, 1);
  const attempt = otp.prepare("09120000011", "register", "123456");
  await otp.consume(attempt);
  await assert.rejects(otp.consume(attempt));
});

test("concurrent OTP issuance across database connections remains atomic", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "kernel-otp-race-"));
  const config = loadConfig({
    BETTER_AUTH_SECRET: "synthetic-test-secret-with-at-least-32-characters",
    DATABASE_URL: pathToFileURL(path.join(root, "otp.db")).href,
    NODE_ENV: "test",
    OTP_FIXED_CODE: "123456",
  });
  const first = createDatabase(config);
  const second = createDatabase(config);
  context.after(async () => {
    first.client.close();
    second.client.close();
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    assert.ok(path.basename(root).startsWith("kernel-otp-race-"));
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  });
  await migrate(first.database, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  const one = createOtpGateway(config, first.database);
  const two = createOtpGateway(config, second.database);
  const results = await Promise.allSettled([
    one.issue("09120000014", "register"),
    two.issue("09120000014", "register"),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(rejected.reason.kind, "rate-limited");
  assert.equal(rejected.reason.key, "otpThrottled");
  assert.equal((await first.database.query.otpCodes.findMany()).length, 1);
});

test("legacy duplicate OTP records do not allow the same code to be reused", async (context) => {
  const { config, database } = await setup(context, {
    OTP_FIXED_CODE: "123456",
  });
  const otp = createOtpGateway(config, database);
  await otp.issue("09120000013", "register");
  const existing = (await database.query.otpCodes.findMany())[0];
  await database
    .insert(otpCodes)
    .values({ ...existing, id: "zz-legacy-duplicate" });
  const attempt = otp.prepare("09120000013", "register", "123456");
  await otp.consume(attempt);
  await assert.rejects(otp.consume(attempt));
});

test("OTP throttling is scoped by purpose and subject and expires", async (context) => {
  const { config, database } = await setup(context, {
    OTP_FIXED_CODE: "123456",
  });
  const otp = createOtpGateway(config, database);
  await otp.issue("09120000012", "register", "first");
  await assert.rejects(otp.issue("09120000012", "register", "first"), {
    kind: "rate-limited",
    key: "otpThrottled",
  });
  await otp.issue("09120000012", "register", "second");
  await otp.issue("09120000012", "forgot_password");
  await database
    .update(otpCodes)
    .set({ createdAt: new Date(Date.now() - 121_000) })
    .where(eq(otpCodes.subject, "first"));
  await otp.issue("09120000012", "register", "first");
});

test("failed password reset rolls back OTP consumption", async (context) => {
  const { config, database } = await setup(context, {
    OTP_FIXED_CODE: "123456",
  });
  const otp = createOtpGateway(config, database);
  await otp.issue("09120000003", "forgot_password");
  const attempt = otp.prepare("09120000003", "forgot_password", "123456");
  const persistence = createAuthPersistence(database);
  await assert.rejects(
    persistence.resetPasswordWithOtp({
      userId: "missing",
      newHash: "synthetic",
      otp: attempt,
    }),
  );
  await otp.consume(attempt);
  await assert.rejects(otp.consume(attempt));
});

test("password reset binds OTP destination to the current user mobile", async (context) => {
  const { auth, config, database } = await setup(context, {
    OTP_FIXED_CODE: "123456",
  });
  const provider = createAuthGateway(auth).provider;
  const first = await provider.signUp({
    authEmail: "reset-first@synthetic.local",
    firstName: "Test",
    lastName: "User",
    mobile: "09120000007",
    name: "Test User",
    password: "synthetic-password",
  });
  const otp = createOtpGateway(config, database);
  await otp.issue("09120000008", "forgot_password");
  const attempt = otp.prepare("09120000008", "forgot_password", "123456");
  const persistence = createAuthPersistence(database);
  await assert.rejects(
    persistence.resetPasswordWithOtp({
      userId: first.userId,
      newHash: "synthetic-new-hash",
      otp: attempt,
    }),
  );
  await otp.consume(attempt);
});

test("OTP issuance fails without a configured delivery adapter", async (context) => {
  const { config, database } = await setup(context);
  await assert.rejects(
    createOtpGateway(config, database).issue("09120000004", "login"),
    /No OTP delivery adapter/,
  );
});

test("password changes bind both session and credential to the actor", async (context) => {
  const { auth, database } = await setup(context);
  const provider = createAuthGateway(auth).provider;
  const signup = (mobile, email) =>
    provider.signUp({
      authEmail: email,
      firstName: "Test",
      lastName: "User",
      mobile,
      name: "Test User",
      password: "synthetic-password",
    });
  const first = await signup("09120000005", "first@synthetic.local");
  const second = await signup("09120000006", "second@synthetic.local");
  const sessions = await database.query.session.findMany();
  const firstSession = sessions.find((item) => item.userId === first.userId);
  const secondSession = sessions.find((item) => item.userId === second.userId);
  const persistence = createAuthPersistence(database);
  const firstCredential = await persistence.findCredential(first.userId);
  const secondCredential = await persistence.findCredential(second.userId);
  await assert.rejects(
    persistence.changePassword({
      actor: {
        account: { id: first.userId },
        session: { id: secondSession.id },
      },
      credentialId: firstCredential.id,
      expectedHash: firstCredential.hash,
      newHash: "synthetic-new-hash",
    }),
  );
  await assert.rejects(
    persistence.changePassword({
      actor: {
        account: { id: first.userId },
        session: { id: firstSession.id },
      },
      credentialId: secondCredential.id,
      expectedHash: secondCredential.hash,
      newHash: "synthetic-new-hash",
    }),
  );
});

test("successful password change revokes the user's sessions", async (context) => {
  const { auth, database } = await setup(context);
  const provider = createAuthGateway(auth).provider;
  const created = await provider.signUp({
    authEmail: "change@synthetic.local",
    firstName: "Test",
    lastName: "User",
    mobile: "09120000009",
    name: "Test User",
    password: "synthetic-password",
  });
  const persistence = createAuthPersistence(database);
  const credential = await persistence.findCredential(created.userId);
  const active = (await database.query.session.findMany())[0];
  await persistence.changePassword({
    actor: { account: { id: created.userId }, session: { id: active.id } },
    credentialId: credential.id,
    expectedHash: credential.hash,
    newHash: "synthetic-new-hash",
  });
  assert.equal((await database.query.session.findMany()).length, 0);
  assert.equal(
    (await persistence.findCredential(created.userId)).hash,
    "synthetic-new-hash",
  );
  assert.equal(
    (await persistence.findUserById(created.userId)).mobile,
    "09120000009",
  );
  assert.equal(await persistence.findUserById("missing"), undefined);
  await persistence.deleteSession("missing");
});

test("successful OTP password reset consumes the code and revokes sessions", async (context) => {
  const { auth, config, database } = await setup(context, {
    OTP_FIXED_CODE: "123456",
  });
  const provider = createAuthGateway(auth).provider;
  const created = await provider.signUp({
    authEmail: "reset@synthetic.local",
    firstName: "Test",
    lastName: "User",
    mobile: "09120000010",
    name: "Test User",
    password: "synthetic-password",
  });
  const otp = createOtpGateway(config, database);
  await otp.issue("09120000010", "forgot_password");
  const attempt = otp.prepare("09120000010", "forgot_password", "123456");
  const persistence = createAuthPersistence(database);
  await persistence.resetPasswordWithOtp({
    userId: created.userId,
    newHash: "synthetic-new-hash",
    otp: attempt,
  });
  assert.equal((await database.query.session.findMany()).length, 0);
  assert.equal(
    (await persistence.findCredential(created.userId)).hash,
    "synthetic-new-hash",
  );
  await assert.rejects(otp.consume(attempt));
});

test("bootstrap CLI uses explicit synthetic configuration and accepts standard input", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../src/bootstrap-admin.ts", import.meta.url))],
    {
      encoding: "utf8",
      env: {
        BETTER_AUTH_SECRET: "synthetic-test-secret-with-at-least-32-characters",
        DATABASE_URL: "file::memory:",
        NODE_ENV: "test",
        SystemRoot: "C:\\Windows",
      },
      input: JSON.stringify(input),
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Initial administrator created/);
});
