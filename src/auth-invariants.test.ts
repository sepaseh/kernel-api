import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";

import { and, eq } from "drizzle-orm";

import { createApp } from "./composition.ts";
import type { PublicSettingsResponse } from "./contracts/settings.ts";
import { createAuth } from "./infrastructure/auth/better-auth.ts";
import { loadConfig, repositoryRoot } from "./infrastructure/config.ts";
import { createDatabase } from "./infrastructure/db/client.ts";
import { initializeDatabase } from "./infrastructure/db/initialize.ts";
import { session, settings, user } from "./infrastructure/db/schema.ts";
import { createLogger } from "./infrastructure/logging/logger.ts";
import { MemoryObjectStorage } from "./test/memory-object-storage.ts";

let app: ReturnType<typeof createApp>;
let client: ReturnType<typeof createDatabase>["client"] | undefined;
let database: ReturnType<typeof createDatabase>["database"];
let administratorId: string;
let administratorToken: string;
let targetId: string;

const originalPassword = "original-test-password";
// Synthetic fixture matching the admin's 16-character lowercase/digit shape.
const temporaryPasswordFixture = "a1b2c3d4e5f6g7h8";
const targetMobile = "09120000002";

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

beforeEach(async () => {
  client = undefined;
  const config = loadConfig({
    BETTER_AUTH_SECRET: "synthetic-secret-with-at-least-thirty-two-characters",
    BETTER_AUTH_URL: "http://localhost",
    DATABASE_URL: "file::memory:",
    NODE_ENV: "test",
    OTP_FIXED_CODE: "123456",
  });
  ({ client, database } = createDatabase(config));
  const logger = createLogger(config.logging, { write() {} });
  const auth = createAuth(config, database, logger);
  await initializeDatabase(config, database, auth);
  app = createApp({
    auth,
    config,
    database,
    logger,
    storage: new MemoryObjectStorage(),
  });
  const administrator = await auth.api.signUpEmail({
    body: {
      email: "administrator@kernel.local",
      firstName: "Test",
      lastName: "Administrator",
      mobile: "09120000001",
      name: "Test Administrator",
      password: originalPassword,
    },
  });
  administratorId = administrator.user.id;
  await database
    .update(user)
    .set({ isSystemAdmin: true })
    .where(eq(user.id, administratorId));
  const login = await request("/auth/login", "POST", {
    identifier: "09120000001",
    password: originalPassword,
  });
  assert.equal(login.status, 200);
  administratorToken = ((await login.json()) as { access_token: string })
    .access_token;
  const target = await auth.api.signUpEmail({
    body: {
      email: "target@kernel.local",
      firstName: "Test",
      lastName: "Target",
      mobile: targetMobile,
      name: "Test Target",
      password: originalPassword,
    },
  });
  targetId = target.user.id;
});

afterEach(async (context) => {
  if (!client) return;
  try {
    await client.close();
  } catch (error) {
    context.diagnostic(inspect(error, { depth: 4 }));
    throw error;
  } finally {
    client = undefined;
  }
});

const removals = [
  { body: undefined, method: "DELETE", name: "deletion", suffix: "" },
  {
    body: { status: "inactive" },
    method: "PATCH",
    name: "deactivation",
    suffix: "/status",
  },
  {
    body: { is_system_admin: false },
    method: "PATCH",
    name: "demotion",
    suffix: "/system-admin",
  },
] as const;

test("accepts a generated-shaped temporary password when creating a user", async () => {
  const password = temporaryPasswordFixture;
  assert.match(password, /^[a-z0-9]{16}$/);
  const response = await request(
    "/users",
    "POST",
    {
      first_name: "Test",
      last_name: "Generated",
      mobile: "09120000003",
      password,
    },
    administratorToken,
  );
  assert.equal(response.status, 201);
  const login = await request("/auth/login", "POST", {
    identifier: "09120000003",
    password,
  });
  assert.equal(login.status, 200);
});

