import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  aggregateCoverage,
  coverageSourceFiles,
  mergeCoverage,
  mergeCoverageReports,
  prepareCoverage,
  validateCoverageData,
} from "./merge-coverage.mjs";

const measured = (source, hits) =>
  `TN:\nSF:${source}\nDA:1,${hits}\nLF:1\nLH:${hits ? 1 : 0}\nend_of_record\n`;

const fixture = async (context) => {
  const temporaryRoot = await realpath(tmpdir());
  const root = await mkdtemp(
    path.join(temporaryRoot, "kernel-coverage-merge-"),
  );
  context.after(async () => {
    const ownedRoot = await realpath(root);
    assert.equal(path.dirname(ownedRoot), temporaryRoot);
    assert.ok(path.basename(ownedRoot).startsWith("kernel-coverage-merge-"));
    await rm(ownedRoot, { recursive: true, force: true });
  });
  const coverage = path.join(root, "coverage");
  await mkdir(path.join(coverage, "audit"), { recursive: true });
  const output = path.join(coverage, "lcov.info");
  const auditOutput = path.join(coverage, "audit/lcov.info");
  const node = measured("src/application/identity.ts", 3);
  const audit = measured("scripts/run-audit.mjs", 4);
  await writeFile(output, node);
  await writeFile(auditOutput, audit);
  return { root, coverage, output, auditOutput, node, audit };
};

test("audit coverage preserves Node records and replaces only prior audit records", () => {
  const node = measured("src/application/identity.ts", 3);
  const previousAudit = measured("scripts/run-audit.mjs", 1);
  const audit = measured("scripts/run-audit.mjs", 4);
  const combined = mergeCoverageReports(node + previousAudit, audit);
  assert.equal(combined, node + audit);
  assert.equal(mergeCoverageReports(combined, audit), combined);
  assert.equal(mergeCoverageReports(undefined, audit), audit);
  assert.equal(
    mergeCoverageReports(node, measured("scripts\\run-audit.mjs", 4)),
    node + audit,
  );
});

test("incomplete, unmeasured and unsafe reports fail instead of inventing coverage", () => {
  const valid = measured("scripts/run-audit.mjs", 1);
  for (const invalid of [
    "",
    "SF:scripts/run-audit.mjs\nDA:1,1\n",
    "SF:scripts/run-audit.mjs\nend_of_record\n",
    measured("../private.mjs", 1),
    measured("/outside.mjs", 1),
    measured("C:/outside.mjs", 1),
    measured("..\\private.mjs", 1),
    valid + valid,
  ]) {
    assert.throws(() => mergeCoverageReports(undefined, invalid));
    assert.throws(() => mergeCoverageReports(invalid, valid));
  }
});

test("an existing empty report fails intact while a missing report permits audit-only coverage", async (context) => {
  const { root, coverage, output, audit } = await fixture(context);
  await writeFile(output, "");

  await assert.rejects(mergeCoverage(root), /complete measured records/);
  assert.equal(await readFile(output, "utf8"), "");
  assert.deepEqual((await readdir(coverage)).sort(), ["audit", "lcov.info"]);
  await rm(output);
  await mergeCoverage(root);
  assert.equal(await readFile(output, "utf8"), audit);
  assert.deepEqual((await readdir(coverage)).sort(), ["audit", "lcov.info"]);
});

test("the real merge operation retains Node bytes and leaves them intact on failure", async (context) => {
  const { root, coverage, output, auditOutput, node, audit } =
    await fixture(context);

  await mergeCoverage(root);
  assert.equal(await readFile(output, "utf8"), node + audit);
  await writeFile(auditOutput, "incomplete");
  await assert.rejects(mergeCoverage(root));
  assert.equal(await readFile(output, "utf8"), node + audit);
  await rm(output);
  await writeFile(auditOutput, audit);
  await mergeCoverage(root);
  assert.equal(await readFile(output, "utf8"), audit);
  assert.deepEqual((await readdir(coverage)).sort(), ["audit", "lcov.info"]);
});

test("a partial report write preserves the previous report and removes staging", async (context) => {
  const { root, coverage, output, auditOutput, node } = await fixture(context);
  const probe = await open(auditOutput, "r");
  const prototype = Object.getPrototypeOf(probe);
  await probe.close();
  const write = prototype.writeFile;
  const failure = new Error("synthetic disk full");
  const writer = context.mock.method(
    prototype,
    "writeFile",
    async function (content, encoding) {
      await write.call(this, content.slice(0, 8), encoding);
      throw failure;
    },
  );

  await assert.rejects(mergeCoverage(root), (error) => error === failure);
  writer.mock.restore();
  assert.equal(writer.mock.calls[0].this.fd, -1);
  assert.equal(await readFile(output, "utf8"), node);
  assert.deepEqual((await readdir(coverage)).sort(), ["audit", "lcov.info"]);
});

