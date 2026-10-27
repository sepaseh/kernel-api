import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { createAuth } from "../src/infrastructure/auth/better-auth.ts";
import { loadConfig } from "../src/infrastructure/config.ts";
import { createDatabase } from "../src/infrastructure/db/client.ts";
import { initializeDatabase } from "../src/infrastructure/db/initialize.ts";
import {
  account,
  calendarDates,
  rolePermissions,
  roles,
  user,
  userRoles,
} from "../src/infrastructure/db/schema.ts";
import { createLogger } from "../src/infrastructure/logging/logger.ts";

async function setup(t) {
  const config = loadConfig({
    BETTER_AUTH_SECRET: "synthetic-test-secret-with-at-least-32-characters",
    DATABASE_URL: "file::memory:",
    NODE_ENV: "test",
  });
  const { client, database } = createDatabase(config);
  t.after(() => client.close());
  const auth = createAuth(
    config,
    database,
    createLogger(config.logging, { write() {} }),
  );
  await initializeDatabase(config, database, auth);
  return { client, config, database, auth };
}

async function addUser(auth, mobile) {
  return auth.api.signUpEmail({
    body: {
      email: `${mobile}@synthetic.invalid`,
      firstName: "Test",
      lastName: "User",
      mobile,
      name: "Test User",
      password: "synthetic-password",
      username: `user${mobile}`,
    },
  });
}

for (const mobile of ["09123456789", "09120000001"]) {
  test(`development seed refuses an existing user ${mobile} without a grant`, async (t) => {
    const { config, database, auth } = await setup(t);
    await addUser(auth, mobile);
    await assert.rejects(
      initializeDatabase(
        { ...config, seedDevelopmentData: true },
        database,
        auth,
      ),
      /empty business database/,
    );
    assert.equal((await database.select().from(userRoles)).length, 0);
    assert.equal((await database.select().from(rolePermissions)).length, 0);
  });
}

test("development seed refuses an existing role without changing its permissions", async (t) => {
  const { config, database, auth } = await setup(t);
  await database
    .insert(roles)
    .values({ id: "3ecb1f52-6d6e-43b9-a8fb-4e0772c9f863", name: "Existing" });
  await assert.rejects(
    initializeDatabase(
      { ...config, seedDevelopmentData: true },
      database,
      auth,
    ),
    /empty business database/,
  );
  assert.equal((await database.select().from(rolePermissions)).length, 0);
  assert.equal((await database.select().from(userRoles)).length, 0);
});

test("development seed is repeatable without mutating an existing initialized installation", async (t) => {
  const { config, database, auth } = await setup(t);
  const seeded = { ...config, seedDevelopmentData: true };
  await initializeDatabase(seeded, database, auth);
  const before = {
    roles: await database.select().from(userRoles),
    permissions: await database.select().from(rolePermissions),
    calendar: await database.select().from(calendarDates),
  };
  await initializeDatabase(seeded, database, auth);
  assert.deepEqual(
    {
      roles: await database.select().from(userRoles),
      permissions: await database.select().from(rolePermissions),
      calendar: await database.select().from(calendarDates),
    },
    before,
  );
});

for (const [description, makeIncomplete] of [
  ["role assignment", async (database) => database.delete(userRoles)],
  ["credential account", async (database) => database.delete(account)],
  [
    "credential account ID",
    async (database) =>
      database.update(account).set({ accountId: "synthetic-foreign-account" }),
  ],
  [
    "credential provider",
    async (database) =>
      database.update(account).set({ providerId: "synthetic" }),
  ],
  [
    "null password hash",
    async (database) => database.update(account).set({ password: null }),
  ],
  [
    "empty password hash",
    async (database) => database.update(account).set({ password: "" }),
  ],
  [
    "blank password hash",
    async (database) => database.update(account).set({ password: "   " }),
  ],
]) {
  test(`development seed rejects missing ${description} without repairing data`, async (t) => {
    const { config, database, auth } = await setup(t);
    const seeded = { ...config, seedDevelopmentData: true };
    await initializeDatabase(seeded, database, auth);
    await makeIncomplete(database);
    const before = {
      users: await database.select().from(user),
      accounts: await database.select().from(account),
      assignments: await database.select().from(userRoles),
      permissions: await database.select().from(rolePermissions),
      calendar: await database.select().from(calendarDates),
    };
    await assert.rejects(
      initializeDatabase(seeded, database, auth),
      /Development seed is incomplete/,
    );
    assert.deepEqual(
      {
        users: await database.select().from(user),
        accounts: await database.select().from(account),
        assignments: await database.select().from(userRoles),
        permissions: await database.select().from(rolePermissions),
        calendar: await database.select().from(calendarDates),
      },
      before,
    );
  });
}

test("development seed preserves intentionally edited permissions and calendar entries", async (t) => {
  const { config, database, auth } = await setup(t);
  const seeded = { ...config, seedDevelopmentData: true };
  await initializeDatabase(seeded, database, auth);
  await database.delete(rolePermissions);
  await database.delete(calendarDates);
  await initializeDatabase(seeded, database, auth);
  assert.equal((await database.select().from(rolePermissions)).length, 0);
  assert.equal((await database.select().from(calendarDates)).length, 0);
});

