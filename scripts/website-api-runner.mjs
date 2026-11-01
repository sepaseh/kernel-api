import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { stopNativeSmokeServer } from "./native-smoke-cleanup.mjs";

async function forceStopWebsiteChild(child, { signal } = {}) {
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  const openStreams = () =>
    child.stdio?.some((stream) => stream && !stream.closed);
  if (exited() && !openStreams()) return;

  await new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", onAbort);
      child.removeListener("close", onClose);
      child.removeListener("error", onError);
      if (error) {
        // The process may report another error after cancellation. Keep an
        // error listener until it exits so that error is visible, not uncaught.
        const onLateError = (lateError) => {
          process.stderr.write(
            `Website API child error after stop: ${lateError}\n`,
          );
        };
        child.on("error", onLateError);
        child.once("close", () => child.removeListener("error", onLateError));
        reject(error);
      } else resolve();
    };
    const onClose = () => finish();
    const onError = (error) => finish(error);
    const onAbort = () =>
      finish(
        new Error(
          "Website API child did not exit after SIGKILL before cancellation.",
          {
            cause: signal.reason,
          },
        ),
      );
    child.once("close", onClose);
    child.once("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      if (exited()) {
        if (!openStreams()) finish();
      } else if (!child.kill("SIGKILL"))
        finish(new Error("Could not force-stop the website API child."));
      if (signal?.aborted) onAbort();
    } catch (error) {
      finish(error);
    }
  });
}

async function releaseUnconfirmedChild(child, signal) {
  const errors = [];
  try {
    await forceStopWebsiteChild(child, { signal });
  } catch (error) {
    errors.push(error);
  }
  try {
    child.unref();
  } catch (error) {
    errors.push(error);
  }
  return errors;
}

export async function superviseWebsiteApi(
  child,
  cleanup,
  { signals = process, signal } = {},
) {
  const gracefulStop = new AbortController();
  const forcedStop = new AbortController();
  let stopping = false;
  let stopPromise;
  let settle;
  const outcome = new Promise((resolve) => {
    settle = resolve;
  });
  const onClose = (code, signal) => settle({ code, signal, exited: true });
  const onError = (error) => settle({ error });
  const onSignal = () => {
    if (stopping) {
      if (!gracefulStop.signal.aborted) gracefulStop.abort();
      else forcedStop.abort();
      return;
    }
    stopping = true;
    stopPromise = stopNativeSmokeServer(child, { signal: gracefulStop.signal });
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
  const onAbort = () => {
    if (!stopping) onSignal();
    gracefulStop.abort(signal.reason);
  };
  child.once("close", onClose);
  child.once("error", onError);
  signals.on("SIGINT", onSignal);
  signals.on("SIGTERM", onSignal);
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();

  try {
    const result = await outcome;
    const errors = result.error ? [result.error] : [];
    let stopped = result.exited === true;
    if (!stopped && !result.stopFailed) {
      try {
        await (stopPromise ??
          stopNativeSmokeServer(child, { signal: gracefulStop.signal }));
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
      // Attempt to stop only the child we started. A successful signal does not
      // confirm exit, so preserve the fixture and report the original failure.
      errors.push(...(await releaseUnconfirmedChild(child, forcedStop.signal)));
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1)
      throw new AggregateError(errors, "Website API test or cleanup failed");
    return stopping && result.code === null && result.signal === "SIGTERM"
      ? 0
      : (result.code ?? 1);
  } finally {
    child.removeListener("close", onClose);
    child.removeListener("error", onError);
    signals.removeListener("SIGINT", onSignal);
    signals.removeListener("SIGTERM", onSignal);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function createWebsiteTestEnvironment(directory, parentEnvironment) {
  const apiOrigin = "http://127.0.0.1:3100";
  const websiteOrigin = "http://127.0.0.1:3101";
  return {
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
    PATH: parentEnvironment.PATH ?? "",
    PORT: "3100",
    SERVER_ALLOWED_ORIGIN: websiteOrigin,
    SERVER_ALLOWED_ORIGINS: websiteOrigin,
    SERVER_ENVIRONMENT: "website-e2e",
    SERVER_RELEASE_ID: "website-e2e",
    SERVER_SEED_DEVELOPMENT_DATA: "true",
    STORAGE_DRIVER: "local",
    ...(parentEnvironment.SystemRoot
      ? { SystemRoot: parentEnvironment.SystemRoot }
      : {}),
    TEMP: directory,
    TMP: directory,
  };
}

async function main() {
  const repository = fileURLToPath(new URL("../", import.meta.url));
  const temporaryParent = path.resolve(tmpdir());
  const directory = await mkdtemp(
    path.join(temporaryParent, "kernel-website-e2e-"),
  );
  const environment = createWebsiteTestEnvironment(directory, process.env);
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
      recursive: true,
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
  try {
    await main();
  } catch (error) {
    console.error("The isolated website API failed:", error);
    process.exitCode = 1;
  }
}
