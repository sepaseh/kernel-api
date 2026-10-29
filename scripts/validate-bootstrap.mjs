import { spawnSync } from "node:child_process";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const policyPath = ".github/bootstrap-policy.json";
const coreFiles = [
  policyPath,
  ".github/workflows/pr-policy.yml",
  "scripts/check-pr-size.mjs",
  "scripts/check-pr-size.test.mjs",
  "scripts/validate-bootstrap.mjs",
  "scripts/validate-bootstrap.test.mjs",
];
const foundationFiles = [
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
const foundationCore = new Set(
  [
    "authorization",
    "errors",
    "identity",
    "localization",
    "models",
    "permissions",
    "validation",
  ].map((name) => `src/application/${name}.ts`),
);
const isFoundationSource = (file) =>
  foundationCore.has(file) ||
  /^src\/(?:contracts|application\/ports)\/[\w-]+\.ts$/.test(file) ||
  ["src/foundation.test.ts", "src/validation.test.ts"].includes(file);
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
const applicationServicesFiles = [...serviceFiles, ...serviceTests];
const localizationFiles = [
  ...["ar", "de", "en", "es", "fa", "fr", "it", "pt", "ru", "tr", "index"].map(
    (code) => `src/infrastructure/localization/catalogs/${code}.ts`,
  ),
  "src/catalogs.test.ts",
];
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
const localStorageFiles = [
  "src/infrastructure/storage/local.ts",
  "src/infrastructure/storage/operations.ts",
  "src/local-storage.test.ts",
];
const objectStorageFiles = [
  "src/infrastructure/storage/minio.ts",
  "src/infrastructure/storage/create.ts",
  "src/infrastructure/storage/url.ts",
  "src/object-storage.test.ts",
  "docs/object-storage.md",
  "docs/object-storage.fa.md",
];
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
const collectionFiles = new Set([
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
  "collection/account/request-mobile-verification/index.bru",
  "collection/account/update-profile/200.json",
  "collection/account/update-profile/400.json",
  "collection/account/update-profile/401.json",
  "collection/account/update-profile/index.bru",
  "collection/account/update-username/200.json",
  "collection/account/update-username/400.json",
  "collection/account/update-username/401.json",
  "collection/account/update-username/index.bru",
  "collection/account/verify-email/400.json",
  "collection/account/verify-email/401.json",
  "collection/account/verify-email/index.bru",
  "collection/auth/change-password/400.json",
  "collection/auth/change-password/401.json",
  "collection/auth/change-password/500.json",
  "collection/auth/change-password/index.bru",
  "collection/auth/folder.bru",
  "collection/auth/forgot-password/400.json",
  "collection/auth/forgot-password/index.bru",
  "collection/auth/login/200.json",
  "collection/auth/login/400.json",
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
  "collection/users/update/index.bru",
]);
const operationsFiles = new Set([
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
]);
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
const phaseFiles = {
  governance: [],
  foundation: [],
  "application-services": applicationServicesFiles,
  "localization-data": [...applicationServicesFiles, ...localizationFiles],
  "infrastructure-support": [
    ...applicationServicesFiles,
    ...localizationFiles,
    ...infrastructureSupportFiles,
  ],
  "storage-local": [
    ...applicationServicesFiles,
    ...localizationFiles,
    ...infrastructureSupportFiles,
    ...localStorageFiles,
  ],
  "storage-adapters": [
    ...applicationServicesFiles,
    ...localizationFiles,
    ...infrastructureSupportFiles,
    ...localStorageFiles,
    ...objectStorageFiles,
  ],
  "database-persistence": [
    ...applicationServicesFiles,
    ...localizationFiles,
    ...infrastructureSupportFiles,
    ...localStorageFiles,
    ...objectStorageFiles,
    ...databaseFiles,
  ],
  "auth-bootstrap": [
    ...applicationServicesFiles,
    ...localizationFiles,
    ...infrastructureSupportFiles,
    ...localStorageFiles,
    ...objectStorageFiles,
    ...databaseFiles,
    ...authBootstrapFiles,
  ],
  "http-transport": [
    ...applicationServicesFiles,
    ...localizationFiles,
    ...infrastructureSupportFiles,
    ...localStorageFiles,
    ...objectStorageFiles,
    ...databaseFiles,
    ...authBootstrapFiles,
    ...httpTransportFiles,
  ],
  "local-runtime": [
    ...applicationServicesFiles,
    ...localizationFiles,
    ...infrastructureSupportFiles,
    ...localStorageFiles,
    ...objectStorageFiles,
    ...databaseFiles,
    ...authBootstrapFiles,
    ...httpTransportFiles,
    ...localRuntimeFiles,
  ],
};
const isPublishedSource = (file, phase) =>
  phase !== "governance" &&
  (isFoundationSource(file) || phaseFiles[phase]?.includes(file));

export const validateBootstrapPolicy = (policy) => {
  if (
    policy?.schemaVersion !== 1 ||
    !Object.hasOwn(phaseFiles, policy.phase) ||
    policy.applicationReady !== false ||
    policy.maximumChangedFiles !== 100 ||
    !Array.isArray(policy.allowedFiles) ||
    !policy.allowedFiles.length
  )
    throw new Error(
      "An explicit publication phase without production readiness is required.",
    );
  const files = new Set();
  for (const file of policy.allowedFiles) {
    if (
      typeof file !== "string" ||
      !file ||
      file.includes("\\") ||
      file.split("/").some((part) => !part || part === "." || part === "..") ||
      /[*?[\]{}:\r\n]/.test(file) ||
      /^(?:apps|packages|node_modules|server|coverage)(?:\/|$)/.test(file) ||
      (/^deploy(?:\/|$)/.test(file) &&
        (policy.phase !== "local-runtime" || !operationsFiles.has(file))) ||
      (/^collection(?:\/|$)/.test(file) &&
        (policy.phase !== "local-runtime" || !collectionFiles.has(file))) ||
      (/^drizzle(?:\/|$)/.test(file) &&
        (![
          "database-persistence",
          "auth-bootstrap",
          "http-transport",
          "local-runtime",
        ].includes(policy.phase) ||
          !databaseFiles.includes(file))) ||
      file === "drizzle.config.ts" ||
      (file.startsWith("src/") && !isPublishedSource(file, policy.phase)) ||
      (policy.phase === "governance" &&
        /^package(?:-lock)?\.json$/.test(file)) ||
      /(?:^|\/)(?:\.env(?:\.|$)|settings\.local\.json$)/.test(file) ||
      /\.(?:pem|key|pfx|p12|sqlite|db)$/.test(file) ||
      files.has(file)
    )
      throw new Error(
        "Publication files must be unique, exact paths within their declared phase.",
      );
    files.add(file);
  }
  const requiredFiles = [
    ...coreFiles,
    ...(policy.phase === "governance"
      ? [".github/workflows/bootstrap.yml"]
      : foundationFiles),
    ...phaseFiles[policy.phase],
  ];
  if (requiredFiles.some((file) => !files.has(file)))
    throw new Error(
      "The bootstrap policy cannot omit its mandatory guard files.",
    );
  return files;
};

export const inspectBootstrap = async (root) => {
  if (
    (await lstat(path.join(root, ".github"))).isSymbolicLink() ||
    (await lstat(path.join(root, policyPath))).isSymbolicLink()
  )
    throw new Error("Bootstrap snapshots must not contain symbolic links.");
  const policy = JSON.parse(
    await readFile(path.join(root, policyPath), "utf8"),
  );
  const allowed = validateBootstrapPolicy(policy);
  const directories = new Set(
    [...allowed].flatMap((file) => {
      const parts = file.split("/");
      return parts
        .slice(0, -1)
        .map((_, index) => parts.slice(0, index + 1).join("/"));
    }),
  );
  const found = new Set();
  const visit = async (directory) => {
    const entries = await readdir(path.join(root, directory), {
      withFileTypes: true,
    });
    await Promise.all(
      entries.map(async (entry) => {
        const relative = directory ? `${directory}/${entry.name}` : entry.name;
        if (relative === ".git") return;
        if (
          policy.phase !== "governance" &&
          ["node_modules", "coverage"].includes(relative)
        ) {
          if (entry.isSymbolicLink() || !entry.isDirectory())
            throw new Error(
              "Generated output must be an ordinary root directory.",
            );
          return;
        }
        if (entry.isSymbolicLink())
          throw new Error(
            "Bootstrap snapshots must not contain symbolic links.",
          );
        if (entry.isDirectory() && directories.has(relative)) {
          await visit(relative);
        } else if (entry.isFile() && allowed.has(relative)) {
          found.add(relative);
        } else {
          throw new Error(`Unexpected bootstrap path: ${relative}`);
        }
      }),
    );
  };
  await visit("");
  if ([...allowed].some((file) => !found.has(file)))
    throw new Error(
      "The published bootstrap snapshot is missing declared files.",
    );

  await Promise.all(
    [...found].map(async (file) => {
      if (file.endsWith(".json"))
        JSON.parse(await readFile(path.join(root, file), "utf8"));
      if (file.endsWith(".mjs")) {
        const result = spawnSync(
          process.execPath,
          ["--check", path.join(root, file)],
          {
            cwd: root,
            encoding: "utf8",
            windowsHide: true,
          },
        );
        if (result.error || result.status !== 0)
          throw new Error(`Bootstrap JavaScript syntax is invalid: ${file}`);
      }
    }),
  );
  const scopeByPhase = {
    governance:
      "Published governance files only; API runtime is not published or validated.",
    foundation:
      "Published contracts, core and ports only; HTTP, database and concrete adapters are not published or validated.",
    "application-services":
      "Published contracts, core, ports and application services; HTTP, database and concrete adapters are not published or validated.",
    "localization-data":
      "Published contracts, application services and static translation catalogs; translation engine, HTTP, database and concrete adapters are not published or validated.",
    "infrastructure-support":
      "Published contracts, application services, translation engine, configuration and logging/lifecycle support; HTTP, database and authentication/storage adapters are not published or validated.",
    "storage-local":
      "Published application services, infrastructure support and local filesystem storage; HTTP, database, authentication and MinIO adapters are not published or validated.",
    "storage-adapters":
      "Published application services, infrastructure support, local and S3-compatible MinIO storage, adapter selection and URL helpers; HTTP, database, authentication, deployed MinIO integration and application composition are not published or validated.",
    "database-persistence":
      "Published application services, infrastructure support, storage adapters and concrete libsql/Drizzle schema, migrations and non-authentication persistence with disposable local-database tests; HTTP, authentication/OTP, initialization, deployed database/storage services and application composition are not published or validated.",
    "auth-bootstrap":
      "Published database, storage and authentication adapters with synthetic tests and initial administrator provisioning; HTTP, production OTP delivery, deployed services and application composition remain unpublished or unvalidated.",
    "http-transport":
      "Published HTTP route adapters with synthetic service tests; application composition, server startup and production OTP delivery remain unpublished or unvalidated.",
    "local-runtime":
      "Published local server composition and startup with synthetic integration tests; production OTP delivery and deployed service readiness remain unvalidated.",
  };
  return {
    applicationReady: false,
    files: found.size,
    phase: policy.phase,
    scope: scopeByPhase[policy.phase],
  };
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await inspectBootstrap(process.cwd());
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Bootstrap validation failed.",
    );
    process.exitCode = 1;
  }
}