test("accepts a generated-shaped temporary password in an administrator reset", async () => {
  const password = temporaryPasswordFixture;
  assert.match(password, /^[a-z0-9]{16}$/);
  const response = await request(
    `/users/${targetId}/password`,
    "PUT",
    { password },
    administratorToken,
  );
  assert.equal(response.status, 200);
  const login = await request("/auth/login", "POST", {
    identifier: targetMobile,
    password,
  });
  assert.equal(login.status, 200);
});

for (const removal of removals) {
  for (const transition of ["activation", "promotion"] as const) {
    test(`protects the final administrator from ${removal.name} after concurrent ${transition}`, async (context) => {
      if (transition === "activation") {
        await database
          .update(user)
          .set({ isSystemAdmin: true, status: "inactive" })
          .where(eq(user.id, targetId));
      }

      // Complete another administrator's requests after the pending request's
      // initial reads, but before its write transaction acquires the lock.
      const transaction = database.transaction.bind(database);
      const intercepted = context.mock.method(
        database,
        "transaction",
        async (...args: Parameters<typeof transaction>) => {
          intercepted.mock.restore();
          const promote = await request(
            `/users/${targetId}${transition === "activation" ? "/status" : "/system-admin"}`,
            "PATCH",
            transition === "activation"
              ? { status: "active" }
              : { is_system_admin: true },
            administratorToken,
          );
          assert.equal(promote.status, 200);
          const demote = await request(
            `/users/${administratorId}/system-admin`,
            "PATCH",
            { is_system_admin: false },
            administratorToken,
          );
          assert.equal(demote.status, 200);
          return transaction(...args);
        },
      );

      const response = await request(
        `/users/${targetId}${removal.suffix}`,
        removal.method,
        removal.body,
        administratorToken,
      );
      assert.equal(response.status, 409);
      const remaining = await database
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.isSystemAdmin, true), eq(user.status, "active")));
      assert.deepEqual(remaining, [{ id: targetId }]);
    });
  }

  test(`allows ${removal.name} when another active administrator remains`, async () => {
    await database
      .update(user)
      .set({ isSystemAdmin: true })
      .where(eq(user.id, targetId));
    const response = await request(
      `/users/${targetId}${removal.suffix}`,
      removal.method,
      removal.body,
      administratorToken,
    );
    assert.equal(response.status, 200);
    const remaining = await database
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.isSystemAdmin, true), eq(user.status, "active")));
    assert.deepEqual(remaining, [{ id: administratorId }]);
  });
}

test("anchors legacy relative data paths to the repository without accessing data", () => {
  const config = loadConfig({
    BETTER_AUTH_SECRET: "synthetic-config-secret",
    DATABASE_URL: "file:server/data/kernel.sqlite",
  });
  assert.equal(
    fileURLToPath(config.databaseUrl),
    path.join(repositoryRoot, "server", "data", "kernel.sqlite"),
  );
  assert.equal(
    config.localStoragePath,
    path.join(repositoryRoot, "server", "data", "uploads"),
  );
  assert.ok(config.allowedOrigins.includes("http://localhost:3001"));
  assert.ok(config.allowedOrigins.includes("http://localhost:5173"));
  assert.throws(() =>
    loadConfig({
      BETTER_AUTH_SECRET: "synthetic-config-secret",
      SERVER_ALLOWED_ORIGINS: "https://example.test/path",
    }),
  );
});

