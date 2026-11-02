import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
export const actionlintVersion = "1.7.12";
const maximumArchiveBytes = 16 * 1024 * 1024;
const checksums = {
  "linux-x64": {
    name: "actionlint_1.7.12_linux_amd64.tar.gz",
    sha256: "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
    executable: "actionlint",
    extractor: "/usr/bin/tar",
  },
  "win32-x64": {
    name: "actionlint_1.7.12_windows_amd64.zip",
    sha256: "6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9",
    executable: "actionlint.exe",
    extractor: String.raw`C:\Windows\System32\tar.exe`,
  },
};

export const actionlintAsset = (
  platform = process.platform,
  architecture = process.arch,
) => {
  const asset = checksums[`${platform}-${architecture}`];
  if (!asset)
    throw new Error(
      `No reviewed actionlint binary for ${platform}-${architecture}`,
    );
  return {
    ...asset,
    url: `https://github.com/rhysd/actionlint/releases/download/v${actionlintVersion}/${asset.name}`,
  };
};

export const verifyActionlintArchive = (bytes, expected) => {
  if (
    bytes.length === 0 ||
    bytes.length > maximumArchiveBytes ||
    createHash("sha256").update(bytes).digest("hex") !== expected
  )
    throw new Error(
      "actionlint archive failed its pinned SHA-256 verification",
    );
};

const ordinaryDirectory = async (directory, create = false) => {
  if (create) {
    try {
      await mkdir(directory);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("actionlint paths must use ordinary owned directories");
};

const workflowFiles = async (root) => {
  await ordinaryDirectory(root);
  await ordinaryDirectory(path.join(root, ".github"));
  const directory = path.join(root, ".github/workflows");
  await ordinaryDirectory(directory);
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!/\.ya?ml$/i.test(entry.name)) continue;
    if (!entry.isFile() || entry.isSymbolicLink())
      throw new Error("actionlint workflow inputs must be ordinary YAML files");
    files.push(`.github/workflows/${entry.name}`);
  }
  if (!files.length) throw new Error("No actual GitHub workflow files to lint");
  return files.sort((left, right) => left.localeCompare(right, "en"));
};

const cachedArchive = async (filename) => {
  await using file = await open(
    filename,
    constants.O_RDONLY | (constants.O_NONBLOCK ?? 0),
  );
  const info = await file.stat();
  const entry = await lstat(filename);
  if (
    !info.isFile() ||
    !entry.isFile() ||
    entry.isSymbolicLink() ||
    info.dev !== entry.dev ||
    info.ino !== entry.ino
  )
    throw new Error("Cached actionlint archive must be an ordinary file");
  if (info.size > maximumArchiveBytes)
    throw new Error("Cached actionlint archive exceeds its size limit");
  const bytes = await file.readFile();
  return bytes;
};

const downloadArchive = async (response) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maximumArchiveBytes)
      throw new Error("actionlint download exceeds its size limit");

    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
};

const writeNewArchive = async (filename, bytes) => {
  const file = await open(filename, "wx", 0o600);
  let failure;
  try {
    await file.writeFile(bytes);
  } catch (error) {
    failure = error;
  }

  try {
    await file.close();
  } catch (error) {
    failure = failure
      ? new AggregateError(
          [failure, error],
          "archive write and close both failed",
        )
      : error;
  }
  if (!failure) return;

  try {
    await rm(filename, { force: true });
  } catch (error) {
    throw new AggregateError(
      [failure, error],
      "archive write and cleanup both failed",
    );
  }
  throw failure;
};

const archiveBytes = async (filename, asset, request) => {
  let bytes;
  try {
    bytes = await cachedArchive(filename);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (bytes === undefined) {
    const response = await request(asset.url);
    if (!response.ok)
      throw new Error(
        `actionlint download failed with HTTP ${response.status}`,
      );
    bytes = await downloadArchive(response);
    verifyActionlintArchive(bytes, asset.sha256);
    await writeNewArchive(filename, bytes);
  }
  verifyActionlintArchive(bytes, asset.sha256);
  return bytes;
};

export const runActionlint = async ({
  root = repository,
  asset = actionlintAsset(),
  request = fetch,
  execute = spawnSync,
} = {}) => {
  const files = await workflowFiles(root);
  const coverage = path.join(root, "coverage");
  const tools = path.join(coverage, "tools");
  const actionlint = path.join(tools, "actionlint");
  const cache = path.join(actionlint, actionlintVersion);
  await ordinaryDirectory(coverage, true);
  await ordinaryDirectory(tools, true);
  await ordinaryDirectory(actionlint, true);
  await ordinaryDirectory(cache, true);
  const bytes = await archiveBytes(
    path.join(cache, asset.name),
    asset,
    request,
  );
  const scratch = await mkdtemp(path.join(cache, "run-"));
  let failure;
  let status;
  try {
    const archive = path.join(scratch, asset.name);
    await writeFile(archive, bytes);
    const extraction = execute(
      asset.extractor,
      ["-xf", archive, "-C", scratch, asset.executable],
      { cwd: scratch, stdio: "inherit", windowsHide: true },
    );
    if (extraction.error) throw extraction.error;
    if (extraction.status !== 0)
      throw new Error("actionlint archive extraction failed");
    const executable = path.join(scratch, asset.executable);
    const info = await lstat(executable);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error("Extracted actionlint binary must be an ordinary file");
    if (process.platform !== "win32") await chmod(executable, 0o755);
    const result = execute(
      executable,
      ["-shellcheck=", "-pyflakes=", ...files],
      { cwd: root, stdio: "inherit", windowsHide: true },
    );
    if (result.error) throw result.error;
    if (!Number.isInteger(result.status))
      throw new Error("actionlint did not complete successfully");
    status = result.status;
  } catch (error) {
    failure = error;
  }
  try {
    if (
      path.dirname(scratch) !== cache ||
      !path.basename(scratch).startsWith("run-")
    )
      throw new Error("Refusing to clean an unowned actionlint directory");
    await rm(scratch, { recursive: true, force: true });
  } catch (error) {
    failure = failure
      ? new AggregateError(
          [failure, error],
          "actionlint and cleanup both failed",
        )
      : error;
  }
  if (failure) throw failure;
  return status;
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 2)
      throw new Error("Usage: node scripts/run-actionlint.mjs");
    process.exitCode = await runActionlint();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
