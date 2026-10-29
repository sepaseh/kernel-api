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
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { eq, getTableName } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getTableConfig } from "drizzle-orm/sqlite-core";

import { ApplicationError } from "./application/errors.ts";
import { internalEmail } from "./application/identity.ts";
import type { Actor } from "./application/models.ts";
import type { AuthProvider } from "./application/ports/auth.ts";
import { createUsersService } from "./application/users.ts";
import { createOtpGateway } from "./infrastructure/auth/otp.ts";
import { loadConfig } from "./infrastructure/config.ts";
import { createDatabase } from "./infrastructure/db/client.ts";
import * as schema from "./infrastructure/db/schema.ts";
import { createAccountPersistence } from "./infrastructure/persistence/account.ts";
import { createDrizzleCalendarRepository } from "./infrastructure/persistence/calendar.ts";
import {
  isForeignKeyConstraintError,
  isUniqueConstraintError,
} from "./infrastructure/persistence/errors.ts";
import { createDrizzleFileRepository } from "./infrastructure/persistence/files.ts";
import {
  getRolesByUserIds,
  getUserPermissions,
  mapUserRecord,
} from "./infrastructure/persistence/identity.ts";
import { createDrizzleRolesRepository } from "./infrastructure/persistence/roles.ts";
import { createDrizzleSettingsRepository } from "./infrastructure/persistence/settings.ts";
import { createDrizzleUsersRepository } from "./infrastructure/persistence/users.ts";
import { registerFixtureCleanup } from "./test/fixture-cleanup.ts";

const migrations = fileURLToPath(new URL("../drizzle", import.meta.url));
const environment = {
  BETTER_AUTH_SECRET:
    "synthetic-persistence-secret-with-more-than-thirty-two-characters",
  DATABASE_URL: "file::memory:",
};
const now = new Date("2026-01-01T00:00:00Z");
const actor = {
  account: { id: "first" },
  session: { id: "synthetic-session" },
} as Actor;
const fixture = async (context: TestContext) => {
  const value = createDatabase(loadConfig(environment));
  context.after(() => value.client.close());
  assert.equal(
    (await value.client.execute("PRAGMA foreign_keys")).rows[0]?.foreign_keys,
    1,
  );
  await migrate(value.database, { migrationsFolder: migrations });
  return value;
};
const insertUser = async (
  database: ReturnType<typeof createDatabase>["database"],
  id = "first",
  mobile = "09120000001",
) => {
  const [value] = await database
    .insert(schema.user)
    .values({
      createdAt: now,
      email: `${id}@synthetic.local`,
      firstName: "Ada",
      id,
      lastName: "Lovelace",
      mobile,
      name: "Ada Lovelace",
      updatedAt: now,
    })
    .returning();
  assert.ok(value);
  return value;
};

test("mobile changes preserve authentication identities and allow reuse of old numbers", async (context) => {
  const { database } = await fixture(context);
  await database.insert(schema.user).values({
    createdAt: now,
    email: "09120000001@kernel.local",
    firstName: "Ada",
    id: "first",
    lastName: "Lovelace",
    mobile: "09120000001",
    name: "Ada Lovelace",
    updatedAt: now,
  });
  const repository = createDrizzleUsersRepository(database);
  const nameOnly = await repository.update(
    "first",
    { firstName: "Augusta" },
    "first",
  );
  assert.equal(nameOnly?.authEmail, "09120000001@kernel.local");
  const updated = await repository.update(
    "first",
    { mobile: "09120000002" },
    "first",
  );
  assert.equal(updated?.authEmail, "09120000001@kernel.local");
  const newIdentity = internalEmail("09120000001");
  await database.insert(schema.user).values({
    createdAt: now,
    email: newIdentity,
    firstName: "Grace",
    id: "second",
    lastName: "Hopper",
    mobile: "09120000001",
    name: "Grace Hopper",
    updatedAt: now,
  });
  await assert.rejects(
    repository.update("second", { mobile: "09120000002" }, "second"),
    {
      key: "mobileInUse",
    },
  );
  const second = await repository.find("second");
  assert.equal(second?.mobile, "09120000001");
  assert.equal(second?.authEmail, newIdentity);
  await insertUser(database, "legacy", "09120000003");
  const legacy = await repository.update(
    "legacy",
    { mobile: "09120000004" },
    "legacy",
  );
  assert.equal(legacy?.authEmail, "legacy@synthetic.local");
});

