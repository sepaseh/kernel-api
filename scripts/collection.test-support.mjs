import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createLogger } from "../src/infrastructure/logging/logger.ts";
import { createHttpApp } from "../src/presentation/http/app.ts";
import { enforceAuthAttempt } from "../src/presentation/http/auth-attempts.ts";
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

export const collectionRoot = path.resolve("collection");
export const collectionRoutes = {
  account: createAccountRoutes,
  auth: createAuthRoutes,
  calendar: createCalendarRoutes,
  files: createFileRoutes,
  languages: createLanguageRoutes,
  roles: createRoleRoutes,
  settings: createSettingsRoutes,
  users: createUserRoutes,
};

export const requireCollectionGroups = async (...required) => {
  const inventory = JSON.parse(
    await readFile(
      new URL("../.github/bootstrap-policy.json", import.meta.url),
      "utf8",
    ),
  );
  const declared = inventory.collectionGroups;
  const canonical = Object.keys(collectionRoutes);
  assert.ok(
    Array.isArray(declared) && declared.length > 0,
    "Declare collectionGroups explicitly in the publication inventory.",
  );
  assert.deepEqual(
    declared,
    canonical.filter((group) => declared.includes(group)),
    "Collection groups must be unique, supported and in canonical order.",
  );
  assert.ok(
    required.every((group) => declared.includes(group)),
    "This feature suite requires its complete declared collection groups.",
  );
  if (inventory.phase === "local-runtime")
    assert.deepEqual(declared, canonical);
  assert.ok(
    Array.isArray(inventory.allowedFiles),
    "The publication must declare its exact paths.",
  );
  const collectionPaths = inventory.allowedFiles.filter((file) =>
    file.startsWith("collection/"),
  );
  const common = [
    "collection/README.md",
    "collection/bruno.json",
    "collection/collection.bru",
  ];
  for (const file of common)
    assert.ok(
      collectionPaths.includes(file),
      `Missing common collection path: ${file}`,
    );
  // HTTP tests publish this single response fixture before the files collection.
  const declaredPaths = collectionPaths.filter(
    (file) =>
      !common.includes(file) &&
      !(
        file === "collection/files/upload/415.json" &&
        !declared.includes("files")
      ),
  );
  const published = [
    ...new Set(declaredPaths.map((file) => file.split("/")[1])),
  ].sort();
  assert.deepEqual(
    published,
    [...declared].sort(),
    "Published collection paths must match the declared groups.",
  );
  for (const group of declared) {
    assert.ok(
      declaredPaths.includes(`collection/${group}/folder.bru`),
      `Missing collection folder declaration: ${group}`,
    );
    assert.ok(
      declaredPaths.some(
        (file) =>
          file.startsWith(`collection/${group}/`) &&
          file.endsWith("/index.bru"),
      ),
      `Missing collection operations: ${group}`,
    );
  }
  return declared;
};

export const readCollectionJson = async (name) =>
  JSON.parse(await readFile(path.join(collectionRoot, name), "utf8"));

export const assertAttemptLimitResponses = async (context, cases) => {
  context.mock.method(Date, "now", () => 1_000);
  for (const [operation, method, route, scope, identity, maximum] of cases) {
    const dependencies = {
      logger: createLogger({ level: "silent", pretty: false }, { write() {} }),
      config: { allowedOrigins: [] },
      services: {
        settings: { getLanguageCode: async () => "en" },
        auth: {
          fromRequest: () => ({
            authenticate: async () => ({
              account: { id: "actor", isSystemAdmin: true },
              permissions: ["users.update"],
              session: { id: "synthetic-session" },
            }),
          }),
        },
      },
    };
    const context = { get: () => dependencies, header: () => {} };
    for (let index = 0; index < maximum; index++)
      enforceAuthAttempt(context, scope, identity, maximum);
    const response = await createHttpApp(dependencies).request(route, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identifier: "synthetic-login",
        mobile: "09120000001",
        otp: "123456",
      }),
    });
    assert.equal(response.status, 429, operation);
    assert.equal(response.headers.get("Retry-After"), "900", operation);
    const saved = JSON.parse(
      await readFile(path.join(collectionRoot, operation, "429.json"), "utf8"),
    );
    assert.deepEqual(await response.json(), saved, operation);
  }
};
