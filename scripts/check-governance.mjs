import { spawnSync } from "node:child_process";
import { lstat, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { parseDocument } from "yaml";

const repository = fileURLToPath(new URL("../", import.meta.url));
const requireModule = createRequire(import.meta.url);
const inventoryPath = ".github/bootstrap-policy.json";
const manifestPath = ".agents/validation.json";
const scriptNames = {
  snapshot: "check:snapshot",
  "ci-policy": "check:ci",
  "actions-lint": "check:actions",
  audit: "audit",
  boundaries: "check:boundaries",
  typecheck: "typecheck",
  lint: "lint",
  format: "format:check",
  guidance: "check:guidance",
  "coverage-tests": "test:coverage",
  "audit-helper-tests": "test:audit",
};
export const requiredChecks = [
  "snapshot",
  "ci-policy",
  "actions-lint",
  "audit",
  "format",
  "guidance",
  "coverage-tests",
];
export const sourceChecks = Object.keys(scriptNames);
const sourcePhases = new Set([
  "foundation",
  "application-services",
  "localization-data",
  "infrastructure-support",
  "storage-local",
  "storage-adapters",
  "configured-storage",
  "database-persistence",
  "auth-bootstrap",
  "http-transport",
  "http-composition",
  "runtime-operations",
  "collection-core",
  "collection-account-auth",
  "collection-management",
  "local-runtime",
]);
export const checksForPhase = (phase) => {
  assert(
    phase === "governance" || sourcePhases.has(phase),
    "A known explicit publication phase is required.",
  );
  return phase === "governance" ? requiredChecks : sourceChecks;
};
export const foundationFiles = [
  "src/application/authorization.ts",
  "src/application/errors.ts",
  "src/application/foundation.test.ts",
  "src/application/identity.ts",
  "src/application/localization.ts",
  "src/application/models.ts",
  "src/application/permissions.ts",
  "src/application/ports/auth.ts",
  "src/application/validation.test.ts",
  "src/application/validation.ts",
  "src/contracts/locales.ts",
  "src/contracts/otp.ts",
  "src/contracts/permissions.ts",
  "src/contracts/profile.ts",
  "src/contracts/settings.ts",
];
const sourceToolingFiles = [
  "eslint.config.mjs",
  "tsconfig.json",
  "scripts/check-boundaries.mjs",
  "scripts/check-boundaries.test.mjs",
  "scripts/run-audit.mjs",
  "scripts/run-audit.test.mjs",
  "scripts/merge-coverage.mjs",
  "scripts/merge-coverage.test.mjs",
];
const governanceDependencies = { prettier: "3.9.10", yaml: "2.9.1" };
export const reviewedOverrides = { "minimatch@10.2.6": "11.0.3" };
const reviewedAuthCoreVersion = "1.7.14";
export const overridesForPackage = (pkg) => ({
  ...reviewedOverrides,
  ...(pkg.dependencies?.["better-auth"]
    ? { "@better-auth/core": reviewedAuthCoreVersion }
    : {}),
  ...(pkg.devDependencies?.["drizzle-kit"]
    ? { "@esbuild-kit/core-utils@3.3.2": { esbuild: "0.28.2" } }
    : {}),
});
export const operationsPhases = new Set([
  "runtime-operations",
  "collection-core",
  "collection-account-auth",
  "collection-management",
  "local-runtime",
]);
const runtimeCommandPhases = new Set(["http-composition", ...operationsPhases]);
const adminCommandPhases = new Set([
  "database-persistence",
  "auth-bootstrap",
  "http-transport",
  ...runtimeCommandPhases,
]);
const deploymentTests = [
  "scripts/deployment.integration.test.mjs",
  "scripts/native-smoke-cleanup.test.mjs",
  "scripts/package-release.test.mjs",
  "scripts/check-deployed-api.test.mjs",
  "scripts/docker-smoke-cleanup.test.mjs",
  "scripts/healthcheck.test.mjs",
  "scripts/render-deployment.test.mjs",
  "scripts/validate-deployment-env.test.mjs",
  "scripts/package-release.integration.test.mjs",
  "scripts/check-deployed-api.integration.test.mjs",
];
const operationsCommands = {
  "server:generate": {
    command:
      "node node_modules/drizzle-kit/bin.cjs generate --config=drizzle.config.ts",
    owners: ["drizzle.config.ts", "src/infrastructure/db/schema.ts"],
  },
  "server:migrate": {
    command:
      "node node_modules/drizzle-kit/bin.cjs migrate --config=drizzle.config.ts",
    owners: [
      "drizzle.config.ts",
      "src/infrastructure/db/schema.ts",
      "drizzle/meta/_journal.json",
    ],
  },
  "deploy:package": {
    command: "node scripts/package-release.mjs",
    owners: ["scripts/package-release.mjs"],
  },
  "deploy:render": {
    command: "node scripts/render-deployment.mjs",
    owners: ["scripts/render-deployment.mjs"],
  },
  "deploy:check": {
    command: "node scripts/validate-deployment-env.mjs",
    owners: ["scripts/validate-deployment-env.mjs"],
  },
  "deploy:health": {
    command: "node scripts/healthcheck.mjs",
    owners: ["scripts/healthcheck.mjs"],
  },
  "test:fixture:website": {
    command: "node scripts/website-api-runner.mjs",
    owners: ["scripts/website-api-runner.mjs"],
  },
  "test:recovery": {
    command: "node --test src/test/integration/recovery-drill.test.ts",
    owners: ["src/test/integration/recovery-drill.test.ts"],
  },
  "test:deploy": {
    command: `node --test ${deploymentTests.join(" ")}`,
    owners: deploymentTests,
  },
  "test:deploy:docker": {
    command: "node scripts/test-docker-release.mjs",
    owners: ["scripts/test-docker-release.mjs"],
  },
  "test:deploy:native": {
    command: "node scripts/test-native-release.mjs",
    owners: ["scripts/test-native-release.mjs"],
  },
};
const ownedCommands = (phase) => ({
  ...(adminCommandPhases.has(phase)
    ? {
        "server:bootstrap": {
          command: "node src/bootstrap-admin.ts",
          owners: ["src/bootstrap-admin.ts"],
        },
      }
    : {}),
  ...(runtimeCommandPhases.has(phase)
    ? {
        dev: { command: "node src/index.ts", owners: ["src/index.ts"] },
        start: { command: "node src/index.ts", owners: ["src/index.ts"] },
        server: { command: "npm run dev", owners: ["src/index.ts"] },
      }
    : {}),
  ...(operationsPhases.has(phase) ? operationsCommands : {}),
});
export const commandOwnersForPhase = (phase) => [
  ...new Set(
    Object.values(ownedCommands(phase)).flatMap(({ owners }) => owners),
  ),
];
export const foundationDependencies = {
  "@eslint/js": "10.0.1",
  "@types/node": "24.19.2",
  eslint: "10.14.0",
  "eslint-plugin-simple-import-sort": "14.0.0",
  globals: "17.13.0",
  ...governanceDependencies,
  typescript: "6.0.3",
  "typescript-eslint": "8.72.1",
};
const scriptCommand = (id, phase) => {
  if (id === "actions-lint") return "node scripts/run-actionlint.mjs";
  if (phase !== "governance") {
    if (id === "audit") return "node scripts/run-audit.mjs";
    if (id === "boundaries") return "node scripts/check-boundaries.mjs";
    if (id === "typecheck") return "tsc --noEmit -p tsconfig.json";
    if (id === "lint") return "eslint .";
  }
  return `node scripts/check-governance.mjs ${id}`;
};
export const packageScripts = (phase) => ({
  validate: "node scripts/check-governance.mjs",
  ...Object.fromEntries(
    checksForPhase(phase).map((id) => [
      scriptNames[id],
      scriptCommand(id, phase),
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(ownedCommands(phase)).map(([name, { command }]) => [
      name,
      command,
    ]),
  ),
});
const ciOwner = (id) => {
  if (id === "audit") return "audit";
  if (["coverage-tests", "audit-helper-tests"].includes(id))
    return "governance";
  return "quality";
};
export const ciProfilesForPhase = (phase) =>
  Object.fromEntries(
    ["quality", "audit", "governance"].map((job) => [
      `ci-${job}`,
      checksForPhase(phase).filter((id) => ciOwner(id) === job),
    ]),
  );
export const aggregateCheckCommand =
  "node -e \"const needs = JSON.parse(process.env.CI_NEEDS); if (!['quality', 'audit', 'governance'].every(job => needs[job]?.result === 'success')) process.exit(1)\"";
export const externalWorkflows = [
  {
    path: ".github/workflows/ci.yml",
    mode: "ci",
  },
  {
    path: ".github/workflows/codeql.yml",
    mode: "security",
  },
];
export const testFiles = [
  "scripts/check-governance.test.mjs",
  "scripts/ci-evidence.test.mjs",
  "scripts/run-actionlint.test.mjs",
];
const sourceFiles = testFiles.map((file) => file.replace(".test.mjs", ".mjs"));
const optInTestFiles = new Set([
  "scripts/test-native-release.mjs",
  "scripts/test-docker-release.mjs",
]);
export const actions = {
  checkout: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  node: "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
  upload: "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9",
  download:
    "actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333",
  sonar:
    "SonarSource/sonarqube-scan-action@d209202bc7d53ff1cc128f7f907dac145c9d6ae9",
  codeqlInit:
    "github/codeql-action/init@cdf488f595d80d6e07e03d4674febd5ab45fa938",
  codeqlAnalyze:
    "github/codeql-action/analyze@cdf488f595d80d6e07e03d4674febd5ab45fa938",
};
const expression = (value) => "${{ " + value + " }}";
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const equal = (actual, expected, message) =>
  assert(isDeepStrictEqual(actual, expected), message);
const safePath = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9_.\-/]+$/.test(value) &&
  value.split("/").every((part) => part && part !== "." && part !== "..") &&
  !/(?:^|\/)(?:\.git|node_modules|coverage|test-results)(?:\/|$)/.test(value) &&
  (!/(?:^|\/)(?:\.env(?:\.|$)|settings\.local\.json$)/i.test(value) ||
    value === ".env.example") &&
  !/\.(?:pem|key|pfx|p12|sqlite|db)$/i.test(value);

const guidanceValidators = (policy) => {
  assert(
    !Object.hasOwn(policy, "guidanceAssets") ||
      typeof policy.guidanceAssets === "boolean",
    "guidanceAssets must be an optional boolean flag.",
  );
  // Node 24 loads this ESM synchronously only when the publication admits it.
  if (policy.guidanceAssets === true)
    return requireModule("./check-guidance-assets.mjs");

  assert(
    policy.allowedFiles.every(
      (file) =>
        !/^\.agents\/(?:hooks|evaluation)(?:\/|$)/.test(file) &&
        !/^scripts\/(?:ai-hooks\.portable\.test|check-guidance-assets(?:\.test)?)\.mjs$/.test(
          file,
        ),
    ),
    "Guidance assets cannot be published without the explicit flag.",
  );
};

export const validateInventory = (policy) => {
  assert(
    policy?.schemaVersion === 1 &&
      (policy.phase === "governance" || sourcePhases.has(policy.phase)) &&
      policy.applicationReady === false &&
      Array.isArray(policy.allowedFiles) &&
      policy.allowedFiles.length > 0,
    "Declare an explicit publication scope without application readiness.",
  );
  guidanceValidators(policy)?.validateGuidanceInventory(policy);
  const files = new Set(policy.allowedFiles);
  assert(
    files.size === policy.allowedFiles.length && [...files].every(safePath),
    "The publication inventory must contain unique safe governance file paths.",
  );
  if (policy.phase === "governance")
    assert(
      [...files].every(
        (file) =>
          !/^(?:src|drizzle|deploy|collection)(?:\/|$)/.test(file) &&
          file !== ".env.example",
      ),
      "Governance publication cannot contain API source or runtime fixtures.",
    );
  if (policy.phase === "foundation")
    assert(
      [...files]
        .filter((file) =>
          /^(?:src|drizzle|deploy|collection)(?:\/|$)/.test(file),
        )
        .every(
          (file) =>
            foundationFiles.includes(file) ||
            file === "src/test/architecture/lint-toolchain.test.ts",
        ),
      "Foundation publication is limited to its pure source closure.",
    );
  if (files.has(".env.example"))
    assert(
      ![
        "governance",
        "foundation",
        "application-services",
        "localization-data",
      ].includes(policy.phase),
      "Only infrastructure publication may include the synthetic environment example.",
    );
  const mandatory = [
    inventoryPath,
    manifestPath,
    ".agents/settings.json",
    ".agents/navigation.json",
    ...externalWorkflows.map(({ path }) => path),
    ".coderabbit.yaml",
    "package.json",
    "package-lock.json",
    "sonar-project.properties",
    ...sourceFiles,
    ...testFiles,
    ...(policy.phase === "governance"
      ? []
      : [...foundationFiles, ...sourceToolingFiles]),
    ...commandOwnersForPhase(policy.phase),
  ];
  assert(
    mandatory.every((file) => files.has(file)),
    "The governance snapshot cannot omit its checks, tests, or configuration.",
  );
  return files;
};

const regularFile = async (root, relative) => {
  let filename = root;
  const rootInfo = await lstat(root);
  assert(
    rootInfo.isDirectory() && !rootInfo.isSymbolicLink(),
    "The validation root must be an ordinary directory.",
  );
  const parts = relative.split("/");
  const inspectPart = async (index) => {
    const part = parts[index];
    filename = path.join(filename, part);
    const info = await lstat(filename);
    assert(
      !info.isSymbolicLink() &&
        (index === parts.length - 1 ? info.isFile() : info.isDirectory()),
      "Published files must not contain symbolic links or special files.",
    );
    return index === parts.length - 1 ? filename : inspectPart(index + 1);
  };
  return inspectPart(0);
};
const readJson = async (root, relative) =>
  JSON.parse(await readFile(await regularFile(root, relative), "utf8"));
const readText = async (root, relative) =>
  readFile(await regularFile(root, relative), "utf8");
const readInventory = async (root) => {
  const policy = await readJson(root, inventoryPath);
  return { policy, files: validateInventory(policy) };
};

const validatePackageDefinition = (pkg, phase) => {
  assert(
    pkg?.name === "kernel-api" && pkg.private === true && pkg.type === "module",
    "The governance package must remain private and use Node ES modules.",
  );
  for (const field of [
    "optionalDependencies",
    "peerDependencies",
    "workspaces",
  ])
    assert(
      !Object.hasOwn(pkg, field),
      "The standalone package must not introduce workspace links or hidden dependency categories.",
    );
  const expectedDependencies =
    phase === "governance" ? governanceDependencies : foundationDependencies;
  if (operationsPhases.has(phase))
    equal(
      pkg.devDependencies?.["drizzle-kit"],
      "0.31.11",
      "Operations must use the reviewed Drizzle Kit version.",
    );
  else
    assert(
      !Object.hasOwn(pkg.devDependencies ?? {}, "drizzle-kit"),
      "Drizzle Kit belongs to the operations publication phase.",
    );
  assert(
    !Object.keys(pkg.dependencies ?? {}).some((name) =>
      Object.hasOwn(pkg.devDependencies ?? {}, name),
    ),
    "A package must have one declared runtime or development owner.",
  );
  if (["governance", "foundation"].includes(phase)) {
    assert(
      !Object.hasOwn(pkg, "dependencies"),
      "Pure governance and foundation phases must not introduce runtime dependencies.",
    );
    equal(
      pkg.devDependencies,
      expectedDependencies,
      "Governance tooling versions must match the reviewed pinned dependencies.",
    );
  } else {
    for (const [name, version] of Object.entries(expectedDependencies))
      equal(
        pkg.devDependencies?.[name],
        version,
        "Required source-validation tooling must remain pinned.",
      );
    for (const version of [
      ...Object.values(pkg.devDependencies ?? {}),
      ...Object.values(pkg.dependencies ?? {}),
    ])
      assert(
        typeof version === "string" &&
          /^\d+\.\d+\.\d+(?:-[a-z\d.-]+)?$/i.test(version),
        "Published dependencies must use literal registry versions, never local or workspace protocols.",
      );
  }
  const expected = packageScripts(phase);
  equal(
    pkg.scripts,
    expected,
    "Package scripts must execute the real governance checks.",
  );
};

const validateLockfile = (pkg, lock, phase) => {
  assert(
    lock?.lockfileVersion === 3 && lock.name === pkg.name,
    "A root npm lockfile is required.",
  );
  equal(
    lock.packages?.[""]?.devDependencies,
    pkg.devDependencies,
    "The lockfile must match the tooling manifest.",
  );
  equal(
    lock.packages?.[""]?.dependencies ?? {},
    pkg.dependencies ?? {},
    "The lockfile must match the declared runtime dependencies.",
  );
  const locations = Object.keys(lock.packages ?? {}).sort((left, right) =>
    left.localeCompare(right),
  );
  if (phase === "governance")
    equal(
      locations,
      ["", "node_modules/prettier", "node_modules/yaml"],
      "The governance lockfile must contain only its two tooling dependencies.",
    );
  assert(
    locations.every(
      (location) => location === "" || location.startsWith("node_modules/"),
    ),
    "The lockfile must remain one independently installable project.",
  );
  if (pkg.dependencies?.["better-auth"])
    assert(
      lock.packages?.["node_modules/@better-auth/core"]?.version ===
        reviewedAuthCoreVersion,
      "The lockfile must include the reviewed authentication core.",
    );
  for (const [location, entry] of Object.entries(lock.packages ?? {})) {
    assert(
      entry.link !== true,
      "The lockfile must not contain local package links.",
    );
    if (phase !== "governance" && location.endsWith("/minimatch"))
      assert(
        entry.version !== "10.2.6",
        "The reviewed minimatch security override must be reflected in the lockfile.",
      );
    if (
      pkg.dependencies?.["better-auth"] &&
      location.endsWith("/@better-auth/core")
    )
      assert(
        entry.version === reviewedAuthCoreVersion,
        "The locked authentication core must match the reviewed provider version.",
      );
  }
  for (const [name, version] of Object.entries({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  }))
    assert(
      lock.packages[`node_modules/${name}`]?.version === version &&
        typeof lock.packages[`node_modules/${name}`]?.integrity === "string",
      "The locked tooling packages must have reviewed versions and integrity hashes.",
    );
};

export const validatePackage = (pkg, lock, phase = "governance") => {
  validatePackageDefinition(pkg, phase);
  if (phase === "governance")
    assert(
      !Object.hasOwn(pkg, "overrides"),
      "Governance tooling must not introduce dependency overrides.",
    );
  else if (
    phase === "foundation" ||
    pkg.dependencies?.["better-auth"] ||
    pkg.devDependencies?.["drizzle-kit"] ||
    Object.hasOwn(pkg, "overrides")
  )
    equal(
      pkg.overrides,
      overridesForPackage(pkg),
      "Only the reviewed minimatch and owned authentication core overrides, plus the scoped Drizzle compiler override, are permitted in source phases.",
    );
  validateLockfile(pkg, lock, phase);
};

export const inspectSnapshot = async (root, { trackedFiles = [] } = {}) => {
  const { policy, files } = await readInventory(root);
  await Promise.all([...files].map((file) => regularFile(root, file)));
  assert(
    trackedFiles.every((file) => files.has(file)),
    "Tracked files outside the declared governance snapshot cannot be published.",
  );
  validatePackage(
    await readJson(root, "package.json"),
    await readJson(root, "package-lock.json"),
    policy.phase,
  );
  return { phase: policy.phase, files: files.size, applicationReady: false };
};

export const validateManifest = (manifest, pkg) => {
  assert(
    manifest?.schemaVersion === 1 &&
      (manifest.phase === "governance" || sourcePhases.has(manifest.phase)) &&
      manifest.applicationReady === false &&
      Array.isArray(manifest.checks),
    "The canonical manifest must describe the governance phase.",
  );
  equal(
    manifest.externalWorkflows,
    externalWorkflows,
    "The manifest must declare native CI and hosted CodeQL security verification.",
  );
  const checks = checksForPhase(manifest.phase);
  equal(
    manifest.checks.map(({ id }) => id),
    checks,
    "Every real phase check must be declared once in canonical order.",
  );
  equal(
    manifest.profiles,
    { full: checks, ...ciProfilesForPhase(manifest.phase) },
    "The full profile and disjoint CI profiles must execute every required check exactly once.",
  );
  for (const check of manifest.checks) {
    assert(check.kind === "required", "Governance checks cannot be advisory.");
    equal(
      check.ciJobs,
      [ciOwner(check.id)],
      "Required checks must belong to exactly one unconditional CI job.",
    );
    equal(
      check.scopes,
      [manifest.phase],
      "Do not attribute governance evidence to API code.",
    );
    equal(
      check.command,
      `npm run ${scriptNames[check.id]}`,
      "Canonical commands must invoke the owning governance package script.",
    );
    equal(
      pkg.scripts?.[scriptNames[check.id]],
      scriptCommand(check.id, manifest.phase),
      "A required script cannot be replaced by a no-op or alternate command.",
    );
  }
};

export const parseYaml = (text) => {
  const document = parseDocument(text, { uniqueKeys: true });
  assert(!document.errors.length, "YAML must be valid and have unique keys.");
  return document.toJS({ maxAliasCount: 0 });
};
const stepsWithoutNames = (steps) =>
  steps?.map((step) => {
    const result = { ...step };
    delete result.name;
    return result;
  });
const checkout = (full = false) => ({
  uses: actions.checkout,
  with: {
    ref: expression("github.sha"),
    ...(full ? { "fetch-depth": 0 } : {}),
    "persist-credentials": false,
  },
});
const setupNode = (cache = true) => ({
  uses: actions.node,
  with: { "node-version-file": ".nvmrc", ...(cache ? { cache: "npm" } : {}) },
});
const sonarConfiguration = `if [[ "$SONAR_TOKEN_CONFIGURED" != 'true' || -z "$SONAR_PROJECT_KEY" ]]; then\n  echo '::error::Configure SONAR_TOKEN and SONAR_PROJECT_KEY before analysis. No Sonar analysis was performed.'\n  exit 1\nfi\n`;

export const validateCiWorkflow = (workflow) => {
  equal(
    Object.keys(workflow ?? {}).sort((left, right) =>
      left.localeCompare(right),
    ),
    ["concurrency", "jobs", "name", "on", "permissions"],
    "CI cannot introduce implicit environment, shell, or workflow transitions.",
  );
  equal(workflow.name, "CI", "Keep the CI workflow identity stable.");
  equal(
    workflow.on,
    {
      push: { branches: ["main"] },
      pull_request: {
        types: [
          "opened",
          "synchronize",
          "reopened",
          "edited",
          "ready_for_review",
        ],
      },
      workflow_dispatch: null,
    },
    "Every PR, including drafts and metadata edits, must trigger full CI without path or branch filters.",
  );
  equal(
    workflow.permissions,
    { contents: "read" },
    "CI must use read-only default permissions.",
  );
  equal(
    workflow.concurrency,
    {
      group:
        "ci-" +
        expression("github.event_name") +
        "-" +
        expression("github.ref"),
      "cancel-in-progress": false,
    },
    "Queue verification by event and ref without cancelling active evidence.",
  );
  equal(
    Object.keys(workflow.jobs ?? {}).sort((left, right) =>
      left.localeCompare(right),
    ),
    ["analysis", "audit", "check", "governance", "quality"],
    "Keep static checks, dependency audit, governance tests, aggregate and analysis explicit.",
  );
  const baseSteps = [
    checkout(),
    setupNode(),
    {
      run: "npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund",
    },
  ];
  for (const [id, name] of [
    ["quality", "Static checks"],
    ["audit", "Dependency audit"],
    ["governance", "Governance tests"],
  ]) {
    const { steps, ...job } = workflow.jobs[id];
    const governance = id === "governance";
    equal(
      job,
      {
        name,
        "runs-on": "ubuntu-latest",
        "timeout-minutes": 20,
        ...(governance
          ? {
              outputs: {
                artifact: expression("steps.evidence.outputs.artifact"),
                attempt: expression("steps.evidence.outputs.attempt"),
              },
            }
          : {}),
      },
      "Each CI suite must run unconditionally in its owning job.",
    );
    const expected = [...baseSteps, { run: `npm run validate -- ci-${id}` }];
    if (governance)
      expected.push(
        {
          id: "evidence",
          env: { CI_EVIDENCE_SUITE: "governance" },
          run: "node scripts/ci-evidence.mjs --record",
        },
        {
          uses: actions.upload,
          with: {
            name: expression("steps.evidence.outputs.artifact"),
            path: "coverage/lcov.info\ncoverage/governance/ci-evidence.json\n",
            "if-no-files-found": "error",
            "retention-days": 3,
            overwrite: false,
            "include-hidden-files": false,
          },
        },
      );
    equal(
      stepsWithoutNames(steps),
      expected,
      "CI suites must execute disjoint canonical profiles once; only governance produces measured coverage.",
    );
  }
  const { steps: checkSteps, ...check } = workflow.jobs.check;
  equal(
    check,
    {
      permissions: {},
      needs: ["quality", "audit", "governance"],
      if: "always()",
      "runs-on": "ubuntu-latest",
      "timeout-minutes": 5,
    },
    "The stable check context must always aggregate every required suite.",
  );
  equal(
    stepsWithoutNames(checkSteps),
    [
      {
        env: { CI_NEEDS: expression("toJSON(needs)") },
        run: aggregateCheckCommand,
      },
    ],
    "The aggregate must require exact success without repeating validation.",
  );
  const { steps: analysisSteps, ...analysis } = workflow.jobs.analysis;
  equal(
    analysis,
    {
      name: "SonarQube Cloud analysis",
      needs: ["check", "governance"],
      if: "needs.check.result == 'success' && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository)",
      "runs-on": "ubuntu-latest",
      "timeout-minutes": 15,
    },
    "Sonar must depend on successful validation and must not expose secrets to fork PRs.",
  );
  equal(
    stepsWithoutNames(analysisSteps),
    [
      checkout(true),
      setupNode(),
      {
        env: {
          SONAR_TOKEN_CONFIGURED: expression("secrets.SONAR_TOKEN != ''"),
          SONAR_PROJECT_KEY: expression("vars.SONAR_PROJECT_KEY"),
        },
        run: sonarConfiguration,
      },
      {
        uses: actions.download,
        with: {
          name: expression("needs.governance.outputs.artifact"),
          path: "coverage",
          "digest-mismatch": "error",
        },
      },
      {
        env: {
          CI_EVIDENCE_SUITE: "governance",
          CI_EVIDENCE_PRODUCER_ATTEMPT: expression(
            "needs.governance.outputs.attempt",
          ),
        },
        run: "node scripts/ci-evidence.mjs --verify-coverage",
      },
      {
        run: "npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund",
      },
      {
        uses: actions.sonar,
        env: {
          SONAR_HOST_URL: expression(
            "vars.SONAR_HOST_URL || 'https://sonarcloud.io'",
          ),
          SONAR_TOKEN: expression("secrets.SONAR_TOKEN"),
        },
        with: {
          args:
            "-Dsonar.projectKey=" +
            expression("vars.SONAR_PROJECT_KEY") +
            " -Dsonar.scm.revision=" +
            expression("github.event.pull_request.head.sha || github.sha"),
        },
      },
    ],
    "Sonar must verify the same run's measured coverage and execute a real scanner without rerunning tests.",
  );
};

export const validateCodeqlWorkflow = (workflow) => {
  equal(
    workflow,
    {
      name: "CodeQL",
      on: {
        push: { branches: ["main"] },
        pull_request: null,
        schedule: [{ cron: "30 3 * * 1" }],
        workflow_dispatch: null,
      },
      concurrency: {
        group: expression("github.workflow") + "-" + expression("github.ref"),
        "cancel-in-progress": expression("github.ref != 'refs/heads/main'"),
      },
      permissions: { contents: "read" },
      jobs: {
        analyze: {
          name: "Analyze JavaScript, TypeScript and GitHub Actions",
          "runs-on": "ubuntu-latest",
          "timeout-minutes": 60,
          permissions: { contents: "read", "security-events": "write" },
          steps: [
            { uses: actions.checkout, with: { "persist-credentials": false } },
            {
              uses: actions.codeqlInit,
              with: {
                languages: "javascript-typescript,actions",
                queries: "security-extended",
              },
            },
            { uses: actions.codeqlAnalyze },
          ],
        },
      },
    },
    "CodeQL must analyze every PR base with pinned actions, security-extended JavaScript/TypeScript and Actions queries and minimal upload permissions.",
  );
};

export const validateCodeRabbit = (configuration) => {
  const reviews = configuration?.reviews;
  assert(
    reviews?.auto_review?.enabled === false &&
      reviews.auto_review.drafts === false &&
      reviews.auto_review.auto_incremental_review === false &&
      reviews.auto_approvals?.enabled === true &&
      reviews.auto_approvals.allow_author_approval === false &&
      reviews.review_status === true,
    "CodeRabbit must use manual review after preflight and permit only independent bot approval.",
  );
};

export const validateRuleset = (ruleset) => {
  assert(
    ruleset?.target === "branch" &&
      ruleset.enforcement === "active" &&
      Array.isArray(ruleset.bypass_actors) &&
      ruleset.bypass_actors.length === 0,
    "Protection must be active for branches with no bypass actors.",
  );
  const conditions = ruleset.conditions?.ref_name;
  assert(
    conditions?.exclude?.length === 0 &&
      conditions.include?.some((ref) =>
        ["~DEFAULT_BRANCH", "refs/heads/main"].includes(ref),
      ),
    "Protection must cover the default main branch without exclusions.",
  );
  const rules = new Map(ruleset.rules?.map((rule) => [rule.type, rule]));
  assert(
    rules.size === ruleset.rules?.length &&
      [
        "deletion",
        "non_fast_forward",
        "required_linear_history",
        "pull_request",
        "required_status_checks",
      ].every((type) => rules.has(type)),
    "Require PRs, linear history, current checks, and protection against deletion and force pushes.",
  );
  const review = rules.get("pull_request").parameters;
  assert(
    review?.required_approving_review_count >= 1 &&
      review.dismiss_stale_reviews_on_push === true &&
      review.require_last_push_approval === true &&
      review.required_review_thread_resolution === true,
    "Require an independent current approval, dismiss stale approvals, and resolve conversations.",
  );
  const status = rules.get("required_status_checks").parameters;
  assert(
    status?.strict_required_status_checks_policy === true &&
      status.do_not_enforce_on_create === false,
    "Required checks must apply strictly to the current branch and its creation.",
  );
  const expected = [
    ["check", 15368],
    ["CodeQL", 57789],
    ["SonarQube Cloud analysis", 15368],
    ["SonarCloud Code Analysis", 12526],
    ["CodeRabbit", 347564],
  ];
  const checks = status.required_status_checks;
  assert(
    Array.isArray(checks) &&
      checks.length === expected.length &&
      expected.every(([context, provider]) =>
        checks.some(
          (check) =>
            check.context === context && check.integration_id === provider,
        ),
      ),
    "Required native checks must retain their verified provider identities.",
  );
};

const referencesPublishedPath = (files, relative) =>
  safePath(relative) &&
  (files.has(relative) ||
    [...files].some((file) => file.startsWith(relative + "/")));

export const validateNavigation = (
  navigation,
  files,
  checks = requiredChecks,
) => {
  assert(
    navigation?.schemaVersion === 1 &&
      Array.isArray(navigation.tasks) &&
      navigation.tasks.length > 0,
    "Publish a nonempty governance task map.",
  );
  const identifiers = new Set();
  for (const task of navigation.tasks) {
    assert(
      typeof task.id === "string" &&
        task.id.trim() &&
        !identifiers.has(task.id) &&
        typeof task.when === "string" &&
        task.when.trim(),
      "Navigation tasks require unique identities and meaningful triggers.",
    );
    identifiers.add(task.id);
    for (const field of [
      "owners",
      "contracts",
      "tests",
      ...(task.rules ? ["rules"] : []),
    ])
      assert(
        Array.isArray(task[field]) &&
          task[field].length > 0 &&
          task[field].every((file) => referencesPublishedPath(files, file)),
        "Task navigation must refer only to published owners, contracts, rules, and tests.",
      );
    assert(
      Array.isArray(task.checks) &&
        task.checks.length > 0 &&
        new Set(task.checks).size === task.checks.length &&
        task.checks.every((id) => checks.includes(id)),
      "Task checks must refer to actual canonical governance checks.",
    );
  }
};

function* markdownTargets(content) {
  for (const match of content.matchAll(
    /^ {0,3}\[[^\]\r\n]+\]:[ \t]*(?:\r?\n[ \t]*)?(?:<([^>\r\n]*)>|([^\s]+))/gm,
  ))
    yield match[1] ?? match[2];

  let cursor = 0;
  while (cursor < content.length) {
    const opening = content.indexOf("](", cursor);
    if (opening === -1) return;
    const closing = content.indexOf(")", opening + 2);
    if (closing === -1) return;
    cursor = closing + 1;
    const body = content.slice(opening + 2, closing).trim();
    if (body.startsWith("<")) {
      const end = body.indexOf(">");
      if (end !== -1) yield body.slice(1, end);
    } else {
      const whitespace = body.search(/\s/);
      yield whitespace === -1 ? body : body.slice(0, whitespace);
    }
  }
}

export const validateMarkdownLinks = (filename, content, files) => {
  for (const target of markdownTargets(content)) {
    if (target.startsWith("#") || /^https?:\/\//i.test(target)) continue;
    let local;
    try {
      local = decodeURIComponent(target.split("#")[0]);
    } catch {
      throw new Error("Documentation links must use valid URL encoding.");
    }
    const relative = path.posix.normalize(
      path.posix.join(path.posix.dirname(filename), local),
    );
    assert(
      local &&
        !local.startsWith("/") &&
        !local.includes("\\") &&
        referencesPublishedPath(files, relative),
      `Documentation links must resolve within the published inventory: ${filename}.`,
    );
  }
};

export const inspectGuidance = async (root) => {
  const { policy, files } = await readInventory(root);
  const [manifest, pkg, settings, navigation] = await Promise.all([
    readJson(root, manifestPath),
    readJson(root, "package.json"),
    readJson(root, ".agents/settings.json"),
    readJson(root, ".agents/navigation.json"),
  ]);
  validateManifest(manifest, pkg);
  for (const field of ["rules", "skills", "optionalHooks"])
    assert(
      Array.isArray(settings[field]) &&
        new Set(settings[field]).size === settings[field].length &&
        settings[field].every((file) => files.has(file)),
      "Settings must register only unique published guidance paths.",
    );
  equal(
    settings.recommendedChecks,
    manifest.checks.map(({ command }) => command),
    "Recommended commands must project the canonical full profile.",
  );
  equal(
    settings.recommendedChecksSource,
    { path: manifestPath, profile: "full" },
    "Identify the canonical validation profile.",
  );
  equal(
    settings.navigation,
    ".agents/navigation.json",
    "Identify the published task map.",
  );
  equal(settings.validation, manifestPath, "Identify the canonical manifest.");
  validateNavigation(navigation, files, checksForPhase(policy.phase));
  const validators = guidanceValidators(policy);
  if (validators) {
    const [cases, template] = await Promise.all([
      readJson(root, ".agents/evaluation/cases.json"),
      readJson(root, ".agents/evaluation/run-template.json"),
    ]);
    validators.validateGuidanceAssets({
      policy,
      settings,
      navigation,
      manifest,
      cases,
      template,
    });
  } else {
    equal(
      settings.optionalHooks,
      [],
      "Disabled guidance assets must not register hooks.",
    );
    assert(
      !Object.hasOwn(settings, "evaluation"),
      "Disabled guidance assets must not register evaluation cases.",
    );
  }
  const markdown = [...files].filter((file) => /\.md$/i.test(file));
  await Promise.all(
    markdown.map(async (file) =>
      validateMarkdownLinks(file, await readText(root, file), files),
    ),
  );
  return {
    markdownFiles: markdown.length,
    rules: settings.rules.length,
    skills: settings.skills.length,
  };
};

const validateActionStep = (step, trusted) => {
  if (step.uses)
    assert(
      /^[A-Za-z0-9_.\-/]+@[a-f0-9]{40}$/.test(step.uses),
      "Every external action must be pinned to an immutable commit.",
    );
  if (trusted && step.uses?.startsWith("actions/checkout@"))
    assert(
      step.with?.ref === expression("github.workflow_sha") &&
        step.with?.["persist-credentials"] === false,
      "Privileged PR guards must execute only immutable trusted default-branch code.",
    );
};

export const validateWorkflowTrust = (workflow) => {
  const targetEvent =
    workflow.on === "pull_request_target" ||
    (Array.isArray(workflow.on) &&
      workflow.on.includes("pull_request_target")) ||
    Object.hasOwn(workflow.on ?? {}, "pull_request_target");
  if (targetEvent)
    equal(
      workflow.on.pull_request_target,
      {
        branches: ["main"],
        types: [
          "opened",
          "synchronize",
          "reopened",
          "edited",
          "ready_for_review",
        ],
      },
      "Privileged PR guards must target main explicitly so the workflow and executed guard code remain trusted.",
    );
  assert(
    workflow.permissions &&
      typeof workflow.permissions === "object" &&
      [undefined, "read"].includes(workflow.permissions.contents),
    "Workflow permissions must be explicit and minimal.",
  );
  for (const job of Object.values(workflow.jobs ?? {})) {
    assert(
      job.permissions !== "write-all",
      "Job permissions must be explicit and minimal.",
    );
    const permissions = job.permissions ?? workflow.permissions;
    const trusted = targetEvent || Object.values(permissions).includes("write");
    for (const step of job.steps ?? []) {
      validateActionStep(step, trusted);
    }
  }
};

const sourceTestPatterns =
  "src/**/*.test.ts,src/test/**,scripts/*.test.mjs,scripts/*.test-support.mjs,scripts/test-native-release.mjs,scripts/test-docker-release.mjs";

const catalogDuplicationPaths = (files) => {
  const catalogs = [...files]
    .filter((file) =>
      /^src\/infrastructure\/localization\/catalogs\/[a-z]{2}\.ts$/.test(file),
    )
    .sort((left, right) => left.localeCompare(right));
  if (!catalogs.length) return [];
  assert(
    catalogs.length === 10 &&
      files.has("src/infrastructure/localization/catalogs/index.ts") &&
      files.has("src/infrastructure/localization/catalogs.test.ts"),
    "Publish all ten literal catalogs, their registry and integrity tests together.",
  );
  return catalogs;
};

const validateSonarProperties = (text, phase, files) => {
  const properties = Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const split = line.indexOf("=");
        return [line.slice(0, split), line.slice(split + 1)];
      }),
  );
  let testPatterns = sourceTestPatterns;
  if (phase === "governance") testPatterns = "scripts/*.test.mjs";
  else if (phase === "foundation")
    testPatterns = "src/**/*.test.ts,scripts/*.test.mjs";
  const sonarPolicy = {
    "sonar.sources": phase === "governance" ? "scripts" : "src,scripts",
    "sonar.tests": phase === "governance" ? "scripts" : "src,scripts",
    "sonar.test.inclusions": testPatterns,
    "sonar.exclusions": testPatterns,
    "sonar.javascript.lcov.reportPaths": "coverage/lcov.info",
    "sonar.qualitygate.wait": "false",
  };
  const catalogs = catalogDuplicationPaths(files);
  if (catalogs.length) sonarPolicy["sonar.cpd.exclusions"] = catalogs.join(",");
  for (const [key, expected] of Object.entries(sonarPolicy))
    equal(
      properties[key],
      expected,
      "Sonar must analyze actual published source and measured coverage with a separate native quality gate.",
    );
  assert(
    Object.keys(properties).every(
      (key) => key === "sonar.organization" || Object.hasOwn(sonarPolicy, key),
    ),
    "Do not suppress published rule, duplication, or coverage analysis through extra properties.",
  );
};