test("mobile changes guard the target and actor at the atomic write", async (context) => {
  const { database } = await fixture(context);
  await insertUser(database, "editor", "09120000001");
  await insertUser(database, "victim", "09120000002");
  const repository = createDrizzleUsersRepository(database);
  await assert.rejects(
    repository.update(
      "victim",
      { mobile: "09120000003", firstName: "Denied" },
      "editor",
    ),
    { kind: "forbidden", key: "systemAdminRequired" },
  );
  assert.equal((await repository.find("victim"))?.firstName, "Ada");
  assert.equal((await repository.find("victim"))?.mobile, "09120000002");
  // Simulate promotion after a request's earlier read but before its write.
  await database
    .update(schema.user)
    .set({ isSystemAdmin: true })
    .where(eq(schema.user.id, "victim"));
  await assert.rejects(
    repository.update("victim", { mobile: "09120000003" }, "editor"),
    {
      kind: "forbidden",
      key: "systemAdminRequired",
    },
  );
  assert.equal((await repository.find("victim"))?.mobile, "09120000002");
  assert.equal(
    (await repository.update("victim", { firstName: "Grace" }, "editor"))
      ?.firstName,
    "Grace",
  );
  await database
    .update(schema.user)
    .set({ isSystemAdmin: true })
    .where(eq(schema.user.id, "editor"));
  assert.equal(
    (await repository.update("victim", { mobile: "09120000003" }, "editor"))
      ?.mobile,
    "09120000003",
  );
  await database
    .update(schema.user)
    .set({ isSystemAdmin: false })
    .where(eq(schema.user.id, "editor"));
  await assert.rejects(
    repository.update("victim", { mobile: "09120000004" }, "editor"),
    {
      kind: "forbidden",
      key: "systemAdminRequired",
    },
  );
  await database
    .update(schema.user)
    .set({ isSystemAdmin: true, status: "inactive" })
    .where(eq(schema.user.id, "editor"));
  await assert.rejects(
    repository.update("victim", { mobile: "09120000004" }, "editor"),
    { kind: "forbidden", key: "systemAdminRequired" },
  );
  assert.equal((await repository.find("victim"))?.mobile, "09120000003");
});

test("concurrent target promotion and actor revocation cannot bypass the mobile guard", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "kernel-user-race-"));
  const closers: Array<() => void | Promise<void>> = [];
  registerFixtureCleanup(context, closers, async () => {
    await delay(250);
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    assert.ok(path.basename(root).startsWith("kernel-user-race-"));
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 250,
    });
  });
  const databaseUrl = `file:${path.join(root, "fixture.sqlite").replaceAll("\\", "/")}`;
  const first = createDatabase(
    loadConfig({ ...environment, DATABASE_URL: databaseUrl }),
  );
  closers.unshift(() => first.client.close());
  const second = createDatabase(
    loadConfig({ ...environment, DATABASE_URL: databaseUrl }),
  );
  closers.unshift(() => second.client.close());
  await migrate(first.database, { migrationsFolder: migrations });
  await insertUser(first.database, "editor", "09120000001");
  await insertUser(first.database, "victim", "09120000002");
  await first.database.insert(schema.session).values({
    id: "editor-session",
    userId: "editor",
    token: "synthetic-token",
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  const real = createDrizzleUsersRepository(first.database);
  const provider: AuthProvider = {
    getSession: async () => {
      throw new Error("unused");
    },
    hashPassword: async () => {
      throw new Error("unused");
    },
    passwordBounds: async () => {
      throw new Error("unused");
    },
    signIn: async () => {
      throw new Error("unused");
    },
    signOut: async () => {
      throw new Error("unused");
    },
    signUp: async () => {
      throw new Error("unused");
    },
    verifyPassword: async () => {
      throw new Error("unused");
    },
  };
  const editor = {
    account: { id: "editor", isSystemAdmin: true, status: "active" },
    session: { id: "editor-session" },
  } as Actor;
  let revoke = false;
  const service = createUsersService({
    provider,
    repository: {
      ...real,
      async find(id) {
        const value = await real.find(id);
        if (id === "victim") {
          if (revoke)
            await second.database
              .update(schema.user)
              .set({ isSystemAdmin: false })
              .where(eq(schema.user.id, "editor"));
          else
            await second.database
              .update(schema.user)
              .set({ isSystemAdmin: true })
              .where(eq(schema.user.id, "victim"));
        }
        return value;
      },
    },
  });
  await assert.rejects(
    service.update(editor, "victim", {
      mobile: "09120000003",
      first_name: "Denied",
    }),
    { kind: "forbidden", key: "systemAdminRequired" },
  );
  assert.equal((await real.find("victim"))?.mobile, "09120000002");
  assert.equal((await real.find("victim"))?.firstName, "Ada");
  await first.database
    .update(schema.user)
    .set({ isSystemAdmin: true })
    .where(eq(schema.user.id, "editor"));
  revoke = true;
  await assert.rejects(
    service.update(editor, "victim", { mobile: "09120000003" }),
    { kind: "forbidden", key: "systemAdminRequired" },
  );
  assert.equal((await real.find("victim"))?.mobile, "09120000002");
});

