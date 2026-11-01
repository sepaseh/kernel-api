import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { validApi } from "./deployment.test-support.mjs";
import {
  validateDeploymentEnv,
  validateOrigin,
} from "./validate-deployment-env.mjs";

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

test("gateway host and port must agree with the API public HTTPS origin", () => {
  const gateway = {
    ...validApi,
    API_HOST: "api.kernel.test",
    HTTPS_PORT: "443",
  };
  for (const changed of [
    {},
    { BETTER_AUTH_URL: "https://api.kernel.test:443" },
    { HTTPS_PORT: "8443", BETTER_AUTH_URL: "https://api.kernel.test:8443" },
  ])
    assert.doesNotThrow(() =>
      validateDeploymentEnv("api", { ...gateway, ...changed }),
    );
  for (const changed of [
    { API_HOST: "other.kernel.test" },
    { HTTPS_PORT: "8443" },
    { BETTER_AUTH_URL: "https://other.kernel.test" },
    { API_HOST: "localhost", BETTER_AUTH_URL: "http://localhost" },
    { API_HOST: "127.1", BETTER_AUTH_URL: "https://127.0.0.1" },
    { API_HOST: "2130706433", BETTER_AUTH_URL: "https://127.0.0.1" },
  ])
    assert.throws(
      () => validateDeploymentEnv("api", { ...gateway, ...changed }),
      /BETTER_AUTH_URL must match API_HOST and HTTPS_PORT/,
    );
  for (const API_HOST of [
    "",
    "API.kernel.test",
    "-api.kernel.test",
    "api..kernel.test",
    "api.kernel.test:443",
    "api.kernel.test/path",
    "api.kernel.test\n",
    `${"a".repeat(64)}.kernel.test`,
  ])
    assert.throws(
      () => validateDeploymentEnv("api", { ...gateway, API_HOST }),
      /API_HOST/,
    );
  for (const HTTPS_PORT of ["", "0", "65536", "443.0", "443/path"])
    assert.throws(
      () => validateDeploymentEnv("api", { ...gateway, HTTPS_PORT }),
      /HTTPS_PORT/,
    );
  assert.throws(
    () =>
      validateDeploymentEnv("api", { ...validApi, API_HOST: gateway.API_HOST }),
    /HTTPS_PORT is required/,
  );
  assert.throws(
    () => validateDeploymentEnv("api", { ...validApi, HTTPS_PORT: "443" }),
    /API_HOST is required/,
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
