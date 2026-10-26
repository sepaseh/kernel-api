import type { AppLogger } from "./logging/logger.ts";

export const flushAndExit = (logger: AppLogger, code: number) => {
  process.exitCode = code;
  const deadline = setTimeout(() => process.exit(code), 1_000);
  deadline.unref();
  try {
    logger.flush(() => process.exit(code));
  } catch {
    process.exit(code);
  }
};

export const installFatalErrorHandlers = (logger: AppLogger) => {
  let terminating = false;
  const terminate = (error: unknown, source: string) => {
    if (terminating) return;
    terminating = true;
    try {
      logger.fatal(
        {
          err: error instanceof Error ? error : new Error("Non-Error failure"),
          event: "server.crashed",
          source,
        },
        "Process failed",
      );
    } catch {
      // Failed diagnostics must not emit raw exception text or prevent termination.
    }
    flushAndExit(logger, 1);
  };
  process.once("uncaughtException", (error) =>
    terminate(error, "uncaughtException"),
  );
  process.once("unhandledRejection", (error: unknown) =>
    terminate(error, "unhandledRejection"),
  );
};
