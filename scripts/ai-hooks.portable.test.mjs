import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
const childEnvironment = (overrides = {}) => ({
  ...Object.fromEntries(
    [
      "PATH",
      "Path",
      "SystemRoot",
      "WINDIR",
      "COMSPEC",
      "PATHEXT",
      "TEMP",
      "TMP",
      "TMPDIR",
    ].flatMap((key) =>
      process.env[key] === undefined ? [] : [[key, process.env[key]]],
    ),
  ),
  BASH_ENV: "",
  ENV: "",
  ...overrides,
  NODE_V8_COVERAGE: undefined,
  NODE_OPTIONS: undefined,
});
const hook = fileURLToPath(
  new URL("../.agents/hooks/block-dangerous.mjs", import.meta.url),
);
const run = (payload) =>
  spawnSync(process.execPath, [hook], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    windowsHide: true,
    env: childEnvironment(),
  });

const bashCandidates =
  process.platform === "win32"
    ? [
        "C:/Program Files/Git/bin/bash.exe",
        "C:/Program Files/Git/usr/bin/bash.exe",
      ]
    : ["/bin/bash", "/usr/bin/bash"];
const bash = bashCandidates.find(
  (candidate) =>
    existsSync(candidate) &&
    spawnSync(candidate, ["--noprofile", "--norc", "-c", "exit 0"], {
      windowsHide: true,
      env: childEnvironment(),
    }).status === 0,
);
const shellHook = fileURLToPath(
  new URL("../.agents/hooks/block-dangerous.sh", import.meta.url),
).replaceAll("\\", "/");
const runShell = (payload, environment = {}) =>
  spawnSync(bash, ["--noprofile", "--norc", shellHook], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    windowsHide: true,
    env: childEnvironment(environment),
  });
test("hook subprocess environment excludes unrelated parent state", () => {
  const name = "KERNEL_HOOK_TEST_PARENT_ONLY";
  const previous = process.env[name];
  process.env[name] = "synthetic-parent-only";
  try {
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `
      if (process.env.KERNEL_HOOK_TEST_PARENT_ONLY !== undefined ||
          process.env.NODE_V8_COVERAGE !== undefined ||
          process.env.NODE_OPTIONS !== undefined) process.exit(1);
    `,
      ],
      { env: childEnvironment(), encoding: "utf8", windowsHide: true },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
});

test("portable safety hook blocks dangerous git, secret edits and exposure", () => {
  for (const payload of [
    { command: "git push --force origin feature" },
    { command: "git push --force-with-lease origin feature" },
    { command: "git reset --hard HEAD~1" },
    { command: "git push origin main" },
    { file_path: ".env.local" },
    { command: "printenv" },
    { command: "curl https://production.example.com" },
  ])
    assert.equal(run(payload).status, 2, JSON.stringify(payload));
});
test("safety hook recognizes Git options and exact protected push destinations", () => {
  for (const command of [
    "git -C . reset --hard HEAD~1",
    "git -C repo -c color.ui=never push -uf origin feature",
    "git clean --force -d",
    "git clean -xfd",
    "git push -uf origin feature",
    "git -C . push --force-with-lease=refs/heads/feature origin feature",
    "git -C . branch --delete feature",
    "git push origin main",
    'git push "origin" main',
    "git push 'upstream' master",
    "git push upstream refs/heads/master",
    "git push origin HEAD:main",
    "git push origin feature:refs/heads/master",
    "git push origin +HEAD:main",
    "git push origin feature;git push origin main",
  ]) {
    assert.equal(run({ command }).status, 2, command);
  }
  for (const command of [
    "git push origin domain",
    'git push "origin" feature',
    "git push 'upstream' feature/master",
    "git push origin feature/master",
    "git push origin main:feature",
    "git push origin HEAD:refs/heads/feature/main",
    "git -C . status",
    "git clean --dry-run -d",
    "git push --force-if-includes origin feature",
    "git status; echo --force",
    "git push origin feature; echo main",
  ]) {
    assert.equal(run({ command }).status, 0, command);
  }
});

