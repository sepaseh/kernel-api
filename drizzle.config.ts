import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "drizzle-kit";

import { resolveDatabaseUrl } from "./src/infrastructure/config.ts";

const apiDirectory = fileURLToPath(new URL("./", import.meta.url));
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  ...(databaseUrl
    ? { dbCredentials: { url: resolveDatabaseUrl(databaseUrl) } }
    : {}),
  dialect: "sqlite",
  out: path.join(apiDirectory, "drizzle").replaceAll("\\", "/"),
  schema: path
    .join(apiDirectory, "src", "infrastructure", "db", "schema.ts")
    .replaceAll("\\", "/"),
});
