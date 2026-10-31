import assert from "node:assert/strict";
import { test } from "node:test";

import type { Context } from "hono";

import { ApplicationError } from "../../application/errors.ts";
import { loadLoggingConfig } from "../../infrastructure/config.ts";
import { getTranslator } from "../../infrastructure/localization/i18n.ts";
import { createLogger } from "../../infrastructure/logging/logger.ts";
import { createHttpApp } from "../../presentation/http/app.ts";
import { enforceAuthAttempt } from "../../presentation/http/auth-attempts.ts";
import type { HttpDependencies } from "../../presentation/http/dependencies.ts";
import type { AppEnvironment } from "../../presentation/http/http.ts";

const fixture = (permissions: string[] = ["users.delete"]) => {
  const output: string[] = [];
  let deleted = 0;
  let active = true;
  let updateActor: unknown;
  const logger = createLogger(loadLoggingConfig({ NODE_ENV: "test" }), {
    write: (value) => output.push(value),
  });
  const dependencies = {
    logger,
    config: {
      allowedOrigins: ["http://localhost:5173"],
      storageDriver: "local",
      uploadLimitBytes: 1024,
    },
    services: {
      settings: {
        getLanguageCode: async () => "fa",
        listLanguages: () => ["fa"],
      },
      calendar: { list: async () => ["2026-10-27"] },
      auth: {
        fromRequest: () => ({
          authenticate: async () => {
            if (!active)
              throw new ApplicationError(
                "unauthenticated",
                "authenticationRequired",
              );
            return {
              account: { id: "actor", isSystemAdmin: false },
              permissions,
              session: { token: "session" },
            };
          },
          login: async () => ({ token: "signed-token", userId: "actor" }),
          logout: async () => {
            active = false;
          },
          responseCookies: () => ["session=secret; HttpOnly; Path=/"],
        }),
      },
      users: {
        update: async (actor: unknown, id: string, input: unknown) => {
          updateActor = actor;
          return { id, input };
        },
        remove: async () => {
          deleted++;
          throw new ApplicationError("conflict", "userInUse");
        },
      },
    },
  } as unknown as HttpDependencies;
  return {
    app: createHttpApp(dependencies),
    output,
    getDeleted: () => deleted,
    getUpdateActor: () => updateActor,
  };
};

test("authentication attempt windows enforce limits and expire", (t) => {
  let now = 1_000;
  t.mock.method(Date, "now", () => now);
  const headers = new Map<string, string>();
  const dependencies = {} as HttpDependencies;
  const context = {
    get: () => dependencies,
    header: (name: string, value: string) => headers.set(name, value),
  } as unknown as Context<AppEnvironment>;

  enforceAuthAttempt(context, "login", "alice", 2);
  enforceAuthAttempt(context, "login", "alice", 2);
  assert.throws(
    () => enforceAuthAttempt(context, "login", "alice", 2),
    (error: unknown) =>
      error instanceof ApplicationError && error.kind === "rate-limited",
  );
  assert.equal(headers.get("Retry-After"), "900");
  enforceAuthAttempt(context, "login", "bob", 2);

  now += 15 * 60 * 1_000;
  enforceAuthAttempt(context, "login", "alice", 2);
});

test("user update forwards the authenticated actor to the service", async () => {
  const value = fixture(["users.update"]);
  const response = await value.app.request("/users/target", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mobile: "09120000002" }),
  });
  assert.equal(response.status, 200);
  assert.equal(
    (value.getUpdateActor() as { account: { id: string } }).account.id,
    "actor",
  );
});

test("profile mobile response uses the updated account instead of stale authenticated fields", async () => {
  const logger = createLogger(loadLoggingConfig({ NODE_ENV: "test" }), {
    write() {},
  });
  const dependencies = {
    logger,
    config: {
      allowedOrigins: [],
      storageDriver: "local",
      uploadLimitBytes: 1024,
    },
    services: {
      settings: { getLanguageCode: async () => "en" },
      auth: {
        fromRequest: () => ({
          authenticate: async () => ({
            account: {
              id: "actor",
              isSystemAdmin: true,
              username: "stale",
              profileEmail: "stale@example.com",
            },
            session: { id: "session" },
            permissions: [],
          }),
        }),
      },
      users: {
        update: async () => ({
          id: "actor",
          first_name: "New",
          last_name: "Name",
          mobile: "09120000002",
          is_system_admin: false,
          status: "active",
          roles: [],
        }),
      },
      account: {
        getAccount: async (actor: { account: unknown }) => actor.account,
      },
    },
  } as unknown as HttpDependencies;
  const response = await createHttpApp(dependencies).request(
    "/account/update-profile",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mobile: "09120000002", otp: "123456" }),
    },
  );
  assert.equal(response.status, 200);
  const account = (await response.json()) as Record<string, unknown>;
  assert.equal(account.isSystemAdmin, false);
  assert.equal(account.username, undefined);
  assert.equal(account.profileEmail, undefined);
  assert.equal(account.mobile, "09120000002");
});

