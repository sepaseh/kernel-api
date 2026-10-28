import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";

import { eq } from "drizzle-orm";

import { createApp } from "../composition.ts";
import { createAuth } from "../infrastructure/auth/better-auth.ts";
import { loadConfig } from "../infrastructure/config.ts";
import { createDatabase } from "../infrastructure/db/client.ts";
import { initializeDatabase } from "../infrastructure/db/initialize.ts";
import {
  files,
  settings,
  user,
  userRoles,
} from "../infrastructure/db/schema.ts";
import { LocalFileStorage } from "../infrastructure/storage/local.ts";
import { captureLogs } from "./logging.ts";

const release = "synthetic-recovery-release";
const origin = "http://recovery.kernel.test";
const password = "synthetic-drill-password";
const secret = "synthetic-recovery-secret-at-least-thirty-two-characters";

async function inventory(directory: string, relative = "") {
  const result: { path: string; bytes: number; sha256: string }[] = [];
  for (const entry of await readdir(path.join(directory, relative), {
    withFileTypes: true,
  })) {
    const filename = path.join(relative, entry.name);
    assert.equal(
      entry.isSymbolicLink(),
      false,
      "Recovery fixtures never follow links",
    );
    if (entry.isDirectory())
      result.push(...(await inventory(directory, filename)));
    else {
      assert.ok(entry.isFile());
      const data = await readFile(path.join(directory, filename));
      result.push({
        path: filename.split(path.sep).join("/"),
        bytes: data.byteLength,
        sha256: createHash("sha256").update(data).digest("hex"),
      });
    }
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

type Point = Awaited<ReturnType<typeof inventory>>;
async function verifyPoint(directory: string, expected: Point) {
  assert.deepEqual(
    await inventory(directory),
    expected,
    "Recovery point files must match the closed DB/object manifest",
  );
}

async function fixture(context: TestContext) {
  const root = process.env.KERNEL_RECOVERY_DRILL_ROOT;
  assert.ok(
    root,
    "The parent drill must supply its synthetic temporary directory",
  );
  assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
  assert.ok(path.basename(root).startsWith("kernel-recovery-drill-"));
  const clients = new Set<ReturnType<typeof createDatabase>["client"]>();
  context.after(() => {
    for (const client of clients) client.close();
    // The parent removes the verified tree after worker exit, when every
    // native SQLite connection/statement handle has been released by the OS.
  });
  const open = async (directory: string, initialize = true) => {
    const config = loadConfig({
      BETTER_AUTH_SECRET: secret,
      BETTER_AUTH_URL: origin,
      DATABASE_URL: `file:${path.join(directory, "database.sqlite").replaceAll("\\", "/")}`,
      LOCAL_STORAGE_PATH: path.join(directory, "objects"),
      LOG_LEVEL: "info",
      NODE_ENV: "test",
      SERVER_ALLOWED_ORIGIN: origin,
      SERVER_ENVIRONMENT: "recovery-drill",
      SERVER_RELEASE_ID: release,
      STORAGE_DRIVER: "local",
    });
    const { client, database } = createDatabase(config);
    clients.add(client);
    const output = captureLogs(config.logging);
    const auth = createAuth(config, database, output.logger);
    if (initialize) await initializeDatabase(config, database, auth);
    const storage = new LocalFileStorage(config);
    await storage.ensureReady();
    const dependencies = {
      auth,
      config,
      database,
      logger: output.logger,
      storage,
    };
    return {
      ...dependencies,
      app: createApp(dependencies),
      client,
      output,
      close() {
        client.close();
        clients.delete(client);
      },
    };
  };
  const live = path.join(root, "live");
  const source = await open(live);
  const created = await source.auth.api.signUpEmail({
    body: {
      email: "recovery@kernel.test",
      firstName: "Synthetic",
      lastName: "Recovery",
      mobile: "09120000001",
      name: "Synthetic Recovery",
      password,
    },
  });
  await source.database
    .update(user)
    .set({ isSystemAdmin: true })
    .where(eq(user.id, created.user.id));
  const response = await source.app.request(`${origin}/auth/login`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "09120000001", password }),
  });
  assert.equal(response.status, 200);
  const token = ((await response.json()) as { access_token: string })
    .access_token;
  assert.ok(token);
  const upload = async (
    app: ReturnType<typeof createApp>,
    visibility: "public" | "private",
    requestId?: string,
  ) => {
    const form = new FormData();
    form.set(
      "file",
      new File(
        [`synthetic ${visibility} recovery object`],
        `${visibility}.txt`,
        { type: "text/plain" },
      ),
    );
    form.set("visibility", visibility);
    return app.request(`${origin}/files`, {
      method: "POST",
      body: form,
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: origin,
        ...(requestId && { "X-Request-Id": requestId }),
      },
    });
  };
  return { root, live, source, open, token, userId: created.user.id, upload };
}