const validatePublishedWorkflows = async (root, phase, files, workflows) => {
  const codeqlPath = ".github/workflows/codeql.yml";
  validateCodeqlWorkflow(workflows[codeqlPath]);
  const otherWorkflows = Object.entries(workflows).filter(
    ([file]) => file !== codeqlPath,
  );
  if (!operationsPhases.has(phase)) {
    otherWorkflows.forEach(([, workflow]) => validateWorkflowTrust(workflow));
    return;
  }
  const policyFiles = [
    "scripts/check-operations-policy.mjs",
    "scripts/check-operations-policy.test.mjs",
  ];
  assert(
    policyFiles.every((file) => files.has(file)),
    "Operations policy and tests must be published before validating its workflows.",
  );
  await Promise.all(policyFiles.map((file) => regularFile(root, file)));
  const {
    operationsWorkflowPaths,
    operationsRequiredFiles,
    validateOperationsWorkflows,
  } = await import("./check-operations-policy.mjs");
  assert(
    [...operationsWorkflowPaths, ...operationsRequiredFiles].every((file) =>
      files.has(file),
    ),
    "Operations workflows and every declared owner must be published together.",
  );
  const selected = Object.fromEntries(
    operationsWorkflowPaths.map((file) => [file, workflows[file]]),
  );
  validateOperationsWorkflows(selected, files);
  const operationsPaths = new Set(operationsWorkflowPaths);
  otherWorkflows
    .filter(([file]) => !operationsPaths.has(file))
    .forEach(([, workflow]) => validateWorkflowTrust(workflow));
};

