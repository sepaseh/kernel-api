import assert from "node:assert/strict";
import test from "node:test";

import { checkDeployedApi } from "./check-deployed-api.mjs";
test("deployment checks reject unauthorized targets, staging production and missing protected release before network", async () => {
  const base = {
    API_DEPLOYMENT_URL: "https://api.staging.test",
    API_ALLOWED_HOST: "api.staging.test",
    PRODUCTION_HOST: "api.production.test",
    EXPECTED_DEPLOYMENT_ID: "release-1",
  };
  for (const changed of [
    { API_DEPLOYMENT_URL: "https://evil.test" },
    { API_DEPLOYMENT_URL: "http://api.staging.test" },
    { API_DEPLOYMENT_URL: "https://api.staging.test/path" },
    { API_DEPLOYMENT_URL: "https://u:p@api.staging.test" },
    { PRODUCTION_HOST: "api.staging.test" },
    { EXPECTED_DEPLOYMENT_ID: "" },
  ])
    await assert.rejects(checkDeployedApi("staging", { ...base, ...changed }));
  await assert.rejects(checkDeployedApi("unknown", base));
});

test("authorized smoke checks validate both semantic health and immutable release", async () => {
  const saved = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      return String(url).endsWith("/health")
        ? Response.json({ status: "ok" })
        : Response.json({ release: "release-1" });
    };
    await checkDeployedApi("smoke", {
      API_DEPLOYMENT_URL: "https://api.smoke.test",
      API_ALLOWED_HOST: "api.smoke.test",
      EXPECTED_DEPLOYMENT_ID: "release-1",
    });
    assert.deepEqual(requests, [
      "https://api.smoke.test/health",
      "https://api.smoke.test/_kernel/release",
    ]);
    await assert.rejects(
      checkDeployedApi("smoke", {
        API_DEPLOYMENT_URL: "https://api.smoke.test",
        API_ALLOWED_HOST: "api.smoke.test",
        EXPECTED_DEPLOYMENT_ID: "wrong",
      }),
      /release marker/,
    );
  } finally {
    globalThis.fetch = saved;
  }
});
