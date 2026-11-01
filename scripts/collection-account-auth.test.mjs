import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { before, test } from "node:test";

import {
  assertAttemptLimitResponses,
  collectionRoot as root,
  requireCollectionGroups,
} from "./collection.test-support.mjs";

before(() => requireCollectionGroups("account", "auth"));

test("saved attempt-limit responses match the HTTP routes for account and authentication", async (context) => {
  await assertAttemptLimitResponses(context, [
    ["auth/login", "POST", "/auth/login", "login", "synthetic-login", 20],
    ["auth/register", "POST", "/auth/register", "register", "09120000001", 10],
    [
      "auth/forgot-password",
      "POST",
      "/auth/forgot-password",
      "recovery",
      "09120000001",
      10,
    ],
    [
      "account/verify-email",
      "POST",
      "/account/verify-email",
      "verify-email",
      "actor",
      10,
    ],
    [
      "account/request-mobile-verification",
      "POST",
      "/account/request-mobile-verification",
      "mobile-change-issue",
      "actor:actor",
      10,
    ],
    [
      "account/update-profile",
      "PATCH",
      "/account/update-profile",
      "mobile-change-confirm",
      "actor:actor",
      10,
    ],
  ]);
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
