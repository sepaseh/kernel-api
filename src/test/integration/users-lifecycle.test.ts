import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { ApplicationError } from "../../application/errors.ts";
import type { Actor } from "../../application/models.ts";
import type { AuthProvider } from "../../application/ports/auth.ts";
import { createRolesService } from "../../application/roles.ts";
import { createUsersService } from "../../application/users.ts";
import * as schema from "../../infrastructure/db/schema.ts";
import { isForeignKeyConstraintError } from "../../infrastructure/persistence/errors.ts";
import { createDrizzleRolesRepository } from "../../infrastructure/persistence/roles.ts";
import { createDrizzleUsersRepository } from "../../infrastructure/persistence/users.ts";

const migrations = fileURLToPath(new URL("../../../drizzle", import.meta.url));
const now = new Date("2026-01-01T00:00:00Z");
const unused = async (): Promise<never> => {
  throw new Error("Unexpected auth operation");
};
const provider: AuthProvider = {
  getSession: unused,
  hashPassword: unused,
  passwordBounds: unused,
  signIn: unused,
  signOut: unused,
  signUp: unused,
  verifyPassword: unused,
};
const actor: Actor = {
  account: {
    authEmail: "actor@synthetic.local",
    firstName: "Actor",
    id: "actor",
    isSystemAdmin: true,
    lastName: "User",
    mobile: "09120000001",
    name: "Actor User",
    status: "active",
  },
  permissions: [],
  session: {
    createdAt: now,
    expiresAt: new Date("2040-01-01T00:00:00Z"),
    id: "actor-session",
    token: "synthetic-actor-token",
    userId: "actor",
  },
};

const fixture = async (context: TestContext, folder = migrations) => {
  const client = createClient({ url: "file::memory:" });
  context.after(() => client.close());
  const database = drizzle(client, { schema });
  await migrate(database, { migrationsFolder: folder });
  await client.execute("PRAGMA foreign_keys = ON");
  for (const [id, mobile] of [
    ["actor", "09120000001"],
    ["target", "09120000002"],
  ]) {
    await database.insert(schema.user).values({
      email: `${id}@synthetic.local`,
      firstName: id,
      id,
      isSystemAdmin: id === "actor",
      lastName: "User",
      mobile,
      name: `${id} User`,
    });
  }
  await database.insert(schema.account).values({
    accountId: "target",
    createdAt: now,
    id: "target-account",
    password: "synthetic-password-hash",
    providerId: "credential",
    updatedAt: now,
    userId: "target",
  });
  await database.insert(schema.session).values({
    createdAt: now,
    expiresAt: new Date("2040-01-01T00:00:00Z"),
    id: "target-session",
    token: "synthetic-target-token",
    updatedAt: now,
    userId: "target",
  });
  await database.insert(schema.roles).values({ id: "role", name: "Test role" });
  await database.insert(schema.rolePermissions).values({
    permission: "users.read",
    roleId: "role",
  });
  const repository = createDrizzleUsersRepository(database);
  const service = createUsersService({ provider, repository });
  return { client, database, repository, service };
};

type Fixture = Awaited<ReturnType<typeof fixture>>;

const state = async (client: Fixture["client"]) => {
  const result: Record<string, unknown> = {};
  for (const table of [
    "account",
    "calendar_dates",
    "files",
    "otp_codes",
    "role_permissions",
    "roles",
    "session",
    "settings",
    "user",
    "user_roles",
    "verification",
  ]) {
    const order =
      table === "calendar_dates"
        ? "date"
        : table === "user_roles"
          ? "user_id, role_id"
          : table === "role_permissions"
            ? "role_id, permission"
            : "id";
    result[table] = (
      await client.execute(`SELECT * FROM ${table} ORDER BY ${order}`)
    ).rows;
  }
  return result;
};

const addReference = async (value: Fixture, kind: "file" | "assignment") => {
  if (kind === "assignment") {
    await value.database.insert(schema.userRoles).values({
      roleId: "role",
      userId: "target",
    });
    return;
  }

  await value.database.insert(schema.files).values({
    bucket: "synthetic-private",
    contentType: "text/plain",
    createdAt: now,
    createdBy: "target",
    id: "file",
    objectKey: "synthetic-file",
    originalName: "fixture.txt",
    size: 1,
    visibility: "private",
  });
};

