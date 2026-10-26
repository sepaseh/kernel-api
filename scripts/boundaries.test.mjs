import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import ts from "typescript";

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

test("application imports stay local and framework-free even for erased SDK types", () => {
  const file = path.join(root, "src/application/service.ts");
  for (const specifier of ["hono", "drizzle-orm", "better-auth", "pino"])
    for (const typeOnly of [false, true])
      assert.match(check(specifier, { file, typeOnly }), /external packages/);
  assert.match(
    check("../infrastructure/db.ts", { file, typeOnly: true }),
    /local application\/contracts/,
  );
  assert.equal(check("./models.ts", { file, typeOnly: true }), undefined);
  assert.equal(check("../contracts/account.ts", { file }), undefined);
  assert.equal(check("crypto", { file }), undefined);
  assert.equal(check("node:crypto", { file }), undefined);
  assert.equal(check("node:assert/strict", { file }), undefined);
  for (const specifier of ["http", "node:http", "http2", "node:https"])
    assert.match(check(specifier, { file }), /HTTP transport/);
});

test("built-in SQLite dependencies cannot enter application code through runtime or erased types", () => {
  const file = path.join(root, "src/application/service.ts");
  const sources = [
    'import { DatabaseSync } from "node:sqlite";',
    'import type { DatabaseSync } from "node:sqlite";',
    'export type { DatabaseSync } from "node:sqlite";',
    'type Database = import("node:sqlite").DatabaseSync;',
    'const sqlite = import("node:sqlite");',
    'const sqlite = require("node:sqlite");',
  ];
  for (const source of sources) {
    const edges = inspectImports(source, file);
    assert.equal(edges.length, 1, source);
    assert.match(
      check(edges[0].specifier, { file, typeOnly: edges[0].typeOnly }),
      /database/,
      source,
    );
  }
});

test("fully erased message types remain valid while module-loading import and re-export forms fail", () => {
  const file = path.join(root, "src/application/service.ts");
  const erased = [
    'import type { ApiMessageKey } from "./localization.ts";',
    'export type { ApiMessageKey } from "./localization.ts";',
    'export type * from "./localization.ts";',
    'type Key = import("./localization.ts").ApiMessageKey;',
    'type Module = typeof import("./localization.ts");',
    'import type Messages = require("./localization.ts");',
  ];
  const moduleLoading = [
    'import { ApiMessageKey } from "./localization.ts";',
    'import { type ApiMessageKey } from "./localization.ts";',
    'export { type ApiMessageKey } from "./localization.ts";',
    'import * as messages from "./localization.ts";',
    'import defer * as messages from "./localization.ts";',
    'import "./localization.ts";',
    'export * from "./localization.ts";',
    'const messages = import("./localization.ts");',
    'const messages = require("./localization.ts");',
    'import Messages = require("./localization.ts");',
  ];
  for (const source of [...erased, ...moduleLoading]) {
    const edges = inspectImports(source, file);
    const typeOnly = erased.includes(source);

    assert.equal(edges.length, 1, source);
    assert.equal(edges[0].typeOnly, typeOnly, source);
    const violation = check(edges[0].specifier, { file, typeOnly });
    if (typeOnly) assert.equal(violation, undefined, source);
    else assert.match(violation, /fully erased types/, source);
  }
});

test("the working tree is a standalone project with contained pure contracts", async () => {
  const result = await checkBoundaries();
  assert.ok(result.files > 0);
  assert.deepEqual(result.violations, []);
});

test("installed packages cannot bypass the application boundary through runtime or type-only imports", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "kernel-boundaries-"));
  try {
    await Promise.all(
      [
        "src/application/ports",
        "src/contracts",
        "node_modules/runtime-framework",
      ].map((name) => mkdir(path.join(directory, name), { recursive: true })),
    );
    const files = {
      "package.json": JSON.stringify({ name: "synthetic-package-boundary" }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: { module: "ESNext", moduleResolution: "bundler" },
        include: ["src/**/*.ts"],
      }),
      "node_modules/runtime-framework/package.json": JSON.stringify({
        name: "runtime-framework",
        types: "index.d.ts",
      }),
      "node_modules/runtime-framework/index.d.ts":
        "export type Database = { id: string }; export declare const createServer: () => void;",
      "src/application/ports/local.ts": "export type Port = { id: string };",
      "src/contracts/local.ts": "export type Dto = { id: string };",
      "src/application/localization.ts":
        'export type ApiMessageKey = "synthetic";',
      "src/application/allowed.ts": [
        'import type { Port } from "./ports/local.ts";',
        'export type { Dto } from "../contracts/local.ts";',
        'type Key = import("./localization.ts").ApiMessageKey;',
        'import type Messages = require("./localization.ts");',
        'import { type Port as LocalPort } from "./ports/local.ts";',
      ].join("\n"),
      "src/application/runtime-package.ts":
        'import { createServer } from "runtime-framework";',
      "src/application/package-types.ts":
        'import type { Database } from "runtime-framework";',
      "src/application/runtime-vocabulary.ts":
        'export { type ApiMessageKey } from "./localization.ts";',
    };
    await Promise.all(
      Object.entries(files).map(([name, content]) =>
        writeFile(path.join(directory, name), content),
      ),
    );
    const module = ts.resolveModuleName(
      "runtime-framework",
      path.join(directory, "src/application/runtime-package.ts"),
      {
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      ts.sys,
    ).resolvedModule;

    assert.equal(module?.isExternalLibraryImport, true);
    assert.equal(
      path.resolve(module.resolvedFileName),
      path.join(directory, "node_modules/runtime-framework/index.d.ts"),
    );
    const result = await checkBoundaries(directory);
    const locations = result.violations.map((violation) =>
      violation.slice(0, violation.indexOf(": ")),
    );

    assert.equal(result.violations.length, 3);
    assert.deepEqual(
      new Set(locations),
      new Set([
        `${path.join("src", "application", "runtime-package.ts")}:1`,
        `${path.join("src", "application", "package-types.ts")}:1`,
        `${path.join("src", "application", "runtime-vocabulary.ts")}:1`,
      ]),
    );
    assert.ok(
      result.violations.some((violation) =>
        violation.includes("fully erased types"),
      ),
    );
  } finally {
    assert.ok(
      path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep),
    );
    assert.ok(path.basename(directory).startsWith("kernel-boundaries-"));
    await rm(directory, { force: true, recursive: true });
  }
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
