import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "drizzle-kit";

import { resolveDatabaseUrl } from "./src/infrastructure/config.ts";

const apiDirectory = fileURLToPath(new URL("./", import.meta.url));
const databaseUrl = process.env.DATABASE_URL;
// Drizzle Kit 0.31 prepends "./" when reading snapshot paths.
const outputPath =
  path.relative(process.cwd(), path.join(apiDirectory, "drizzle")) || ".";
if (path.isAbsolute(outputPath)) {
  throw new Error(
    "Run Drizzle Kit from the same filesystem drive as this API checkout.",
  );
}

const schemaPath = path.join(
  apiDirectory,
  "src",
  "infrastructure",
  "db",
  "schema.ts",
);
// Drizzle Kit interprets this literal filesystem path as a glob.
const schemaGlob = (
  path.sep === "\\" ? schemaPath.replaceAll("\\", "/") : schemaPath
).replace(/[?*()[\]{}!+@\\]/g, "\\$&");

export default defineConfig({
  ...(databaseUrl
    ? { dbCredentials: { url: resolveDatabaseUrl(databaseUrl) } }
    : {}),
  dialect: "sqlite",
  out: outputPath.replaceAll("\\", "/"),
  schema: schemaGlob,
});
