import { isDeepStrictEqual } from "node:util";

export const operationsWorkflowPaths = Object.freeze(
  ["dast", "deployment-smoke", "release", "staging"].map(
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
  node: "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
  release:
    "googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7",
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
const concurrencyGroups = [
  "staging-dast",
  "api-smoke",
  "api-release",
  "api-staging",
];
const releaseToken = "${{ secrets.RELEASE_PLEASE_TOKEN }}";
const requireReleaseToken = `if [[ -z "$RELEASE_PLEASE_TOKEN" ]]; then
  echo "::error::Configure RELEASE_PLEASE_TOKEN before running Release."
  exit 1
fi`;
const requireDastEgress = `echo "::error::DAST requires verified staging-only scanner egress before it can run."
exit 1`;
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
const validateRoot = (workflow, group) => {
  onlyKeys(
    workflow,
    ["name", "on", "permissions", "concurrency", "jobs"],
    "workflow",
  );
  exact(workflow.permissions, readOnly, "root permissions");
  exact(
    workflow.concurrency,
    { group, "cancel-in-progress": false },
    "concurrency",
  );
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
    { run: requireDastEgress },
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
  const job = readOnlyJob(workflow, "release", ["if"]);
  exact(job.if, "github.ref == 'refs/heads/main'", "release source branch");
  validateSteps(job.steps, [
    {
      env: { RELEASE_PLEASE_TOKEN: releaseToken },
      run: requireReleaseToken,
    },
    {
      uses: actions.release,
      with: {
        "config-file": "release-please-config.json",
        "manifest-file": ".release-please-manifest.json",
        token: releaseToken,
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
    validateDast,
    (workflow) => validateVerification(workflow, "smoke"),
    validateRelease,
    (workflow) => validateVerification(workflow, "staging"),
  ];
  for (const [index, filename] of operationsWorkflowPaths.entries()) {
    const workflow = workflows[filename];
    validateRoot(workflow, concurrencyGroups[index]);
    validators[index](workflow);
  }
};
