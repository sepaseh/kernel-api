import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { eq } from "drizzle-orm";

import type { PermissionKey } from "./contracts/permissions.ts";
import { createAuth } from "./infrastructure/auth/better-auth.ts";
import { loadConfig } from "./infrastructure/config.ts";
import { createDatabase } from "./infrastructure/db/client.ts";
import { initializeDatabase } from "./infrastructure/db/initialize.ts";
import {
  account,
  files,
  rolePermissions,
  roles,
  session,
  settings,
  user,
  userRoles,
} from "./infrastructure/db/schema.ts";
import { createLogger } from "./infrastructure/logging/logger.ts";
import { createApp } from "./test/create-app-fixture.ts";
import { MemoryObjectStorage } from "./test/memory-object-storage.ts";

type Identity = { id: string; token: string };

let app: ReturnType<typeof createApp>;
let auth: ReturnType<typeof createAuth>;
let client: ReturnType<typeof createDatabase>["client"];
let database: ReturnType<typeof createDatabase>["database"];
let storage: MemoryObjectStorage;
let administrator: Identity;
let target: Identity;

const password = "synthetic-deletion-test-password";
const targetMobile = "09120000002";
const userInUseMessages = {
  en: "This user is in use. Resolve the related records before deleting the user.",
  fa: "این کاربر در حال استفاده است. ابتدا تکلیف موارد وابسته را مشخص کنید و سپس آن را حذف کنید.",
};

const request = (
  endpoint: string,
  method: string,
  body?: Record<string, unknown>,
  token?: string,
) =>
  app.request(`http://localhost${endpoint}`, {
    ...(body && { body: JSON.stringify(body) }),
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    method,
  });

const createIdentity = async (mobile: string): Promise<Identity> => {
  const created = await auth.api.signUpEmail({
    body: {
      email: `${mobile}@kernel.test`,
      firstName: "Synthetic",
      lastName: mobile,
      mobile,
      name: `Synthetic ${mobile}`,
      password,
    },
  });
  const login = await request("/auth/login", "POST", {
    identifier: mobile,
    password,
  });
  assert.equal(login.status, 200);
  return {
    id: created.user.id,
    token: ((await login.json()) as { access_token: string }).access_token,
  };
};

const createRole = async (name: string, permissions: PermissionKey[] = []) => {
  const response = await request(
    "/roles",
    "POST",
    { name, permissions },
    administrator.token,
  );
  assert.equal(response.status, 201);
  return ((await response.json()) as { id: string }).id;
};

const assignRoles = async (identity: Identity, roleIds: string[]) => {
  const response = await request(
    `/users/${identity.id}/roles`,
    "PUT",
    { role_ids: roleIds },
    administrator.token,
  );
  assert.equal(response.status, 200);
};

const uploadPrivateFile = async (identity: Identity) => {
  const body = new FormData();
  body.set(
    "file",
    new File(["synthetic retained upload"], "retained.txt", {
      type: "text/plain",
    }),
  );
  body.set("visibility", "private");
  const response = await app.request("http://localhost/files", {
    body,
    headers: { Authorization: `Bearer ${identity.token}` },
    method: "POST",
  });
  assert.equal(response.status, 201);
};

const readState = async (id: Identity["id"]) => {
  const [
    profile,
    accounts,
    sessions,
    memberships,
    uploads,
    roleRecords,
    grants,
  ] = await Promise.all([
    database.select().from(user).where(eq(user.id, id)),
    database
      .select()
      .from(account)
      .where(eq(account.userId, id))
      .orderBy(account.id),
    database
      .select()
      .from(session)
      .where(eq(session.userId, id))
      .orderBy(session.id),
    database
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, id))
      .orderBy(userRoles.roleId),
    database
      .select()
      .from(files)
      .where(eq(files.createdBy, id))
      .orderBy(files.id),
    database.select().from(roles).orderBy(roles.id),
    database
      .select()
      .from(rolePermissions)
      .orderBy(rolePermissions.roleId, rolePermissions.permission),
  ]);
  return {
    accounts,
    grants,
    memberships,
    objects: Array.from(storage.objects, ([key, contents]) => ({
      contents: [...contents],
      key,
    })),
    profile,
    roleRecords,
    sessions,
    uploads,
  };
};

beforeEach(async () => {
  const config = loadConfig({
    BETTER_AUTH_SECRET: "synthetic-secret-with-at-least-thirty-two-characters",
    BETTER_AUTH_URL: "http://localhost",
    DATABASE_URL: "file::memory:",
  });
  ({ client, database } = createDatabase(config));
  const logger = createLogger(config.logging, { write() {} });
  auth = createAuth(config, database, logger);
  await initializeDatabase(config, database, auth);
  storage = new MemoryObjectStorage();
  app = createApp({ auth, config, database, logger, storage });
  administrator = await createIdentity("09120000001");
  await database
    .update(user)
    .set({ isSystemAdmin: true })
    .where(eq(user.id, administrator.id));
  target = await createIdentity(targetMobile);
});

afterEach(async () => {
  await client.close();
});

