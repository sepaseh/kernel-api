import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const hostnamePattern =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const parseConfiguredHostname = (name, rawValue) => {
  if (!rawValue || rawValue !== rawValue.trim()) {
    throw new Error(`${name} must be a hostname without whitespace`);
  }
  const normalized = rawValue.toLowerCase();
  if (!hostnamePattern.test(normalized)) {
    throw new Error(`${name} must contain a hostname only`);
  }
  const parsed = new URL(`http://${rawValue}`);
  if (parsed.hostname !== normalized) {
    throw new Error(`${name} must be a canonical hostname only`);
  }
  return parsed.hostname;
};

export const parseTarget = (name, rawValue) => {
  if (!rawValue) throw new Error(`${name} is required`);
  const url = new URL(rawValue);
  if (url.username || url.password) {
    throw new Error(`${name} must not contain credentials`);
  }
  return url;
};

export const validateDastTarget = (env) => {
  const target = parseTarget("DAST_TARGET", env.DAST_TARGET);
  if (target.protocol !== "https:" || target.href !== `${target.origin}/`) {
    throw new Error("DAST_TARGET must be an exact HTTPS origin");
  }
  const allowedHost = parseConfiguredHostname(
    "DAST_ALLOWED_HOST",
    env.DAST_ALLOWED_HOST,
  );
  const productionHost = parseConfiguredHostname(
    "DAST_PRODUCTION_HOST",
    env.DAST_PRODUCTION_HOST,
  );
  if (target.hostname.toLowerCase() !== allowedHost) {
    throw new Error("DAST_TARGET host is not explicitly allowed");
  }
  if (target.hostname.toLowerCase() === productionHost) {
    throw new Error("DAST must not target the production host");
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== "dast" || process.argv.length !== 3)
    throw new Error("Expected validation mode: dast");
  validateDastTarget(process.env);
}