test("fresh migrations match the ORM's complete columns, keys and declared indexes", async (context) => {
  const { database, client } = await fixture(context);
  const tables = [
    schema.user,
    schema.session,
    schema.account,
    schema.verification,
    schema.roles,
    schema.rolePermissions,
    schema.userRoles,
    schema.files,
    schema.settings,
    schema.calendarDates,
    schema.otpCodes,
  ];
  const installed = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%'",
  );
  assert.deepEqual(
    installed.rows.map((row) => row.name).sort(),
    tables.map(getTableName).sort(),
  );
  for (const table of tables) {
    const config = getTableConfig(table);
    const columns = (
      await client.execute(`PRAGMA table_info("${config.name}")`)
    ).rows;
    assert.deepEqual(
      columns
        .map((column) => `${column.name}:${String(column.type).toLowerCase()}`)
        .sort(),
      config.columns
        .map((column) => `${column.name}:${column.getSQLType()}`)
        .sort(),
    );
    const foreignKeys = (
      await client.execute(`PRAGMA foreign_key_list("${config.name}")`)
    ).rows;
    const expected = config.foreignKeys.flatMap((key) => {
      const reference = key.reference();
      return reference.columns.map(
        (column, index) =>
          `${column.name}:${getTableName(reference.foreignTable)}:${reference.foreignColumns[index]?.name}:${key.onDelete?.toUpperCase()}`,
      );
    });
    assert.deepEqual(
      foreignKeys
        .map((key) => `${key.from}:${key.table}:${key.to}:${key.on_delete}`)
        .sort(),
      expected.sort(),
    );
    const indexes = (
      await client.execute(`PRAGMA index_list("${config.name}")`)
    ).rows;
    for (const index of config.indexes) {
      const actual = indexes.find((value) => value.name === index.config.name);
      assert.ok(actual, `${config.name}.${index.config.name}`);
      assert.equal(actual.unique, Number(index.config.unique));
    }
  }
  assert.deepEqual((await client.execute("PRAGMA foreign_key_check")).rows, []);
  await migrate(database, { migrationsFolder: migrations });
  const journal = JSON.parse(
    await readFile(path.join(migrations, "meta/_journal.json"), "utf8"),
  ) as { entries: Array<{ tag: string }> };
  assert.equal(
    (await client.execute("SELECT count(*) AS total FROM __drizzle_migrations"))
      .rows[0]?.total,
    journal.entries.length,
  );
});

test("the database factory creates only an owned file parent and survives close/reopen", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "kernel-persistence-"));
  context.after(async () => {
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    assert.ok(path.basename(root).startsWith("kernel-persistence-"));
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  });
  for (const kind of ["url", "relative"] as const) {
    const file = path.join(root, kind, "nested", "fixture.sqlite");
    const databaseUrl =
      kind === "url"
        ? pathToFileURL(file).href
        : `file:${file.replaceAll("\\", "/")}`;
    const config = loadConfig({ ...environment, DATABASE_URL: databaseUrl });
    const first = createDatabase(config);
    try {
      await migrate(first.database, { migrationsFolder: migrations });
      await first.database
        .insert(schema.calendarDates)
        .values({ date: "2026-01-01" });
    } finally {
      first.client.close();
    }
    const reopened = createDatabase(config);
    try {
      assert.equal(
        (await reopened.client.execute("PRAGMA foreign_keys")).rows[0]
          ?.foreign_keys,
        1,
      );
      assert.deepEqual(
        await createDrizzleCalendarRepository(reopened.database).list(),
        ["2026-01-01"],
      );
    } finally {
      reopened.client.close();
    }
  }
});

test("populated logo migration preserves every row and blocks deletion until references are resolved", async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), "kernel-persistence-upgrade-"),
  );
  const closers: Array<() => void | Promise<void>> = [];
  registerFixtureCleanup(context, closers, async () => {
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    assert.ok(path.basename(root).startsWith("kernel-persistence-upgrade-"));
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  });
  const { database, client } = createDatabase(loadConfig(environment));
  closers.push(() => client.close());
  const journal = JSON.parse(
    await readFile(path.join(migrations, "meta/_journal.json"), "utf8"),
  ) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  const previousEntries = journal.entries.filter((entry) => entry.idx < 5);
  await mkdir(path.join(root, "meta"));
  await writeFile(
    path.join(root, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries: previousEntries }),
  );
  await Promise.all(
    previousEntries.map((entry) =>
      copyFile(
        path.join(migrations, entry.tag + ".sql"),
        path.join(root, entry.tag + ".sql"),
      ),
    ),
  );
  await migrate(database, { migrationsFolder: root });
  await insertUser(database);
  for (const id of ["dark", "light"])
    await createDrizzleFileRepository(database).insert({
      bucket: "owned-public",
      contentType: "image/png",
      createdAt: now,
      createdBy: "first",
      id,
      objectKey: `logo/${id}`,
      originalName: `${id}.png`,
      size: 4,
      visibility: "public",
    });
  await database.insert(schema.settings).values({
    darkLogoId: "dark",
    darkTheme: '{"color_primary":"#123456"}',
    id: 1,
    languageCode: "fa",
    lightLogoId: "light",
    lightTheme: '{"color_primary":"#abcdef"}',
  });
  const state = async () => {
    const tables = [
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
    ];
    return Promise.all(
      tables.map(async (table) => ({
        table,
        rows: (await client.execute(`SELECT * FROM "${table}"`)).rows,
      })),
    );
  };
  const before = await state();
  await migrate(database, { migrationsFolder: migrations });
  assert.deepEqual(await state(), before);
  const references = (await client.execute("PRAGMA foreign_key_list(settings)"))
    .rows;
  assert.deepEqual(
    references.map((row) => `${row.from}:${row.on_delete}`).sort(),
    ["dark_logo_id:RESTRICT", "light_logo_id:RESTRICT"],
  );
  for (const id of ["dark", "light"])
    await assert.rejects(
      client.execute({ sql: "DELETE FROM files WHERE id = ?", args: [id] }),
      isForeignKeyConstraintError,
    );
  await assert.rejects(
    database.transaction(async (transaction) => {
      await transaction
        .update(schema.settings)
        .set({ languageCode: "de" })
        .where(eq(schema.settings.id, 1));
      await transaction
        .delete(schema.files)
        .where(eq(schema.files.id, "light"));
    }),
    isForeignKeyConstraintError,
  );
  assert.deepEqual(await state(), before);
  assert.deepEqual((await client.execute("PRAGMA foreign_key_check")).rows, []);
  const saved = await createDrizzleSettingsRepository(database).save({
    darkTheme: { color_primary: "#123456" },
    lightTheme: { color_primary: "#abcdef" },
  });
  assert.equal(saved, "saved");
  await client.execute("DELETE FROM files");
  assert.deepEqual(await database.query.files.findMany(), []);
  assert.equal(
    await createDrizzleSettingsRepository(database).readLanguageCode(),
    "fa",
  );
});

