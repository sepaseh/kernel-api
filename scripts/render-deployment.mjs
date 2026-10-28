import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";

const hostPattern = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const releasePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const publicNames = new Set([
  "API_HOST",
  "TLS_CERTIFICATE",
  "TLS_CERTIFICATE_KEY",
  "RELEASE_ID",
  "HTTPS_PORT",
]);

export function renderDeploymentTemplate(template, environment) {
  const values = { HTTPS_PORT: "443", ...environment };
  return template.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_, name) => {
    if (!publicNames.has(name))
      throw new Error(`Unknown public template field: ${name}.`);
    const value = values[name];
    if (typeof value !== "string" || !value)
      throw new Error(`${name} is required.`);
    if (name.endsWith("_HOST")) {
      if (
        !hostPattern.test(value) ||
        value
          .split(".")
          .some(
            (label) =>
              !label ||
              label.length > 63 ||
              label.startsWith("-") ||
              label.endsWith("-"),
          )
      ) {
        throw new Error(`${name} must be a bare DNS hostname.`);
      }
    } else if (name === "RELEASE_ID") {
      if (!releasePattern.test(value) || value.includes(".."))
        throw new Error("Invalid RELEASE_ID.");
    } else if (name === "HTTPS_PORT") {
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)
        throw new Error("Invalid HTTPS_PORT.");
    } else if (
      !/^\/[A-Za-z0-9_./-]+$/.test(value) ||
      value.split("/").includes("..")
    ) {
      throw new Error(
        `${name} must be an absolute POSIX certificate path without spaces.`,
      );
    }
    return value;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        template: { type: "string" },
        "env-file": { type: "string" },
        output: { type: "string" },
        force: { type: "boolean", default: false },
      },
    });
    if (!values.template || !values["env-file"] || !values.output) {
      throw new Error(
        "Use --template PATH --env-file PATH --output PATH [--force].",
      );
    }
    const rendered = renderDeploymentTemplate(
      await readFile(values.template, "utf8"),
      parseEnv(await readFile(values["env-file"], "utf8")),
    );
    await mkdir(path.dirname(path.resolve(values.output)), { recursive: true });
    await writeFile(values.output, rendered, {
      flag: values.force ? "w" : "wx",
    });
    console.info("Deployment configuration rendered.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Rendering failed.");
    process.exitCode = 1;
  }
}
