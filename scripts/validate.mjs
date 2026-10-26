import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repository = fileURLToPath(new URL("../", import.meta.url));
export const commandArguments = (command) => {
  if (typeof command !== "string" || /[;&|<>\x60$\r\n]/.test(command))
    throw new Error("Validation commands must not contain shell operators");
  const tokens = [...command.matchAll(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)];
  let end = 0;
  for (const token of tokens) {
    if (command.slice(end, token.index).trim())
      throw new Error(
        "Validation commands must contain balanced literal quotes",
      );
    end = token.index + token[0].length;
  }
  if (command.slice(end).trim())
    throw new Error("Validation commands must contain balanced literal quotes");
  const args = tokens.map(([token]) =>
    token.replace(
      /"([^"]*)"|'([^']*)'/g,
      (_, double, single) => double ?? single,
    ),
  );
  if (
    args[0] !== "npm" ||
    args[1] !== "run" ||
    !/^[\w:][\w:-]*$/.test(args[2] ?? "")
  )
    throw new Error("Validation commands must use a declared npm script");
  const separator = args.indexOf("--");
  const npmOptions =
    separator === -1 ? args.slice(3) : args.slice(3, separator);
  if (npmOptions.length > 0)
    throw new Error("Validation commands must pass script arguments after --");
  return args.slice(1);
};
const declaredChecks = (definitions) => {
  if (!Array.isArray(definitions) || !definitions.length)
    throw new Error("Validation checks must be a nonempty array");
  const checks = new Map();
  for (const check of definitions) {
    if (typeof check?.id !== "string" || !/^[\w][\w:-]*$/.test(check.id))
      throw new Error("Validation checks must have explicit valid IDs");
    if (checks.has(check.id))
      throw new Error("Duplicate validation check ID: " + check.id);
    if (!["required", "advisory", "manual"].includes(check.kind))
      throw new Error("Validation checks must have an explicit supported kind");
    checks.set(check.id, { args: commandArguments(check.command), check });
  }
  return checks;
};
const declaredProfiles = (definitions, checks) => {
  if (
    !definitions ||
    typeof definitions !== "object" ||
    Array.isArray(definitions)
  )
    throw new Error("Validation profiles must be an object");
  const profiles = new Map();
  for (const [name, ids] of Object.entries(definitions)) {
    if (!Array.isArray(ids) || !ids.length)
      throw new Error("Unknown or empty validation profile: " + name);
    if (new Set(ids).size !== ids.length)
      throw new Error("Duplicate check ID in validation profile: " + name);
    if (ids.some((id) => !checks.has(id)))
      throw new Error("Unknown validation check in profile: " + name);
    profiles.set(name, ids);
  }
  return profiles;
};
const requireCompleteFullProfile = (profiles, checks) => {
  const full = profiles.get("full");
  const required = [...checks.keys()].filter(
    (id) => checks.get(id).check.kind === "required",
  );
  if (
    !full ||
    full.length !== required.length ||
    full.some((id) => checks.get(id).check.kind !== "required")
  )
    throw new Error(
      "The full profile must include every required check exactly once and no optional checks",
    );
};
export const runProfile = (manifest, profile, run) => {
  const checks = declaredChecks(manifest.checks);
  const profiles = declaredProfiles(manifest.profiles, checks);
  requireCompleteFullProfile(profiles, checks);
  const ids = profiles.get(profile);
  if (!ids) throw new Error("Unknown validation profile: " + profile);
  for (const id of ids) {
    const { args, check } = checks.get(id);
    const result = run(args, check);
    if (result !== 0) return result ?? 1;
  }
  return 0;
};
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const manifest = JSON.parse(
    await readFile(path.join(repository, ".agents/validation.json"), "utf8"),
  );
  const npm =
    process.env.npm_execpath ??
    path.join(
      path.dirname(process.execPath),
      "node_modules/npm/bin/npm-cli.js",
    );
  if (!existsSync(npm))
    throw new Error(
      "Run this tool through npm run validate so npm's CLI is available",
    );
  process.exitCode = runProfile(
    manifest,
    process.argv[2] ?? "full",
    (args, check) => {
      console.log("Running " + check.id + ": " + check.command);
      const result = spawnSync(process.execPath, [npm, ...args], {
        cwd: repository,
        stdio: "inherit",
        windowsHide: true,
      });
      if (result.error) throw result.error;
      return result.status ?? 1;
    },
  );
}
