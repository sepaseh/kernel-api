import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { ESLint } from "eslint";
import ts from "typescript";

import {
  boundaryViolation,
  catalogDataViolation,
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

test("application code cannot obtain createRequire loaders through native module imports", () => {
  const file = path.join(root, "src/application/service.ts");
  for (const source of [
    'import { createRequire } from "node:module"; createRequire(import.meta.url)("hono");',
    'import { createRequire as loader } from "module"; const load = loader(import.meta.url); load("hono");',
    'import * as module from "node:module"; module.createRequire(import.meta.url)("hono");',
    'const { createRequire } = require("node:module"); const load = createRequire(import.meta.url); load("hono");',
    'const { createRequire } = await import("node:module"); createRequire(import.meta.url)("hono");',
  ]) {
    const edges = inspectImports(source, file);
    assert.equal(edges.length, 1, source);
    assert.match(
      check(edges[0].specifier, { file }),
      /must not construct module loaders/,
      source,
    );
  }
});

test("builtin process loaders retain literal targets and reject computed module IDs", () => {
  const file = path.join(root, "src/application/service.ts");
  for (const source of [
    'process.getBuiltinModule("module").createRequire(import.meta.url)("hono");',
    'globalThis.process.getBuiltinModule("node:module").createRequire(import.meta.url)("hono");',
    'globalThis["process"]?.["getBuiltinModule"]("module").createRequire(import.meta.url)("hono");',
    'globalThis?.process?.getBuiltinModule?.("module").createRequire(import.meta.url)("hono");',
  ]) {
    const edges = inspectImports(source, file);
    assert.equal(edges.length, 1, source);
    assert.match(
      check(edges[0].specifier, { file }),
      /must not construct module loaders/,
      source,
    );
  }
  const computed = inspectImports(
    "process.getBuiltinModule(moduleName);",
    file,
  );
  assert.equal(computed.length, 1);
  assert.match(check(computed[0].specifier, { file }), /literal module paths/);
  const utility = inspectImports('process.getBuiltinModule("crypto");', file);
  assert.equal(utility.length, 1);
  assert.equal(check(utility[0].specifier, { file }), undefined);
  assert.deepEqual(inspectImports('other.getBuiltinModule("module");'), []);
});

test("native process loaders cannot escape direct-call boundary checks", async () => {
  const parent = await realpath(tmpdir());
  const directory = await mkdtemp(
    path.join(parent, "kernel-boundaries-loader-"),
  );
  try {
    await Promise.all(
      ["application", "contracts", "infrastructure"].map((name) =>
        mkdir(path.join(directory, "src", name), { recursive: true }),
      ),
    );
    const files = {
      "package.json": JSON.stringify({
        name: "synthetic-native-loader-boundary",
      }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: { module: "ESNext", moduleResolution: "bundler" },
        include: ["src/**/*.ts"],
      }),
      "src/application/direct.ts": [
        'const crypto = process.getBuiltinModule("crypto");',
        'const alsoCrypto = (globalThis.process.getBuiltinModule)("crypto" as const);',
      ].join("\n"),
      "src/application/extracted.ts": [
        "const { getBuiltinModule: load } = process;",
        "const { ['getBuiltinModule' as const]: globalLoad } = globalThis.process;",
        "const alias = process.getBuiltinModule;",
        "let assigned; ({ getBuiltinModule: assigned } = globalThis['process']);",
        "function receive({ getBuiltinModule: load } = process) { return load; }",
        "const globalAlias = globalThis['process']['getBuiltinModule' as const];",
        "const { getBuiltinModule: unrelated } = other; const otherAlias = other.getBuiltinModule;",
      ].join("\n"),
      "src/contracts/extracted.ts":
        "const { getBuiltinModule: load } = process;",
      "src/infrastructure/extracted.ts":
        "const { getBuiltinModule: load } = process;",
    };
    await Promise.all(
      Object.entries(files).map(([name, content]) =>
        writeFile(path.join(directory, name), content),
      ),
    );

    const result = await checkBoundaries(directory);
    assert.equal(result.files, 4);
    assert.equal(result.violations.length, 7);
    for (const location of [
      ...[1, 2, 3, 4, 5, 6].map(
        (line) => `${path.join("src", "application", "extracted.ts")}:${line}:`,
      ),
      `${path.join("src", "contracts", "extracted.ts")}:1:`,
    ])
      assert.ok(
        result.violations.some(
          (violation) =>
            violation.startsWith(location) &&
            violation.includes(
              "Call process.getBuiltinModule directly with a literal module ID",
            ),
        ),
        location,
      );
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), parent);
    assert.ok(path.basename(directory).startsWith("kernel-boundaries-loader-"));
    await rm(directory, { force: true, recursive: true });
  }
});