test("the appended snapshot agrees with the ORM and preserves the migration identity chain", async () => {
  const previous = JSON.parse(
    await readFile(path.join(migrations, "meta/0004_snapshot.json"), "utf8"),
  ) as { id: string };
  const current = JSON.parse(
    await readFile(path.join(migrations, "meta/0005_snapshot.json"), "utf8"),
  ) as {
    id: string;
    prevId: string;
    tables: Record<
      string,
      {
        columns: Record<string, { type: string }>;
        foreignKeys: Record<string, { onDelete: string }>;
      }
    >;
  };
  assert.equal(current.prevId, previous.id);
  assert.notEqual(current.id, previous.id);
  assert.deepEqual(
    Object.values(current.tables.settings.foreignKeys).map(
      (value) => value.onDelete,
    ),
    ["restrict", "restrict"],
  );
  const tables = [
    schema.user,
    schema.session,
    schema.account,
    schema.verification,
    schema.roles,
    schema.rolePermissions,
    schema.userRoles,
    schema.files,
    schema.settings,
    schema.calendarDates,
    schema.otpCodes,
  ];
  for (const table of tables) {
    const config = getTableConfig(table);
    assert.deepEqual(
      Object.entries(current.tables[config.name].columns)
        .map(([name, column]) => `${name}:${column.type}`)
        .sort(),
      config.columns
        .map((column) => `${column.name}:${column.getSQLType()}`)
        .sort(),
    );
  }
});

test("database error classification terminates for cyclic causes and preserves constraint distinctions", () => {
  const first = new Error("outer");
  const second = new Error("inner", { cause: first });
  first.cause = second;
  assert.equal(isUniqueConstraintError(first), false);
  assert.equal(isForeignKeyConstraintError(first), false);
  Object.assign(second, { code: "SQLITE_CONSTRAINT_UNIQUE" });
  assert.equal(isUniqueConstraintError(first), true);
  assert.equal(isForeignKeyConstraintError(first), false);
  for (const value of [
    null,
    undefined,
    "UNIQUE constraint failed",
    { code: "SQLITE_CONSTRAINT_UNIQUE" },
  ])
    assert.equal(isUniqueConstraintError(value), false);
  assert.equal(
    isUniqueConstraintError(new Error("UNIQUE constraint failed: user.mobile")),
    true,
  );
  assert.equal(isUniqueConstraintError(new Error("database is busy")), false);
  for (const code of ["SQLITE_BUSY", "SQLITE_IOERR"]) {
    const cause = Object.assign(new Error("database is locked"), {
      code,
      rawCode: code === "SQLITE_BUSY" ? 5 : 10,
    });
    const failure = new Error(
      "Failed query: insert into roles values (?); params: unique constraint",
      { cause },
    );
    assert.equal(isUniqueConstraintError(failure), false);
    assert.equal(
      isUniqueConstraintError(
        Object.assign(new Error("UNIQUE constraint failed: user.mobile"), {
          code,
        }),
      ),
      false,
    );
  }
  for (const fields of [
    { rawCode: 2067 },
    { extendedCode: "SQLITE_CONSTRAINT_UNIQUE" },
    { extendedCode: 2067 },
    { code: "SQLITE_CONSTRAINT", rawCode: 19 },
  ])
    assert.equal(
      isUniqueConstraintError(
        new Error("query wrapper", {
          cause: Object.assign(
            new Error("UNIQUE constraint failed: user.mobile"),
            fields,
          ),
        }),
      ),
      true,
    );
});

