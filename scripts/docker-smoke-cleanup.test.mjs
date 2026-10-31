import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import {
  smokeInterruption,
  withSmokeResources,
} from "./docker-smoke-cleanup.mjs";

const builder = "kernel-api-smoke-0123456789ab-builder";
const images = [
  "kernel-api-smoke/api:smoke-0123456789abcdef",
  "kernel-api-smoke/gateway:smoke-0123456789abcdef",
];
const certificateContainer = "kernel-api-smoke-0123456789ab-certificates";
function fixture({
  failedImage,
  directoryError,
  createError,
  downError,
  lateExportOnBuilderRemoval = false,
} = {}) {
  const state = {
    builders: new Set(["unrelated-builder"]),
    images: new Set(["unrelated-image:keep"]),
    volumes: new Set(["unrelated-data"]),
    containers: new Set(["unrelated-server"]),
    directory: true,
  };
  const resources = {
    builder,
    images,
    containers: [certificateContainer],
    async run(args) {
      if (args[0] === "buildx" && args[1] === "create") {
        state.builders.add(builder);
        if (createError) throw createError;
        return 0;
      }
      if (args[0] === "buildx" && args[1] === "inspect")
        return state.builders.has(args[2])
          ? { code: 0, stdout: `Name: ${args[2]}\n`, stderr: "" }
          : {
              code: 1,
              stdout: "",
              stderr: `ERROR: no builder "${args[2]}" found\n`,
            };
      if (args[0] === "buildx" && args[1] === "rm") {
        if (lateExportOnBuilderRemoval) state.images.add(images[0]);
        state.builders.delete(args.at(-1));
        return 0;
      }
      if (args[0] === "image" && args[1] === "ls")
        return [...state.images].join("\n");
      if (args[0] === "container" && args[1] === "ls")
        return [...state.containers].join("\n");
      if (args[0] === "container" && args[1] === "rm") {
        state.containers.delete(args.at(-1));
        return 0;
      }
      if (args[0] === "image" && args[1] === "rm") {
        if (args[2] === failedImage) throw new Error("Image is still in use.");
        state.images.delete(args[2]);
        return 0;
      }
      throw new Error("Unexpected fake Docker operation.");
    },
    async down() {
      if (downError) throw downError;
      state.containers.delete("own-api");
      state.volumes.delete("own-data");
    },
    async removeDirectory() {
      if (directoryError) throw directoryError;
      state.directory = false;
    },
  };
  const build = () => {
    images.forEach((image) => state.images.add(image));
    state.containers.add("own-api");
    state.containers.add(certificateContainer);
    state.volumes.add("own-data");
  };
  return { state, resources, build };
}

for (const failure of [false, true])
  test(`smoke resources are removed after ${failure ? "partial build failure" : "success"}, preserving unrelated resources`, async () => {
    const { state, resources, build } = fixture();
    const problem = new Error("Synthetic build failed after producing output.");
    const result = withSmokeResources(resources, async () => {
      build();
      if (failure) throw problem;
      return "verified";
    });
    if (failure) await assert.rejects(result, (error) => error === problem);
    else assert.equal(await result, "verified");
    assert.deepEqual([...state.builders], ["unrelated-builder"]);
    assert.deepEqual([...state.images], ["unrelated-image:keep"]);
    assert.deepEqual([...state.volumes], ["unrelated-data"]);
    assert.deepEqual([...state.containers], ["unrelated-server"]);
    assert.equal(state.directory, false);
  });

test("the final tag from a cancelled exporter is removed after builder shutdown", async () => {
  const { state, resources, build } = fixture({
    lateExportOnBuilderRemoval: true,
  });
  const problem = new Error(
    "Synthetic cancellation while an image export was pending.",
  );
  await assert.rejects(
    withSmokeResources(resources, async () => {
      build();
      throw problem;
    }),
    (error) => error === problem,
  );
  assert.deepEqual([...state.images], ["unrelated-image:keep"]);
  assert.deepEqual([...state.builders], ["unrelated-builder"]);
  assert.equal(state.directory, false);
});

test("a signal received during cleanup cannot turn cancellation into success", async () => {
  const events = new EventEmitter();
  const interruption = smokeInterruption(events);
  const { state, resources, build } = fixture();
  const down = resources.down;
  resources.signal = interruption.signal;
  resources.down = async () => {
    await down();
    events.emit("SIGTERM");
  };
  try {
    await assert.rejects(
      withSmokeResources(resources, async () => build()),
      /SIGTERM/,
    );
    assert.equal(state.directory, false);
    assert.equal(state.builders.has(builder), false);
    assert.equal(state.images.has(images[0]), false);
  } finally {
    interruption.dispose();
  }
});