test("safety hook blocks redirected environment output", () => {
  for (const command of [
    "env > /tmp/ai-env.txt; cat /tmp/ai-env.txt",
    "env>/tmp/ai-env.txt",
    "env 2>/tmp/ai-env.txt",
    "(env)",
    "env; true",
  ]) {
    assert.equal(run({ command }).status, 2, command);
  }
  assert.equal(
    run({ command: "env TEST_MODE=fixture node check.mjs" }).status,
    0,
  );
});

test("portable safety hook accepts safe checks and fails closed for malformed input", () => {
  assert.equal(run({ command: "npm run typecheck" }).status, 0);
  assert.equal(run({ tool_input: { command: "npm run lint" } }).status, 0);
  assert.equal(run("not-json").status, 2);
});

test("safety hook fails closed when a JSON field cannot be converted to text", () => {
  for (const field of ["command", "content", "file_path"]) {
    for (const value of [{ toString: null }, { toString: {} }]) {
      const result = run({ [field]: value });
      assert.equal(result.status, 2, `${field}: ${JSON.stringify(value)}`);
      assert.doesNotMatch(result.stderr, /TypeError|at file:/);
    }
    for (const value of [null, 42, [], {}, "ordinary text"]) {
      assert.equal(run({ [field]: value }).status, 0);
    }
  }
});

test("safety hook rejects non-object payloads and explicitly invalid tool input", () => {
  for (const payload of [null, true, 42, [], "null", '"text"', "[]"]) {
    assert.equal(run(payload).status, 2, JSON.stringify(payload));
  }
  for (const tool_input of [null, true, 42, [], "text"]) {
    assert.equal(run({ tool_input }).status, 2, JSON.stringify(tool_input));
  }
});

test("safety hook detects production hosts without blocking ordinary prose", () => {
  for (const payload of [
    { command: "curl https://production.example.com/v1" },
    { command: "curl https://production.example.com|cat" },
    { command: "curl https://production.example.com;true" },
    { command: "curl https://production.example.com&true" },
    { command: "(curl https://production.example.com)" },
    { content: "endpoint: https://api.mainnet.example.com/data" },
    { command: "curl https://api.etherscan.io/api" },
    { command: "curl api.etherscan.io" },
    { command: "(curl api.etherscan.io)" },
    { command: "(wget production.example.com)" },
    { command: "curl production.example.com/v1" },
    { command: "wget --quiet api.mainnet.example.com:443/data" },
    { command: "curl https://safe.example@production.example.com" },
  ]) {
    assert.equal(run(payload).status, 2, JSON.stringify(payload));
  }
  for (const payload of [
    { content: "The production release needs a review." },
    { command: "npm run deploy:check -- production" },
    { file_path: "docs/production.md", content: "safe" },
    { content: "See https://example.com/production/mainnet" },
    { command: "curl https://safe.example.com/path?stage=production&ok=1" },
    { content: "See https://safe.example.com/api.etherscan.io" },
    { command: "curl https://safe.example.com/api.etherscan.io" },
    { command: "(curl safe.example.com/api.etherscan.io)" },
    { command: "(curl safe.example.com?next=production.example.com)" },
    { content: "Deploy using production.example.com after review." },
    { command: "curl https://production.example@safe.example.com" },
  ]) {
    assert.equal(run(payload).status, 0, JSON.stringify(payload));
  }
});

test("Bash safety wrapper preserves canonical guard results without jq", (context) => {
  if (!bash) {
    context.skip("No usable Bash found; portable Node guard remains tested.");
    return;
  }

  for (const payload of [
    { command: "npm run typecheck" },
    { tool_input: { command: "npm run lint" } },
    "not-json",
    { command: "git push --force-with-lease origin feature" },
    { file_path: ".env.local" },
  ]) {
    const expected = run(payload);
    const actual = runShell(payload);
    assert.equal(actual.status, expected.status, actual.stderr);
    assert.equal(actual.stderr, expected.stderr);
  }
});