test("calendar storage is sorted, idempotent and permanently removes only the selected date", async (context) => {
  const { database } = await fixture(context);
  const repository = createDrizzleCalendarRepository(database);
  await repository.add("2026-02-01");
  await repository.add("2026-01-01");
  await repository.add("2026-02-01");
  assert.deepEqual(await repository.list(), ["2026-01-01", "2026-02-01"]);
  assert.equal(await repository.remove("2026-01-01"), true);
  assert.equal(await repository.remove("2026-01-01"), false);
  assert.deepEqual(await repository.list(), ["2026-02-01"]);
});

test("file metadata roundtrips exact values and rejects duplicate keys and missing creators", async (context) => {
  const { database } = await fixture(context);
  await insertUser(database);
  const repository = createDrizzleFileRepository(database);
  const file = {
    bucket: "owned-private",
    contentType: "text/plain",
    createdAt: now,
    createdBy: "first",
    id: "file",
    objectKey: "owned/object",
    originalName: "نام.txt",
    size: 4,
    visibility: "private" as const,
  };
  assert.equal(await repository.findById("missing"), undefined);
  await repository.insert(file);
  assert.deepEqual(await repository.findById(file.id), file);
  await assert.rejects(
    repository.insert({ ...file, id: "duplicate" }),
    isUniqueConstraintError,
  );
  await assert.rejects(
    repository.insert({
      ...file,
      id: "orphan",
      objectKey: "other/key",
      createdBy: "missing",
    }),
    isForeignKeyConstraintError,
  );
  assert.equal(await repository.findById("duplicate"), undefined);
  assert.equal(await repository.findById("orphan"), undefined);
});

test("identity mapping deduplicates canonical permissions and keeps profile email separate", async (context) => {
  const { database } = await fixture(context);
  const user = await insertUser(database);
  await database.insert(schema.roles).values([
    { id: "z", name: "Zulu" },
    { id: "a", name: "Alpha" },
  ]);
  await database.insert(schema.rolePermissions).values([
    { roleId: "a", permission: "users.read" },
    { roleId: "z", permission: "users.read" },
    { roleId: "a", permission: "unsupported.permission" },
    { roleId: "z", permission: "settings.update" },
  ]);
  await database.insert(schema.userRoles).values([
    { userId: user.id, roleId: "z" },
    { userId: user.id, roleId: "a" },
  ]);
  assert.deepEqual((await getUserPermissions(database, user.id)).sort(), [
    "settings.update",
    "users.read",
  ]);
  assert.deepEqual(await getRolesByUserIds(database, []), new Map());
  assert.deepEqual(
    await getRolesByUserIds(database, [user.id, "missing"]),
    new Map([
      [
        user.id,
        [
          { id: "a", name: "Alpha" },
          { id: "z", name: "Zulu" },
        ],
      ],
    ]),
  );
  assert.equal(mapUserRecord(user).profileEmail, undefined);
  assert.equal(mapUserRecord(user).username, undefined);
  const mapped = mapUserRecord({
    ...user,
    profileEmail: "profile@synthetic.local",
    username: "ada",
  });
  assert.equal(mapped.authEmail, "first@synthetic.local");
  assert.equal(mapped.profileEmail, "profile@synthetic.local");
  assert.equal(mapped.username, "ada");
});

test("account writes preserve internal identity and classify real uniqueness conflicts", async (context) => {
  const { database, client } = await fixture(context);
  const first = await insertUser(database);
  await insertUser(database, "second", "09120000002");
  const persistence = createAccountPersistence(database);
  const updated = await persistence.updateProfile(mapUserRecord(first), {
    firstName: "Grace",
  });
  assert.equal(updated.name, "Grace Lovelace");
  assert.equal(updated.lastName, "Lovelace");
  assert.equal(updated.authEmail, first.email);
  assert.deepEqual(await persistence.getPermissions(first.id), []);
  assert.equal(
    (await persistence.updateUsername(first.id, "grace")).username,
    "grace",
  );
  assert.equal(
    (await persistence.updateUsername(first.id, "grace")).username,
    "grace",
  );
  await assert.rejects(persistence.updateUsername("second", "grace"), {
    kind: "invalid",
    key: "usernameInUse",
  });
  await persistence.verifyEmail(first.id, "profile@synthetic.local");
  await assert.rejects(
    persistence.verifyEmail("second", "profile@synthetic.local"),
    { kind: "invalid", key: "emailInUse" },
  );
  await client.executeMultiple(
    "CREATE TRIGGER reserve_username BEFORE UPDATE OF username ON user WHEN NEW.username = 'racing' BEGIN UPDATE user SET username = NEW.username WHERE id = 'second'; END;",
  );
  await assert.rejects(persistence.updateUsername(first.id, "racing"), {
    kind: "invalid",
    key: "usernameInUse",
  });
  const current = await database.query.user.findFirst({
    where: eq(schema.user.id, first.id),
  });
  assert.ok(current);
  assert.equal(current.username, "grace");
  assert.equal(current.profileEmail, "profile@synthetic.local");
  assert.equal(current.email, first.email);
  assert.equal(current.emailVerified, false);
});

