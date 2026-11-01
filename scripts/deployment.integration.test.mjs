import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../src/infrastructure/config.ts";
import { publicValues, validApi } from "./deployment.test-support.mjs";
import { renderDeploymentTemplate } from "./render-deployment.mjs";

test("Docker gateway rejects both checked-in release placeholders", (context) => {
  const shells =
    process.platform === "win32"
      ? [
          "C:/Program Files/Git/bin/bash.exe",
          "C:/Program Files/Git/usr/bin/bash.exe",
        ]
      : ["/bin/sh", "/usr/bin/sh"];
  const shell = shells.find(
    (candidate) =>
      spawnSync(candidate, ["-c", "exit 0"], { stdio: "ignore" }).status === 0,
  );
  if (!shell) return context.skip("No usable shell found.");
  const script = fileURLToPath(
    new URL("../deploy/docker/15-validate-configuration.sh", import.meta.url),
  );
  for (const release of [
    "replace-release-id",
    "replace-with-immutable-release-id",
  ]) {
    const result = spawnSync(shell, [script], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        API_HOST: "api.kernel.test",
        HTTPS_PORT: "443",
        RELEASE_ID: release,
      },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /RELEASE_ID must be replaced/);
  }
});

test("native nginx templates render with the documented public field contract", async () => {
  for (const name of ["kernel.conf.template", "bootstrap.conf.template"]) {
    const file = new URL(`../deploy/native/nginx/${name}`, import.meta.url);
    const rendered = renderDeploymentTemplate(
      await readFile(file, "utf8"),
      publicValues,
    );
    assert.ok(rendered.includes("kernel.test"));
    assert.equal(/\$\{[A-Z][A-Z0-9_]*\}/.test(rendered), false);
  }
});

test("native service fixes the listener to the nginx upstream even with conflicting environment values", async () => {
  const unit = await readFile(
    new URL("../deploy/native/systemd/kernel-api.service", import.meta.url),
    "utf8",
  );
  const nginx = await readFile(
    new URL("../deploy/native/nginx/kernel.conf.template", import.meta.url),
    "utf8",
  );
  assert.match(unit, /^EnvironmentFile=\/etc\/kernel-api\/api\.env$/m);
  const command = unit.match(/^ExecStart=\/usr\/bin\/env (.+)$/m)?.[1];
  assert.ok(command);
  const tokens = command.split(/\s+/);
  const assignments = tokens.slice(0, 2);
  assert.deepEqual(tokens.slice(2), [
    "/usr/bin/node",
    "/srv/kernel-api/current/api/src/index.ts",
  ]);
  const overridden = Object.fromEntries(
    assignments.map((assignment) => assignment.split("=")),
  );
  const config = loadConfig({
    ...validApi,
    HOST: "0.0.0.0",
    PORT: "9999",
    ...overridden,
  });
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3000);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3000;/);
});

test("Docker and native API gateways reject unknown HTTP hosts and TLS names", async () => {
  for (const file of [
    "deploy/docker/nginx.conf.template",
    "deploy/native/nginx/kernel.conf.template",
  ]) {
    const source = await readFile(
      new URL(`../${file}`, import.meta.url),
      "utf8",
    );
    assert.match(source, /listen 80 default_server;/);
    assert.match(source, /return 444;/);
    assert.match(source, /listen 443 ssl default_server;/);
    assert.match(source, /ssl_reject_handshake on;/);
  }
});

test("Docker gateway re-resolves the API service without rewriting proxied URLs", async () => {
  const template = await readFile(
    new URL("../deploy/docker/nginx.conf.template", import.meta.url),
    "utf8",
  );
  const upstream = template.match(/upstream\s+kernel_api\s*\{([^}]*)\}/)?.[1];
  assert.ok(upstream, "Docker gateway must define a shared API upstream");
  assert.match(upstream, /\bzone\s+kernel_api\s+64k\s*;/);
  assert.match(
    upstream,
    /\bresolver\s+127\.0\.0\.11\s+valid=10s\s+ipv6=off\s*;/,
  );
  assert.match(upstream, /\bserver\s+api:3000\s+resolve\s*;/);
  for (const location of ["/", "^~ /auth/"]) {
    const escaped = location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const body = [
      ...template.matchAll(
        new RegExp(`location\\s+${escaped}\\s*\\{([^}]*)\\}`, "g"),
      ),
    ]
      .map((match) => match[1])
      .find((block) => /\bproxy_pass\b/.test(block));
    assert.ok(body, `Missing proxy location ${location}`);
    assert.match(body, /\bproxy_pass\s+http:\/\/kernel_api\s*;/);
  }
});

test("standalone deployment wiring retains preflight, durable state, least privilege and independent context", async () => {
  const load = (file) =>
    readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const docker = await load("deploy/docker/Dockerfile");
  assert.ok(!/(?:apps|packages)\//.test(docker));
  assert.match(docker, /COPY --chown=node:node src \.\/src/);
  assert.match(docker, /CMD \["node", "src\/index\.ts"\]/);
  assert.match(docker, /RUN npm ci --omit=dev\s/);
  assert.match(docker, /USER node/);
  const compose = await load("deploy/docker/compose.yaml");
  assert.match(compose, /api-data:\/var\/lib\/kernel-api/);
  assert.match(compose, /API_PUBLIC_ORIGIN/);
  const unit = await load("deploy/native/systemd/kernel-api.service");
  assert.match(unit, /ExecStartPre=.*validate-deployment-env/);
  assert.match(unit, /ProtectSystem=strict/);
  assert.match(unit, /ReadWritePaths=\/var\/lib\/kernel-api/);
  assert.match(
    await load("deploy/docker/api-entrypoint.sh"),
    /validate-deployment-env.mjs api/,
  );
});
