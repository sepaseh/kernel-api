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
const localRuntimeFiles = [
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
      /^(?:apps|packages|collection|deploy|node_modules|server|coverage)(?:\/|$)/.test(
        file,
      ) ||
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
