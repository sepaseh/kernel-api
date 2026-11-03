import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateAuditResult } from "./check-governance.mjs";

export const auditArguments = ["audit", "--audit-level=high", "--json"];

export const runAudit = ({
  root = process.cwd(),
  environment = process.env,
  execute = spawnSync,
} = {}) => {
  if (!environment.npm_execpath)
    throw new Error("Run the online audit through npm.");
  const result = execute(
    process.execPath,
    [environment.npm_execpath, ...auditArguments],
    {
      cwd: root,
      env: environment,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return validateAuditResult(result);
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(`Online npm audit passed: ${JSON.stringify(runAudit())}`);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Online npm audit failed.",
    );
    process.exitCode = 1;
  }
}
