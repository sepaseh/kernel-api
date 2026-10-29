import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { checkHealth } from "./healthcheck.mjs";
import {
  finishNativeSmoke,
  stopNativeSmokeServer,
} from "./native-smoke-cleanup.mjs";
import { packageRelease } from "./package-release.mjs";
import { validateDeploymentEnv } from "./validate-deployment-env.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const releaseId = `native-smoke-${randomBytes(8).toString("hex")}`;
const parent = path.resolve(tmpdir());
const state = await mkdtemp(path.join(parent, "kernel-api-native-smoke-"));
let output, server;
const essentials = Object.fromEntries(
  [
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
    "HOME",
  ].flatMap((name) =>
    process.env[name] === undefined ? [] : [[name, process.env[name]]],
  ),
);
const launch = (args, cwd, env, input) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: ["pipe", "inherit", "inherit"],
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Native release child failed (${code}).`)),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
const cleanupRelease = async () => {
  if (output) {
    const resolved = path.resolve(output);
    if (
      path.dirname(resolved) !==
        path.join(path.resolve(root), "dist", "releases") ||
      path.basename(resolved) !== releaseId
    )
      throw new Error("Unexpected native release cleanup path.");
    await rm(resolved, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
};
const cleanupState = async () => {
  const resolved = path.resolve(state);
  if (
    path.dirname(resolved) !== parent ||
    !path.basename(resolved).startsWith("kernel-api-native-smoke-")
  )
    throw new Error("Unexpected native state cleanup path.");
  await rm(resolved, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
};
const operationErrors = [];
try {
  await packageRelease({
    releaseId,
    onOutputCreated: (directory) => {
      output = directory;
    },
  });
  const api = path.join(output, "api");
  if (!process.env.npm_execpath)
    throw new Error("Run through npm run test:deploy:native.");
  await launch(
    [process.env.npm_execpath, "ci", "--omit=dev", "--no-audit", "--no-fund"],
    api,
    essentials,
  );
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  );
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    ...essentials,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: String(port),
    BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
    BETTER_AUTH_URL: origin,
    SERVER_ALLOWED_ORIGINS: origin,
    SERVER_RELEASE_ID: releaseId,
    SERVER_ENVIRONMENT: "native-smoke",
    DATABASE_URL: pathToFileURL(path.join(state, "test.sqlite")).href,
    LOCAL_STORAGE_PATH: path.join(state, "uploads"),
    STORAGE_DRIVER: "local",
    SERVER_SEED_DEVELOPMENT_DATA: "false",
    LOG_LEVEL: "warn",
  };
  validateDeploymentEnv("api", env);
  const initial = {
    first_name: "Native",
    last_name: "Fixture",
    mobile: "09111114444",
    username: "native.fixture",
    password: randomBytes(24).toString("base64url"),
  };
  await launch(["scripts/validate-deployment-env.mjs", "api"], api, env);
  await launch(["src/bootstrap-admin.ts"], api, env, JSON.stringify(initial));
  server = spawn(process.execPath, ["src/index.ts"], {
    cwd: api,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  let spawnError;
  server.once("error", (error) => {
    spawnError = error;
  });
  const deadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null)
      throw new Error("Native release API exited before readiness.");
    try {
      await checkHealth("api", origin + "/health");
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!ready) throw new Error("Native release did not become ready.");
  const login = await fetch(origin + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      identifier: initial.mobile,
      password: initial.password,
    }),
  });
  assert.equal(login.status, 200);
  const response = await login.json();
  assert.ok(response.access_token);
  const account = await fetch(origin + "/account/me", {
    headers: { Authorization: `Bearer ${response.access_token}` },
  });
  assert.equal(account.status, 200);
  assert.equal((await account.json()).username, initial.username);
} catch (error) {
  operationErrors.push(error);
}
await finishNativeSmoke(
  operationErrors,
  () => stopNativeSmokeServer(server),
  cleanupRelease,
  cleanupState,
);
console.log(
  "PASS: packaged production dependency install, prevalidation, migrations/bootstrap, health and authenticated HTTP run from an immutable release without development dependencies.",
);
