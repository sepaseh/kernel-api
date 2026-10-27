import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  inspectBootstrap,
  validateBootstrapPolicy,
} from "./validate-bootstrap.mjs";

const coreFiles = [
  ".github/bootstrap-policy.json",
  ".github/workflows/bootstrap.yml",
  ".github/workflows/pr-policy.yml",
  "scripts/check-pr-size.mjs",
  "scripts/check-pr-size.test.mjs",
  "scripts/validate-bootstrap.mjs",
  "scripts/validate-bootstrap.test.mjs",
];
const policy = (overrides = {}) => ({
  allowedFiles: coreFiles,
  applicationReady: false,
  maximumChangedFiles: 100,
  phase: "governance",
  schemaVersion: 1,
  ...overrides,
});

const foundationFiles = [
  ...coreFiles.filter((file) => file !== ".github/workflows/bootstrap.yml"),
  ".agents/validation.json",
  ".github/workflows/ci.yml",
  "package.json",
  "package-lock.json",
  "scripts/validate.mjs",
  "scripts/validate.test.mjs",
  "scripts/check-ci.mjs",
  "scripts/check-ci.test.mjs",
  "src/foundation.test.ts",
  "src/validation.test.ts",
  "tsconfig.json",
];
const foundationPolicy = (overrides = {}) =>
  policy({
    allowedFiles: foundationFiles,
    phase: "foundation",
    ...overrides,
  });
const serviceFiles = [
  "account",
  "auth",
  "calendar",
  "files",
  "roles",
  "settings",
  "users",
].map((name) => `src/application/${name}.ts`);
const serviceTests = ["account", "auth", "files", "management", "users"].map(
  (name) => `src/${name}-application.test.ts`,
);
const applicationServicesFiles = [
  ...foundationFiles,
  ...serviceFiles,
  ...serviceTests,
];
const applicationServicesPolicy = (overrides = {}) =>
  foundationPolicy({
    allowedFiles: applicationServicesFiles,
    phase: "application-services",
    ...overrides,
  });
const localizationFiles = [
  ...["ar", "de", "en", "es", "fa", "fr", "it", "pt", "ru", "tr", "index"].map(
    (code) => `src/infrastructure/localization/catalogs/${code}.ts`,
  ),
  "src/catalogs.test.ts",
];
const localizationPolicy = (overrides = {}) =>
  applicationServicesPolicy({
    allowedFiles: [...applicationServicesFiles, ...localizationFiles],
    phase: "localization-data",
    ...overrides,
  });
const infrastructureSupportFiles = [
  "src/infrastructure/config.ts",
  "src/infrastructure/lifecycle.ts",
  "src/infrastructure/localization/i18n.ts",
  "src/infrastructure/logging/logger.ts",
  "src/infrastructure/logging/sanitization.ts",
  "src/config.test.ts",
  "src/lifecycle.test.ts",
  "src/localization.test.ts",
  "src/logger.test.ts",
];
const infrastructureSupportPolicy = (overrides = {}) =>
  localizationPolicy({
    allowedFiles: [
      ...localizationPolicy().allowedFiles,
      ...infrastructureSupportFiles,
    ],
    phase: "infrastructure-support",
    ...overrides,
  });
const localStorageFiles = [
  "src/infrastructure/storage/local.ts",
  "src/infrastructure/storage/operations.ts",
  "src/local-storage.test.ts",
];
const localStoragePolicy = (overrides = {}) =>
  infrastructureSupportPolicy({
    allowedFiles: [
      ...infrastructureSupportPolicy().allowedFiles,
      ...localStorageFiles,
    ],
    phase: "storage-local",
    ...overrides,
  });
const objectStorageFiles = [
  "src/infrastructure/storage/minio.ts",
  "src/infrastructure/storage/create.ts",
  "src/infrastructure/storage/url.ts",
  "src/object-storage.test.ts",
  "docs/object-storage.md",
  "docs/object-storage.fa.md",
];
const objectStoragePolicy = (overrides = {}) =>
  localStoragePolicy({
    allowedFiles: [...localStoragePolicy().allowedFiles, ...objectStorageFiles],
    phase: "storage-adapters",
    ...overrides,
  });
