import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { createCalendarService } from "../../application/calendar.ts";
import type { Actor } from "../../application/models.ts";
import type { CalendarRepository } from "../../application/ports/calendar.ts";
import type { SettingsRepository } from "../../application/ports/settings.ts";
import { createRolesService } from "../../application/roles.ts";
import { createSettingsService } from "../../application/settings.ts";
import * as schema from "../../infrastructure/db/schema.ts";
import { createDrizzleRolesRepository } from "../../infrastructure/persistence/roles.ts";
import { createDrizzleSettingsRepository } from "../../infrastructure/persistence/settings.ts";
import { registerFixtureCleanup } from "../support/fixture-cleanup.ts";

const settingsActor = (
  systemAdmin = false,
  permissions: Actor["permissions"] = ["settings.update"],
): Actor => ({
  account: {
    authEmail: "settings-actor@kernel.local",
    firstName: "Settings",
    id: "settings-actor",
    isSystemAdmin: systemAdmin,
    lastName: "Actor",
    mobile: "09120000001",
    name: "Settings Actor",
    status: "active",
  },
  permissions,
  session: {
    createdAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: new Date("2040-01-01T00:00:00Z"),
    id: "settings-session",
    token: "synthetic-settings-session",
    userId: "settings-actor",
  },
});

