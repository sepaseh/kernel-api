import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test, type TestContext } from "node:test";

import { eq } from "drizzle-orm";

import { createApp } from "../../composition.ts";
import type { ContentCategory } from "../../contracts/content-categories.ts";
import type { PermissionKey } from "../../contracts/permissions.ts";
import { profileNameMaxLength } from "../../contracts/profile.ts";
import { createAuth } from "../../infrastructure/auth/better-auth.ts";
import { loadConfig } from "../../infrastructure/config.ts";
import { createDatabase } from "../../infrastructure/db/client.ts";
import { initializeDatabase } from "../../infrastructure/db/initialize.ts";
import {
  contentCategories,
  contents,
  files,
  rolePermissions,
  roles,
  settings,
  user,
  userRoles,
} from "../../infrastructure/db/schema.ts";
import { getTranslator } from "../../infrastructure/localization/i18n.ts";
import { createLogger } from "../../infrastructure/logging/logger.ts";
import { MemoryObjectStorage } from "../support/memory-object-storage.ts";

const basePath = "/content-categories";
const categoryPath = (id: string) => `${basePath}/${id}`;
const savedExample = async (path: string): Promise<unknown> =>
  JSON.parse(
    await readFile(
      new URL(
        `../../../collection/content-categories/${path}`,
        import.meta.url,
      ),
      "utf8",
    ),
  );