const databaseFiles = [
  "src/infrastructure/db/client.ts",
  "src/infrastructure/db/schema.ts",
  ...[
    "account",
    "calendar",
    "errors",
    "files",
    "identity",
    "roles",
    "settings",
    "users",
  ].map((name) => `src/infrastructure/persistence/${name}.ts`),
  "src/management-services.test.ts",
  "src/users-lifecycle.test.ts",
  "src/persistence.test.ts",
  "docs/database-schema.md",
  "docs/database-schema.fa.md",
  ...[
    "0000_init_backend",
    "0001_optional_profile_email",
    "0002_bind_otp_subject",
    "0003_outgoing_mauler",
    "0004_protect_referenced_users",
    "0005_protect_referenced_logos",
  ].map((name) => `drizzle/${name}.sql`),
  ...[
    "0000_snapshot",
    "0001_snapshot",
    "0002_snapshot",
    "0003_snapshot",
    "0004_snapshot",
    "0005_snapshot",
    "_journal",
  ].map((name) => `drizzle/meta/${name}.json`),
];
const databasePolicy = (overrides = {}) =>
  objectStoragePolicy({
    allowedFiles: [...objectStoragePolicy().allowedFiles, ...databaseFiles],
    phase: "database-persistence",
    ...overrides,
  });

const fixture = async (context, declaredPolicy = policy()) => {
  const parent = path.resolve(os.tmpdir());
  const root = await mkdtemp(path.join(parent, "kernel-bootstrap-test-"));
  context.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), parent);
    assert.ok(path.basename(root).startsWith("kernel-bootstrap-test-"));
    await rm(root, { force: true, recursive: true });
  });
  const put = async (file, content) => {
    const absolute = path.join(root, file);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  };
  for (const file of declaredPolicy.allowedFiles)
    await put(
      file,
      file.endsWith(".json")
        ? JSON.stringify(file === coreFiles[0] ? declaredPolicy : {})
        : "// synthetic fixture\n",
    );
  return { put, root };
};

test("accepts only the declared governance phase and immutable 100-file maximum", () => {
  assert.equal(validateBootstrapPolicy(policy()).size, coreFiles.length);
  for (const overrides of [
    { phase: "application" },
    { applicationReady: true },
    { maximumChangedFiles: 101 },
    { schemaVersion: 2 },
    { allowedFiles: [] },
    { allowedFiles: coreFiles.slice(1) },
  ])
    assert.throws(() => validateBootstrapPolicy(policy(overrides)));
});

test("rejects wildcard, escaping, private, duplicate and application import paths", () => {
  for (const file of [
    "src/index.ts",
    "drizzle/0000.sql",
    "collection/auth/index.bru",
    "package.json",
    "package-lock.json",
    "server/data/live.sqlite",
    ".env.local",
    ".agents/settings.local.json",
    "docs/**",
    "../outside.md",
    "/absolute.md",
    "C:/outside.md",
    "docs\\outside.md",
    coreFiles[0],
  ])
    assert.throws(() =>
      validateBootstrapPolicy(policy({ allowedFiles: [...coreFiles, file] })),
    );
});

test("validates an isolated exact snapshot and states that the API is not ready", async (context) => {
  const { root } = await fixture(context);
  await mkdir(path.join(root, ".git"));
  assert.deepEqual(await inspectBootstrap(root), {
    applicationReady: false,
    files: coreFiles.length,
    phase: "governance",
    scope:
      "Published governance files only; API runtime is not published or validated.",
  });
});

test("fails for missing declared files and ambient untracked application files", async (context) => {
  const { put, root } = await fixture(context);
  await rm(path.join(root, coreFiles[1]));
  await assert.rejects(inspectBootstrap(root), /missing declared files/);
  await put(coreFiles[1], "name: Bootstrap\n");
  await put("src/index.ts", "throw new Error('must never run');\n");
  await assert.rejects(
    inspectBootstrap(root),
    /Unexpected bootstrap path: src/,
  );
});

