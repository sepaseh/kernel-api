import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));

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
  const records = nodeReport ? coverageRecords(nodeReport) : new Map();
  // A repeated focused audit replaces its previous measured records, while the
  // Node suite's independent source records remain unchanged.
  for (const [source, record] of coverageRecords(auditReport))
    records.set(source, record);
  return [...records.values()].join("");
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
  await writeFile(output, combined, "utf8");
};

if (process.argv[1] === fileURLToPath(import.meta.url)) await mergeCoverage();
