import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadConfig } from "../src/infrastructure/config.ts";
import { checkHealth } from "./healthcheck.mjs";
import { renderDeploymentTemplate } from "./render-deployment.mjs";
import {
  validateDeploymentEnv,
  validateOrigin,
} from "./validate-deployment-env.mjs";

const validApi = {
  NODE_ENV: "production",
  BETTER_AUTH_SECRET:
    "c08e1dfec01fac571c19c51a06e2f7a1055dd6eed10b91a85b7c7ee139e65835",
  BETTER_AUTH_URL: "https://api.kernel.test",
  SERVER_ALLOWED_ORIGINS: "https://kernel.test,https://admin.kernel.test",
  SERVER_RELEASE_ID: "qa-0123456789",
  DATABASE_URL: `file:${path.join(tmpdir(), "kernel-deployment-fixture.sqlite")}`,
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_PATH: path.join(tmpdir(), "kernel-deployment-fixture-uploads"),
  SERVER_SEED_DEVELOPMENT_DATA: "false",
};

test("deployment configuration accepts durable local storage and explicit standard TLS ports", () => {
  assert.doesNotThrow(() => validateDeploymentEnv("api", validApi));
  assert.doesNotThrow(() =>
    validateDeploymentEnv("api", {
      ...validApi,
      BETTER_AUTH_URL: "https://api.kernel.test:443",
      SERVER_ALLOWED_ORIGINS:
        "https://kernel.test:443,https://admin.kernel.test:443",
    }),
  );
  assert.throws(
    () => validateDeploymentEnv("website", validApi),
    /mode must be api/,
  );
});

test("deployment database requires an absolute local file URL without authority or URL parameters", () => {
  const databasePath = path.join(tmpdir(), "synthetic-deployment-db.sqlite");
  const fileUrl = pathToFileURL(databasePath).href;
  for (const DATABASE_URL of [`file:${databasePath}`, fileUrl])
    assert.doesNotThrow(() =>
      validateDeploymentEnv("api", { ...validApi, DATABASE_URL }),
    );
  for (const DATABASE_URL of [
    "libsql://database.example.test",
    "https://database.example.test",
    "not-a-database-url",
    "file::memory:",
    "file:relative.sqlite",
    "file://remote.example.test/db.sqlite",
    "file://localhost/db.sqlite",
    "file://user:password@remote.example.test/db.sqlite",
    "file:////remote.example.test/share/db.sqlite",
    `${fileUrl}?mode=memory`,
    `${fileUrl}?`,
    `${fileUrl}#fragment`,
    `${fileUrl}#`,
  ])
    assert.throws(
      () => validateDeploymentEnv("api", { ...validApi, DATABASE_URL }),
      /DATABASE_URL/,
      DATABASE_URL,
    );
});

test("deployment rejects placeholder credentials, development switches and ephemeral state", () => {
  for (const changed of [
    { NODE_ENV: "development" },
    { BETTER_AUTH_SECRET: "short" },
    { BETTER_AUTH_SECRET: "replace-with-a-generated-production-secret" },
    { BETTER_AUTH_URL: "http://api.kernel.test" },
    { SERVER_ALLOWED_ORIGINS: "https://kernel.test/path" },
    { SERVER_ALLOWED_ORIGINS: "" },
    { SERVER_RELEASE_ID: "../other" },
    { SERVER_RELEASE_ID: "replace-release-id" },
    { SERVER_RELEASE_ID: "replace-with-immutable-release-id" },
    { DATABASE_URL: "file::memory:" },
    { DATABASE_URL: "file:release/data.sqlite" },
    { LOCAL_STORAGE_PATH: "release/uploads" },
    { OTP_FIXED_CODE: "123456" },
    { SERVER_SEED_DEVELOPMENT_DATA: "true" },
    { STORAGE_DRIVER: "unknown" },
  ]) {
    assert.throws(() =>
      validateDeploymentEnv("api", { ...validApi, ...changed }),
    );
  }
});