test("production imports cannot reach files excluded as test-only source", () => {
  const file = path.join(root, "src/application/service.ts");
  for (const relative of [
    "./test/helper.ts",
    "./__tests__/helper.ts",
    "./helper.test.ts",
    "./helper.spec.ts",
    "./helper.test.support.ts",
    "../contracts/test/helper.ts",
  ]) {
    assert.match(check(relative, { file }), /must not import test-only/);
    assert.match(
      check("local-alias", {
        file,
        resolved: path.resolve(path.dirname(file), relative),
      }),
      /must not import test-only/,
    );
  }
  assert.equal(check("./testing/helper.ts", { file }), undefined);
  assert.equal(
    check("utility-package", {
      file: path.join(root, "src/infrastructure/task.ts"),
      resolved: path.join(root, "node_modules/utility-package/test/index.d.ts"),
    }),
    undefined,
  );
});

test("the S3 SDK belongs only to the owned MinIO adapter with its real contained package identity", () => {
  const file = path.join(root, "src/infrastructure/storage/minio.ts");
  const resolved = path.join(
    root,
    "node_modules/@aws-sdk/client-s3/dist-types/index.d.ts",
  );
  const options = { file, resolved, resolvedPackage: "@aws-sdk/client-s3" };
  for (const typeOnly of [false, true]) {
    assert.equal(
      check("@aws-sdk/client-s3", { ...options, typeOnly }),
      undefined,
    );
    for (const owner of [
      "src/infrastructure/storage/create.ts",
      "src/infrastructure/storage/local.ts",
      "src/infrastructure/config.ts",
    ])
      assert.match(
        check("@aws-sdk/client-s3", {
          ...options,
          typeOnly,
          file: path.join(root, owner),
        }),
        /owned MinIO adapter/,
      );
    for (const owner of [
      "src/application/files.ts",
      "src/application/ports/object-storage.ts",
      "src/contracts/settings.ts",
      "src/infrastructure/localization/catalogs/en.ts",
    ])
      assert.ok(
        check("@aws-sdk/client-s3", {
          ...options,
          typeOnly,
          file: path.join(root, owner),
        }),
      );
  }
  for (const overrides of [
    { specifier: "sdk-alias" },
    { specifier: "@aws-sdk/client-s3/dist-types/index" },
    { specifier: "@aws-sdk/credential-provider-node" },
    { resolvedPackage: undefined },
    { resolvedPackage: "different-package" },
    { resolved: path.join(root, "node_modules/sdk-alias/index.d.ts") },
    { resolved: path.join(root, "src/infrastructure/storage/fake-sdk.ts") },
    {
      resolved: path.resolve(
        root,
        "../other/node_modules/@aws-sdk/client-s3/index.d.ts",
      ),
    },
  ]) {
    const { specifier = "@aws-sdk/client-s3", ...changes } = overrides;
    assert.ok(check(specifier, { ...options, ...changes }));
  }
});

