import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { parse } from "yaml";

import {
  parseConfiguredHostname,
  parseTarget,
  validateDastTarget,
} from "./validate-workflow-targets.mjs";

describe("workflow target validation", () => {
  it("normalizes canonical hostnames", () => {
    assert.equal(parseConfiguredHostname("HOST", "EXAMPLE.COM"), "example.com");
  });

  for (const host of [
    " example.com",
    "example.com:443",
    "http://example.com",
    "-bad.example",
  ])
    it(`rejects invalid configured hostname ${host}`, () => {
      assert.throws(() => parseConfiguredHostname("HOST", host));
    });

  for (const url of ["http://user:pass@example.com"])
    it(`rejects unsafe target ${url}`, () => {
      assert.throws(() => parseTarget("TARGET", url));
    });

  it("allows authorized staging DAST and blocks production", () => {
    const env = {
      DAST_ALLOWED_HOST: "api.staging.example.com",
      DAST_PRODUCTION_HOST: "example.com",
      DAST_TARGET: "https://api.staging.example.com",
    };
    assert.doesNotThrow(() => validateDastTarget(env));
    assert.throws(
      () =>
        validateDastTarget({
          ...env,
          DAST_ALLOWED_HOST: "example.com",
          DAST_TARGET: "https://example.com",
        }),
      /must not target the production host/,
    );
  });

  for (const url of [
    "http://api.staging.example.com",
    "ftp://api.staging.example.com",
    "https://user:password@api.staging.example.com",
    "https://api.staging.example.com/path",
    "https://api.staging.example.com/?query=1",
    "https://api.staging.example.com/?",
    "https://api.staging.example.com/#fragment",
    "https://api.staging.example.com/#",
    "https://other.example.com",
  ])
    it(`rejects an unauthorized DAST target ${url} before network access`, () => {
      assert.throws(() =>
        validateDastTarget({
          DAST_ALLOWED_HOST: "api.staging.example.com",
          DAST_PRODUCTION_HOST: "api.production.example.com",
          DAST_TARGET: url,
        }),
      );
    });

  it("rejects production even with a different hostname casing", () => {
    assert.throws(
      () =>
        validateDastTarget({
          DAST_ALLOWED_HOST: "API.EXAMPLE.COM",
          DAST_PRODUCTION_HOST: "api.example.com",
          DAST_TARGET: "https://api.example.com",
        }),
      /must not target the production host/,
    );
  });

  it("requires the protected staging environment before the DAST scan", () => {
    const workflow = parse(
      readFileSync(
        new URL("../.github/workflows/dast.yml", import.meta.url),
        "utf8",
      ),
    );
    assert.notEqual(workflow.on.workflow_dispatch, undefined);
    const job = workflow.jobs.zap;
    assert.equal(job.environment, "staging");
    assert.equal(job.if, undefined);
    assert.ok(job.env.DAST_ALLOWED_HOST.includes("STAGING_ALLOWED_API_HOST"));
    assert.ok(job.env.DAST_PRODUCTION_HOST.includes("PRODUCTION_HOST"));
    const validator = job.steps.findIndex(
      (step) => step.run === "node scripts/validate-workflow-targets.mjs dast",
    );
    const scanner = job.steps.findIndex((step) =>
      step.uses?.startsWith("zaproxy/action-full-scan@"),
    );
    assert.ok(validator >= 0);
    assert.ok(scanner > validator);
    assert.equal(job.steps[validator].if, undefined);
  });
});
