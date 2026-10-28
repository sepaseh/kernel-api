import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const releasePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
const scriptRoot = fileURLToPath(new URL("../", import.meta.url));
const defaultReleaseRoot = existsSync(
  path.join(scriptRoot, "..", "release.json"),
)
  ? path.resolve(scriptRoot, "..")
  : scriptRoot;

function resolvedLocation(location) {
  let ancestor = path.resolve(location);
  const suffix = [];
  while (!existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor)
      throw new Error("Cannot resolve persistent state path.");
    suffix.unshift(path.basename(ancestor));
    ancestor = parent;
  }
  return path.join(realpathSync(ancestor), ...suffix);
}

function validateStatePath(location, releaseRoot, name) {
  if (!path.isAbsolute(location) || location === ":memory:")
    throw new Error(
      `${name} must be a persistent absolute path outside the release.`,
    );
  const relative = path.relative(
    resolvedLocation(releaseRoot),
    resolvedLocation(location),
  );
  if (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  )
    throw new Error(`${name} must be outside the immutable release.`);
}
const requireValue = (environment, name) => {
  const value = environment[name];
  if (!value?.trim()) throw new Error(`${name} is required.`);
  return value;
};

const localDatabasePath = (database) => {
  const invalid = () =>
    new Error(
      "DATABASE_URL must be a local file URL with an absolute persistent path and no host, query or fragment.",
    );
  if (!database.startsWith("file:") || /[?#]/.test(database)) throw invalid();
  const rawPath = database.slice("file:".length);
  if (rawPath.startsWith("//")) {
    const authority = rawPath.match(/^\/\/([^/\\]*)/)?.[1];
    if (authority !== "") throw invalid();
  } else if (!path.isAbsolute(rawPath)) throw invalid();
  try {
    const url = new URL(database);
    if (url.protocol !== "file:" || url.host || url.username || url.password)
      throw invalid();
    const location = fileURLToPath(url);
    if (
      location.startsWith("\\\\") ||
      location.startsWith("//") ||
      [...location].some((character) => character.codePointAt(0) < 32)
    )
      throw invalid();
    return location;
  } catch {
    throw invalid();
  }
};

export const validateOrigin = (value, publicOrigin = true) => {
  if (/[\\\s;"'{}<>`]/.test(value))
    throw new Error("Origin contains invalid characters.");
  const url = new URL(value);
  const canonical = value
    .replace(/^(https:\/\/[^/]+):443$/, "$1")
    .replace(/^(http:\/\/[^/]+):80$/, "$1");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    canonical !== url.origin ||
    (publicOrigin && url.protocol !== "https:" && !loopback.has(url.hostname))
  ) {
    throw new Error(
      "An exact HTTPS origin is required (HTTP only on loopback).",
    );
  }
  return url;
};

function validateMinio(environment) {
  for (const name of [
    "MINIO_ACCESS_KEY",
    "MINIO_SECRET_KEY",
    "MINIO_ENDPOINT",
    "MINIO_PUBLIC_URL",
  ]) {
    const value = requireValue(environment, name);
    if (/(?:replace[-_ ]|minioadmin)/i.test(value)) {
      throw new Error(`${name} still contains a placeholder.`);
    }
  }
  validateOrigin(environment.MINIO_PUBLIC_URL);
  if (
    environment.MINIO_USE_SSL !== "true" &&
    !loopback.has(environment.MINIO_ENDPOINT)
  ) {
    throw new Error("External MinIO requires TLS.");
  }
}

export function validateDeploymentEnv(
  mode,
  environment = process.env,
  { releaseRoot = defaultReleaseRoot } = {},
) {
  if (environment.NODE_ENV !== "production") {
    throw new Error("NODE_ENV must be production for deployment.");
  }
  if (mode !== "api") throw new Error("Deployment mode must be api.");

  const secret = requireValue(environment, "BETTER_AUTH_SECRET");
  if (
    secret.length < 32 ||
    /(?:replace[-_ ]|change[-_ ]|example|kernel-local-development|minioadmin|password123)/i.test(
      secret,
    )
  )
    throw new Error(
      "BETTER_AUTH_SECRET must be a generated production secret of at least 32 characters.",
    );
  validateOrigin(requireValue(environment, "BETTER_AUTH_URL"));
  const origins =
    environment.SERVER_ALLOWED_ORIGINS ?? environment.SERVER_ALLOWED_ORIGIN;
  if (!origins?.trim()) throw new Error("SERVER_ALLOWED_ORIGINS is required.");
  for (const origin of origins.split(",")) validateOrigin(origin.trim());
  const release = requireValue(environment, "SERVER_RELEASE_ID");
  if (!releasePattern.test(release) || release.includes("..")) {
    throw new Error(
      "SERVER_RELEASE_ID is not a valid immutable release identifier.",
    );
  }
  if (
    environment.OTP_FIXED_CODE ||
    environment.SERVER_SEED_DEVELOPMENT_DATA === "true"
  ) {
    throw new Error(
      "Fixed OTPs and development seeding are forbidden in deployment.",
    );
  }
  const database = requireValue(environment, "DATABASE_URL");
  validateStatePath(localDatabasePath(database), releaseRoot, "DATABASE_URL");
  const driver = requireValue(environment, "STORAGE_DRIVER");
  if (driver === "local") {
    validateStatePath(
      requireValue(environment, "LOCAL_STORAGE_PATH"),
      releaseRoot,
      "LOCAL_STORAGE_PATH",
    );
  } else if (driver === "minio") {
    validateMinio(environment);
  } else throw new Error("STORAGE_DRIVER must be local or minio.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error("Supply api.");
    validateDeploymentEnv(process.argv[2]);
    console.info("Deployment configuration is valid.");
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Deployment configuration is invalid.",
    );
    process.exitCode = 1;
  }
}
