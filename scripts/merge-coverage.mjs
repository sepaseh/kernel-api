import { spawnSync } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { lcov } from "node:test/reporters";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const repository = fileURLToPath(new URL("../", import.meta.url));
const supportedVersion = "v24.18.0";
const maximumBytes = 32 * 1024 * 1024;
const portableRoot = "file:///kernel-api-source/";
const suites = ["unit", "integration", "governance"];
const rawDirectories = new Set([
  ...suites.map((suite) => `coverage/${suite}/v8`),
  "coverage/governance/audit-v8",
]);
const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const insist = (condition, message) => {
  if (!condition) throw new Error(message);
};
const compareText = (left, right) => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};
const completedValues = async (operations) => {
  const results = await Promise.allSettled(operations);
  const failures = results
    .filter(({ status }) => status === "rejected")
    .map(({ reason }) => reason);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, "Coverage operations failed");
  return results.map(({ value }) => value);
};
const finishCleanup = async (operation, cleanup, message) => {
  let failure;
  try {
    await operation();
  } catch (error) {
    failure = error;
  }
  try {
    await cleanup();
  } catch (error) {
    failure = failure
      ? new AggregateError([failure, error], message, { cause: error })
      : error;
  }
  if (failure) throw failure;
};

const sourcePath = (filename) => {
  insist(
    typeof filename === "string" &&
      /^(?:src|scripts)\/.+\.(?:mjs|ts)$/.test(filename) &&
      !/[\\:\0\r\n]/.test(filename) &&
      !filename
        .split("/")
        .some((part) => !part || part === "." || part === "..") &&
      !/(?:^|\/)\.env(?:\.|$)/i.test(filename),
    "Coverage source paths must be admitted safe relative code paths",
  );
  return filename;
};

export const coverageSourceFiles = (files) =>
  [...files].filter(
    (file) =>
      /^(?:scripts|src)\/.+\.(?:mjs|ts)$/.test(file) &&
      !/\.test(?:-support)?\.(?:mjs|ts)$/.test(file) &&
      !file.startsWith("src/test/") &&
      file !== "scripts/run-audit.mjs" &&
      ![
        "scripts/test-native-release.mjs",
        "scripts/test-docker-release.mjs",
      ].includes(file),
  );

const sourceNames = (files) => {
  insist(
    Array.isArray(files) &&
      files.length > 0 &&
      new Set(files).size === files.length,
    "Coverage requires a nonempty unique production source inventory",
  );
  return new Set(files.map(sourcePath));
};
const portableUrl = (filename) =>
  portableRoot + filename.split("/").map(encodeURIComponent).join("/");
const portableSource = (url, files) => {
  insist(
    typeof url === "string" && url.startsWith(portableRoot),
    "Coverage must use portable admitted source URLs",
  );
  const filename = decodeURIComponent(url.slice(portableRoot.length));
  insist(
    files.has(filename) && portableUrl(filename) === url,
    "Coverage references an unadmitted or unsafe source",
  );
  return filename;
};
const exactKeys = (value, keys, message) =>
  insist(
    isRecord(value) && Object.keys(value).every((key) => keys.includes(key)),
    message,
  );

const validateFunction = (fn) => {
  exactKeys(
    fn,
    ["functionName", "ranges", "isBlockCoverage"],
    "Invalid V8 function coverage",
  );
  insist(
    typeof fn.functionName === "string" &&
      !/[\0\r\n]/.test(fn.functionName) &&
      typeof fn.isBlockCoverage === "boolean" &&
      Array.isArray(fn.ranges) &&
      fn.ranges.length > 0,
    "V8 functions require names and measured offset ranges",
  );
  const keys = new Set();
  for (const range of fn.ranges) {
    exactKeys(
      range,
      ["startOffset", "endOffset", "count"],
      "Invalid V8 coverage range",
    );
    insist(
      [range.startOffset, range.endOffset, range.count].every(integer) &&
        range.endOffset >= range.startOffset &&
        range.endOffset <= maximumBytes &&
        !keys.has(`${range.startOffset}:${range.endOffset}`),
      "Invalid or repeated V8 coverage offset range",
    );
    keys.add(`${range.startOffset}:${range.endOffset}`);
    insist(
      range.startOffset >= fn.ranges[0].startOffset &&
        range.endOffset <= fn.ranges[0].endOffset,
      "V8 branch ranges must remain inside their function",
    );
  }
};

