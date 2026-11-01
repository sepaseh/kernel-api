import assert from "node:assert/strict";
import { test } from "node:test";

import { supportedLanguages } from "../contracts/locales.ts";
import { createCalendarService } from "./calendar.ts";
import type { Actor } from "./models.ts";
import type { CalendarRepository } from "./ports/calendar.ts";
import type { RoleRecord, RolesRepository } from "./ports/roles.ts";
import type { SettingsRepository } from "./ports/settings.ts";
import { createRolesService } from "./roles.ts";
import { createSettingsService } from "./settings.ts";

const unused = async (): Promise<never> => {
  throw new Error("Unexpected adapter operation");
};

const role: RoleRecord = {
  id: "role-1",
  name: "Synthetic readers",
  permissions: ["users.read"],
};

const rolesFixture = (): RolesRepository => ({
  create: unused,
  deleteIfUnassigned: unused,
  find: async () => role,
  list: async () => [role],
  update: unused,
});

test("role writes reject invalid permissions without effects and deduplicate valid keys", async () => {
  const repository = rolesFixture();
  const writes: RoleRecord[] = [];
  repository.create = async (input) => {
    writes.push(input);
    return input;
  };
  const service = createRolesService(repository);

  for (const permissions of [undefined, "users.read", ["unknown"], [1], {}]) {
    await assert.rejects(service.create({ name: "Readers", permissions }), {
      key: "permissionsInvalid",
      kind: "invalid",
    });
  }
  await assert.rejects(service.create({ name: " ", permissions: [] }), {
    key: "fieldRequired",
  });
  assert.deepEqual(writes, []);
  const created = await service.create({
    name: "  Readers  ",
    permissions: ["users.read", "roles.read", "users.read"],
  });
  assert.match(created.id, /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i);
  assert.equal(created.name, "Readers");
  assert.deepEqual(created.permissions, ["users.read", "roles.read"]);
  assert.deepEqual(await service.list(), [role]);
  assert.equal(await service.get(role.id), role);
});

test("role update handles a missing initial read and disappearance during the write", async () => {
  const repository = rolesFixture();
  repository.find = async () => undefined;
  const service = createRolesService(repository);

  await assert.rejects(service.get("missing"), {
    key: "roleNotFound",
    kind: "not-found",
  });
  await assert.rejects(
    service.update("missing", { name: "New", permissions: [] }),
    {
      key: "roleNotFound",
    },
  );
  repository.find = async () => role;
  repository.update = async () => undefined;
  await assert.rejects(
    service.update(role.id, { name: "New", permissions: [] }),
    {
      key: "roleNotFound",
    },
  );
  repository.update = async (id, input) => ({ id, ...input });
  assert.deepEqual(
    await service.update(role.id, { name: " New ", permissions: [] }),
    {
      id: role.id,
      name: "New",
      permissions: [],
    },
  );
});

test("role deletion preserves an assigned role and maps missing, success and adapter failure", async () => {
  const repository = rolesFixture();
  const state = new Map([[role.id, role]]);
  let assigned = true;
  repository.deleteIfUnassigned = async (id) => {
    if (!state.has(id)) return "missing";
    if (assigned) return "assigned";
    state.delete(id);
    return "deleted";
  };
  const service = createRolesService(repository);

  await assert.rejects(service.remove(role.id), {
    key: "roleAssigned",
    kind: "conflict",
  });
  assert.equal(state.get(role.id), role);
  await assert.rejects(service.remove("missing"), {
    key: "roleNotFound",
    kind: "not-found",
  });
  assigned = false;
  await service.remove(role.id);
  assert.equal(state.has(role.id), false);
  const failure = new Error("Synthetic persistence failure");
  repository.deleteIfUnassigned = async () => {
    throw failure;
  };
  await assert.rejects(service.remove(role.id), (error) => error === failure);
});

test("calendar accepts actual ISO dates and rejects malformed or rolled-over dates before writes", async () => {
  const dates = new Set<string>();
  const repository: CalendarRepository = {
    add: async (date) => {
      dates.add(date);
    },
    list: async () => [...dates],
    remove: async (date) => dates.delete(date),
  };
  const service = createCalendarService(repository);

  for (const date of [
    "2026-02-29",
    "2024-02-30",
    "2026-13-01",
    "01-01-2026",
    "2026-1-01",
  ]) {
    await assert.rejects(service.add({ date }), {
      key: "calendarDateFormat",
      kind: "invalid",
    });
  }
  assert.deepEqual([...dates], []);
  await service.add({ date: " 2024-02-29 " });
  assert.deepEqual(await service.list(), ["2024-02-29"]);
  await service.remove("2024-02-29");
  assert.deepEqual(await service.list(), []);
  await assert.rejects(service.remove("2024-02-29"), {
    key: "calendarDateNotFound",
    kind: "not-found",
  });
});

const palette = {
  color_bg_base: "#000000",
  color_bg_container: "#111111",
  color_border: "#222222",
  color_link: "#333333",
  color_primary: "#444444",
  color_text_base: "#FFFFFF",
  color_text_description: "#AAAAAA",
};

