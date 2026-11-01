import { isDeepStrictEqual } from "node:util";

export const optionalHookPaths = Object.freeze([
  ".agents/hooks/block-dangerous.mjs",
  ".agents/hooks/block-dangerous.sh",
  ".agents/hooks/post-edit-format.sh",
  ".agents/hooks/quality-gate.sh",
]);
export const guidanceAssetPaths = Object.freeze([
  ...optionalHookPaths,
  ".agents/evaluation/README.md",
  ".agents/evaluation/cases.json",
  ".agents/evaluation/run-template.json",
  "scripts/ai-hooks.portable.test.mjs",
  "scripts/check-guidance-assets.mjs",
  "scripts/check-guidance-assets.test.mjs",
]);

const requireCondition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const equal = (actual, expected, message) =>
  requireCondition(isDeepStrictEqual(actual, expected), message);
const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;
const nonemptyUnique = (values) =>
  Array.isArray(values) &&
  values.length > 0 &&
  values.every(nonempty) &&
  new Set(values).size === values.length;
const isAssetNamespace = (file) =>
  /^\.agents\/(?:hooks|evaluation)(?:\/|$)/.test(file) ||
  guidanceAssetPaths.includes(file);

export const validateGuidanceInventory = (policy) => {
  requireCondition(
    policy &&
      Array.isArray(policy.allowedFiles) &&
      policy.allowedFiles.every(nonempty),
    "Guidance assets require an explicit publication inventory.",
  );
  requireCondition(
    !Object.hasOwn(policy, "guidanceAssets") ||
      typeof policy.guidanceAssets === "boolean",
    "guidanceAssets must be an optional boolean flag.",
  );
  const declared = policy.allowedFiles.filter(isAssetNamespace);
  if (policy.guidanceAssets !== true) {
    requireCondition(
      declared.length === 0,
      "Guidance assets cannot be published without the explicit flag.",
    );
    return false;
  }
  requireCondition(
    policy.phase === "local-runtime",
    "Guidance assets belong only to the complete local-runtime phase.",
  );
  const files = new Set(declared);
  requireCondition(
    files.size === declared.length &&
      files.size === guidanceAssetPaths.length &&
      guidanceAssetPaths.every((file) => files.has(file)),
    "Publish the exact ten guidance assets together; partial or additional assets are not allowed.",
  );
  return true;
};

const safeEvidence = (file, files) =>
  typeof file === "string" &&
  /^[A-Za-z0-9_.\-/]+$/.test(file) &&
  file.split("/").every((part) => part && part !== "." && part !== "..") &&
  !/(?:^|\/)(?:\.git|node_modules|coverage|test-results|_local-preserved)(?:\/|$)/.test(
    file,
  ) &&
  !/(?:^|\/)(?:uploads|buckets|backups|server\/data)(?:\/|$)/.test(file) &&
  !/\.(?:pem|key|pfx|p12|sqlite(?:3)?|db)(?:-(?:wal|shm|journal))?$/i.test(
    file,
  ) &&
  !/(?:^|\/)(?:credentials(?:\.json)?|id_rsa|id_ed25519|\.npmrc|\.netrc|\.pypirc)$/i.test(
    file,
  ) &&
  (!/(?:^|\/)(?:\.env(?:\.|$)|settings\.local\.json$)/i.test(file) ||
    file === ".env.example") &&
  files.has(file);

const evaluationVocabulary = (navigation, manifest) => {
  requireCondition(
    navigation?.schemaVersion === 1 && Array.isArray(navigation.tasks),
    "Evaluation cases require the live navigation task map.",
  );
  requireCondition(
    manifest?.schemaVersion === 1 &&
      manifest.phase === "local-runtime" &&
      Array.isArray(manifest.checks),
    "Evaluation cases require the live local-runtime validation manifest.",
  );
  const taskIds = navigation.tasks.map((task) => task?.id);
  const checkIds = manifest.checks.map((check) => check?.id);
  requireCondition(
    nonemptyUnique(taskIds) &&
      nonemptyUnique(checkIds) &&
      nonemptyUnique(manifest.profiles?.full),
    "Live task and check identities must be unique and nonempty.",
  );
  const checks = new Set(checkIds);
  requireCondition(
    manifest.profiles.full.every((id) => checks.has(id)),
    "The full profile must refer to declared checks.",
  );
  return { tasks: new Set(taskIds), checks: new Set(manifest.profiles.full) };
};