test("account writes reject a user deleted after authentication", async (context) => {
  const { database } = await fixture(context);
  const removed = await insertUser(database);
  const other = await insertUser(database, "second", "09120000002");
  const persistence = createAccountPersistence(database);
  await persistence.updateUsername(other.id, "taken");
  await persistence.verifyEmail(other.id, "taken@synthetic.local");
  const staleActor = mapUserRecord(removed);
  await database.delete(schema.user).where(eq(schema.user.id, removed.id));

  for (const operation of [
    () => persistence.updateProfile(staleActor, { firstName: "Changed" }),
    () => persistence.updateUsername(removed.id, "available"),
    () => persistence.updateUsername(removed.id, "taken"),
    () => persistence.verifyEmail(removed.id, "available@synthetic.local"),
    () => persistence.verifyEmail(removed.id, "taken@synthetic.local"),
  ])
    await assert.rejects(operation(), {
      kind: "unauthenticated",
      key: "authenticationRequired",
    });

  const stillOther = await database.query.user.findFirst({
    where: eq(schema.user.id, other.id),
  });
  assert.equal(stillOther?.username, "taken");
  assert.equal(stillOther?.profileEmail, "taken@synthetic.local");
});

test("overlapping profile patches derive untouched name parts atomically from current database columns", async (context) => {
  const { database } = await fixture(context);
  const first = await insertUser(database);
  const staleActor = mapUserRecord(first);
  const persistence = createAccountPersistence(database);
  assert.equal(
    (await persistence.updateProfile(staleActor, { firstName: "Grace" })).name,
    "Grace Lovelace",
  );
  const patched = await persistence.updateProfile(staleActor, {
    lastName: "Hopper",
  });
  assert.equal(patched.name, "Grace Hopper");
  assert.equal(patched.firstName, "Grace");
  assert.equal(patched.lastName, "Hopper");
  assert.equal(
    (
      await persistence.updateProfile(staleActor, {
        firstName: "Marie",
        lastName: "Curie",
      })
    ).name,
    "Marie Curie",
  );
  const literal = "O'Neil || 'literal'";
  const bound = await persistence.updateProfile(staleActor, {
    firstName: literal,
  });
  assert.equal(bound.name, `${literal} Curie`);
  const persisted = await database.query.user.findFirst({
    where: eq(schema.user.id, first.id),
  });
  assert.equal(persisted?.firstName, literal);
  assert.equal(persisted?.lastName, "Curie");
  assert.equal(persisted?.name, `${literal} Curie`);
  assert.equal(persisted?.email, first.email);
});

