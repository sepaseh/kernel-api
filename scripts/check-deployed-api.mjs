import { fileURLToPath } from "node:url";

import { checkHealth } from "./healthcheck.mjs";
import {
  parseConfiguredHostname,
  validateDastTarget,
} from "./validate-workflow-targets.mjs";
export async function checkDeployedApi(mode, environment = process.env) {
  if (!["staging", "smoke"].includes(mode))
    throw new Error("Use staging or smoke.");
  const target = new URL(environment.API_DEPLOYMENT_URL);
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  )
    throw new Error("An exact HTTPS API origin is required.");
  const allowed = parseConfiguredHostname(
    "API_ALLOWED_HOST",
    environment.API_ALLOWED_HOST,
  );
  if (target.hostname.toLowerCase() !== allowed)
    throw new Error("API deployment target is not explicitly allowed.");
  if (mode === "staging")
    validateDastTarget({
      DAST_TARGET: target.href,
      DAST_ALLOWED_HOST: allowed,
      DAST_PRODUCTION_HOST: environment.PRODUCTION_HOST,
    });
  const release = environment.EXPECTED_DEPLOYMENT_ID;
  if (
    !release ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(release) ||
    release.includes("..")
  )
    throw new Error("A protected expected deployment ID is required.");
  await checkHealth("api", `${target.origin}/health`);
  const response = await fetch(`${target.origin}/_kernel/release`, {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (response.status !== 200 || (await response.json()).release !== release)
    throw new Error("The API deployment release marker does not match.");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await checkDeployedApi(process.argv[2]);
    console.log("API deployment health and immutable release match.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