test("role creation and name/permission replacement roll back together on a permission write failure", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "kernel-management-"));
  const closers: Array<() => void | Promise<void>> = [];
  registerFixtureCleanup(context, closers, async () => {
    const tempRoot = path.resolve(tmpdir()) + path.sep;
    assert.ok(path.resolve(directory).startsWith(tempRoot));
    assert.ok(path.basename(directory).startsWith("kernel-management-"));
    await rm(directory, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 100,
    });
  });
  const client = createClient({
    url: `file:${path.join(directory, "roles.sqlite").replaceAll("\\", "/")}`,
  });
  closers.push(() => client.close());
  await client.executeMultiple(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      CREATE TABLE role_permissions (
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission TEXT NOT NULL,
        PRIMARY KEY (role_id, permission)
      );
      CREATE TABLE user_roles (
        user_id TEXT NOT NULL,
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
        PRIMARY KEY (user_id, role_id)
      );
      CREATE TRIGGER reject_permission BEFORE INSERT ON role_permissions
      WHEN NEW.permission = 'users.read'
      BEGIN SELECT RAISE(ABORT, 'simulated permission write failure'); END;
    `);
  const repository = createDrizzleRolesRepository(drizzle(client, { schema }));
  const service = createRolesService(repository);
  await assert.rejects(
    service.create({ name: "Failed role", permissions: ["users.read"] }),
  );
  assert.deepEqual(await service.list(), []);

  const role = await service.create({
    name: "Original role",
    permissions: ["calendar.read"],
  });
  await assert.rejects(
    service.update(role.id, {
      name: "Renamed role",
      permissions: ["users.read"],
    }),
  );
  assert.deepEqual(await service.get(role.id), role);

  await assert.rejects(
    service.create({ name: "Original role", permissions: [] }),
    {
      key: "roleNameInUse",
      kind: "invalid",
    },
  );
  await client.execute({
    sql: "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
    args: ["assigned-user", role.id],
  });
  await assert.rejects(service.remove(role.id), {
    key: "roleAssigned",
    kind: "conflict",
  });
  assert.deepEqual(await service.get(role.id), role);
});

test("calendar use cases validate real UTC dates before storage and retain idempotent additions", async () => {
  const dates = new Set<string>();
  const repository: CalendarRepository = {
    add: async (date) => {
      dates.add(date);
    },
    list: async () => [...dates].sort(),
    remove: async (date) => dates.delete(date),
  };
  const service = createCalendarService(repository);
  for (const date of ["2025-02-29", "2026-13-01", "2026-01-32", "2026-1-01"]) {
    await assert.rejects(service.add({ date }), {
      key: "calendarDateFormat",
      kind: "invalid",
    });
  }
  assert.deepEqual(await service.list(), []);
  await service.add({ date: "2028-02-29" });
  await service.add({ date: "2028-02-29" });
  assert.deepEqual(await service.list(), ["2028-02-29"]);
  await service.remove("2028-02-29");
  await assert.rejects(service.remove("2028-02-29"), {
    key: "calendarDateNotFound",
    kind: "not-found",
  });
});

test("settings use cases preserve the configured language and reject invalid colors before saving", async () => {
  let saves = 0;
  const palette = Object.fromEntries(
    [
      "color_bg_base",
      "color_bg_container",
      "color_border",
      "color_link",
      "color_primary",
      "color_text_base",
      "color_text_description",
    ].map((key) => [key, "#123456"]),
  );
  const service = createSettingsService(
    {
      readLanguageCode: async () => "fa",
      read: async () => ({
        languageCode: "fa",
        darkTheme: palette,
        lightTheme: palette,
      }),
      save: async () => {
        saves++;
        return "invalid-logo";
      },
    },
    () => undefined,
  );
  assert.deepEqual(
    service.listLanguages().map(({ code }) => code),
    ["fa", "ar", "tr", "en", "fr", "de", "es", "it", "ru", "pt"],
  );
  const settings = await service.get();
  assert.equal(settings.language.code, "fa");
  assert.equal(settings.language.direction, "rtl");
  await assert.rejects(
    service.update(settingsActor(true), {
      language_code: "fa",
      dark_theme: { ...palette, color_primary: "url(untrusted)" },
      light_theme: palette,
    }),
    { key: "colorInvalid", kind: "invalid" },
  );
  assert.equal(saves, 0);
  await assert.rejects(
    service.update(settingsActor(true), {
      language_code: "unknown",
      dark_theme: palette,
      light_theme: palette,
    }),
    { key: "languageNotFound", kind: "not-found" },
  );
  assert.equal(saves, 0);
  await assert.rejects(
    service.update(settingsActor(true), {
      language_code: "fa",
      dark_theme: palette,
      light_theme: palette,
      dark_logo_id: "private-file",
    }),
    { key: "publicLogoNotFound", kind: "not-found" },
  );
  assert.equal(saves, 1);
});

test("malformed themes do not block language resolution or settings repair", async (context) => {
  const client = createClient({ url: "file::memory:" });
  registerFixtureCleanup(context, [() => client.close()], () => {});
  await client.executeMultiple(`
      CREATE TABLE settings (
        id INTEGER PRIMARY KEY,
        language_code TEXT NOT NULL,
        dark_theme TEXT NOT NULL,
        light_theme TEXT NOT NULL,
        dark_logo_id TEXT,
        light_logo_id TEXT
      );
      INSERT INTO settings (id, language_code, dark_theme, light_theme)
        VALUES (1, 'fa', 'malformed dark theme', 'malformed light theme');
    `);
  const repository = createDrizzleSettingsRepository(
    drizzle(client, { schema }),
  );
  const service = createSettingsService(repository, () => undefined);

  await assert.rejects(service.get(), SyntaxError);
  assert.equal(await service.getLanguageCode(), "fa");

  const palette = Object.fromEntries(
    [
      "color_bg_base",
      "color_bg_container",
      "color_border",
      "color_link",
      "color_primary",
      "color_text_base",
      "color_text_description",
    ].map((key) => [key, "#123456"]),
  );
  const repaired = await service.update(settingsActor(true), {
    language_code: "en",
    dark_theme: palette,
    light_theme: palette,
  });
  assert.equal(repaired.language.code, "en");
  assert.deepEqual(repaired.dark_theme, palette);
  assert.deepEqual(repaired.light_theme, palette);
  assert.equal(await service.getLanguageCode(), "en");

  await client.execute("DELETE FROM settings WHERE id = 1");
  assert.equal(await repository.readLanguageCode(), undefined);
  assert.equal(await service.getLanguageCode(), "en");
});

const settingsPalette = () =>
  Object.fromEntries(
    [
      "color_bg_base",
      "color_bg_container",
      "color_border",
      "color_link",
      "color_primary",
      "color_text_base",
      "color_text_description",
    ].map((key) => [key, "#123456"]),
  );

test("only system administrators can write language while settings editors retain branding access", async () => {
  const palette = settingsPalette();
  let languageCode = "en";
  const writes: Parameters<SettingsRepository["save"]>[0][] = [];
  const service = createSettingsService(
    {
      read: async () => ({
        darkTheme: palette,
        languageCode,
        lightTheme: palette,
      }),
      readLanguageCode: async () => languageCode,
      save: async (input) => {
        writes.push(input);
        if (input.languageCode !== undefined) languageCode = input.languageCode;
        return "saved";
      },
    },
    () => undefined,
  );
  const input = { dark_theme: palette, light_theme: palette };
  await assert.rejects(service.update(settingsActor(false, []), input), {
    key: "permissionDenied",
    kind: "forbidden",
  });
  assert.equal(writes.length, 0);

  await service.update(settingsActor(), input);
  await service.update(settingsActor(), { ...input, language_code: "en" });
  assert.equal(writes.length, 2);
  assert.ok(writes.every((write) => !Object.hasOwn(write, "languageCode")));
  await assert.rejects(
    service.update(settingsActor(), { ...input, language_code: "fa" }),
    { key: "systemAdminRequired", kind: "forbidden" },
  );
  assert.equal(languageCode, "en");
  assert.equal(writes.length, 2);

  await service.update(settingsActor(true, []), {
    ...input,
    language_code: "fa",
  });
  assert.equal(languageCode, "fa");
  assert.equal(writes[2].languageCode, "fa");
  await service.update(settingsActor(true, []), input);
  assert.equal(languageCode, "fa");
  assert.equal(Object.hasOwn(writes[3], "languageCode"), false);
});

test("an ordinary branding save cannot overwrite an interleaved system language change", async (context) => {
  const client = createClient({ url: "file::memory:" });
  registerFixtureCleanup(context, [() => client.close()], () => {});
  await client.executeMultiple(`
      CREATE TABLE settings (
        id INTEGER PRIMARY KEY,
        language_code TEXT NOT NULL,
        dark_theme TEXT NOT NULL,
        light_theme TEXT NOT NULL,
        dark_logo_id TEXT,
        light_logo_id TEXT
      );
    `);
  const palette = settingsPalette();
  await client.execute({
    sql: "INSERT INTO settings (id, language_code, dark_theme, light_theme) VALUES (1, ?, ?, ?)",
    args: ["en", JSON.stringify(palette), JSON.stringify(palette)],
  });
  const repository = createDrizzleSettingsRepository(
    drizzle(client, { schema }),
  );
  const administrator = createSettingsService(repository, () => undefined);
  let switches = 0;
  const editor = createSettingsService(
    {
      ...repository,
      readLanguageCode: async () => {
        const observed = await repository.readLanguageCode();
        await administrator.update(settingsActor(true), {
          dark_theme: palette,
          language_code: "fa",
          light_theme: palette,
        });
        switches++;
        return observed;
      },
    },
    () => undefined,
  );
  const changedPalette = { ...palette, color_primary: "#abcdef" };
  const result = await editor.update(settingsActor(), {
    dark_theme: changedPalette,
    language_code: "en",
    light_theme: palette,
  });
  assert.equal(switches, 1);
  assert.equal(result.language.code, "fa");
  assert.equal(await repository.readLanguageCode(), "fa");
  assert.deepEqual(result.dark_theme, changedPalette);
  const stored = await repository.read();
  assert.equal(stored?.languageCode, "fa");
  assert.deepEqual(stored?.darkTheme, changedPalette);
});
