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

const authBootstrapFiles = [
  "docs/auth-adapters.md",
  "docs/auth-adapters.fa.md",
  "scripts/auth-bootstrap-integration.test.mjs",
  "scripts/auth-identity-integration.test.mjs",
  "src/auth-gateway.test.ts",
  "src/bootstrap-admin.ts",
  "src/infrastructure/admin/bootstrap.ts",
  "src/infrastructure/auth/better-auth.ts",
  "src/infrastructure/auth/gateway.ts",
  "src/infrastructure/auth/otp.ts",
  "src/infrastructure/db/initialize.ts",
  "src/infrastructure/persistence/auth.ts",
];
const authBootstrapPolicy = (overrides = {}) =>
  databasePolicy({
    allowedFiles: [...databasePolicy().allowedFiles, ...authBootstrapFiles],
    phase: "auth-bootstrap",
    ...overrides,
  });

const httpTransportFiles = [
  "docs/http-transport.md",
  "docs/http-transport.fa.md",
  "scripts/http-upload-loopback.test.mjs",
  "src/http-transport.test.ts",
  "src/upload-body-limit.test.ts",
  "src/app.test.ts",
  "src/input-validation-http.test.ts",
  "src/deletion-lifecycle-http.test.ts",
  "src/request-logging.test.ts",
  "src/architecture.test.ts",
  "src/test/create-app-fixture.ts",
  "src/test/composition-dependencies.ts",
  "src/test/logging.ts",
  "src/test/memory-object-storage.ts",
  ...["app", "auth-attempts", "dependencies", "http", "request-logging"].map(
    (name) => `src/presentation/http/${name}.ts`,
  ),
  ...["account", "auth", "calendar", "files", "roles", "settings", "users"].map(
    (name) => `src/presentation/http/routes/${name}.ts`,
  ),
];
const httpTransportPolicy = (overrides = {}) =>
  authBootstrapPolicy({
    allowedFiles: [
      ...authBootstrapPolicy().allowedFiles,
      ...httpTransportFiles,
    ],
    phase: "http-transport",
    ...overrides,
  });