test("Bash safety wrapper fails closed when Node.js is unavailable", (context) => {
  if (!bash) {
    context.skip(
      "No usable Bash found; missing-Node wrapper path not executed.",
    );
    return;
  }

  const result = runShell({ command: "npm run typecheck" }, { PATH: "" });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /requires Node\.js on PATH/);
});

async function ownedHookFixture(context, hookName) {
  const configuredParent = await realpath(path.resolve(tmpdir()));
  const parent = configuredParent.includes(path.delimiter)
    ? await realpath(
        process.platform === "win32"
          ? path.join(process.env.SystemRoot, "Temp")
          : "/tmp",
      )
    : configuredParent;
  assert.ok(
    !parent.includes(path.delimiter),
    "Hook fixture parents must be representable as one Git ceiling entry.",
  );
  const root = await mkdtemp(path.join(parent, "kernel-hook-fixture-"));
  context.after(async () => {
    assert.equal(path.dirname(await realpath(root)), parent);
    assert.ok(path.basename(root).startsWith("kernel-hook-fixture-"));
    await rm(root, { recursive: true, force: true });
  });
  const hooks = path.join(root, ".agents", "hooks");
  await mkdir(hooks, { recursive: true });
  await copyFile(
    fileURLToPath(new URL(`../.agents/hooks/${hookName}`, import.meta.url)),
    path.join(hooks, hookName),
  );
  return root;
}

