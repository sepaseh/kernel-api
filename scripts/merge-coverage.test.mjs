import assert from "node:assert/strict";
import {
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

import { mergeCoverage, mergeCoverageReports } from "./merge-coverage.mjs";

const measured = (source, hits) =>
  `TN:\nSF:${source}\nDA:1,${hits}\nLF:1\nLH:${hits ? 1 : 0}\nend_of_record\n`;

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
  ])
    assert.throws(() => mergeCoverageReports(undefined, invalid));
});

test("the real merge operation retains Node bytes and leaves them intact on failure", async (context) => {
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
  await mkdir(path.join(root, "coverage/audit"), { recursive: true });
  const output = path.join(root, "coverage/lcov.info");
  const auditOutput = path.join(root, "coverage/audit/lcov.info");
  const node = measured("src/application/identity.ts", 3);
  const audit = measured("scripts/run-audit.mjs", 4);
  await writeFile(output, node);
  await writeFile(auditOutput, audit);

  await mergeCoverage(root);
  assert.equal(await readFile(output, "utf8"), node + audit);
  await writeFile(auditOutput, "incomplete");
  await assert.rejects(mergeCoverage(root));
  assert.equal(await readFile(output, "utf8"), node + audit);
  await rm(output);
  await writeFile(auditOutput, audit);
  await mergeCoverage(root);
  assert.equal(await readFile(output, "utf8"), audit);
});
