import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { packageRelease, parseReleaseArguments } from "./package-release.mjs";
import { fixture } from "./package-release.test-support.mjs";
async function inventory(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(path.join(directory, prefix), {
    withFileTypes: true,
  })) {
    const relative = path.posix.join(prefix, entry.name);
    files.push(relative);
    if (entry.isDirectory())
      files.push(...(await inventory(directory, relative)));
  }
  return files;
}
test("release arguments reject traversal, missing IDs and ambiguous options", () => {
  assert.equal(parseReleaseArguments(["--release", "release-1"]), "release-1");
  assert.equal(parseReleaseArguments(["--release=release_1"]), "release_1");
  for (const args of [
    [],
    ["--release"],
    ["--release=../escape"],
    ["--release=/absolute"],
    ["--release=a\\b"],
    ["--release=a..b"],
    ["--release=a", "--release=b"],
    ["--other=x"],
  ])
    assert.throws(() => parseReleaseArguments(args));
});
test("packages a self-contained API source release and excludes credentials, state, tests and dependencies", async (context) => {
  const { repository, put } = await fixture(context);
  for (const file of [
    ".env.local",
    "server/data/kernel.sqlite",
    "src/.ENV.PRODUCTION",
    "src/private.key",
    "src/id_rsa",
    "src/test/fixture.ts",
    "src/node_modules/private.js",
    "src/infrastructure/localization/catalogs.test.ts",
  ])
    await put(file);
  const { directory, release } = await packageRelease({
    repositoryRoot: repository,
    releaseId: "fixture-1",
  });
  assert.equal(release.application, "kernel-api");
  assert.equal(release.platform, process.platform);
  assert.equal(release.arch, process.arch);
  assert.equal(release.apiDependenciesInstalled, false);
  for (const file of [
    "api/package.json",
    "api/package-lock.json",
    "api/src/index.ts",
    "api/src/bootstrap-admin.ts",
    "api/drizzle/meta/_journal.json",
    "api/src/contracts/account.ts",
    "api/src/contracts/permissions.ts",
    "api/src/contracts/settings.ts",
    "api/src/contracts/locales.ts",
    "api/src/infrastructure/localization/catalogs/index.ts",
    "api/scripts/healthcheck.mjs",
    "api/scripts/validate-deployment-env.mjs",
    "release.json",
  ])
    await access(path.join(directory, file));
  const files = await inventory(directory);
  assert.ok(
    !files.some((file) =>
      /\.env|\.sqlite|\.key$|id_rsa|node_modules|\.test\.|(?:^|\/)test\//i.test(
        file,
      ),
    ),
  );
  assert.deepEqual(
    JSON.parse(await readFile(path.join(directory, "release.json"), "utf8")),
    release,
  );
  assert.equal(
    await readFile(path.join(directory, "api/package-lock.json"), "utf8"),
    await readFile(path.join(repository, "package-lock.json"), "utf8"),
  );
});
test("an immutable release is never overwritten", async (context) => {
  const { repository } = await fixture(context);
  const options = { repositoryRoot: repository, releaseId: "immutable" };
  const { directory } = await packageRelease(options);
  const before = await readFile(path.join(directory, "release.json"), "utf8");
  await assert.rejects(packageRelease(options), { code: "EEXIST" });
  assert.equal(
    await readFile(path.join(directory, "release.json"), "utf8"),
    before,
  );
});
test("missing root lock entries fail before release directories are created", async (context) => {
  const { repository, put } = await fixture(context);
  await put("package-lock.json", '{"packages":{}}');
  await assert.rejects(
    packageRelease({ repositoryRoot: repository, releaseId: "invalid" }),
    /standalone API manifest/,
  );
  await assert.rejects(access(path.join(repository, "dist")));
});

test("missing bootstrap entrypoint fails before release directories are created", async (context) => {
  const { repository } = await fixture(context);
  const entrypoint = path.join(repository, "src", "bootstrap-admin.ts");
  await unlink(entrypoint);

  await assert.rejects(
    packageRelease({ repositoryRoot: repository, releaseId: "no-bootstrap" }),
    { code: "ENOENT", path: entrypoint },
  );
  await assert.rejects(access(path.join(repository, "dist")), {
    code: "ENOENT",
  });
});

