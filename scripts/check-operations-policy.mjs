import { isDeepStrictEqual } from "node:util";

export const operationsWorkflowPaths = Object.freeze(
  ["codeql", "dast", "deployment-smoke", "release", "staging"].map(
    (name) => `.github/workflows/${name}.yml`,
  ),
);
export const operationsRequiredFiles = Object.freeze([
  ...operationsWorkflowPaths,
  ".nvmrc",
  "package.json",
  "release-please-config.json",
  ".release-please-manifest.json",
  ...[
    "check-operations-policy",
    "validate-workflow-targets",
    "check-deployed-api",
    "healthcheck",
  ].flatMap((name) => [`scripts/${name}.mjs`, `scripts/${name}.test.mjs`]),
  "scripts/check-deployed-api.integration.test.mjs",
]);

const actions = {
  checkout: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  codeqlInit:
    "github/codeql-action/init@cdf488f595d80d6e07e03d4674febd5ab45fa938",
  codeqlAnalyze:
    "github/codeql-action/analyze@cdf488f595d80d6e07e03d4674febd5ab45fa938",
  node: "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
  release:
    "googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7",
  zap: "zaproxy/action-full-scan@3c58388149901b9a03b7718852c5ba889646c27c",
};
const checkout = {
  uses: actions.checkout,
  with: { "persist-credentials": false },
};
const setupNode = {
  uses: actions.node,
  with: { "node-version-file": ".nvmrc" },
};
const readOnly = { contents: "read" };
const requirePolicy = (condition, message) => {
  if (!condition) throw new Error(message);
};
const exact = (actual, expected, label) =>
  requirePolicy(
    isDeepStrictEqual(actual, expected),
    `Operations ${label} must preserve its reviewed authorization policy.`,
  );
const onlyKeys = (value, allowed, label) => {
  requirePolicy(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).every((key) => allowed.includes(key)),
    `Unexpected operations ${label} configuration requires an explicit policy transition.`,
  );
};
const validateRoot = (workflow) => {
  onlyKeys(
    workflow,
    ["name", "on", "permissions", "concurrency", "jobs"],
    "workflow",
  );
  exact(workflow.permissions, readOnly, "root permissions");
};
const emptyDispatch = (events) => {
  requirePolicy(
    Object.hasOwn(events, "workflow_dispatch") &&
      (events.workflow_dispatch === null ||
        (typeof events.workflow_dispatch === "object" &&
          !Array.isArray(events.workflow_dispatch) &&
          Object.keys(events.workflow_dispatch).length === 0)),
    "Operations dispatch must be explicit and must not accept execution instructions.",
  );
};
const manualTrigger = (events, inputName) => {
  onlyKeys(events, ["workflow_dispatch"], "manual triggers");
  if (!inputName) {
    emptyDispatch(events);
    return;
  }
  onlyKeys(events.workflow_dispatch, ["inputs"], "dispatch");
  const inputs = events.workflow_dispatch.inputs;
  exact(Object.keys(inputs ?? {}), [inputName], "dispatch input names");
  const input = inputs[inputName];
  onlyKeys(input, ["description", "required", "type"], "target input");
  requirePolicy(
    input.required === true && input.type === "string",
    "Operations require an explicit authorized target string.",
  );
};
const oneJob = (workflow, name, extraKeys = []) => {
  onlyKeys(workflow.jobs, [name], "jobs");
  exact(Object.keys(workflow.jobs), [name], "job set");
  const job = workflow.jobs[name];
  onlyKeys(
    job,
    ["name", "runs-on", "steps", "timeout-minutes", ...extraKeys],
    "job",
  );
  exact(job["runs-on"], "ubuntu-latest", "runner");
  requirePolicy(Array.isArray(job.steps), "Operations steps are required.");
  return job;
};
const readOnlyJob = (workflow, name, extraKeys = []) => {
  const job = oneJob(workflow, name, ["permissions", ...extraKeys]);
  if (Object.hasOwn(job, "permissions"))
    exact(job.permissions, readOnly, "verification permissions");
  return job;
};
const validateSteps = (actual, expected) => {
  exact(actual.length, expected.length, "step count");
  for (const [index, step] of actual.entries()) {
    onlyKeys(step, ["name", ...Object.keys(expected[index])], "step");
    const configuration = { ...step };
    delete configuration.name;
    if (typeof configuration.run === "string")
      configuration.run = configuration.run.trim().replaceAll("\r\n", "\n");
    exact(configuration, expected[index], "step execution");
  }
};

