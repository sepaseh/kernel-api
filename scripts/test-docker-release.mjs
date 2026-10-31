// Explicit local engine only; generated credentials, certificates and data are disposable.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  smokeInterruption,
  withSmokeResources,
} from "./docker-smoke-cleanup.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const engine =
  process.platform === "win32"
    ? "npipe:////./pipe/dockerDesktopLinuxEngine"
    : "unix:///var/run/docker.sock";
const environment = Object.fromEntries(
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
let interruption;
const run = (
  args,
  { input, allowFailure = false, capture = false, cleanup = false } = {},
) =>
  new Promise((resolve, reject) => {
    const childEnvironment = { ...environment };
    if (
      cleanup ||
      (args[0] === "buildx" &&
        ["ls", "create", "inspect", "rm"].includes(args[1]))
    )
      delete childEnvironment.BUILDX_BUILDER;
    const child = spawn("docker", ["--host", engine, ...args], {
      cwd: root,
      env: childEnvironment,
      stdio: [
        "pipe",
        capture ? "pipe" : "inherit",
        capture ? "pipe" : "inherit",
      ],
      windowsHide: true,
      ...(!cleanup && interruption ? { signal: interruption.signal } : {}),
    });
    let output = "",
      diagnostic = "";
    if (capture) {
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (diagnostic += chunk));
    }
    child.once("error", reject);
    child.once("close", (code) => {
      if (capture && allowFailure)
        resolve({ code, stdout: output, stderr: diagnostic });
      else if (code === 0 || allowFailure) resolve(capture ? output : code);
      else
        reject(
          new Error(
            `Local Docker operation failed (${code}): ${diagnostic.trim()}`,
          ),
        );
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
await run(["info", "--format", "{{.OSType}}"]);
interruption = smokeInterruption();
const parent = path.resolve(os.tmpdir());
const directory = await mkdtemp(path.join(parent, "kernel-api-docker-smoke-"));
const project = `kernel-api-smoke-${randomBytes(6).toString("hex")}`;
const release = `smoke-${randomBytes(8).toString("hex")}`;
const builder = `${project}-builder`;
const certificateContainer = `${project}-certificates`;
const images = [
  `kernel-api-smoke/api:${release}`,
  `kernel-api-smoke/gateway:${release}`,
];
environment.BUILDX_BUILDER = builder;
console.log(
  `API Docker smoke resources: project=${project}, builder=${builder}, images=${images.join(",")}, TEMP=${directory}`,
);
const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
let httpsPort, httpPort, origin;
const caller = "https://admin.kernel.test";
const initial = {
  first_name: "Docker",
  last_name: "Fixture",
  mobile: "09111112222",
  username: "docker.fixture",
  password: randomBytes(24).toString("base64url"),
};
const tls = path.join(directory, "tls");
const apiEnv = path.join(directory, "api.env"),
  publicEnv = path.join(directory, "compose.env");
const posix = (value) => value.replaceAll("\\", "/");
const compose = (args, options) =>
  run(
    [
      "compose",
      "--project-name",
      project,
      "--env-file",
      publicEnv,
      "-f",
      "deploy/docker/compose.yaml",
      ...args,
    ],
    options,
  );
const request = (
  address,
  { method = "GET", headers = {}, body, servername } = {},
) =>
  new Promise((resolve, reject) => {
    const target = new URL(address);
    if (target.hostname !== "api.kernel.test")
      return reject(
        new Error("Only the generated local fixture hostname is allowed."),
      );
    const transport = target.protocol === "https:" ? https : http;
    const req = transport.request(
      target,
      {
        method,
        headers,
        rejectUnauthorized: false,
        ...(servername ? { servername } : {}),
        signal: interruption.signal,
        lookup: (_name, options, done) =>
          options.all
            ? done(null, [{ address: "127.0.0.1", family: 4 }])
            : done(null, "127.0.0.1", 4),
        timeout: 15000,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.once("end", () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            text: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        response.once("error", reject);
      },
    );
    req.once("error", reject);
    req.once("timeout", () => req.destroy(new Error("Local fixture timeout.")));
    req.end(body);
  });
const json = (endpoint, data, headers = {}) =>
  request(origin + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: caller, ...headers },
    body: JSON.stringify(data),
  });
const cleanupDirectory = async () => {
  const resolved = path.resolve(directory);
  if (
    path.dirname(resolved) !== parent ||
    !path.basename(resolved).startsWith("kernel-api-docker-smoke-")
  )
    throw new Error("Unexpected smoke fixture cleanup path.");
  await rm(resolved, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
};
let started = false,
  composeReady = false;
try {
  await withSmokeResources(
    {
      builder,
      images,
      containers: [certificateContainer],
      signal: interruption.signal,
      run,
      down: () =>
        composeReady
          ? compose(["down", "--volumes", "--remove-orphans"], {
              cleanup: true,
            })
          : undefined,
      removeDirectory: cleanupDirectory,
    },
    async () => {
      httpsPort = await freePort();
      httpPort = await freePort();
      origin = `https://api.kernel.test:${httpsPort}`;
      await mkdir(tls);
      await writeFile(
        apiEnv,
        `BETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}\nSTORAGE_DRIVER=local\nLOG_LEVEL=warn\nSERVER_ENVIRONMENT=smoke\n`,
        { mode: 0o600 },
      );
      await writeFile(
        publicEnv,
        [
          `RELEASE_ID=${release}`,
          "IMAGE_PREFIX=kernel-api-smoke",
          "API_HOST=api.kernel.test",
          `API_PUBLIC_ORIGIN=${origin}`,
          `SERVER_ALLOWED_ORIGINS=${caller}`,
          "BIND_ADDRESS=127.0.0.1",
          `HTTP_PORT=${httpPort}`,
          `HTTPS_PORT=${httpsPort}`,
          `TLS_CERT_DIRECTORY=${JSON.stringify(posix(tls))}`,
          `API_ENV_FILE=${JSON.stringify(posix(apiEnv))}`,
          "",
        ].join("\n"),
      );
      composeReady = true;
      try {
        await compose(["config", "--quiet"]);
        await compose(["build"]);
        await run([
          "run",
          "--rm",
          "--name",
          certificateContainer,
          "--entrypoint",
          "openssl",
          "--mount",
          `type=bind,source=${posix(tls)},target=/tls`,
          images[1],
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-noenc",
          "-keyout",
          "/tls/privkey.pem",
          "-out",
          "/tls/fullchain.pem",
          "-days",
          "1",
          "-subj",
          "/CN=api.kernel.test",
          "-addext",
          "subjectAltName=DNS:api.kernel.test",
        ]);
        started = true;
        await compose(["up", "-d", "--wait", "--wait-timeout", "120"]);
        await compose([
          "exec",
          "-T",
          "api",
          "node",
          "-e",
          `const assert = require("node:assert/strict");
          const fs = require("node:fs");
          const path = require("node:path");
          const source = "/app/src";
          assert.equal(fs.existsSync(path.join(source, "test")), false);
          const directories = [source];
          for (const directory of directories) {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
              const filename = path.join(directory, entry.name);
              assert.doesNotMatch(filename, /\\.(?:test|spec)\\.ts$/);
              if (entry.isDirectory()) directories.push(filename);
            }
          }`,
        ]);
        assert.equal((await request(origin + "/health")).status, 200);
        await assert.rejects(
          request(origin + "/health", {
            headers: { Host: "unknown.kernel.test" },
          }),
        );
        await assert.rejects(
          request(origin + "/health", { servername: "unknown.kernel.test" }),
        );
        const marker = await request(origin + "/_kernel/release");
        assert.equal(JSON.parse(marker.text).release, release);
        assert.equal(marker.headers["cache-control"], "no-store");
        assert.equal(
          (await request(`http://api.kernel.test:${httpPort}/health`)).status,
          308,
        );
        const args = ["exec", "-T", "api", "node", "src/bootstrap-admin.ts"];
        await compose(args, { input: JSON.stringify(initial) });
        assert.notEqual(
          await compose(args, {
            input: JSON.stringify(initial),
            allowFailure: true,
          }),
          0,
        );
        const login = await json("/auth/login", {
          identifier: initial.mobile,
          password: initial.password,
        });
        assert.equal(login.status, 200);
        const cookies = login.headers["set-cookie"] ?? [];
        assert.ok(cookies.some((cookie) => /;\s*secure(?:;|$)/i.test(cookie)));
        const cookie = cookies
          .map((value) => value.split(";", 1)[0])
          .join("; ");
        assert.equal(
          (
            await request(origin + "/account/me", {
              headers: { Cookie: cookie },
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await json(
              "/auth/login",
              { identifier: initial.mobile, password: initial.password },
              { Origin: "https://untrusted.kernel.test" },
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await json("/auth/otp-request", {
              mobile: "09111113333",
              purpose: "register",
            })
          ).status,
          500,
        );
        const upload = async (visibility) => {
          const boundary = `kernel-${randomBytes(8).toString("hex")}`;
          const contents = `synthetic ${visibility} persistence proof`;
          const body = `--${boundary}\r\nContent-Disposition: form-data; name="visibility"\r\n\r\n${visibility}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="proof.txt"\r\nContent-Type: text/plain\r\n\r\n${contents}\r\n--${boundary}--\r\n`;
          const response = await request(origin + "/files", {
            method: "POST",
            headers: {
              Cookie: cookie,
              Origin: caller,
              "Content-Type": `multipart/form-data; boundary=${boundary}`,
            },
            body,
          });
          assert.equal(response.status, 201);
          return { ...JSON.parse(response.text), contents };
        };
        const publicFile = await upload("public"),
          privateFile = await upload("private");
        assert.equal(new URL(publicFile.url).origin, origin);
        assert.equal(privateFile.url, undefined);
        assert.equal((await request(publicFile.url)).text, publicFile.contents);
        assert.equal(
          (await request(`${origin}/files/${privateFile.id}/content`)).status,
          404,
        );
        await compose(["up", "-d", "--no-deps", "--force-recreate", "api"]);
        await compose(["up", "-d", "--wait", "--wait-timeout", "120"]);
        assert.equal((await request(publicFile.url)).text, publicFile.contents);
        assert.equal(
          (
            await request(origin + "/account/me", {
              headers: { Cookie: cookie },
            })
          ).status,
          200,
        );
      } catch (error) {
        if (started && !interruption.signal.aborted)
          await compose(["logs", "--no-color", "gateway"], {
            allowFailure: true,
          });
        throw error;
      }
    },
  );
  console.log(
    "PASS: independent Docker HTTPS, release marker, first-admin bootstrap, sessions, origin checks, explicit missing OTP, public/private storage and persistence after container replacement; test images, builder/cache and fixtures removed.",
  );
} finally {
  interruption.dispose();
}