test("isolated recovery restores a matched closed database, sessions and public/private objects", async (context) => {
  const { root, live, source, open, token, userId, upload } =
    await fixture(context);
  const mutation = (body: unknown): RequestInit => ({
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const roleResponse = await source.app.request(
    `${origin}/roles`,
    mutation({
      name: "Synthetic recovery reader",
      permissions: ["users.read"],
    }),
  );
  assert.equal(roleResponse.status, 201);
  const role = (await roleResponse.json()) as { id: string };
  const assignment = await source.app.request(
    `${origin}/users/${userId}/roles`,
    {
      ...mutation({ role_ids: [role.id] }),
      method: "PUT",
    },
  );
  assert.equal(assignment.status, 200);
  assert.equal(
    (
      await source.app.request(
        `${origin}/calendar`,
        mutation({ date: "2026-10-24" }),
      )
    ).status,
    200,
  );
  await source.database
    .update(settings)
    .set({ languageCode: "fa" })
    .where(eq(settings.id, 1));
  const publicResponse = await upload(source.app, "public");
  const privateResponse = await upload(source.app, "private");
  assert.equal(publicResponse.status, 201);
  assert.equal(privateResponse.status, 201);
  const publicFile = (await publicResponse.json()) as {
    id: string;
    url: string;
  };
  const privateFile = (await privateResponse.json()) as {
    id: string;
    url?: string;
  };
  assert.equal(privateFile.url, undefined);
  const migrations = (
    await source.client.execute(
      "SELECT hash FROM __drizzle_migrations ORDER BY id",
    )
  ).rows;
  assert.ok(migrations.length > 0);
  source.close();

  const point = await inventory(live);
  const backup = path.join(root, "backup");
  await cp(live, backup, { recursive: true, errorOnExist: true, force: false });
  await verifyPoint(backup, point);
  // The outgoing state is deliberately unusable; recovery must use the snapshot.
  await writeFile(
    path.join(live, "database.sqlite"),
    "synthetic damaged database",
  );
  await rm(path.join(live, "objects"), { recursive: true });
  const restoredDirectory = path.join(root, "restored");
  await cp(backup, restoredDirectory, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  await verifyPoint(restoredDirectory, point);
  const restored = await open(restoredDirectory, false);
  assert.equal(
    (await restored.client.execute("PRAGMA integrity_check")).rows[0]
      ?.integrity_check,
    "ok",
  );
  assert.equal(
    (await restored.client.execute("PRAGMA foreign_key_check")).rows.length,
    0,
  );
  assert.deepEqual(
    (
      await restored.client.execute(
        "SELECT hash FROM __drizzle_migrations ORDER BY id",
      )
    ).rows,
    migrations,
  );
  await initializeDatabase(restored.config, restored.database, restored.auth);
  assert.deepEqual(
    (
      await restored.client.execute(
        "SELECT hash FROM __drizzle_migrations ORDER BY id",
      )
    ).rows,
    migrations,
  );
  const me = await restored.app.request(`${origin}/account/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(
    me.status,
    200,
    "The actual recovered session still authenticates",
  );
  assert.equal(
    (
      await restored.database.query.user.findFirst({
        where: eq(user.id, userId),
      })
    )?.isSystemAdmin,
    true,
  );
  assert.equal(
    (await restored.database.query.settings.findFirst())?.languageCode,
    "fa",
  );
  const publicSettings = await restored.app.request(`${origin}/settings`);
  assert.equal(
    ((await publicSettings.json()) as { language: { code: string } }).language
      .code,
    "fa",
  );
  const roleRead = await restored.app.request(`${origin}/roles/${role.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(roleRead.status, 200);
  assert.deepEqual(
    ((await roleRead.json()) as { permissions: string[] }).permissions,
    ["users.read"],
  );
  assert.deepEqual(
    (
      await restored.database
        .select()
        .from(userRoles)
        .where(eq(userRoles.userId, userId))
    ).map((assignment) => assignment.roleId),
    [role.id],
  );
  const calendar = await restored.app.request(`${origin}/calendar`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(calendar.status, 200);
  assert.deepEqual(await calendar.json(), ["2026-10-24"]);
  const exposed = await restored.app.request(publicFile.url);
  assert.equal(exposed.status, 200);
  assert.equal(await exposed.text(), "synthetic public recovery object");
  assert.match(exposed.headers.get("content-type") ?? "", /text\/plain/);
  assert.equal(
    (await restored.app.request(`${origin}/files/${privateFile.id}/content`))
      .status,
    404,
  );
  const records = await restored.database.select().from(files);
  assert.equal(records.length, 2);
  for (const record of records) {
    const bytes = await restored.storage.get(record.bucket, record.objectKey);
    assert.equal(bytes.byteLength, record.size);
    assert.equal(
      new TextDecoder().decode(bytes),
      `synthetic ${record.visibility} recovery object`,
    );
  }
  // Startup and authentication wrote only to the independent restored copy.
  await verifyPoint(backup, point);
});

test("the recovery manifest rejects missing, corrupted and mismatched DB/object recovery points", async (context) => {
  const { root, live, source, open, upload } = await fixture(context);
  assert.equal((await upload(source.app, "public")).status, 201);
  source.close();
  const point = await inventory(live);
  const object = point.find((file) => file.path.startsWith("objects/"));
  assert.ok(object);
  for (const kind of [
    "missing-object",
    "changed-object",
    "mismatched-database",
  ] as const) {
    const target = path.join(root, kind);
    await cp(live, target, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    if (kind === "missing-object") await rm(path.join(target, object.path));
    else if (kind === "changed-object")
      await writeFile(
        path.join(target, object.path),
        "synthetic different recovery point",
      );
    else {
      // This remains valid SQLite but belongs to a different data point.
      const mismatched = await open(target);
      await mismatched.database
        .update(settings)
        .set({ languageCode: "fa" })
        .where(eq(settings.id, 1));
      mismatched.close();
    }
    await assert.rejects(
      verifyPoint(target, point),
      /Recovery point files must match/,
    );
  }
});

test("a synthetic storage incident correlates HTTP failure, request, release and redacted logs before recovery", async (context) => {
  const { source, token, upload } = await fixture(context);
  const failing = createApp({
    auth: source.auth,
    config: source.config,
    database: source.database,
    logger: source.logger,
    storage: {
      delete: (bucket, key) => source.storage.delete(bucket, key),
      ensureReady: () => source.storage.ensureReady(),
      get: (bucket, key) => source.storage.get(bucket, key),
      async put() {
        throw new Error("synthetic-provider-secret-must-never-be-logged");
      },
      url: (bucket, key, visibility) =>
        source.storage.url(bucket, key, visibility),
    },
  });
  source.output.lines.length = 0;
  const requestId = "drill-storage-outage";
  const failed = await upload(failing, "private", requestId);
  assert.equal(failed.status, 500);
  assert.equal(failed.headers.get("x-request-id"), requestId);
  assert.equal((await source.database.select().from(files)).length, 0);
  const correlated = source.output
    .records()
    .filter((record) => record.requestId === requestId);
  for (const event of [
    "storage.operation.failed",
    "file.upload.failed",
    "api.request.completed",
  ]) {
    const record = correlated.find((record) => record.event === event);
    assert.ok(record, `Missing correlated ${event}`);
    assert.equal(record.release, release);
    assert.equal(record.service, "kernel-api");
  }
  assert.equal(
    correlated.filter((record) => record.event === "api.request.completed")
      .length,
    1,
  );
  assert.equal(
    correlated.find((record) => record.event === "api.request.completed")
      ?.status,
    500,
  );
  assert.equal(
    correlated.find((record) => record.event === "file.upload.failed")?.stage,
    "storage",
  );
  for (const value of [
    token,
    password,
    secret,
    "synthetic-provider-secret-must-never-be-logged",
  ])
    assert.ok(!source.output.lines.join("").includes(value));
  const recovered = await upload(
    source.app,
    "private",
    "drill-storage-recovered",
  );
  assert.equal(recovered.status, 201);
  assert.equal((await source.database.select().from(files)).length, 1);
  const completed = source.output
    .records()
    .find(
      (record) =>
        record.requestId === "drill-storage-recovered" &&
        record.event === "api.request.completed",
    );
  assert.equal(completed?.status, 201);
  assert.equal(completed?.release, release);
});
