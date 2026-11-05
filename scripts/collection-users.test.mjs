import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { before, test } from "node:test";

import { createUsersService } from "../src/application/users.ts";
import {
  attemptLimitResponses,
  collectionRoot as root,
  readCollectionJson as read,
  requireCollectionGroups,
} from "./collection.test-support.mjs";

before(() => requireCollectionGroups("account", "auth", "users"));

test("saved attempt-limit responses match the HTTP routes for users", async (context) => {
  const cases = [
    [
      "users/request-mobile-verification",
      "POST",
      "/users/target/request-mobile-verification",
      "mobile-change-issue",
      "actor:target",
      10,
    ],
    [
      "users/update",
      "PATCH",
      "/users/target",
      "mobile-change-confirm",
      "actor:target",
      10,
    ],
  ];
  for await (const { operation, response, saved } of attemptLimitResponses(
    context,
    cases,
  )) {
    assert.equal(response.status, 429, operation);
    assert.equal(response.headers.get("Retry-After"), "900", operation);
    assert.deepEqual(await response.json(), saved, operation);
  }
});

test("user response examples agree for each synthetic identity", async () => {
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

test("management creation examples match the services", async () => {
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
    provider: {
      passwordBounds: async () => ({ min: 8, max: 128 }),
      hashPassword: async (password) => {
        assert.equal(password, userBody.password);
        return "synthetic-password-hash";
      },
    },
    repository: {
      createWithCredential: async (input) => {
        assert.match(input.authEmail, /^[0-9a-f-]{36}@kernel\.local$/);
        assert.deepEqual(input, {
          authEmail: input.authEmail,
          firstName: userBody.first_name,
          lastName: userBody.last_name,
          mobile: userBody.mobile,
          passwordHash: "synthetic-password-hash",
        });
        return {
          id: userExample.id,
          firstName: input.firstName,
          lastName: input.lastName,
          mobile: input.mobile,
          isSystemAdmin: false,
          status: "active",
        };
      },
    },
  });
  assert.deepEqual(await users.create(userBody), userExample);
});