test("the release CLI rejects escaping source links and removes only its partial output", async (context) => {
  const { repository, temporary } = await fixture(context);
  const outside = path.join(temporary, "operator-state");
  const sourceLink = path.join(repository, "src", "escape");
  const outsideFile = path.join(outside, "sensitive.txt");
  await mkdir(outside);
  await writeFile(outsideFile, "synthetic operator state");
  try {
    await symlink(
      outside,
      sourceLink,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (error.code === "EPERM")
      return context.skip("Directory-link creation unavailable.");
    throw error;
  }

  const command = path.join(repository, "scripts", "package-release.mjs");
  await copyFile(new URL("./package-release.mjs", import.meta.url), command);
  const run = () =>
    spawnSync(process.execPath, [command, "--release=escape"], {
      cwd: repository,
      encoding: "utf8",
    });
  const output = path.join(repository, "dist", "releases", "escape");
  const failed = run();
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /outside its source tree/);
  await assert.rejects(access(output), { code: "ENOENT" });
  assert.equal(await readFile(outsideFile, "utf8"), "synthetic operator state");

  await unlink(sourceLink);
  const retried = run();
  assert.equal(retried.status, 0, retried.stderr);
  const manifest = path.join(output, "release.json");
  const before = await readFile(manifest, "utf8");
  const collision = run();
  assert.equal(collision.status, 1, collision.stderr);
  assert.match(collision.stderr, /EEXIST/);
  assert.equal(await readFile(manifest, "utf8"), before);
});
test("internal runtime directory links become self-contained directories", async (context) => {
  const { repository, put } = await fixture(context);
  const moduleSource = "export const value = 42;\n";
  await put("src/shared/module.ts", moduleSource);
  try {
    await symlink(
      path.join(repository, "src/shared"),
      path.join(repository, "src/link"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (error.code === "EPERM")
      return context.skip("Directory-link creation unavailable.");
    throw error;
  }
  const { directory } = await packageRelease({
    repositoryRoot: repository,
    releaseId: "internal",
  });
  const packagedLink = path.join(directory, "api/src/link");
  const packagedInfo = await lstat(packagedLink);
  assert.ok(packagedInfo.isDirectory());
  assert.equal(packagedInfo.isSymbolicLink(), false);
  await put("src/shared/module.ts", "export const value = 99;\n");
  assert.equal(
    await readFile(path.join(packagedLink, "module.ts"), "utf8"),
    moduleSource,
  );
});
test("top-level runtime source junctions cannot reset the repository trust boundary", async (context) => {
  for (const directory of ["src", "drizzle"]) {
    const { repository, temporary } = await fixture(context);
    const source = path.join(repository, directory);
    const outside = path.join(temporary, "outside-runtime");
    // Copy only the synthetic fixture before replacing its directory with a junction.
    const { cp } = await import("node:fs/promises");
    await cp(source, outside, { recursive: true });
    await rm(source, { recursive: true });
    try {
      await symlink(
        outside,
        source,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if (error.code === "EPERM")
        return context.skip("Directory-link creation unavailable.");
      throw error;
    }
    await assert.rejects(
      packageRelease({
        repositoryRoot: repository,
        releaseId: "top-level-escape",
      }),
      /inside the repository/,
    );
    await assert.rejects(access(path.join(repository, "dist")));
  }
});
test("release output junctions cannot escape the destination repository", async (context) => {
  const { repository, temporary } = await fixture(context);
  const outside = path.join(temporary, "unrelated");
  await mkdir(outside);
  try {
    await symlink(
      outside,
      path.join(repository, "dist"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (error.code === "EPERM")
      return context.skip("Directory-link creation unavailable.");
    throw error;
  }
  await assert.rejects(
    packageRelease({ repositoryRoot: repository, releaseId: "escape" }),
    /inside the repository/,
  );
  assert.deepEqual(await readdir(outside), []);
});