const actor: Actor = {
  account: {
    authEmail: "09120000001@kernel.local",
    firstName: "Synthetic",
    id: "account-1",
    isSystemAdmin: false,
    lastName: "User",
    mobile: "09120000001",
    name: "Synthetic User",
    status: "active",
  },
  permissions: ["settings.update"],
  session: {
    createdAt: new Date("2026-01-01"),
    expiresAt: new Date("2099-01-01"),
    id: "session-1",
    token: "synthetic-token",
    userId: "account-1",
  },
};
const admin: Actor = {
  ...actor,
  account: { ...actor.account, isSystemAdmin: true },
  permissions: [],
};
const branding = { dark_theme: palette, light_theme: palette };

const settingsFixture = () => {
  const state = {
    darkTheme: palette,
    languageCode: "fa",
    lightTheme: palette,
  };
  const writes: Array<Parameters<SettingsRepository["save"]>[0]> = [];
  const repository: SettingsRepository = {
    read: async () => state,
    readLanguageCode: async () => state.languageCode,
    save: async (input) => {
      writes.push(input);
      Object.assign(state, input);
      return "saved";
    },
  };
  const service = createSettingsService(repository, (file) =>
    file.visibility === "public"
      ? `https://files.example.com/${file.id}`
      : undefined,
  );
  return { repository, service, state, writes };
};

test("settings expose canonical language metadata and only resolvable public logos", async () => {
  const { repository, service } = settingsFixture();
  repository.read = async () => ({
    darkLogo: {
      bucket: "logos",
      id: "private",
      objectKey: "private.svg",
      visibility: "private",
    },
    darkTheme: palette,
    languageCode: "fa",
    lightLogo: {
      bucket: "logos",
      id: "public",
      objectKey: "public.svg",
      visibility: "public",
    },
    lightTheme: palette,
  });

  const result = await service.get();
  assert.equal(service.listLanguages(), supportedLanguages);
  assert.equal(result.language, supportedLanguages[0]);
  assert.equal("dark_logo" in result, false);
  assert.deepEqual(result.light_logo, {
    id: "public",
    url: "https://files.example.com/public",
  });
  assert.equal(await service.getLanguageCode(), "fa");
  repository.readLanguageCode = async () => undefined;
  assert.equal(await service.getLanguageCode(), "en");
});

test("settings distinguish missing initialization and invalid persisted language", async () => {
  const { repository, service, state } = settingsFixture();
  repository.read = async () => undefined;
  await assert.rejects(service.get(), {
    key: "settingsNotInitialized",
    kind: "internal",
  });
  repository.read = async () => ({ ...state, languageCode: "unknown" });
  await assert.rejects(service.get(), {
    key: "languageInvalid",
    kind: "internal",
  });
});

test("only system administrators can select a different active language", async () => {
  const { service, state, writes } = settingsFixture();

  await assert.rejects(
    service.update({ ...actor, permissions: [] }, branding),
    {
      key: "permissionDenied",
      kind: "forbidden",
    },
  );
  await assert.rejects(
    service.update(actor, { ...branding, language_code: "en" }),
    {
      key: "systemAdminRequired",
      kind: "forbidden",
    },
  );
  await assert.rejects(
    service.update(admin, { ...branding, language_code: "unknown" }),
    {
      key: "languageNotFound",
      kind: "not-found",
    },
  );
  assert.equal(writes.length, 0);
  const result = await service.update(admin, {
    ...branding,
    language_code: "en",
  });
  assert.equal(state.languageCode, "en");
  assert.equal(result.language.code, "en");
  assert.equal(writes[0].languageCode, "en");
});

test("ordinary branding saves omit language writes even after concurrent selection", async () => {
  const { repository, service, state, writes } = settingsFixture();
  repository.readLanguageCode = async () => {
    state.languageCode = "en";
    return "fa";
  };

  await service.update(actor, { ...branding, language_code: "fa" });
  await service.update(actor, branding);
  assert.equal(state.languageCode, "en");
  assert.equal(writes.length, 2);
  assert.equal(
    writes.every((write) => !Object.hasOwn(write, "languageCode")),
    true,
  );
});

test("settings validate complete palettes before persistence and discard unknown palette keys", async () => {
  const { service, writes } = settingsFixture();

  for (const dark_theme of [
    undefined,
    null,
    [],
    {},
    { ...palette, color_primary: "red" },
    { ...palette, color_link: "#123" },
  ]) {
    await assert.rejects(service.update(admin, { ...branding, dark_theme }));
  }
  assert.deepEqual(writes, []);
  await service.update(admin, {
    dark_logo_id: "dark-logo",
    dark_theme: { ...palette, extra: "discarded" },
    light_logo_id: "light-logo",
    light_theme: palette,
  });
  assert.deepEqual(writes[0], {
    darkLogoId: "dark-logo",
    darkTheme: palette,
    lightLogoId: "light-logo",
    lightTheme: palette,
  });
});

test("settings preserve semantic save failures and unrelated adapter errors", async () => {
  const { repository, service } = settingsFixture();
  repository.save = async () => "missing";
  await assert.rejects(service.update(admin, branding), {
    key: "settingsNotInitialized",
    kind: "internal",
  });
  repository.save = async () => "invalid-logo";
  await assert.rejects(service.update(admin, branding), {
    key: "publicLogoNotFound",
    kind: "not-found",
  });
  const failure = new Error("Synthetic persistence outage");
  repository.save = async () => {
    throw failure;
  };
  await assert.rejects(
    service.update(admin, branding),
    (error) => error === failure,
  );
});