test("rejects untrusted mutation origins and cookie mutations without an origin", async () => {
  const untrustedHeaders: Record<string, string>[] = [
    { Origin: "https://untrusted.test" },
    { Cookie: "synthetic-cookie=value" },
  ];
  for (const headers of untrustedHeaders) {
    const response = await app.request("http://localhost/auth/login", {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Accept-Language": "en",
      },
      body: JSON.stringify({
        identifier: "09120000001",
        password: originalPassword,
      }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      message: "This request origin is not allowed.",
    });
  }
  for (const origin of ["http://localhost:5173", "http://localhost:3001"]) {
    const response = await app.request("http://localhost/auth/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: "09120000001",
        password: originalPassword,
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
  }
});

test("uses only persisted language despite visitor headers and locale cookies", async () => {
  const visitorHeaders = {
    "Accept-Language": "fa-IR,fa;q=0.9",
    Cookie: "NEXT_LOCALE=fa; language=fa",
  };
  const english = await app.request(
    "/missing?language=fa&locale=fa&language_code=fa",
    { headers: visitorHeaders },
  );
  assert.deepEqual(await english.json(), {
    message: "The requested endpoint does not exist.",
  });
  assert.equal(english.headers.get("content-language"), "en");
  assert.doesNotMatch(english.headers.get("vary") ?? "", /Accept-Language/i);

  await database
    .update(settings)
    .set({ languageCode: "fa" })
    .where(eq(settings.id, 1));
  const overrides: Record<string, string>[] = [
    {
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: "NEXT_LOCALE=en; language=en",
    },
    {},
  ];
  for (const headers of overrides) {
    const response = await app.request(
      "/missing?language=en&locale=en&language_code=en",
      { headers },
    );
    assert.deepEqual(await response.json(), {
      message: "مسیر درخواستی وجود ندارد.",
    });
    assert.equal(response.headers.get("content-language"), "fa");
    assert.doesNotMatch(response.headers.get("vary") ?? "", /Accept-Language/i);
  }
});

test("settings editors can save branding but only a system administrator can change language", async () => {
  const initial = (await (
    await app.request("/settings")
  ).json()) as PublicSettingsResponse;
  const login = await request("/auth/login", "POST", {
    identifier: targetMobile,
    password: originalPassword,
  });
  assert.equal(login.status, 200);
  const editorToken = ((await login.json()) as { access_token: string })
    .access_token;
  const initialInput = {
    dark_theme: initial.dark_theme,
    light_theme: initial.light_theme,
  };
  assert.equal(
    (await request("/settings", "PUT", initialInput, editorToken)).status,
    403,
  );

  const roleResponse = await request(
    "/roles",
    "POST",
    {
      name: "Settings editor",
      permissions: ["settings.update"],
    },
    administratorToken,
  );
  assert.equal(roleResponse.status, 201);
  const roleId = ((await roleResponse.json()) as { id: string }).id;
  assert.equal(
    (
      await request(
        `/users/${targetId}/roles`,
        "PUT",
        { role_ids: [roleId] },
        administratorToken,
      )
    ).status,
    200,
  );
  const account = await request("/account/me", "GET", undefined, editorToken);
  const identity = (await account.json()) as {
    is_system_admin: boolean;
    permissions: string[];
  };
  assert.equal(identity.is_system_admin, false);
  assert.ok(identity.permissions.includes("settings.update"));

  const upload = new FormData();
  upload.set(
    "file",
    new File(["synthetic logo"], "logo.png", { type: "image/png" }),
  );
  upload.set("visibility", "public");
  const uploaded = await app.request("http://localhost/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${editorToken}` },
    body: upload,
  });
  assert.equal(uploaded.status, 201);
  const logoId = ((await uploaded.json()) as { id: string }).id;
  const branding = {
    ...initialInput,
    dark_logo_id: logoId,
    dark_theme: {
      ...(initial.dark_theme as Record<string, string>),
      color_primary: "#123456",
    },
  };
  const omitted = await request("/settings", "PUT", branding, editorToken);
  assert.equal(omitted.status, 200);
  const saved = (await omitted.json()) as PublicSettingsResponse;
  assert.equal(saved.language.code, "en");
  assert.equal(saved.dark_logo?.id, logoId);
  assert.deepEqual(saved.dark_theme, branding.dark_theme);
  const unchanged = await request(
    "/settings",
    "PUT",
    { ...branding, language_code: "en" },
    editorToken,
  );
  assert.equal(unchanged.status, 200);
  const storedBefore = await database.query.settings.findFirst({
    where: eq(settings.id, 1),
  });
  const denied = await request(
    "/settings",
    "PUT",
    {
      ...branding,
      dark_theme: { ...branding.dark_theme, color_primary: "#abcdef" },
      language_code: "fa",
    },
    editorToken,
  );
  assert.equal(denied.status, 403);
  assert.deepEqual(
    await database.query.settings.findFirst({ where: eq(settings.id, 1) }),
    storedBefore,
  );

  const changed = await request(
    "/settings",
    "PUT",
    { ...branding, language_code: "fa" },
    administratorToken,
  );
  assert.equal(changed.status, 200);
  assert.equal(
    ((await changed.json()) as PublicSettingsResponse).language.code,
    "fa",
  );
  const publicSettings = await app.request(
    "/settings?language=en&locale=en&language_code=en",
    {
      headers: {
        "Accept-Language": "en",
        Cookie: "NEXT_LOCALE=en; language=en",
      },
    },
  );
  assert.equal(publicSettings.status, 200);
  assert.equal(publicSettings.headers.get("content-language"), "fa");
  assert.equal(
    ((await publicSettings.json()) as PublicSettingsResponse).language.code,
    "fa",
  );
  const laterBranding = await request(
    "/settings",
    "PUT",
    branding,
    editorToken,
  );
  assert.equal(laterBranding.status, 200);
  assert.equal(
    ((await laterBranding.json()) as PublicSettingsResponse).language.code,
    "fa",
  );
});

