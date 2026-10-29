export async function stopNativeSmokeServer(server, timeoutMs = 10_000) {
  if (!server?.pid || server.exitCode !== null || server.signalCode !== null)
    return;

  await new Promise((resolve, reject) => {
    let timer;
    const finish = (error) => {
      clearTimeout(timer);
      server.removeListener("exit", onExit);
      server.removeListener("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onExit = () => finish();
    const onError = (error) => finish(error);
    server.once("exit", onExit);
    server.once("error", onError);
    timer = setTimeout(
      () =>
        finish(new Error("Native smoke server did not exit after SIGTERM.")),
      timeoutMs,
    );

    try {
      if (server.exitCode !== null || server.signalCode !== null) finish();
      else if (!server.kill("SIGTERM"))
        finish(new Error("Could not signal native smoke server."));
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
    for (const cleanup of [removeRelease, removeState]) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      "Native smoke operation or cleanup failed",
    );
}
