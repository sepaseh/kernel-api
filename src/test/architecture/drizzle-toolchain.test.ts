import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

import { createClient } from "@libsql/client";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const fixtureRoot = path.resolve(tmpdir());
const kitRequire = createRequire(import.meta.resolve("drizzle-kit"));
const loaderPath = kitRequire.resolve("@esbuild-kit/esm-loader");
const loaderRequire = createRequire(loaderPath);
const coreRequire = createRequire(
  loaderRequire.resolve("@esbuild-kit/core-utils"),
);
type Transformed = {
  code: string;
  map: {
    mappings: string;
    sources: string[];
    sourcesContent?: (string | null)[];
    version: number;
  };
};
const coreUtilities = loaderRequire("@esbuild-kit/core-utils") as {
  transform(source: string, filePath: string): Promise<Transformed>;
  transformSync(source: string, filePath: string): Transformed;
};
const compilerVersion = (coreRequire("esbuild") as { version: string }).version;
const kitDirectory = path.dirname(kitRequire.resolve("drizzle-kit"));

const temporaryDirectory = async (
  context: TestContext,
  metacharacters = false,
) => {
  const directory = await mkdtemp(
    path.join(
      fixtureRoot,
      metacharacters
        ? "kernel-drizzle-fixture-[x]{y}(z)+!@-"
        : "kernel-drizzle-fixture-",
    ),
  );
  context.after(async () => {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(fixtureRoot));
    assert.ok(path.basename(resolved).startsWith("kernel-drizzle-fixture-"));
    await rm(resolved, {
      force: true,
      maxRetries: 10,
      recursive: true,
      retryDelay: 50,
    });
  });
  await writeFile(path.join(directory, "package.json"), '{"type":"module"}');
  await writeFile(
    path.join(directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { module: "ESNext", target: "ES2022" },
    }),
  );
  return directory;
};

const childEnvironment = (directory: string): NodeJS.ProcessEnv => {
  const allowed = [
    "COMSPEC",
    "ComSpec",
    "HOME",
    "PATH",
    "Path",
    "PATHEXT",
    "SystemRoot",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "WINDIR",
    "windir",
  ];
  return {
    ...Object.fromEntries(
      allowed.flatMap((key) =>
        process.env[key] === undefined ? [] : [[key, process.env[key]]],
      ),
    ),
    NODE_OPTIONS: undefined,
    NODE_PATH: path.join(repositoryRoot, "node_modules"),
    NODE_V8_COVERAGE: undefined,
    ESBK_DISABLE_CACHE: "1",
    ESBK_TSCONFIG_PATH: path.join(directory, "tsconfig.json"),
    KERNEL_SYNTHETIC_ENV: "1",
    NODE_ENV: "test",
    TSX_DISABLE_CACHE: "1",
    TSX_TSCONFIG_PATH: path.join(directory, "tsconfig.json"),
  };
};