test("uses English response metadata for an unsupported persisted language and permits repair", async () => {
  const initial = (await (
    await app.request("/settings")
  ).json()) as PublicSettingsResponse;
  await database
    .update(settings)
    .set({ languageCode: "unsupported" })
    .where(eq(settings.id, 1));

  for (const [endpoint, status, message] of [
    ["/missing", 404, "The requested endpoint does not exist."],
    ["/settings", 500, "Configured language is invalid."],
  ] as const) {
    const response = await app.request(endpoint, {
      headers: { "Accept-Language": "fa", Cookie: "NEXT_LOCALE=fa" },
    });
    assert.equal(response.status, status);
    assert.equal(response.headers.get("content-language"), "en");
    assert.deepEqual(await response.json(), { message });
  }
  assert.equal(
    (await database.query.settings.findFirst({ where: eq(settings.id, 1) }))
      ?.languageCode,
    "unsupported",
  );

  const repaired = await request(
    "/settings",
    "PUT",
    {
      dark_theme: initial.dark_theme,
      language_code: "fa",
      light_theme: initial.light_theme,
    },
    administratorToken,
  );
  assert.equal(repaired.status, 200);
  assert.equal(repaired.headers.get("content-language"), "en");
  assert.equal(
    ((await repaired.json()) as PublicSettingsResponse).language.code,
    "fa",
  );
  const restoredLanguage = await app.request("/missing");
  assert.equal(restoredLanguage.status, 404);
  assert.equal(restoredLanguage.headers.get("content-language"), "fa");
  assert.deepEqual(await restoredLanguage.json(), {
    message: "مسیر درخواستی وجود ندارد.",
  });
});

test("publishes the configured language metadata and preserves it on reinitialization", async () => {
  const initial = await app.request("/settings");
  assert.equal(initial.status, 200);
  assert.equal(initial.headers.get("cache-control"), "no-store");
  assert.deepEqual(((await initial.json()) as { language: unknown }).language, {
    code: "en",
    direction: "ltr",
    calendar: "gregorian",
    name: "English",
    native_name: "English",
  });
  await database
    .update(settings)
    .set({ languageCode: "fa" })
    .where(eq(settings.id, 1));
  const preserved = await database.query.settings.findFirst({
    where: eq(settings.id, 1),
  });
  const config = loadConfig({
    BETTER_AUTH_SECRET: "synthetic-secret-with-at-least-thirty-two-characters",
    DATABASE_URL: "file::memory:",
  });
  const logger = createLogger(config.logging, { write() {} });
  await initializeDatabase(
    config,
    database,
    createAuth(config, database, logger),
  );
  assert.deepEqual(
    await database.query.settings.findFirst({ where: eq(settings.id, 1) }),
    preserved,
  );
  const existing = await app.request("/settings", {
    headers: { "Accept-Language": "en", Cookie: "NEXT_LOCALE=en" },
  });
  assert.equal(existing.status, 200);
  assert.deepEqual(
    ((await existing.json()) as { language: unknown }).language,
    {
      code: "fa",
      direction: "rtl",
      calendar: "jalali",
      name: "Persian",
      native_name: "فارسی",
    },
  );
});

