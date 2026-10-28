import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseWorkflow, validateCiWorkflow } from "./check-ci.mjs";
import { runProfile } from "./validate.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));
export const isSafeGuidancePath = (filename) => {
  if (
    typeof filename !== "string" ||
    !filename.trim() ||
    path.isAbsolute(filename) ||
    /^[A-Za-z]:/.test(filename)
  )
    return false;
  const normalized = filename.replaceAll("\\", "/");
  if (
    normalized.split("/").includes("..") ||
    normalized.startsWith("/") ||
    /(^|\/)(?:\.git|node_modules|\.next|coverage)(?:\/|$)/.test(normalized) ||
    /(^|\/)server\/data(?:\/|$)/.test(normalized)
  )
    return false;
  return (
    !/(^|\/)\.env(?:\.|$)/.test(normalized) ||
    path.posix.basename(normalized) === ".env.example"
  );
};
export const isSafeResolvedGuidancePath = async (root, filename) => {
  const actualRoot = await realpath(root);
  const actual = await realpath(path.resolve(root, filename));
  const relative = path.relative(actualRoot, actual);
  return (
    relative !== ".." &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative) &&
    isSafeGuidancePath(relative.replaceAll(path.sep, "/"))
  );
};
export const validateStandaloneManifest = (pkg) => {
  const errors = [];
  if (Object.hasOwn(pkg, "workspaces"))
    errors.push(
      "The project must use one root package, without npm workspaces",
    );
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ])
    for (const [name, version] of Object.entries(pkg[field] ?? {}))
      if (
        name.startsWith("@kernel/") ||
        /^(?:workspace:|file:|link:)/.test(version)
      )
        errors.push(
          "Project dependencies must be independently installable: " + name,
        );
  for (const [name, command] of Object.entries(pkg.scripts ?? {}))
    if (/(?:^|\s)--(?:workspace|workspaces|prefix)(?:=|\s|$)/.test(command))
      errors.push("Project scripts must run from the root package: " + name);
  return errors;
};
export const validateStandaloneLockfile = (lock, pkg) => {
  const errors = [];
  const locked = lock.packages?.[""];
  if (!locked || lock.name !== pkg.name)
    errors.push("The lockfile must describe the root project");
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
  ]) {
    const entries = (value) =>
      Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b));
    if (
      JSON.stringify(entries(locked?.[field])) !==
      JSON.stringify(entries(pkg[field]))
    )
      errors.push("Lockfile root dependency drift: " + field);
  }
  for (const [location, metadata] of Object.entries(lock.packages ?? {}))
    if (/^(?:apps|packages)\//.test(location) || metadata.link === true)
      errors.push("Lockfile contains a local project link: " + location);
  return errors;
};
const isStrings = (value) =>
  Array.isArray(value) &&
  value.every((entry) => typeof entry === "string" && entry.trim());
const duplicates = (values) => new Set(values).size !== values.length;

// Deliberately reads only the repository's simple `run:` steps, not arbitrary
// shell scripts. This is a drift check, not a workflow interpreter or runner.
export const ciCommands = (content) => {
  const result = new Map();
  const jobPolicies = new Map();
  const policyValue = (value) =>
    value === "true" ? true : value === "false" ? false : "unsupported";
  let job;
  let step = [];
  const finishStep = () => {
    const command = step
      .join("\n")
      .match(/^\s+(?:- )?run: (npm run .+)$/m)?.[1];
    if (job && command) {
      const checks = result.get(job) ?? [];
      checks.push({
        command: command.trim(),
        advisory: policyValue(
          step
            .join("\n")
            .match(/^ {8}continue-on-error: (.+)$/m)?.[1]
            ?.trim() ?? "false",
        ),
      });
      result.set(job, checks);
    }
    step = [];
  };
  for (const line of content.split(/\r?\n/)) {
    const header = line.match(/^ {2}([\w-]+):\s*$/);
    if (header) {
      finishStep();
      job = header[1];
    }
    const jobPolicy = line.match(/^ {4}continue-on-error: (.+)$/);
    if (jobPolicy && job)
      jobPolicies.set(job, policyValue(jobPolicy[1].trim()));
    if (/^ {6}- /.test(line)) finishStep();
    if (job) step.push(line);
  }
  finishStep();
  for (const [id, steps] of result)
    for (const check of steps) {
      const policy = jobPolicies.get(id);
      check.advisory =
        policy === "unsupported" || check.advisory === "unsupported"
          ? "unsupported"
          : Boolean(policy || check.advisory);
    }
  return result;
};

