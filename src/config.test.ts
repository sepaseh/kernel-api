import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import {
  loadConfig,
  repositoryRoot,
  resolveDatabaseUrl,
} from "./infrastructure/config.ts";

const base = {
  BETTER_AUTH_SECRET:
    "synthetic-config-secret-with-at-least-thirty-two-characters",
};
const minio = {
  MINIO_ACCESS_KEY: "synthetic-access",
  MINIO_ENDPOINT: "storage.example.test",
  MINIO_PUBLIC_URL: "https://storage.example.test",
  MINIO_SECRET_KEY: "synthetic-secret",
};
const production = {
  ...base,
  ...minio,
  BETTER_AUTH_URL: "https://api.example.test",
  DATABASE_URL: "file:synthetic.sqlite",
  NODE_ENV: "production",
  SERVER_ALLOWED_ORIGIN: "https://admin.example.test",
  SERVER_RELEASE_ID: "synthetic-release",
};

test("MinIO signing regions preserve explicit ASCII custom values and reject whitespace or scope separators", () => {
  assert.equal(loadConfig(base).minio.region, "us-east-1");
  for (const region of [
    "us-east-1",
    "eu-west-2",
    "warehouse-region-1",
    "CUSTOM-Region",
  ]) {
    assert.equal(
      loadConfig({ ...base, MINIO_REGION: region }).minio.region,
      region,
    );
  }
  for (const region of [
    "",
    " ",
    " us-east-1",
    "us-east-1 ",
    "us-east-1\n",
    "us east",
    "us/east",
    "نام",
    ".region",
    "-region",
    "region-",
    "warehouse_region.1",
    "fips-us-east-1",
    "us-east-1-fips",
    "a".repeat(64),
  ]) {
    assert.throws(
      () => loadConfig({ ...base, MINIO_REGION: region }),
      /MINIO_REGION/,
    );
  }
});

test("local configuration uses contained repository paths without creating files or default credentials", () => {
  const config = loadConfig(base);
  assert.equal(config.storageDriver, "local");
  assert.equal(
    config.databaseUrl,
    pathToFileURL(path.join(repositoryRoot, "server/data/kernel.sqlite")).href,
  );
  assert.equal(
    config.localStoragePath,
    path.join(repositoryRoot, "server/data/uploads"),
  );
  assert.equal(config.port, 3000);
  assert.equal(config.minio.port, 9000);
  assert.equal(config.uploadLimitBytes, 5 * 1024 * 1024);
  assert.equal(config.minio.accessKey, "");
  assert.equal(config.minio.secretKey, "");
  assert.equal(config.seedDevelopmentData, false);
  assert.equal(
    loadConfig({
      ...base,
      NODE_ENV: "development",
      SERVER_SEED_DEVELOPMENT_DATA: "true",
    }).seedDevelopmentData,
    true,
  );
});

test("fixed OTPs and development seeding require an explicit development or test environment", () => {
  for (const NODE_ENV of ["development", "test"]) {
    const config = loadConfig({
      ...base,
      NODE_ENV,
      OTP_FIXED_CODE: "synthetic-fixed-code",
      SERVER_SEED_DEVELOPMENT_DATA: "true",
    });
    assert.equal(config.otpCode, "synthetic-fixed-code");
    assert.equal(config.seedDevelopmentData, true);
  }
  for (const NODE_ENV of [undefined, "", "staging", "Development"]) {
    const environment = {
      ...base,
      NODE_ENV,
      SERVER_ENVIRONMENT: "test",
      SERVER_SEED_DEVELOPMENT_DATA: "true",
    };
    assert.equal(loadConfig(environment).seedDevelopmentData, false);
    for (const OTP_FIXED_CODE of ["synthetic-fixed-code", ""])
      assert.throws(
        () => loadConfig({ ...environment, OTP_FIXED_CODE }),
        /OTP_FIXED_CODE requires NODE_ENV=development or NODE_ENV=test/,
      );
  }
});

test("database location resolution preserves memory, absolute file and remote URLs", () => {
  for (const value of [
    "file::memory:",
    "file:///synthetic/database.sqlite",
    "libsql://synthetic.example.test",
    "https://synthetic.example.test",
  ])
    assert.equal(resolveDatabaseUrl(value), value);
  assert.equal(
    resolveDatabaseUrl("file:synthetic/database.sqlite"),
    pathToFileURL(path.join(repositoryRoot, "synthetic/database.sqlite")).href,
  );
});