for (const language of ["en", "fa"] as const) {
  for (const dependency of ["uploaded file", "role membership"] as const) {
    test(`rejects deleting a user with a ${dependency} in ${language} without changing related state`, async () => {
      if (dependency === "uploaded file") await uploadPrivateFile(target);
      else {
        const roleId = await createRole("Retained assignment", [
          "calendar.read",
        ]);
        await assignRoles(target, [roleId]);
      }
      await database
        .update(settings)
        .set({ languageCode: language })
        .where(eq(settings.id, 1));
      const before = await readState(target.id);
      assert.equal(before.profile.length, 1);
      assert.equal(before.accounts.length, 1);
      assert.ok(before.sessions.length > 0);
      assert.equal(
        before.uploads.length,
        dependency === "uploaded file" ? 1 : 0,
      );
      assert.equal(
        before.memberships.length,
        dependency === "role membership" ? 1 : 0,
      );

      const response = await request(
        `/users/${target.id}`,
        "DELETE",
        undefined,
        administrator.token,
      );

      assert.equal(response.status, 409);
      assert.equal(response.headers.get("content-language"), language);
      assert.deepEqual(await response.json(), {
        message: userInUseMessages[language],
      });
      assert.deepEqual(await readState(target.id), before);
      assert.equal(
        (await request("/account/me", "GET", undefined, target.token)).status,
        200,
      );
    });
  }
}

test("physically deletes an unused user and owned credentials/sessions after explicit role clearing", async () => {
  const deleter = await createIdentity("09120000003");
  const deletionRoleId = await createRole("Delete users", ["users.delete"]);
  await assignRoles(deleter, [deletionRoleId]);
  const targetRoleId = await createRole("Target assignment", ["calendar.read"]);
  await assignRoles(target, [targetRoleId]);
  const extraLogin = await request("/auth/login", "POST", {
    identifier: targetMobile,
    password,
  });
  assert.equal(extraLogin.status, 200);
  const extraToken = ((await extraLogin.json()) as { access_token: string })
    .access_token;

  const conflict = await request(
    `/users/${target.id}`,
    "DELETE",
    undefined,
    deleter.token,
  );
  assert.equal(conflict.status, 409);
  await assignRoles(target, []);
  const before = await readState(target.id);
  assert.equal(before.profile.length, 1);
  assert.equal(before.accounts.length, 1);
  assert.ok(before.sessions.length >= 2);
  assert.deepEqual(before.memberships, []);
  assert.deepEqual(before.uploads, []);

  const deleted = await request(
    `/users/${target.id}`,
    "DELETE",
    undefined,
    deleter.token,
  );

  assert.equal(deleted.status, 200);
  assert.equal(await deleted.text(), "");
  const after = await readState(target.id);
  assert.deepEqual(after, {
    ...before,
    accounts: [],
    profile: [],
    sessions: [],
  });
  for (const token of [target.token, extraToken])
    assert.equal(
      (await request("/account/me", "GET", undefined, token)).status,
      401,
    );
  const login = await request("/auth/login", "POST", {
    identifier: targetMobile,
    password,
  });
  assert.equal(login.status, 400);
  assert.deepEqual(await login.json(), { message: "Invalid credentials." });
  assert.equal(
    (
      await request(
        `/roles/${targetRoleId}`,
        "GET",
        undefined,
        administrator.token,
      )
    ).status,
    200,
  );
});

test("checks authentication and delete permission before revealing dependency or missing-user state", async () => {
  await assignRoles(target, [await createRole("No delete permission")]);
  const before = await readState(target.id);

  for (const id of [target.id, "missing-user"]) {
    const anonymous = await request(`/users/${id}`, "DELETE");
    assert.equal(anonymous.status, 401);
    assert.deepEqual(await anonymous.json(), {
      message: "Authentication required.",
    });
    const forbidden = await request(
      `/users/${id}`,
      "DELETE",
      undefined,
      target.token,
    );
    assert.equal(forbidden.status, 403);
    assert.deepEqual(await forbidden.json(), { message: "Permission denied." });
  }

  assert.deepEqual(await readState(target.id), before);
});

test("keeps self-deletion protection ahead of the dependency conflict", async () => {
  await assignRoles(administrator, [
    await createRole("Administrator assignment"),
  ]);
  await uploadPrivateFile(administrator);
  const before = await readState(administrator.id);

  const response = await request(
    `/users/${administrator.id}`,
    "DELETE",
    undefined,
    administrator.token,
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    message: "The current user cannot delete itself.",
  });
  assert.deepEqual(await readState(administrator.id), before);
});

test("keeps final-administrator protection ahead of the dependency conflict for a permitted actor", async () => {
  const deleter = await createIdentity("09120000003");
  await assignRoles(deleter, [
    await createRole("Delete users", ["users.delete"]),
  ]);
  await assignRoles(administrator, [
    await createRole("Administrator assignment"),
  ]);
  const before = await readState(administrator.id);

  const response = await request(
    `/users/${administrator.id}`,
    "DELETE",
    undefined,
    deleter.token,
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    message: "The final system administrator cannot be deleted.",
  });
  assert.deepEqual(await readState(administrator.id), before);
});
