import assert from "node:assert/strict";
import { test } from "node:test";

import { authorizeActor } from "./application/authorization.ts";
import { ApplicationError } from "./application/errors.ts";
import { internalEmail } from "./application/identity.ts";
import type { Actor } from "./application/models.ts";
import {
  isPermissionKey,
  permissionGroupDefinitions,
} from "./application/permissions.ts";
import { supportedLanguages } from "./contracts/locales.ts";
import { permissionKeys } from "./contracts/permissions.ts";

const actor = (
  administrator = false,
  permissions: Actor["permissions"] = [],
): Actor => ({
  account: {
    authEmail: "09120000001@kernel.local",
    firstName: "Foundation",
    id: "synthetic-account",
    isSystemAdmin: administrator,
    lastName: "Actor",
    mobile: "09120000001",
    name: "Foundation Actor",
    status: "active",
  },
  permissions,
  session: {
    createdAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: new Date("2027-01-01T00:00:00Z"),
    id: "synthetic-session",
    token: "synthetic-token",
    userId: "synthetic-account",
  },
});

test("granular authorization does not grant administrators an implicit permission bypass", () => {
  assert.doesNotThrow(() => authorizeActor(actor()));
  assert.doesNotThrow(() =>
    authorizeActor(actor(false, ["users.read"]), { permission: "users.read" }),
  );
  assert.throws(
    () => authorizeActor(actor(true), { permission: "users.read" }),
    { key: "permissionDenied", kind: "forbidden" },
  );
});

test("combined administration and permission requirements must both be satisfied", () => {
  const options = { permission: "settings.update", systemAdmin: true } as const;

  assert.throws(
    () => authorizeActor(actor(false, ["settings.update"]), options),
    { key: "systemAdminRequired", kind: "forbidden" },
  );
  assert.throws(() => authorizeActor(actor(), options), {
    key: "systemAdminRequired",
    kind: "forbidden",
  });
  assert.throws(() => authorizeActor(actor(true), options), {
    key: "permissionDenied",
    kind: "forbidden",
  });
  assert.doesNotThrow(() =>
    authorizeActor(actor(true, ["settings.update"]), options),
  );
  assert.doesNotThrow(() => authorizeActor(actor(true), { systemAdmin: true }));
});

test("application errors retain semantic localization arguments without formatting transport text", () => {
  const error = new ApplicationError("invalid", "fieldInvalid", {
    field: "first_name",
    limit: 1_000,
  });

  assert.ok(error instanceof Error);
  assert.equal(error.name, "ApplicationError");
  assert.equal(error.kind, "invalid");
  assert.equal(error.key, "fieldInvalid");
  assert.equal(error.message, "fieldInvalid");
  assert.deepEqual(error.values, { field: "first_name", limit: 1_000 });
  assert.equal(
    new ApplicationError("unauthenticated", "authenticationRequired").values,
    undefined,
  );
});

test("permission groups expose every canonical permission exactly once under its owning feature", () => {
  const names = permissionGroupDefinitions.flatMap((group) =>
    group.permissions.map((permission) => permission.name),
  );

  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(new Set(names), new Set(permissionKeys));
  assert.equal(
    new Set(permissionGroupDefinitions.map((group) => group.name)).size,
    permissionGroupDefinitions.length,
  );
  for (const group of permissionGroupDefinitions) {
    assert.ok(group.permissions.length > 0);
    for (const permission of group.permissions)
      assert.ok(permission.name.startsWith(`${group.name}.`));
  }
});

test("permission validation accepts only canonical string keys", () => {
  for (const key of permissionKeys) assert.equal(isPermissionKey(key), true);
  for (const value of [
    undefined,
    null,
    false,
    0,
    ["users.read"],
    { name: "users.read" },
    "",
    "users.read.extra",
    "users.READ",
    " users.read",
    "settings.delete",
  ])
    assert.equal(isPermissionKey(value), false);
});

test("internal authentication identities are independent and unique", () => {
  const first = internalEmail("09120000001");
  const second = internalEmail("09120000001");
  assert.match(first, /^[0-9a-f-]{36}@kernel\.local$/);
  assert.notEqual(first, second);
});

test("the ten supported locales retain complete direction and calendar metadata", () => {
  assert.deepEqual(
    supportedLanguages.map(({ code }) => code),
    ["fa", "ar", "tr", "en", "fr", "de", "es", "it", "ru", "pt"],
  );
  assert.equal(new Set(supportedLanguages.map(({ code }) => code)).size, 10);
  assert.deepEqual(
    supportedLanguages
      .filter(({ direction }) => direction === "rtl")
      .map(({ code }) => code),
    ["fa", "ar"],
  );
  assert.deepEqual(
    supportedLanguages
      .filter(({ calendar }) => calendar === "jalali")
      .map(({ code }) => code),
    ["fa"],
  );
  for (const language of supportedLanguages) {
    assert.ok(language.name.trim().length > 0);
    assert.ok(language.native_name.trim().length > 0);
    assert.equal(language.name.trim(), language.name);
    assert.equal(language.native_name.trim(), language.native_name);
  }
});