const validateSourceMap = (mapping, url) => {
  exactKeys(
    mapping,
    ["data", "lineLengths"],
    "Invalid coverage source map cache",
  );
  const data = mapping.data;
  exactKeys(
    data,
    ["version", "sources", "sourcesContent", "names", "mappings"],
    "Invalid coverage source map",
  );
  insist(
    data.version === 3 &&
      isDeepStrictEqual(data.sources, [url]) &&
      Array.isArray(data.sourcesContent) &&
      data.sourcesContent.length === 1 &&
      typeof data.sourcesContent[0] === "string" &&
      Array.isArray(data.names) &&
      data.names.every((name) => typeof name === "string") &&
      typeof data.mappings === "string" &&
      /^[A-Za-z0-9+/;,]*$/.test(data.mappings) &&
      Array.isArray(mapping.lineLengths) &&
      mapping.lineLengths.length > 0 &&
      mapping.lineLengths.every(integer),
    "Coverage maps must describe only their same admitted source",
  );
};

export const validateCoverageData = (data, sourceFiles) => {
  const files = sourceNames(sourceFiles);
  exactKeys(
    data,
    [
      "schemaVersion",
      "nodeVersion",
      "sourceMaps",
      "result",
      "source-map-cache",
    ],
    "Invalid portable V8 coverage data",
  );
  insist(
    data.schemaVersion === 1 &&
      data.nodeVersion === supportedVersion &&
      process.version === supportedVersion &&
      typeof data.sourceMaps === "boolean" &&
      Array.isArray(data.result) &&
      data.result.length > 0,
    "Coverage requires the exact supported Node runtime and nonempty measured scripts",
  );
  const urls = new Set();
  for (const script of data.result) {
    exactKeys(
      script,
      ["scriptId", "url", "functions"],
      "Invalid V8 script coverage",
    );
    portableSource(script.url, files);
    insist(
      !urls.has(script.url) &&
        typeof script.scriptId === "string" &&
        Array.isArray(script.functions) &&
        script.functions.length > 0,
      "Coverage scripts must have unique source URLs and measured functions",
    );
    urls.add(script.url);
    script.functions.forEach(validateFunction);
  }
  if (data["source-map-cache"] !== undefined) {
    insist(isRecord(data["source-map-cache"]), "Invalid source map cache");
    for (const [url, mapping] of Object.entries(data["source-map-cache"])) {
      insist(
        urls.has(url),
        "Source map cache must belong to a measured admitted script",
      );
      validateSourceMap(mapping, url);
    }
  }
  return data;
};

const ordinary = async (root, relative, optional = false) => {
  insist(
    typeof relative === "string" &&
      !/[\\:\0\r\n]/.test(relative) &&
      !relative
        .split("/")
        .some((part) => !part || part === "." || part === ".."),
    "Unsafe coverage file path",
  );
  let filename = path.resolve(root);
  const parts = relative.split("/");
  const rootInfo = await lstat(filename);
  insist(
    rootInfo.isDirectory() && !rootInfo.isSymbolicLink(),
    "Coverage root must be an ordinary directory",
  );
  for (const [index, part] of parts.entries()) {
    filename = path.join(filename, part);
    let info;
    try {
      info = await lstat(filename);
    } catch (error) {
      if (optional && index === parts.length - 1 && error.code === "ENOENT")
        return filename;
      throw error;
    }
    insist(
      !info.isSymbolicLink() &&
        (index === parts.length - 1 ? info.isFile() : info.isDirectory()),
      "Coverage paths must use ordinary files and directories without links",
    );
    if (index === parts.length - 1)
      insist(
        info.size > 0 && info.size <= maximumBytes,
        "Coverage files must be nonempty and bounded",
      );
  }
  return filename;
};
const readJson = async (root, relative) =>
  JSON.parse(await readFile(await ordinary(root, relative), "utf8"));