test("report write and staging cleanup failures are both retained", async (context) => {
  const { root, coverage, output, auditOutput, node } = await fixture(context);
  const probe = await open(auditOutput, "r");
  const prototype = Object.getPrototypeOf(probe);
  await probe.close();
  const write = prototype.writeFile;
  const failure = new Error("synthetic disk full");
  const writer = context.mock.method(
    prototype,
    "writeFile",
    async function (content, encoding) {
      await write.call(this, content.slice(0, 8), encoding);
      const directories = (await readdir(coverage)).filter((name) =>
        name.startsWith(".lcov-"),
      );
      assert.equal(directories.length, 1);
      const temporary = path.join(coverage, directories[0], "lcov.info");
      await rm(temporary);
      await mkdir(temporary);
      throw failure;
    },
  );

  await assert.rejects(mergeCoverage(root), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors[0], failure);
    assert.equal(error.errors[1].code, "ERR_FS_EISDIR");
    return true;
  });
  writer.mock.restore();
  assert.equal(writer.mock.calls[0].this.fd, -1);
  assert.equal(await readFile(output, "utf8"), node);
});

const capture = (root, tests, report, raw, sources) => {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-test-coverage",
      ...sources.map((source) => `--test-coverage-include=${source}`),
      "--test",
      "--test-reporter=lcov",
      `--test-reporter-destination=${report}`,
      ...tests,
    ],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      env: {
        SystemRoot: process.env.SystemRoot,
        TEMP: root,
        TMP: root,
        GIT_CEILING_DIRECTORIES: root,
        ...(raw ? { NODE_V8_COVERAGE: path.join(root, raw) } : {}),
      },
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
};

const aggregateFixture = async (context) => {
  const value = await fixture(context);
  const { root } = value;
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, "scripts"));
  await writeFile(path.join(root, ".nvmrc"), process.version.slice(1));
  await writeFile(
    path.join(root, "src/example.mjs"),
    [
      "export function choose(value) {",
      "  if (value) return 1;",
      "  return 2;",
      "}",
      "export const duplicate = [value => value ? 1 : 2, value => value ? 3 : 4];",
      "export const anonymous = [() => 1, () => 2];",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(root, "src/typed.ts"),
    "export function typed(value: boolean): number {\n  if (value) return 1;\n  return 2;\n}\n",
  );
  await writeFile(
    path.join(root, "scripts/run-audit.mjs"),
    "export function audit() { return true; }\n",
  );
  const sources = ["src/example.mjs", "src/typed.ts"];
  const actions = {
    unit: "choose(true); duplicate[0](true); anonymous[0](); typed(true);",
    integration:
      "choose(false); duplicate[0](false); duplicate[1](true); anonymous[1](); typed(false);",
    governance: "duplicate[1](false);",
  };
  for (const [suite, action] of Object.entries(actions)) {
    await mkdir(path.join(root, `coverage/${suite}`), { recursive: true });
    await writeFile(
      path.join(root, `${suite}.test.mjs`),
      `import {test} from 'node:test'; import {choose,duplicate,anonymous} from './src/example.mjs'; import {typed} from './src/typed.ts'; test('${suite}',()=>{${action}});\n`,
    );
    capture(
      root,
      [`${suite}.test.mjs`],
      `coverage/${suite}/lcov.info`,
      `coverage/${suite}/v8`,
      sources,
    );
    await prepareCoverage(root, `coverage/${suite}/v8`, sources);
  }
  await writeFile(
    path.join(root, "audit.test.mjs"),
    "import{test}from'node:test';import{audit}from'./scripts/run-audit.mjs';test('audit',()=>audit());\n",
  );
  capture(
    root,
    ["audit.test.mjs"],
    "coverage/governance/audit-lcov.info",
    "coverage/governance/audit-v8",
    ["scripts/run-audit.mjs"],
  );
  await prepareCoverage(root, "coverage/governance/audit-v8", [
    "scripts/run-audit.mjs",
  ]);
  return { ...value, sources };
};