test("database SDKs resolve to exact real packages only in their declared infrastructure owners", () => {
  const sdk = (owner, expectedPackage, typeOnly) => ({
    file: path.join(root, owner),
    resolved: path.join(root, "node_modules", expectedPackage, "index.d.ts"),
    resolvedPackage: expectedPackage,
    typeOnly,
  });
  const allowed = [
    ["@libsql/client", "src/infrastructure/db/client.ts", "@libsql/client"],
    ["drizzle-orm/libsql", "src/infrastructure/db/client.ts", "drizzle-orm"],
    ["drizzle-orm", "src/infrastructure/db/schema.ts", "drizzle-orm"],
    ["drizzle-orm", "src/infrastructure/admin/bootstrap.ts", "drizzle-orm"],
    ["drizzle-orm", "src/infrastructure/auth/otp.ts", "drizzle-orm"],
    ["drizzle-orm", "src/infrastructure/db/initialize.ts", "drizzle-orm"],
    [
      "drizzle-orm/libsql/migrator",
      "src/infrastructure/db/initialize.ts",
      "drizzle-orm",
    ],
    [
      "drizzle-orm/sqlite-core",
      "src/infrastructure/db/schema.ts",
      "drizzle-orm",
    ],
    ...[
      "account",
      "auth",
      "calendar",
      "files",
      "identity",
      "roles",
      "settings",
      "users",
    ].map((name) => [
      "drizzle-orm",
      `src/infrastructure/persistence/${name}.ts`,
      "drizzle-orm",
    ]),
  ];
  for (const [specifier, owner, expectedPackage] of allowed) {
    for (const typeOnly of [false, true]) {
      const options = sdk(owner, expectedPackage, typeOnly);
      assert.equal(check(specifier, options), undefined);
      for (const file of [
        "src/application/ports/users.ts",
        "src/application/users.ts",
        "src/contracts/account.ts",
        "src/infrastructure/localization/catalogs/en.ts",
        "src/infrastructure/storage/minio.ts",
        "src/infrastructure/persistence/errors.ts",
      ])
        assert.ok(
          check(specifier, { ...options, file: path.join(root, file) }),
        );
      for (const changes of [
        { resolvedPackage: undefined },
        { resolvedPackage: "different-package" },
        { resolved: path.join(root, "src/infrastructure/fake-sdk.ts") },
        {
          resolved: path.resolve(
            root,
            "../another/node_modules",
            expectedPackage,
            "index.d.ts",
          ),
        },
      ])
        assert.ok(check(specifier, { ...options, ...changes }));
      assert.ok(check("sdk-alias", options));
    }
  }
  const client = sdk(
    "src/infrastructure/db/client.ts",
    "@libsql/client",
    false,
  );
  assert.ok(check("@libsql/client/node", client));
  assert.ok(check("@libsql/hrana-client", client));
  assert.ok(
    check("drizzle-orm", {
      ...client,
      file: path.join(root, "src/infrastructure/db/schema.ts"),
    }),
  );
  const schema = sdk("src/infrastructure/db/schema.ts", "drizzle-orm", false);
  assert.ok(check("@libsql/client", schema));
  assert.ok(check("drizzle-orm/unreviewed", schema));
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

test("catalog data depends on erased vocabulary, with local data imports reserved for the registry", () => {
  const directory = path.join(root, "src/infrastructure/localization/catalogs");
  const file = path.join(directory, "fa.ts");
  const vocabulary = "../../../application/localization.ts";
  assert.equal(check(vocabulary, { file, typeOnly: true }), undefined);
  for (const specifier of [
    vocabulary,
    "../../../application/models.ts",
    "../../../contracts/locales.ts",
    "./en.ts",
    "../i18n.ts",
    "i18next",
  ])
    assert.ok(check(specifier, { file, typeOnly: false }));
  for (const specifier of [
    "./en.ts",
    "i18next",
    "../../../application/models.ts",
  ])
    assert.ok(check(specifier, { file, typeOnly: true }));
  const registry = path.join(directory, "index.ts");
  assert.equal(
    check("./en.ts", { file: registry, typeOnly: false }),
    undefined,
  );
  assert.equal(
    check("../../../contracts/locales.ts", { file: registry, typeOnly: true }),
    undefined,
  );
  for (const specifier of [
    "../../../contracts/locales.ts",
    "../i18n.ts",
    "./index.ts",
    "i18next",
  ])
    assert.ok(check(specifier, { file: registry, typeOnly: false }));
  assert.match(
    check("../infrastructure/localization/catalogs/index.ts", {
      file: path.join(root, "src/application/localization.ts"),
      typeOnly: true,
    }),
    /local application\/contracts/,
  );
});

test("literal catalog policy accepts only one exported const of flat string messages", () => {
  for (const content of [
    'export const en = { message: "literal" };',
    'export const en = { "message": "literal" } as const;',
    'import type { ApiTranslationResource } from "../../../application/localization.ts"; export const en = { message: "literal" } satisfies ApiTranslationResource;',
  ])
    assert.equal(catalogDataViolation(content, "en.ts"), undefined);
  for (const content of [
    "",
    "export const en = {};",
    'export const en = { message: "" };',
    'export const en = { message: "literal", message: "duplicate" };',
    'export const en = { common: { message: "nested" } };',
    "export const en = { message: calculate() };",
    'export const en = { get message() { return "getter"; } };',
    'export const en = { message() { return "method"; } };',
    'export const en = { ["message"]: "computed" };',
    "export const en = { ...other };",
    "export const en = { message: `template` };",
    'export const en = Object.freeze({ message: "called" });',
    'export const en = { message: "literal" }; run();',
    'export const en = { message: "literal" }; export function run() {}',
    'export const en = { message: "literal" }; export { other };',
    'import "side-effect"; export const en = { message: "literal" };',
    'export const en = { message: "literal" }, extra = "extra";',
    'export const en = { message: "literal" }; const extra = "extra";',
    'export let en = { message: "literal" };',
    'export using en = { message: "disposable" };',
    'export await using en = { message: "asynchronous disposal" };',
    'const en = { message: "literal" };',
    'export const fa = { message: "wrong locale" };',
    "export const en = { message: ;",
  ])
    assert.ok(catalogDataViolation(content, "en.ts"), content);
});

test("the working tree is a standalone project with contained pure contracts", async () => {
  const result = await checkBoundaries();
  assert.ok(result.files > 0);
  assert.deepEqual(result.violations, []);
});

test("installed packages cannot bypass the application boundary through runtime or type-only imports", async () => {
  const parent = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(parent, "kernel-boundaries-"));
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
    assert.equal(path.dirname(path.resolve(directory)), parent);
    assert.ok(path.basename(directory).startsWith("kernel-boundaries-"));
    await rm(directory, { force: true, recursive: true });
  }
});

