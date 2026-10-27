import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const runner = `process.on('message', value => { process.disconnect(); if (value === 'stop') process.emit('SIGTERM'); if (value === 'interrupt') process.emit('SIGINT'); }); await import('./src/index.ts')`;
const observeDbCloseRunner = `import { mock } from 'node:test'; const real = await import('@libsql/client'); mock.module('@libsql/client', { exports: { ...real, createClient: (...args) => { const client = real.createClient(...args); const close = client.close.bind(client); client.close = () => { const result = close(); process.stdout.write('fixture.database.closed\\n'); return result; }; return client; } } }); await import('./src/index.ts')`;
const reserve = async () => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, port: server.address().port };
};
const close = (server) =>
  new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
async function createFixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kernel-runtime-test-"));
  t.after(async () => {
    const parent = await realpath(os.tmpdir());
    const owned = await realpath(dir);
    const relative = path.relative(parent, owned);
    if (
      !relative.startsWith("kernel-runtime-test-") ||
      relative.includes(path.sep)
    )
      throw new Error(
        "Test cleanup target is outside its owned temporary directory.",
      );
    await rm(owned, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  });
  const { server, port } = await reserve();
  await close(server);
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: dir,
    TMP: dir,
    NODE_ENV: "test",
    BETTER_AUTH_SECRET: "synthetic-test-secret-with-at-least-32-characters",
    BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
    SERVER_ALLOWED_ORIGIN: "http://localhost:5173",
    DATABASE_URL: `file:${path.join(dir, "runtime.sqlite").replaceAll("\\", "/")}`,
    LOCAL_STORAGE_PATH: path.join(dir, "objects"),
    SERVER_SEED_DEVELOPMENT_DATA: "true",
    OTP_FIXED_CODE: "123456",
    STORAGE_DRIVER: "local",
    HOST: "127.0.0.1",
    PORT: String(port),
    UPLOAD_LIMIT_BYTES: "16",
  };
  return { dir, port, env };
}
function start(t, env, { observeDbClose = false } = {}) {
  const flags = observeDbClose ? ["--experimental-test-module-mocks"] : [];
  const script = observeDbClose ? observeDbCloseRunner : runner;
  const child = spawn(
    process.execPath,
    [...flags, "--input-type=module", "-e", script],
    {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    },
  );
  let output = "";
  child.stdout.on("data", (data) => (output += data));
  child.stderr.on("data", (data) => (output += data));
  const result = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await result;
    }
  });
  return { child, result, output: () => output };
}
async function waitForReady(fixture, process) {
  for (let i = 0; i < 150; i++) {
    if (process.child.exitCode !== null)
      throw new Error(`Server exited during startup: ${process.output()}`);
    try {
      const response = await fetch(`http://127.0.0.1:${fixture.port}/health`);
      if (response.status === 200) return;
      assert.equal(response.status, 503);
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
    }
    await delay(100);
  }
  throw new Error(`Server did not become ready: ${process.output()}`);
}

