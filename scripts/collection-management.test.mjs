import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { before, test } from "node:test";

import { permissionGroupDefinitions } from "../src/application/permissions.ts";
import { createRolesService } from "../src/application/roles.ts";
import { supportedLanguages } from "../src/contracts/locales.ts";
import { en } from "../src/infrastructure/localization/catalogs/en.ts";
import { LocalFileStorage } from "../src/infrastructure/storage/local.ts";
import {
  collectionRoot as root,
  readCollectionJson as read,
  requireCollectionGroups,
} from "./collection.test-support.mjs";

before(() =>
  requireCollectionGroups("calendar", "languages", "roles", "settings"),
);

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

test("language and settings examples follow published local contracts", async () => {
  assert.deepEqual(await read("languages/list/200.json"), supportedLanguages);
  const storage = new LocalFileStorage({
    baseUrl: "http://localhost:3000",
    localStoragePath: "synthetic-not-used",
  });
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
});

test("role update examples match the services", async () => {
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
        title: en[titleKey],
      })),
      title: en[titleKey],
    }),
  );
  assert.deepEqual(example, expected);
});