test("durable state stays outside the release, including a symlinked state location", async (context) => {
  const temporary = await mkdtemp(
    path.join(tmpdir(), "kernel-state-preflight-"),
  );
  context.after(async () => {
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()));
    assert.ok(path.basename(temporary).startsWith("kernel-state-preflight-"));
    await rm(temporary, { recursive: true, force: true });
  });
  const releaseRoot = path.join(temporary, "immutable");
  await mkdir(releaseRoot);
  for (const changed of [
    { DATABASE_URL: `file:${path.join(releaseRoot, "db", "kernel.sqlite")}` },
    { LOCAL_STORAGE_PATH: path.join(releaseRoot, "uploads") },
    { LOCAL_STORAGE_PATH: releaseRoot },
  ])
    assert.throws(
      () =>
        validateDeploymentEnv(
          "api",
          { ...validApi, ...changed },
          { releaseRoot },
        ),
      /outside/,
    );
  const alias = path.join(temporary, "state-alias");
  try {
    await symlink(
      releaseRoot,
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (error.code === "EPERM")
      return context.skip("Directory-link creation unavailable.");
    throw error;
  }
  assert.throws(
    () =>
      validateDeploymentEnv(
        "api",
        { ...validApi, LOCAL_STORAGE_PATH: path.join(alias, "uploads") },
        { releaseRoot },
      ),
    /outside/,
  );
  assert.doesNotThrow(() =>
    validateDeploymentEnv(
      "api",
      { ...validApi, LOCAL_STORAGE_PATH: path.join(temporary, "durable") },
      { releaseRoot },
    ),
  );
});

test("external object storage needs explicit credentials and TLS", () => {
  const config = {
    ...validApi,
    STORAGE_DRIVER: "minio",
    MINIO_ACCESS_KEY: "fixture-access",
    MINIO_SECRET_KEY: "fixture-private-key",
    MINIO_ENDPOINT: "storage.kernel.test",
    MINIO_PUBLIC_URL: "https://storage.kernel.test",
    MINIO_USE_SSL: "true",
  };
  assert.doesNotThrow(() => validateDeploymentEnv("api", config));
  for (const changed of [
    { MINIO_USE_SSL: "false" },
    { MINIO_SECRET_KEY: "minioadmin" },
    { MINIO_ACCESS_KEY: "" },
  ]) {
    assert.throws(() =>
      validateDeploymentEnv("api", { ...config, ...changed }),
    );
  }
});

test("public origins cannot inject nginx fields, credentials or non-origin URL parts", () => {
  for (const invalid of [
    "https://user:private@kernel.test",
    "https://kernel.test/extra",
    "https://kernel.test?q=1",
    "https://kernel.test#hash",
    "https://kernel.test/",
    "https://kernel.test\n;return 200;",
    "file:///tmp/file",
  ]) {
    assert.throws(() => validateOrigin(invalid));
  }
});

const publicValues = {
  API_HOST: "api.kernel.test",
  TLS_CERTIFICATE: "/etc/kernel/tls/fullchain.pem",
  TLS_CERTIFICATE_KEY: "/etc/kernel/tls/privkey.pem",
  RELEASE_ID: "qa-0123456789",
};

test("configuration rendering preserves nginx variables and only exposes approved fields", () => {
  assert.equal(
    renderDeploymentTemplate(
      "server_name ${API_HOST}; proxy_set_header Host $host; try_files $uri $uri/ /index.html;",
      publicValues,
    ),
    "server_name api.kernel.test; proxy_set_header Host $host; try_files $uri $uri/ /index.html;",
  );
  for (const [name, value] of [
    ["API_HOST", "kernel.test; return 200;"],
    ["API_HOST", "api.kernel.test\n"],
    ["API_HOST", "https://admin.kernel.test"],
    ["TLS_CERTIFICATE", "/etc/kernel/../private.key"],
    ["RELEASE_ID", "../release"],
    ["RELEASE_ID", "replace-release-id"],
    ["RELEASE_ID", "replace-with-immutable-release-id"],
    ["HTTPS_PORT", "0"],
  ]) {
    assert.throws(() =>
      renderDeploymentTemplate(`\${${name}}`, {
        ...publicValues,
        [name]: value,
      }),
    );
  }
  assert.throws(() =>
    renderDeploymentTemplate("${BETTER_AUTH_SECRET}", {
      BETTER_AUTH_SECRET: validApi.BETTER_AUTH_SECRET,
    }),
  );
  assert.throws(() => renderDeploymentTemplate("${API_HOST}", {}));
});

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