const collectionFiles = [
  "collection/calendar/create/400.json",
  "collection/calendar/create/401.json",
  "collection/calendar/create/403.json",
  "collection/calendar/create/index.bru",
  "collection/calendar/delete/401.json",
  "collection/calendar/delete/403.json",
  "collection/calendar/delete/404.json",
  "collection/calendar/delete/index.bru",
  "collection/calendar/folder.bru",
  "collection/calendar/list/200.json",
  "collection/calendar/list/401.json",
  "collection/calendar/list/403.json",
  "collection/calendar/list/index.bru",
  "collection/files/content/404.json",
  "collection/files/content/index.bru",
  "collection/files/folder.bru",
  "collection/files/upload/201.json",
  "collection/files/upload/400.json",
  "collection/files/upload/401.json",
  "collection/files/upload/403.json",
  "collection/files/upload/413.json",
  "collection/files/upload/415.json",
  "collection/files/upload/index.bru",
  "collection/languages/folder.bru",
  "collection/languages/list/200.json",
  "collection/languages/list/401.json",
  "collection/languages/list/index.bru",
  "collection/settings/folder.bru",
  "collection/settings/get/200.json",
  "collection/settings/get/index.bru",
  "collection/settings/update/200.json",
  "collection/settings/update/400.json",
  "collection/settings/update/401.json",
  "collection/settings/update/403.json",
  "collection/settings/update/404.json",
  "collection/settings/update/index.bru",
  "collection/README.fa.md",
  "collection/README.md",
  "collection/account/folder.bru",
  "collection/account/me/200.json",
  "collection/account/me/401.json",
  "collection/account/me/index.bru",
  "collection/account/request-email-verification/200.json",
  "collection/account/request-email-verification/400.json",
  "collection/account/request-email-verification/401.json",
  "collection/account/request-email-verification/429.json",
  "collection/account/request-email-verification/index.bru",
  "collection/account/request-mobile-verification/200.json",
  "collection/account/request-mobile-verification/429.json",
  "collection/account/request-mobile-verification/index.bru",
  "collection/account/update-profile/200.json",
  "collection/account/update-profile/400.json",
  "collection/account/update-profile/401.json",
  "collection/account/update-profile/429.json",
  "collection/account/update-profile/index.bru",
  "collection/account/update-username/200.json",
  "collection/account/update-username/400.json",
  "collection/account/update-username/401.json",
  "collection/account/update-username/index.bru",
  "collection/account/verify-email/400.json",
  "collection/account/verify-email/401.json",
  "collection/account/verify-email/429.json",
  "collection/account/verify-email/index.bru",
  "collection/auth/change-password/400.json",
  "collection/auth/change-password/401.json",
  "collection/auth/change-password/500.json",
  "collection/auth/change-password/index.bru",
  "collection/auth/folder.bru",
  "collection/auth/forgot-password/400.json",
  "collection/auth/forgot-password/429.json",
  "collection/auth/forgot-password/index.bru",
  "collection/auth/login/200.json",
  "collection/auth/login/400.json",
  "collection/auth/login/429.json",
  "collection/auth/login/500.json",
  "collection/auth/login/index.bru",
  "collection/auth/logout/index.bru",
  "collection/auth/otp-request/200.json",
  "collection/auth/otp-request/400.json",
  "collection/auth/otp-request/429.json",
  "collection/auth/otp-request/index.bru",
  "collection/auth/refresh-token/200.json",
  "collection/auth/refresh-token/401.json",
  "collection/auth/refresh-token/index.bru",
  "collection/auth/register/201.json",
  "collection/auth/register/400.json",
  "collection/auth/register/429.json",
  "collection/auth/register/500.json",
  "collection/auth/register/index.bru",
  "collection/bruno.json",
  "collection/collection.bru",
  "scripts/collection.test.mjs",
  "collection/roles/create/201.json",
  "collection/roles/create/400.json",
  "collection/roles/create/401.json",
  "collection/roles/create/403.json",
  "collection/roles/create/index.bru",
  "collection/roles/delete/401.json",
  "collection/roles/delete/403.json",
  "collection/roles/delete/404.json",
  "collection/roles/delete/409.json",
  "collection/roles/delete/index.bru",
  "collection/roles/details/200.json",
  "collection/roles/details/401.json",
  "collection/roles/details/403.json",
  "collection/roles/details/404.json",
  "collection/roles/details/index.bru",
  "collection/roles/folder.bru",
  "collection/roles/list/200.json",
  "collection/roles/list/401.json",
  "collection/roles/list/403.json",
  "collection/roles/list/index.bru",
  "collection/roles/permissions/folder.bru",
  "collection/roles/permissions/list/200.json",
  "collection/roles/permissions/list/401.json",
  "collection/roles/permissions/list/403.json",
  "collection/roles/permissions/list/index.bru",
  "collection/roles/update/200.json",
  "collection/roles/update/400.json",
  "collection/roles/update/401.json",
  "collection/roles/update/403.json",
  "collection/roles/update/404.json",
  "collection/roles/update/index.bru",
  "collection/users/create/201.json",
  "collection/users/create/400.json",
  "collection/users/create/401.json",
  "collection/users/create/403.json",
  "collection/users/create/500.json",
  "collection/users/create/index.bru",
  "collection/users/delete/401.json",
  "collection/users/delete/403.json",
  "collection/users/delete/404.json",
  "collection/users/delete/409.json",
  "collection/users/delete/index.bru",
  "collection/users/details/200.json",
  "collection/users/details/401.json",
  "collection/users/details/403.json",
  "collection/users/details/404.json",
  "collection/users/details/index.bru",
  "collection/users/folder.bru",
  "collection/users/list/200.json",
  "collection/users/list/401.json",
  "collection/users/list/403.json",
  "collection/users/list/index.bru",
  "collection/users/request-mobile-verification/200.json",
  "collection/users/request-mobile-verification/429.json",
  "collection/users/request-mobile-verification/index.bru",
  "collection/users/update-password/400.json",
  "collection/users/update-password/401.json",
  "collection/users/update-password/403.json",
  "collection/users/update-password/404.json",
  "collection/users/update-password/index.bru",
  "collection/users/update-roles/400.json",
  "collection/users/update-roles/401.json",
  "collection/users/update-roles/403.json",
  "collection/users/update-roles/404.json",
  "collection/users/update-roles/index.bru",
  "collection/users/update-status/400.json",
  "collection/users/update-status/401.json",
  "collection/users/update-status/403.json",
  "collection/users/update-status/404.json",
  "collection/users/update-status/409.json",
  "collection/users/update-status/index.bru",
  "collection/users/update-system-admin/400.json",
  "collection/users/update-system-admin/401.json",
  "collection/users/update-system-admin/403.json",
  "collection/users/update-system-admin/404.json",
  "collection/users/update-system-admin/409.json",
  "collection/users/update-system-admin/index.bru",
  "collection/users/update/200.json",
  "collection/users/update/400.json",
  "collection/users/update/401.json",
  "collection/users/update/403.json",
  "collection/users/update/404.json",
  "collection/users/update/429.json",
  "collection/users/update/index.bru",
];
const operationsFiles = [
  ".dockerignore",
  ".github/workflows/staging.yml",
  ".github/workflows/deployment-smoke.yml",
  ".github/workflows/dast.yml",
  "deploy/docker/15-validate-configuration.sh",
  "deploy/docker/api-entrypoint.sh",
  "deploy/docker/compose.yaml",
  "deploy/docker/Dockerfile",
  "deploy/docker/nginx.conf.template",
  "deploy/docker/README.md",
  "deploy/docker/README.fa.md",
  "deploy/docker/smoke-resources.mjs",
  "deploy/docker/smoke-resources.test.mjs",
  "deploy/docker/smoke.mjs",
  "deploy/native/nginx/bootstrap.conf.template",
  "deploy/native/nginx/kernel.conf.template",
  "deploy/native/README.md",
  "deploy/native/README.fa.md",
  "deploy/native/systemd/kernel-api.service",
  "docs/deployment.md",
  "docs/deployment.fa.md",
  "docs/staging.md",
  "docs/staging.fa.md",
  "docs/release-operations.md",
  "docs/release-operations.fa.md",
  "docs/backup-restore.md",
  "docs/backup-restore.fa.md",
  "docs/recovery-drills.md",
  "docs/recovery-drills.fa.md",
  "scripts/validate-workflow-targets.test.mjs",
  "scripts/validate-workflow-targets.mjs",
  "scripts/validate-deployment-env.mjs",
  "scripts/native-smoke-cleanup.mjs",
  "scripts/native-smoke-cleanup.test.mjs",
  "scripts/test-native-release.mjs",
  "scripts/render-deployment.mjs",
  "scripts/package-release.test.mjs",
  "scripts/package-release.mjs",
  "scripts/healthcheck.mjs",
  "scripts/deployment.test.mjs",
  "scripts/check-deployed-api.test.mjs",
  "scripts/check-deployed-api.mjs",
  "src/recovery-drill.test.ts",
  "src/test/fixture-cleanup.ts",
  "src/test/fixture-cleanup.test.ts",
  "src/test/recovery-drill-cases.ts",
];
const guidanceFiles = [
  ".agents/README.md",
  ".agents/evaluation/cases.json",
  ".agents/navigation.json",
  ".agents/settings.json",
  ".agents/rules/api-collection.md",
  ".agents/rules/backend.md",
  ".agents/rules/branches.md",
  ".agents/rules/code-quality.md",
  ".agents/rules/code-review.md",
  ".agents/rules/collection-quality.md",
  ".agents/rules/commits.md",
  ".agents/rules/data-lifecycle.md",
  ".agents/rules/git.md",
  ".agents/rules/guidance.md",
  ".agents/rules/imports.md",
  ".agents/rules/issues.md",
  ".agents/rules/localization.md",
  ".agents/rules/pull-requests.md",
  ".agents/rules/safety.md",
  ".agents/rules/testing.md",
  ".agents/rules/typescript.md",
  ".agents/skills/commit/SKILL.md",
  ".agents/skills/create-issue/SKILL.md",
  ".agents/skills/create-pr/SKILL.md",
  ".agents/skills/review-pr/SKILL.md",
  ".agents/skills/start-issue/SKILL.md",
  ".agents/skills/validate-change/SKILL.md",
  "docs/api-runtime.fa.md",
  "docs/api-runtime.md",
  "docs/change-workflow.fa.md",
  "docs/change-workflow.md",
  "docs/comprehension-evaluation.fa.md",
  "docs/comprehension-evaluation.md",
  "docs/development.fa.md",
  "docs/development.md",
  "docs/feature-development.fa.md",
  "docs/feature-development.md",
  "docs/localization.fa.md",
  "docs/localization.md",
  "docs/releasing.fa.md",
  "docs/releasing.md",
  "docs/source-navigation.fa.md",
  "docs/source-navigation.md",
  "docs/test-reliability.fa.md",
  "docs/test-reliability.md",
  "docs/testing.fa.md",
  "docs/testing.md",
  "docs/validation.fa.md",
  "docs/validation.md",
  "scripts/check-guidance.mjs",
  "scripts/guidance.test.mjs",
];