test("native union matches the actual Node CLI for overlapping branches, typed sources and duplicate function names", async (context) => {
  const { root, sources, output, coverage } = await aggregateFixture(context);
  capture(
    root,
    ["unit.test.mjs", "integration.test.mjs", "governance.test.mjs"],
    "coverage/reference.info",
    undefined,
    sources,
  );
  const source = await readFile(
    path.join(root, "coverage/reference.info"),
    "utf8",
  );
  const audit = await readFile(
    path.join(root, "coverage/governance/audit-lcov.info"),
    "utf8",
  );

  const result = await aggregateCoverage(root, sources);
  assert.equal(result.source.totals.coveredFunctionPercent, 100);
  assert.equal(result.source.totals.coveredBranchPercent, 100);
  assert.equal(result.audit.totals.coveredLinePercent, 100);
  assert.equal(
    await readFile(output, "utf8"),
    mergeCoverageReports(source, audit),
  );
  assert.ok(
    result.source.files.some(
      ({ functions }) =>
        functions.filter(({ name }) => name === "duplicate").length === 2,
    ),
  );
  assert.ok(
    !(await readdir(coverage)).some((name) => name.startsWith(".aggregate-")),
  );

  const unitRaw = (await readdir(path.join(root, "coverage/unit/v8")))[0];
  const unitData = JSON.parse(
    await readFile(path.join(root, "coverage/unit/v8", unitRaw), "utf8"),
  );
  assert.ok(
    unitData.result.every(({ url }) =>
      url.startsWith("file:///kernel-api-source/src/"),
    ),
  );
  assert.equal(unitData.nodeVersion, process.version);
  assert.ok(!JSON.stringify(unitData).includes(root));
});

test("separate non-audit and audit coverage floors cannot mask each other and failures preserve the previous report", async (context) => {
  const { root, sources, output } = await aggregateFixture(context);
  const old = await readFile(output);
  for (const role of ["unit/v8", "integration/v8", "governance/v8"]) {
    for (const file of await readdir(path.join(root, "coverage", role))) {
      const filename = path.join(root, "coverage", role, file);
      const data = JSON.parse(await readFile(filename, "utf8"));
      data.result.forEach(({ functions }) =>
        functions.forEach(({ ranges }) =>
          ranges.forEach((range) => {
            range.count = 0;
          }),
        ),
      );
      await writeFile(filename, JSON.stringify(data));
    }
  }
  await assert.rejects(
    aggregateCoverage(root, sources),
    /non-audit source .*at least 80%/,
  );
  assert.deepEqual(await readFile(output), old);

  const separate = await aggregateFixture(context);
  for (const file of await readdir(
    path.join(separate.root, "coverage/governance/audit-v8"),
  )) {
    const filename = path.join(
      separate.root,
      "coverage/governance/audit-v8",
      file,
    );
    const data = JSON.parse(await readFile(filename, "utf8"));
    data.result.forEach(({ functions }) =>
      functions.forEach(({ ranges }) =>
        ranges.forEach((range) => {
          range.count = 0;
        }),
      ),
    );
    await writeFile(filename, JSON.stringify(data));
  }
  await assert.rejects(
    aggregateCoverage(separate.root, separate.sources),
    /Audit helper .*at least 80%/,
  );
  assert.deepEqual(await readFile(separate.output), old);
});

const portableCapture = () => ({
  schemaVersion: 1,
  nodeVersion: process.version,
  sourceMaps: false,
  result: [
    {
      scriptId: "1",
      url: "file:///kernel-api-source/src/example.mjs",
      functions: [
        {
          functionName: "",
          isBlockCoverage: true,
          ranges: [{ startOffset: 0, endOffset: 20, count: 1 }],
        },
      ],
    },
  ],
});

test("portable captures reject foreign sources, malformed counters, runtime drift and unsafe or conflicting maps", () => {
  const sources = ["src/example.mjs"];
  const source = portableCapture();
  assert.equal(validateCoverageData(source, sources), source);
  for (const mutate of [
    (data) => {
      data.nodeVersion = "v24.18.1";
    },
    (data) => {
      delete data.sourceMaps;
    },
    (data) => {
      data.result.push(data.result[0]);
    },
    (data) => {
      data.result[0].url = "file:///private/database.sqlite";
    },
    (data) => {
      data.result[0].url += "?mock=1";
    },
    (data) => {
      data.result[0].url = "file:///kernel-api-source/src/%2e%2e/private.mjs";
    },
    (data) => {
      data.result[0].functions[0].ranges[0].count = -1;
    },
    (data) => {
      data.result[0].functions[0].ranges[0].endOffset = Number.MAX_SAFE_INTEGER;
    },
    (data) => {
      data.result[0].functions[0].ranges.push({
        startOffset: 21,
        endOffset: 22,
        count: 1,
      });
    },
    (data) => {
      data["source-map-cache"] = { "file:///private.mjs": {} };
    },
  ]) {
    const data = structuredClone(source);
    mutate(data);
    assert.throws(() => validateCoverageData(data, sources));
  }
  const withMap = structuredClone(source);
  withMap["source-map-cache"] = {
    [source.result[0].url]: {
      data: {
        version: 3,
        sources: [source.result[0].url],
        sourcesContent: ["public source"],
        names: [],
        mappings: "AAAA",
      },
      lineLengths: [20],
    },
  };
  assert.equal(validateCoverageData(withMap, sources), withMap);
  withMap["source-map-cache"][source.result[0].url].data.sources = [
    "file:///private.ts",
  ];
  assert.throws(
    () => validateCoverageData(withMap, sources),
    /same admitted source/,
  );
  assert.deepEqual(
    coverageSourceFiles([
      "src/a.ts",
      "scripts/a.mjs",
      "src/a.test.ts",
      "src/test/helper.ts",
      "scripts/a.test-support.mjs",
      "scripts/run-audit.mjs",
      "scripts/test-native-release.mjs",
      "scripts/test-docker-release.mjs",
    ]),
    ["src/a.ts", "scripts/a.mjs"],
  );
});

