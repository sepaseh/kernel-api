import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { publicValues, validApi } from "./deployment.test-support.mjs";
import { renderDeploymentTemplate } from "./render-deployment.mjs";

test("configuration rendering preserves nginx variables and only exposes approved fields", () => {
  assert.equal(
    renderDeploymentTemplate(
      "server_name ${API_HOST}; proxy_set_header Host $host; try_files $uri $uri/ /index.html;",
      publicValues,
    ),
    "server_name api.kernel.test; proxy_set_header Host $host; try_files $uri $uri/ /index.html;",
  );
  for (const [name, value] of [
    ["API_HOST", "kernel.test; return 200;"],
    ["API_HOST", "api.kernel.test\n"],
    ["API_HOST", "https://admin.kernel.test"],
    ["TLS_CERTIFICATE", "/etc/kernel/../private.key"],
    ["RELEASE_ID", "../release"],
    ["RELEASE_ID", "replace-release-id"],
    ["RELEASE_ID", "replace-with-immutable-release-id"],
    ["HTTPS_PORT", "0"],
  ]) {
    assert.throws(() =>
      renderDeploymentTemplate(`\${${name}}`, {
        ...publicValues,
        [name]: value,
      }),
    );
  }
  assert.throws(() =>
    renderDeploymentTemplate("${BETTER_AUTH_SECRET}", {
      BETTER_AUTH_SECRET: validApi.BETTER_AUTH_SECRET,
    }),
  );
  assert.throws(() => renderDeploymentTemplate("${API_HOST}", {}));
});

test("renderer CLI uses fixed templates and does not expose unrelated input", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "kernel-render-fixture-"),
  );
  try {
    const template = path.join(directory, "nginx.template");
    const env = path.join(directory, "public.env");
    const output = path.join(directory, "nginx.conf");
    const secret = "synthetic-secret-never-render";
    await writeFile(template, "${SECRET}");
    await writeFile(env, `SECRET=${secret}\n`);
    await writeFile(output, "unchanged");
    const command = fileURLToPath(
      new URL("./render-deployment.mjs", import.meta.url),
    );
    const input = `API_HOST=kernel.test\nSECRET=${secret}\n`;
    const result = spawnSync(
      process.execPath,
      [command, "--template", "bootstrap"],
      { input, encoding: "utf8" },
    );
    assert.equal(result.status, 0);
    assert.match(result.stdout, /server_name kernel\.test;/);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /synthetic-secret-never-render/,
    );
    const kernel = spawnSync(
      process.execPath,
      [command, "--template", "kernel"],
      {
        input: `${input}TLS_CERTIFICATE=/etc/kernel-api/fullchain.pem\nTLS_CERTIFICATE_KEY=/etc/kernel-api/private.key\nRELEASE_ID=release-1\n`,
        encoding: "utf8",
      },
    );
    assert.equal(kernel.status, 0);
    assert.match(kernel.stdout, /server_name kernel\.test;/);
    assert.doesNotMatch(
      kernel.stdout + kernel.stderr,
      /synthetic-secret-never-render/,
    );
    const tooLarge = spawnSync(
      process.execPath,
      [command, "--template", "bootstrap"],
      {
        input: `API_HOST=kernel.test\nSECRET=${"x".repeat(65537)}\n`,
        encoding: "utf8",
      },
    );
    assert.notEqual(tooLarge.status, 0);
    assert.equal(tooLarge.stdout, "");
    for (const args of [
      ["--template", template],
      ["--template", "bootstrap", "--env-file", env, "--output", output],
      ["--template", "bootstrap", "--force"],
    ]) {
      const rejected = spawnSync(process.execPath, [command, ...args], {
        input,
        encoding: "utf8",
      });
      assert.notEqual(rejected.status, 0);
      assert.equal(rejected.stdout, "");
      assert.doesNotMatch(rejected.stderr, /synthetic-secret-never-render/);
    }
    assert.equal(await readFile(output, "utf8"), "unchanged");
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("kernel-render-fixture-"));
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
