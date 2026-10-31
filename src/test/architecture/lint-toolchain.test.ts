import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";

test("ESLint discovers nested TypeScript and modules while preserving ignores and diagnostics", async (context) => {
  const temporaryRoot = await realpath(tmpdir());
  const directory = await mkdtemp(
    path.join(temporaryRoot, "kernel-lint-toolchain-"),
  );
  context.after(async () => {
    const ownedDirectory = await realpath(directory);
    assert.equal(path.dirname(ownedDirectory), temporaryRoot);
    assert.ok(
      path.basename(ownedDirectory).startsWith("kernel-lint-toolchain-"),
    );
    await rm(ownedDirectory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  });

  const activeFiles = {
    "src/nested/errors.ts":
      "type Item = { value: number };\nconst unused: Item = { value: 1 };\ndebugger;\nexport const item: Item = { value: 2 };\n",
    "src/nested/valid.ts": "export const count: number = 1;\n",
    "scripts/deep/task.mjs": "debugger;\nexport const count = 1;\n",
    ".hidden.ts": "export const hidden: number = 1;\n",
    ".hidden/deep/task.mjs": "debugger;\nexport const count = 1;\n",
  };
  const ignoredFiles = [
    "coverage/broken.ts",
    "packages/demo/coverage/broken.ts",
    "dist/nested/broken.mjs",
    "reports/broken.ts",
    "node_modules/fixture/broken.ts",
    "collection/environments/private.ts",
    "server/data/private.mjs",
  ];
  const fixtures: [string, string][] = [
    ...Object.entries(activeFiles),
    ...ignoredFiles.map((file): [string, string] => [
      file,
      "this is invalid syntax !!!",
    ]),
  ];
  await Promise.all(
    fixtures.map(async ([file, source]) => {
      const target = path.join(directory, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, source);
    }),
  );

  const eslint = new ESLint({
    cwd: directory,
    overrideConfigFile: fileURLToPath(
      new URL("../../../eslint.config.mjs", import.meta.url),
    ),
  });
  const results = await eslint.lintFiles(["**/*.{ts,mjs}"]);
  const byFile = new Map(
    results.map((result) => [
      path.relative(directory, result.filePath).split(path.sep).join("/"),
      result,
    ]),
  );
  assert.deepEqual([...byFile.keys()].sort(), Object.keys(activeFiles).sort());
  assert.ok(results.every((result) => result.fatalErrorCount === 0));
  assert.deepEqual(
    byFile
      .get("src/nested/errors.ts")
      ?.messages.map((message) => message.ruleId)
      .sort(),
    ["@typescript-eslint/no-unused-vars", "no-debugger"],
  );
  assert.equal(byFile.get("src/nested/valid.ts")?.errorCount, 0);
  assert.equal(byFile.get(".hidden.ts")?.errorCount, 0);
  for (const file of ["scripts/deep/task.mjs", ".hidden/deep/task.mjs"]) {
    assert.deepEqual(
      byFile.get(file)?.messages.map((message) => message.ruleId),
      ["no-debugger"],
    );
  }
  for (const file of ignoredFiles) {
    assert.equal(
      await eslint.isPathIgnored(path.join(directory, file)),
      true,
      file,
    );
  }
  assert.equal(
    await eslint.isPathIgnored(path.join(directory, ".hidden.ts")),
    false,
  );
  await assert.rejects(
    eslint.lintFiles(["unmatched/**/*.ts"]),
    /No files matching/,
  );
});
