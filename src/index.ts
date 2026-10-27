import { once } from "node:events";

import { serve } from "@hono/node-server";

import { createApp } from "./composition.ts";
import { createAuth } from "./infrastructure/auth/better-auth.ts";
import { loadConfig, loadLoggingConfig } from "./infrastructure/config.ts";
import { createDatabase } from "./infrastructure/db/client.ts";
import { initializeDatabase } from "./infrastructure/db/initialize.ts";
import {
  flushAndExit,
  installFatalErrorHandlers,
} from "./infrastructure/lifecycle.ts";
import { createLogger } from "./infrastructure/logging/logger.ts";
import { createObjectStorage } from "./infrastructure/storage/create.ts";
import { withStorageLogging } from "./infrastructure/storage/operations.ts";

let logger = createLogger({
  environment: "bootstrap",
  level: "info",
  pretty: false,
  release: "unknown",
});
let client: ReturnType<typeof createDatabase>["client"] | undefined;
let server: ReturnType<typeof serve> | undefined;
let stopping = false;
let shutdownPromise: Promise<void> | undefined;

const closeServer = async () => {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) =>
    server?.close((error) => (error ? reject(error) : resolve())),
  );
};

const closeResources = async () => {
  const errors: unknown[] = [];
  try {
    await closeServer();
  } catch (error) {
    errors.push(error);
  }
  try {
    client?.close();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length) throw errors[0];
};

const start = async () => {
  logger = createLogger(loadLoggingConfig());
  installFatalErrorHandlers(logger);
  const config = loadConfig();
  const state: { app?: ReturnType<typeof createApp> } = {};
  server = serve({
    fetch: (request) =>
      state.app
        ? state.app.fetch(request)
        : new Response(null, {
            headers: { "Cache-Control": "no-store" },
            status: 503,
          }),
    hostname: config.host,
    port: config.port,
  });
  await once(server, "listening");
  if (stopping) return;

  const created = createDatabase(config);
  client = created.client;
  const { database } = created;
  const auth = createAuth(config, database, logger);
  const storage = createObjectStorage(config);
  await initializeDatabase(config, database, auth);
  if (stopping) return;
  await withStorageLogging(logger, config.storageDriver, "ensureReady", () =>
    storage.ensureReady(),
  );
  if (stopping) return;

  state.app = createApp({ auth, config, database, logger, storage });
  logger.info(
    { event: "server.started", port: config.port },
    "Kernel API started",
  );
};

const startup = start();
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => {
    logger.error(
      { event: "server.shutdown.failed", reason: "timeout" },
      "Shutdown timed out",
    );
    flushAndExit(logger, 1);
  }, 10_000);
  deadline.unref();
  shutdownPromise = (async () => {
    try {
      await startup;
      await closeResources();
      logger.info({ event: "server.stopped" }, "Kernel API stopped");
    } catch (error) {
      logger.error(
        { err: error, event: "server.shutdown.failed" },
        "Shutdown failed",
      );
      process.exitCode = 1;
      try {
        await closeResources();
      } catch {
        // Preserve the original shutdown failure.
      }
    } finally {
      if (process.exitCode) flushAndExit(logger, 1);
      else logger.flush(() => clearTimeout(deadline));
    }
  })();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

try {
  await startup;
} catch (error) {
  if (stopping) await shutdownPromise;
  else {
    logger.fatal(
      { err: error, event: "server.startup.failed" },
      "Kernel API startup failed",
    );
    try {
      await closeResources();
    } catch (cleanupError) {
      logger.error(
        { err: cleanupError, event: "server.shutdown.failed" },
        "Startup cleanup failed",
      );
    }
    flushAndExit(logger, 1);
  }
}