for (const kind of ["file", "assignment"] as const) {
  test(`user ${kind} usage rejects deletion without changing records or technical children`, async (context) => {
    const value = await fixture(context);
    await addReference(value, kind);
    const before = await state(value.client);
    const count = (await value.service.list({})).total;

    await assert.rejects(value.service.remove(actor, "target"), {
      key: "userInUse",
      kind: "conflict",
    });

    assert.deepEqual(await state(value.client), before);
    assert.equal((await value.service.list({})).total, count);
    assert.deepEqual(
      (await value.client.execute("PRAGMA foreign_key_check")).rows,
      [],
    );
  });

  test(`the user foreign key catches ${kind} usage introduced after transaction prechecks`, async (context) => {
    const value = await fixture(context);
    const insertion =
      kind === "assignment"
        ? "INSERT INTO user_roles (role_id, user_id) VALUES ('role', OLD.id);"
        : "INSERT INTO files (bucket, content_type, created_at, created_by, id, object_key, original_name, size, visibility) VALUES ('synthetic-private', 'text/plain', 1, OLD.id, 'late-file', 'late-object', 'late.txt', 1, 'private');";
    await value.client.execute(`
      CREATE TRIGGER attach_before_user_delete BEFORE DELETE ON user
      WHEN OLD.id = 'target'
      BEGIN ${insertion} END;
    `);
    const before = await state(value.client);

    await assert.rejects(value.service.remove(actor, "target"), {
      key: "userInUse",
      kind: "conflict",
    });

    assert.deepEqual(await state(value.client), before);
  });
}

test("unused user deletion permanently removes its owned auth/session rows", async (context) => {
  const value = await fixture(context);

  await value.service.remove(actor, "target");

  assert.equal((await value.service.list({})).total, 1);
  assert.deepEqual(
    (await value.client.execute("SELECT * FROM session")).rows,
    [],
  );
  assert.deepEqual(
    (await value.client.execute("SELECT * FROM account")).rows,
    [],
  );
  assert.equal(
    (await value.client.execute("SELECT * FROM role_permissions")).rows.length,
    1,
  );
  assert.deepEqual(
    (await value.client.execute("PRAGMA foreign_key_check")).rows,
    [],
  );
});

test("a reference committed after the initial user lookup is retained by the write transaction", async (context) => {
  const value = await fixture(context);
  const find = value.repository.find;
  let attached = false;
  value.repository.find = async (id) => {
    const current = await find(id);
    if (!attached) {
      attached = true;
      await addReference(value, "assignment");
    }
    return current;
  };

  await assert.rejects(value.service.remove(actor, "target"), {
    key: "userInUse",
    kind: "conflict",
  });

  assert.equal((await value.service.list({})).total, 2);
  assert.equal(
    (await value.client.execute("SELECT * FROM user_roles")).rows.length,
    1,
  );
  assert.equal(
    (await value.client.execute("SELECT * FROM session")).rows.length,
    1,
  );
  assert.equal(
    (await value.client.execute("SELECT * FROM account")).rows.length,
    1,
  );
});

test("the role foreign key maps a late assignment through the nested driver cause", async (context) => {
  const value = await fixture(context);
  await value.client.execute(`
    CREATE TRIGGER attach_before_role_delete BEFORE DELETE ON roles
    WHEN OLD.id = 'role'
    BEGIN INSERT INTO user_roles (role_id, user_id) VALUES (OLD.id, 'target'); END;
  `);
  const before = await state(value.client);
  const roles = createRolesService(
    createDrizzleRolesRepository(value.database),
  );

  await assert.rejects(roles.remove("role"), {
    key: "roleAssigned",
    kind: "conflict",
  });

  assert.deepEqual(await state(value.client), before);
});

test("unrelated database deletion failures are not reported as usage conflicts", async (context) => {
  const value = await fixture(context);
  await value.client.execute(`
    CREATE TRIGGER reject_user_delete BEFORE DELETE ON user
    WHEN OLD.id = 'target'
    BEGIN SELECT RAISE(ABORT, 'simulated persistence failure'); END;
  `);
  const before = await state(value.client);

  await assert.rejects(
    value.service.remove(actor, "target"),
    (error) => error instanceof Error && !(error instanceof ApplicationError),
  );

  assert.deepEqual(await state(value.client), before);
});

test("foreign-key classification excludes busy, I/O and unrelated constraints", () => {
  for (const [code, rawCode] of [
    ["SQLITE_BUSY", 5],
    ["SQLITE_IOERR", 10],
    ["SQLITE_CONSTRAINT_UNIQUE", 2067],
  ]) {
    const cause = Object.assign(new Error("FOREIGN KEY constraint failed"), {
      code,
      rawCode,
    });
    const outer = new Error(
      "Failed query: delete from user; params contain FOREIGN KEY constraint failed",
      { cause },
    );
    assert.equal(isForeignKeyConstraintError(outer), false);
  }
  const cyclic = new Error("unrelated failure");
  cyclic.cause = cyclic;
  assert.equal(isForeignKeyConstraintError(cyclic), false);
});