export const validateManifest = (manifest, settings, ci) => {
  const errors = [];
  if (
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.checks) ||
    !manifest.profiles
  )
    return ["Invalid validation manifest schema"];
  const ids = manifest.checks.map((check) => check.id);
  if (!isStrings(ids) || !ids.length || duplicates(ids))
    errors.push("Validation check IDs must be unique nonempty strings");
  const checks = new Map(manifest.checks.map((check) => [check.id, check]));
  const wrappers =
    ci
      .get("check")
      ?.filter((step) => step.command === "npm run validate -- full") ?? [];
  const wrapped = wrappers.length === 1 && wrappers[0].advisory === false;
  for (const check of manifest.checks) {
    if (
      !/^npm run [\w:-]+(?: .+)?$/.test(check.command ?? "") ||
      !["required", "advisory", "manual"].includes(check.kind) ||
      !isStrings(check.ciJobs) ||
      !isStrings(check.scopes)
    ) {
      errors.push(`Invalid check definition: ${check.id}`);
      continue;
    }
    if (check.kind === "required" && !check.ciJobs.length)
      errors.push(`Required check has no CI job: ${check.id}`);
    for (const job of check.ciJobs) {
      const steps =
        ci.get(job)?.filter((step) => step.command === check.command) ?? [];
      if (job === "check" && check.kind === "required" && wrapped) {
        if (steps.length)
          errors.push(
            `CI ${job} duplicates ${check.command} through full gate`,
          );
        continue;
      }
      if (steps.length !== 1)
        errors.push(`CI ${job} must run ${check.command} exactly once`);
      else if (steps[0].advisory !== (check.kind === "advisory"))
        errors.push(`CI advisory policy differs for ${check.id}`);
    }
  }
  for (const [name, values] of Object.entries(manifest.profiles)) {
    if (!isStrings(values) || duplicates(values)) {
      errors.push(`Invalid profile: ${name}`);
      continue;
    }
    for (const id of values)
      if (!checks.has(id))
        errors.push(`Unknown check ${id} in profile ${name}`);
  }
  const full = manifest.profiles.full;
  const required = manifest.checks
    .filter((check) => check.kind === "required")
    .map((check) => check.id);
  if (
    !isStrings(full) ||
    JSON.stringify([...full].sort()) !== JSON.stringify(required.sort())
  )
    errors.push(
      "Full profile must contain every required check and no advisory/manual checks",
    );
  const projection = isStrings(full)
    ? full.map((id) => checks.get(id)?.command)
    : [];
  if (JSON.stringify(settings.recommendedChecks) !== JSON.stringify(projection))
    errors.push(
      "settings.recommendedChecks must project validation.profiles.full in order",
    );
  if (
    settings.recommendedChecksSource?.path !== ".agents/validation.json" ||
    settings.recommendedChecksSource?.profile !== "full"
  )
    errors.push("Settings must identify the canonical validation manifest");
  for (const [name, expected] of Object.entries({
    navigation: ".agents/navigation.json",
    validation: ".agents/validation.json",
    evaluation: ".agents/evaluation/cases.json",
  })) {
    if (settings[name] !== expected)
      errors.push(`Settings ${name} must point to ${expected}`);
  }
  for (const [job, steps] of ci)
    for (const step of steps) {
      if (
        step.command === "npm run validate -- full" &&
        job === "check" &&
        wrapped
      )
        continue;
      if (
        !manifest.checks.some(
          (check) =>
            check.command === step.command && check.ciJobs?.includes(job),
        )
      )
        errors.push(`Unregistered CI check: ${job}: ${step.command}`);
    }
  return errors;
};

export const validateAssistantGuidanceFiles = (filenames) =>
  filenames
    .filter((filename) => {
      const normalized = filename.replaceAll("\\", "/");
      return (
        /(?:^|\/)AGENTS\.fa\.md$/.test(normalized) ||
        (/^\.(?:agents|claude)\//.test(normalized) &&
          normalized.endsWith(".fa.md"))
      );
    })
    .map(
      (filename) =>
        `Assistant guidance must be English-only; remove Persian companion: ${filename}`,
    );