test("existing seed validation reads a consistent snapshot against another connection", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "kernel-seed-test-"));
  const config = loadConfig({
    BETTER_AUTH_SECRET: "synthetic-test-secret-with-at-least-32-characters",
    DATABASE_URL: pathToFileURL(path.join(directory, "test.db")).href,
    NODE_ENV: "test",
  });
  const first = createDatabase(config);
  const second = createDatabase(config);
  t.after(async () => {
    first.client.close();
    second.client.close();
    const parent = await realpath(tmpdir());
    const owned = await realpath(directory);
    const relative = path.relative(parent, owned);
    assert.ok(
      relative.startsWith("kernel-seed-test-") && !relative.includes(path.sep),
    );
    await rm(owned, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  });
  const auth = createAuth(
    config,
    first.database,
    createLogger(config.logging, { write() {} }),
  );
  const seeded = { ...config, seedDevelopmentData: true };
  await initializeDatabase(seeded, first.database, auth);

  const originalTransaction = first.database.transaction.bind(first.database);
  let attempted = false;
  first.database.transaction = (callback, options) =>
    originalTransaction(
      (transaction) =>
        callback(
          new Proxy(transaction, {
            get(target, property, receiver) {
              if (property !== "query")
                return Reflect.get(target, property, receiver);
              return new Proxy(target.query, {
                get(queries, name, queryReceiver) {
                  if (name !== "user")
                    return Reflect.get(queries, name, queryReceiver);
                  return new Proxy(queries.user, {
                    get(userQuery, method, userReceiver) {
                      if (method !== "findFirst")
                        return Reflect.get(userQuery, method, userReceiver);
                      return async (...args) => {
                        const result = await userQuery.findFirst(...args);
                        attempted = true;
                        await assert.rejects(
                          second.client.execute('DELETE FROM "account"'),
                          /locked|busy/i,
                        );
                        return result;
                      };
                    },
                  });
                },
              });
            },
          }),
        ),
      options,
    );
  await initializeDatabase(seeded, first.database, auth);
  assert.equal(attempted, true);
  assert.equal((await first.database.select().from(account)).length, 1);
  first.database.transaction = originalTransaction;
  await second.database.delete(account);
  assert.equal((await second.database.select().from(account)).length, 0);
});

test("a transactional seed failure leaves no user, credential or permissions and can be retried", async (t) => {
  const { client, config, database, auth } = await setup(t);
  await client.execute(
    "CREATE TRIGGER fail_seed BEFORE INSERT ON role_permissions BEGIN SELECT RAISE(ABORT, 'synthetic seed failure'); END",
  );
  const seeded = { ...config, seedDevelopmentData: true };
  await assert.rejects(initializeDatabase(seeded, database, auth));
  assert.equal((await database.select().from(user)).length, 0);
  assert.equal((await database.select().from(account)).length, 0);
  assert.equal((await database.select().from(userRoles)).length, 0);
  assert.equal((await database.select().from(rolePermissions)).length, 0);
  await client.execute("DROP TRIGGER fail_seed");
  await initializeDatabase(seeded, database, auth);
  assert.equal((await database.select().from(user)).length, 1);
});

test("a role inserted while the password is hashed is never granted seed permissions", async (t) => {
  const { config, database, auth } = await setup(t);
  const context = await auth.$context;
  const racing = {
    $context: Promise.resolve({
      ...context,
      password: {
        ...context.password,
        async hash(value) {
          const hashed = await context.password.hash(value);
          await database.insert(roles).values({
            id: "3ecb1f52-6d6e-43b9-a8fb-4e0772c9f863",
            name: "Existing",
          });
          return hashed;
        },
      },
    }),
  };
  await assert.rejects(
    initializeDatabase(
      { ...config, seedDevelopmentData: true },
      database,
      racing,
    ),
    /empty business database/,
  );
  assert.equal((await database.select().from(rolePermissions)).length, 0);
  assert.equal((await database.select().from(userRoles)).length, 0);
  assert.equal((await database.select().from(user)).length, 0);
  assert.equal((await database.select().from(account)).length, 0);
});

test("a user inserted while the password is hashed prevents seed creation", async (t) => {
  const { config, database, auth } = await setup(t);
  const context = await auth.$context;
  const racing = {
    $context: Promise.resolve({
      ...context,
      password: {
        ...context.password,
        async hash(value) {
          const hashed = await context.password.hash(value);
          await addUser(auth, "09120000002");
          return hashed;
        },
      },
    }),
  };
  await assert.rejects(
    initializeDatabase(
      { ...config, seedDevelopmentData: true },
      database,
      racing,
    ),
    /empty business database/,
  );
  assert.equal((await database.select().from(rolePermissions)).length, 0);
  assert.equal((await database.select().from(userRoles)).length, 0);
  const users = await database.query.user.findMany();
  assert.equal(users.length, 1);
  assert.ok(users.every((entry) => !entry.isSystemAdmin));
});
