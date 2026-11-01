import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";

import { createAuthService } from "../src/application/auth.ts";
import { createUsersService } from "../src/application/users.ts";
import { createInitialAdmin } from "../src/infrastructure/admin/bootstrap.ts";
import { createAuth } from "../src/infrastructure/auth/better-auth.ts";
import { createAuthGateway } from "../src/infrastructure/auth/gateway.ts";
import { loadConfig } from "../src/infrastructure/config.ts";
import { createDatabase } from "../src/infrastructure/db/client.ts";
import { user } from "../src/infrastructure/db/schema.ts";
import { createLogger } from "../src/infrastructure/logging/logger.ts";
import { createAuthPersistence } from "../src/infrastructure/persistence/auth.ts";
import { createDrizzleUsersRepository } from "../src/infrastructure/persistence/users.ts";

const otp = {
  consume: async () => {},
  prepare: (destination, purpose, value) => ({
    destination,
    purpose,
    valueHash: value,
  }),
};

const setup = async (context) => {
  const config = loadConfig({
    BETTER_AUTH_SECRET:
      "synthetic-test-auth-secret-with-at-least-32-characters",
    DATABASE_URL: "file::memory:",
    NODE_ENV: "test",
  });
  const { client, database } = createDatabase(config);
  context.after(() => client.close());
  await migrate(database, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  const logger = createLogger(config.logging, { write() {} });
  const auth = createAuth(config, database, logger);
  const { provider } = createAuthGateway(auth);
  const persistence = createAuthPersistence(database);
  return {
    auth,
    database,
    provider,
    service: createAuthService({ provider, persistence, otp }),
  };
};

test("real Better Auth keeps a legacy identity across a mobile change and allows reuse", async (context) => {
  const { auth, database, provider, service } = await setup(context);
  const oldMobile = "09120000001";
  const newMobile = "09120000002";
  const legacyEmail = `${oldMobile}@kernel.local`;
  const password = "synthetic-password";
  const oldAccount = await provider.signUp({
    authEmail: legacyEmail,
    firstName: "Old",
    lastName: "User",
    mobile: oldMobile,
    name: "Old User",
    password,
  });
  const sessionHeaders = new Headers({
    Authorization: `Bearer ${oldAccount.token}`,
  });
  assert.equal(
    (await auth.api.getSession({ headers: sessionHeaders }))?.user.id,
    oldAccount.userId,
  );
  assert.equal(
    (await service.login({ identifier: oldMobile, password })).userId,
    oldAccount.userId,
  );
  await createDrizzleUsersRepository(database).update(
    oldAccount.userId,
    {
      mobile: newMobile,
    },
    oldAccount.userId,
  );
  assert.equal(
    (await auth.api.getSession({ headers: sessionHeaders }))?.user.id,
    oldAccount.userId,
  );
  assert.equal(
    (await service.login({ identifier: newMobile, password })).userId,
    oldAccount.userId,
  );
  const newAccount = await service.register({
    first_name: "New",
    last_name: "User",
    mobile: oldMobile,
    otp: "123456",
    password,
  });
  assert.notEqual(newAccount.userId, oldAccount.userId);
  assert.equal(
    (await service.login({ identifier: oldMobile, password })).userId,
    newAccount.userId,
  );
  const oldRow = await database.query.user.findFirst({
    where: eq(user.id, oldAccount.userId),
  });
  const newRow = await database.query.user.findFirst({
    where: eq(user.id, newAccount.userId),
  });
  assert.equal(oldRow?.email, legacyEmail);
  assert.match(newRow.email, /^[0-9a-f-]{36}@kernel\.local$/);
});

test("real Better Auth authenticates bootstrap administrator before and after mobile change", async (context) => {
  const { auth, database, service } = await setup(context);
  const password = "synthetic-admin-password";
  await createInitialAdmin(database, auth, {
    first_name: "Admin",
    last_name: "Test",
    mobile: "09120000003",
    password,
    username: "synthetic-admin",
  });
  const before = await service.login({ identifier: "09120000003", password });
  await createDrizzleUsersRepository(database).update(
    before.userId,
    {
      mobile: "09120000004",
    },
    before.userId,
  );
  assert.equal(
    (await service.login({ identifier: "09120000004", password })).userId,
    before.userId,
  );
});

test("Better Auth accepts a bootstrapped hyphenated username and rejects invalid characters", async (context) => {
  const { auth, database } = await setup(context);
  const password = "synthetic-admin-password";
  await createInitialAdmin(database, auth, {
    first_name: "Admin",
    last_name: "Test",
    mobile: "09120000009",
    password,
    username: "synthetic-admin",
  });
  const login = await auth.api.signInUsername({
    body: { username: "synthetic-admin", password },
  });
  assert.equal(login.user.username, "synthetic-admin");
  assert.deepEqual(
    await auth.api.isUsernameAvailable({ body: { username: "valid-name_1" } }),
    { available: true },
  );
  for (const username of ["invalid+name", "ab", "a".repeat(31)]) {
    await assert.rejects(auth.api.isUsernameAvailable({ body: { username } }));
  }
});

test("real Better Auth supports managed creation after reuse of a legacy mobile", async (context) => {
  const { database, provider, service } = await setup(context);
  const password = "synthetic-password";
  const legacy = await provider.signUp({
    authEmail: "09120000005@kernel.local",
    firstName: "Old",
    lastName: "User",
    mobile: "09120000005",
    name: "Old User",
    password,
  });
  const repository = createDrizzleUsersRepository(database);
  await repository.update(
    legacy.userId,
    { mobile: "09120000006" },
    legacy.userId,
  );
  const managed = await createUsersService({ provider, repository }).create({
    first_name: "Managed",
    last_name: "User",
    mobile: "09120000005",
    password,
  });
  assert.notEqual(managed.id, legacy.userId);
  assert.equal(
    (await service.login({ identifier: "09120000005", password })).userId,
    managed.id,
  );
  assert.equal(
    (await service.login({ identifier: "09120000006", password })).userId,
    legacy.userId,
  );
});

test("real Better Auth preserves an arbitrary legacy email on a mobile change", async (context) => {
  const { database, provider, service } = await setup(context);
  const password = "synthetic-password";
  const legacy = await provider.signUp({
    authEmail: "admin@kernel.local",
    firstName: "Old",
    lastName: "Admin",
    mobile: "09120000007",
    name: "Old Admin",
    password,
  });
  await createDrizzleUsersRepository(database).update(
    legacy.userId,
    {
      mobile: "09120000008",
    },
    legacy.userId,
  );
  assert.equal(
    (await service.login({ identifier: "09120000008", password })).userId,
    legacy.userId,
  );
  const record = await database.query.user.findFirst({
    where: eq(user.id, legacy.userId),
  });
  assert.equal(record.email, "admin@kernel.local");
  const newAccount = await service.register({
    first_name: "New",
    last_name: "User",
    mobile: "09120000007",
    otp: "123456",
    password,
  });
  assert.notEqual(newAccount.userId, legacy.userId);
  assert.equal(
    (await service.login({ identifier: "09120000007", password })).userId,
    newAccount.userId,
  );
});