test(
  "real Node adapter starts, authenticates and shuts down gracefully",
  { timeout: 20_000 },
  async (t) => {
    const fixture = await createFixture(t);
    const running = start(t, fixture.env);
    await waitForReady(fixture, running);
    const base = `http://127.0.0.1:${fixture.port}`;
    const login = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({
        identifier: "09123456789",
        password: "password123",
      }),
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie"), /HttpOnly/i);
    const { access_token: token } = await login.json();
    assert.ok(token);
    const account = await fetch(`${base}/account/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(account.status, 200);
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const profileOtp = await fetch(
      `${base}/account/request-mobile-verification`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ mobile: "09123456780" }),
      },
    );
    assert.equal(profileOtp.status, 200);
    const otherLogin = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: "09123456789",
        password: "password123",
      }),
    });
    assert.equal(otherLogin.status, 200);
    const otherSession = await otherLogin.json();
    const wrongSession = await fetch(`${base}/account/update-profile`, {
      method: "PATCH",
      headers: {
        ...authHeaders,
        Authorization: `Bearer ${otherSession.access_token}`,
      },
      body: JSON.stringify({ mobile: "09123456780", otp: "123456" }),
    });
    assert.equal(wrongSession.status, 400);
    const profileUpdate = await fetch(`${base}/account/update-profile`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ mobile: "09123456780", otp: "123456" }),
    });
    assert.equal(profileUpdate.status, 200);
    assert.equal((await profileUpdate.json()).mobile, "09123456780");
    const replay = await fetch(`${base}/account/update-profile`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ mobile: "09123456789", otp: "123456" }),
    });
    assert.equal(replay.status, 400);
    const created = await fetch(`${base}/users`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        first_name: "Synthetic",
        last_name: "User",
        mobile: "09120000011",
        password: "password123",
      }),
    });
    assert.equal(created.status, 201);
    const target = await created.json();
    const managedOtp = await fetch(
      `${base}/users/${target.id}/request-mobile-verification`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ mobile: "09120000012" }),
      },
    );
    assert.equal(managedOtp.status, 200);
    const managedUpdate = await fetch(`${base}/users/${target.id}`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ mobile: "09120000012", otp: "123456" }),
    });
    assert.equal(managedUpdate.status, 200);
    assert.equal((await managedUpdate.json()).mobile, "09120000012");
    const oversized = await new Promise((resolve, reject) => {
      const request = http.request(
        `${base}/files`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data; boundary=kernel-test",
            "Transfer-Encoding": "chunked",
          },
        },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        },
      );
      request.on("error", reject);
      request.write(
        '--kernel-test\r\nContent-Disposition: form-data; name="file"; filename="x.txt"\r\nContent-Type: text/plain\r\n\r\n',
      );
      request.write(Buffer.alloc(70_000, 65));
      request.end("\r\n--kernel-test--\r\n");
    });
    assert.equal(oversized, 413);
    if (process.platform === "win32") running.child.send("stop");
    else {
      running.child.disconnect();
      running.child.kill("SIGTERM");
    }
    const result = await running.result;
    assert.equal(result.code, 0, running.output());
    assert.match(running.output(), /server.stopped/);
  },
);

test(
  "startup responds 503 until storage is ready and handles shutdown during initialization",
  { timeout: 20_000 },
  async (t) => {
    const fixture = await createFixture(t);
    let release;
    let seen;
    const requestSeen = new Promise((resolve) => {
      seen = resolve;
    });
    const storage = http.createServer((request, response) => {
      if (!release) {
        release = () => {
          response.statusCode = 200;
          response.end();
        };
        seen();
        return;
      }
      if (request.method === "GET") {
        response.setHeader("Content-Type", "application/xml");
        response.end(
          '<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></VersioningConfiguration>',
        );
      } else {
        response.statusCode = 204;
        response.end();
      }
    });
    storage.listen(0, "127.0.0.1");
    await once(storage, "listening");
    t.after(() => close(storage));
    const storagePort = storage.address().port;
    const awsConfig = path.join(fixture.dir, "aws-config");
    const awsCredentials = path.join(fixture.dir, "aws-credentials");
    await Promise.all([
      writeFile(awsConfig, ""),
      writeFile(awsCredentials, ""),
    ]);
    Object.assign(fixture.env, {
      STORAGE_DRIVER: "minio",
      MINIO_ENDPOINT: "127.0.0.1",
      MINIO_PORT: String(storagePort),
      MINIO_USE_SSL: "false",
      MINIO_PUBLIC_URL: `http://127.0.0.1:${storagePort}`,
      MINIO_ACCESS_KEY: "synthetic-access",
      MINIO_SECRET_KEY: "synthetic-secret",
      AWS_CONFIG_FILE: awsConfig,
      AWS_SHARED_CREDENTIALS_FILE: awsCredentials,
      AWS_EC2_METADATA_DISABLED: "true",
      AWS_PROFILE: "synthetic-profile",
    });
    const running = start(t, fixture.env);
    await requestSeen;
    const response = await fetch(`http://127.0.0.1:${fixture.port}/health`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    if (process.platform === "win32") running.child.send("stop");
    else {
      running.child.disconnect();
      running.child.kill("SIGTERM");
    }
    await delay(100);
    release();
    const result = await running.result;
    assert.equal(result.code, 0, running.output());
    assert.match(running.output(), /server.stopped/);
    assert.doesNotMatch(running.output(), /server.started/);
  },
);

