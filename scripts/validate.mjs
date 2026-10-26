import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repository = fileURLToPath(new URL("../", import.meta.url));
export const commandArguments = (command) => {
  if (typeof command !== "string" || /[;&|<>\x60$\r\n]/.test(command))
    throw new Error("Validation commands must not contain shell operators");
  const args = command
    .match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
    ?.map((token) =>
      token.replace(
        /^(?:"(.*)"|'(.*)')$/,
        (_, double, single) => double ?? single,
      ),
    );
  if (
    args?.[0] !== "npm" ||
    args[1] !== "run" ||
    !/^[\w:-]+$/.test(args[2] ?? "")
  )
    throw new Error("Validation commands must use a declared npm script");
  const separator = args.indexOf("--");
  if (
    args
      .slice(3, separator === -1 ? undefined : separator)
      .some((argument) =>
        /^--(?:workspace|workspaces|prefix)(?:=|$)/.test(argument),
      )
  )
    throw new Error("Validation commands must run from the root package");
  return args.slice(1);
};
export const runProfile = (manifest, profile, run) => {
  const ids = manifest.profiles?.[profile];
  if (!Array.isArray(ids) || !ids.length)
    throw new Error("Unknown or empty validation profile: " + profile);
  const checks = new Map(manifest.checks.map((check) => [check.id, check]));
  for (const id of ids) {
    const check = checks.get(id);
    if (!check) throw new Error("Unknown validation check: " + id);
    const result = run(commandArguments(check.command), check);
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