const localRuntimeFiles = [
  ...guidanceFiles,
  ...operationsFiles,
  ...collectionFiles,
  "docs/security/authentication-review.fa.md",
  "docs/security/authentication-review.md",
  "docs/security/reviews.fa.md",
  "docs/security/reviews.md",
  "docs/security/threat-model.fa.md",
  "docs/security/threat-model.md",
  "scripts/runtime-integration.test.mjs",
  "scripts/runtime-seed.test.mjs",
  "src/composition.ts",
  "src/dependencies.ts",
  "src/index.ts",
];
const localRuntimePolicy = (overrides = {}) =>
  httpTransportPolicy({
    allowedFiles: [...httpTransportPolicy().allowedFiles, ...localRuntimeFiles],
    phase: "local-runtime",
    ...overrides,
  });

test("local runtime requires server, composition and independent lifecycle tests without asserting production readiness", () => {
  const complete = localRuntimePolicy();
  assert.equal(
    validateBootstrapPolicy(complete).size,
    complete.allowedFiles.length,
  );
  for (const required of localRuntimeFiles)
    assert.throws(() =>
      validateBootstrapPolicy(
        localRuntimePolicy({
          allowedFiles: complete.allowedFiles.filter(
            (file) => file !== required,
          ),
        }),
      ),
    );
  assert.throws(() =>
    validateBootstrapPolicy(localRuntimePolicy({ applicationReady: true })),
  );
  assert.throws(() =>
    validateBootstrapPolicy(
      localRuntimePolicy({
        allowedFiles: [...complete.allowedFiles, "src/unreviewed.ts"],
      }),
    ),
  );
  for (const file of [
    "deploy/unreviewed.sh",
    "deploy/docker/.env.local",
    "collection/environments/development.bru",
    "collection/auth/unreviewed/index.bru",
  ])
    assert.throws(() =>
      validateBootstrapPolicy(
        localRuntimePolicy({ allowedFiles: [...complete.allowedFiles, file] }),
      ),
    );
});