test("identity churn has no global budget and cannot evict active identity windows", (t) => {
  let now = 1_000;
  t.mock.method(Date, "now", () => now);
  const dependencies = {} as HttpDependencies;
  const context = {
    get: () => dependencies,
    header: () => undefined,
  } as unknown as Context<AppEnvironment>;

  for (let attempt = 0; attempt < 19; attempt++)
    enforceAuthAttempt(context, "login", "victim");
  for (let index = 0; index < 9_999; index++)
    enforceAuthAttempt(context, "login", `identity-${index}`);
  assert.throws(() => enforceAuthAttempt(context, "login", "fresh-user"), {
    kind: "rate-limited",
  });
  enforceAuthAttempt(context, "login", "victim");
  assert.throws(
    () => enforceAuthAttempt(context, "login", "victim"),
    (error: unknown) =>
      error instanceof ApplicationError && error.kind === "rate-limited",
  );

  now += 15 * 60 * 1_000;
  enforceAuthAttempt(context, "login", "victim");
});

test("all-blocked saturation fails closed until a window expires", (t) => {
  let now = 1_000;
  t.mock.method(Date, "now", () => now);
  const headers = new Map<string, string>();
  const context = {
    get: () => dependencies,
    header: (name: string, value: string) => headers.set(name, value),
  } as unknown as Context<AppEnvironment>;
  const dependencies = {} as HttpDependencies;
  for (let index = 0; index < 10_000; index++)
    enforceAuthAttempt(context, "login", `locked-${index}`, 1);
  assert.throws(() => enforceAuthAttempt(context, "login", "new-user", 1), {
    kind: "rate-limited",
  });
  assert.equal(headers.get("Retry-After"), "900");
  assert.throws(() => enforceAuthAttempt(context, "login", "locked-0", 1), {
    kind: "rate-limited",
  });
  now += 15 * 60 * 1_000;
  enforceAuthAttempt(context, "login", "new-user", 1);
  assert.throws(() => enforceAuthAttempt(context, "login", "new-user", 1), {
    kind: "rate-limited",
  });
});

test("health and credentialed CORS distinguish allowed origins", async () => {
  const { app } = fixture();
  const allowed = await app.request("/health", {
    headers: { Origin: "http://localhost:5173" },
  });
  assert.equal(allowed.status, 200);
  assert.equal(
    allowed.headers.get("access-control-allow-origin"),
    "http://localhost:5173",
  );
  assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
  assert.equal(allowed.headers.get("content-language"), "fa");
  const denied = await app.request("/health", {
    headers: { Origin: "https://evil.test" },
  });
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("authenticated calendar and language responses are not cacheable", async () => {
  const { app } = fixture(["calendar.read"]);
  for (const path of ["/calendar", "/languages"]) {
    const response = await app.request(path, {
      headers: { Cookie: "session=secret" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  const logout = await app.request("/auth/logout", { method: "POST" });
  assert.equal(logout.status, 200);
  const expired = await app.request("/calendar", {
    headers: { Cookie: "session=secret" },
  });
  assert.equal(expired.status, 401);
  assert.equal(expired.headers.get("cache-control"), "private, no-store");
  const denied = await fixture([]).app.request("/calendar");
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("cache-control"), "private, no-store");
});

test("cookie login preserves cookies and rejects cross-origin state changes", async () => {
  const { app } = fixture();
  const login = await app.request("/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: "http://localhost:5173",
    },
    body: JSON.stringify({ identifier: "u", password: "secret" }),
  });
  assert.equal(login.status, 200);
  assert.deepEqual(await login.json(), { access_token: "signed-token" });
  assert.match(login.headers.get("set-cookie")!, /session=secret/);
  const rejected = await app.request("/auth/logout", {
    method: "POST",
    headers: { Cookie: "session=secret", Origin: "https://evil.test" },
  });
  assert.equal(rejected.status, 403);
});

test("authorization precedes deletion and localizes an in-use conflict", async () => {
  const forbidden = fixture([]);
  const rejected = await forbidden.app.request("/users/private-id", {
    method: "DELETE",
  });
  assert.equal(rejected.status, 403);
  assert.equal(forbidden.getDeleted(), 0);
  const allowed = fixture();
  const conflict = await allowed.app.request("/users/private-id", {
    method: "DELETE",
  });
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), {
    message: getTranslator("fa")("userInUse"),
  });
  assert.equal(allowed.getDeleted(), 1);
  assert.equal(allowed.output.join("").includes("private-id"), false);
});

test("JSON size is enforced from bytes when Content-Length lies", async () => {
  const { app } = fixture();
  const response = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "1" },
    body: JSON.stringify({ identifier: "u", password: "x".repeat(70_000) }),
  });
  assert.equal(response.status, 413);
});

test("JSON limit retains 413 if canceling the source fails", async () => {
  const { app } = fixture();
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(65_537));
    },
    cancel() {
      return Promise.reject(new Error("untrusted stream error"));
    },
  });
  const request = new Request("http://localhost/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const response = await app.fetch(request);
  assert.equal(response.status, 413);
  assert.equal(
    (await response.text()).includes("untrusted stream error"),
    false,
  );
});

test("JSON limit responds even when canceling the source never settles", async () => {
  const { app } = fixture();
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(65_537));
    },
    cancel() {
      return new Promise(() => {});
    },
  });
  const request = new Request("http://localhost/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const result = await Promise.race([
    app.fetch(request),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Response did not arrive")), 500),
    ),
  ]);
  assert.equal(result.status, 413);
});