test("renderer CLI uses fixed templates and does not expose unrelated input", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "kernel-render-fixture-"),
  );
  try {
    const template = path.join(directory, "nginx.template");
    const env = path.join(directory, "public.env");
    const output = path.join(directory, "nginx.conf");
    const secret = "synthetic-secret-never-render";
    await writeFile(template, "${SECRET}");
    await writeFile(env, `SECRET=${secret}\n`);
    await writeFile(output, "unchanged");
    const command = fileURLToPath(
      new URL("./render-deployment.mjs", import.meta.url),
    );
    const input = `API_HOST=kernel.test\nSECRET=${secret}\n`;
    const result = spawnSync(
      process.execPath,
      [command, "--template", "bootstrap"],
      { input, encoding: "utf8" },
    );
    assert.equal(result.status, 0);
    assert.match(result.stdout, /server_name kernel\.test;/);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /synthetic-secret-never-render/,
    );
    const kernel = spawnSync(
      process.execPath,
      [command, "--template", "kernel"],
      {
        input: `${input}TLS_CERTIFICATE=/etc/kernel-api/fullchain.pem\nTLS_CERTIFICATE_KEY=/etc/kernel-api/private.key\nRELEASE_ID=release-1\n`,
        encoding: "utf8",
      },
    );
    assert.equal(kernel.status, 0);
    assert.match(kernel.stdout, /server_name kernel\.test;/);
    assert.doesNotMatch(
      kernel.stdout + kernel.stderr,
      /synthetic-secret-never-render/,
    );
    const tooLarge = spawnSync(
      process.execPath,
      [command, "--template", "bootstrap"],
      {
        input: `API_HOST=kernel.test\nSECRET=${"x".repeat(65537)}\n`,
        encoding: "utf8",
      },
    );
    assert.notEqual(tooLarge.status, 0);
    assert.equal(tooLarge.stdout, "");
    for (const args of [
      ["--template", template],
      ["--template", "bootstrap", "--env-file", env, "--output", output],
      ["--template", "bootstrap", "--force"],
    ]) {
      const rejected = spawnSync(process.execPath, [command, ...args], {
        input,
        encoding: "utf8",
      });
      assert.notEqual(rejected.status, 0);
      assert.equal(rejected.stdout, "");
      assert.doesNotMatch(rejected.stderr, /synthetic-secret-never-render/);
    }
    assert.equal(await readFile(output, "utf8"), "unchanged");
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("kernel-render-fixture-"));
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});

test("readiness probes check actual response semantics and do not follow redirects", async () => {
  let successfulApiRequests = 0;
  const server = http.createServer((request, response) => {
    if (request.url === "/api") {
      successfulApiRequests++;
      response.setHeader("content-type", "application/json");
      response.end('{"status":"ok"}');
    } else if (request.url === "/website") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end("<!doctype html><html><body>Ready</body></html>");
    } else if (request.url === "/redirect") {
      response.writeHead(302, { location: "/api" });
      response.end();
    } else if (request.url === "/bad-json") {
      response.setHeader("content-type", "application/json");
      response.end('{"status":"starting"}');
    } else {
      response.writeHead(503);
      response.end("not ready");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    await checkHealth("api", `${base}/api`);
    for (const [mode, target] of [
      ["api", "/bad-json"],
      ["website", "/api"],
      ["api", "/error"],
      ["api", "/redirect"],
    ]) {
      await assert.rejects(() => checkHealth(mode, base + target));
    }
    assert.equal(successfulApiRequests, 1);
    await assert.rejects(() => checkHealth("unknown", base));
    await assert.rejects(() => checkHealth("api", "file:///tmp/file"));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
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
