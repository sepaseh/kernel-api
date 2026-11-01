import { spawnSync } from "node:child_process";
import { lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { parseDocument } from "yaml";

const repository = fileURLToPath(new URL("../", import.meta.url));
const inventoryPath = ".github/bootstrap-policy.json";
const manifestPath = ".agents/validation.json";
const scriptNames = {
  snapshot: "check:snapshot",
  "ci-policy": "check:ci",
  audit: "audit",
  format: "format:check",
  guidance: "check:guidance",
  "coverage-tests": "test:coverage",
};
export const requiredChecks = Object.keys(scriptNames);
export const testFiles = [
  "scripts/check-governance.test.mjs",
  "scripts/check-pr-size.test.mjs",
  "scripts/ci-evidence.test.mjs",
  "scripts/check-coderabbit-approval.test.mjs",
];
const sourceFiles = testFiles.map((file) => file.replace(".test.mjs", ".mjs"));
export const actions = {
  checkout: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  node: "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
  upload: "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9",
  download:
    "actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333",
  sonar:
    "SonarSource/sonarqube-scan-action@d209202bc7d53ff1cc128f7f907dac145c9d6ae9",
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
  !/(?:^|\/)(?:\.git|node_modules|coverage|test-results|src|drizzle|deploy|collection)(?:\/|$)/.test(
    value,
  ) &&
  !/(?:^|\/)(?:\.env(?:\.|$)|settings\.local\.json$)/i.test(value) &&
  !/\.(?:pem|key|pfx|p12|sqlite|db)$/i.test(value);

export const validateInventory = (policy) => {
  assert(
    policy?.schemaVersion === 1 &&
      policy.phase === "governance" &&
      policy.applicationReady === false &&
      policy.maximumChangedFiles === 100 &&
      policy.targetChangedFiles === 80 &&
      Array.isArray(policy.allowedFiles) &&
      policy.allowedFiles.length > 0,
    "Declare governance scope, target 80, hard limit 100, and no application readiness.",
  );
  const files = new Set(policy.allowedFiles);
  assert(
    files.size === policy.allowedFiles.length && [...files].every(safePath),
    "The publication inventory must contain unique safe governance file paths.",
  );
  const mandatory = [
    inventoryPath,
    manifestPath,
    ".agents/settings.json",
    ".agents/navigation.json",
    ".github/workflows/ci.yml",
    ".github/workflows/pr-policy.yml",
    ".coderabbit.yaml",
    "package.json",
    "package-lock.json",
    "sonar-project.properties",
    ...sourceFiles,
    ...testFiles,
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
  for (const [index, part] of relative.split("/").entries()) {
    filename = path.join(filename, part);
    const info = await lstat(filename);
    assert(
      !info.isSymbolicLink() &&
        (index === relative.split("/").length - 1
          ? info.isFile()
          : info.isDirectory()),
      "Published files must not contain symbolic links or special files.",
    );
  }
  return filename;
};
const readJson = async (root, relative) =>
  JSON.parse(await readFile(await regularFile(root, relative), "utf8"));
const readInventory = async (root) => {
  const policy = await readJson(root, inventoryPath);
  return { policy, files: validateInventory(policy) };
};

export const validatePackage = (pkg, lock) => {
  assert(
    pkg?.name === "kernel-api" && pkg.private === true && pkg.type === "module",
    "The governance package must remain private and use Node ES modules.",
  );
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
    "workspaces",
    "overrides",
  ])
    assert(
      !Object.hasOwn(pkg, field),
      "PR1 must not publish API dependencies.",
    );
  equal(
    pkg.devDependencies,
    { prettier: "3.9.10", yaml: "2.9.1" },
    "Governance tooling versions must match the reviewed pinned dependencies.",
  );
  const expected = {
    validate: "node scripts/check-governance.mjs",
    ...Object.fromEntries(
      Object.entries(scriptNames).map(([id, name]) => [
        name,
        `node scripts/check-governance.mjs ${id}`,
      ]),
    ),
  };
  equal(
    pkg.scripts,
    expected,
    "Package scripts must execute the real governance checks.",
  );
  assert(
    lock?.lockfileVersion === 3 && lock.name === pkg.name,
    "A root npm lockfile is required.",
  );
  equal(
    lock.packages?.[""]?.devDependencies,
    pkg.devDependencies,
    "The lockfile must match the tooling manifest.",
  );
  const locations = Object.keys(lock.packages ?? {}).sort();
  equal(
    locations,
    ["", "node_modules/prettier", "node_modules/yaml"],
    "The governance lockfile must contain only its two tooling dependencies.",
  );
  for (const [name, version] of Object.entries(pkg.devDependencies))
    assert(
      lock.packages[`node_modules/${name}`]?.version === version &&
        lock.packages[`node_modules/${name}`]?.dev === true &&
        typeof lock.packages[`node_modules/${name}`]?.integrity === "string",
      "The locked tooling packages must have reviewed versions and integrity hashes.",
    );
};

export const inspectSnapshot = async (root, { trackedFiles = [] } = {}) => {
  const { files } = await readInventory(root);
  for (const file of files) await regularFile(root, file);
  assert(
    trackedFiles.every((file) => files.has(file)),
    "Tracked files outside the declared governance snapshot cannot be published.",
  );
  validatePackage(
    await readJson(root, "package.json"),
    await readJson(root, "package-lock.json"),
  );
  return { phase: "governance", files: files.size, applicationReady: false };
};

export const validateManifest = (manifest, pkg) => {
  assert(
    manifest?.schemaVersion === 1 &&
      manifest.phase === "governance" &&
      manifest.applicationReady === false &&
      Array.isArray(manifest.checks),
    "The canonical manifest must describe the governance phase.",
  );
  equal(
    manifest.checks.map(({ id }) => id),
    requiredChecks,
    "All six real governance checks must be declared once in canonical order.",
  );
  equal(
    manifest.profiles,
    { full: requiredChecks },
    "The full profile must execute every required governance check exactly once.",
  );
  for (const check of manifest.checks) {
    assert(check.kind === "required", "Governance checks cannot be advisory.");
    equal(
      check.ciJobs,
      ["check"],
      "Required checks must run in the unconditional check job.",
    );
    equal(
      check.scopes,
      ["governance"],
      "Do not attribute governance evidence to API code.",
    );
    equal(
      check.command,
      `npm run ${scriptNames[check.id]}`,
      "Canonical commands must invoke the owning governance package script.",
    );
    equal(
      pkg.scripts?.[scriptNames[check.id]],
      `node scripts/check-governance.mjs ${check.id}`,
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
  steps?.map(({ name: _name, ...step }) => step);
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
    Object.keys(workflow ?? {}).sort(),
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
      group: "ci-" + expression("github.ref"),
      "cancel-in-progress": expression("github.ref != 'refs/heads/main'"),
    },
    "Cancel obsolete PR runs while preserving main-branch validation.",
  );
  equal(
    Object.keys(workflow.jobs ?? {}).sort(),
    ["analysis", "bootstrap-file-limit", "check"],
    "Keep full validation, dependent analysis, and the initial read-only file guard explicit.",
  );
  const { steps: checkSteps, ...check } = workflow.jobs.check;
  equal(
    check,
    {
      "runs-on": "ubuntu-latest",
      "timeout-minutes": 20,
      outputs: {
        artifact: expression("steps.evidence.outputs.artifact"),
        attempt: expression("steps.evidence.outputs.attempt"),
      },
    },
    "Full validation must be unconditional, required, and run in its declared job.",
  );
  equal(
    stepsWithoutNames(checkSteps),
    [
      checkout(),
      setupNode(),
      {
        run: "npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund",
      },
      { run: "npm run validate -- full" },
      { id: "evidence", run: "node scripts/ci-evidence.mjs --record" },
      {
        uses: actions.upload,
        with: {
          name: expression("steps.evidence.outputs.artifact"),
          path: "coverage/lcov.info\ncoverage/ci-evidence.json\n",
          "if-no-files-found": "error",
          "retention-days": 3,
          overwrite: false,
          "include-hidden-files": false,
        },
      },
    ],
    "CI must install strictly, run full once, and bind measured coverage before upload.",
  );
  const { steps: analysisSteps, ...analysis } = workflow.jobs.analysis;
  equal(
    analysis,
    {
      name: "SonarQube Cloud analysis",
      needs: "check",
      if: "github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository",
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
          name: expression("needs.check.outputs.artifact"),
          path: "coverage",
          "digest-mismatch": "error",
        },
      },
      {
        env: {
          CI_EVIDENCE_PRODUCER_ATTEMPT: expression(
            "needs.check.outputs.attempt",
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
          args: "-Dsonar.projectKey=" + expression("vars.SONAR_PROJECT_KEY"),
        },
      },
    ],
    "Sonar must verify the same run's measured coverage and execute a real scanner without rerunning tests.",
  );
  const { steps: fileSteps, ...fileJob } =
    workflow.jobs["bootstrap-file-limit"];
  equal(
    fileJob,
    {
      name: "Bootstrap PR file limit",
      if: "github.event_name == 'pull_request'",
      "runs-on": "ubuntu-latest",
      "timeout-minutes": 5,
      permissions: { contents: "read", "pull-requests": "read" },
    },
    "The initial file guard must remain a read-only PR job.",
  );
  equal(
    stepsWithoutNames(fileSteps),
    [
      checkout(),
      setupNode(false),
      {
        env: { GITHUB_TOKEN: expression("github.token") },
        run: "node scripts/check-pr-size.mjs",
      },
    ],
    "The initial file guard must count real GitHub entries without secrets or installations.",
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

export const validateRuleset = (ruleset, bootstrap = false) => {
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
    ["Bootstrap PR file limit", 15368],
    ["SonarQube Cloud analysis", 15368],
    ["SonarCloud Code Analysis", 12526],
    ["CodeRabbit", 347564],
    ...(!bootstrap
      ? [
          ["PR file limit", 15368],
          ["CodeRabbit approval", 15368],
        ]
      : []),
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
    "Required native and derived checks must retain their verified provider identities.",
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

export const validateMarkdownLinks = (filename, content, files) => {
  for (const match of content.matchAll(
    /!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g,
  )) {
    const target = match[1].replace(/^<|>$/g, "");
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
  const { files } = await readInventory(root);
  const manifest = await readJson(root, manifestPath);
  validateManifest(manifest, await readJson(root, "package.json"));
  const settings = await readJson(root, ".agents/settings.json");
  for (const field of ["rules", "skills", "optionalHooks"])
    assert(
      Array.isArray(settings[field]) &&
        new Set(settings[field]).size === settings[field].length &&
        settings[field].every((file) => files.has(file)),
      "Settings must register only unique published guidance paths.",
    );
  equal(
    settings.optionalHooks,
    [],
    "No uninstalled hooks are part of governance evidence.",
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
  assert(
    !Object.hasOwn(settings, "evaluation"),
    "Do not register unpublished evaluation prompts.",
  );
  validateNavigation(await readJson(root, ".agents/navigation.json"), files);
  const markdown = [...files].filter((file) => /\.md$/i.test(file));
  for (const file of markdown)
    validateMarkdownLinks(
      file,
      await readFile(await regularFile(root, file), "utf8"),
      files,
    );
  return {
    markdownFiles: markdown.length,
    rules: settings.rules.length,
    skills: settings.skills.length,
  };
};

export const inspectPolicy = async (root) => {
  const { files } = await readInventory(root);
  validateCiWorkflow(
    parseYaml(
      await readFile(
        await regularFile(root, ".github/workflows/ci.yml"),
        "utf8",
      ),
    ),
  );
  validateCodeRabbit(
    parseYaml(
      await readFile(await regularFile(root, ".coderabbit.yaml"), "utf8"),
    ),
  );
  for (const file of files) {
    if (!/^\.github\/workflows\/.+\.yml$/.test(file)) continue;
    const workflow = parseYaml(
      await readFile(await regularFile(root, file), "utf8"),
    );
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
      for (const step of job.steps ?? []) {
        if (step.uses)
          assert(
            /^[A-Za-z0-9_.\-/]+@[a-f0-9]{40}$/.test(step.uses),
            "Every external action must be pinned to an immutable commit.",
          );
        if (
          (targetEvent || workflow.permissions.checks === "write") &&
          step.uses?.startsWith("actions/checkout@")
        )
          assert(
            step.with?.ref === expression("github.workflow_sha") &&
              step.with?.["persist-credentials"] === false,
            "Privileged PR guards must execute only immutable trusted default-branch code.",
          );
      }
    }
  }
  for (const file of [
    ".github/rulesets/main.json",
    ".github/rulesets/bootstrap.json",
  ])
    assert(
      files.has(file),
      "Both complete and initial-bootstrap protection plans must be published.",
    );
  validateRuleset(await readJson(root, ".github/rulesets/main.json"));
  validateRuleset(
    await readJson(root, ".github/rulesets/bootstrap.json"),
    true,
  );
  const sizeScript = await readFile(
    await regularFile(root, "scripts/check-pr-size.mjs"),
    "utf8",
  );
  assert(
    /export const maximumChangedFiles = 100;/.test(sizeScript),
    "The real changed-file guard must retain the hard 100-entry limit.",
  );
  const properties = Object.fromEntries(
    (
      await readFile(
        await regularFile(root, "sonar-project.properties"),
        "utf8",
      )
    )
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const split = line.indexOf("=");
        return [line.slice(0, split), line.slice(split + 1)];
      }),
  );
  const sonarPolicy = {
    "sonar.sources": "scripts",
    "sonar.tests": "scripts",
    "sonar.test.inclusions": "scripts/*.test.mjs",
    "sonar.exclusions": "scripts/*.test.mjs",
    "sonar.javascript.lcov.reportPaths": "coverage/lcov.info",
    "sonar.qualitygate.wait": "false",
  };
  for (const [key, expected] of Object.entries(sonarPolicy))
    equal(
      properties[key],
      expected,
      "Sonar must analyze genuine governance source and measured coverage with a separate native quality gate.",
    );
  assert(
    Object.keys(properties).every(
      (key) => key === "sonar.organization" || Object.hasOwn(sonarPolicy, key),
    ),
    "Do not suppress governance rule, duplication, or coverage analysis through extra properties.",
  );
  return {
    workflows: [...files].filter((file) =>
      /^\.github\/workflows\/.+\.yml$/.test(file),
    ).length,
  };
};

export const inspectFormatting = async (root) => {
  const { files } = await readInventory(root);
  const prettier = await import("prettier");
  const configuration = await readJson(root, ".prettierrc.json");
  const supported = [...files].filter((file) =>
    /\.(?:json|ya?ml|mjs|md)$/i.test(file),
  );
  const failures = [];
  for (const file of supported) {
    const contents = await readFile(await regularFile(root, file), "utf8");
    if (!(await prettier.check(contents, { ...configuration, filepath: file })))
      failures.push(file);
  }
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
export const runFull = async (
  root,
  execute = (name) => npm(["run", name], root),
) => {
  const manifest = await readJson(root, manifestPath);
  validateManifest(manifest, await readJson(root, "package.json"));
  for (const id of manifest.profiles.full) {
    const result = await execute(scriptNames[id]);
    assert(
      result?.status === 0 && !result.error,
      `Required governance check failed: ${id}.`,
    );
  }
  return requiredChecks.length;
};

const trackedFiles = (root) => {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 ? result.stdout.split("\0").filter(Boolean) : [];
};

export const runCheck = async (mode, root = repository) => {
  assert(
    [...requiredChecks, "full"].includes(mode),
    "Usage: npm run validate -- full, or a declared governance check.",
  );
  if (mode === "full") return runFull(root);
  await readInventory(root);
  if (mode === "snapshot")
    return inspectSnapshot(root, { trackedFiles: trackedFiles(root) });
  if (mode === "audit")
    return validateAuditResult(
      npm(["audit", "--audit-level=high", "--json"], root, true),
    );
  if (mode === "format") return inspectFormatting(root);
  if (mode === "coverage-tests") {
    await mkdir(path.join(root, "coverage"), { recursive: true });
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-test-coverage",
        "--test-coverage-lines=80",
        "--test-coverage-branches=80",
        "--test-coverage-functions=80",
        ...sourceFiles.map((file) => `--test-coverage-include=${file}`),
        "--test",
        "--test-reporter=spec",
        "--test-reporter=lcov",
        "--test-reporter-destination=stdout",
        "--test-reporter-destination=coverage/lcov.info",
        ...testFiles,
      ],
      { cwd: root, stdio: "inherit", windowsHide: true },
    );
    assert(
      result.status === 0 && !result.error,
      "Governance tests and measured coverage must pass.",
    );
    return testFiles.length;
  }
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
    const result = await runCheck(process.argv[2]);
    console.log(
      `Governance ${process.argv[2]} passed: ${JSON.stringify(result)}`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Governance validation failed.",
    );
    process.exitCode = 1;
  }
}