const runNode = (directory: string, args: string[]) => {
  const result = spawnSync(process.execPath, args, {
    cwd: directory,
    encoding: "utf8",
    env: childEnvironment(directory),
    maxBuffer: 2 * 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(
    result.status,
    0,
    `Node exited with ${result.status} (${result.signal ?? "no signal"}).\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
};

const assertSourceMap = (
  transformed: Transformed,
  source: string,
  filename: string,
) => {
  assert.equal(transformed.map.version, 3);
  assert.ok(transformed.map.mappings.length > 0);
  assert.ok(transformed.map.sources.some((entry) => entry.endsWith(filename)));
  assert.ok(transformed.map.sourcesContent?.includes(source));
};

test("toolchain subprocess environment excludes unrelated parent state", () => {
  const name = "KERNEL_TOOLCHAIN_TEST_PARENT_ONLY";
  const previous = process.env[name];
  process.env[name] = "synthetic-parent-only";
  try {
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `
      if (process.env.KERNEL_TOOLCHAIN_TEST_PARENT_ONLY !== undefined ||
          process.env.NODE_V8_COVERAGE !== undefined ||
          process.env.NODE_OPTIONS !== undefined) process.exit(1);
    `,
      ],
      {
        env: childEnvironment(path.resolve(".")),
        encoding: "utf8",
        windowsHide: true,
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
});

test("legacy core-utils compiles typed CJS with source maps and import.meta", async (context) => {
  context.diagnostic(`core-utils resolves esbuild ${compilerVersion}`);
  const directory = await temporaryDirectory(context);
  const filename = path.join(directory, "sync.ts");
  const source = `
    interface Item { value: number }
    const double = <T extends Item>(item: T): number => item.value * 2;
    export enum State { Ready = "ready" }
    export const answer: number = double({ value: 21 });
    export const sourceUrl = import.meta.url;
  `;
  const transformed = coreUtilities.transformSync(source, filename);
  assertSourceMap(transformed, source, "sync.ts");
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(transformed.code, { exports: module.exports, module });
  assert.equal(module.exports.answer, 42);
  assert.equal(module.exports.sourceUrl, pathToFileURL(filename).href);
  assert.equal((module.exports.State as Record<string, string>).Ready, "ready");
});

test("legacy core-utils compiles executable typed ESM with source maps", async (context) => {
  const directory = await temporaryDirectory(context);
  const source = `
    interface Item { value: number }
    export enum State { Ready = "ready" }
    export const read = (item: Item): number => item.value;
    export const answer: number = await Promise.resolve(read({ value: 42 }));
  `;
  const transformed = await coreUtilities.transform(
    source,
    path.join(directory, "async.mts"),
  );
  assertSourceMap(transformed, source, "async.mts");
  const output = path.join(directory, "async.mjs");
  await writeFile(output, transformed.code);
  const loaded = (await import(pathToFileURL(output).href)) as {
    answer: number;
    State: { Ready: string };
  };
  assert.equal(loaded.answer, 42);
  assert.equal(loaded.State.Ready, "ready");
});

test("legacy ESM loader resolves and compiles a sibling TypeScript import", async (context) => {
  const directory = await temporaryDirectory(context);
  await writeFile(
    path.join(directory, "sibling.ts"),
    'export enum State { Ready = "ready" }; export const answer: number = 42;',
  );
  await writeFile(
    path.join(directory, "entry.ts"),
    'import { answer, State } from "./sibling"; console.log(JSON.stringify({ answer, state: State.Ready }));',
  );
  const output = runNode(directory, [
    "--loader",
    pathToFileURL(loaderPath).href,
    path.join(directory, "entry.ts"),
  ]);
  assert.deepEqual(JSON.parse(output.trim()), { answer: 42, state: "ready" });
});

test("repository Drizzle config generates idempotently without database credentials and refuses migration", async (context) => {
  const directory = await temporaryDirectory(context, true);
  const infrastructure = path.join(directory, "src", "infrastructure");
  const db = path.join(infrastructure, "db");
  await mkdir(db, { recursive: true });
  await copyFile(
    path.join(repositoryRoot, "drizzle.config.ts"),
    path.join(directory, "drizzle.config.ts"),
  );
  await copyFile(
    path.join(repositoryRoot, "src", "infrastructure", "config.ts"),
    path.join(infrastructure, "config.ts"),
  );
  await writeFile(
    path.join(db, "schema.ts"),
    `import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const note = sqliteTable("note", { id: text("id").primaryKey() });`,
  );
  const cli = path.join(kitDirectory, "bin.cjs");
  runNode(directory, [cli, "generate", "--config=drizzle.config.ts"]);
  const output = path.join(directory, "drizzle");
  const sqlFiles = (await readdir(output)).filter((file) =>
    file.endsWith(".sql"),
  );
  assert.equal(sqlFiles.length, 1);

  const repeated = runNode(directory, [
    cli,
    "generate",
    "--config=drizzle.config.ts",
  ]);
  assert.match(repeated, /No schema changes/);
  assert.deepEqual(
    (await readdir(output)).filter((file) => file.endsWith(".sql")),
    sqlFiles,
  );

  const migration = spawnSync(
    process.execPath,
    [cli, "migrate", "--config=drizzle.config.ts"],
    {
      cwd: directory,
      encoding: "utf8",
      env: childEnvironment(directory),
      timeout: 30_000,
      windowsHide: true,
    },
  );
  assert.ifError(migration.error);
  assert.notEqual(
    migration.status,
    0,
    `Migration must fail without credentials: ${migration.stdout} ${migration.stderr}`,
  );
  assert.match(
    `${migration.stdout} ${migration.stderr}`,
    /required params|dbCredentials|credentials|DATABASE_URL/i,
  );
});

test(
  "Drizzle generates and migrates only a disposable SQLite database idempotently",
  { timeout: 120_000 },
  async (context) => {
    const directory = await temporaryDirectory(context, true);
    const databaseUrl = pathToFileURL(
      path.join(directory, "fixture.sqlite"),
    ).href;
    const output = path.join(directory, "migrations");
    const config = path.join(directory, "drizzle.config.ts");
    await writeFile(
      path.join(directory, "status.ts"),
      'export enum Status { Ready = "ready" }',
    );
    await writeFile(
      path.join(directory, "schema.ts"),
      `import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
       import { Status } from "./status.ts";
       export const toolchainNote = sqliteTable("toolchain_note", {
         id: text("id").primaryKey(),
         status: text("status").notNull().default(Status.Ready),
         count: integer("count").notNull().default(0),
       });`,
    );
    await writeFile(
      config,
      `import { defineConfig } from "drizzle-kit";
       export default defineConfig(${JSON.stringify({
         dbCredentials: { url: databaseUrl },
         dialect: "sqlite",
         out: output,
         schema: (path.sep === "\\"
           ? path.join(directory, "schema.ts").replaceAll("\\", "/")
           : path.join(directory, "schema.ts")
         ).replace(/[?*()[\]{}!+@\\]/g, "\\$&"),
       })});`,
    );
    const cli = path.join(kitDirectory, "bin.cjs");
    runNode(directory, [cli, "generate", `--config=${config}`]);
    const sqlFiles = (await readdir(output)).filter((file) =>
      file.endsWith(".sql"),
    );
    assert.equal(sqlFiles.length, 1);
    const sqlFile = sqlFiles[0];
    assert.ok(sqlFile);
    const sql = await readFile(path.join(output, sqlFile), "utf8");
    assert.match(sql, /CREATE TABLE [`"]?toolchain_note/);
    assert.match(sql, /status.*DEFAULT 'ready'/);
    runNode(directory, [cli, "migrate", `--config=${config}`]);

    const client = createClient({ url: databaseUrl });
    try {
      const columns = await client.execute("PRAGMA table_info(toolchain_note)");
      assert.deepEqual(
        columns.rows.map((row) => row.name),
        ["id", "status", "count"],
      );
      await client.execute(
        "INSERT INTO toolchain_note (id) VALUES ('fixture')",
      );
      const initial = await client.execute("SELECT * FROM toolchain_note");
      assert.deepEqual(
        initial.rows.map((row) => ({ ...row })),
        [{ count: 0, id: "fixture", status: "ready" }],
      );
      const migrations = await client.execute(
        "SELECT * FROM __drizzle_migrations",
      );
      assert.equal(migrations.rows.length, 1);
      runNode(directory, [cli, "migrate", `--config=${config}`]);
      const repeated = await client.execute("SELECT * FROM toolchain_note");
      assert.deepEqual(repeated.rows, initial.rows);
      const repeatedMigrations = await client.execute(
        "SELECT * FROM __drizzle_migrations",
      );
      assert.deepEqual(repeatedMigrations.rows, migrations.rows);
    } finally {
      client.close();
    }
  },
);
