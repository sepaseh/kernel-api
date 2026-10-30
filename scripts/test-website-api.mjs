import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { stopNativeSmokeServer } from "./native-smoke-cleanup.mjs";

export async function superviseWebsiteApi(
  child,
  cleanup,
  { signals = process, timeoutMs = 10_000 } = {},
) {
  let stopping = false;
  let stopPromise;
  let settle;
  const outcome = new Promise((resolve) => {
    settle = resolve;
  });
  const onExit = (code, signal) => settle({ code, signal, exited: true });
  const onError = (error) => settle({ error });
  const onSignal = () => {
    if (stopping) return;
    stopping = true;
    stopPromise = stopNativeSmokeServer(child, timeoutMs);
    stopPromise.then(
      () =>
        settle({
          code: child.exitCode,
          signal: child.signalCode,
          exited: true,
        }),
      (error) => settle({ error, stopFailed: true }),
    );
  };
  child.once("exit", onExit);
  child.once("error", onError);
  signals.once("SIGINT", onSignal);
  signals.once("SIGTERM", onSignal);

  try {
    const result = await outcome;
    const errors = result.error ? [result.error] : [];
    let stopped = result.exited === true;
    if (!stopped && !result.stopFailed) {
      try {
        await (stopPromise ?? stopNativeSmokeServer(child, timeoutMs));
        stopped = true;
      } catch (error) {
        errors.push(error);
      }
    }
    if (stopped) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error);
      }
    } else if (child.pid) {
      // Preserve the fixture when the process cannot be confirmed stopped, but
      // do not keep this wrapper alive indefinitely waiting on that process.
      try {
        child.unref();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1)
      throw new AggregateError(errors, "Website API test or cleanup failed");
    return stopping && result.code === null && result.signal === "SIGTERM"
      ? 0
      : (result.code ?? 1);
  } finally {
    child.removeListener("exit", onExit);
    child.removeListener("error", onError);
    signals.removeListener("SIGINT", onSignal);
    signals.removeListener("SIGTERM", onSignal);
  }
}

async function main() {
  const repository = fileURLToPath(new URL("../", import.meta.url));
  const temporaryParent = path.resolve(tmpdir());
  const directory = await mkdtemp(
    path.join(temporaryParent, "kernel-website-e2e-"),
  );
  const apiOrigin = "http://127.0.0.1:3100";
  const websiteOrigin = "http://127.0.0.1:3101";
  const environment = {
    BETTER_AUTH_SECRET:
      "website-e2e-synthetic-secret-at-least-thirty-two-characters",
    BETTER_AUTH_URL: apiOrigin,
    DATABASE_URL: pathToFileURL(path.join(directory, "test.sqlite")).href,
    HOST: "127.0.0.1",
    LOCAL_STORAGE_PATH: path.join(directory, "uploads"),
    LOG_LEVEL: "warn",
    NODE_ENV: "test",
    NODE_V8_COVERAGE: undefined,
    OTP_FIXED_CODE: "123456",
    PATH: process.env.PATH ?? "",
    PORT: "3100",
    SERVER_ALLOWED_ORIGIN: websiteOrigin,
    SERVER_ALLOWED_ORIGINS: websiteOrigin,
    SERVER_ENVIRONMENT: "website-e2e",
    SERVER_RELEASE_ID: "website-e2e",
    SERVER_SEED_DEVELOPMENT_DATA: "true",
    STORAGE_DRIVER: "local",
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    ...(process.env.TEMP ? { TEMP: process.env.TEMP } : {}),
    ...(process.env.TMP ? { TMP: process.env.TMP } : {}),
  };
  const child = spawn(process.execPath, ["src/index.ts"], {
    cwd: repository,
    env: environment,
    stdio: "inherit",
    windowsHide: true,
  });
  const cleanup = async () => {
    const resolved = path.resolve(directory);
    if (
      path.dirname(resolved) !== temporaryParent ||
      !path.basename(resolved).startsWith("kernel-website-e2e-")
    ) {
      throw new Error(
        "Refusing to remove an unexpected website test directory.",
      );
    }
    await rm(resolved, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 100,
    });
  };
  try {
    process.exitCode = await superviseWebsiteApi(child, cleanup);
  } catch (error) {
    throw new Error(
      `The test failed; inspect process ${child.pid ?? "not started"} and fixture ${directory} if still present.`,
      { cause: error },
    );
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    console.error("The isolated website API failed:", error);
    process.exitCode = 1;
  });
}