const migrationFolderThrough = async (context: TestContext, last: number) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "kernel-user-migration-"),
  );
  context.after(async () => {
    assert.ok(
      path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep),
    );
    assert.ok(path.basename(directory).startsWith("kernel-user-migration-"));
    await rm(directory, { force: true, recursive: true });
  });
  await mkdir(path.join(directory, "meta"));
  const journal = JSON.parse(
    await readFile(path.join(migrations, "meta/_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  const previous = {
    ...journal,
    entries: journal.entries.filter(({ idx }) => idx <= last),
  };
  await writeFile(
    path.join(directory, "meta/_journal.json"),
    JSON.stringify(previous),
  );
  for (const entry of previous.entries)
    await copyFile(
      path.join(migrations, `${entry.tag}.sql`),
      path.join(directory, `${entry.tag}.sql`),
    );
  return directory;
};

test("the initial user rebuild preserves the user and child rows and restores foreign keys", async (context) => {
  const client = createClient({ url: "file::memory:" });
  context.after(() => client.close());
  const database = drizzle(client, { schema });
  await migrate(database, {
    migrationsFolder: await migrationFolderThrough(context, 0),
  });
  await client.batch(
    [
      "INSERT INTO user (id, email, email_verified, first_name, last_name, mobile, name, created_at, updated_at) VALUES ('legacy-user', 'legacy@example.test', 1, 'Legacy', 'User', '09120000001', 'Legacy User', 1, 1)",
      "INSERT INTO account (id, account_id, issuer, provider_id, user_id, password, created_at, updated_at) VALUES ('legacy-account', 'legacy-user', 'fixture', 'credential', 'legacy-user', 'synthetic-hash', 1, 1)",
      "INSERT INTO session (id, token, user_id, created_at, expires_at, updated_at) VALUES ('legacy-session', 'synthetic-token', 'legacy-user', 1, 2, 1)",
      "INSERT INTO roles (id, name) VALUES ('legacy-role', 'Legacy role')",
      "INSERT INTO user_roles (role_id, user_id) VALUES ('legacy-role', 'legacy-user')",
      "INSERT INTO files (id, bucket, content_type, created_at, created_by, object_key, original_name, size, visibility) VALUES ('legacy-file', 'fixture', 'text/plain', 1, 'legacy-user', 'legacy/file', 'fixture.txt', 1, 'private')",
    ],
    "write",
  );
  const children = [
    "SELECT id, account_id, provider_id, user_id, password FROM account",
    "SELECT * FROM session",
    "SELECT * FROM user_roles",
    "SELECT * FROM files",
  ];
  const snapshot = async () =>
    Promise.all(
      children.map(async (query) => (await client.execute(query)).rows),
    );
  const before = await snapshot();
  const stableUserColumns =
    "id, email_verified, first_name, last_name, mobile, name, display_username, username, image, is_system_admin, status, created_at, updated_at";
  const legacyUsers = (
    await client.execute(
      `SELECT ${stableUserColumns}, email AS auth_email FROM user`,
    )
  ).rows;
  assert.equal(legacyUsers[0]?.auth_email, "legacy@example.test");
  assert.equal(
    (await client.execute("PRAGMA foreign_keys")).rows[0]?.foreign_keys,
    1,
  );

  await migrate(database, { migrationsFolder: migrations });

  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(
    (await client.execute(`SELECT ${stableUserColumns}, auth_email FROM user`))
      .rows,
    legacyUsers,
  );
  assert.equal(
    (await client.execute("SELECT email FROM user WHERE id = 'legacy-user'"))
      .rows[0]?.email,
    "legacy@example.test",
  );
  assert.equal(
    (await client.execute("PRAGMA foreign_keys")).rows[0]?.foreign_keys,
    1,
  );
  assert.deepEqual((await client.execute("PRAGMA foreign_key_check")).rows, []);
});

test("the populated user-role migration preserves records and technical relation policies", async (context) => {
  const directory = await migrationFolderThrough(context, 3);
  const value = await fixture(context, directory);
  await addReference(value, "assignment");
  await addReference(value, "file");
  const before = await state(value.client);

  await migrate(value.database, { migrationsFolder: migrations });

  assert.deepEqual(await state(value.client), before);
  assert.deepEqual(
    (await value.client.execute("PRAGMA foreign_key_check")).rows,
    [],
  );
  const foreignKeys = (
    await value.client.execute("PRAGMA foreign_key_list(user_roles)")
  ).rows;
  assert.equal(
    foreignKeys.find((row) => row.from === "user_id")?.on_delete,
    "RESTRICT",
  );
  assert.equal(
    foreignKeys.find((row) => row.from === "role_id")?.on_delete,
    "RESTRICT",
  );
  for (const table of ["account", "session", "role_permissions"]) {
    const foreignKey = (
      await value.client.execute(`PRAGMA foreign_key_list(${table})`)
    ).rows[0];
    assert.equal(foreignKey.on_delete, "CASCADE", table);
  }
  const history = (
    await value.client.execute("SELECT * FROM __drizzle_migrations ORDER BY id")
  ).rows;
  await migrate(value.database, { migrationsFolder: migrations });
  assert.deepEqual(
    (
      await value.client.execute(
        "SELECT * FROM __drizzle_migrations ORDER BY id",
      )
    ).rows,
    history,
  );
  await assert.rejects(value.service.remove(actor, "target"), {
    key: "userInUse",
    kind: "conflict",
  });
  assert.deepEqual(await state(value.client), before);
});
