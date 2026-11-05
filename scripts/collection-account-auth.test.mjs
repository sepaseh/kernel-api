import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { before, test } from "node:test";
import { runInNewContext } from "node:vm";

import { en } from "../src/infrastructure/localization/catalogs/en.ts";
import {
  attemptLimitResponses,
  collectionRoot as root,
  readBrunoBlock,
  readCollectionJson,
  requireCollectionGroups,
} from "./collection.test-support.mjs";

before(() => requireCollectionGroups("account", "auth"));

test("saved attempt-limit responses match the HTTP routes for account and authentication", async (context) => {
  const cases = [
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
});

test("change-password clears the token only after a successful response", async () => {
  const script = await readBrunoBlock(
    "auth/change-password/index.bru",
    "script:post-response",
  );
  for (const status of [200, 400, 500]) {
    const deleted = [];
    runInNewContext(script, {
      res: { getStatus: () => status },
      bru: { deleteEnvVar: (name) => deleted.push(name) },
    });
    assert.deepEqual(
      deleted,
      status === 200 ? ["access_token"] : [],
      `status ${status}`,
    );
  }
});

test("saved account and authentication bodies match their operation contracts", async () => {
  const accountFields = [
    "email",
    "first_name",
    "id",
    "is_system_admin",
    "last_name",
    "mobile",
    "permissions",
    "status",
    "username",
  ];
  const otpFields = ["expires_in", "remaining_seconds"];
  const successCases = [
    ["account/me/200.json", accountFields],
    ["account/update-profile/200.json", accountFields],
    ["account/update-username/200.json", accountFields],
    ["account/request-email-verification/200.json", otpFields],
    ["account/request-mobile-verification/200.json", otpFields],
    ["auth/otp-request/200.json", otpFields],
    ["auth/login/200.json", ["access_token"]],
    ["auth/refresh-token/200.json", ["access_token"]],
    ["auth/register/201.json", ["access_token"]],
  ];
  for (const [file, fields] of successCases) {
    const body = await readCollectionJson(file);
    assert.deepEqual(Object.keys(body).sort(), [...fields].sort(), file);
  }
  const errorCases = [
    ["account/me/401.json", en.authenticationRequired],
    ["account/request-email-verification/400.json", en.emailInvalid],
    ["account/request-email-verification/401.json", en.authenticationRequired],
    [
      "account/update-profile/400.json",
      en.fieldInvalid.replace("{{field}}", "first_name"),
    ],
    ["account/update-profile/401.json", en.authenticationRequired],
    ["account/update-username/400.json", en.usernameInUse],
    ["account/update-username/401.json", en.authenticationRequired],
    ["account/verify-email/400.json", en.otpInvalid],
    ["account/verify-email/401.json", en.authenticationRequired],
    ["auth/change-password/400.json", en.passwordChangeInvalid],
    ["auth/change-password/401.json", en.authenticationRequired],
    ["auth/change-password/500.json", en.internalError],
    ["auth/forgot-password/400.json", en.passwordResetInvalid],
    ["auth/login/400.json", en.invalidCredentials],
    ["auth/login/500.json", en.internalError],
    ["auth/otp-request/400.json", en.invalidMobileOrPurpose],
    ["auth/refresh-token/401.json", en.authenticationRequired],
    ["auth/register/400.json", en.registrationInvalid],
    ["auth/register/500.json", en.internalError],
  ];
  for (const [file, message] of errorCases)
    assert.deepEqual(await readCollectionJson(file), { message }, file);
});
