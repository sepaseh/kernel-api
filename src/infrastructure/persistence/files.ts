import { DrizzleQueryError, eq } from "drizzle-orm";

import type { FileRepository } from "../../application/ports/files.ts";
import { FileInsertNotCommittedError } from "../../application/ports/files.ts";
import type { Database } from "../db/client.ts";
import { files } from "../db/schema.ts";

export const createDrizzleFileRepository = (
  database: Database,
): FileRepository => ({
  findById: (id) => database.query.files.findFirst({ where: eq(files.id, id) }),
  insert: async (record) => {
    try {
      await database.insert(files).values(record);
    } catch (error) {
      const cause =
        error instanceof DrizzleQueryError ? error.cause : undefined;
      // An actual SQLite foreign-key violation aborts this statement. Other
      // errors may leave a row referencing the object, including duplicate keys.
      if (
        cause instanceof Error &&
        cause.name === "LibsqlError" &&
        "extendedCode" in cause &&
        cause.extendedCode === "SQLITE_CONSTRAINT_FOREIGNKEY"
      )
        throw new FileInsertNotCommittedError(error);
      throw error;
    }
  },
});
