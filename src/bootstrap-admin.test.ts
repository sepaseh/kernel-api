import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { eq } from "drizzle-orm";

import { createApp } from "./composition.ts";
import {
  createInitialAdmin,
  parseInitialAdminInput,
} from "./infrastructure/admin/bootstrap.ts";
import { createAuth } from "./infrastructure/auth/better-auth.ts";
import { loadConfig } from "./infrastructure/config.ts";
import { createDatabase } from "./infrastructure/db/client.ts";
import { initializeDatabase } from "./infrastructure/db/initialize.ts";
import {
  account,
  session,
  settings,
  user,
} from "./infrastructure/db/schema.ts";
import { createLogger } from "./infrastructure/logging/logger.ts";
import { registerFixtureCleanup } from "./test/fixture-cleanup.ts";
import { MemoryObjectStorage } from "./test/memory-object-storage.ts";

const input = {
  first_name: "Synthetic",
  last_name: "Administrator",
  mobile: "09120000001",
  password: "synthetic-bootstrap-password",
  username: "synthetic.admin",
};
const cwd = fileURLToPath(new URL("../", import.meta.url));
const secret = "synthetic-bootstrap-secret-at-least-thirty-two-characters";
const resources = new WeakMap<
  TestContext,
  {
    closers: Array<() => void>;
    directories: string[];
  }
>();

const resourcesFor = (context: TestContext) => {
  let current = resources.get(context);
  if (!current) {
    const registered = {
      closers: [] as Array<() => void>,
      directories: [] as string[],
    };
    resources.set(context, registered);
    registerFixtureCleanup(context, registered.closers, async () => {
      const errors: unknown[] = [];
      for (const directory of registered.directories) {
        try {
          assert.equal(
            path.dirname(path.resolve(directory)),
            path.resolve(os.tmpdir()),
          );
          assert.ok(path.basename(directory).startsWith("kernel-bootstrap-"));
          await rm(directory, {
            force: true,
            maxRetries: 10,
            recursive: true,
            retryDelay: 50,
          });
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1)
        throw new AggregateError(
          errors,
          "Bootstrap fixture directory cleanup failed",
        );
    });
    current = registered;
  }
  return current;
};

const fixture = async (context: TestContext, databaseUrl = "file::memory:") => {
  const config = loadConfig({
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: "http://localhost",
    DATABASE_URL: databaseUrl,
    NODE_ENV: "test",
  });
  const { client, database } = createDatabase(config);
  resourcesFor(context).closers.push(() => client.close());
  const logger = createLogger(config.logging, { write() {} });
  const auth = createAuth(config, database, logger);
  await initializeDatabase(config, database, auth);
  return { auth, client, config, database, logger };
};

const temporaryDirectory = async (context: TestContext) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kernel-bootstrap-"));
  resourcesFor(context).directories.push(directory);
  return directory;
};

test("initial admin input follows existing identity and password rules", () => {
  assert.deepEqual(
    parseInitialAdminInput({
      ...input,
      first_name: " Synthetic ",
      username: "Synthetic.Admin",
    }),
    input,
  );
  for (const password of ["12345678", "x".repeat(128), "1234 5678"])
    assert.equal(
      parseInitialAdminInput({ ...input, password }).password,
      password,
    );
  for (const invalid of [
    undefined,
    null,
    [],
    {},
    { ...input, first_name: " " },
    { ...input, last_name: "x".repeat(1001) },
    { ...input, mobile: "0912000000" },
    { ...input, mobile: "18120000001" },
    { ...input, mobile: 9120000001 },
    { ...input, username: "ab" },
    { ...input, username: "x".repeat(31) },
    { ...input, username: "bad username" },
    { ...input, password: "1234567" },
    { ...input, password: "x".repeat(129) },
    { ...input, password: " password-with-spaces " },
    { ...input, password: false },
  ])
    assert.throws(() => parseInitialAdminInput(invalid), /Invalid initial/);
});