test("fresh capture publication replaces only recognized owned reports and preserves source captures", async (context) => {
  const { root } = await fixture(context);
  await writeFile(path.join(root, ".nvmrc"), process.version.slice(1));
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, "src/example.mjs"),
    "export const value = 1;\n",
  );
  const parent = path.join(root, "coverage/unit");
  await mkdir(parent);
  const native = portableCapture();
  delete native.schemaVersion;
  delete native.nodeVersion;
  delete native.sourceMaps;
  native.result[0].url = new URL(
    "file:///kernel-api-source/src/example.mjs",
  ).href;
  const { pathToFileURL } = await import("node:url");
  native.result[0].url = pathToFileURL(path.join(root, "src/example.mjs")).href;
  const captureDirectory = await mkdtemp(path.join(parent, ".capture-"));
  await writeFile(
    path.join(captureDirectory, "coverage-1-1-0.json"),
    JSON.stringify(native),
  );
  const relative = path
    .relative(root, captureDirectory)
    .split(path.sep)
    .join("/");
  await prepareCoverage(
    root,
    relative,
    ["src/example.mjs"],
    "coverage/unit/v8",
  );
  assert.equal((await readdir(captureDirectory)).length, 1);
  await prepareCoverage(
    root,
    relative,
    ["src/example.mjs"],
    "coverage/unit/v8",
  );
  assert.deepEqual(await readdir(path.join(parent, "v8")), [
    "coverage-1-1-0.json",
  ]);
  const published = path.join(parent, "v8/coverage-1-1-0.json");
  const previous = await readFile(published);
  const probe = await open(published, "r");
  const prototype = Object.getPrototypeOf(probe);
  await probe.close();
  const write = prototype.writeFile;
  const failure = new Error("synthetic raw publication disk full");
  const writer = context.mock.method(
    prototype,
    "writeFile",
    async function (content, encoding) {
      await write.call(this, content.slice(0, 8), encoding);
      throw failure;
    },
  );
  await assert.rejects(
    prepareCoverage(root, relative, ["src/example.mjs"], "coverage/unit/v8"),
    (error) => error === failure,
  );
  writer.mock.restore();
  assert.equal(writer.mock.calls[0].this.fd, -1);
  assert.deepEqual(await readFile(published), previous);
  assert.ok(
    !(await readdir(parent)).some((name) => name.startsWith(".normalized-")),
  );

  await writeFile(path.join(parent, "v8/operator-file"), "unrelated");
  await assert.rejects(
    prepareCoverage(root, relative, ["src/example.mjs"], "coverage/unit/v8"),
    /complete inventory/,
  );
  assert.equal(
    await readFile(path.join(parent, "v8/operator-file"), "utf8"),
    "unrelated",
  );
  assert.ok(
    !(await readdir(parent)).some((name) => name.startsWith(".normalized-")),
  );
});

test("raw and source symlinks and missing reports fail closed before publication", async (context) => {
  const { root, sources, output } = await aggregateFixture(context);
  const old = await readFile(output);
  await writeFile(path.join(root, ".nvmrc"), "24.19.0");
  await assert.rejects(aggregateCoverage(root, sources), /exact tested Node/);
  await writeFile(path.join(root, ".nvmrc"), process.version.slice(1));
  const files = await readdir(path.join(root, "coverage/unit/v8"));
  const filename = path.join(root, "coverage/unit/v8", files[0]);
  const content = await readFile(filename);
  await rm(filename);
  await assert.rejects(
    aggregateCoverage(root, sources),
    /nonempty complete inventory/,
  );
  const target = path.join(root, "coverage/native.json");
  await mkdir(target);
  await writeFile(path.join(target, "data.json"), content);
  await symlink(
    target,
    filename,
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(
    aggregateCoverage(root, sources),
    /ordinary native JSON/,
  );
  assert.deepEqual(await readFile(output), old);
});
