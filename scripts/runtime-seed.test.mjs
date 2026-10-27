import assert from "node:assert/strict";
import { test } from "node:test";

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