test("creates one active system admin with a working credential and no session", async (context) => {
  const { auth, config, database, logger } = await fixture(context);
  await createInitialAdmin(database, auth, input);
  const users = await database.select().from(user);
  const credentials = await database.select().from(account);
  assert.equal(users.length, 1);
  assert.equal(users[0].isSystemAdmin, true);
  assert.equal(users[0].status, "active");
  assert.equal(users[0].username, input.username);
  assert.match(users[0].email, /^[0-9a-f-]{36}@kernel\.local$/);
  assert.notEqual(users[0].email, `${input.mobile}@kernel.local`);
  assert.equal(credentials.length, 1);
  assert.equal(credentials[0].providerId, "credential");
  assert.equal(credentials[0].accountId, users[0].id);
  assert.equal(credentials[0].userId, users[0].id);
  assert.notEqual(credentials[0].password, input.password);
  assert.deepEqual(await database.select().from(session), []);
  const app = createApp({
    auth,
    config,
    database,
    logger,
    storage: new MemoryObjectStorage(),
  });
  {
    const identifier = input.mobile;
    const response = await app.request("http://localhost/auth/login", {
      body: JSON.stringify({ identifier, password: input.password }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { access_token: string };
    const profile = await app.request("http://localhost/account/me", {
      headers: { Authorization: `Bearer ${body.access_token}` },
    });
    assert.equal(profile.status, 200);
    assert.equal(
      ((await profile.json()) as { is_system_admin: boolean }).is_system_admin,
      true,
    );
  }
});

test("refuses any existing user without modifying or promoting them", async (context) => {
  const { auth, database } = await fixture(context);
  await database.insert(user).values({
    firstName: "Existing",
    lastName: "Inactive",
    email: "existing@kernel.local",
    id: "synthetic-existing-user",
    isSystemAdmin: false,
    mobile: "09120000002",
    name: "Existing Inactive",
    status: "inactive",
  });
  const before = await database.select().from(user);
  await assert.rejects(createInitialAdmin(database, auth, input), /no users/);
  assert.deepEqual(await database.select().from(user), before);
  assert.deepEqual(await database.select().from(account), []);
  assert.deepEqual(await database.select().from(session), []);
});

test("credential insertion failure rolls back the new administrator", async (context) => {
  const { auth, client, database } = await fixture(context);
  await client.execute(
    "CREATE TRIGGER synthetic_reject_credential BEFORE INSERT ON account BEGIN SELECT RAISE(ABORT, 'synthetic credential failure'); END",
  );
  await assert.rejects(createInitialAdmin(database, auth, input));
  assert.deepEqual(await database.select().from(user), []);
  assert.deepEqual(await database.select().from(account), []);
  assert.deepEqual(await database.select().from(session), []);
});

test("concurrent clients cannot provision two initial administrators", async (context) => {
  const directory = await temporaryDirectory(context);
  const databaseUrl = pathToFileURL(path.join(directory, "race.sqlite")).href;
  const first = await fixture(context, databaseUrl);
  const second = await fixture(context, databaseUrl);
  const results = await Promise.allSettled([
    createInitialAdmin(first.database, first.auth, input),
    createInitialAdmin(second.database, second.auth, {
      ...input,
      mobile: "09120000002",
      username: "second.admin",
    }),
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
    createInitialAdmin(first.database, first.auth, input),
    /no users/,
  );
});

const runCli = (
  databaseUrl: string,
  jsonInput: string,
  environment: Record<string, string> = {},
  args: string[] = [],
) =>
  spawnSync(process.execPath, ["src/bootstrap-admin.ts", ...args], {
    cwd,
    encoding: "utf8",
    env: {
      BETTER_AUTH_SECRET: secret,
      BETTER_AUTH_URL: "https://api.synthetic.invalid",
      DATABASE_URL: databaseUrl,
      NODE_ENV: "production",
      PATH: process.env.PATH,
      SERVER_ALLOWED_ORIGINS: "https://admin.synthetic.invalid",
      SERVER_RELEASE_ID: "synthetic-test-release",
      STORAGE_DRIVER: "local",
      SystemRoot: process.env.SystemRoot,
      ...environment,
      NODE_V8_COVERAGE: undefined,
      NODE_OPTIONS: undefined,
    },
    input: jsonInput,
    timeout: 15_000,
  });

test("production CLI reads STDIN, migrates, creates no session and refuses reruns safely", async (context) => {
  const directory = await temporaryDirectory(context);
  const databaseUrl = pathToFileURL(
    path.join(directory, "production.sqlite"),
  ).href;
  const result = runCli(databaseUrl, JSON.stringify(input));
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "Initial administrator created.\n");
  assert.equal(result.stderr, "");
  const current = await fixture(context, databaseUrl);
  assert.equal((await current.database.select().from(user)).length, 1);
  assert.equal((await current.database.select().from(account)).length, 1);
  assert.deepEqual(await current.database.select().from(session), []);
  assert.equal(
    (await current.database.select().from(settings))[0].languageCode,
    "en",
  );
  const before = await current.database.select().from(account);
  const rerun = runCli(
    databaseUrl,
    JSON.stringify({ ...input, password: "replacement-synthetic-password" }),
  );
  assert.equal(rerun.error, undefined);
  assert.equal(rerun.status, 1);
  assert.equal(rerun.stdout, "");
  assert.match(rerun.stderr, /Initial administrator was not created/);
  assert.doesNotMatch(
    result.stdout + result.stderr + rerun.stdout + rerun.stderr,
    new RegExp(
      `${input.password}|${input.mobile}|${input.username}|replacement-synthetic-password|${secret}`,
    ),
  );
  assert.deepEqual(await current.database.select().from(account), before);
});

test("CLI explicitly disables development seeding even if enabled in its environment", async (context) => {
  const directory = await temporaryDirectory(context);
  const databaseUrl = pathToFileURL(
    path.join(directory, "seed-disabled.sqlite"),
  ).href;
  const result = runCli(databaseUrl, JSON.stringify(input), {
    NODE_ENV: "test",
    SERVER_SEED_DEVELOPMENT_DATA: "true",
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const current = await fixture(context, databaseUrl);
  const users = await current.database.select().from(user);
  assert.equal(users.length, 1);
  assert.equal(users[0].mobile, input.mobile);
  assert.equal(
    await current.database.query.user.findFirst({
      where: eq(user.mobile, "09123456789"),
    }),
    undefined,
  );
});

test("invalid STDIN or argv are rejected before opening the configured database", async (context) => {
  const directory = await temporaryDirectory(context);
  const databasePath = path.join(directory, "must-not-open.sqlite");
  const databaseUrl = pathToFileURL(databasePath).href;
  for (const [body, args] of [
    ["{malformed-synthetic-input", []],
    [JSON.stringify({ ...input, password: "short" }), []],
    [JSON.stringify(input), ["--unexpected"]],
    ["x".repeat(64 * 1024 + 1), []],
  ] as const) {
    const result = runCli(databaseUrl, body, {}, [...args]);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Initial administrator was not created/);
    assert.doesNotMatch(
      result.stderr,
      /synthetic-input|synthetic-bootstrap-password|SyntaxError|stack/,
    );
    assert.equal(existsSync(databasePath), false);
  }
});