const fixture = async (context: TestContext, permissions?: PermissionKey[]) => {
  const config = loadConfig({
    BETTER_AUTH_SECRET: "synthetic-secret-with-at-least-thirty-two-characters",
    BETTER_AUTH_URL: "http://localhost",
    DATABASE_URL: "file::memory:",
  });
  const { client, database } = createDatabase(config);
  context.after(() => client.close());
  const logger = createLogger(config.logging, { write() {} });
  const auth = createAuth(config, database, logger);
  await initializeDatabase(config, database, auth);
  const app = createApp({
    auth,
    config,
    database,
    logger,
    storage: new MemoryObjectStorage(),
  });
  const password = "synthetic-category-test-password";
  const mobile = "09120000001";
  const created = await auth.api.signUpEmail({
    body: {
      email: "category-test@kernel.test",
      firstName: "Synthetic",
      lastName: "Editor",
      mobile,
      name: "Synthetic Editor",
      password,
    },
  });
  if (permissions) {
    const roleId = "content-editor";
    await database.insert(roles).values({ id: roleId, name: "Content Editor" });
    await database
      .insert(userRoles)
      .values({ roleId, userId: created.user.id });
    await database
      .insert(rolePermissions)
      .values(permissions.map((permission) => ({ permission, roleId })));
  } else {
    await database
      .update(user)
      .set({ isSystemAdmin: true })
      .where(eq(user.id, created.user.id));
  }

  const login = await app.request("/auth/login", {
    body: JSON.stringify({ identifier: mobile, password }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  assert.equal(login.status, 200);
  const { access_token: token } = (await login.json()) as {
    access_token: string;
  };
  const send = (path: string, method: string, body?: Record<string, unknown>) =>
    app.request(path, {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method,
    });
  const createCategory = async (name: string) => {
    const response = await send(basePath, "POST", { name });
    assert.equal(response.status, 201);
    return (await response.json()) as ContentCategory;
  };
  const listCategories = async () => {
    const response = await send(basePath, "GET");
    assert.equal(response.status, 200);
    return response.json();
  };
  return {
    app,
    client,
    createCategory,
    database,
    listCategories,
    send,
    userId: created.user.id,
  };
};

test("creates, reads, renames, reorders and removes categories through HTTP", async (context) => {
  const { client, createCategory, database, listCategories, send } =
    await fixture(context);
  assert.deepEqual(await listCategories(), []);
  assert.equal(
    (await send(`${basePath}/sort`, "PATCH", { ids: [] })).status,
    200,
  );
  for (const name of [" ", "a".repeat(profileNameMaxLength + 1)]) {
    assert.equal((await send(basePath, "POST", { name })).status, 400);
  }
  const guides = await createCategory(" Guides ");
  const announcements = await createCategory("Announcements");
  assert.deepEqual(
    { ...guides, id: "c8535622-f3a0-49aa-91e7-62d973199279" },
    await savedExample("create/201.json"),
  );
  assert.deepEqual(await listCategories(), [guides, announcements]);

  const detail = await send(categoryPath(guides.id), "GET");
  assert.equal(detail.status, 200);
  assert.deepEqual(await detail.json(), guides);
  const renamed = await send(categoryPath(guides.id), "PATCH", {
    name: " Setup Guides ",
  });
  assert.equal(renamed.status, 200);
  const renamedGuides = { ...guides, name: "Setup Guides" };
  assert.deepEqual(await renamed.json(), renamedGuides);
  assert.deepEqual(await listCategories(), [renamedGuides, announcements]);

  const sort = (ids: unknown) => send(`${basePath}/sort`, "PATCH", { ids });
  for (const ids of ["guides", [false], [""], [guides.id, guides.id]]) {
    assert.equal((await sort(ids)).status, 400);
  }
  for (const ids of [[guides.id], [guides.id, "unknown"]]) {
    const stale = await sort(ids);
    assert.equal(stale.status, 409);
    assert.deepEqual(await stale.json(), await savedExample("sort/409.json"));
  }
  assert.deepEqual(await listCategories(), [renamedGuides, announcements]);

  await client.execute(`
    CREATE TRIGGER reject_category_position BEFORE UPDATE OF position ON content_categories
    WHEN OLD.position = 0
    BEGIN
      SELECT RAISE(ABORT, 'synthetic position update failure');
    END;
  `);
  const failedSort = await sort([announcements.id, guides.id]);
  assert.equal(failedSort.status, 500);
  assert.deepEqual(await listCategories(), [renamedGuides, announcements]);
  await client.execute("DROP TRIGGER reject_category_position");

  const sorted = await sort([announcements.id, guides.id]);
  assert.equal(sorted.status, 200);
  assert.equal(await sorted.text(), "");
  const news = await createCategory("News");
  assert.deepEqual(await listCategories(), [
    announcements,
    renamedGuides,
    news,
  ]);

  const deleted = await send(categoryPath(guides.id), "DELETE");
  assert.equal(deleted.status, 200);
  assert.equal(await deleted.text(), "");
  assert.equal((await send(categoryPath(guides.id), "GET")).status, 404);
  assert.equal(
    (await send(categoryPath(guides.id), "PATCH", { name: "Unused" })).status,
    404,
  );
  assert.equal((await send(categoryPath(guides.id), "DELETE")).status, 404);
  assert.deepEqual(
    await database
      .select({ id: contentCategories.id })
      .from(contentCategories)
      .where(eq(contentCategories.id, guides.id)),
    [],
  );
  assert.deepEqual(await listCategories(), [announcements, news]);
});

test("lets category readers list and read without granting category management", async (context) => {
  const { app, database, listCategories, send } = await fixture(context, [
    "content-categories.read",
  ]);
  const category = { id: "guides", name: "Guides" };
  await database.insert(contentCategories).values({ ...category, position: 0 });

  assert.equal((await app.request(basePath)).status, 401);
  assert.deepEqual(await listCategories(), [category]);
  const detail = await send(categoryPath(category.id), "GET");
  assert.equal(detail.status, 200);
  assert.deepEqual(await detail.json(), category);
  for (const request of [
    () => send(basePath, "POST", { name: "News" }),
    () => send(categoryPath(category.id), "PATCH", { name: "Updated" }),
    () => send(`${basePath}/sort`, "PATCH", { ids: [category.id] }),
    () => send(categoryPath(category.id), "DELETE"),
  ]) {
    assert.equal((await request()).status, 403);
  }
  await database.delete(rolePermissions);
  assert.equal((await send(basePath, "GET")).status, 403);
});

test("blocks deletion of an in-use category and rolls back a late content reference", async (context) => {
  const { client, createCategory, database, send, userId } =
    await fixture(context);
  await client.execute("PRAGMA foreign_keys = ON");
  const category = await createCategory("Guides");
  const createdAt = new Date("2026-01-01T00:00:00Z");
  await database.insert(files).values({
    bucket: "synthetic",
    contentType: "image/png",
    createdAt,
    createdBy: userId,
    id: "cover",
    objectKey: "cover.png",
    originalName: "cover.png",
    size: 1,
    visibility: "public",
  });
  const content = {
    body: "<p>Useful information</p>",
    contentCategoryId: category.id,
    coverImageId: "cover",
    createdAt,
    excerpt: "Useful information",
    id: "guide",
    normalizedTitle: "guide",
    title: "Guide",
  };
  await database.insert(contents).values(content);
  const listedFiles = await send("/files", "GET");
  assert.equal(listedFiles.status, 200);
  assert.deepEqual(await listedFiles.json(), [
    {
      id: "cover",
      is_used: true,
      size: 1,
      url: "https://storage.test/synthetic/cover.png",
    },
  ]);
  assert.equal((await send("/files/cover", "DELETE")).status, 409);
  const remove = () => send(categoryPath(category.id), "DELETE");
  const inUse = await remove();
  assert.equal(inUse.status, 409);
  assert.deepEqual(await inUse.json(), await savedExample("delete/409.json"));
  assert.deepEqual(await database.select().from(contents), [content]);

  await database.delete(contents).where(eq(contents.id, content.id));
  await database
    .update(settings)
    .set({ languageCode: "fa" })
    .where(eq(settings.id, 1));
  await client.execute(`
    CREATE TRIGGER attach_content_before_category_delete BEFORE DELETE ON content_categories
    BEGIN
      INSERT INTO contents (body, content_category_id, cover_image_id, created_at, excerpt, id, normalized_title, title)
      VALUES ('<p>Late guide</p>', OLD.id, 'cover', 1, 'Late guide', 'late', 'late guide', 'Late guide');
    END;
  `);
  const lateReference = await remove();
  assert.equal(lateReference.status, 409);
  assert.equal(lateReference.headers.get("Content-Language"), "fa");
  assert.deepEqual(await lateReference.json(), {
    message: getTranslator("fa")("contentCategoryInUse"),
  });
  assert.deepEqual(await database.select().from(contents), []);
  assert.deepEqual(await database.select().from(contentCategories), [
    { ...category, position: 0 },
  ]);
});