export const inspectPolicy = async (root) => {
  const { policy, files } = await readInventory(root);
  const workflowFiles = [...files].filter((file) =>
    /^\.github\/workflows\/.+\.ya?ml$/.test(file),
  );
  const [ci, rabbit, main, sonar, workflows] = await Promise.all([
    readText(root, ".github/workflows/ci.yml"),
    readText(root, ".coderabbit.yaml"),
    readJson(root, ".github/rulesets/main.json"),
    readText(root, "sonar-project.properties"),
    Promise.all(workflowFiles.map((file) => readText(root, file))),
  ]);
  validateCiWorkflow(parseYaml(ci));
  validateCodeRabbit(parseYaml(rabbit));
  const parsedWorkflows = Object.fromEntries(
    workflowFiles.map((file, index) => [file, parseYaml(workflows[index])]),
  );
  await validatePublishedWorkflows(root, policy.phase, files, parsedWorkflows);
  assert(
    files.has(".github/rulesets/main.json"),
    "The native main-branch protection plan must be published.",
  );
  validateRuleset(main);
  validateSonarProperties(sonar, policy.phase, files);
  return { workflows: workflowFiles.length };
};

export const inspectFormatting = async (root) => {
  const { files } = await readInventory(root);
  const prettier = await import("prettier");
  const configuration = await readJson(root, ".prettierrc.json");
  const supported = [...files].filter((file) =>
    /\.(?:json|ya?ml|mjs|md|ts)$/i.test(file),
  );
  const checked = await Promise.all(
    supported.map(async (file) => ({
      file,
      valid: await prettier.check(await readText(root, file), {
        ...configuration,
        filepath: file,
      }),
    })),
  );
  const failures = checked
    .filter(({ valid }) => !valid)
    .map(({ file }) => file);
  assert(
    !failures.length,
    `Published governance formatting must pass: ${failures.join(", ")}.`,
  );
  return supported.length;
};