const pinnedRuntime = async (root) => {
  const version = (
    await readFile(await ordinary(root, ".nvmrc"), "utf8")
  ).trim();
  insist(
    `v${version}` === supportedVersion && process.version === supportedVersion,
    "Coverage aggregation requires the exact tested Node version from .nvmrc",
  );
};
const nativeSource = (url, root, files) => {
  if (typeof url !== "string" || !url.startsWith("file:")) return;
  const parsed = new URL(url);
  const relative = path
    .relative(root, fileURLToPath(parsed))
    .split(path.sep)
    .join("/");
  if (!files.has(relative)) return;
  insist(
    !parsed.search &&
      !parsed.hash &&
      parsed.href === pathToFileURL(path.join(root, relative)).href,
    "Measured source URLs must identify the exact admitted file without overrides",
  );
  return relative;
};
const prepareMap = async (mapping, originalUrl, filename, root) => {
  insist(
    isRecord(mapping) && isRecord(mapping.data),
    "Invalid native source map cache",
  );
  const data = mapping.data;
  insist(
    !data.sourceRoot &&
      Array.isArray(data.sources) &&
      data.sources.length === 1 &&
      new URL(data.sources[0], originalUrl).href === originalUrl,
    "Native source maps must reference their same admitted source",
  );
  const content = await readFile(await ordinary(root, filename), "utf8");
  insist(
    data.sourcesContent === undefined ||
      isDeepStrictEqual(data.sourcesContent, [content]),
    "Source map content differs from the exact checkout",
  );
  return {
    data: {
      version: data.version,
      sources: [portableUrl(filename)],
      sourcesContent: [content],
      names: data.names,
      mappings: data.mappings,
    },
    lineLengths: mapping.lineLengths,
  };
};
const prepareData = async (data, root, files, sourceMaps) => {
  insist(
    isRecord(data) && Array.isArray(data.result),
    "Invalid native coverage capture",
  );
  const scripts = data.result
    .flatMap((script) => {
      const filename = nativeSource(script.url, root, files);
      return filename ? [{ script, filename }] : [];
    })
    .sort((left, right) => compareText(left.filename, right.filename));
  if (!scripts.length) return;
  const result = scripts.map(({ script, filename }, index) => ({
    scriptId: String(index + 1),
    url: portableUrl(filename),
    functions: script.functions,
  }));
  const entries = await completedValues(
    scripts.map(async ({ script, filename }) => {
      await ordinary(root, filename);
      const mapping = data["source-map-cache"]?.[script.url];
      if (mapping === undefined) return;
      return [
        portableUrl(filename),
        await prepareMap(mapping, script.url, filename, root),
      ];
    }),
  );
  const maps = Object.fromEntries(
    entries.filter((entry) => entry !== undefined),
  );
  return validateCoverageData(
    {
      schemaVersion: 1,
      nodeVersion: process.version,
      sourceMaps,
      result,
      ...(Object.keys(maps).length ? { "source-map-cache": maps } : {}),
    },
    [...files],
  );
};
const coverageFiles = async (root, relative) => {
  insist(
    rawDirectories.has(relative) ||
      /^coverage\/(?:unit|integration|governance)\/\.capture-[A-Za-z0-9]+$/.test(
        relative,
      ),
    "Coverage capture directory must belong to an actual suite",
  );
  const directory = path.join(root, relative);
  const probe = await ordinary(root, `${relative}/.probe`, true);
  insist(path.dirname(probe) === directory, "Invalid coverage directory");
  const entries = await readdir(directory, { withFileTypes: true });
  insist(
    entries.length > 0 &&
      entries.every(
        (entry) =>
          entry.isFile() &&
          !entry.isSymbolicLink() &&
          /^coverage-\d+-\d+-\d+\.json$/.test(entry.name),
      ),
    "Coverage captures require a nonempty complete inventory of ordinary native JSON files",
  );
  return entries.map((entry) => `${relative}/${entry.name}`).sort(compareText);
};