test("fails before reading unexpected private files or following links", async (context) => {
  const { put, root } = await fixture(context);
  await put(".env.local", "synthetic-private-fixture\n");
  await assert.rejects(inspectBootstrap(root), /Unexpected bootstrap path/);
  await rm(path.join(root, ".env.local"));
  await symlink(
    path.join(root, "scripts"),
    path.join(root, "linked-scripts"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(inspectBootstrap(root), /symbolic links/);
});

test("rejects invalid JSON and invalid JavaScript without executing it", async (context) => {
  const { put, root } = await fixture(context);
  await put(coreFiles[3], "const = ;\n");
  await assert.rejects(inspectBootstrap(root), /JavaScript syntax is invalid/);
  await put(
    coreFiles[3],
    "throw new Error('syntax check must not execute');\n",
  );
  assert.equal((await inspectBootstrap(root)).applicationReady, false);
  await put(coreFiles[0], "not json");
  await assert.rejects(inspectBootstrap(root), SyntaxError);
});

test("foundation allows its pure source and toolchain, while rejecting runnable API paths", () => {
  assert.equal(
    validateBootstrapPolicy(foundationPolicy()).size,
    foundationFiles.length,
  );
  for (const file of [
    "src/index.ts",
    "src/composition.ts",
    "src/application/auth.ts",
    "src/infrastructure/db/client.ts",
    "src/presentation/http/app.ts",
    "drizzle.config.ts",
  ])
    assert.throws(() =>
      validateBootstrapPolicy(
        foundationPolicy({ allowedFiles: [...foundationFiles, file] }),
      ),
    );
  assert.throws(
    () =>
      validateBootstrapPolicy(
        foundationPolicy({
          allowedFiles: foundationFiles.filter(
            (file) => file !== "package-lock.json",
          ),
        }),
      ),
    /mandatory/,
  );
});

test("application-services requires every declared service and its pure behavior tests", () => {
  assert.equal(
    validateBootstrapPolicy(applicationServicesPolicy()).size,
    applicationServicesFiles.length,
  );
  for (const file of [...serviceFiles, ...serviceTests, "package-lock.json"])
    assert.throws(
      () =>
        validateBootstrapPolicy(
          applicationServicesPolicy({
            allowedFiles: applicationServicesFiles.filter(
              (declared) => declared !== file,
            ),
          }),
        ),
      /mandatory/,
    );
});

test("application-services rejects unrelated source, concrete adapters and runnable entry points", () => {
  for (const file of [
    "src/index.ts",
    "src/composition.ts",
    "src/application/unreviewed.ts",
    "src/infrastructure/db/client.ts",
    "src/presentation/http/app.ts",
    "src/management-services.test.ts",
    "src/other.test.ts",
    "drizzle.config.ts",
    "drizzle/0000.sql",
  ])
    assert.throws(() =>
      validateBootstrapPolicy(
        applicationServicesPolicy({
          allowedFiles: [...applicationServicesFiles, file],
        }),
      ),
    );
  assert.throws(() =>
    validateBootstrapPolicy(
      applicationServicesPolicy({ applicationReady: true }),
    ),
  );
});

test("application-services inspects its exact non-runnable snapshot", async (context) => {
  const { root, put } = await fixture(context, applicationServicesPolicy());
  await mkdir(path.join(root, "node_modules"));
  await mkdir(path.join(root, "coverage"));
  assert.deepEqual(await inspectBootstrap(root), {
    applicationReady: false,
    files: applicationServicesFiles.length,
    phase: "application-services",
    scope:
      "Published contracts, core, ports and application services; HTTP, database and concrete adapters are not published or validated.",
  });
  await put(
    "src/ambient-application.test.ts",
    "// synthetic undeclared test\n",
  );
  await assert.rejects(inspectBootstrap(root), /Unexpected bootstrap path/);
});

test("localization-data requires the complete catalogs, registry and data tests", () => {
  const declared = localizationPolicy();
  assert.equal(
    validateBootstrapPolicy(declared).size,
    declared.allowedFiles.length,
  );
  for (const file of [...localizationFiles, ...serviceFiles, ...serviceTests])
    assert.throws(
      () =>
        validateBootstrapPolicy(
          localizationPolicy({
            allowedFiles: declared.allowedFiles.filter((item) => item !== file),
          }),
        ),
      /mandatory/,
    );
});

test("localization-data cannot admit a translation engine, arbitrary catalogs or runtime adapters", () => {
  for (const file of [
    "src/infrastructure/localization/i18n.ts",
    "src/infrastructure/localization/catalogs/unknown.ts",
    "src/infrastructure/localization/catalogs/nested/en.ts",
    "src/infrastructure/db/client.ts",
    "src/presentation/http/app.ts",
    "src/composition.ts",
    "src/index.ts",
    "src/unrelated.test.ts",
  ])
    assert.throws(() =>
      validateBootstrapPolicy(
        localizationPolicy({
          allowedFiles: [...localizationPolicy().allowedFiles, file],
        }),
      ),
    );
  assert.throws(() =>
    validateBootstrapPolicy(localizationPolicy({ applicationReady: true })),
  );
  for (const phase of ["foundation", "application-services"])
    assert.throws(() => validateBootstrapPolicy(localizationPolicy({ phase })));
});

test("localization-data inspects its complete non-runnable snapshot", async (context) => {
  const declared = localizationPolicy();
  const { root } = await fixture(context, declared);
  assert.deepEqual(await inspectBootstrap(root), {
    applicationReady: false,
    files: declared.allowedFiles.length,
    phase: "localization-data",
    scope:
      "Published contracts, application services and static translation catalogs; translation engine, HTTP, database and concrete adapters are not published or validated.",
  });
});

test("infrastructure-support requires each support module and its genuine tests", () => {
  const declared = infrastructureSupportPolicy();
  assert.equal(
    validateBootstrapPolicy(declared).size,
    declared.allowedFiles.length,
  );
  for (const file of [
    ...infrastructureSupportFiles,
    ...localizationFiles,
    ...serviceFiles,
    ...serviceTests,
  ])
    assert.throws(
      () =>
        validateBootstrapPolicy(
          infrastructureSupportPolicy({
            allowedFiles: declared.allowedFiles.filter((item) => item !== file),
          }),
        ),
      /mandatory/,
    );
});

test("support publication does not admit a server, concrete adapters or arbitrary infrastructure", () => {
  for (const file of [
    "src/index.ts",
    "src/composition.ts",
    "src/infrastructure/db/client.ts",
    "src/infrastructure/auth/better-auth.ts",
    "src/infrastructure/storage/local.ts",
    "src/presentation/http/app.ts",
    "src/infrastructure/logging/unreviewed.ts",
    "src/unrelated.test.ts",
  ])
    assert.throws(() =>
      validateBootstrapPolicy(
        infrastructureSupportPolicy({
          allowedFiles: [...infrastructureSupportPolicy().allowedFiles, file],
        }),
      ),
    );
  assert.throws(() =>
    validateBootstrapPolicy(
      infrastructureSupportPolicy({ applicationReady: true }),
    ),
  );
  assert.throws(() =>
    validateBootstrapPolicy(
      infrastructureSupportPolicy({ phase: "localization-data" }),
    ),
  );
});

test("infrastructure-support validates its complete non-runnable snapshot", async (context) => {
  const declared = infrastructureSupportPolicy();
  const { root } = await fixture(context, declared);
  assert.deepEqual(await inspectBootstrap(root), {
    applicationReady: false,
    files: declared.allowedFiles.length,
    phase: "infrastructure-support",
    scope:
      "Published contracts, application services, translation engine, configuration and logging/lifecycle support; HTTP, database and authentication/storage adapters are not published or validated.",
  });
});

test("the 100-file limit applies to a PR delta rather than the total published inventory", () => {
  const files = [
    ...foundationFiles,
    ...Array.from({ length: 110 }, (_, index) => `docs/topic-${index}.md`),
  ];
  assert.equal(
    validateBootstrapPolicy(foundationPolicy({ allowedFiles: files })).size,
    files.length,
  );
  assert.throws(() =>
    validateBootstrapPolicy(foundationPolicy({ maximumChangedFiles: 101 })),
  );
});

test("storage-local requires its adapters and actual filesystem tests without admitting unpublished infrastructure", () => {
  const declared = localStoragePolicy();
  assert.equal(
    validateBootstrapPolicy(declared).size,
    declared.allowedFiles.length,
  );
  for (const file of [...localStorageFiles, ...infrastructureSupportFiles]) {
    assert.throws(
      () =>
        validateBootstrapPolicy(
          localStoragePolicy({
            allowedFiles: declared.allowedFiles.filter((item) => item !== file),
          }),
        ),
      /mandatory/,
    );
  }
  for (const file of [
    "src/infrastructure/storage/minio.ts",
    "src/infrastructure/storage/create.ts",
    "src/infrastructure/storage/memory.ts",
    "src/infrastructure/storage/url.ts",
    "src/infrastructure/db/client.ts",
    "src/infrastructure/auth/better-auth.ts",
    "src/presentation/http/app.ts",
    "src/index.ts",
    "src/composition.ts",
  ])
    assert.throws(() =>
      validateBootstrapPolicy(
        localStoragePolicy({
          allowedFiles: [...declared.allowedFiles, file],
        }),
      ),
    );
  assert.throws(() =>
    validateBootstrapPolicy(localStoragePolicy({ applicationReady: true })),
  );
  assert.throws(() =>
    validateBootstrapPolicy(
      localStoragePolicy({ phase: "infrastructure-support" }),
    ),
  );
});

test("storage-local validates only its exact non-runnable snapshot", async (context) => {
  const declared = localStoragePolicy();
  const { root } = await fixture(context, declared);
  assert.deepEqual(await inspectBootstrap(root), {
    applicationReady: false,
    files: declared.allowedFiles.length,
    phase: "storage-local",
    scope:
      "Published application services, infrastructure support and local filesystem storage; HTTP, database, authentication and MinIO adapters are not published or validated.",
  });
});

test("storage-adapters requires the complete adapters, protocol tests and bilingual trust-boundary docs", () => {
  const declared = objectStoragePolicy();
  assert.equal(
    validateBootstrapPolicy(declared).size,
    declared.allowedFiles.length,
  );
  for (const file of [
    ...objectStorageFiles,
    ...localStorageFiles,
    ...infrastructureSupportFiles,
  ])
    assert.throws(
      () =>
        validateBootstrapPolicy(
          objectStoragePolicy({
            allowedFiles: declared.allowedFiles.filter((item) => item !== file),
          }),
        ),
      /mandatory/,
    );
});

test("storage-adapters does not admit unused helpers, application composition or runtime layers through the inventory", () => {
  const declared = objectStoragePolicy();
  for (const file of [
    "src/infrastructure/storage/memory.ts",
    "src/infrastructure/storage/unreviewed.ts",
    "src/infrastructure/db/client.ts",
    "src/infrastructure/auth/better-auth.ts",
    "src/presentation/http/app.ts",
    "src/index.ts",
    "src/composition.ts",
    "src/unrelated.test.ts",
    "apps/api/index.ts",
    "packages/contracts/index.ts",
    ".env.local",
    "credentials.key",
  ])
    assert.throws(() =>
      validateBootstrapPolicy(
        objectStoragePolicy({
          allowedFiles: [...declared.allowedFiles, file],
        }),
      ),
    );
  assert.throws(() =>
    validateBootstrapPolicy(objectStoragePolicy({ applicationReady: true })),
  );
  assert.throws(() =>
    validateBootstrapPolicy(objectStoragePolicy({ maximumChangedFiles: 101 })),
  );
  assert.throws(() =>
    validateBootstrapPolicy(objectStoragePolicy({ phase: "storage-local" })),
  );
});

test("storage-adapters inspects the exact non-runnable snapshot and rejects ambient unreviewed source", async (context) => {
  const declared = objectStoragePolicy();
  const { root, put } = await fixture(context, declared);
  assert.deepEqual(await inspectBootstrap(root), {
    applicationReady: false,
    files: declared.allowedFiles.length,
    phase: "storage-adapters",
    scope:
      "Published application services, infrastructure support, local and S3-compatible MinIO storage, adapter selection and URL helpers; HTTP, database, authentication, deployed MinIO integration and application composition are not published or validated.",
  });
  await put(
    "src/infrastructure/storage/memory.ts",
    "throw new Error('must not execute');\n",
  );
  await assert.rejects(inspectBootstrap(root), /Unexpected bootstrap path/);
});

test("database-persistence requires all declared adapters, migration history, real tests and bilingual schema documentation", () => {
  const declared = databasePolicy();
  assert.equal(
    validateBootstrapPolicy(declared).size,
    declared.allowedFiles.length,
  );
  for (const file of [
    ...databaseFiles,
    ...objectStorageFiles,
    ...infrastructureSupportFiles,
  ])
    assert.throws(
      () =>
        validateBootstrapPolicy(
          databasePolicy({
            allowedFiles: declared.allowedFiles.filter((item) => item !== file),
          }),
        ),
      /mandatory/,
    );
});

test("database-persistence cannot admit undeclared migrations or unpublished authentication, initialization and HTTP through the inventory", () => {
  const declared = databasePolicy();
  for (const file of [
    "drizzle/0006_unreviewed.sql",
    "drizzle/meta/0006_snapshot.json",
    "drizzle/extra/_journal.json",
    "drizzle.config.ts",
    "src/infrastructure/persistence/auth.ts",
    "src/infrastructure/db/initialize.ts",
    "src/infrastructure/auth/otp.ts",
    "src/infrastructure/auth/better-auth.ts",
    "src/infrastructure/admin/bootstrap.ts",
    "src/presentation/http/app.ts",
    "src/index.ts",
    "src/composition.ts",
    "src/infrastructure/storage/memory.ts",
    "src/unrelated.test.ts",
  ])
    assert.throws(() =>
      validateBootstrapPolicy(
        databasePolicy({ allowedFiles: [...declared.allowedFiles, file] }),
      ),
    );
  for (const phase of [
    "governance",
    "foundation",
    "application-services",
    "localization-data",
    "infrastructure-support",
    "storage-local",
    "storage-adapters",
  ])
    assert.throws(() => validateBootstrapPolicy(databasePolicy({ phase })));
  assert.throws(() =>
    validateBootstrapPolicy(databasePolicy({ applicationReady: true })),
  );
  assert.throws(() =>
    validateBootstrapPolicy(databasePolicy({ maximumChangedFiles: 101 })),
  );
});

test("database-persistence inspects its complete non-runnable snapshot and rejects ambient migration files", async (context) => {
  const declared = databasePolicy();
  const { root, put } = await fixture(context, declared);
  assert.deepEqual(await inspectBootstrap(root), {
    applicationReady: false,
    files: declared.allowedFiles.length,
    phase: "database-persistence",
    scope:
      "Published application services, infrastructure support, storage adapters and concrete libsql/Drizzle schema, migrations and non-authentication persistence with disposable local-database tests; HTTP, authentication/OTP, initialization, deployed database/storage services and application composition are not published or validated.",
  });
  await put("drizzle/0006_ambient.sql", "-- must not execute\n");
  await assert.rejects(inspectBootstrap(root), /Unexpected bootstrap path/);
});

test("foundation validates its exact source while ignoring only ordinary generated root directories", async (context) => {
  const { root, put } = await fixture(context, foundationPolicy());
  await mkdir(path.join(root, "node_modules"));
  await mkdir(path.join(root, "coverage"));
  await put("node_modules/ignored.json", "not parsed");
  await put("coverage/ignored.json", "not parsed");
  const result = await inspectBootstrap(root);
  assert.equal(result.phase, "foundation");
  assert.equal(result.applicationReady, false);
  assert.equal(result.files, foundationFiles.length);
  await put("src/undeclared.ts", "throw new Error('not run');");
  await assert.rejects(inspectBootstrap(root), /Unexpected bootstrap path/);
});

test("generated output names cannot hide files or links", async (context) => {
  const { root, put } = await fixture(context, foundationPolicy());
  await put("coverage", "not a directory");
  await assert.rejects(inspectBootstrap(root), /ordinary root directory/);
  await rm(path.join(root, "coverage"));
  await symlink(
    path.join(root, "src"),
    path.join(root, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(inspectBootstrap(root), /ordinary root directory/);
});