test("managed user patches stay consistent across stale parallel name and mobile reads", async (context) => {
  const { database } = await fixture(context);
  await insertUser(database);
  await database.insert(schema.session).values({
    id: "synthetic-session",
    userId: "first",
    token: "synthetic-session-token",
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  const otp = createOtpGateway(
    loadConfig({ ...environment, NODE_ENV: "test", OTP_FIXED_CODE: "123456" }),
    database,
  );
  await otp.issue(
    "09120000003",
    "change_mobile",
    JSON.stringify([
      "profile",
      "first",
      "synthetic-session",
      "first",
      "09120000001",
      "09120000003",
    ]),
  );
  const real = createDrizzleUsersRepository(database);
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected authentication operation");
  };
  const provider: AuthProvider = {
    getSession: unexpected,
    hashPassword: unexpected,
    passwordBounds: unexpected,
    signIn: unexpected,
    signOut: unexpected,
    signUp: unexpected,
    verifyPassword: unexpected,
  };
  const concurrentService = (delayMobile: boolean) => {
    let readers = 0;
    let releaseReaders = () => {};
    let releaseFirstName = () => {};
    const bothRead = new Promise<void>((resolve) => {
      releaseReaders = resolve;
    });
    const firstNameCommitted = new Promise<void>((resolve) => {
      releaseFirstName = resolve;
    });
    return createUsersService({
      provider,
      otp,
      repository: {
        ...real,
        async find(id) {
          const value = await real.find(id);
          readers++;
          if (readers === 2) releaseReaders();
          await bothRead;
          return value;
        },
        async update(id, update, actorId) {
          const value = await real.update(id, update, actorId);
          return value;
        },
        async getRoles(ids) {
          const roles = await real.getRoles(ids);
          if (delayMobile) releaseFirstName();
          return roles;
        },
        async transaction(work) {
          if (delayMobile) await firstNameCommitted;
          return real.transaction(work);
        },
      },
    });
  };
  const names = concurrentService(false);
  await Promise.all([
    names.update(actor, "first", { first_name: "Grace" }),
    names.update(actor, "first", { last_name: "Hopper" }),
  ]);
  const afterNames = await database.query.user.findFirst({
    where: eq(schema.user.id, "first"),
  });
  assert.equal(afterNames?.firstName, "Grace");
  assert.equal(afterNames?.lastName, "Hopper");
  assert.equal(afterNames?.name, "Grace Hopper");
  const mobile = concurrentService(true);
  await Promise.all([
    mobile.update(actor, "first", { first_name: "Marie" }),
    mobile.update(
      actor,
      "first",
      { mobile: "09120000003", otp: "123456" },
      "profile",
    ),
  ]);
  const afterMobile = await database.query.user.findFirst({
    where: eq(schema.user.id, "first"),
  });
  assert.equal(afterMobile?.firstName, "Marie");
  assert.equal(afterMobile?.lastName, "Hopper");
  assert.equal(afterMobile?.name, "Marie Hopper");
  assert.equal(afterMobile?.mobile, "09120000003");
});

test("unrelated native write failures propagate without false semantic conflicts or partial writes", async (context) => {
  const { database, client } = await fixture(context);
  const first = await insertUser(database);
  await client.executeMultiple(
    "CREATE TRIGGER reject_account_update BEFORE UPDATE ON user BEGIN SELECT RAISE(ABORT, 'synthetic unrelated write failure'); END;",
  );
  const persistence = createAccountPersistence(database);
  for (const run of [
    () =>
      persistence.updateProfile(mapUserRecord(first), { firstName: "Changed" }),
    () => persistence.updateUsername(first.id, "new-name"),
    () => persistence.verifyEmail(first.id, "new@synthetic.local"),
    () =>
      createDrizzleUsersRepository(database).update(
        first.id,
        {
          firstName: "Changed",
        },
        "first",
      ),
  ])
    await assert.rejects(
      run(),
      (failure) =>
        failure instanceof Error &&
        !(failure instanceof ApplicationError) &&
        /synthetic unrelated write failure/.test(String(failure.cause)),
    );
  const after = await database.query.user.findFirst({
    where: eq(schema.user.id, first.id),
  });
  assert.deepEqual(after, first);
});

test("user repository filters and updates map optional profiles and report real uniqueness conflicts", async (context) => {
  const { database } = await fixture(context);
  await insertUser(database);
  await insertUser(database, "second", "09120000002");
  const repository = createDrizzleUsersRepository(database);
  assert.equal(await repository.find("missing"), undefined);
  const updated = await repository.update(
    "first",
    {
      firstName: "Grace",
      lastName: "Hopper",
      mobile: "09120000003",
    },
    "first",
  );
  assert.ok(updated);
  assert.equal(updated.name, "Grace Hopper");
  assert.equal(
    await repository.update("missing", { firstName: "Missing" }, "first"),
    undefined,
  );
  await assert.rejects(
    repository.update("second", { mobile: "09120000003" }, "second"),
    {
      kind: "invalid",
      key: "mobileInUse",
    },
  );
  await createAccountPersistence(database).updateUsername("first", "grace");
  await createAccountPersistence(database).verifyEmail(
    "first",
    "profile@synthetic.local",
  );
  for (const filter of [
    { email: "profile@synthetic.local" },
    { mobile: "09120000003" },
    { username: "grace" },
    { firstName: "rac" },
    { lastName: "opp" },
    { status: "active" as const, firstName: "Grace" },
  ]) {
    const page = await repository.list({ ...filter, offset: 0, size: 10 });
    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.id, "first");
  }
  const empty = await repository.list({
    mobile: "not-present",
    offset: 0,
    size: 10,
  });
  assert.deepEqual(empty, { items: [], total: 0 });
});

test("user write transactions roll back all fields and owned credential/session effects on failure", async (context) => {
  const { database } = await fixture(context);
  await insertUser(database);
  await database.insert(schema.account).values({
    accountId: "first",
    createdAt: now,
    id: "credential",
    password: "synthetic-old-hash",
    providerId: "credential",
    updatedAt: now,
    userId: "first",
  });
  await database.insert(schema.session).values({
    id: "session",
    userId: "first",
    createdAt: now,
    updatedAt: now,
    token: "synthetic-session-token",
    expiresAt: new Date("2040-01-01T00:00:00Z"),
  });
  const repository = createDrizzleUsersRepository(database);
  const failure = new Error("synthetic transaction failure");
  await assert.rejects(
    repository.transaction(async (write) => {
      assert.equal(await write.countActiveAdmins(), 0);
      assert.deepEqual(await write.existingRoleIds([]), []);
      assert.equal(
        await write.resetCredentialPassword("missing", "synthetic-new-hash"),
        false,
      );
      await write.setSystemAdmin("first", true);
      await write.setStatus("first", "inactive");
      assert.equal(
        await write.resetCredentialPassword("first", "synthetic-new-hash"),
        true,
      );
      await write.deleteSessions("first");
      throw failure;
    }),
    (error) => error === failure,
  );
  assert.equal((await repository.find("first"))?.status, "active");
  assert.equal((await repository.find("first"))?.isSystemAdmin, false);
  assert.equal(
    (await database.query.account.findFirst())?.password,
    "synthetic-old-hash",
  );
  assert.equal((await database.query.session.findMany()).length, 1);
  await repository.deleteSessions("first");
  assert.deepEqual(await database.query.session.findMany(), []);
});

