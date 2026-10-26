import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  boundaryViolation,
  checkBoundaries,
  inspectImports,
} from "./check-boundaries.mjs";

const root = path.resolve("fixture");
const check = (specifier, options = {}) =>
  boundaryViolation({
    root,
    file: path.join(root, "src/index.ts"),
    specifier,
    ...options,
  });

test("captures static, erased, re-export, dynamic and require edges", () => {
  const edges =
    inspectImports(`import type { User } from "./contracts/account.ts";
export { db } from "./infrastructure/db/client.ts";
export type * from "./application/models.ts";
type User = import("./contracts/account.ts").Account;
const api = import("hono");
const db = require("drizzle-orm");
import sdk = require("better-auth");
const computed = import(variable);
// import("not-an-edge")
const text = 'require("not-an-edge")';`);
  assert.deepEqual(
    edges.map((edge) => edge.specifier),
    [
      "./contracts/account.ts",
      "./infrastructure/db/client.ts",
      "./application/models.ts",
      "./contracts/account.ts",
      "hono",
      "drizzle-orm",
      "better-auth",
      undefined,
    ],
  );
  assert.equal(edges[0].line, 1);
});

test("rejects former shared package imports and computed loading", () => {
  for (const specifier of ["@kernel/contracts", "@kernel/i18n/api", undefined])
    assert.ok(check(specifier));
  assert.equal(check("hono"), undefined);
  assert.equal(check("./application/auth.ts"), undefined);
});

test("relative imports and resolved aliases cannot read another checkout", () => {
  assert.ok(check("../../kernel/src/index.ts"));
  assert.ok(
    check("custom-alias", {
      resolved: path.join(root, "..", "kernel", "src/index.ts"),
    }),
  );
  assert.equal(
    check("local-alias", {
      resolved: path.join(root, "src/application/auth.ts"),
    }),
    undefined,
  );
});

test("wire DTO modules remain pure local data and types", () => {
  const file = path.join(root, "src/contracts/account.ts");
  for (const specifier of [
    "hono",
    "drizzle-orm",
    "../application/models.ts",
    "../infrastructure/config.ts",
  ])
    assert.ok(check(specifier, { file }));
  assert.equal(check("./locales.ts", { file }), undefined);
});

test("resolved contract aliases cannot smuggle runtime implementations", () => {
  assert.ok(
    check("./locales.ts", {
      file: path.join(root, "src/contracts/account.ts"),
      resolved: path.join(root, "src/infrastructure/config.ts"),
    }),
  );
});

test("the working tree is a standalone project with contained pure contracts", async () => {
  const result = await checkBoundaries();
  assert.ok(result.files > 0);
  assert.deepEqual(result.violations, []);
});

test("nested production files retain import order while test trees and non-TypeScript files stay excluded", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "kernel-boundaries-"));
  try {
    await Promise.all(
      ["application", "contracts", "test", "__tests__", "node_modules"].map(
        (name) => mkdir(path.join(directory, "src", name), { recursive: true }),
      ),
    );
    const files = {
      "package.json": JSON.stringify({ name: "synthetic-boundary-fixture" }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: { module: "ESNext", moduleResolution: "bundler" },
        include: ["src/**/*.ts"],
      }),
      "src/application/a.ts": 'import "@kernel/a";\nimport(variable);\n',
      "src/application/b.ts": 'import "@kernel/b";\n',
      "src/contracts/types.ts": 'import "hono";\n',
      "src/ignored.spec.ts": 'import "@kernel/ignored";\n',
      "src/ignored.test.helper.ts": 'import "@kernel/ignored";\n',
      "src/ignored.tsx": 'import "@kernel/ignored";\n',
      "src/test/ignored.ts": 'import "@kernel/ignored";\n',
      "src/__tests__/ignored.ts": 'import "@kernel/ignored";\n',
      "src/node_modules/ignored.ts": 'import "@kernel/ignored";\n',
    };
    await Promise.all(
      Object.entries(files).map(([name, content]) =>
        writeFile(path.join(directory, name), content),
      ),
    );

    const result = await checkBoundaries(directory);
    const locations = result.violations.map((violation) =>
      violation.slice(0, violation.indexOf(": ")),
    );
    const firstFile = path.join("src", "application", "a.ts");

    assert.equal(result.files, 3);
    assert.equal(result.violations.length, 4);
    assert.deepEqual(
      new Set(locations),
      new Set([
        `${firstFile}:1`,
        `${firstFile}:2`,
        `${path.join("src", "application", "b.ts")}:1`,
        `${path.join("src", "contracts", "types.ts")}:1`,
      ]),
    );
    assert.deepEqual(
      locations.filter((location) => location.startsWith(`${firstFile}:`)),
      [`${firstFile}:1`, `${firstFile}:2`],
    );
  } finally {
    assert.ok(
      path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep),
    );
    assert.ok(path.basename(directory).startsWith("kernel-boundaries-"));
    await rm(directory, { force: true, recursive: true });
  }
});