const removeCapture = async (directory) => {
  await finishCleanup(
    async () =>
      completedValues(
        (await readdir(directory)).map((filename) =>
          rm(path.join(directory, filename)),
        ),
      ),
    () => rmdir(directory),
    "Coverage file and directory cleanup failed",
  );
};
const removeOptionalCapture = async (directory) => {
  try {
    await lstat(directory);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return;
  }
  await removeCapture(directory);
};

const priorCapture = async (root, relative) => {
  try {
    await lstat(path.join(root, relative));
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  await completedValues(
    (await coverageFiles(root, relative)).map(async (filename) => {
      const data = await readJson(root, filename);
      insist(
        Array.isArray(data.result),
        "Only recognized sanitized coverage may be replaced",
      );
      const sources = data.result.map(({ url }) =>
        decodeURIComponent(url.slice(portableRoot.length)),
      );
      validateCoverageData(data, [...new Set(sources)]);
    }),
  );
  return true;
};

const writeCapture = async (filename, data) => {
  await using file = await open(filename, "wx", 0o600);
  await file.writeFile(JSON.stringify(data) + "\n", "utf8");
};
const swapCapture = async (target, next, previous, existed) => {
  if (existed) await rename(target, previous);
  try {
    await rename(next, target);
  } catch (error) {
    if (existed) {
      try {
        await rename(previous, target);
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          "Coverage publication and restoring its previous directory failed",
          { cause: restoreError },
        );
      }
    }
    throw error;
  }
};
const cleanupCaptureStage = async (stage, published, existed) => {
  const operations = [removeOptionalCapture(path.join(stage, "next"))];
  if (published && existed)
    operations.push(removeCapture(path.join(stage, "previous")));
  // A failed rollback retains its previous directory for recovery instead of deleting it.
  await finishCleanup(
    () => completedValues(operations),
    () => rmdir(stage),
    "Coverage staging cleanup failed",
  );
};
const publishCapture = async (root, relative, prepared) => {
  insist(
    rawDirectories.has(relative),
    "Normalized coverage must use a declared suite directory",
  );
  const target = path.join(root, relative);
  await ordinary(root, `${path.posix.dirname(relative)}/.probe`, true);
  const existed = await priorCapture(root, relative);
  const stage = await mkdtemp(path.join(path.dirname(target), ".normalized-"));
  const previous = path.join(stage, "previous");
  const next = path.join(stage, "next");
  let failure;
  let published = false;
  try {
    await mkdir(next);
    await completedValues(
      prepared
        .filter(({ data }) => data !== undefined)
        .map(({ filename, data }) =>
          writeCapture(path.join(next, path.basename(filename)), data),
        ),
    );
    await swapCapture(target, next, previous, existed);
    published = true;
  } catch (error) {
    failure = error;
  }

  try {
    await cleanupCaptureStage(stage, published, existed);
  } catch (error) {
    failure = failure
      ? new AggregateError(
          [failure, error],
          "Coverage publication and cleanup failed",
        )
      : error;
  }
  if (failure) throw failure;
};

