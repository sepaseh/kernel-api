import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseDocument } from "yaml";

const repository = fileURLToPath(new URL("../", import.meta.url));
const requiredPullRequestTypes = [
  "opened",
  "synchronize",
  "reopened",
  "ready_for_review",
];

export const parseWorkflow = (content) => {
  const document = parseDocument(content, { uniqueKeys: true });
  if (document.errors.length)
    throw new Error("CI workflow must be valid YAML with unique keys");
  return document.toJS({ maxAliasCount: 100 });
};

const validatePullRequestEvent = (events) => {
  const names = typeof events === "string" ? [events] : events;
  const triggers = Array.isArray(names)
    ? Object.fromEntries(names.map((event) => [event, null]))
    : names;
  if (!triggers || !Object.hasOwn(triggers, "pull_request"))
    throw new Error("CI must run on pull_request events");
  const pullRequest = triggers.pull_request;
  if (pullRequest === null) return;
  if (typeof pullRequest !== "object" || Array.isArray(pullRequest))
    throw new Error("The pull_request trigger must use a configuration object");
  if (
    ["paths", "paths-ignore", "branches", "branches-ignore"].some((key) =>
      Object.hasOwn(pullRequest, key),
    )
  )
    throw new Error("Pull request CI must not use path or branch filters");
  if (
    Object.hasOwn(pullRequest, "types") &&
    (!Array.isArray(pullRequest.types) ||
      requiredPullRequestTypes.some(
        (type) => !pullRequest.types.includes(type),
      ))
  )
    throw new Error(
      "Pull request CI must include every required activity type",
    );
};

const validateRootDirectory = (run = {}) => {
  if (
    Object.hasOwn(run, "working-directory") &&
    ![".", "./"].includes(run["working-directory"])
  )
    throw new Error("CI validation must run from the repository root");
  if (Object.hasOwn(run, "shell"))
    throw new Error("CI validation must use the runner's default shell");
};

const validateUnconditional = (value) => {
  if (Object.hasOwn(value, "if") || Object.hasOwn(value, "continue-on-error"))
    throw new Error("CI validation must run unconditionally and fail on error");
};

const validateCheckJob = (workflow) => {
  const job = workflow?.jobs?.check;
  if (!job || !Array.isArray(job.steps))
    throw new Error("CI must declare the check job with explicit steps");
  validateUnconditional(job);
  if (Object.hasOwn(job, "needs") || Object.hasOwn(job, "strategy"))
    throw new Error("The check job must not depend on other jobs or a matrix");
  if (job["runs-on"] !== "ubuntu-latest")
    throw new Error("The published phase requires the Ubuntu check runner");
  validateRootDirectory(workflow.defaults?.run);
  validateRootDirectory(job.defaults?.run);
  return job;
};

const commandStep = (steps, command) => {
  const matches = steps
    .map((step, index) => ({ index, step }))
    .filter(
      ({ step }) =>
        typeof step?.run === "string" && step.run.trim() === command,
    );
  if (matches.length !== 1)
    throw new Error("CI must execute exactly one " + command + " step");
  const { index, step } = matches[0];
  validateUnconditional(step);
  validateRootDirectory(step);
  return index;
};

export const validateCiWorkflow = (workflow, manifest) => {
  validatePullRequestEvent(workflow?.on);
  const job = validateCheckJob(workflow);
  const required = manifest.checks.filter((check) => check.kind === "required");
  if (
    !required.length ||
    required.some(
      (check) =>
        !Array.isArray(check.ciJobs) ||
        check.ciJobs.length !== 1 ||
        check.ciJobs[0] !== "check",
    )
  )
    throw new Error(
      "Every required phase check must belong to check; a multi-job phase needs an explicit CI policy transition",
    );
  const install = commandStep(job.steps, "npm ci");
  const full = commandStep(job.steps, "npm run validate -- full");
  if (install >= full)
    throw new Error(
      "CI must install dependencies before running the full gate",
    );
  return { checks: required.length, phase: manifest.phase };
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [source, manifest] = await Promise.all([
      readFile(path.join(repository, ".github/workflows/ci.yml"), "utf8"),
      readFile(path.join(repository, ".agents/validation.json"), "utf8").then(
        JSON.parse,
      ),
    ]);
    validateCiWorkflow(parseWorkflow(source), manifest);
    console.log(
      "CI policy passed: every required phase check uses the full gate.",
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        message: error instanceof Error ? error.message : "CI policy failed.",
        status: "failed",
      }).replaceAll(/[\r\n\u2028\u2029]/g, " "),
    );
    process.exitCode = 1;
  }
}