export const validateNavigation = (navigation, evaluation, checks, exists) => {
  const errors = [];
  const verifyPaths = (paths, label) => {
    if (!isStrings(paths)) {
      errors.push(`Invalid paths: ${label}`);
      return;
    }
    for (const filename of paths)
      if (!exists(filename))
        errors.push(`Missing or unsafe path in ${label}: ${filename}`);
  };
  const verifyChecks = (values, label) => {
    if (!isStrings(values)) {
      errors.push(`Invalid checks: ${label}`);
      return;
    }
    for (const id of values)
      if (!checks.has(id)) errors.push(`Unknown check in ${label}: ${id}`);
  };
  if (navigation.schemaVersion !== 1 || !Array.isArray(navigation.tasks))
    return ["Invalid navigation schema"];
  if (evaluation.schemaVersion !== 1 || !Array.isArray(evaluation.cases))
    return ["Invalid evaluation schema"];
  const ids = navigation.tasks.map((task) => task.id);
  if (!isStrings(ids) || !ids.length || duplicates(ids))
    errors.push("Navigation task IDs must be unique and nonempty");
  for (const task of navigation.tasks) {
    if (typeof task.when !== "string" || !task.when.trim())
      errors.push(`Missing task trigger: ${task.id}`);
    for (const field of ["owners", "contracts", "tests"])
      verifyPaths(task[field], `${task.id}.${field}`);
    if (task.rules !== undefined) verifyPaths(task.rules, `${task.id}.rules`);
    if (!task.owners?.length) errors.push(`Task has no owner: ${task.id}`);
    verifyChecks(task.checks, task.id);
  }
  const caseIds = evaluation.cases.map((item) => item.id);
  if (!isStrings(caseIds) || !caseIds.length || duplicates(caseIds))
    errors.push("Evaluation case IDs must be unique and nonempty");
  for (const item of evaluation.cases) {
    if (
      typeof item.prompt?.en !== "string" ||
      !item.prompt.en.trim() ||
      Object.keys(item.prompt).some((language) => language !== "en")
    )
      errors.push(`Case needs only an English prompt: ${item.id}`);
    if (
      !isStrings(item.taskIds) ||
      !item.taskIds.length ||
      item.taskIds.some((id) => !ids.includes(id))
    )
      errors.push(`Unknown or missing task reference: ${item.id}`);
    verifyPaths(item.evidence, item.id);
    if (!item.evidence?.length)
      errors.push(`Case needs source evidence: ${item.id}`);
    verifyChecks(item.checks, item.id);
    if (
      !isStrings(item.mustExplain) ||
      !item.mustExplain.length ||
      !isStrings(item.mustNot) ||
      !item.mustNot.length
    )
      errors.push(
        `Case needs observable positive/negative criteria: ${item.id}`,
      );
  }
  return errors;
};

const markdownFiles = async (root, directory) => {
  const files = [];
  let entries;
  try {
    const relative = path.relative(root, directory).replaceAll(path.sep, "/");
    if (
      !isSafeGuidancePath(relative) ||
      !(await isSafeResolvedGuidancePath(root, relative))
    )
      throw new Error(`Unsafe guidance directory: ${relative}`);
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory())
      files.push(...(await markdownFiles(root, filename)));
    else if (entry.name.endsWith(".md")) files.push(filename);
  }
  return files;
};