test("nested production files retain import order while test trees and non-source files stay excluded", async () => {
  const parent = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(parent, "kernel-boundaries-"));
  try {
    await Promise.all(
      [
        "application/test",
        "contracts",
        "test",
        "__tests__",
        "node_modules",
      ].map((name) =>
        mkdir(path.join(directory, "src", name), { recursive: true }),
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
      "src/application/c.ts": 'import "./test/helper.ts";\n',
      "src/application/test/helper.ts": 'import "hono";\n',
      "src/contracts/types.ts": 'import "hono";\n',
      "src/ignored.spec.ts": 'import "@kernel/ignored";\n',
      "src/ignored.test.helper.ts": 'import "@kernel/ignored";\n',
      "src/ignored.json": '{ "text": "not source" }\n',
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

    assert.equal(result.files, 4);
    assert.equal(result.violations.length, 5);
    assert.deepEqual(
      new Set(locations),
      new Set([
        `${firstFile}:1`,
        `${firstFile}:2`,
        `${path.join("src", "application", "b.ts")}:1`,
        `${path.join("src", "application", "c.ts")}:1`,
        `${path.join("src", "contracts", "types.ts")}:1`,
      ]),
    );
    assert.deepEqual(
      locations.filter((location) => location.startsWith(`${firstFile}:`)),
      [`${firstFile}:1`, `${firstFile}:2`],
    );
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), parent);
    assert.ok(path.basename(directory).startsWith("kernel-boundaries-"));
    await rm(directory, { force: true, recursive: true });
  }
});

test("JavaScript contract helpers cannot hide forbidden imports across source extensions", async () => {
  const parent = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(parent, "kernel-boundaries-js-"));
  try {
    await mkdir(path.join(directory, "src/contracts"), { recursive: true });
    const extensions = ["js", "jsx", "mjs", "cjs", "tsx", "mts", "cts"];
    const files = {
      "package.json": JSON.stringify({
        name: "synthetic-js-contract-boundary",
      }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "bundler",
          allowJs: true,
        },
        include: ["src/**/*"],
      }),
      "src/contracts/owner.ts": 'export { value } from "./helper-js.js";',
      ...Object.fromEntries(
        extensions.map((extension) => [
          `src/contracts/helper-${extension}.${extension}`,
          extension === "cjs"
            ? 'const value = require("hono"); module.exports = { value };'
            : 'export { value } from "hono";',
        ]),
      ),
    };
    await Promise.all(
      Object.entries(files).map(([name, content]) =>
        writeFile(path.join(directory, name), content),
      ),
    );

    const result = await checkBoundaries(directory);
    assert.equal(result.files, extensions.length + 1);
    assert.equal(result.violations.length, extensions.length);
    for (const extension of extensions)
      assert.ok(
        result.violations.some(
          (violation) =>
            violation.startsWith(
              `${path.join("src", "contracts", `helper-${extension}.${extension}`)}:1:`,
            ) &&
            violation.includes(
              "Wire contracts must depend only on local pure contract modules",
            ),
        ),
        extension,
      );
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), parent);
    assert.ok(path.basename(directory).startsWith("kernel-boundaries-js-"));
    await rm(directory, { force: true, recursive: true });
  }
});

