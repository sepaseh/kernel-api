import { spawnSync } from "node:child_process";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const policyPath = ".github/bootstrap-policy.json";
const coreFiles = [
  policyPath,
  ".github/workflows/bootstrap.yml",
  ".github/workflows/pr-policy.yml",
  "scripts/check-pr-size.mjs",
  "scripts/check-pr-size.test.mjs",
  "scripts/validate-bootstrap.mjs",
  "scripts/validate-bootstrap.test.mjs",
];

export const validateBootstrapPolicy = (policy) => {
  if (
    policy?.schemaVersion !== 1 ||
    policy.phase !== "governance" ||
    policy.applicationReady !== false ||
    policy.maximumChangedFiles !== 100 ||
    !Array.isArray(policy.allowedFiles) ||
    !policy.allowedFiles.length ||
    policy.allowedFiles.length > 100
  )
    throw new Error(
      "An explicit governance-only bootstrap policy is required.",
    );
  const files = new Set();
  for (const file of policy.allowedFiles) {
    if (
      typeof file !== "string" ||
      !file ||
      file.includes("\\") ||
      file.split("/").some((part) => !part || part === "." || part === "..") ||
      /[*?[\]{}:\r\n]/.test(file) ||
      /^(?:src|drizzle|collection|deploy|node_modules|server|coverage)(?:\/|$)/.test(
        file,
      ) ||
      /^(?:package(?:-lock)?\.json|drizzle\.config\.ts)$/.test(file) ||
      /(?:^|\/)(?:\.env(?:\.|$)|settings\.local\.json$)/.test(file) ||
      /\.(?:pem|key|pfx|p12|sqlite|db)$/.test(file) ||
      files.has(file)
    )
      throw new Error(
        "Bootstrap files must be unique, exact governance paths.",
      );
    files.add(file);
  }
  if (coreFiles.some((file) => !files.has(file)))
    throw new Error(
      "The bootstrap policy cannot omit its mandatory guard files.",
    );
  return files;
};

export const inspectBootstrap = async (root) => {
  for (const file of [".github", policyPath]) {
    if ((await lstat(path.join(root, file))).isSymbolicLink())
      throw new Error("Bootstrap snapshots must not contain symbolic links.");
  }
  const policy = JSON.parse(
    await readFile(path.join(root, policyPath), "utf8"),
  );
  const allowed = validateBootstrapPolicy(policy);
  const directories = new Set(
    [...allowed].flatMap((file) => {
      const parts = file.split("/");
      return parts
        .slice(0, -1)
        .map((_, index) => parts.slice(0, index + 1).join("/"));
    }),
  );
  const found = new Set();
  const visit = async (directory) => {
    for (const entry of await readdir(path.join(root, directory), {
      withFileTypes: true,
    })) {
      const relative = directory ? `${directory}/${entry.name}` : entry.name;
      if (relative === ".git") continue;
      if (entry.isSymbolicLink())
        throw new Error("Bootstrap snapshots must not contain symbolic links.");
      if (entry.isDirectory() && directories.has(relative)) {
        await visit(relative);
      } else if (entry.isFile() && allowed.has(relative)) {
        found.add(relative);
      } else {
        throw new Error(`Unexpected bootstrap path: ${relative}`);
      }
    }
  };
  await visit("");
  if ([...allowed].some((file) => !found.has(file)))
    throw new Error(
      "The published bootstrap snapshot is missing declared files.",
    );

  for (const file of found) {
    if (file.endsWith(".json"))
      JSON.parse(await readFile(path.join(root, file), "utf8"));
    if (file.endsWith(".mjs")) {
      const result = spawnSync(
        process.execPath,
        ["--check", path.join(root, file)],
        {
          cwd: root,
          encoding: "utf8",
          windowsHide: true,
        },
      );
      if (result.error || result.status !== 0)
        throw new Error(`Bootstrap JavaScript syntax is invalid: ${file}`);
    }
  }
  return {
    applicationReady: false,
    files: found.size,
    phase: "governance",
    scope:
      "Published governance files only; API runtime is not published or validated.",
  };
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await inspectBootstrap(process.cwd());
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Bootstrap validation failed.",
    );
    process.exitCode = 1;
  }
}