export const validateAuditResult = (result) => {
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error("Online npm audit did not return a complete report.");
  }
  const vulnerabilities = report?.metadata?.vulnerabilities;
  assert(
    result.status === 0 &&
      !result.error &&
      !report.error &&
      ["info", "low", "moderate", "high", "critical"].every(
        (severity) =>
          Number.isSafeInteger(vulnerabilities?.[severity]) &&
          vulnerabilities[severity] >= 0,
      ) &&
      vulnerabilities.high === 0 &&
      vulnerabilities.critical === 0,
    "Online npm audit must complete successfully without high or critical vulnerabilities.",
  );
  return vulnerabilities;
};

const npm = (args, root, capture = false) => {
  assert(process.env.npm_execpath, "Run governance commands through npm.");
  return spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
};
/** @typedef {{ status: number | null, error?: Error }} CheckResult */

/**
 * @param {string} profile
 * @param {string} root
 * @param {(name: string) => CheckResult | Promise<CheckResult>} [execute]
 */
export const runProfile = async (
  profile,
  root,
  execute = (name) => npm(["run", name], root),
) => {
  const manifest = await readJson(root, manifestPath);
  validateManifest(manifest, await readJson(root, "package.json"));
  const selected = manifest.profiles[profile];
  assert(selected, "A declared validation profile is required.");
  const runNext = async (index) => {
    if (index === selected.length) return index;
    const id = selected[index];
    const result = await execute(scriptNames[id]);
    assert(
      result?.status === 0 && !result.error,
      `Required governance check failed: ${id}.`,
    );
    return runNext(index + 1);
  };
  return runNext(0);
};