export const prepareCoverage = async (
  root,
  rawDirectory,
  sourceFiles,
  outputDirectory = rawDirectory,
  { sourceMaps = false } = {},
) => {
  await pinnedRuntime(root);
  const sources = sourceNames(sourceFiles);
  const files = await coverageFiles(root, rawDirectory);
  const prepared = await completedValues(
    files.map(async (filename) => ({
      filename,
      data: await prepareData(
        await readJson(root, filename),
        root,
        sources,
        sourceMaps,
      ),
    })),
  );
  insist(
    prepared.some(({ data }) => data !== undefined),
    "Coverage capture contains no admitted measured production sources",
  );
  if (outputDirectory !== rawDirectory) {
    await publishCapture(root, outputDirectory, prepared);
    return prepared
      .filter(({ data }) => data !== undefined)
      .map(({ filename }) => `${outputDirectory}/${path.basename(filename)}`);
  }
  await completedValues(
    prepared.map(({ filename, data }) => {
      if (data === undefined) return rm(path.join(root, filename));
      return replaceReport(
        path.join(root, filename),
        JSON.stringify(data) + "\n",
      );
    }),
  );
  return prepared
    .filter(({ data }) => data !== undefined)
    .map(({ filename }) => filename);
};

const coverageRecords = (content) => {
  const records = new Map();
  let lines = [];
  for (const line of content.replaceAll("\r\n", "\n").split("\n")) {
    if (!line && !lines.length) continue;
    lines.push(line);
    if (line !== "end_of_record") continue;
    const sources = lines.filter((entry) => entry.startsWith("SF:"));
    const source = sources[0]?.slice(3).replaceAll("\\", "/");
    if (
      sources.length !== 1 ||
      !source ||
      /[:\0\r\n]/.test(source) ||
      source
        .split("/")
        .some((part) => !part || part === "." || part === "..") ||
      !lines.some((entry) => /^DA:[1-9]\d*,\d+(?:,[^,\s]+)?$/.test(entry)) ||
      records.has(source)
    )
      throw new Error(
        "Coverage reports require unique safe measured source records",
      );
    records.set(
      source,
      lines
        .map((entry) => (entry.startsWith("SF:") ? `SF:${source}` : entry))
        .join("\n") + "\n",
    );
    lines = [];
  }
  if (lines.some((line) => line.trim()) || !records.size)
    throw new Error("Coverage reports must contain complete measured records");
  return records;
};

export const mergeCoverageReports = (nodeReport, auditReport) => {
  const records =
    nodeReport === undefined ? new Map() : coverageRecords(nodeReport);
  // A repeated focused audit replaces its previous measured records, while the
  // Node suite's independent source records remain unchanged.
  for (const [source, record] of coverageRecords(auditReport))
    records.set(source, record);
  return [...records.values()].join("");
};

const replaceReport = async (output, content) => {
  const directory = await mkdtemp(path.join(path.dirname(output), ".lcov-"));
  const temporary = path.join(directory, "lcov.info");
  let failure;
  try {
    {
      await using file = await open(temporary, "wx", 0o600);
      await file.writeFile(content, "utf8");
    }
    await rename(temporary, output);
  } catch (error) {
    failure = error;
  }

  try {
    await rm(temporary, { force: true });
    await rmdir(directory);
  } catch (error) {
    failure = failure
      ? new AggregateError(
          [failure, error],
          "coverage publication and cleanup both failed",
        )
      : error;
  }
  if (failure) throw failure;
};

