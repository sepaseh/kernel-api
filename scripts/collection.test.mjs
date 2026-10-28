import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { permissionGroupDefinitions } from "../src/application/permissions.ts";
import { createRolesService } from "../src/application/roles.ts";
import { createUsersService } from "../src/application/users.ts";
import { apiEn } from "../src/infrastructure/localization/catalogs/en.ts";
import { createLogger } from "../src/infrastructure/logging/logger.ts";
import { createHttpApp } from "../src/presentation/http/app.ts";
import { createAccountRoutes } from "../src/presentation/http/routes/account.ts";
import { createAuthRoutes } from "../src/presentation/http/routes/auth.ts";
import { createRoleRoutes } from "../src/presentation/http/routes/roles.ts";
import { createUserRoutes } from "../src/presentation/http/routes/users.ts";

const groups = {
  account: createAccountRoutes,
  auth: createAuthRoutes,
  roles: createRoleRoutes,
  users: createUserRoutes,
};
const root = path.resolve("collection");

test("collection origin allows cookie-bearing requests through the HTTP guard", async () => {
  const collection = await readFile(path.join(root, "collection.bru"), "utf8");
  const header = collection.match(/^\s*Origin:\s*\{\{(\w+)\}\}\s*$/m);
  assert.equal(header?.[1], "origin");
  const allowedOrigin = "http://localhost:5173";
  const app = createHttpApp({
    logger: createLogger({ level: "silent", pretty: false }, { write() {} }),
    config: { allowedOrigins: [allowedOrigin] },
    services: {
      settings: { getLanguageCode: async () => "en" },
      auth: {
        fromRequest: () => ({
          logout: async () => {},
          responseCookies: () => [],
        }),
      },
    },
  });
  const request = (origin) =>
    app.request("/auth/logout", {
      method: "POST",
      headers: {
        Cookie: "session=synthetic",
        ...(origin ? { Origin: origin } : {}),
      },
    });
  assert.equal((await request()).status, 403);
  assert.equal((await request("https://other.example")).status, 403);
  assert.equal((await request(allowedOrigin)).status, 200);
});

test("collection operations match all published auth, account, user and role routes", async () => {
  for (const [group, createRoutes] of Object.entries(groups)) {
    const directory = path.join(root, group);
    const entries = await readdir(directory, {
      withFileTypes: true,
      recursive: true,
    });
    const operations = entries.filter(
      (entry) => entry.isFile() && entry.name === "index.bru",
    );
    const actual = [];
    for (const operation of operations) {
      const dir = operation.parentPath;
      const request = await readFile(path.join(dir, "index.bru"), "utf8");
      const method = request.match(/^(get|post|patch|put|delete) \{/m)?.[1];
      const route = request.match(/url: \{\{base_url\}\}([^\s]+)/)?.[1];
      assert.ok(method && route, `${dir} has a method and URL`);
      actual.push(`${method.toUpperCase()} ${route}`);
      const variables = [...request.matchAll(/\{\{([\w_]+)\}\}/g)].map(
        (m) => m[1],
      );
      assert.ok(
        variables.every((value) =>
          ["base_url", "access_token", "user_id", "role_id"].includes(value),
        ),
      );
      const jsonBody = request.match(/body:json \{\s*\n([\s\S]*?)\n\}/);
      if (jsonBody) JSON.parse(jsonBody[1]);
      for (const file of await readdir(dir)) {
        if (!file.endsWith(".json")) continue;
        assert.match(file, /^\d{3}\.json$/);
        const example = JSON.parse(
          await readFile(path.join(dir, file), "utf8"),
        );
        if (Number.parseInt(file, 10) >= 400) {
          assert.deepEqual(Object.keys(example), ["message"]);
          assert.ok(
            Object.values(apiEn).includes(example.message) ||
              [
                "first_name is invalid.",
                "first_name is required.",
                "name is required.",
              ].includes(example.message),
            `${group}/${operation.name}/${file} is an English catalog message`,
          );
        }
      }
    }
    const expected = createRoutes().routes.map(({ method, path: route }) =>
      `${method} /${group}${route}`
        .replace(":userId", "{{user_id}}")
        .replace(":roleId", "{{role_id}}")
        .replace(/\/$/, ""),
    );
    assert.deepEqual(actual.sort(), expected.sort());
  }
});

test("bodyless successes and mobile verification are represented accurately", async () => {
  for (const operation of [
    "auth/logout",
    "auth/change-password",
    "auth/forgot-password",
    "account/verify-email",
  ]) {
    assert.ok(
      !(await readdir(path.join(root, operation))).includes("200.json"),
    );
  }
  const profile = await readFile(
    path.join(root, "account/update-profile/index.bru"),
    "utf8",
  );
  const issue = await readFile(
    path.join(root, "account/request-mobile-verification/index.bru"),
    "utf8",
  );
  assert.match(profile, /`mobile`.*`otp`/);
  assert.match(issue, /"mobile"/);
  assert.match(issue, /same session/);
  const changePassword = await readFile(
    path.join(root, "auth/change-password/index.bru"),
    "utf8",
  );
  assert.match(changePassword, /res\.getStatus\(\) === 200/);
  assert.match(changePassword, /bru\.deleteEnvVar\("access_token"\)/);
});

test("management creation and role update examples match the services", async () => {
  const userExample = JSON.parse(
    await readFile(path.join(root, "users/create/201.json"), "utf8"),
  );
  const userRequest = await readFile(
    path.join(root, "users/create/index.bru"),
    "utf8",
  );
  const userBody = JSON.parse(
    userRequest.match(/body:json \{\s*\n([\s\S]*?)\n\}/)[1],
  );
  const loginRequest = await readFile(
    path.join(root, "auth/login/index.bru"),
    "utf8",
  );
  const loginBody = JSON.parse(
    loginRequest.match(/body:json \{\s*\n([\s\S]*?)\n\}/)[1],
  );
  assert.notEqual(userBody.mobile, loginBody.identifier);
  const users = createUsersService({
    provider: { signUp: async () => ({ userId: userExample.id }) },
    repository: {
      deleteSessions: async () => {},
      find: async () => ({
        id: userExample.id,
        firstName: userBody.first_name,
        lastName: userBody.last_name,
        mobile: userBody.mobile,
        isSystemAdmin: false,
        status: "active",
      }),
    },
  });
  assert.deepEqual(await users.create(userBody), userExample);

  const roleExample = JSON.parse(
    await readFile(path.join(root, "roles/update/200.json"), "utf8"),
  );
  const roleRequest = await readFile(
    path.join(root, "roles/update/index.bru"),
    "utf8",
  );
  const roleBody = JSON.parse(
    roleRequest.match(/body:json \{\s*\n([\s\S]*?)\n\}/)[1],
  );
  const roles = createRolesService({
    find: async () => roleExample,
    update: async (id, changes) => ({ id, ...changes }),
  });
  assert.deepEqual(await roles.update(roleExample.id, roleBody), roleExample);
});

test("permission examples use the published English permission catalog", async () => {
  const example = JSON.parse(
    await readFile(path.join(root, "roles/permissions/list/200.json"), "utf8"),
  );
  const expected = permissionGroupDefinitions.map(
    ({ name, permissions, titleKey }) => ({
      name,
      permissions: permissions.map(({ name, titleKey }) => ({
        name,
        title: apiEn[titleKey],
      })),
      title: apiEn[titleKey],
    }),
  );
  assert.deepEqual(example, expected);
});
