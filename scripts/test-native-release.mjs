import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  finishNativeSmoke,
  stopNativeSmokeServer,
  waitForNativeSmokeReady,
} from "./native-smoke-cleanup.mjs";
import { packageRelease } from "./package-release.mjs";
import { validateDeploymentEnv } from "./validate-deployment-env.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const releaseId = `native-smoke-${randomBytes(8).toString("hex")}`;
const parent = path.resolve(tmpdir());
const state = await mkdtemp(path.join(parent, "kernel-api-native-smoke-"));
let output, server, serverFailure;
const onServerError = (error) => {
  serverFailure ??= error;
};
const interruption = new AbortController();
const stopCancellation = new AbortController();
let stopping = false;
const onInterrupt = () => {
  const failure = new Error("Native release smoke cancelled by the operator.");
  if (stopping || interruption.signal.aborted) stopCancellation.abort(failure);
  else interruption.abort(failure);
};
process.on("SIGINT", onInterrupt);
process.on("SIGTERM", onInterrupt);
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
      signal: interruption.signal,
    });
    let failure;
    child.once("error", (error) => {
      failure = error;
      if (!child.pid) reject(error);
    });
    child.once("close", (code) => {
      if (failure) reject(failure);
      else if (code === 0) resolve();
      else reject(new Error(`Native release child failed (${code}).`));
    });
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
    LOG_LEVEL: "info",
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
    stdio: ["ignore", "pipe", "inherit"],
    windowsHide: true,
    signal: interruption.signal,
  });
  server.on("error", onServerError);
  server.stdout.pipe(process.stdout);
  await waitForNativeSmokeReady(server, { signal: interruption.signal });
  const health = await fetch(origin + "/health", {
    redirect: "error",
    headers: { Accept: "application/json" },
    signal: interruption.signal,
  });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");
  const login = await fetch(origin + "/auth/login", {
    signal: interruption.signal,
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
    signal: interruption.signal,
    headers: { Authorization: `Bearer ${response.access_token}` },
  });
  assert.equal(account.status, 200);
  assert.equal((await account.json()).username, initial.username);
} catch (error) {
  operationErrors.push(error);
}
if (serverFailure && !operationErrors.includes(serverFailure))
  operationErrors.push(serverFailure);
try {
  stopping = true;
  await finishNativeSmoke(
    operationErrors,
    () => stopNativeSmokeServer(server, { signal: stopCancellation.signal }),
    cleanupRelease,
    cleanupState,
  );
} finally {
  process.removeListener("SIGINT", onInterrupt);
  process.removeListener("SIGTERM", onInterrupt);
  if (server && (server.exitCode !== null || server.signalCode !== null))
    server.removeListener("error", onServerError);
}
console.log(
  "PASS: packaged production dependency install, prevalidation, migrations/bootstrap, health and authenticated HTTP run from an immutable release without development dependencies.",
);