export const runFull = (root, execute) => runProfile("full", root, execute);

const trackedFiles = async (root) => {
  try {
    await lstat(path.join(root, ".git"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const executable =
    process.platform === "win32"
      ? String.raw`C:\Program Files\Git\cmd\git.exe`
      : "/usr/bin/git";
  const result = spawnSync(executable, ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert(
    result.status === 0 && !result.error,
    "The existing Git repository must expose its exact tracked-file inventory.",
  );
  return result.stdout.split("\0").filter(Boolean);
};

export const coveragePlan = (files, phase) => {
  const tests = [...files].filter((file) => /\.test\.(?:mjs|ts)$/.test(file));
  const audit = phase === "governance" ? [] : ["scripts/run-audit.test.mjs"];
  const node = tests.filter((file) => !audit.includes(file));
  const sources = [...files].filter(
    (file) =>
      /^(?:scripts|src)\/.+\.(?:mjs|ts)$/.test(file) &&
      !/\.test(?:-support)?\.(?:mjs|ts)$/.test(file) &&
      !file.startsWith("src/test/") &&
      file !== "scripts/run-audit.mjs" &&
      !optInTestFiles.has(file),
  );
  assert(
    node.length > 0 && sources.length > 0,
    "Published tests and measured owners must be present.",
  );
  assert(
    audit.every((file) => files.has(file)),
    "Every classified test must be published, never skipped for a missing directory.",
  );
  return { node, audit, sources };
};

const nodeCoverage = async (root, tests, sources, report) => {
  await mkdir(path.dirname(path.join(root, report)), { recursive: true });
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-test-coverage",
      "--test-coverage-lines=80",
      "--test-coverage-branches=80",
      "--test-coverage-functions=80",
      ...sources.map((file) => `--test-coverage-include=${file}`),
      "--test",
      "--test-reporter=spec",
      "--test-reporter=lcov",
      "--test-reporter-destination=stdout",
      `--test-reporter-destination=${report}`,
      ...tests,
    ],
    { cwd: root, stdio: "inherit", windowsHide: true },
  );
  assert(
    result.status === 0 && !result.error,
    "Published tests and measured coverage must pass.",
  );
};

const runSourceTool = (mode, root) => {
  const commands = {
    "actions-lint": ["scripts/run-actionlint.mjs"],
    boundaries: ["scripts/check-boundaries.mjs"],
    typecheck: [
      "node_modules/typescript/bin/tsc",
      "--noEmit",
      "-p",
      "tsconfig.json",
    ],
    lint: ["node_modules/eslint/bin/eslint.js", "."],
  };
  const [file, ...args] = commands[mode];
  const result = spawnSync(process.execPath, [path.join(root, file), ...args], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  assert(
    result.status === 0 && !result.error,
    `Required source check failed: ${mode}.`,
  );
  return true;
};

const runCoverage = async (root, files, phase, auditOnly) => {
  const plan = coveragePlan(files, phase);
  if (auditOnly) {
    await nodeCoverage(
      root,
      plan.audit,
      ["scripts/run-audit.mjs"],
      "coverage/audit/lcov.info",
    );
    const { mergeCoverage } = await import("./merge-coverage.mjs");
    await mergeCoverage(root);
    return plan.audit.length;
  }
  await nodeCoverage(root, plan.node, plan.sources, "coverage/lcov.info");
  return plan.node.length;
};

export const runCheck = async (mode, root = repository) => {
  const { policy, files } = await readInventory(root);
  assert(
    [
      ...checksForPhase(policy.phase),
      "full",
      ...Object.keys(ciProfilesForPhase(policy.phase)),
    ].includes(mode),
    "Usage: npm run validate -- full, or a declared governance check.",
  );
  if (mode === "full" || Object.hasOwn(ciProfilesForPhase(policy.phase), mode))
    return runProfile(mode, root);
  if (mode === "snapshot")
    return inspectSnapshot(root, { trackedFiles: await trackedFiles(root) });
  if (["actions-lint", "boundaries", "typecheck", "lint"].includes(mode))
    return runSourceTool(mode, root);
  if (mode === "audit" && policy.phase !== "governance")
    return (await import("./run-audit.mjs")).runAudit({ root });
  if (mode === "audit")
    return validateAuditResult(
      npm(["audit", "--audit-level=high", "--json"], root, true),
    );
  if (mode === "format") return inspectFormatting(root);
  if (["coverage-tests", "audit-helper-tests"].includes(mode))
    return runCoverage(
      root,
      files,
      policy.phase,
      mode === "audit-helper-tests",
    );
  if (mode === "ci-policy") return inspectPolicy(root);
  if (mode === "guidance") return inspectGuidance(root);
  throw new Error(
    "Usage: npm run validate -- full, or a declared governance check.",
  );
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    assert(
      process.argv.length === 3,
      "Exactly one governance command is required.",
    );
    await runCheck(process.argv[2]);
    console.log("The requested validation check passed.");
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Governance validation failed.",
    );
    process.exitCode = 1;
  }
}
