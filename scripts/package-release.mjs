import { constants } from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepository = fileURLToPath(new URL("../", import.meta.url));
const runtimeScripts = [
  "scripts/healthcheck.mjs",
  "scripts/validate-deployment-env.mjs",
];
const excludedDirectories = new Set([
  ".git",
  "node_modules",
  "data",
  "uploads",
  "backups",
  "dist",
  "reports",
  ".aws",
  ".ssh",
  ".turbo",
  "__mocks__",
  "__snapshots__",
  "__tests__",
  "coverage",
  "docs",
  "e2e",
  "project-reference",
  "secrets",
  "test",
  "test-results",
  "tests",
]);

export function validateReleaseId(value) {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value) ||
    value.includes("..")
  ) {
    throw new Error(
      "Release ID must contain 1–128 letters, digits, dots, underscores or hyphens, start with a letter/digit and contain no '..'.",
    );
  }
  return value;
}

export function parseReleaseArguments(args) {
  let releaseId;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    const value = argument.startsWith("--release=")
      ? argument.slice("--release=".length)
      : argument === "--release"
        ? args[++index]
        : undefined;
    if (value === undefined || releaseId !== undefined) {
      throw new Error("Usage: node scripts/package-release.mjs --release=ID");
    }
    releaseId = validateReleaseId(value);
  }
  if (!releaseId)
    throw new Error("Usage: node scripts/package-release.mjs --release=ID");
  return releaseId;
}

const isInside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return (
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
};

function excluded(file) {
  const segments = file.split(/[\\/]/);
  const name = segments.at(-1);
  return (
    segments.some(
      (segment) =>
        segment.toLowerCase().startsWith(".env") ||
        excludedDirectories.has(segment),
    ) ||
    /\.(?:test|spec|stories)\.[^.]+$/i.test(name) ||
    /\.snap$/i.test(name) ||
    /\.(?:sqlite(?:3)?|db)(?:-(?:wal|shm|journal))?$/i.test(name) ||
    /\.(?:pem|key|p12|pfx)$/i.test(name) ||
    /^(?:id_rsa|id_ed25519|credentials(?:\.json)?|\.npmrc|\.netrc|\.pypirc)$/i.test(
      name,
    ) ||
    /(?:^|[\\/])\.next[\\/]cache(?:[\\/]|$)/.test(file)
  );
}

async function copyTree(
  source,
  destination,
  sourceRoot,
  ancestors = new Set(),
) {
  if (excluded(path.relative(sourceRoot, source))) return;
  const resolved = await realpath(source);
  if (!isInside(sourceRoot, resolved))
    throw new Error(`Cannot package a link outside its source tree: ${source}`);
  if (excluded(path.relative(sourceRoot, resolved))) return;
  const info = await lstat(resolved);
  if (info.isDirectory()) {
    if (ancestors.has(resolved))
      throw new Error(`Cannot package a circular directory link: ${source}`);
    const nested = new Set(ancestors).add(resolved);
    await mkdir(destination, { recursive: true });
    for (const name of (await readdir(resolved)).sort())
      await copyTree(
        path.join(resolved, name),
        path.join(destination, name),
        sourceRoot,
        nested,
      );
  } else if (info.isFile()) {
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(resolved, destination, constants.COPYFILE_EXCL);
  } else {
    throw new Error(`Unsupported release file: ${source}`);
  }
}

async function requiredFile(file) {
  const info = await lstat(file);
  if (!info.isFile())
    throw new Error(`Required build file is missing: ${file}`);
}

async function createOutputRoot(repository) {
  let directory = repository;
  for (const segment of ["dist", "releases"]) {
    directory = path.join(directory, segment);
    try {
      await mkdir(directory);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    if (!isInside(repository, await realpath(directory)))
      throw new Error("Release output must remain inside the repository.");
  }
}

export async function packageRelease({
  repositoryRoot = defaultRepository,
  releaseId,
}) {
  validateReleaseId(releaseId);
  const repository = await realpath(repositoryRoot);
  const output = path.join(repository, "dist", "releases", releaseId);
  await Promise.all([
    ...[
      "package.json",
      "package-lock.json",
      ...runtimeScripts,
      "src/index.ts",
    ].map((file) => requiredFile(path.join(repository, file))),
    access(path.join(repository, "drizzle")),
  ]);
  const manifest = JSON.parse(
    await readFile(path.join(repository, "package.json"), "utf8"),
  );
  const lock = JSON.parse(
    await readFile(path.join(repository, "package-lock.json"), "utf8"),
  );
  if (
    manifest.name !== "kernel-api" ||
    manifest.workspaces !== undefined ||
    lock.packages?.[""]?.name !== "kernel-api" ||
    Object.values(lock.packages ?? {}).some((entry) => entry.link) ||
    Object.keys(lock.packages ?? {}).some((entry) =>
      /^(?:apps|packages)\//.test(entry),
    )
  )
    throw new Error(
      "Release requires the standalone API manifest and root lock entry without local package links.",
    );
  const runtimeTrees = await Promise.all(
    ["src", "drizzle"].map(async (directory) => {
      const resolved = await realpath(path.join(repository, directory));
      if (!isInside(repository, resolved))
        throw new Error(
          `Runtime source must remain inside the repository: ${directory}`,
        );
      return { directory, resolved };
    }),
  );
  await createOutputRoot(repository);
  await mkdir(output);
  const api = path.join(output, "api");
  for (const file of ["package.json", "package-lock.json"]) {
    await mkdir(path.dirname(path.join(api, file)), { recursive: true });
    await copyFile(
      path.join(repository, file),
      path.join(api, file),
      constants.COPYFILE_EXCL,
    );
  }
  for (const { directory, resolved } of runtimeTrees) {
    const from = path.join(repository, directory);
    await copyTree(from, path.join(api, directory), resolved);
  }
  for (const file of runtimeScripts) {
    await mkdir(path.dirname(path.join(api, file)), { recursive: true });
    await copyFile(
      path.join(repository, file),
      path.join(api, file),
      constants.COPYFILE_EXCL,
    );
  }
  const release = {
    schemaVersion: 1,
    application: "kernel-api",
    releaseId,
    createdAt: new Date().toISOString(),
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    entrypoints: {
      api: "api/src/index.ts",
      bootstrap: "api/src/bootstrap-admin.ts",
    },
    apiDependenciesInstalled: false,
  };
  await writeFile(
    path.join(output, "release.json"),
    `${JSON.stringify(release, null, 2)}\n`,
    { flag: "wx" },
  );
  return { directory: output, release };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await packageRelease({
      releaseId: parseReleaseArguments(process.argv.slice(2)),
    });
    console.log(
      `Packaged ${result.release.releaseId} for ${result.release.platform}/${result.release.arch}: ${result.directory}`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Release packaging failed.",
    );
    process.exitCode = 1;
  }
}