test("bounds JSON bodies with and without declared length and requires JSON content type", async () => {
  const contentType = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "{}",
  });
  assert.equal(contentType.status, 415);
  const oversized = JSON.stringify({ padding: "x".repeat(65 * 1024) });
  const bodyHeaders: Record<string, string>[] = [
    { "Content-Type": "application/json" },
    {
      "Content-Type": "application/json",
      "Content-Length": String(oversized.length),
    },
  ];
  for (const headers of bodyHeaders) {
    const response = await app.request("/auth/login", {
      method: "POST",
      headers,
      body: oversized,
    });
    assert.equal(response.status, 413);
  }
  await database.insert(user).values(
    Array.from({ length: 101 }, (_, index) => ({
      id: `pagination-${index}`,
      email: `pagination-${index}@kernel.test`,
      firstName: "Page",
      lastName: "Fixture",
      mobile: `099${String(index).padStart(8, "0")}`,
      name: "Page Fixture",
    })),
  );
  const limited = await app.request("/users?size=999999", {
    headers: { Authorization: `Bearer ${administratorToken}` },
  });
  assert.equal(limited.status, 200);
  const page = (await limited.json()) as { items: unknown[]; total: number };
  assert.equal(page.items.length, 100);
  assert.equal(page.total, 103);
});

test("a failed password-change transaction preserves old credentials and sessions", async (context) => {
  const transaction = database.transaction.bind(database);
  const intercepted = context.mock.method(
    database,
    "transaction",
    async (...args: Parameters<typeof transaction>) => {
      intercepted.mock.restore();
      return transaction(async (executor) => {
        await args[0](executor);
        throw new Error("synthetic rollback before commit");
      });
    },
  );
  const response = await request(
    "/auth/change-password",
    "POST",
    {
      current_password: originalPassword,
      new_password: "replacement-test-password",
    },
    administratorToken,
  );
  assert.equal(response.status, 500);
  assert.equal(
    (
      await app.request("/account/me", {
        headers: { Authorization: `Bearer ${administratorToken}` },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/auth/login", "POST", {
        identifier: "09120000001",
        password: originalPassword,
      })
    ).status,
    200,
  );
});

test("registration validates password policy before consuming a valid OTP", async () => {
  const mobile = "09120000005";
  assert.equal(
    (
      await request("/auth/otp-request", "POST", {
        mobile,
        purpose: "register",
      })
    ).status,
    200,
  );
  const body = {
    first_name: "Test",
    last_name: "Registrant",
    mobile,
    otp: "123456",
  };
  assert.equal(
    (await request("/auth/register", "POST", { ...body, password: "short" }))
      .status,
    400,
  );
  assert.equal(
    (
      await request("/auth/register", "POST", {
        ...body,
        password: originalPassword,
      })
    ).status,
    201,
  );
});