export const checkGuidance = async (root = repository) => {
  const readInput = async (filename) => {
    if (
      !isSafeGuidancePath(filename) ||
      !(await isSafeResolvedGuidancePath(root, filename))
    )
      throw new Error(`Unsafe guidance input: ${filename}`);
    return readFile(path.join(root, filename), "utf8");
  };
  const json = async (filename) => JSON.parse(await readInput(filename));
  const [manifest, settings, navigation, evaluation, pkg, lock, workflow] =
    await Promise.all([
      json(".agents/validation.json"),
      json(".agents/settings.json"),
      json(".agents/navigation.json"),
      json(".agents/evaluation/cases.json"),
      json("package.json"),
      json("package-lock.json"),
      readInput(".github/workflows/ci.yml"),
    ]);
  const errors = [
    ...validateManifest(manifest, settings, ciCommands(workflow)),
    ...validateStandaloneManifest(pkg),
    ...validateStandaloneLockfile(lock, pkg),
  ];
  try {
    validateCiWorkflow(parseWorkflow(workflow), manifest);
  } catch (error) {
    errors.push(`CI policy: ${error.message}`);
  }
  try {
    runProfile(manifest, "full", () => 0);
  } catch (error) {
    errors.push(`Validation profile: ${error.message}`);
  }
  for (const obsolete of ["apps", "packages"]) {
    try {
      await stat(path.join(root, obsolete));
      errors.push("Obsolete project container must be removed: " + obsolete);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  for (const field of ["rules", "skills", "optionalHooks"])
    if (!isStrings(settings[field]))
      errors.push("Settings " + field + " must be a path array");
  const referencedPaths = [
    ...(Array.isArray(settings.rules) ? settings.rules : []),
    ...(Array.isArray(settings.skills) ? settings.skills : []),
    ...(Array.isArray(settings.optionalHooks) ? settings.optionalHooks : []),
  ];
  for (const task of navigation.tasks)
    for (const field of ["owners", "contracts", "tests"])
      referencedPaths.push(...(Array.isArray(task[field]) ? task[field] : []));
  for (const task of navigation.tasks)
    if (task.rules) referencedPaths.push(...task.rules);
  for (const item of evaluation.cases) referencedPaths.push(...item.evidence);
  for (const entry of manifest.externalWorkflows ?? [])
    referencedPaths.push(entry.path);
  const found = new Set();
  const safePath = isSafeGuidancePath;
  const insideRoot = (filename) => isSafeResolvedGuidancePath(root, filename);
  for (const filename of new Set(referencedPaths)) {
    if (!safePath(filename)) continue;
    try {
      if (await insideRoot(filename)) {
        await stat(path.join(root, filename));
        found.add(filename);
      }
    } catch {
      /* Report with the owning reference below. */
    }
  }
  errors.push(
    ...validateNavigation(
      navigation,
      evaluation,
      new Set(manifest.checks.map((check) => check.id)),
      (filename) => found.has(filename),
    ),
  );
  for (const filename of referencedPaths)
    if (!found.has(filename))
      errors.push(`Guidance references missing/unsafe path: ${filename}`);
  for (const check of manifest.checks) {
    const script = check.command.match(/^npm run ([\w:-]+)/)?.[1];
    if (
      /(?:^|\s)--(?:workspace|workspaces|prefix)(?:=|\s|$)/.test(check.command)
    )
      errors.push(
        "Manifest commands must run from the root package: " + check.command,
      );
    if (!script || !pkg.scripts?.[script])
      errors.push(`Manifest command has no package script: ${check.command}`);
  }
  const markdown = [
    ...(await markdownFiles(root, path.join(root, ".agents"))),
    ...(await markdownFiles(root, path.join(root, ".claude"))),
    ...(await markdownFiles(root, path.join(root, "docs"))),
    ...(await readdir(root))
      .filter((name) => name.endsWith(".md"))
      .map((name) => path.join(root, name)),
  ];
  markdown.push(path.join(root, "AGENTS.md"));
  for (const name of [
    "source-navigation",
    "validation",
    "comprehension-evaluation",
  ])
    for (const suffix of [".md", ".fa.md"]) {
      markdown.push(path.join(root, `docs/${name}${suffix}`));
    }
  markdown.push(
    ...(await markdownFiles(root, path.join(root, "src"))).filter((filename) =>
      /(?:^|[\\/])AGENTS(?:\.fa)?\.md$/.test(filename),
    ),
  );
  errors.push(
    ...validateAssistantGuidanceFiles(
      markdown.map((filename) => path.relative(root, filename)),
    ),
  );
  for (const filename of new Set(markdown)) {
    let content;
    try {
      if (!(await insideRoot(filename))) {
        errors.push(
          `Unsafe maintained guide: ${path.relative(root, filename)}`,
        );
        continue;
      }
      content = await readFile(filename, "utf8");
    } catch {
      errors.push(`Missing maintained guide: ${path.relative(root, filename)}`);
      continue;
    }
    content = content.replace(/```[\s\S]*?```/g, "");
    for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
      const link = match[1];
      if (/^(?:https?:|mailto:|codex:|#)/.test(link)) continue;
      const target = decodeURI(link.split("#")[0].replace(/^<|>$/g, ""));
      const relative = path.relative(
        root,
        path.resolve(path.dirname(filename), target),
      );
      if (!safePath(relative.replaceAll(path.sep, "/"))) {
        errors.push(`Unsafe guide link: ${filename}: ${link}`);
        continue;
      }
      try {
        if (!(await insideRoot(relative)))
          errors.push(`Guide link escapes repository: ${filename}: ${link}`);
        else await stat(path.resolve(path.dirname(filename), target));
      } catch {
        errors.push(
          `Missing guide link: ${path.relative(root, filename)}: ${link}`,
        );
      }
    }
  }
  return {
    errors,
    checks: manifest.checks.length,
    tasks: navigation.tasks.length,
    cases: evaluation.cases.length,
    markdownFiles: markdown.length,
  };
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await checkGuidance();
  if (result.errors.length) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      `Guidance checked: ${result.checks} checks, ${result.tasks} tasks, ${result.cases} evaluation cases, ${result.markdownFiles} Markdown files. Model/client behavior is not evaluated by this check.`,
    );
}