const validateCodeql = (workflow) => {
  const events = workflow.on;
  onlyKeys(
    events,
    ["push", "pull_request", "schedule", "workflow_dispatch"],
    "CodeQL triggers",
  );
  exact(events.push, { branches: ["main"] }, "CodeQL push trigger");
  exact(events.pull_request, { branches: ["main"] }, "CodeQL PR trigger");
  exact(events.schedule, [{ cron: "30 3 * * 1" }], "CodeQL schedule");
  emptyDispatch(events);
  const job = oneJob(workflow, "analyze", ["permissions"]);
  exact(
    job.permissions,
    { contents: "read", "security-events": "write" },
    "CodeQL report permissions",
  );
  validateSteps(job.steps, [
    checkout,
    {
      uses: actions.codeqlInit,
      with: {
        languages: "javascript-typescript",
        queries: "security-extended",
      },
    },
    { uses: actions.codeqlAnalyze },
  ]);
};
const validateDast = (workflow) => {
  manualTrigger(workflow.on, "target_url");
  const job = readOnlyJob(workflow, "zap", ["environment", "env"]);
  exact(job.environment, "staging", "DAST environment");
  exact(
    job.env,
    {
      DAST_ALLOWED_HOST: "${{ vars.STAGING_ALLOWED_API_HOST }}",
      DAST_PRODUCTION_HOST: "${{ vars.PRODUCTION_HOST }}",
      DAST_TARGET: "${{ inputs.target_url }}",
    },
    "DAST target guards",
  );
  validateSteps(job.steps, [
    checkout,
    setupNode,
    { run: "node scripts/validate-workflow-targets.mjs dast" },
    {
      uses: actions.zap,
      with: {
        allow_issue_writing: false,
        artifact_name: "staging-dast-${{ github.run_id }}",
        cmd_options: "-a",
        docker_name:
          "ghcr.io/zaproxy/zaproxy:2.17.0@sha256:c558ee87358911ab17278c70991e856f57793e115d9cd0f88ca475cf82907a1a",
        fail_action: true,
        target: "${{ env.DAST_TARGET }}",
      },
    },
  ]);
};
const validateVerification = (workflow, mode) => {
  manualTrigger(workflow.on, "api_url");
  const job = readOnlyJob(workflow, "verify", ["environment", "env"]);
  exact(job.environment, mode, "verification environment");
  const allowedHost =
    mode === "staging" ? "STAGING_ALLOWED_API_HOST" : "SMOKE_ALLOWED_API_HOST";
  exact(
    job.env,
    {
      API_DEPLOYMENT_URL: "${{ inputs.api_url }}",
      API_ALLOWED_HOST: "${{ vars." + allowedHost + " }}",
      PRODUCTION_HOST: "${{ vars.PRODUCTION_HOST }}",
      EXPECTED_DEPLOYMENT_ID: "${{ vars.EXPECTED_DEPLOYMENT_ID }}",
    },
    "verification target guards",
  );
  validateSteps(job.steps, [
    checkout,
    setupNode,
    { run: `node scripts/check-deployed-api.mjs ${mode}` },
  ]);
};
const validateRelease = (workflow) => {
  manualTrigger(workflow.on);
  const job = oneJob(workflow, "release", ["if", "permissions"]);
  exact(job.if, "github.ref == 'refs/heads/main'", "release source branch");
  exact(
    job.permissions,
    { contents: "write", "pull-requests": "write" },
    "release job permissions",
  );
  validateSteps(job.steps, [
    {
      uses: actions.release,
      with: {
        "config-file": "release-please-config.json",
        "manifest-file": ".release-please-manifest.json",
        token: "${{ secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN }}",
      },
    },
  ]);
};

export const validateOperationsWorkflows = (workflows, files) => {
  onlyKeys(workflows, operationsWorkflowPaths, "workflow definitions");
  exact(
    new Set(Object.keys(workflows)),
    new Set(operationsWorkflowPaths),
    "workflow inventory",
  );
  const published = new Set(files);
  requirePolicy(
    operationsRequiredFiles.every((file) => published.has(file)),
    "Operations phases must publish every workflow, configuration, enforcing owner and test.",
  );
  const validators = [
    validateCodeql,
    validateDast,
    (workflow) => validateVerification(workflow, "smoke"),
    validateRelease,
    (workflow) => validateVerification(workflow, "staging"),
  ];
  for (const [index, filename] of operationsWorkflowPaths.entries()) {
    const workflow = workflows[filename];
    validateRoot(workflow);
    validators[index](workflow);
  }
};