test("role assignment replacement commits exactly and restores previous assignments on a foreign-key failure", async (context) => {
  const { database } = await fixture(context);
  await insertUser(database);
  await database.insert(schema.roles).values([
    { id: "first-role", name: "First" },
    { id: "second-role", name: "Second" },
  ]);
  const repository = createDrizzleUsersRepository(database);
  await repository.transaction(async (write) => {
    assert.deepEqual(
      (
        await write.existingRoleIds(["second-role", "missing", "first-role"])
      ).sort(),
      ["first-role", "second-role"],
    );
    await write.replaceRoles("first", ["first-role"]);
  });
  await assert.rejects(
    repository.transaction((write) => write.replaceRoles("first", ["missing"])),
    isForeignKeyConstraintError,
  );
  assert.deepEqual(
    await repository.getRoles(["first"]),
    new Map([["first", [{ id: "first-role", name: "First" }]]]),
  );
  await repository.transaction((write) =>
    write.replaceRoles("first", ["second-role"]),
  );
  assert.deepEqual(
    await repository.getRoles(["first"]),
    new Map([["first", [{ id: "second-role", name: "Second" }]]]),
  );
  await repository.transaction((write) => write.replaceRoles("first", []));
  assert.deepEqual(await repository.getRoles(["first"]), new Map());
});

test("role writes return permission keys in a stable order", async (context) => {
  const { database } = await fixture(context);
  const repository = createDrizzleRolesRepository(database);
  const created = await repository.create({
    id: "ordered",
    name: "Ordered",
    permissions: ["users.update", "roles.read", "users.read"],
  });
  assert.deepEqual(created.permissions, [
    "roles.read",
    "users.read",
    "users.update",
  ]);
  const updated = await repository.update("ordered", {
    name: "Updated",
    permissions: ["users.read", "roles.update", "roles.create"],
  });
  assert.deepEqual(updated?.permissions, [
    "roles.create",
    "roles.update",
    "users.read",
  ]);
  assert.deepEqual(
    (await repository.find("ordered"))?.permissions,
    updated?.permissions,
  );
});

test("roles expose empty/missing states without bypassing references or partial replacement", async (context) => {
  const { database } = await fixture(context);
  const repository = createDrizzleRolesRepository(database);
  assert.deepEqual(await repository.list(), []);
  assert.equal(await repository.find("missing"), undefined);
  assert.equal(await repository.deleteIfUnassigned("missing"), "missing");
  assert.equal(
    await repository.update("missing", { name: "Missing", permissions: [] }),
    undefined,
  );
  assert.deepEqual(
    await repository.create({ id: "empty", name: "Empty", permissions: [] }),
    { id: "empty", name: "Empty", permissions: [] },
  );
  assert.deepEqual(await repository.list(), [
    { id: "empty", name: "Empty", permissions: [] },
  ]);
  assert.equal(await repository.deleteIfUnassigned("empty"), "deleted");
});

test("settings validate file visibility and preserve language atomically when a logo write fails", async (context) => {
  const { database, client } = await fixture(context);
  const repository = createDrizzleSettingsRepository(database);
  const input = {
    darkTheme: { color_primary: "#ffffff" },
    lightTheme: { color_primary: "#000000" },
  };
  assert.equal(await repository.read(), undefined);
  assert.equal(await repository.readLanguageCode(), undefined);
  assert.equal(await repository.save(input), "missing");
  await insertUser(database);
  await database
    .insert(schema.settings)
    .values({ id: 1, languageCode: "fa", darkTheme: "{}", lightTheme: "{}" });
  const file = {
    bucket: "owned-public",
    contentType: "text/plain",
    createdAt: now,
    createdBy: "first",
    id: "public-logo",
    objectKey: "logo/public",
    originalName: "logo",
    size: 4,
    visibility: "public" as const,
  };
  await createDrizzleFileRepository(database).insert(file);
  await createDrizzleFileRepository(database).insert({
    ...file,
    id: "private-logo",
    objectKey: "logo/private",
    visibility: "private",
  });
  assert.equal(
    await repository.save({ ...input, darkLogoId: "private-logo" }),
    "invalid-logo",
  );
  assert.equal(
    await repository.save({ ...input, darkLogoId: "missing" }),
    "invalid-logo",
  );
  assert.equal(
    await repository.save({
      ...input,
      darkLogoId: file.id,
      lightLogoId: file.id,
    }),
    "saved",
  );
  assert.equal((await repository.read())?.darkLogo?.id, file.id);
  await client.executeMultiple(
    "CREATE TRIGGER reject_settings BEFORE UPDATE ON settings WHEN NEW.language_code = 'de' BEGIN SELECT RAISE(ABORT, 'synthetic settings failure'); END;",
  );
  await assert.rejects(
    repository.save({ ...input, languageCode: "de", darkLogoId: file.id }),
    /Failed query/,
  );
  assert.equal(await repository.readLanguageCode(), "fa");
  assert.equal((await repository.read())?.lightLogo?.id, file.id);
  assert.equal(await repository.save(input), "saved");
  assert.equal((await repository.read())?.darkLogo, undefined);
  assert.equal((await repository.read())?.lightLogo, undefined);
});