test("symlinked source directories cannot hide forbidden imports", async () => {
  const parent = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(parent, "kernel-boundaries-link-"));
  try {
    await mkdir(path.join(directory, "src/application"), { recursive: true });
    await mkdir(path.join(directory, "linked-source"));
    const files = {
      "package.json": JSON.stringify({ name: "synthetic-link-boundary" }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: { module: "ESNext", moduleResolution: "bundler" },
        include: ["src/**/*.ts"],
      }),
      "src/application/local.ts": "export type Local = string;",
      "linked-source/hidden.ts": 'import "hono";',
    };
    await Promise.all(
      Object.entries(files).map(([name, content]) =>
        writeFile(path.join(directory, name), content),
      ),
    );
    const linkedDirectory = path.join(directory, "src/application/linked");
    await symlink(
      path.join(directory, "linked-source"),
      linkedDirectory,
      process.platform === "win32" ? "junction" : "dir",
    );

    await assert.rejects(checkBoundaries(directory), (error) => {
      assert.equal(
        error.message,
        `Symbolic links are not allowed in source: ${linkedDirectory}`,
      );
      return true;
    });
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), parent);
    assert.ok(path.basename(directory).startsWith("kernel-boundaries-link-"));
    await rm(directory, { force: true, recursive: true });
  }
});

test("direct environment reads stay outside contracts and application code", async () => {
  const parent = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(parent, "kernel-boundaries-env-"));
  try {
    await Promise.all(
      ["application", "contracts", "infrastructure"].map((name) =>
        mkdir(path.join(directory, "src", name), { recursive: true }),
      ),
    );
    const files = {
      "package.json": JSON.stringify({
        name: "synthetic-environment-boundary",
      }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: { module: "ESNext", moduleResolution: "bundler" },
        include: ["src/**/*.ts"],
      }),
      "src/application/service.ts": [
        "const direct = process.env;",
        'const computed = process["env"];',
        "const optional = process?.env;",
        "const global = globalThis.process.env;",
        'const globalComputed = globalThis["process"]["env"];',
        'const globalOptional = globalThis?.["process"]?.env;',
        "const grouped = (globalThis.process).env;",
        "const wrapped = (globalThis.process.env);",
        "const asserted = process['env' as const];",
        "const assertedGlobal = globalThis['process' as const]['env' as const];",
        "const assertedReceiver = (globalThis.process as typeof process).env;",
        'const text = "process.env";',
        "// process.env",
        "const { env } = process;",
        "const { env: configured } = globalThis.process;",
        "const { ['env' as const]: assertedBinding } = globalThis['process' as const];",
        "let assigned; ({ env: assigned } = globalThis.process);",
        "const unrelated = other.env;",
        "const otherProcess = other.process.env;",
        "const { env: otherEnvironment } = other.process;",
      ].join("\n"),
      "src/contracts/settings.ts": "const direct = process.env;",
      "src/infrastructure/config.ts": "const allowed = process.env;",
    };
    await Promise.all(
      Object.entries(files).map(([name, content]) =>
        writeFile(path.join(directory, name), content),
      ),
    );

    const result = await checkBoundaries(directory);
    assert.equal(result.files, 3);
    assert.equal(result.violations.length, 16);
    for (const location of [
      `${path.join("src", "application", "service.ts")}:1:`,
      `${path.join("src", "application", "service.ts")}:2:`,
      `${path.join("src", "application", "service.ts")}:3:`,
      `${path.join("src", "application", "service.ts")}:4:`,
      `${path.join("src", "application", "service.ts")}:5:`,
      `${path.join("src", "application", "service.ts")}:6:`,
      `${path.join("src", "application", "service.ts")}:7:`,
      `${path.join("src", "application", "service.ts")}:8:`,
      `${path.join("src", "application", "service.ts")}:9:`,
      `${path.join("src", "application", "service.ts")}:10:`,
      `${path.join("src", "application", "service.ts")}:11:`,
      `${path.join("src", "application", "service.ts")}:14:`,
      `${path.join("src", "application", "service.ts")}:15:`,
      `${path.join("src", "application", "service.ts")}:16:`,
      `${path.join("src", "application", "service.ts")}:17:`,
      `${path.join("src", "contracts", "settings.ts")}:1:`,
    ])
      assert.ok(
        result.violations.some(
          (violation) =>
            violation.startsWith(location) &&
            violation.includes("must not read environment configuration"),
        ),
        location,
      );
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), parent);
    assert.ok(path.basename(directory).startsWith("kernel-boundaries-env-"));
    await rm(directory, { force: true, recursive: true });
  }
});