test("occupied port fails before database or object-storage state is created", async (t) => {
  const fixture = await createFixture(t);
  const occupied = http.createServer();
  occupied.listen(fixture.port, "127.0.0.1");
  await once(occupied, "listening");
  t.after(() => close(occupied));
  const running = start(t, fixture.env);
  const result = await running.result;
  assert.equal(result.code, 1, running.output());
  assert.match(running.output(), /server.startup.failed/);
  await assert.rejects(stat(path.join(fixture.dir, "runtime.sqlite")), {
    code: "ENOENT",
  });
  await assert.rejects(stat(path.join(fixture.dir, "objects")), {
    code: "ENOENT",
  });
});

test("configuration failure is sanitized and never opens a listener", async (t) => {
  const fixture = await createFixture(t);
  delete fixture.env.BETTER_AUTH_SECRET;
  const running = start(t, fixture.env);
  const result = await running.result;
  assert.equal(result.code, 1, running.output());
  assert.match(running.output(), /server.startup.failed/);
  await assert.rejects(stat(path.join(fixture.dir, "runtime.sqlite")), {
    code: "ENOENT",
  });
});

test(
  "database initialization failure closes the already-bound listener",
  { timeout: 20_000 },
  async (t) => {
    const fixture = await createFixture(t);
    fixture.env.DATABASE_URL = `file:${fixture.dir.replaceAll("\\", "/")}`;
    const running = start(t, fixture.env);
    const result = await running.result;
    assert.equal(result.code, 1, running.output());
    assert.match(running.output(), /server.startup.failed/);
    const replacement = net.createServer();
    replacement.listen(fixture.port, "127.0.0.1");
    await once(replacement, "listening");
    await close(replacement);
  },
);

test(
  "storage readiness failure closes the listener after database startup",
  { timeout: 20_000 },
  async (t) => {
    const fixture = await createFixture(t);
    fixture.env.SERVER_SEED_DEVELOPMENT_DATA = "false";
    let storageRequests = 0;
    const storage = http.createServer((request, response) => {
      storageRequests++;
      response.statusCode = 403;
      response.end();
    });
    storage.listen(0, "127.0.0.1");
    await once(storage, "listening");
    t.after(() => close(storage));
    const storagePort = storage.address().port;
    const awsConfig = path.join(fixture.dir, "aws-config");
    const awsCredentials = path.join(fixture.dir, "aws-credentials");
    await Promise.all([
      writeFile(awsConfig, ""),
      writeFile(awsCredentials, ""),
    ]);
    Object.assign(fixture.env, {
      STORAGE_DRIVER: "minio",
      MINIO_ENDPOINT: "127.0.0.1",
      MINIO_PORT: String(storagePort),
      MINIO_USE_SSL: "false",
      MINIO_PUBLIC_URL: `http://127.0.0.1:${storagePort}`,
      MINIO_ACCESS_KEY: "synthetic-access",
      MINIO_SECRET_KEY: "synthetic-secret",
      AWS_CONFIG_FILE: awsConfig,
      AWS_SHARED_CREDENTIALS_FILE: awsCredentials,
      AWS_EC2_METADATA_DISABLED: "true",
      AWS_PROFILE: "synthetic-profile",
    });
    const running = start(t, fixture.env, { observeDbClose: true });
    const result = await running.result;
    assert.equal(result.code, 1, running.output());
    assert.ok(
      storageRequests > 0,
      "Expected a request to the synthetic storage",
    );
    assert.match(running.output(), /server.startup.failed/);
    assert.doesNotMatch(running.output(), /server.started/);
    assert.equal(
      (running.output().match(/fixture\.database\.closed/g) ?? []).length,
      1,
    );
    const replacement = net.createServer();
    replacement.listen(fixture.port, "127.0.0.1");
    await once(replacement, "listening");
    await close(replacement);
  },
);

test("SIGINT shuts down a running server", { timeout: 20_000 }, async (t) => {
  const fixture = await createFixture(t);
  fixture.env.SERVER_SEED_DEVELOPMENT_DATA = "false";
  const running = start(t, fixture.env);
  await waitForReady(fixture, running);
  if (process.platform === "win32") running.child.send("interrupt");
  else {
    running.child.disconnect();
    running.child.kill("SIGINT");
  }
  const result = await running.result;
  assert.equal(result.code, 0, running.output());
  assert.match(running.output(), /server.stopped/);
});
