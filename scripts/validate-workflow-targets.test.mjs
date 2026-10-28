import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  parseConfiguredHostname,
  parseTarget,
  validateDastTarget,
} from "./validate-workflow-targets.mjs";

describe("workflow target validation", () => {
  it("normalizes canonical hostnames", () => {
    expect(parseConfiguredHostname("HOST", "EXAMPLE.COM")).toBe("example.com");
  });

  it.each([
    " example.com",
    "example.com:443",
    "http://example.com",
    "-bad.example",
  ])("rejects invalid configured hostname %s", (host) =>
    expect(() => parseConfiguredHostname("HOST", host)).toThrow(),
  );

  it.each(["http://user:pass@example.com"])("rejects unsafe target %s", (url) =>
    expect(() => parseTarget("TARGET", url)).toThrow(),
  );

  it("allows authorized staging DAST and blocks production", () => {
    const env = {
      DAST_ALLOWED_HOST: "api.staging.example.com",
      DAST_PRODUCTION_HOST: "example.com",
      DAST_TARGET: "https://api.staging.example.com",
    };
    expect(() => validateDastTarget(env)).not.toThrow();
    expect(() =>
      validateDastTarget({
        ...env,
        DAST_ALLOWED_HOST: "example.com",
        DAST_TARGET: "https://example.com",
      }),
    ).toThrow("must not target the production host");
  });

  it.each([
    "http://api.staging.example.com",
    "ftp://api.staging.example.com",
    "https://user:password@api.staging.example.com",
    "https://api.staging.example.com/path",
    "https://api.staging.example.com/?query=1",
    "https://api.staging.example.com/?",
    "https://api.staging.example.com/#fragment",
    "https://api.staging.example.com/#",
    "https://other.example.com",
  ])("rejects an unauthorized DAST target %s before network access", (url) => {
    expect(() =>
      validateDastTarget({
        DAST_ALLOWED_HOST: "api.staging.example.com",
        DAST_PRODUCTION_HOST: "api.production.example.com",
        DAST_TARGET: url,
      }),
    ).toThrow();
  });

  it("rejects production even with a different hostname casing", () => {
    expect(() =>
      validateDastTarget({
        DAST_ALLOWED_HOST: "API.EXAMPLE.COM",
        DAST_PRODUCTION_HOST: "api.example.com",
        DAST_TARGET: "https://api.example.com",
      }),
    ).toThrow("must not target the production host");
  });

  it("requires the protected staging environment before the DAST scan", () => {
    const workflow = parse(
      readFileSync(
        new URL("../.github/workflows/dast.yml", import.meta.url),
        "utf8",
      ),
    );
    expect(workflow.on.workflow_dispatch).toBeDefined();
    const job = workflow.jobs.zap;
    expect(job.environment).toBe("staging");
    expect(job.if).toBeUndefined();
    expect(job.env.DAST_ALLOWED_HOST).toContain("STAGING_ALLOWED_API_HOST");
    expect(job.env.DAST_PRODUCTION_HOST).toContain("PRODUCTION_HOST");
    const validator = job.steps.findIndex(
      (step) => step.run === "node scripts/validate-workflow-targets.mjs dast",
    );
    const scanner = job.steps.findIndex((step) =>
      step.uses?.startsWith("zaproxy/action-full-scan@"),
    );
    expect(validator).toBeGreaterThanOrEqual(0);
    expect(scanner).toBeGreaterThan(validator);
    expect(job.steps[validator].if).toBeUndefined();
  });
});
