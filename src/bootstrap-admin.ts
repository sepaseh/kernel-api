import {
  createInitialAdmin,
  parseInitialAdminInput,
} from "./infrastructure/admin/bootstrap.ts";
import { createAuth } from "./infrastructure/auth/better-auth.ts";
import { loadConfig } from "./infrastructure/config.ts";
import { createDatabase } from "./infrastructure/db/client.ts";
import { initializeDatabase } from "./infrastructure/db/initialize.ts";
import { createLogger } from "./infrastructure/logging/logger.ts";

const readInput = async () => {
  if (process.argv.length !== 2 || process.stdin.isTTY)
    throw new Error("JSON input is required on standard input.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 64 * 1024)
      throw new Error("Initial administrator input is too large.");
    chunks.push(bytes);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  return parseInitialAdminInput(parsed);
};

try {
  // Parse before connecting or migrating. Do not load any developer env files;
  // the operator supplies the deployment's environment explicitly.
  const input = await readInput();
  const config = { ...loadConfig(), seedDevelopmentData: false };
  const { client, database } = createDatabase(config);
  try {
    // SDK diagnostics are intentionally silent in this credential-bearing CLI.
    const logger = createLogger(config.logging, { write() {} });
    const auth = createAuth(config, database, logger);
    await initializeDatabase(config, database, auth);
    await createInitialAdmin(database, auth, input);
  } finally {
    client.close();
  }
  process.stdout.write("Initial administrator created.\n");
} catch {
  process.stderr.write(
    "Initial administrator was not created. Check the input, configuration and that the database has no users.\n",
  );
  process.exitCode = 1;
}
