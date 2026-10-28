import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { permissionGroupDefinitions } from "../src/application/permissions.ts";
import { createRolesService } from "../src/application/roles.ts";
import { createUsersService } from "../src/application/users.ts";
import { supportedLanguages } from "../src/contracts/locales.ts";
import { apiEn } from "../src/infrastructure/localization/catalogs/en.ts";
import { createLogger } from "../src/infrastructure/logging/logger.ts";
import { LocalFileStorage } from "../src/infrastructure/storage/local.ts";
import { createHttpApp } from "../src/presentation/http/app.ts";
import { createAccountRoutes } from "../src/presentation/http/routes/account.ts";
import { createAuthRoutes } from "../src/presentation/http/routes/auth.ts";
import { createCalendarRoutes } from "../src/presentation/http/routes/calendar.ts";
import { createFileRoutes } from "../src/presentation/http/routes/files.ts";
import { createRoleRoutes } from "../src/presentation/http/routes/roles.ts";
import {
  createLanguageRoutes,
  createSettingsRoutes,
} from "../src/presentation/http/routes/settings.ts";
import { createUserRoutes } from "../src/presentation/http/routes/users.ts";

const groups = {
  account: createAccountRoutes,
  auth: createAuthRoutes,
  calendar: createCalendarRoutes,
  files: createFileRoutes,
  languages: createLanguageRoutes,
  roles: createRoleRoutes,
  settings: createSettingsRoutes,
  users: createUserRoutes,
};
const root = path.resolve("collection");

test("calendar deletion does not override the selected environment date", async () => {
  const request = await readFile(
    path.join(root, "calendar/delete/index.bru"),
    "utf8",
  );
  assert.match(
    request,
    /url: \{\{base_url\}\}\/calendar\/\{\{calendar_date\}\}/,
  );
  for (const block of request.matchAll(/vars:[\w-]+\s*\{([^}]*)\}/g))
    assert.doesNotMatch(block[1], /\bcalendar_date\s*:/);
});

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

test("collection operations match the published HTTP routes", async () => {
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
          [
            "base_url",
            "access_token",
            "user_id",
            "role_id",
            "calendar_date",
            "file_id",
          ].includes(value),
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
                "file is required.",
                "dark_theme is required.",
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
        .replace(":date", "{{calendar_date}}")
        .replace(":fileId", "{{file_id}}")
        .replace(/\/$/, ""),
    );
    assert.deepEqual(actual.sort(), expected.sort());
  }
});

test("user response examples agree for each synthetic identity", async () => {
  const read = async (name) =>
    JSON.parse(await readFile(path.join(root, name), "utf8"));
  const created = await read("users/create/201.json");
  const listed = await read("users/list/200.json");
  const details = await read("users/details/200.json");
  const updated = await read("users/update/200.json");
  const account = await read("account/me/200.json");
  assert.ok(!listed.items.some(({ id }) => id === created.id));
  const related = listed.items.find(({ id }) => id === details.id);
  assert.ok(related);
  assert.deepEqual(related, details);
  assert.deepEqual(updated, details);
  for (const [key, value] of Object.entries(account))
    if (key in details) assert.deepEqual(value, details[key], key);
});

test("language, file and settings examples follow published local contracts", async () => {
  const read = async (name) =>
    JSON.parse(await readFile(path.join(root, name), "utf8"));
  assert.deepEqual(await read("languages/list/200.json"), supportedLanguages);
  const uploaded = await read("files/upload/201.json");
  const storage = new LocalFileStorage({
    baseUrl: "http://localhost:3000",
    localStoragePath: "synthetic-not-used",
  });
  assert.equal(
    uploaded.url,
    storage.url("local-public", `${uploaded.id}/logo.svg`, uploaded.visibility),
  );
  const get = await read("settings/get/200.json");
  for (const logo of [get.dark_logo, get.light_logo])
    assert.equal(
      logo.url,
      storage.url("local-public", `${logo.id}/logo.svg`, "public"),
    );
  const request = await readFile(
    path.join(root, "settings/update/index.bru"),
    "utf8",
  );
  const body = JSON.parse(request.match(/body:json \{\s*\n([\s\S]*?)\n\}/)[1]);
  const updated = await read("settings/update/200.json");
  assert.deepEqual(updated.dark_theme, body.dark_theme);
  assert.deepEqual(updated.light_theme, body.light_theme);
  assert.equal(updated.language.code, body.language_code);
  assert.equal(updated.dark_logo, undefined);
  assert.equal(updated.light_logo, undefined);
  const uploadRequest = await readFile(
    path.join(root, "files/upload/index.bru"),
    "utf8",
  );
  assert.match(uploadRequest, /body: multipartForm/);
  assert.match(uploadRequest, /file: @file\(\)/);
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
