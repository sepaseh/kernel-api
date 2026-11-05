import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function fixture(context) {
  const temporary = await mkdtemp(path.join(tmpdir(), "kernel-api-package-"));
  context.after(async () => {
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()));
    assert.ok(path.basename(temporary).startsWith("kernel-api-package-"));
    await rm(temporary, { recursive: true, force: true });
  });
  const repository = path.join(temporary, "repository");
  const put = async (file, content = "synthetic source") => {
    const target = path.join(repository, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  };
  await put("package.json", JSON.stringify({ name: "kernel-api" }));
  await put(
    "package-lock.json",
    JSON.stringify({
      lockfileVersion: 3,
      packages: { "": { name: "kernel-api" } },
    }),
  );
  for (const file of [
    "src/index.ts",
    "src/bootstrap-admin.ts",
    "drizzle/0000_init.sql",
    "drizzle/meta/_journal.json",
    "src/contracts/account.ts",
    "src/contracts/permissions.ts",
    "src/contracts/settings.ts",
    "src/contracts/locales.ts",
    "src/infrastructure/localization/catalogs/index.ts",
    "scripts/healthcheck.mjs",
    "scripts/validate-deployment-env.mjs",
  ])
    await put(file);
  return { temporary, repository, put };
}
