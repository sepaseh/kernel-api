import {
  desc,
  DrizzleQueryError,
  eq,
  getTableColumns,
  or,
  sql,
} from "drizzle-orm";

import { ApplicationError } from "../../application/errors.ts";
import type { FileRepository } from "../../application/ports/files.ts";
import { FileInsertNotCommittedError } from "../../application/ports/files.ts";
import type { Database } from "../db/client.ts";
import {
  contents,
  files,
  pendingFileDeletions,
  settings,
} from "../db/schema.ts";
import { isForeignKeyConstraintError } from "./errors.ts";

const fileUsage = (id: string | typeof files.id) =>
  sql<boolean>`
  exists (select 1 from ${settings} where ${or(eq(settings.darkLogoId, id), eq(settings.lightLogoId, id))})
  or exists (select 1 from ${contents} where ${eq(contents.coverImageId, id)})
`.mapWith(Boolean);

export const createDrizzleFileRepository = (
  database: Database,
): FileRepository => ({
  async beginDeletion(id) {
    try {
      return await database.transaction(async (transaction) => {
        const [usage] = await transaction
          .select({ used: fileUsage(files.id) })
          .from(files)
          .where(eq(files.id, id));
        if (usage?.used) throw new ApplicationError("conflict", "fileInUse");

        const [removed] = await transaction
          .delete(files)
          .where(eq(files.id, id))
          .returning({
            bucket: files.bucket,
            id: files.id,
            objectKey: files.objectKey,
          });
        if (!removed)
          return transaction.query.pendingFileDeletions.findFirst({
            where: eq(pendingFileDeletions.id, id),
          });

        await transaction.insert(pendingFileDeletions).values(removed);
        return removed;
      });
    } catch (error) {
      if (isForeignKeyConstraintError(error))
        throw new ApplicationError("conflict", "fileInUse");
      throw error;
    }
  },
  async finishDeletion(id) {
    await database
      .delete(pendingFileDeletions)
      .where(eq(pendingFileDeletions.id, id));
  },
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
  list: () =>
    database
      .select({ ...getTableColumns(files), isUsed: fileUsage(files.id) })
      .from(files)
      .orderBy(desc(files.createdAt), files.id),
});