const validateCase = (item, files, vocabulary) => {
  requireCondition(
    item && nonempty(item.id),
    "Every evaluation case needs an identity.",
  );
  requireCondition(
    item.prompt &&
      isDeepStrictEqual(Object.keys(item.prompt), ["en"]) &&
      nonempty(item.prompt.en),
    "Evaluation prompts must contain only a nonempty English en field.",
  );
  requireCondition(
    nonemptyUnique(item.taskIds) &&
      item.taskIds.every((id) => vocabulary.tasks.has(id)),
    "Evaluation task IDs must refer to live navigation tasks.",
  );
  requireCondition(
    nonemptyUnique(item.checks) &&
      item.checks.every((id) => vocabulary.checks.has(id)),
    "Evaluation checks must refer to the canonical full profile.",
  );
  requireCondition(
    nonemptyUnique(item.evidence) &&
      item.evidence.every((file) => safeEvidence(file, files)),
    "Evaluation evidence must refer to safe published files.",
  );
  requireCondition(
    nonemptyUnique(item.mustExplain) && nonemptyUnique(item.mustNot),
    "Evaluation cases need nonempty positive and negative criteria.",
  );
};

const validateCases = (cases, files, vocabulary) => {
  requireCondition(
    cases?.schemaVersion === 1 &&
      Array.isArray(cases.cases) &&
      cases.cases.length > 0,
    "Publish a nonempty versioned evaluation case list.",
  );
  const identities = cases.cases.map((item) => item?.id);
  requireCondition(
    nonemptyUnique(identities),
    "Evaluation case identities must be unique and nonempty.",
  );
  cases.cases.forEach((item) => validateCase(item, files, vocabulary));
};

const validateTemplate = (template) => {
  requireCondition(
    template &&
      nonempty(template.configuration) &&
      nonemptyUnique(template.limitations),
    "The evaluation template requires configuration and limitations.",
  );
  const blank = {
    schemaVersion: 1,
    state: "not-run",
    startedAt: null,
    repositoryCommit: null,
    workingTreeFingerprint: null,
    assistant: { name: null, version: null, model: null, host: null },
    configuration: template.configuration,
    instructionDiscovery: {
      reportedLoadedFiles: [],
      evidence: null,
      status: "unknown",
      readingNavigationTrace: [],
    },
    index: {
      tool: null,
      version: null,
      sourceScope: [],
      generatedAt: null,
      dirtyUntrackedFingerprint: null,
    },
    caseResults: [],
    limitations: template.limitations,
    exactPrompt: null,
    assistedDiscovery: {
      attempted: null,
      exactPrompt: null,
      suppliedPaths: [],
      readingNavigationTrace: [],
      evidence: null,
    },
  };
  equal(
    template,
    blank,
    "The maintained evaluation template must stay not-run/unknown with no recorded observations or results.",
  );
};

export const validateGuidanceAssets = ({
  policy,
  settings,
  navigation,
  manifest,
  cases,
  template,
}) => {
  const enabled = validateGuidanceInventory(policy);
  requireCondition(
    settings && Array.isArray(settings.optionalHooks),
    "Register optional hooks explicitly in settings.",
  );
  if (!enabled) {
    equal(
      settings.optionalHooks,
      [],
      "Disabled guidance assets must not register hooks.",
    );
    requireCondition(
      !Object.hasOwn(settings, "evaluation"),
      "Disabled guidance assets must not register evaluation cases.",
    );
    return { enabled: false, cases: 0 };
  }
  equal(
    settings.optionalHooks,
    optionalHookPaths,
    "Register exactly the four published optional hooks in canonical order.",
  );
  equal(
    settings.evaluation,
    ".agents/evaluation/cases.json",
    "Register the canonical published evaluation cases.",
  );
  const vocabulary = evaluationVocabulary(navigation, manifest);
  validateCases(cases, new Set(policy.allowedFiles), vocabulary);
  validateTemplate(template);
  return { enabled: true, cases: cases.cases.length };
};
