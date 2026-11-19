import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { eq } from "drizzle-orm";

import { createApp } from "../../composition.ts";
import { createAuth } from "../../infrastructure/auth/better-auth.ts";
import { loadConfig } from "../../infrastructure/config.ts";
import { createDatabase } from "../../infrastructure/db/client.ts";
import { initializeDatabase } from "../../infrastructure/db/initialize.ts";
import {
  pendingFileDeletions,
  rolePermissions,
  roles,
  settings,
  userRoles,
} from "../../infrastructure/db/schema.ts";
import { getTranslator } from "../../infrastructure/localization/i18n.ts";
import { createLogger } from "../../infrastructure/logging/logger.ts";
import { LocalFileStorage } from "../../infrastructure/storage/local.ts";
import { registerFixtureCleanup } from "../support/fixture-cleanup.ts";

test("manages scoped uploads and resumes hard deletion without removing used files", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "kernel-file-management-"));
  const config = loadConfig({
    BETTER_AUTH_SECRET: "synthetic-only-file-management-integration-secret",
    BETTER_AUTH_URL: "http://localhost:3000",
    DATABASE_URL: "file::memory:",
    NODE_ENV: "test",
  });
  const { client, database } = createDatabase(config);
  registerFixtureCleanup(t, [() => client.close()], async () => {
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    assert.match(path.basename(root), /^kernel-file-management-/);
    await rm(root, { recursive: true, force: true });
  });
  const logger = createLogger(config.logging, { write() {} });
  const auth = createAuth(config, database, logger);
  await initializeDatabase(config, database, auth);
  const storage = new LocalFileStorage({
    baseUrl: config.baseUrl,
    localStoragePath: root,
  });
  await storage.ensureReady();
  const app = createApp({ auth, config, database, logger, storage });
  const account = await auth.api.signUpEmail({
    body: {
      email: "editor@kernel.test",
      firstName: "Branding",
      lastName: "Editor",
      mobile: "09120000007",
      name: "Branding Editor",
      password: "synthetic-password",
    },
  });
  await database.insert(roles).values({ id: "editor", name: "Editor" });
  await database.insert(rolePermissions).values([
    { permission: "files.delete", roleId: "editor" },
    { permission: "files.read", roleId: "editor" },
  ]);
  await database
    .insert(userRoles)
    .values({ roleId: "editor", userId: account.user.id });
  const login = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "09120000007",
      password: "synthetic-password",
    }),
  });
  assert.equal(login.status, 200);
  const { access_token: token } = (await login.json()) as {
    access_token: string;
  };
  const headers = { Authorization: `Bearer ${token}` };
  const upload = (context: string, bytes: string, type = "image/png") => {
    const body = new FormData();
    body.set("context", context);
    body.set("file", new File([bytes], "fixture.png", { type }));
    return app.request("/files", { body, headers, method: "POST" });
  };
  const remove = (id: string) =>
    app.request(`/files/${id}`, { headers, method: "DELETE" });

  assert.equal((await app.request("/files")).status, 401);
  assert.equal((await upload("logo", "logo")).status, 403);
  assert.equal((await upload("unknown", "brand")).status, 400);
  await database
    .insert(rolePermissions)
    .values({ permission: "settings.update", roleId: "editor" });
  await database
    .update(settings)
    .set({
      imageSettings: JSON.stringify({
        contents: { height: 630, size: 2_000_000, width: 1200 },
        logo: { height: 256, size: 5, width: 256 },
      }),
    })
    .where(eq(settings.id, 1));
  assert.equal((await upload("logo", "too-large")).status, 413);

  const response = await upload("logo", "brand");
  assert.equal(response.status, 201);
  const uploaded = (await response.json()) as { id: string; url: string };
  assert.deepEqual(uploaded, {
    content_type: "image/png",
    id: uploaded.id,
    is_used: false,
    size: 5,
    url: `${config.baseUrl}/files/${uploaded.id}/content`,
    visibility: "public",
  });
  const publicPath = `/files/${uploaded.id}/content`;
  const original = await app.request(publicPath);
  assert.equal(original.headers.get("Cache-Control"), "public, max-age=3600");
  assert.equal(await original.text(), "brand");

  await database
    .update(settings)
    .set({
      darkLogoId: uploaded.id,
      languageCode: "fa",
    })
    .where(eq(settings.id, 1));
  const listed = await app.request("/files", { headers });
  assert.equal(listed.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await listed.json(), [
    {
      id: uploaded.id,
      is_used: true,
      size: 5,
      url: uploaded.url,
    },
  ]);
  const inUse = await remove(uploaded.id);
  assert.equal(inUse.status, 409);
  assert.deepEqual(await inUse.json(), {
    message: getTranslator("fa")("fileInUse"),
  });
  assert.equal((await app.request(publicPath)).status, 200);
  assert.deepEqual(await database.select().from(pendingFileDeletions), []);

  await database
    .update(settings)
    .set({ darkLogoId: null })
    .where(eq(settings.id, 1));
  const deleteObject = storage.delete.bind(storage);
  const interrupted = t.mock.method(
    storage,
    "delete",
    async (...args: Parameters<typeof deleteObject>) => {
      await deleteObject(...args);
      throw new Error("Synthetic lost deletion response");
    },
  );
  assert.equal((await remove(uploaded.id)).status, 500);
  assert.equal((await app.request(publicPath)).status, 404);
  assert.deepEqual(await (await app.request("/files", { headers })).json(), []);
  assert.equal((await database.select().from(pendingFileDeletions)).length, 1);
  interrupted.mock.restore();

  const retried = await remove(uploaded.id);
  assert.equal(retried.status, 200);
  assert.equal(await retried.text(), "");
  assert.deepEqual(await database.select().from(pendingFileDeletions), []);
  assert.equal((await remove(uploaded.id)).status, 404);
});
