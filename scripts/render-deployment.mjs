import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";

const hostPattern = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const releasePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const placeholderReleaseIds = new Set([
  "replace-release-id",
  "replace-with-immutable-release-id",
]);
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
      if (
        !releasePattern.test(value) ||
        value.includes("..") ||
        placeholderReleaseIds.has(value)
      )
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
      },
    });
    let template;
    if (values.template === "bootstrap") {
      template = new URL(
        "../deploy/native/nginx/bootstrap.conf.template",
        import.meta.url,
      );
    } else if (values.template === "kernel") {
      template = new URL(
        "../deploy/native/nginx/kernel.conf.template",
        import.meta.url,
      );
    } else {
      throw new Error("Select the bootstrap or kernel template.");
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 65536) throw new Error("Public configuration is too large.");
      chunks.push(chunk);
    }
    const rendered = renderDeploymentTemplate(
      await readFile(template, "utf8"),
      parseEnv(Buffer.concat(chunks).toString("utf8")),
    );
    process.stdout.write(rendered);
  } catch {
    console.error(
      "Rendering failed; check the template and public configuration.",
    );
    process.exitCode = 1;
  }
}