test("limits repeated login attempts through the custom HTTP wrapper", async () => {
  for (let attempt = 0; attempt < 20; attempt++)
    assert.equal(
      (
        await request("/auth/login", "POST", {
          identifier: "09120000999",
          password: "incorrect-password",
        })
      ).status,
      400,
    );
  const blocked = await request("/auth/login", "POST", {
    identifier: "09120000999",
    password: "incorrect-password",
  });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

test("password recovery and authenticated password change revoke every previous session", async () => {
  const loginTarget = () =>
    request("/auth/login", "POST", {
      identifier: targetMobile,
      password: originalPassword,
    });
  const first = (await (await loginTarget()).json()) as {
    access_token: string;
  };
  const second = (await (await loginTarget()).json()) as {
    access_token: string;
  };
  assert.equal(
    (
      await request(
        "/auth/change-password",
        "POST",
        {
          current_password: originalPassword,
          new_password: "replacement-test-password",
        },
        first.access_token,
      )
    ).status,
    200,
  );
  for (const token of [first.access_token, second.access_token])
    assert.equal(
      (
        await app.request("/account/me", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
      401,
    );
  const changed = (await (
    await request("/auth/login", "POST", {
      identifier: targetMobile,
      password: "replacement-test-password",
    })
  ).json()) as { access_token: string };
  assert.equal(
    (
      await request("/auth/otp-request", "POST", {
        mobile: targetMobile,
        purpose: "forgot_password",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/auth/forgot-password", "POST", {
        mobile: targetMobile,
        otp: "123456",
        password: originalPassword,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await app.request("/account/me", {
        headers: { Authorization: `Bearer ${changed.access_token}` },
      })
    ).status,
    401,
  );
  assert.equal(
    (await database.select().from(session).where(eq(session.userId, targetId)))
      .length,
    0,
  );
});

test("logout expires the HTTPS secure cookie and can revoke an inactive account session", async () => {
  const config = loadConfig({
    BETTER_AUTH_SECRET: "synthetic-secret-with-at-least-thirty-two-characters",
    BETTER_AUTH_URL: "https://api.kernel.test",
    SERVER_ALLOWED_ORIGINS: "https://website.kernel.test",
    DATABASE_URL: "file::memory:",
  });
  const logger = createLogger(config.logging, { write() {} });
  const auth = createAuth(config, database, logger);
  const secureApp = createApp({
    auth,
    config,
    database,
    logger,
    storage: new MemoryObjectStorage(),
  });
  const login = await secureApp.request("https://api.kernel.test/auth/login", {
    method: "POST",
    headers: {
      Origin: "https://website.kernel.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      identifier: targetMobile,
      password: originalPassword,
    }),
  });
  assert.equal(login.status, 200);
  const currentToken = ((await login.json()) as { access_token: string })
    .access_token;
  const cookie = login.headers
    .getSetCookie()
    .find((value) => value.startsWith("__Secure-better-auth.session_token="))
    ?.split(";")[0];
  assert.ok(cookie);
  await database
    .update(user)
    .set({ status: "inactive" })
    .where(eq(user.id, targetId));
  const logout = await secureApp.request(
    "https://api.kernel.test/auth/logout",
    {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://website.kernel.test" },
    },
  );
  assert.equal(logout.status, 200);
  assert.ok(
    logout.headers
      .getSetCookie()
      .some(
        (value) =>
          value.startsWith("__Secure-better-auth.session_token=") &&
          /Max-Age=0/i.test(value),
      ),
  );
  assert.equal(
    (
      await database
        .select()
        .from(session)
        .where(eq(session.token, currentToken))
    ).length,
    0,
  );
});

for (const length of [7, 129]) {
  test(`rejects a ${length}-character recovery password without consuming the OTP`, async () => {
    const otp = await request("/auth/otp-request", "POST", {
      mobile: targetMobile,
      purpose: "forgot_password",
    });
    assert.equal(otp.status, 200);
    const body = { mobile: targetMobile, otp: "123456" };
    const rejected = await request("/auth/forgot-password", "POST", {
      ...body,
      password: "x".repeat(length),
    });
    assert.equal(rejected.status, 400);
    const unchanged = await request("/auth/login", "POST", {
      identifier: targetMobile,
      password: originalPassword,
    });
    assert.equal(unchanged.status, 200);
    const accepted = await request("/auth/forgot-password", "POST", {
      ...body,
      password: "replacement-test-password",
    });
    assert.equal(accepted.status, 200);
    assert.equal(await accepted.text(), "");
    const replay = await request("/auth/forgot-password", "POST", {
      ...body,
      password: originalPassword,
    });
    assert.equal(replay.status, 400);
    const login = await request("/auth/login", "POST", {
      identifier: targetMobile,
      password: "replacement-test-password",
    });
    assert.equal(login.status, 200);
  });

  test(`rejects a ${length}-character administrator reset password`, async () => {
    const response = await request(
      `/users/${targetId}/password`,
      "PUT",
      { password: "x".repeat(length) },
      administratorToken,
    );
    assert.equal(response.status, 400);
    const login = await request("/auth/login", "POST", {
      identifier: targetMobile,
      password: originalPassword,
    });
    assert.equal(login.status, 200);
  });
}
