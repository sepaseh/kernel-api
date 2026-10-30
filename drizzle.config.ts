import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "drizzle-kit";

import { resolveDatabaseUrl } from "./src/infrastructure/config.ts";

const apiDirectory = fileURLToPath(new URL("./", import.meta.url));
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error("DATABASE_URL is required for Drizzle commands.");

export default defineConfig({
  dbCredentials: {
    url: resolveDatabaseUrl(databaseUrl),
  },
  dialect: "sqlite",
  out: path.join(apiDirectory, "drizzle"),
  schema: path.join(apiDirectory, "src", "infrastructure", "db", "schema.ts"),
});
