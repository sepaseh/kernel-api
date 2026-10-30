import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { existsSync } from "node:fs";
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
import {
  account,
  otpCodes,
  session,
  user,
} from "../src/infrastructure/db/schema.ts";
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
  return { auth, client, config, database };
}

async function withDatabasePair(
  prefix,
  filename,
  extra,
  run,
  create = createDatabase,
  remove = rm,
) {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const clients = [];
  const errors = [];
  try {
    const config = loadConfig({
      BETTER_AUTH_SECRET: "synthetic-test-secret-with-at-least-32-characters",
      DATABASE_URL: pathToFileURL(path.join(root, filename)).href,
      NODE_ENV: "test",
      ...extra,
    });
    const first = create(config);
    clients.push(first.client);
    const second = create(config);
    clients.push(second.client);
    await run({ config, first, second });
  } catch (error) {
    errors.push(error);
  }
  for (const client of clients) {
    try {
      await client.close();
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    assert.ok(path.basename(root).startsWith(prefix));
    await remove(root, {
      recursive: true,
      force: true,
      maxRetries: prefix === "kernel-bootstrap-race-" ? 10 : 5,
      retryDelay: 100,
    });
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, "Fixture operation and cleanup failed");
}

function emergencyCleanup(context, root) {
  context.after(async () => {
    if (!root.path) return;
    assert.ok(
      path.resolve(root.path).startsWith(path.resolve(tmpdir()) + path.sep),
    );
    assert.ok(path.basename(root.path).startsWith("kernel-otp-race-"));
    await rm(root.path, { recursive: true, force: true });
  });
}

test("database pair fixture preserves setup and cleanup failures", async (context) => {
  const root = {};
  emergencyCleanup(context, root);
  let calls = 0;
  let closed = false;
  const setupError = new Error("synthetic second connection failure");
  const closeError = new Error("synthetic close failure");
  const create = () => {
    if (++calls === 2) throw setupError;
    return {
      client: {
        close: () => {
          closed = true;
          throw closeError;
        },
      },
    };
  };
  const remove = async (directory, options) => {
    root.path = directory;
    await rm(directory, options);
  };
  await assert.rejects(
    withDatabasePair(
      "kernel-otp-race-",
      "otp.db",
      {},
      () => assert.fail("callback must not run"),
      create,
      remove,
    ),
    (error) =>
      error instanceof AggregateError &&
      error.errors[0] === setupError &&
      error.errors[1] === closeError,
  );
  assert.equal(closed, true);
  assert.equal(existsSync(root.path), false);
});

test("database pair fixture preserves operation, close and removal failures", async (context) => {
  const root = {};
  emergencyCleanup(context, root);
  const closed = [];
  const operationError = new Error("synthetic operation failure");
  const closeError = new Error("synthetic close failure");
  const removeError = new Error("synthetic removal failure");
  const create = () => {
    const index = closed.length;
    closed.push(false);
    return {
      client: {
        close: () => {
          closed[index] = true;
          if (index === 0) throw closeError;
        },
      },
    };
  };
  const remove = async (directory) => {
    root.path = directory;
    throw removeError;
  };
  await assert.rejects(
    withDatabasePair(
      "kernel-otp-race-",
      "otp.db",
      {},
      () => {
        throw operationError;
      },
      create,
      remove,
    ),
    (error) =>
      error instanceof AggregateError &&
      error.errors[0] === operationError &&
      error.errors[1] === closeError &&
      error.errors[2] === removeError,
  );
  assert.deepEqual(closed, [true, true]);
  assert.equal(existsSync(root.path), true);
});

test("new OTPs store HMACs and reject wrong codes", async (context) => {
  const { config, database } = await setup(context, {
    OTP_FIXED_CODE: "123456",
  });
  const otp = createOtpGateway(config, database);
  const destination = "09120000030";
  await otp.issue(destination, "register");
  const [record] = await database.query.otpCodes.findMany();
  const expected = createHmac("sha256", config.authSecret)
    .update(JSON.stringify([destination, "register", "123456"]))
    .digest("hex");
  assert.equal(record.valueHash, `v2:${expected}`);
  await assert.rejects(
    otp.consume(otp.prepare(destination, "register", "654321")),
    { key: "otpInvalid" },
  );
  await otp.consume(otp.prepare(destination, "register", "123456"));
});

test("mobile-change OTPs cryptographically bind the subject and cannot use legacy hashes", async (context) => {
  const { config, database } = await setup(context, {
    OTP_FIXED_CODE: "123456",
  });
  const otp = createOtpGateway(config, database);
  const destination = "09120000030";
  const subject = JSON.stringify(["actor", "session", "target", "09120000001"]);
  assert.throws(() => otp.prepare(destination, "change_mobile", "123456"), {
    key: "otpInvalid",
  });
  await assert.rejects(otp.issue(destination, "change_mobile"), {
    key: "otpInvalid",
  });
  await otp.issue(destination, "change_mobile", subject);
  await assert.rejects(
    otp.issue(destination, "change_mobile", "different-actor-and-session"),
    { key: "otpThrottled" },
  );
  const [record] = await database.query.otpCodes.findMany();
  const expected = createHmac("sha256", config.authSecret)
    .update(JSON.stringify([destination, "change_mobile", "123456", subject]))
    .digest("hex");
  assert.equal(record.valueHash, `v3:${expected}`);
  await assert.rejects(
    otp.consume(
      otp.prepare(
        destination,
        "change_mobile",
        "123456",
        JSON.stringify(["actor", "other-session", "target", "09120000001"]),
      ),
    ),
    { key: "otpInvalid" },
  );
  const attempt = otp.prepare(destination, "change_mobile", "123456", subject);
  await database
    .update(otpCodes)
    .set({ valueHash: `v2:${attempt.legacyValueHash}` });
  await assert.rejects(otp.consume(attempt), { key: "otpInvalid" });
  await database.update(otpCodes).set({ valueHash: `v3:${expected}` });
  await otp.consume(attempt);
  await assert.rejects(otp.consume(attempt), { key: "otpInvalid" });
});

test("legacy OTP hashes remain single-use and respect expiry", async (context) => {
  const { config, database } = await setup(context, {
    OTP_FIXED_CODE: "123456",
  });
  const otp = createOtpGateway(config, database);
  const destination = "09120000031";
  const legacy = createHash("sha256")
    .update(`${config.authSecret}:${destination}:register:123456`)
    .digest("hex");
  await database.insert(otpCodes).values({
    id: "legacy",
    destination,
    purpose: "register",
    valueHash: legacy,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  const attempt = otp.prepare(destination, "register", "123456");
  await assert.rejects(
    otp.consume({ ...attempt, legacyValueHash: undefined }),
    { key: "otpInvalid" },
  );
  await assert.rejects(
    otp.consume(otp.prepare(destination, "register", "654321")),
    { key: "otpInvalid" },
  );
  await otp.consume(attempt);
  await assert.rejects(otp.consume(attempt), { key: "otpInvalid" });

  await database
    .update(otpCodes)
    .set({ consumedAt: null, expiresAt: new Date(Date.now() - 1_000) });
  await assert.rejects(otp.consume(attempt), { key: "otpInvalid" });
});

test("malformed stored or prepared hashes fail closed", async (context) => {
  const { config, database } = await setup(context, {
    OTP_FIXED_CODE: "123456",
  });
  const otp = createOtpGateway(config, database);
  const destination = "09120000032";
  await otp.issue(destination, "register");
  const attempt = otp.prepare(destination, "register", "123456");
  for (const malformed of [
    "",
    "ab",
    "zz".repeat(32),
    "a".repeat(63),
    `${"a".repeat(64)}00`,
    "v2:ab",
    `v3:${"a".repeat(64)}`,
  ]) {
    await database.update(otpCodes).set({ valueHash: malformed });
    await assert.rejects(otp.consume(attempt), { key: "otpInvalid" });
  }
  await database.update(otpCodes).set({ valueHash: attempt.valueHash });
  for (const malformed of [
    "00",
    `v2:${"a".repeat(63)}`,
    `v2:${"z".repeat(64)}`,
  ]) {
    await assert.rejects(otp.consume({ ...attempt, valueHash: malformed }), {
      key: "otpInvalid",
    });
  }
  // An otherwise matching legacy candidate must never validate a v2 record.
  const legacy = attempt.legacyValueHash;
  await database.update(otpCodes).set({ valueHash: `v2:${legacy}` });
  await assert.rejects(otp.consume(attempt), { key: "otpInvalid" });
});

test("bootstrap creates one credential without a session and refuses a rerun", async (context) => {
  const { auth, database } = await setup(context);
  await createInitialAdmin(database, auth, input);
  assert.equal((await database.query.user.findMany()).length, 1);
  assert.equal((await database.query.account.findMany()).length, 1);
  assert.equal((await database.query.session.findMany()).length, 0);
  await assert.rejects(createInitialAdmin(database, auth, input));
  assert.equal((await database.query.user.findMany()).length, 1);
});

test("bootstrap refuses an inactive existing user without modifying it", async (context) => {
  const { auth, database } = await setup(context);
  await database.insert(user).values({
    id: "synthetic-existing-user",
    email: "existing@kernel.local",
    firstName: "Existing",
    lastName: "Inactive",
    name: "Existing Inactive",
    mobile: "09120000002",
    isSystemAdmin: false,
    status: "inactive",
  });
  const before = await database.select().from(user);
  await assert.rejects(createInitialAdmin(database, auth, input), /no users/);
  assert.deepEqual(await database.select().from(user), before);
  assert.deepEqual(await database.select().from(account), []);
  assert.deepEqual(await database.select().from(session), []);
});

test("bootstrap rolls back user creation when credential insertion fails", async (context) => {
  const { auth, client, database } = await setup(context);
  await client.execute(
    "CREATE TRIGGER synthetic_reject_credential BEFORE INSERT ON account BEGIN SELECT RAISE(ABORT, 'synthetic credential failure'); END",
  );
  await assert.rejects(createInitialAdmin(database, auth, input), (error) => {
    // Inspect only the synthetic trigger marker in the cause chain; never log it.
    for (let cause = error, depth = 0; cause && depth < 5; depth++) {
      if (String(cause.message).includes("synthetic credential failure"))
        return true;
      cause = cause.cause;
    }
    return false;
  });
  assert.deepEqual(await database.select().from(user), []);
  assert.deepEqual(await database.select().from(account), []);
  assert.deepEqual(await database.select().from(session), []);
});

test("concurrent database clients cannot create two initial administrators", async () => {
  await withDatabasePair(
    "kernel-bootstrap-race-",
    "race.sqlite",
    {},
    async ({ config, first, second }) => {
      await migrate(first.database, {
        migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
      });
      const logger = createLogger(config.logging, { write() {} });
      const results = await Promise.allSettled([
        createInitialAdmin(
          first.database,
          createAuth(config, first.database, logger),
          input,
        ),
        createInitialAdmin(
          second.database,
          createAuth(config, second.database, logger),
          {
            ...input,
            mobile: "09120000002",
            username: "second-admin",
          },
        ),
      ]);
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      const users = await first.database.select().from(user);
      const credentials = await first.database.select().from(account);
      assert.equal(users.length, 1);
      assert.equal(credentials.length, 1);
      assert.equal(credentials[0].userId, users[0].id);
      assert.deepEqual(await first.database.select().from(session), []);
      await assert.rejects(
        createInitialAdmin(
          first.database,
          createAuth(config, first.database, logger),
          input,
        ),
        /no users/,
      );
    },
  );
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

test("concurrent OTP issuance across database connections remains atomic", async () => {
  await withDatabasePair(
    "kernel-otp-race-",
    "otp.db",
    { OTP_FIXED_CODE: "123456" },
    async ({ config, first, second }) => {
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
    },
  );
});

test("duplicate v2 OTP records do not allow the same code to be reused", async (context) => {
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

test("mixed legacy and v2 duplicate records cannot be replayed", async (context) => {
  const { config, database } = await setup(context, {
    OTP_FIXED_CODE: "123456",
  });
  const otp = createOtpGateway(config, database);
  const destination = "09120000034";
  const legacy = createHash("sha256")
    .update(`${config.authSecret}:${destination}:register:123456`)
    .digest("hex");
  await database.insert(otpCodes).values({
    id: "old-legacy",
    destination,
    purpose: "register",
    valueHash: legacy,
    createdAt: new Date(Date.now() - 121_000),
    expiresAt: new Date(Date.now() + 60_000),
  });
  await otp.issue(destination, "register");
  const attempt = otp.prepare(destination, "register", "123456");
  await otp.consume(attempt);
  await assert.rejects(otp.consume(attempt), { key: "otpInvalid" });
});

test("duplicate legacy records cannot be replayed", async (context) => {
  const { config, database } = await setup(context, {
    OTP_FIXED_CODE: "123456",
  });
  const otp = createOtpGateway(config, database);
  const destination = "09120000035";
  const legacy = createHash("sha256")
    .update(`${config.authSecret}:${destination}:register:123456`)
    .digest("hex");
  const fields = {
    destination,
    purpose: "register",
    valueHash: legacy,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  };
  await database.insert(otpCodes).values([
    { id: "legacy-a", ...fields },
    { id: "legacy-b", ...fields },
  ]);
  const attempt = otp.prepare(destination, "register", "123456");
  await otp.consume(attempt);
  await assert.rejects(otp.consume(attempt), { key: "otpInvalid" });
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
  const { auth, config, database } = await setup(context, {
    OTP_FIXED_CODE: "123456",
  });
  const { userId } = await createAuthGateway(auth).provider.signUp({
    authEmail: "reset-v2@synthetic.local",
    firstName: "Test",
    lastName: "User",
    mobile: "09120000003",
    name: "Test User",
    password: "synthetic-password",
  });
  await database.delete(account).where(eq(account.userId, userId));
  const otp = createOtpGateway(config, database);
  await otp.issue("09120000003", "forgot_password");
  const attempt = otp.prepare("09120000003", "forgot_password", "123456");
  const persistence = createAuthPersistence(database);
  await assert.rejects(
    persistence.resetPasswordWithOtp({
      userId,
      newHash: "synthetic",
      otp: attempt,
    }),
    { key: "passwordResetInvalid" },
  );
  await otp.consume(attempt);
  await assert.rejects(otp.consume(attempt));
});

test("failed password reset rolls back legacy OTP consumption", async (context) => {
  const { auth, config, database } = await setup(context, {
    OTP_FIXED_CODE: "123456",
  });
  const otp = createOtpGateway(config, database);
  const destination = "09120000033";
  const { userId } = await createAuthGateway(auth).provider.signUp({
    authEmail: "reset-legacy@synthetic.local",
    firstName: "Test",
    lastName: "User",
    mobile: destination,
    name: "Test User",
    password: "synthetic-password",
  });
  await database.delete(account).where(eq(account.userId, userId));
  const legacy = createHash("sha256")
    .update(`${config.authSecret}:${destination}:forgot_password:123456`)
    .digest("hex");
  await database.insert(otpCodes).values({
    id: "legacy-transaction",
    destination,
    purpose: "forgot_password",
    valueHash: legacy,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  const attempt = otp.prepare(destination, "forgot_password", "123456");
  const persistence = createAuthPersistence(database);
  await assert.rejects(
    persistence.resetPasswordWithOtp({
      userId,
      newHash: "synthetic",
      otp: attempt,
    }),
    { key: "passwordResetInvalid" },
  );
  await otp.consume(attempt);
  await assert.rejects(otp.consume(attempt), { key: "otpInvalid" });
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

const runProductionCli = (databaseUrl, jsonInput, args = []) =>
  spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("../src/bootstrap-admin.ts", import.meta.url)),
      ...args,
    ],
    {
      encoding: "utf8",
      env: {
        BETTER_AUTH_SECRET: "synthetic-test-secret-with-at-least-32-characters",
        BETTER_AUTH_URL: "https://api.synthetic.invalid",
        DATABASE_URL: databaseUrl,
        NODE_ENV: "production",
        PATH: process.env.PATH,
        SERVER_ALLOWED_ORIGINS: "https://admin.synthetic.invalid",
        SERVER_RELEASE_ID: "synthetic-test-release",
        STORAGE_DRIVER: "local",
        SystemRoot: process.env.SystemRoot,
      },
      input: jsonInput,
      timeout: 15_000,
    },
  );

const cliDirectory = async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "kernel-bootstrap-cli-"));
  context.after(async () => {
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    assert.ok(path.basename(root).startsWith("kernel-bootstrap-cli-"));
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  });
  return root;
};

test("invalid bootstrap CLI inputs do not create a database", async (context) => {
  const root = await cliDirectory(context);
  const databasePath = path.join(root, "must-not-open.sqlite");
  const databaseUrl = pathToFileURL(databasePath).href;
  for (const [body, args] of [
    ["{malformed-synthetic-input", []],
    [JSON.stringify({ ...input, password: "short" }), []],
    [JSON.stringify(input), ["--unexpected"]],
    ["x".repeat(64 * 1024 + 1), []],
  ]) {
    const result = runProductionCli(databaseUrl, body, args);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Initial administrator was not created/);
    assert.doesNotMatch(
      result.stderr,
      /synthetic-input|synthetic-password|SyntaxError|stack/,
    );
    assert.equal(existsSync(databasePath), false);
  }
});