test("HTTP transport requires every route and excludes runnable composition", () => {
  const complete = httpTransportPolicy();
  assert.equal(
    validateBootstrapPolicy(complete).size,
    complete.allowedFiles.length,
  );
  for (const required of httpTransportFiles)
    assert.throws(() =>
      validateBootstrapPolicy(
        httpTransportPolicy({
          allowedFiles: complete.allowedFiles.filter(
            (file) => file !== required,
          ),
        }),
      ),
    );
  for (const excluded of [
    "src/index.ts",
    "src/composition.ts",
    "src/dependencies.ts",
  ])
    assert.throws(() =>
      validateBootstrapPolicy(
        httpTransportPolicy({
          allowedFiles: [...complete.allowedFiles, excluded],
        }),
      ),
    );
  assert.throws(() =>
    validateBootstrapPolicy(httpTransportPolicy({ applicationReady: true })),
  );
});

test("auth-bootstrap requires every adapter and test while excluding HTTP and production runtime", () => {
  const complete = authBootstrapPolicy();
  assert.equal(
    validateBootstrapPolicy(complete).size,
    complete.allowedFiles.length,
  );
  for (const required of authBootstrapFiles)
    assert.throws(() =>
      validateBootstrapPolicy(
        authBootstrapPolicy({
          allowedFiles: complete.allowedFiles.filter(
            (file) => file !== required,
          ),
        }),
      ),
    );
  for (const extra of [
    "src/index.ts",
    "src/composition.ts",
    "src/presentation/http/app.ts",
  ])
    assert.throws(() =>
      validateBootstrapPolicy(
        authBootstrapPolicy({
          allowedFiles: [...complete.allowedFiles, extra],
        }),
      ),
    );
  assert.throws(() =>
    validateBootstrapPolicy(authBootstrapPolicy({ applicationReady: true })),
  );
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