export const mergeCoverage = async (root = repository) => {
  const output = path.join(root, "coverage/lcov.info");
  let nodeReport;
  try {
    nodeReport = await readFile(output, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const auditReport = await readFile(
    path.join(root, "coverage/audit/lcov.info"),
    "utf8",
  );
  const combined = mergeCoverageReports(nodeReport, auditReport);
  await replaceReport(output, combined);
};

const nativeData = (data, root, files) => {
  const actual = structuredClone(data);
  const rebase = (url) =>
    pathToFileURL(path.join(root, portableSource(url, files))).href;
  actual.result.forEach((script) => {
    script.url = rebase(script.url);
  });
  if (actual["source-map-cache"] !== undefined) {
    actual["source-map-cache"] = Object.fromEntries(
      Object.entries(actual["source-map-cache"]).map(([url, mapping]) => {
        mapping.data.sources = mapping.data.sources.map(rebase);
        return [rebase(url), mapping];
      }),
    );
  }
  return actual;
};

const loadCaptures = async (root, relative, sourceFiles) => {
  const files = sourceNames(sourceFiles);
  const captures = await coverageFiles(root, relative);
  return completedValues(
    captures.map(async (filename) => {
      const data = validateCoverageData(
        await readJson(root, filename),
        sourceFiles,
      );
      await completedValues(
        data.result.map((script) =>
          ordinary(root, portableSource(script.url, files)),
        ),
      );
      await completedValues(
        Object.entries(data["source-map-cache"] ?? {}).map(
          async ([url, mapping]) => {
            const source = await readFile(
              await ordinary(root, portableSource(url, files)),
              "utf8",
            );
            insist(
              isDeepStrictEqual(mapping.data.sourcesContent, [source]),
              "Coverage source map differs from current admitted source bytes",
            );
          },
        ),
      );
      return data;
    }),
  );
};

const consistentCaptures = (captures) => {
  const maps = new Map();
  for (const data of captures) {
    insist(
      data.sourceMaps === captures[0].sourceMaps,
      "Coverage captures must use the same source map mode",
    );
    for (const [url, mapping] of Object.entries(
      data["source-map-cache"] ?? {},
    )) {
      insist(
        !maps.has(url) || isDeepStrictEqual(maps.get(url), mapping),
        "Conflicting coverage source maps",
      );
      maps.set(url, mapping);
    }
  }
};

const stageCaptures = async (directory, captures, root, sources) => {
  await mkdir(directory);
  const files = sourceNames(sources);
  await completedValues(
    captures.map((data, index) =>
      writeCapture(
        path.join(
          directory,
          `coverage-0-${String(index).padStart(13, "0")}-0.json`,
        ),
        nativeData(data, root, files),
      ),
    ),
  );
};

const validateSummary = (summary, root, files) => {
  insist(
    isRecord(summary) &&
      summary.workingDirectory === root &&
      Array.isArray(summary.files) &&
      summary.files.length > 0 &&
      isRecord(summary.totals),
    "Pinned Node coverage summary API changed or returned no production coverage",
  );
  for (const file of summary.files) {
    insist(
      files.has(path.relative(root, file.path).split(path.sep).join("/")) &&
        [
          "totalLineCount",
          "totalBranchCount",
          "totalFunctionCount",
          "coveredLineCount",
          "coveredBranchCount",
          "coveredFunctionCount",
        ].every((key) => integer(file[key])) &&
        ["functions", "branches", "lines"].every((key) =>
          Array.isArray(file[key]),
        ),
      "Invalid native measured file coverage",
    );
  }
  for (const kind of ["Line", "Branch", "Function"]) {
    const total = summary.totals[`total${kind}Count`];
    const covered = summary.totals[`covered${kind}Count`];
    const percent = summary.totals[`covered${kind}Percent`];
    insist(
      integer(total) &&
        integer(covered) &&
        covered <= total &&
        percent === (total === 0 ? 100 : (covered / total) * 100),
      "Invalid native coverage summary counters",
    );
  }
  return summary;
};

const coverageWorker = async () => {
  await pinnedRuntime(process.cwd());
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const options = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const { TestCoverage } = createRequire(import.meta.url)(
    "internal/test_runner/coverage",
  );
  insist(
    typeof TestCoverage === "function" &&
      typeof TestCoverage.prototype.summary === "function" &&
      typeof TestCoverage.prototype.getCoverageFromDirectory === "function",
    "Pinned Node coverage aggregation API is unavailable",
  );
  const summarize = ({ directory, sources }) => {
    const files = sourceNames(sources);
    const summary = new TestCoverage(directory, undefined, {
      cwd: process.cwd(),
      coverageIncludeGlobs: sources,
      sourceMaps: options.sourceMaps,
      lineCoverage: 80,
      branchCoverage: 80,
      functionCoverage: 80,
    }).summary();
    return validateSummary(summary, process.cwd(), files);
  };
  process.stdout.write(
    JSON.stringify({
      source: summarize(options.source),
      audit: summarize(options.audit),
    }),
  );
};

const runNativeSummary = (root, stage, sources, sourceMaps) => {
  const result = spawnSync(
    process.execPath,
    ["--expose-internals", fileURLToPath(import.meta.url), "--worker"],
    {
      cwd: root,
      input: JSON.stringify({
        source: { directory: path.join(stage, "source"), sources },
        audit: {
          directory: path.join(stage, "audit"),
          sources: ["scripts/run-audit.mjs"],
        },
        sourceMaps,
      }),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      env: {
        SystemRoot: process.env.SystemRoot,
        TEMP: stage,
        TMP: stage,
        GIT_CEILING_DIRECTORIES: stage,
      },
    },
  );
  insist(
    result.status === 0 && !result.error,
    `Native coverage aggregation failed: ${result.error?.message ?? result.stderr}`,
  );
  const summaries = JSON.parse(result.stdout);
  validateSummary(summaries.source, root, sourceNames(sources));
  validateSummary(summaries.audit, root, new Set(["scripts/run-audit.mjs"]));
  return summaries;
};

const enforceThresholds = (summary, label) => {
  for (const kind of ["Line", "Branch", "Function"])
    insist(
      summary.totals[`covered${kind}Percent`] >= 80,
      `${label} ${kind.toLowerCase()} coverage must be at least 80% (received ${summary.totals[`covered${kind}Percent`]}%)`,
    );
};

const nativeLcov = async (summary) => {
  const reporter = new lcov();
  reporter.end({ type: "test:coverage", data: { summary } });
  let content = "";
  for await (const chunk of reporter) content += chunk;
  return content;
};

export const aggregateCoverage = async (root = repository, sourceFiles) => {
  root = path.resolve(root);
  await pinnedRuntime(root);
  sourceNames(sourceFiles);
  const captures = (
    await completedValues(
      suites.map((suite) =>
        loadCaptures(root, `coverage/${suite}/v8`, sourceFiles),
      ),
    )
  ).flat();
  const audit = await loadCaptures(root, "coverage/governance/audit-v8", [
    "scripts/run-audit.mjs",
  ]);
  consistentCaptures([...captures, ...audit]);
  await ordinary(root, "coverage/lcov.info", true);
  const stage = await mkdtemp(path.join(root, "coverage/.aggregate-"));
  let failure;
  let summaries;
  try {
    await stageCaptures(
      path.join(stage, "source"),
      captures,
      root,
      sourceFiles,
    );
    await stageCaptures(path.join(stage, "audit"), audit, root, [
      "scripts/run-audit.mjs",
    ]);
    summaries = runNativeSummary(
      root,
      stage,
      sourceFiles,
      captures[0].sourceMaps,
    );
    enforceThresholds(summaries.source, "Published non-audit source");
    enforceThresholds(summaries.audit, "Audit helper");
    const report = mergeCoverageReports(
      await nativeLcov(summaries.source),
      await nativeLcov(summaries.audit),
    );
    await replaceReport(path.join(root, "coverage/lcov.info"), report);
  } catch (error) {
    failure = error;
  }

  try {
    await finishCleanup(
      () =>
        completedValues(
          ["source", "audit"].map((name) =>
            removeOptionalCapture(path.join(stage, name)),
          ),
        ),
      () => rmdir(stage),
      "Coverage aggregation staging cleanup failed",
    );
  } catch (error) {
    failure = failure
      ? new AggregateError(
          [failure, error],
          "Coverage aggregation and cleanup failed",
        )
      : error;
  }
  if (failure) throw failure;
  return summaries;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode === "--worker") await coverageWorker();
  else if (mode === "--aggregate") {
    const policy = await readJson(repository, ".github/bootstrap-policy.json");
    await aggregateCoverage(
      repository,
      coverageSourceFiles(policy.allowedFiles),
    );
  } else {
    insist(mode === undefined, "Usage: merge-coverage.mjs [--aggregate]");
    await mergeCoverage();
  }
}