test("cleanup continues after removal failures and cannot report success", async () => {
  const directoryError = new Error("Synthetic TEMP cleanup failed.");
  const { state, resources, build } = fixture({
    failedImage: images[0],
    directoryError,
  });
  const verificationError = new Error("Synthetic assertion failed.");
  await assert.rejects(
    withSmokeResources(resources, async () => {
      build();
      throw verificationError;
    }),
    (error) =>
      error instanceof AggregateError &&
      error.errors.length === 3 &&
      error.errors.includes(verificationError) &&
      error.errors.includes(directoryError),
  );
  assert.equal(state.images.has(images[0]), true);
  assert.equal(state.images.has(images[1]), false);
  assert.equal(state.builders.has(builder), false);
  assert.equal(state.volumes.has("own-data"), false);
});

test("partially failed builder creation removes its state without running verification", async () => {
  const problem = new Error("Synthetic builder create failed after setup.");
  const { resources, state } = fixture({ createError: problem });
  await assert.rejects(
    withSmokeResources(resources, () =>
      assert.fail("Verification must not run"),
    ),
    (error) => error === problem,
  );
  assert.deepEqual([...state.builders], ["unrelated-builder"]);
  assert.equal(state.directory, false);
});

for (const diagnostic of [
  "Cannot connect to Docker engine.",
  'ERROR: no builder "unrelated-builder" found',
  "",
])
  test(`builder inspection failure is not mistaken for absence: ${diagnostic || "empty diagnostic"}`, async () => {
    const { resources, state } = fixture();
    const run = resources.run;
    resources.run = async (args) =>
      args[0] === "buildx" && args[1] === "inspect"
        ? { code: 1, stdout: "", stderr: diagnostic }
        : run(args);
    await assert.rejects(
      withSmokeResources(resources, () =>
        assert.fail("Verification must not run"),
      ),
      /Cannot inspect API smoke builder/,
    );
    assert.deepEqual([...state.builders], ["unrelated-builder"]);
    assert.equal(state.directory, false);
  });

for (const collision of ["builder", "image", "container"])
  test(`a preexisting ${collision} collision is preserved and never becomes smoke-owned`, async () => {
    const { resources, state } = fixture();
    const present =
      collision === "builder"
        ? state.builders
        : collision === "image"
          ? state.images
          : state.containers;
    const name =
      collision === "builder"
        ? builder
        : collision === "image"
          ? images[0]
          : certificateContainer;
    present.add(name);
    let downCalls = 0;
    resources.down = async () => downCalls++;
    await assert.rejects(
      withSmokeResources(resources, () =>
        assert.fail("Verification must not run"),
      ),
      /already in use/,
    );
    assert.equal(present.has(name), true);
    assert.equal(downCalls, 0);
    assert.equal(state.directory, false);
  });

test("Compose cleanup failure still removes independent helper container, images and builder cache", async () => {
  const problem = new Error("Synthetic Compose shutdown failed.");
  const { resources, state, build } = fixture({ downError: problem });
  await assert.rejects(
    withSmokeResources(resources, async () => build()),
    (error) => error === problem,
  );
  assert.equal(state.containers.has(certificateContainer), false);
  assert.equal(state.images.has(images[0]), false);
  assert.equal(state.builders.has(builder), false);
  assert.equal(state.directory, false);
});

for (const signal of ["SIGINT", "SIGTERM"])
  test(`${signal} cancellation still reaches owned-resource cleanup`, async () => {
    const events = new EventEmitter();
    const interruption = smokeInterruption(events);
    const { state, resources, build } = fixture();
    resources.signal = interruption.signal;
    try {
      await assert.rejects(
        withSmokeResources(resources, async () => {
          build();
          const cancelled = new Promise((_, reject) =>
            interruption.signal.addEventListener("abort", () =>
              reject(interruption.signal.reason),
            ),
          );
          events.emit(signal);
          await cancelled;
        }),
        new RegExp(signal),
      );
      assert.equal(state.builders.has(builder), false);
      assert.equal(state.images.has(images[0]), false);
      assert.equal(state.directory, false);
    } finally {
      interruption.dispose();
    }
    assert.equal(events.listenerCount("SIGINT"), 0);
    assert.equal(events.listenerCount("SIGTERM"), 0);
  });
