import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { before, test } from "node:test";

import { en } from "../src/infrastructure/localization/catalogs/en.ts";
import { createLogger } from "../src/infrastructure/logging/logger.ts";
import { createHttpApp } from "../src/presentation/http/app.ts";
import {
  collectionRoot as root,
  collectionRoutes,
  requireCollectionGroups,
} from "./collection.test-support.mjs";

before(() => requireCollectionGroups("account", "auth"));

test("collection origin allows cookie-bearing requests through the HTTP guard", async () => {
  const collection = await readFile(path.join(root, "collection.bru"), "utf8");
  const header = collection.match(/^\s*Origin:\s*\{\{(\w+)\}\}\s*$/m);
  assert.equal(header?.[1], "origin");
  const allowedOrigin = "http://localhost:5173";
  const app = createHttpApp({
    logger: createLogger({ level: "silent", pretty: false }, { write() {} }),
    config: { allowedOrigins: [allowedOrigin] },
    services: {
      settings: { getLanguageCode: async () => "en" },
      auth: {
        fromRequest: () => ({
          logout: async () => {},
          responseCookies: () => [],
        }),
      },
    },
  });
  const request = (origin) =>
    app.request("/auth/logout", {
      method: "POST",
      headers: {
        Cookie: "session=synthetic",
        ...(origin ? { Origin: origin } : {}),
      },
    });
  assert.equal((await request()).status, 403);
  assert.equal((await request("https://other.example")).status, 403);
  assert.equal((await request(allowedOrigin)).status, 200);
});

test("collection operations match the published HTTP routes", async () => {
  for (const group of await requireCollectionGroups()) {
    const createRoutes = collectionRoutes[group];
    const directory = path.join(root, group);
    const entries = await readdir(directory, {
      withFileTypes: true,
      recursive: true,
    });
    const operations = entries.filter(
      (entry) => entry.isFile() && entry.name === "index.bru",
    );
    const actual = [];
    for (const operation of operations) {
      const dir = operation.parentPath;
      const request = await readFile(path.join(dir, "index.bru"), "utf8");
      const method = request.match(/^(get|post|patch|put|delete) \{/m)?.[1];
      const route = request.match(/url: \{\{base_url\}\}([^\s]+)/)?.[1];
      assert.ok(method && route, `${dir} has a method and URL`);
      actual.push(`${method.toUpperCase()} ${route}`);
      const variables = [...request.matchAll(/\{\{([\w_]+)\}\}/g)].map(
        (m) => m[1],
      );
      assert.ok(
        variables.every((value) =>
          [
            "base_url",
            "access_token",
            "user_id",
            "role_id",
            "calendar_date",
            "file_id",
          ].includes(value),
        ),
      );
      const jsonBody = request.match(/body:json \{\s*\n([\s\S]*?)\n\}/);
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
            Object.values(en).includes(example.message) ||
              [
                en.fieldInvalid.replace("{{field}}", "Content-Type"),
                "first_name is invalid.",
                "first_name is required.",
                "name is required.",
                "file is required.",
                "dark_theme is required.",
              ].includes(example.message),
            `${group}/${operation.name}/${file} is an English catalog message`,
          );
        }
      }
    }
    const expected = createRoutes().routes.map(({ method, path: route }) =>
      `${method} /${group}${route}`
        .replace(":userId", "{{user_id}}")
        .replace(":roleId", "{{role_id}}")
        .replace(":date", "{{calendar_date}}")
        .replace(":fileId", "{{file_id}}")
        .replace(/\/$/, ""),
    );
    assert.deepEqual(actual.sort(), expected.sort());
  }
});