test("post-edit hook invokes ESLint only for the requested owned file", async (context) => {
  if (!bash) return context.skip("No usable Bash found.");
  const root = await ownedHookFixture(context, "post-edit-format.sh");
  const eslintDir = path.join(root, "node_modules", ".bin");
  await mkdir(eslintDir, { recursive: true });
  await writeFile(
    path.join(eslintDir, "eslint"),
    '#!/bin/bash\nprintf "%s\\n" "$@" > "$HOOK_TEST_LOG"\n',
    { mode: 0o755 },
  );
  const requested = path.join(root, "پوشه with spaces", "requested.ts");
  const other = path.join(root, "other.ts");
  const log = path.join(root, "eslint-args.txt");
  await mkdir(path.dirname(requested), { recursive: true });
  await writeFile(requested, "const requested = 1;\n");
  await writeFile(other, "const other = 1;\n");
  const result = spawnSync(
    bash,
    [
      "--noprofile",
      "--norc",
      path.join(root, ".agents/hooks/post-edit-format.sh"),
    ],
    {
      input: JSON.stringify({ file_path: "پوشه with spaces/requested.ts" }),
      cwd: tmpdir(),
      encoding: "utf8",
      windowsHide: true,
      env: childEnvironment({ HOOK_TEST_LOG: log.replaceAll("\\", "/") }),
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const args = (await readFile(log, "utf8")).trim().split(/\r?\n/);
  assert.equal(args[0], "--fix");
  assert.equal(args[1], "--");
  assert.equal(args.length, 3);
  assert.match(args[2], /requested\.ts$/);
  assert.equal(await readFile(other, "utf8"), "const other = 1;\n");
  for (const extension of ["mts", "cts"]) {
    const file = `requested.${extension}`;
    await writeFile(path.join(root, file), "export {};\n");
    const result = spawnSync(
      bash,
      [
        "--noprofile",
        "--norc",
        path.join(root, ".agents/hooks/post-edit-format.sh"),
      ],
      {
        input: JSON.stringify({ file_path: file }),
        cwd: tmpdir(),
        encoding: "utf8",
        windowsHide: true,
        env: childEnvironment({ HOOK_TEST_LOG: log.replaceAll("\\", "/") }),
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const extensionArgs = (await readFile(log, "utf8")).trim().split(/\r?\n/);
    assert.deepEqual(extensionArgs.slice(0, 2), ["--fix", "--"]);
    assert.equal(extensionArgs.length, 3);
    assert.ok(extensionArgs[2].endsWith(file), extensionArgs[2]);
  }
  if (process.platform === "win32") {
    await writeFile(log, "");
    const native = spawnSync(
      bash,
      [
        "--noprofile",
        "--norc",
        path.join(root, ".agents/hooks/post-edit-format.sh"),
      ],
      {
        input: JSON.stringify({ file_path: requested }),
        cwd: tmpdir(),
        encoding: "utf8",
        windowsHide: true,
        env: childEnvironment({ HOOK_TEST_LOG: log.replaceAll("\\", "/") }),
      },
    );
    assert.equal(native.status, 0, native.stderr);
    const nativeArgs = (await readFile(log, "utf8")).trim().split(/\r?\n/);
    assert.deepEqual(nativeArgs, args);
  }
  const outsideRoot = await ownedHookFixture(context, "post-edit-format.sh");
  await writeFile(path.join(outsideRoot, "outside.ts"), "// outside\n");
  const outside = spawnSync(
    bash,
    [
      "--noprofile",
      "--norc",
      path.join(root, ".agents/hooks/post-edit-format.sh"),
    ],
    {
      input: JSON.stringify({
        file_path: `../${path.basename(outsideRoot)}/outside.ts`,
      }),
      cwd: tmpdir(),
      encoding: "utf8",
      windowsHide: true,
      env: childEnvironment(),
    },
  );
  assert.equal(outside.status, 2);
  assert.match(outside.stderr, /refuses files outside/);
  if (process.platform === "win32") {
    const nativeOutside = spawnSync(
      bash,
      [
        "--noprofile",
        "--norc",
        path.join(root, ".agents/hooks/post-edit-format.sh"),
      ],
      {
        input: JSON.stringify({
          file_path: path.join(outsideRoot, "outside.ts"),
        }),
        cwd: tmpdir(),
        encoding: "utf8",
        windowsHide: true,
        env: childEnvironment(),
      },
    );
    assert.equal(nativeOutside.status, 2);
    assert.match(nativeOutside.stderr, /refuses files outside/);
  }
  for (const ambiguous of ["C:relative.ts", "\\\\server\\share\\source.ts"]) {
    const result = spawnSync(
      bash,
      [
        "--noprofile",
        "--norc",
        path.join(root, ".agents/hooks/post-edit-format.sh"),
      ],
      {
        input: JSON.stringify({ file_path: ambiguous }),
        cwd: tmpdir(),
        encoding: "utf8",
        windowsHide: true,
        env: childEnvironment(),
      },
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /ambiguous or network paths/);
  }
  await writeFile(path.join(eslintDir, "eslint"), "#!/bin/bash\nexit 7\n", {
    mode: 0o755,
  });
  const failure = spawnSync(
    bash,
    [
      "--noprofile",
      "--norc",
      path.join(root, ".agents/hooks/post-edit-format.sh"),
    ],
    {
      input: JSON.stringify({ file_path: requested.replaceAll("\\", "/") }),
      encoding: "utf8",
      windowsHide: true,
      env: childEnvironment(),
    },
  );
  assert.equal(failure.status, 7);
});

test("quality hook detects Unicode and spaced source paths, including type changes", async (context) => {
  if (!bash) return context.skip("No usable Bash found.");
  const root = await ownedHookFixture(context, "quality-gate.sh");
  const bin = path.join(root, "bin");
  const log = path.join(root, "quality-commands.txt");
  await mkdir(bin);
  await writeFile(
    path.join(bin, "git"),
    `git() {
case "$1" in
  rev-parse) printf '%s\\n' "$HOOK_TEST_ROOT" ;;
  diff)
    [[ " $* " == *" --name-only "* && " $* " == *" -z "* && " $* " == *" --diff-filter=ACMRTD "* ]] || exit 2
    case "$HOOK_TEST_MODE" in
      type|lintfail) printf '%s\\0' 'پوشه with spaces/source.ts' ;;
      mts|cts) printf '%s\\0' "source.$HOOK_TEST_MODE" ;;
    esac ;;
  ls-files)
    [[ " $* " == *" -z "* ]] || exit 2
    case "$HOOK_TEST_MODE" in
      untracked) printf '%s\\0' 'نام with spaces.js' ;;
      untracked-mts) printf '%s\\0' 'untracked.mts' ;;
      untracked-cts) printf '%s\\0' 'untracked.cts' ;;
    esac ;;
  *) exit 2 ;;
esac
}
`,
    { mode: 0o755 },
  );
  await writeFile(
    path.join(bin, "npm"),
    `npm() {
  printf "%s\\n" "$*" >> "$HOOK_TEST_LOG"
  if [ "$HOOK_TEST_MODE" = lintfail ] && [ "$*" = "run lint" ]; then return 7; fi
}\n`,
    { mode: 0o755 },
  );
  for (const mode of [
    "type",
    "untracked",
    "mts",
    "cts",
    "untracked-mts",
    "untracked-cts",
    "lintfail",
    "none",
  ]) {
    await writeFile(log, "");
    const result = spawnSync(
      bash,
      [
        "--noprofile",
        "--norc",
        "-c",
        'source "$HOOK_TEST_BIN/git"; source "$HOOK_TEST_BIN/npm"; export -f git npm; exec "$@"',
        "hook-test",
        bash,
        "--noprofile",
        "--norc",
        path.join(root, ".agents/hooks/quality-gate.sh"),
      ],
      {
        cwd: tmpdir(),
        encoding: "utf8",
        windowsHide: true,
        env: childEnvironment({
          AI_PROJECT_DIR: root,
          HOOK_TEST_ROOT: root.replaceAll("\\", "/"),
          HOOK_TEST_BIN: bin.replaceAll("\\", "/"),
          HOOK_TEST_LOG: log.replaceAll("\\", "/"),
          HOOK_TEST_MODE: mode,
        }),
      },
    );
    assert.equal(result.status, mode === "lintfail" ? 2 : 0, result.stderr);
    const commands = await readFile(log, "utf8");
    assert.equal(
      commands.replaceAll("\r", ""),
      mode === "none"
        ? ""
        : mode === "lintfail"
          ? "run lint\n"
          : "run lint\nrun typecheck\n",
    );
  }
});

test("quality hook checks a staged rename from source to a non-source filename", async (context) => {
  if (!bash) return context.skip("No usable Bash found.");
  const root = await ownedHookFixture(context, "quality-gate.sh");
  const log = path.join(root, "rename-commands.txt");
  const environment = childEnvironment({
    AI_PROJECT_DIR: root,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: path.join(root, "no-user-git-config"),
    HOOK_TEST_LOG: log.replaceAll("\\", "/"),
  });
  const git = (...args) => {
    const result = spawnSync("git", args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      env: environment,
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  git("init", "--quiet");
  git("config", "core.autocrlf", "false");
  git("config", "diff.renames", "true");
  await writeFile(path.join(root, "source.ts"), "export const fixture = 1;\n");
  git("add", "--", "source.ts");
  git(
    "-c",
    "user.name=Hook Fixture",
    "-c",
    "user.email=hook-fixture@example.invalid",
    "-c",
    "core.hooksPath=empty-hooks",
    "commit",
    "--quiet",
    "--no-gpg-sign",
    "-m",
    "Synthetic source fixture",
  );
  await copyFile(path.join(root, "source.ts"), path.join(root, "archived.txt"));
  await rm(path.join(root, "source.ts"));
  git("add", "--", "source.ts", "archived.txt");
  assert.match(
    git("diff", "--cached", "--name-status"),
    /^R100\tsource\.ts\tarchived\.txt\r?\n$/,
  );
  await writeFile(log, "");
  const result = spawnSync(
    bash,
    [
      "--noprofile",
      "--norc",
      "-c",
      'npm() { printf "%s\\n" "$*" >> "$HOOK_TEST_LOG"; }; export -f npm; exec "$@"',
      "hook-test",
      bash,
      "--noprofile",
      "--norc",
      path.join(root, ".agents/hooks/quality-gate.sh"),
    ],
    { cwd: root, encoding: "utf8", windowsHide: true, env: environment },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    (await readFile(log, "utf8")).replaceAll("\r", ""),
    "run lint\nrun typecheck\n",
  );
});

test("post-edit and quality hooks report invalid input or repository", async (context) => {
  if (!bash) return context.skip("No usable Bash found.");
  const root = await ownedHookFixture(context, "post-edit-format.sh");
  const postHook = path.join(root, ".agents/hooks/post-edit-format.sh");
  const malformed = spawnSync(bash, ["--noprofile", "--norc", postHook], {
    input: "not-json",
    encoding: "utf8",
    windowsHide: true,
    env: childEnvironment(),
  });
  assert.equal(malformed.status, 2);
  assert.match(malformed.stderr, /cannot inspect its input/);
  await copyFile(
    fileURLToPath(new URL("../.agents/hooks/quality-gate.sh", import.meta.url)),
    path.join(root, ".agents/hooks/quality-gate.sh"),
  );
  const noRepository = spawnSync(
    bash,
    ["--noprofile", "--norc", path.join(root, ".agents/hooks/quality-gate.sh")],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      env: childEnvironment({
        AI_PROJECT_DIR: root,
        GIT_CEILING_DIRECTORIES: path.dirname(root),
      }),
    },
  );
  assert.equal(noRepository.status, 2);
  assert.match(noRepository.stderr, /cannot identify the Git repository/);
});

test("hook fixture isolation supports relative and separator-containing temporary directories", async (context) => {
  if (!bash) return context.skip("No usable Bash found.");
  const root = await ownedHookFixture(context, "quality-gate.sh");
  const initialized = spawnSync("git", ["init", "--quiet"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    env: childEnvironment({
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: path.join(root, "no-user-git-config"),
    }),
  });
  assert.equal(initialized.error, undefined);
  assert.equal(initialized.status, 0, initialized.stderr);
  for (const temporary of [
    "relative-temp",
    path.join(root, `separator${path.delimiter}temp`),
  ]) {
    await mkdir(path.resolve(root, temporary));
    const result = spawnSync(
      process.execPath,
      [
        "--test",
        "--test-reporter=tap",
        "--test-name-pattern=^post-edit and quality hooks report invalid input or repository$",
        fileURLToPath(import.meta.url),
      ],
      {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        env: childEnvironment({
          TEMP: temporary,
          TMP: temporary,
          TMPDIR: temporary,
        }),
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /# pass 1\b/);
  }
});

test("quality hook fails when Git cannot inspect tracked changes", async (context) => {
  if (!bash) return context.skip("No usable Bash found.");
  const root = await ownedHookFixture(context, "quality-gate.sh");
  const environment = childEnvironment({
    AI_PROJECT_DIR: root,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: path.join(root, "no-user-git-config"),
  });
  const initialized = spawnSync("git", ["init", "--quiet", root], {
    encoding: "utf8",
    windowsHide: true,
    env: environment,
  });
  assert.equal(initialized.status, 0, initialized.stderr);
  const result = spawnSync(
    bash,
    ["--noprofile", "--norc", path.join(root, ".agents/hooks/quality-gate.sh")],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      env: environment,
    },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot inspect tracked changes/);
});