test("numeric limits accept only explicit safe positive integers in range", () => {
  const config = loadConfig({
    ...base,
    PORT: "65535",
    MINIO_PORT: "1",
    UPLOAD_LIMIT_BYTES: String(Number.MAX_SAFE_INTEGER),
  });
  assert.equal(config.port, 65535);
  assert.equal(config.minio.port, 1);
  assert.equal(config.uploadLimitBytes, Number.MAX_SAFE_INTEGER);
  for (const name of ["PORT", "MINIO_PORT", "UPLOAD_LIMIT_BYTES"])
    for (const value of [
      "",
      "0",
      "-1",
      "1.5",
      "NaN",
      "Infinity",
      " 42",
      "1e3",
      "9007199254740992",
    ])
      assert.throws(
        () => loadConfig({ ...base, [name]: value }),
        new RegExp(name),
      );
  for (const name of ["PORT", "MINIO_PORT"])
    assert.throws(
      () => loadConfig({ ...base, [name]: "65536" }),
      new RegExp(name),
    );
});

test("origin configuration uses exact HTTP origins and removes duplicates", () => {
  const config = loadConfig({
    ...base,
    BETTER_AUTH_URL: "https://api.example.test",
    SERVER_ALLOWED_ORIGINS:
      " https://admin.example.test,https://api.example.test,https://admin.example.test ",
  });
  assert.deepEqual(config.allowedOrigins, [
    "https://admin.example.test",
    "https://api.example.test",
  ]);
  assert.equal(config.allowedOrigin, "https://admin.example.test");
  for (const origin of [
    "file:///synthetic",
    "https://user:pass@example.test",
    "https://example.test/path",
    "https://example.test/?query=1",
    "https://example.test/#hash",
  ])
    assert.throws(
      () => loadConfig({ ...base, SERVER_ALLOWED_ORIGINS: origin }),
      /Allowed origins/,
    );
  assert.throws(
    () => loadConfig({ ...base, SERVER_ALLOWED_ORIGINS: ", ," }),
    /At least one/,
  );
});

test("production requires explicit configuration, disables seed data and rejects fixed OTPs", () => {
  const config = loadConfig({
    ...production,
    SERVER_SEED_DEVELOPMENT_DATA: "true",
  });
  assert.equal(config.storageDriver, "minio");
  assert.equal(config.seedDevelopmentData, false);
  assert.throws(
    () => loadConfig({ ...production, OTP_FIXED_CODE: "synthetic-fixed-code" }),
    /OTP_FIXED_CODE/,
  );
  for (const key of [
    "BETTER_AUTH_URL",
    "DATABASE_URL",
    "SERVER_ALLOWED_ORIGIN",
    "MINIO_ACCESS_KEY",
    "MINIO_SECRET_KEY",
    "MINIO_ENDPOINT",
    "MINIO_PUBLIC_URL",
  ])
    assert.throws(
      () => loadConfig({ ...production, [key]: " " }),
      /required configuration/,
    );
  assert.equal(
    loadConfig({
      ...production,
      STORAGE_DRIVER: "local",
      MINIO_ACCESS_KEY: undefined,
      MINIO_SECRET_KEY: undefined,
    }).storageDriver,
    "local",
  );
});

test("MinIO requires explicit credentials in every environment and rejects unsupported driver/SSL flags", () => {
  for (const missing of [undefined, "", " "])
    for (const key of ["MINIO_ACCESS_KEY", "MINIO_SECRET_KEY"])
      assert.throws(
        () =>
          loadConfig({
            ...base,
            ...minio,
            STORAGE_DRIVER: "minio",
            [key]: missing,
          }),
        /required configuration/,
      );
  for (const value of ["", "memory", "LOCAL"])
    assert.throws(
      () => loadConfig({ ...base, STORAGE_DRIVER: value }),
      /STORAGE_DRIVER/,
    );
  assert.throws(
    () => loadConfig({ ...base, MINIO_USE_SSL: "invalid" }),
    /MINIO_USE_SSL/,
  );
  for (const flag of ["true", "false"])
    assert.equal(
      loadConfig({
        ...base,
        ...minio,
        STORAGE_DRIVER: "minio",
        MINIO_USE_SSL: flag,
      }).minio.useSSL,
      flag === "true",
    );
  for (const secret of [undefined, "", " "])
    assert.throws(
      () => loadConfig({ BETTER_AUTH_SECRET: secret }),
      /BETTER_AUTH_SECRET/,
    );
});
