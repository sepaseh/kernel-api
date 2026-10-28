import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";

import { checkDeployedApi } from "./check-deployed-api.mjs";
import { renderDeploymentTemplate } from "./render-deployment.mjs";
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

test("synthetic loopback responses match the release marker rendered in both gateway templates", async () => {
  const values = {
    API_HOST: "api.smoke.test",
    RELEASE_ID: "synthetic-release-1",
    TLS_CERTIFICATE: "/synthetic/fullchain.pem",
    TLS_CERTIFICATE_KEY: "/synthetic/private-key.pem",
  };
  const templates = [
    "../deploy/docker/nginx.conf.template",
    "../deploy/native/nginx/kernel.conf.template",
  ];
  for (const template of templates) {
    const rendered = renderDeploymentTemplate(
      await readFile(new URL(template, import.meta.url), "utf8"),
      values,
    );
    const body = rendered.match(
      /location\s*=\s*\/_kernel\/release\s*\{[^}]*return\s+200\s+'([^']+)'/,
    )?.[1];
    assert.ok(body, `${template} must expose the release marker`);
    assert.deepEqual(JSON.parse(body), {
      release: values.RELEASE_ID,
      application: "kernel-api",
    });
    const server = createServer((request, response) => {
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/health") response.end('{"status":"ok"}');
      else if (request.url === "/_kernel/release") response.end(body);
      else {
        response.statusCode = 404;
        response.end("{}");
      }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const saved = globalThis.fetch;
    try {
      const port = server.address().port;
      globalThis.fetch = (input, options) => {
        const target = new URL(input);
        assert.equal(target.origin, "https://api.smoke.test");
        return saved(`http://127.0.0.1:${port}${target.pathname}`, options);
      };
      const env = {
        API_DEPLOYMENT_URL: "https://api.smoke.test",
        API_ALLOWED_HOST: "api.smoke.test",
        EXPECTED_DEPLOYMENT_ID: values.RELEASE_ID,
      };
      await checkDeployedApi("smoke", env);
      await assert.rejects(
        checkDeployedApi("smoke", { ...env, EXPECTED_DEPLOYMENT_ID: "wrong" }),
        /release marker/,
      );
    } finally {
      globalThis.fetch = saved;
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }
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
