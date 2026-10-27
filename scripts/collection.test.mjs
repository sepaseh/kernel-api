import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { apiEn } from "../src/infrastructure/localization/catalogs/en.ts";
import { createAccountRoutes } from "../src/presentation/http/routes/account.ts";
import { createAuthRoutes } from "../src/presentation/http/routes/auth.ts";

const groups = { account: createAccountRoutes, auth: createAuthRoutes };
const root = path.resolve("collection");

test("collection operations match all published auth and account routes", async () => {
  for (const [group, createRoutes] of Object.entries(groups)) {
    const directory = path.join(root, group);
    const entries = await readdir(directory, { withFileTypes: true });
    const operations = entries.filter((entry) => entry.isDirectory());
    const actual = [];
    for (const operation of operations) {
      const dir = path.join(directory, operation.name);
      const request = await readFile(path.join(dir, "index.bru"), "utf8");
      const method = request.match(/^(get|post|patch|put|delete) \{/m)?.[1];
      const route = request.match(/url: \{\{base_url\}\}([^\s]+)/)?.[1];
      assert.ok(
        method && route,
        `${group}/${operation.name} has a method and URL`,
      );
      actual.push(`${method.toUpperCase()} ${route}`);
      const variables = [...request.matchAll(/\{\{([\w_]+)\}\}/g)].map(
        (m) => m[1],
      );
      assert.ok(
        variables.every((value) =>
          ["base_url", "access_token"].includes(value),
        ),
      );
      const jsonBody = request.match(/body:json \{\s*(\{[\s\S]*?\})\s*\}/);
      if (jsonBody) JSON.parse(jsonBody[1]);
      for (const file of await readdir(dir)) {
        if (!file.endsWith(".json")) continue;
        assert.match(file, /^\d{3}\.json$/);
        const example = JSON.parse(
          await readFile(path.join(dir, file), "utf8"),
        );
        if (Number.parseInt(file, 10) >= 400) {
          assert.deepEqual(Object.keys(example), ["message"]);
          assert.ok(
            Object.values(apiEn).includes(example.message) ||
              example.message === "first_name is invalid.",
            `${group}/${operation.name}/${file} is an English catalog message`,
          );
        }
      }
    }
    const expected = createRoutes().routes.map(
      ({ method, path: route }) => `${method} /${group}${route}`,
    );
    assert.deepEqual(actual.sort(), expected.sort());
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
  const changePassword = await readFile(
    path.join(root, "auth/change-password/index.bru"),
    "utf8",
  );
  assert.match(changePassword, /res\.getStatus\(\) === 200/);
  assert.match(changePassword, /bru\.deleteEnvVar\("access_token"\)/);
});
