import { createInterface } from "node:readline";

export async function waitForNativeSmokeReady(server, { signal } = {}) {
  await new Promise((resolve, reject) => {
    const lines = createInterface({ input: server.stdout });
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      lines.removeListener("line", onLine);
      lines.removeListener("error", onError);
      lines.removeListener("close", onOutputEnd);
      lines.close();
      server.removeListener("exit", onExit);
      server.removeListener("error", onError);
      server.stdout.removeListener("error", onError);
      server.stdout.removeListener("end", onOutputEnd);
      server.stdout.removeListener("close", onOutputEnd);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onLine = (line) => {
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        return;
      }
      if (record?.event === "server.started") finish();
    };
    const onExit = () =>
      finish(new Error("Native release API exited before readiness."));
    const onOutputEnd = () =>
      finish(new Error("Native release output ended before readiness."));
    const onError = (error) => finish(error);
    const onAbort = () => finish(signal.reason);
    lines.on("line", onLine);
    lines.once("error", onError);
    lines.once("close", onOutputEnd);
    server.once("exit", onExit);
    server.once("error", onError);
    server.stdout.once("error", onError);
    server.stdout.once("end", onOutputEnd);
    server.stdout.once("close", onOutputEnd);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    else if (server.stdout.readableEnded || server.stdout.closed) onOutputEnd();
    else if (server.exitCode !== null || server.signalCode !== null) onExit();
  });
}

export async function stopNativeSmokeServer(server, { signal } = {}) {
  const exited = () => server.exitCode !== null || server.signalCode !== null;
  const openStreams = () =>
    server.stdio?.some((stream) => stream && !stream.closed);
  if (!server?.pid || (exited() && !openStreams())) return;

  await new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", onAbort);
      server.removeListener("close", onClose);
      server.removeListener("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onClose = () => finish();
    const onError = (error) => finish(error);
    const onAbort = () =>
      finish(
        new Error(
          "Native smoke server did not exit after SIGTERM before cancellation.",
          {
            cause: signal.reason,
          },
        ),
      );
    server.once("close", onClose);
    server.once("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      if (exited()) {
        if (!openStreams()) finish();
      } else if (!server.kill("SIGTERM"))
        finish(new Error("Could not signal native smoke server."));
      if (signal?.aborted) onAbort();
    } catch (error) {
      finish(error);
    }
  });
}

export async function finishNativeSmoke(
  operationErrors,
  stopServer,
  removeRelease,
  removeState,
) {
  const errors = [...operationErrors];
  let stopped = false;
  try {
    await stopServer();
    stopped = true;
  } catch (error) {
    errors.push(error);
  }
  if (stopped) {
    const results = await Promise.allSettled([
      Promise.resolve().then(removeRelease),
      Promise.resolve().then(removeState),
    ]);
    for (const result of results) {
      if (result.status === "rejected") errors.push(result.reason);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      "Native smoke operation or cleanup failed",
    );
}
