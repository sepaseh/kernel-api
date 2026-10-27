import { eq } from "drizzle-orm";

import type { FileRepository } from "../../application/ports/files.ts";
import type { Database } from "../db/client.ts";
import { files } from "../db/schema.ts";

export const createDrizzleFileRepository = (
  database: Database,
): FileRepository => ({
  findById: (id) => database.query.files.findFirst({ where: eq(files.id, id) }),
  insert: async (record) => {
    await database.insert(files).values(record);
  },
});
