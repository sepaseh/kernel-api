/** Owns only one disposable smoke builder, exact image tags and its fixtures. */
export async function withSmokeResources(
  { builder, images, containers = [], signal, run, down, removeDirectory },
  verify,
) {
  if (!/^kernel-api-smoke-[a-f\d]{12}-builder$/.test(builder))
    throw new Error("Unexpected API smoke builder name.");
  if (
    images.length !== 2 ||
    images.some(
      (image) =>
        !/^kernel-api-smoke\/(?:api|gateway):smoke-[a-f\d]{16}$/.test(image),
    ) ||
    new Set(images).size !== images.length
  )
    throw new Error("Unexpected API smoke image tags.");
  if (
    containers.some(
      (name) => !/^kernel-api-smoke-[a-f\d]{12}-certificates$/.test(name),
    )
  )
    throw new Error("Unexpected API smoke container name.");

  let result;
  let armed = false;
  const errors = [];
  const attempt = async (operation) => {
    try {
      await operation();
    } catch (error) {
      errors.push(error);
    }
  };
  const list = async (args) =>
    (
      await run(args, {
        capture: true,
        cleanup: true,
      })
    )
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\*$/, ""));
  const builderExists = async () => {
    // Listing every Buildx instance may probe an unrelated remote endpoint.
    // Inspect only the generated name and distinguish absence from tool failure.
    const result = await run(["buildx", "inspect", builder], {
      capture: true,
      allowFailure: true,
      cleanup: true,
    });
    if (result.code === 0) return true;
    if (
      result.code === 1 &&
      !result.stdout.trim() &&
      new RegExp(
        String.raw`^(?:ERROR:\s*)?no builder ["']?${builder}["']? found[.!]?$`,
        "i",
      ).test(result.stderr.trim())
    )
      return false;
    throw new Error(
      `Cannot inspect API smoke builder: ${result.stderr.trim() || result.stdout.trim() || "Docker returned no diagnostic."}`,
    );
  };
  try {
    if (await builderExists())
      throw new Error("The API smoke builder name is already in use.");
    const existingImages = await list([
      "image",
      "ls",
      "--format",
      "{{.Repository}}:{{.Tag}}",
    ]);
    if (images.some((image) => existingImages.includes(image)))
      throw new Error("An API smoke image tag is already in use.");
    const existingContainers = await list([
      "container",
      "ls",
      "--all",
      "--format",
      "{{.Names}}",
    ]);
    if (containers.some((name) => existingContainers.includes(name)))
      throw new Error("An API smoke container name is already in use.");
    // Arm only after rejecting preexisting resources, but before create so a
    // partially failed builder creation is still cleaned.
    armed = true;
    await run([
      "buildx",
      "create",
      "--name",
      builder,
      "--driver",
      "docker-container",
      "--driver-opt",
      "default-load=true",
    ]);
    result = await verify();
  } catch (error) {
    errors.push(error);
  } finally {
    // A failed build/start may still have created resources. Every cleanup runs
    // even when another cleanup failed, and failures cannot become a green test.
    if (armed) {
      await attempt(down);
      await attempt(async () => {
        const present = await list([
          "container",
          "ls",
          "--all",
          "--format",
          "{{.Names}}",
        ]);
        await Promise.all(
          containers
            .filter((name) => present.includes(name))
            .map((name) =>
              attempt(() =>
                run(["container", "rm", "--force", name], { cleanup: true }),
              ),
            ),
        );
      });
      // Quiesce a cancelled exporter before taking the final image inventory;
      // otherwise its last loaded tag could arrive after image cleanup.
      await attempt(async () => {
        if (await builderExists())
          await run(["buildx", "rm", "--force", builder], { cleanup: true });
      });
      await attempt(async () => {
        const present = await list([
          "image",
          "ls",
          "--format",
          "{{.Repository}}:{{.Tag}}",
        ]);
        await Promise.all(
          images
            .filter((image) => present.includes(image))
            .map((image) =>
              attempt(() => run(["image", "rm", image], { cleanup: true })),
            ),
        );
      });
    }
    await attempt(removeDirectory);
  }
  if (
    signal?.aborted &&
    !errors.some(
      (error) => error === signal.reason || error?.name === "AbortError",
    )
  )
    errors.unshift(signal.reason);
  if (errors.length === 1) throw errors[0];
  if (errors.length)
    throw new AggregateError(errors, "API smoke or resource cleanup failed.");
  return result;
}

export function smokeInterruption(events = process) {
  const controller = new AbortController();
  const interrupt = (signal) =>
    controller.abort(new Error(`API Docker smoke interrupted by ${signal}.`));
  const onInterrupt = () => interrupt("SIGINT");
  const onTerminate = () => interrupt("SIGTERM");
  events.on("SIGINT", onInterrupt);
  events.on("SIGTERM", onTerminate);
  return {
    signal: controller.signal,
    dispose() {
      events.off("SIGINT", onInterrupt);
      events.off("SIGTERM", onTerminate);
    },
  };
}
