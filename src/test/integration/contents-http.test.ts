import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test, type TestContext } from "node:test";

import { createApp } from "../../composition.ts";
import type { ContentCategory } from "../../contracts/content-categories.ts";
import type {
  Content,
  ContentRequest,
  ContentsResponse,
} from "../../contracts/contents.ts";
import { contentsPageSize } from "../../contracts/contents.ts";
import type { UploadedFileResponse } from "../../contracts/files.ts";
import type { PermissionKey } from "../../contracts/permissions.ts";
import { createAuth } from "../../infrastructure/auth/better-auth.ts";
import { loadConfig } from "../../infrastructure/config.ts";
import { createDatabase } from "../../infrastructure/db/client.ts";
import { initializeDatabase } from "../../infrastructure/db/initialize.ts";
import {
  rolePermissions,
  roles,
  userRoles,
} from "../../infrastructure/db/schema.ts";
import { en } from "../../infrastructure/localization/catalogs/en.ts";
import { createLogger } from "../../infrastructure/logging/logger.ts";
import { sampleCoverImage } from "../support/cover-image.ts";
import { MemoryObjectStorage } from "../support/memory-object-storage.ts";

const readExample = async <T>(operation: string, status: number): Promise<T> =>
  JSON.parse(
    await readFile(
      new URL(
        `../../../collection/contents/${operation}/${status}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as T;

const readExampleRequest = async (operation: "create" | "update") => {
  const source = await readFile(
    new URL(
      `../../../collection/contents/${operation}/index.bru`,
      import.meta.url,
    ),
    "utf8",
  );
  const body = source.match(/body:json \{\s*\n([\s\S]*?)\n\}/)?.[1];
  assert.ok(body);
  return JSON.parse(body) as ContentRequest;
};

const fixture = async (context: TestContext) => {
  const config = loadConfig({
    BETTER_AUTH_SECRET:
      "synthetic-contents-secret-longer-than-thirty-two-characters",
    BETTER_AUTH_URL: "http://localhost:3000",
    DATABASE_URL: "file::memory:",
    NODE_ENV: "test",
  });
  const { client, database } = createDatabase(config);
  context.after(() => client.close());
  const logger = createLogger(config.logging, { write() {} });
  const auth = createAuth(config, database, logger);
  await initializeDatabase(config, database, auth);
  const storage = new MemoryObjectStorage();
  const app = createApp({ auth, config, database, logger, storage });

  const request = (
    route: string,
    method: string,
    token?: string,
    body?: FormData | Record<string, unknown>,
  ) => {
    const headers = new Headers(
      token ? { Authorization: `Bearer ${token}` } : {},
    );
    if (body instanceof FormData)
      return app.request(route, { body, headers, method });
    if (body) headers.set("Content-Type", "application/json");
    return app.request(route, {
      body: body && JSON.stringify(body),
      headers,
      method,
    });
  };

  const signIn = async (mobile: string, permissions: PermissionKey[]) => {
    const password = "synthetic-contents-password";
    const identity = await auth.api.signUpEmail({
      body: {
        email: `${mobile}@kernel.test`,
        firstName: "Content",
        lastName: "Tester",
        mobile,
        name: "Content Tester",
        password,
      },
    });
    await database.insert(roles).values({ id: mobile, name: `Role ${mobile}` });
    await database
      .insert(rolePermissions)
      .values(
        permissions.map((permission) => ({ permission, roleId: mobile })),
      );
    await database
      .insert(userRoles)
      .values({ roleId: mobile, userId: identity.user.id });
    const response = await request("/auth/login", "POST", undefined, {
      identifier: mobile,
      password,
    });
    assert.equal(response.status, 200);
    return ((await response.json()) as { access_token: string }).access_token;
  };

  const editor = await signIn("09120000201", [
    "content-categories.create",
    "contents.create",
    "contents.delete",
    "contents.read",
    "contents.update",
    "files.delete",
  ]);

  const createCategory = async (name: string) => {
    const response = await request("/content-categories", "POST", editor, {
      name,
    });
    assert.equal(response.status, 201);
    return (await response.json()) as ContentCategory;
  };

  const uploadImage = async (publicImage: boolean) => {
    const form = new FormData();
    form.set(
      "file",
      new File([sampleCoverImage], "cover.png", { type: "image/png" }),
    );
    if (publicImage) form.set("context", "contents");
    else form.set("visibility", "private");
    const response = await request("/files", "POST", editor, form);
    assert.equal(response.status, 201);
    return (await response.json()) as UploadedFileResponse;
  };

  return { createCategory, editor, request, signIn, storage, uploadImage };
};

test("contents HTTP replaces editable fields atomically and enforces resource permissions", async (context) => {
  const { createCategory, editor, request, signIn, storage, uploadImage } =
    await fixture(context);
  const reader = await signIn("09120000202", ["contents.read"]);
  const category = await createCategory("Documentation");
  const otherCategory = await createCategory("Release news");
  const cover = await uploadImage(true);
  const privateCover = await uploadImage(false);
  const input = {
    ...(await readExampleRequest("create")),
    content_category_id: category.id,
    cover_image_id: cover.id,
  };

  const unauthenticated = await request("/contents", "GET");
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(
    await unauthenticated.json(),
    await readExample("list", 401),
  );
  const forbidden = await request("/contents", "POST", reader, input);
  assert.equal(forbidden.status, 403);
  assert.deepEqual(await forbidden.json(), await readExample("create", 403));
  const invalid = await request("/contents", "POST", editor, {
    ...input,
    body: "<p>&nbsp;\u200b<br></p>",
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), await readExample("create", 400));
  const missingCategory = await request("/contents", "POST", editor, {
    ...input,
    content_category_id: "missing",
  });
  assert.equal(missingCategory.status, 404);
  assert.deepEqual(
    await missingCategory.json(),
    await readExample("create", 404),
  );

  const response = await request("/contents", "POST", editor, input);
  assert.equal(response.status, 201);
  const created = (await response.json()) as Content;
  assert.match(created.id, /^[0-9a-f-]{36}$/i);
  const createdExample = await readExample<Content>("create", 201);
  assert.deepEqual(created, {
    ...createdExample,
    content_category: { ...createdExample.content_category, id: category.id },
    cover_image: {
      ...createdExample.cover_image,
      id: cover.id,
      url: cover.url,
    },
    id: created.id,
  });

  const route = `/contents/${created.id}`;
  const read = await request(route, "GET", reader);
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), created);
  const beforeUpdate = await request("/contents", "GET", reader);
  assert.equal(beforeUpdate.status, 200);
  assert.deepEqual(await beforeUpdate.json(), { items: [created], total: 1 });

  const replace = {
    ...(await readExampleRequest("update")),
    content_category_id: otherCategory.id,
    cover_image_id: cover.id,
  };
  assert.equal((await request(route, "PATCH", reader, replace)).status, 403);
  const invalidCover = await request(route, "PATCH", editor, {
    ...replace,
    cover_image_id: privateCover.id,
  });
  assert.equal(invalidCover.status, 404);
  assert.deepEqual(await invalidCover.json(), {
    message: en.contentCoverImageNotFound,
  });
  assert.deepEqual(await (await request(route, "GET", reader)).json(), created);

  const updated = await request(route, "PATCH", editor, replace);
  assert.equal(updated.status, 200);
  const updatedExample = await readExample<Content>("update", 200);
  assert.deepEqual(await updated.json(), {
    ...updatedExample,
    content_category: {
      ...updatedExample.content_category,
      id: otherCategory.id,
    },
    cover_image: {
      ...updatedExample.cover_image,
      id: cover.id,
      url: cover.url,
    },
    id: created.id,
  });

  const storedFile = `/files/${cover.id}`;
  assert.equal((await request(storedFile, "DELETE", editor)).status, 409);
  assert.equal(storage.objects.size, 2);
  assert.equal((await request(route, "DELETE", reader)).status, 403);
  const deleted = await request(route, "DELETE", editor);
  assert.equal(deleted.status, 200);
  assert.equal(await deleted.text(), "");
  const missing = await request(route, "GET", reader);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), await readExample("details", 404));
  assert.equal((await request(route, "PATCH", editor, replace)).status, 404);
  assert.equal((await request(route, "DELETE", editor)).status, 404);
  const image = await request(`${storedFile}/content`, "GET");
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("Content-Type"), "image/png");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), sampleCoverImage);
  assert.equal((await request(storedFile, "DELETE", editor)).status, 200);
  assert.equal(storage.objects.size, 1);
});

test("contents HTTP paginates literal Unicode title and category filters", async (context) => {
  const { createCategory, editor, request, uploadImage } =
    await fixture(context);
  const category = await createCategory("Guides");
  const otherCategory = await createCategory("Miscellaneous");
  const cover = await uploadImage(true);
  const input = {
    ...(await readExampleRequest("create")),
    content_category_id: category.id,
    cover_image_id: cover.id,
  };
  for (let number = 1; number <= contentsPageSize + 1; number++) {
    assert.equal(
      (
        await request("/contents", "POST", editor, {
          ...input,
          title: `ÉDITION 100%_${number}`,
        })
      ).status,
      201,
    );
  }
  assert.equal(
    (
      await request("/contents", "POST", editor, {
        ...input,
        title: "Édition 100XY other",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request("/contents", "POST", editor, {
        ...input,
        title: "Édition 100%_ other category",
        content_category_id: otherCategory.id,
      })
    ).status,
    201,
  );

  const query = new URLSearchParams({
    content_category_id: category.id,
    title: "édition 100%_",
    size: "1",
  });
  const list = async (page: string) => {
    query.set("page", page);
    const response = await request(`/contents?${query}`, "GET", editor);
    assert.equal(response.status, 200);
    return (await response.json()) as ContentsResponse;
  };
  const first = await list("1");
  const second = await list("2");
  assert.equal(first.items.length, contentsPageSize);
  assert.equal(second.items.length, 1);
  assert.equal(first.total, contentsPageSize + 1);
  assert.equal(second.total, first.total);
  assert.equal(
    new Set([...first.items, ...second.items].map(({ id }) => id)).size,
    first.total,
  );
  assert.deepEqual(await list("invalid"), first);
  assert.deepEqual(await list("3"), { items: [], total: first.total });
});
