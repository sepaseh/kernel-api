import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { eq } from "drizzle-orm";

import { createApp } from "../../composition.ts";
import { profileNameMaxLength } from "../../contracts/profile.ts";
import { createAuth } from "../../infrastructure/auth/better-auth.ts";
import { loadConfig } from "../../infrastructure/config.ts";
import { createDatabase } from "../../infrastructure/db/client.ts";
import { initializeDatabase } from "../../infrastructure/db/initialize.ts";
import { user } from "../../infrastructure/db/schema.ts";
import { createLogger } from "../../infrastructure/logging/logger.ts";
import { MemoryObjectStorage } from "../support/memory-object-storage.ts";

let app: ReturnType<typeof createApp>;
let client: ReturnType<typeof createDatabase>["client"];
let userId: string;
let accessToken: string;
const request = (
  endpoint: string,
  body: string,
  headers: Record<string, string> = {},
) =>
  app.request(`http://localhost${endpoint}`, {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
      ...headers,
    },
    method: "PATCH",
  });
const readProfile = async () => {
  const response = await app.request("http://localhost/account/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert.equal(response.status, 200);
  return (await response.json()) as { first_name: string; last_name: string };
};

before(async () => {
  const config = loadConfig({
    BETTER_AUTH_SECRET:
      "synthetic-validation-secret-with-at-least-thirty-two-characters",
    BETTER_AUTH_URL: "http://localhost",
    DATABASE_URL: "file::memory:",
    NODE_ENV: "test",
    OTP_FIXED_CODE: "123456",
    SERVER_ALLOWED_ORIGIN: "http://localhost:5173",
  });
  const connection = createDatabase(config);
  client = connection.client;
  const database = connection.database;
  const logger = createLogger(config.logging, { write() {} });
  const auth = createAuth(config, database, logger);
  await initializeDatabase(config, database, auth);
  const created = await auth.api.signUpEmail({
    body: {
      email: "validation-admin@kernel.local",
      firstName: "Original",
      lastName: "Name",
      mobile: "09120000800",
      name: "Original Name",
      password: "synthetic-validation-password",
    },
  });
  userId = created.user.id;
  await database
    .update(user)
    .set({ isSystemAdmin: true })
    .where(eq(user.id, userId));
  app = createApp({
    auth,
    config,
    database,
    logger,
    storage: new MemoryObjectStorage(),
  });
  const login = await app.request("http://localhost/auth/login", {
    body: JSON.stringify({
      identifier: "09120000800",
      password: "synthetic-validation-password",
    }),
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
    },
    method: "POST",
  });
  assert.equal(login.status, 200);
  accessToken = ((await login.json()) as { access_token: string }).access_token;
});
after(async () => {
  await client.close();
});

for (const endpoint of ["/account/update-profile", "/users/fixture"]) {
  test(`${endpoint} accepts exact trimmed bounds and preserves omitted/blank names`, async () => {
    const target = endpoint.replace("fixture", userId);
    const firstName = "ن".repeat(profileNameMaxLength);
    const lastName = "x".repeat(profileNameMaxLength);
    const first = await request(
      target,
      JSON.stringify({
        first_name: ` ${firstName} `,
        last_name: ` ${lastName} `,
      }),
    );
    assert.equal(first.status, 200);
    const saved = await readProfile();
    assert.equal(saved.first_name, firstName);
    assert.equal(saved.last_name, lastName);
    const partial = await request(
      target,
      JSON.stringify({ first_name: " Replacement ", last_name: " " }),
    );
    assert.equal(partial.status, 200);
    const result = await readProfile();
    assert.equal(result.first_name, "Replacement");
    assert.equal(result.last_name, lastName);
  });

  test(`${endpoint} rejects malformed or over-bound names without a partial write`, async () => {
    const target = endpoint.replace("fixture", userId);
    const initial = await readProfile();
    for (const field of ["first_name", "last_name"]) {
      for (const value of [
        null,
        false,
        123,
        [],
        {},
        "x".repeat(profileNameMaxLength + 1),
      ]) {
        const response = await request(
          target,
          JSON.stringify({
            first_name: "Must not persist",
            last_name: "Must not persist",
            [field]: value,
          }),
        );
        assert.equal(
          response.status,
          400,
          `${field}: ${JSON.stringify(value).slice(0, 30)}`,
        );
        assert.deepEqual(await response.json(), {
          message: `${field} is invalid.`,
        });
        assert.deepEqual(await readProfile(), initial);
      }
    }
    for (const body of ["{", "[]", "null", "true"]) {
      const response = await request(target, body);
      assert.equal(response.status, 400);
      assert.deepEqual(await readProfile(), initial);
    }
    const empty = await request(
      target,
      JSON.stringify({ first_name: " ", last_name: "" }),
    );
    assert.equal(empty.status, 400);
    assert.deepEqual(await readProfile(), initial);
  });
}

test("profile JSON boundary enforces content type and actual byte length independently of Content-Length", async () => {
  const target = "/account/update-profile";
  const before = await readProfile();
  assert.equal(
    (await request(target, "{}", { "Content-Type": "text/plain" })).status,
    415,
  );
  assert.equal(
    (await request(target, "{}", { "Content-Length": "65537" })).status,
    413,
  );
  assert.equal(
    (await request(target, "{}", { "Content-Length": "invalid" })).status,
    400,
  );
  const small = JSON.stringify({ first_name: "Body boundary" });
  const exact = small.padEnd(64 * 1024, " ");
  const over = await request(target, `${exact} `, { "Content-Length": "1" });
  assert.equal(over.status, 413);
  assert.deepEqual(await over.json(), {
    message: "The request body exceeds the size limit.",
  });
  assert.deepEqual(await readProfile(), before);
  const accepted = await request(target, exact);
  assert.equal(accepted.status, 200);
  assert.equal((await readProfile()).first_name, "Body boundary");
});

test("HTTP registration rejects an over-bound name without consuming its valid OTP", async () => {
  const mobile = "09120000801";
  const post = (endpoint: string, body: Record<string, unknown>) =>
    app.request(`http://localhost${endpoint}`, {
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      method: "POST",
    });
  assert.equal(
    (await post("/auth/otp-request", { mobile, purpose: "register" })).status,
    200,
  );
  const input = {
    first_name: "x".repeat(profileNameMaxLength),
    last_name: "y".repeat(profileNameMaxLength),
    mobile,
    otp: "123456",
    password: "synthetic-registration-password",
  };
  for (const field of ["first_name", "last_name"]) {
    const invalid = await post("/auth/register", {
      ...input,
      [field]: "x".repeat(profileNameMaxLength + 1),
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { message: `${field} is invalid.` });
  }
  const created = await post("/auth/register", input);
  assert.equal(created.status, 201);
  const token = ((await created.json()) as { access_token: string })
    .access_token;
  const account = await app.request("http://localhost/account/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(account.status, 200);
  const body = (await account.json()) as {
    first_name: string;
    last_name: string;
  };
  assert.equal(body.first_name, input.first_name);
  assert.equal(body.last_name, input.last_name);
});