test("ESLint enforces environment ownership for bare and global process access", async () => {
  const eslint = new ESLint();
  const restricted = (messages) =>
    messages.filter(
      (message) => message.ruleId === "foundation/environment-ownership",
    );
  for (const source of [
    "process.env;",
    'process["env"];',
    "globalThis.process.env;",
    'globalThis.process["env"];',
    'globalThis["process"].env;',
    'globalThis["process"]["env"];',
    'globalThis?.["process"]?.env;',
    "(globalThis.process).env;",
    "(globalThis.process.env);",
    "const { env } = process;",
    "const { env: configured } = globalThis.process;",
    'const { ["env"]: configured } = globalThis["process"];',
    "let configured; ({ env: configured } = globalThis.process);",
  ]) {
    for (const filePath of [
      "src/application/service.ts",
      "src/contracts/helper.js",
    ]) {
      const [result] = await eslint.lintText(source, { filePath });
      assert.equal(
        restricted(result.messages).length,
        1,
        `${filePath}: ${source}`,
      );
    }
    const [infrastructure] = await eslint.lintText(source, {
      filePath: "src/infrastructure/config.ts",
    });
    assert.deepEqual(restricted(infrastructure.messages), []);
  }
  const [unrelated] = await eslint.lintText("other.process.env;", {
    filePath: "src/application/service.ts",
  });
  assert.deepEqual(restricted(unrelated.messages), []);
  for (const source of [
    "process['env' as const];",
    "process[('env' as string) as 'env'];",
    "process[('env' as 'env')!];",
    "process['env' satisfies string];",
    "process[<'env'>'env'];",
    "globalThis['process' as const]['env' as const];",
    "(globalThis.process as typeof process).env;",
    "const { ['env' as const]: configured } = globalThis.process;",
    "function settings({ env: configured } = globalThis.process) { return configured; }",
  ]) {
    const [result] = await eslint.lintText(source, {
      filePath: "src/application/service.ts",
    });
    assert.equal(restricted(result.messages).length, 1, source);
  }
});

test("directory aliases resolve local imports while preserving repository containment", async (t) => {
  const parent = await realpath(tmpdir());
  const directory = await mkdtemp(
    path.join(parent, "kernel-boundaries-alias-"),
  );
  try {
    const actual = path.join(directory, "project");
    const alias = path.join(directory, "alias");
    await mkdir(path.join(actual, "src/application/ports"), {
      recursive: true,
    });
    const files = {
      "package.json": JSON.stringify({ name: "synthetic-alias-boundary" }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: { module: "ESNext", moduleResolution: "bundler" },
        include: ["src/**/*.ts"],
      }),
      "src/application/ports/local.ts": "export type Port = { id: string };",
      "src/application/service.ts":
        'import type { Port } from "./ports/local.ts"; export type Local = Port;',
    };
    await Promise.all(
      Object.entries(files).map(([name, content]) =>
        writeFile(path.join(actual, name), content),
      ),
    );
    try {
      await symlink(
        actual,
        alias,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if (error.code === "EPERM" || error.code === "EACCES")
        return t.skip("Directory symlinks unavailable");
      throw error;
    }

    const result = await checkBoundaries(alias);
    assert.deepEqual(result, { files: 2, violations: [] });
    await writeFile(
      path.join(directory, "outside.ts"),
      "export type Outside = string;",
    );
    await writeFile(
      path.join(actual, "src/application/outside.ts"),
      'import type { Outside } from "../../../outside.ts"; export type Value = Outside;',
    );
    const escaped = await checkBoundaries(alias);
    assert.equal(escaped.files, 3);
    assert.equal(escaped.violations.length, 1);
    assert.match(
      escaped.violations[0],
      /Source imports must not escape this repository/,
    );
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), parent);
    assert.ok(path.basename(directory).startsWith("kernel-boundaries-alias-"));
    await rm(directory, { force: true, recursive: true });
  }
});
